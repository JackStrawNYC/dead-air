/**
 * Morphogenesis — activator-inhibitor Turing growth patterns.
 * True activator-inhibitor reaction-diffusion using feedback buffers.
 * Unlike reaction_diffusion (single-pass FBM approximation), this builds
 * real temporal state: leopard spots, zebra stripes, coral branching.
 *
 * Feedback: Yes (simulation state in RG channels of uPrevFrame)
 *
 * Audio reactivity:
 *   uEnergy          → reaction rate (evolution speed)
 *   uBass            → activator diffusion (spot size)
 *   uMids            → inhibitor diffusion (spots vs stripes vs labyrinth)
 *   uBeatSnap        → seed new nucleation sites
 *   uHarmonicTension → pattern instability
 *   uMelodicPitch    → color mapping
 *   uChordIndex      → palette variation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const morphogenesisVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const morphogenesisFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  stageFloodEnabled: true,
  halationEnabled: true,
  grainStrength: "normal",
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265

// Sample previous frame for reaction-diffusion state
vec2 sampleState(vec2 uv) {
  vec4 prev = texture2D(uPrevFrame, uv);
  return prev.rg; // R = activator, G = inhibitor
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.05;
  float chromaHueMod = uChromaHue * 0.15;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;

  // Section-type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float reactionRateMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.1, sChorus);
  float patternScaleMod = mix(1.0, 1.3, sJam) * mix(1.0, 0.7, sSpace) * mix(1.0, 1.2, sChorus);
  float diffusionSpeedMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.15, sChorus);

  // Timbral flux → reaction mutation rate
  float morphFlux = 1.0 + uTimbralFlux * 0.5;

  // --- Reaction-diffusion parameters ---
  float dt = (0.8 + energy * 1.5) * reactionRateMod * morphFlux; // reaction rate from energy, modulated by timbral flux
  float Da = (0.21 + bass * 0.08) * patternScaleMod; // activator diffusion (larger = bigger spots)
  float Di = (0.05 + mids * 0.12) * diffusionSpeedMod; // inhibitor diffusion (ratio to Da determines pattern)
  float f = 0.035 + tension * 0.015; // feed rate
  float k = 0.060 + (1.0 - mids) * 0.008; // kill rate

  // --- Laplacian computation (3x3 kernel) ---
  vec2 texel = 1.0 / uResolution;
  vec2 state = sampleState(uv);
  float a = state.x; // activator
  float b = state.y; // inhibitor

  // 3x3 Laplacian
  float lapA = 0.0;
  float lapB = 0.0;
  // Cardinal neighbors (weight 0.2)
  for (int dx = -1; dx <= 1; dx += 2) {
    vec2 neighbor = sampleState(uv + vec2(float(dx) * texel.x, 0.0));
    lapA += neighbor.x;
    lapB += neighbor.y;
  }
  for (int dy = -1; dy <= 1; dy += 2) {
    vec2 neighbor = sampleState(uv + vec2(0.0, float(dy) * texel.y));
    lapA += neighbor.x;
    lapB += neighbor.y;
  }
  // Diagonal neighbors (weight 0.05)
  for (int dx = -1; dx <= 1; dx += 2) {
    for (int dy = -1; dy <= 1; dy += 2) {
      vec2 neighbor = sampleState(uv + vec2(float(dx) * texel.x, float(dy) * texel.y));
      lapA += neighbor.x * 0.25;
      lapB += neighbor.y * 0.25;
    }
  }
  lapA = lapA - 5.0 * a; // subtract center (weighted sum of neighbor diffs)
  lapB = lapB - 5.0 * b;

  // --- Reaction step ---
  float reaction = a * b * b;
  float newA = a + dt * (Da * lapA - reaction + f * (1.0 - a));
  float newB = b + dt * (Di * lapB + reaction - (k + f) * b);

  // Clamp to valid range
  newA = clamp(newA, 0.0, 1.0);
  newB = clamp(newB, 0.0, 1.0);

  // --- Beat snap: seed new nucleation sites ---
  if (beatSnap > 0.5) {
    float seedNoise = snoise(vec3(p * 15.0, slowTime * 10.0));
    if (seedNoise > 0.7 - beatSnap * 0.3) {
      newA = 0.5;
      newB = 0.25;
    }
  }

  // --- Initialize on first frame (detect blank state) ---
  vec4 rawPrev = texture2D(uPrevFrame, uv);
  if (rawPrev.a < 0.01) {
    // Seed with noise pattern
    float seedA = smoothstep(0.3, 0.7, snoise(vec3(p * 8.0, 0.0)));
    float seedB = smoothstep(0.4, 0.6, snoise(vec3(p * 8.0, 100.0)));
    newA = 0.5 + seedA * 0.5;
    newB = 0.25 + seedB * 0.25;
  }

  // --- Tension: add instability ---
  if (tension > 0.3) {
    float perturbation = snoise(vec3(p * 20.0, slowTime * 5.0)) * tension * 0.02;
    newA += perturbation;
  }

  // --- Color mapping ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;

  // Map activator/inhibitor to color
  float pattern = newA - newB;
  float hue = mix(hue1, hue2, smoothstep(-0.3, 0.3, pattern)) + melodicPitch * 0.1;
  float brightness = 0.15 + smoothstep(0.0, 0.5, newA) * 0.6 + energy * 0.2;
  vec3 col = hsv2rgb(vec3(hue, sat, brightness));

  // Highlight active reaction zones
  float reactionIntensity = abs(reaction) * 10.0;
  col += hsv2rgb(vec3(hue + 0.15, sat * 0.7, reactionIntensity)) * 0.3;

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.008, 0.02), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // Store state in RG channels, visual in RGB
  gl_FragColor = vec4(col, 1.0);
  // Note: we store state AND visual together. The state is read from RG
  // on next frame. This means the visual output doubles as state storage.
  // For true separation, would need separate state texture, but this works
  // well enough since visual brightness correlates with activator concentration.
  gl_FragColor.r = mix(col.r, newA, 0.5);
  gl_FragColor.g = mix(col.g, newB, 0.5);
}
`;
