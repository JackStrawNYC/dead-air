/**
 * Fractal Flames — Iterated Function System (IFS) with nonlinear variations.
 * 4 affine transforms with sinusoidal, swirl, horseshoe, and spherical variations.
 * Uses feedback mode (uPrevFrame) for temporal accumulation with log-density mapping.
 *
 * Visual aesthetic:
 *   - Quiet: sparse glowing tendrils, slow drift
 *   - Building: flames thicken, colors saturate, transforms accelerate
 *   - Peak: dense, blazing fractal patterns fill screen
 *   - Release: tendrils fade and stretch
 *
 * Audio reactivity:
 *   uBass            → affine transform rotation speed
 *   uEnergy          → point brightness and density
 *   uMelodicPitch    → affine scale factor
 *   uHarmonicTension → variation mix (linear→nonlinear)
 *   uChordIndex      → palette selection
 *   uBeatSnap        → color cycling acceleration
 *   uOnsetSnap       → burst of new points (brightness spike)
 *   uSlowEnergy      → global flame spread
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const fractalFlamesVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const fractalFlamesFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true, caEnabled: true, thermalShimmerEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define GOLDEN_RATIO 1.61803398875
#define NUM_ITERATIONS 20

// --- Nonlinear variations ---
vec2 variationSinusoidal(vec2 p) {
  return vec2(sin(p.x), sin(p.y));
}

vec2 variationSwirl(vec2 p) {
  float r2 = dot(p, p);
  float s = sin(r2);
  float c = cos(r2);
  return vec2(p.x * s - p.y * c, p.x * c + p.y * s);
}

vec2 variationHorseshoe(vec2 p) {
  float r = length(p) + 0.001;
  float invR = 1.0 / r;
  return invR * vec2((p.x - p.y) * (p.x + p.y), 2.0 * p.x * p.y);
}

vec2 variationSpherical(vec2 p) {
  float r2 = dot(p, p) + 0.001;
  return p / r2;
}

// --- Affine transform ---
vec2 affineTransform(vec2 p, float a, float b, float c, float d, float e, float f) {
  return vec2(a * p.x + b * p.y + e, c * p.x + d * p.y + f);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);

  // 7-band spectral: sub, low, low-mid, mid, upper-mid, presence, brilliance
  float fftBass = texture2D(uFFTTexture, vec2(0.07, 0.5)).r;
  float fftMid = texture2D(uFFTTexture, vec2(0.36, 0.5)).r;
  float fftHigh = texture2D(uFFTTexture, vec2(0.78, 0.5)).r;

  float jamDetail = 1.0 + uJamDensity * 0.5;
  float slowTime = uDynamicTime * 0.06;

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  // Jam: faster rotation, brighter points. Space: frozen attractor. Solo: dramatic brightness.
  float sectionRotMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.2, sSpace) * mix(1.0, 1.3, sSolo);
  float sectionBrightMod = mix(0.0, 0.2, sJam) + mix(0.0, -0.15, sSpace) + mix(0.0, 0.25, sSolo);

  // Audio-driven parameters (section-modulated)
  // FFT bands: bass → base height, mids → turbulence, highs → fine detail
  float rotSpeed = (0.3 + bass * 0.8 + fftMid * 0.2) * sectionRotMod;
  float pointBright = 0.3 + energy * 0.7 + sectionBrightMod + fftBass * 0.15;
  float affineScale = 0.5 + melodicPitch * 0.3 + fftHigh * 0.1;
  float variationMix = tension;
  float chordHue = float(int(uChordIndex)) / 24.0;
  float colorCycle = slowTime * 0.5 + beatSnap * 0.3;
  float chromaHueMod = uChromaHue * 0.15;

  // --- IFS iteration: trace the attractor at this pixel ---
  // Start from current pixel position, iterate through transforms
  vec2 pt = p * 2.0; // scale up for more coverage

  float density = 0.0;
  float colorAccum = 0.0;

  // 4 affine transform parameters (audio-driven rotation)
  float angle1 = slowTime * rotSpeed;
  float angle2 = slowTime * rotSpeed * 0.7 + 1.0;
  float angle3 = slowTime * rotSpeed * 1.3 + 2.5;
  float angle4 = slowTime * rotSpeed * 0.5 + 4.0;

  for (int i = 0; i < NUM_ITERATIONS; i++) {
    float fi = float(i);

    // Select transform using golden ratio for even distribution
    float selector = fract(fi * GOLDEN_RATIO + slowTime * 0.1);

    vec2 transformed;
    float colorIndex;

    if (selector < 0.25) {
      // Transform 1: rotation + scale
      float ca = cos(angle1); float sa = sin(angle1);
      transformed = affineTransform(pt, ca * affineScale, -sa * affineScale,
                                        sa * affineScale, ca * affineScale, 0.1, 0.0);
      // Apply variation based on tension
      transformed = mix(transformed, variationSinusoidal(transformed), variationMix * 0.6);
      colorIndex = 0.0;
    } else if (selector < 0.5) {
      // Transform 2: shear + translate
      float ca = cos(angle2); float sa = sin(angle2);
      transformed = affineTransform(pt, ca * 0.6, sa * 0.3,
                                        -sa * 0.2, ca * 0.7, -0.2, 0.15);
      transformed = mix(transformed, variationSwirl(transformed), variationMix * 0.5);
      colorIndex = 0.33;
    } else if (selector < 0.75) {
      // Transform 3: reflection + scale
      float ca = cos(angle3); float sa = sin(angle3);
      transformed = affineTransform(pt, -ca * 0.5, sa * affineScale,
                                         sa * 0.4, ca * 0.6, 0.15, -0.1);
      transformed = mix(transformed, variationHorseshoe(transformed), variationMix * 0.4);
      colorIndex = 0.67;
    } else {
      // Transform 4: spiral
      float ca = cos(angle4); float sa = sin(angle4);
      transformed = affineTransform(pt, ca * 0.4, -sa * 0.8,
                                        sa * 0.5, ca * 0.4, 0.0, 0.2);
      transformed = mix(transformed, variationSpherical(transformed), variationMix * 0.3);
      colorIndex = 1.0;
    }

    pt = transformed;

    // Accumulate density: Gaussian splat from iterated point to pixel
    float dist = length(pt - p * 2.0);
    float splatRadius = (0.08 + slowE * 0.05) * jamDetail;
    float contrib = exp(-dist * dist / (splatRadius * splatRadius));
    density += contrib;
    colorAccum += contrib * colorIndex;
  }

  // Log-density tone mapping (classic flame algorithm)
  float logDensity = log(1.0 + density * pointBright) * 0.4;
  logDensity = clamp(logDensity, 0.0, 1.5);

  // Normalize color accumulation
  float normalizedColor = density > 0.001 ? colorAccum / density : 0.0;

  // --- Color from palette + chord ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue * 0.3;
  float hue2 = uPaletteSecondary + chordHue * 0.15;
  float sat = mix(0.6, 1.0, energy) * uPaletteSaturation;

  // Multi-hue blend across transforms
  float hue = mix(hue1, hue2, normalizedColor) + colorCycle * 0.1;
  vec3 flameColor = hsv2rgb(vec3(hue, sat, logDensity));

  // --- Onset brightness burst ---
  flameColor += vec3(1.0, 0.95, 0.9) * onset * logDensity * 0.5;

  // --- Feedback: temporal accumulation ---
  vec3 prevColor = texture2D(uPrevFrame, uv).rgb;
  float decayRate = 0.97;
  // Jam phase feedback: exploration=long trails, building=moderate, peak=max persistence, resolution=clearing
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    decayRate += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    decayRate = clamp(decayRate, 0.80, 0.97);
  }
  vec3 col = max(flameColor, prevColor * decayRate);

  // --- Background: subtle noise field ---
  float bgNoise = fbm3(vec3(p * 3.0, slowTime * 0.3)) * 0.03;
  col = max(col, vec3(bgNoise * 0.5, bgNoise * 0.3, bgNoise * 0.6));

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col *= vignette;

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
