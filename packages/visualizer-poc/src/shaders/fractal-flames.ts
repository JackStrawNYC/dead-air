/**
 * Fractal Flames — raymarched 3D volumetric IFS attractors.
 * Not real fire — mathematical flame fractals rendered as volumetric density fields.
 * IFS (iterated function system) attractors computed per-sample along each ray,
 * creating the classic fractal flame aesthetic with real depth, parallax, and
 * volumetric self-emission.
 *
 * Technique: For each point along a ray, run IFS iterations to compute local
 * attractor density. Accumulate emission (no absorption model — pure additive
 * glow). Log-density tone mapping preserves the characteristic flame brightness
 * falloff. Multiple attractor "flames" can coexist in the volume.
 *
 * Visual aesthetic:
 *   - Quiet: single dim tendril, ghostly, barely-there luminous filament
 *   - Building: tendrils thicken and multiply, color saturates
 *   - Peak: dense blazing multi-flame attractor field, full volumetric glow
 *   - Release: flames stretch and dim, attractor slowly reforms
 *
 * Audio reactivity (14+ uniforms):
 *   uBass              → attractor scale (larger flames breathe with bass)
 *   uEnergy            → iteration count / brightness / step count
 *   uDrumOnset         → attractor parameter snap (sudden jump to new transform)
 *   uVocalPresence     → warm emission bias (amber/gold tones)
 *   uHarmonicTension   → attractor complexity (number of active transforms)
 *   uSectionType       → jam=morphing between attractor types, space=single dim flame,
 *                         chorus=vivid multi-flame, solo=dramatic high-contrast
 *   uClimaxPhase       → attractor explosion into particle shower, then reform
 *   uBeatSnap          → color cycling acceleration
 *   uSlowEnergy        → drift speed / global flame spread
 *   uMelodicPitch      → vertical flame reach
 *   uBeatStability     → transform coherence (unstable=jittery attractors)
 *   uTimbralBrightness → emission temperature (cool→hot)
 *   uTimbralFlux       → mutation rate of transform parameters
 *   uSpaceScore        → sparse contemplative mode
 *   uDynamicRange      → emission contrast
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const fractalFlamesVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: -0.08,
  bloomEnabled: true,
  caEnabled: true,
  halationEnabled: true,
  grainStrength: "light",
  dofEnabled: true,
  eraGradingEnabled: true,
  temporalBlendEnabled: false,
});

export const fractalFlamesFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define GOLDEN_RATIO 1.61803398875

// ─── IFS Nonlinear Variations ───
// Classic flame algorithm variations (Draves & Reckase)

vec2 ffVariationSinusoidal(vec2 p) {
  return vec2(sin(p.x), sin(p.y));
}

vec2 ffVariationSwirl(vec2 p) {
  float r2 = dot(p, p);
  float s = sin(r2);
  float c = cos(r2);
  return vec2(p.x * s - p.y * c, p.x * c + p.y * s);
}

vec2 ffVariationHorseshoe(vec2 p) {
  float r = length(p) + 0.001;
  float invR = 1.0 / r;
  return invR * vec2((p.x - p.y) * (p.x + p.y), 2.0 * p.x * p.y);
}

vec2 ffVariationSpherical(vec2 p) {
  float r2 = dot(p, p) + 0.001;
  return p / r2;
}

vec2 ffVariationDiamond(vec2 p) {
  float r = length(p) + 0.001;
  float theta = atan(p.y, p.x);
  return vec2(sin(theta) * cos(r), cos(theta) * sin(r));
}

vec2 ffVariationJulia(vec2 p, float seed) {
  float r = sqrt(length(p));
  float theta = atan(p.y, p.x) * 0.5;
  // Randomly add PI for the two-fold symmetry
  theta += step(0.5, fract(seed * 17.31)) * PI;
  return r * vec2(cos(theta), sin(theta));
}

// ─── IFS Affine Transform ───

vec2 ffAffine(vec2 p, float angle, float scl, vec2 translate) {
  float ca = cos(angle);
  float sa = sin(angle);
  return vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y) * scl + translate;
}

// ─── IFS Density Field ───
// Run IFS iterations starting from a 3D sample point (projected to 2D attractor plane
// at each depth slice), accumulate density via Gaussian splat from attractor orbit
// back to the query point.

float ffDensity(vec2 query, float time, float bassScale, float variationMix,
                float complexity, float drumSnap, float jitter, float mutationRate) {
  // Start point: seeded from query position (so each ray sample maps to attractor space)
  vec2 pt = query * (1.8 + bassScale * 0.6);

  float density = 0.0;
  float colorWeight = 0.0;

  // Transform angles (audio-driven rotation)
  float a1 = time * 0.4 + drumSnap * 1.5;
  float a2 = time * 0.28 + 1.0 + drumSnap * 0.8;
  float a3 = time * 0.52 + 2.5 + drumSnap * 1.2;
  float a4 = time * 0.35 + 4.0 + drumSnap * 0.5;

  // Mutation: timbral flux warps transform parameters over time
  float mut = sin(time * 0.3 * mutationRate) * 0.15 * mutationRate;

  // Jitter from beat instability
  float j1 = jitter * sin(time * 7.3) * 0.08;
  float j2 = jitter * cos(time * 5.7) * 0.08;

  // Number of active transforms scales with complexity
  float numActive = 2.0 + complexity * 2.0; // 2-4 transforms

  // IFS iteration count: 12-20 based on energy
  for (int i = 0; i < 20; i++) {
    float fi = float(i);

    // Golden ratio selector for even transform distribution
    float selector = fract(fi * GOLDEN_RATIO + time * 0.05);
    float transformIndex = selector * 4.0;

    vec2 transformed;

    if (transformIndex < 1.0 && numActive > 0.5) {
      // Transform 1: primary spiral
      float scl = 0.65 + bassScale * 0.15 + mut;
      transformed = ffAffine(pt, a1 + j1, scl, vec2(0.12, 0.0));
      transformed = mix(transformed, ffVariationSinusoidal(transformed), variationMix * 0.6);
    } else if (transformIndex < 2.0 && numActive > 1.5) {
      // Transform 2: swirling secondary
      float scl = 0.55 + mut * 0.8;
      transformed = ffAffine(pt, a2 + j2, scl, vec2(-0.18, 0.12));
      transformed = mix(transformed, ffVariationSwirl(transformed), variationMix * 0.5);
    } else if (transformIndex < 3.0 && numActive > 2.5) {
      // Transform 3: horseshoe folding
      float scl = 0.5 + bassScale * 0.1;
      transformed = ffAffine(pt, a3, scl, vec2(0.1, -0.15));
      transformed = mix(transformed, ffVariationHorseshoe(transformed), variationMix * 0.45);
    } else {
      // Transform 4: julia/diamond hybrid
      float scl = 0.45 + mut * 0.5;
      transformed = ffAffine(pt, a4 + j1, scl, vec2(-0.08, 0.08));
      vec2 julia = ffVariationJulia(transformed, fi + time * 0.1);
      vec2 diamond = ffVariationDiamond(transformed);
      transformed = mix(transformed, mix(julia, diamond, 0.5), variationMix * 0.4);
    }

    pt = transformed;

    // Gaussian splat: density contribution from attractor orbit to query point
    float dist = length(pt - query * 1.8);
    float splatRadius = 0.1 + bassScale * 0.04;
    float contrib = exp(-dist * dist / (splatRadius * splatRadius));
    density += contrib;
    colorWeight += contrib * (transformIndex / 4.0);
  }

  return density;
}

// ─── IFS Color Index ───
// Separate pass to get the color channel weight (which transforms contributed most)
float ffColorIndex(vec2 query, float time, float bassScale, float variationMix,
                   float drumSnap, float mutationRate) {
  vec2 pt = query * (1.8 + bassScale * 0.6);
  float colorAccum = 0.0;
  float totalWeight = 0.0;

  float a1 = time * 0.4 + drumSnap * 1.5;
  float a2 = time * 0.28 + 1.0 + drumSnap * 0.8;
  float a3 = time * 0.52 + 2.5 + drumSnap * 1.2;
  float a4 = time * 0.35 + 4.0 + drumSnap * 0.5;
  float mut = sin(time * 0.3 * mutationRate) * 0.15 * mutationRate;

  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float selector = fract(fi * GOLDEN_RATIO + time * 0.05);
    float tIdx = selector * 4.0;
    vec2 transformed;

    if (tIdx < 1.0) {
      transformed = ffAffine(pt, a1, 0.65 + bassScale * 0.15 + mut, vec2(0.12, 0.0));
      transformed = mix(transformed, ffVariationSinusoidal(transformed), variationMix * 0.6);
    } else if (tIdx < 2.0) {
      transformed = ffAffine(pt, a2, 0.55 + mut * 0.8, vec2(-0.18, 0.12));
      transformed = mix(transformed, ffVariationSwirl(transformed), variationMix * 0.5);
    } else if (tIdx < 3.0) {
      transformed = ffAffine(pt, a3, 0.5 + bassScale * 0.1, vec2(0.1, -0.15));
      transformed = mix(transformed, ffVariationHorseshoe(transformed), variationMix * 0.45);
    } else {
      transformed = ffAffine(pt, a4, 0.45 + mut * 0.5, vec2(-0.08, 0.08));
      transformed = mix(transformed, ffVariationDiamond(transformed), variationMix * 0.4);
    }
    pt = transformed;

    float dist = length(pt - query * 1.8);
    float w = exp(-dist * dist / 0.012);
    colorAccum += w * (tIdx / 4.0);
    totalWeight += w;
  }

  return totalWeight > 0.001 ? colorAccum / totalWeight : 0.0;
}

// ─── Volumetric Flame Emission ───
// Computes the emission color for a given density + color index + audio state
vec3 ffFlame(float density, float colorIdx, float hue1, float hue2, float sat,
             float vocalWarmth, float timbralTemp, float dynamicContrast) {
  // Log-density tone mapping (classic flame algorithm)
  float logD = log(1.0 + density * 3.0) * 0.35;
  logD = clamp(logD, 0.0, 1.8);

  // Apply dynamic range as contrast on the density
  logD = pow(logD, 0.8 + dynamicContrast * 0.4);

  // Multi-hue: blend primary/secondary using shortest-arc (no overshoot into wrong hues)
  float diffHues = fract(hue2 - hue1 + 0.5) - 0.5;
  float hue = fract(hue1 + diffHues * clamp(colorIdx, 0.0, 1.0));

  // Timbral brightness shifts the hue toward hot (orange/white) or cool (blue/violet)
  hue += (timbralTemp - 0.5) * 0.08;

  // Vocal presence adds warm amber bias
  float warmBias = vocalWarmth * 0.12;
  hue -= warmBias; // shift toward red/orange in HSV

  vec3 col = hsv2rgb(vec3(fract(hue), sat, logD));

  // Vocal warmth: additive amber glow
  col += vec3(0.15, 0.08, 0.02) * vocalWarmth * logD * 0.5;

  return col;
}

// ─── Raymarched Volumetric Map ───
// Returns density at a 3D world position (projects onto 2D attractor plane with depth variation)
float ffMap(vec3 pos, float time, float bassScale, float variationMix, float complexity,
            float drumSnap, float jitter, float mutationRate, float verticalReach) {
  // Project 3D position onto attractor plane: use XY with Z-dependent rotation
  // This gives parallax — different depths see different slices of the attractor
  float depthAngle = pos.z * 0.3;
  float dc = cos(depthAngle);
  float ds = sin(depthAngle);
  vec2 projected = vec2(dc * pos.x - ds * pos.y, ds * pos.x + dc * pos.y);

  // Depth-dependent scale: flames taper with distance
  float depthScale = 1.0 / (1.0 + abs(pos.z) * 0.15);
  projected *= depthScale;

  // Vertical reach: melodic pitch stretches the Y axis
  projected.y /= (0.8 + verticalReach * 0.6);

  float d = ffDensity(projected, time, bassScale, variationMix,
                      complexity, drumSnap, jitter, mutationRate);

  // Depth falloff: Gaussian envelope around the camera focal plane
  float depthFalloff = exp(-pos.z * pos.z * 0.04);
  d *= depthFalloff;

  return d;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // ─── Audio Reads ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float beatStability = clamp(uBeatStability, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float timbralFlux = clamp(uTimbralFlux, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float dynamicRange = clamp(uDynamicRange, 0.0, 1.0);

  // FFT bands
  float fftBass = texture2D(uFFTTexture, vec2(0.07, 0.5)).r;
  float fftMid = texture2D(uFFTTexture, vec2(0.36, 0.5)).r;
  float fftHigh = texture2D(uFFTTexture, vec2(0.78, 0.5)).r;

  // ─── Section-Type Gates ───
  // (0=intro, 1=verse, 2=chorus, 3=bridge, 4=solo, 5=jam, 6=outro, 7=space)
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Climax State ───
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);
  // Climax sub-phases: 0=none, 1=approach, 2=active, 3=explode
  float climaxExplode = smoothstep(2.5, 3.0, uClimaxPhase);
  float climaxActive = smoothstep(1.5, 2.0, uClimaxPhase) * (1.0 - climaxExplode);

  // ─── Derived Parameters ───
  float flowTime = uDynamicTime * (0.06 + slowE * 0.03);

  // Bass → attractor scale
  float bassScale = bass * 0.5 + fftBass * 0.2;

  // Energy → iteration brightness
  float brightMult = 0.4 + energy * 0.8 + fftMid * 0.15;

  // Drum onset → transform parameter snap
  float drumSnap = drumOnset * 2.0;

  // Harmonic tension → attractor complexity (2-4 active transforms)
  float complexity = tension;

  // Beat stability → transform jitter
  float jitter = (1.0 - beatStability) * 0.2;

  // Timbral flux → mutation rate
  float mutationRate = 1.0 + timbralFlux * 1.5;

  // Melodic pitch → vertical flame reach
  float verticalReach = pitch;

  // Variation mix: tension + section modulation
  float variationMix = 0.3 + tension * 0.5;

  // ─── Section Modulation ───
  // Jam: morphing between attractor types (increased mutation + complexity)
  variationMix += sJam * 0.2;
  mutationRate *= 1.0 + sJam * 0.8;
  complexity = mix(complexity, 1.0, sJam * 0.5);

  // Space: single dim flame (reduce complexity, lower brightness)
  complexity *= mix(1.0, 0.3, sSpace);
  brightMult *= mix(1.0, 0.4, sSpace);
  bassScale *= mix(1.0, 0.6, sSpace);

  // Chorus: vivid multi-flame (max complexity, saturated)
  complexity = mix(complexity, 1.0, sChorus * 0.6);
  brightMult *= 1.0 + sChorus * 0.3;

  // Solo: dramatic high-contrast
  brightMult *= 1.0 + sSolo * 0.4;
  variationMix += sSolo * 0.15;

  // Space score overlay: contemplative sparse mode
  brightMult *= mix(1.0, 0.5, spaceScore * 0.6);
  complexity *= mix(1.0, 0.4, spaceScore * 0.4);

  // ─── Climax: Explosion → Particle Shower → Reform ───
  // Active climax: max everything
  brightMult *= 1.0 + climaxActive * 0.6;
  complexity = mix(complexity, 1.0, climaxActive * 0.7);

  // Explode phase: attractor shatters — extreme jitter + scale blow-out
  jitter += climaxExplode * 0.8;
  bassScale += climaxExplode * 0.4;
  drumSnap += climaxExplode * 3.0;

  // ─── Palette ───
  float chromaHueMod = uChromaHue * 0.12;
  float chordHue = float(int(uChordIndex)) / 24.0;
  float colorCycle = flowTime * 0.3 + beatSnap * 0.4;

  float hue1 = uPalettePrimary + chromaHueMod + chordHue * 0.2 + colorCycle * 0.08;
  float hue2 = uPaletteSecondary + chordHue * 0.1 + colorCycle * 0.05;
  float sat = mix(0.55, 1.0, energy) * uPaletteSaturation;

  // Chorus: boost saturation
  sat = min(sat * (1.0 + sChorus * 0.15), 1.0);

  // ─── Ray Setup (3D Camera) ───
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // ─── Volumetric Raymarch ───
  // Emission model: accumulate color additively (no opacity/absorption — pure glow)
  int steps = int(mix(28.0, 56.0, smoothstep(0.15, 0.55, energy)));
  float stepSize = 0.14;

  vec3 flameAccum = vec3(0.0);
  float totalDensity = 0.0;

  for (int i = 0; i < 56; i++) {
    if (i >= steps) break;
    float fi = float(i);
    float marchT = 0.3 + fi * stepSize;
    vec3 pos = ro + rd * marchT;

    // Compute attractor density at this 3D sample
    float density = ffMap(pos, flowTime, bassScale, variationMix, complexity,
                          drumSnap, jitter, mutationRate, verticalReach);

    if (density > 0.005) {
      // Get color index for this sample
      vec2 depthAngleVec = vec2(cos(pos.z * 0.3), sin(pos.z * 0.3));
      vec2 projected = vec2(depthAngleVec.x * pos.x - depthAngleVec.y * pos.y,
                            depthAngleVec.y * pos.x + depthAngleVec.x * pos.y);
      float depthScale = 1.0 / (1.0 + abs(pos.z) * 0.15);
      projected *= depthScale;
      projected.y /= (0.8 + verticalReach * 0.6);

      float colorIdx = ffColorIndex(projected, flowTime, bassScale, variationMix,
                                    drumSnap, mutationRate);

      // Compute flame emission color
      vec3 emission = ffFlame(density, colorIdx, hue1, hue2, sat,
                              vocalPresence, timbralBright, dynamicRange);

      // Depth coloring: cooler (bluer) in the distance
      float depthRatio = fi / float(steps);
      emission = mix(emission, emission * vec3(0.7, 0.75, 1.1), depthRatio * 0.4);

      // Self-illumination: denser regions glow more
      emission *= brightMult * (1.0 + density * 2.0);

      // Volumetric glow: soft additive (diminishing returns at distance)
      float stepWeight = exp(-fi * 0.03);
      flameAccum += emission * stepWeight;
      totalDensity += density * stepWeight;
    }
  }

  vec3 col = flameAccum;

  // ─── Onset Flash ───
  col += vec3(1.0, 0.92, 0.8) * drumOnset * totalDensity * 0.3;

  // ─── Background: deep void with faint attractor ghost ───
  {
    float bgNoise = fbm3(vec3(p * 2.5, flowTime * 0.2)) * 0.03;
    vec3 bgColor = vec3(bgNoise * 0.4, bgNoise * 0.25, bgNoise * 0.55);
    // Faint ember glow in background
    float emberField = fbm3(vec3(p * 4.0 + vec2(flowTime * 0.05), flowTime * 0.08 + 50.0));
    vec3 emberColor = hsv2rgb(vec3(hue1 - 0.05, sat * 0.3, 0.04 * (0.5 + energy * 0.5)));
    bgColor += emberColor * max(0.0, emberField);
    col = max(col, bgColor);
  }

  // ─── Volumetric Glow Haze ───
  // Soft palette-tinted haze around dense regions
  {
    float glowField = fbm3(vec3(p * 1.5, flowTime * 0.1));
    float glowDiff = fract(hue2 - hue1 + 0.5) - 0.5;
    float glowHue = fract(hue1 + glowDiff * clamp(glowField * 0.5 + 0.5, 0.0, 1.0));
    vec3 glowTint = hsv2rgb(vec3(glowHue, sat * 0.5, 0.06));
    col += glowTint * totalDensity * 0.15 * (0.4 + energy * 0.4);
  }

  // ─── Climax Explosion Particle Shower ───
  if (climaxExplode > 0.01) {
    // Scatter bright particles across the field
    for (int k = 0; k < 8; k++) {
      float fk = float(k);
      float seed = fract(sin(fk * 127.1 + uTime * 2.0) * 43758.5453);
      vec2 particlePos = vec2(
        sin(fk * 2.4 + uTime * 3.0) * (0.3 + seed * 0.5),
        cos(fk * 1.7 + uTime * 2.5) * (0.3 + seed * 0.4)
      );
      float dist = length(p - particlePos);
      float particleBright = exp(-dist * dist * 40.0) * climaxExplode;
      vec3 particleColor = hsv2rgb(vec3(hue1 + fk * 0.08, sat, 1.0));
      col += particleColor * particleBright * 0.6;
    }
  }

  // ─── Jam Phase Modulation ───
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    // Exploration: cooler tones, Building: warming, Peak: max saturation
    col *= 1.0 + jpBuild * 0.1 + jpPeak * 0.25;
    col = mix(col, col * vec3(0.85, 0.9, 1.1), jpExplore * 0.2);
  }

  // ─── Beat Pulse ───
  col *= 1.0 + beatSnap * 0.08 * (1.0 + climaxBoost * 0.3);

  // ─── Semantic: Psychedelic → variation complexity, Cosmic → depth glow ───
  col *= 1.0 + uSemanticPsychedelic * 0.12;
  col *= 1.0 + uSemanticCosmic * 0.08;

  // ─── Peak-of-Show glow ───
  col *= 1.0 + uPeakOfShow * 0.15;

  // ─── SDF Icon Emergence ───
  {
    float nf = fbm3(vec3(p * 2.0, flowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ─── Post-Processing ───
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
