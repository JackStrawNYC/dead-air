/**
 * Reaction-Diffusion (Gray-Scott approximation) — single-pass Turing patterns.
 * Uses iterative FBM domain warping to approximate reaction-diffusion dynamics
 * without requiring ping-pong buffers. Three nested FBM layers at different
 * frequencies create spot/stripe patterns reminiscent of Gray-Scott systems.
 *
 * Visual aesthetic:
 *   - Quiet: sparse organic spots floating in dark medium
 *   - Building: spots begin connecting into labyrinthine stripes
 *   - Peak: dense, pulsating Turing pattern fills the screen
 *   - Release: patterns dissolve back to isolated spots
 *
 * Audio reactivity:
 *   uSlowEnergy       -> feed rate analog (spot density)
 *   uHarmonicTension  -> kill rate analog (spots vs stripes morph)
 *   uBass             -> pattern scale pulsation
 *   uEnergy           -> contrast and brightness
 *   uOnsetSnap        -> disruption ripples
 *   uMelodicDirection -> pattern flow direction
 *   uBeatStability    -> regular patterns (high) vs chaotic (low)
 *   uChromaHue        -> hue shifts
 *   uChordIndex       -> chord-driven hue modulation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const reactionDiffusionVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const reactionDiffusionFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "normal", bloomEnabled: true, paletteCycleEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// Domain warp helper: displaces coordinates using FBM
vec2 domainWarp(vec2 p, float freq, float amp, float t) {
  float nx = fbm3(vec3(p * freq, t));
  float ny = fbm3(vec3(p * freq + 5.2, t + 1.3));
  return p + vec2(nx, ny) * amp;
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
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);

  float slowTime = uDynamicTime * 0.04;

  // --- Gray-Scott analog parameters ---
  // Feed rate: controls spot density (more feed = more spots)
  float f = 0.02 + slowE * 0.04;
  // Kill rate: controls spots vs stripes (higher k = stripes)
  float k = 0.05 + tension * 0.02;

  // --- New uniform integrations ---
  float chromaHueMod = uChromaHue * 0.3;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.2;
  float vocalGlow = uVocalEnergy * 0.12;
  float accelDrive = 1.0 + uEnergyAccel * 0.15;

  // --- Pattern scale: bass drives pulsation ---
  float baseScale = mix(3.0, 6.0, energy) * accelDrive;
  float pulse = 1.0 + bass * 0.2;
  vec2 patternUv = p * baseScale * pulse;

  // --- Melodic flow: shift pattern direction ---
  patternUv += vec2(melodicDir * slowTime * 0.5, slowTime * 0.3);

  // --- Onset disruption ripples ---
  float distFromCenter = length(p);
  float ripple = onset * sin(distFromCenter * 20.0 - uTime * 8.0) * exp(-distFromCenter * 3.0);
  patternUv += vec2(ripple * 0.15);

  // --- Layer 1: Low frequency FBM (base Turing pattern) ---
  // Domain warp creates the organic reaction-diffusion flow
  vec2 warped1 = domainWarp(patternUv, 1.0, 0.8 * mix(0.5, 1.0, 1.0 - stability), slowTime * 0.7);
  float lowFBM = fbm6(vec3(warped1, slowTime * 0.3));

  // --- Layer 2: Mid frequency FBM (detail structure) ---
  vec2 warped2 = domainWarp(patternUv * 2.0, 1.5, 0.4, slowTime * 1.1);
  float midFBM = fbm3(vec3(warped2, slowTime * 0.5 + 3.7));

  // --- Layer 3: High frequency FBM (micro-texture) ---
  float highFBM = fbm3(vec3(patternUv * 5.0 + vec2(midFBM * 0.3), slowTime * 0.9 + 7.1));

  // --- Combine layers into Turing-like pattern ---
  // Mix between spots and stripes based on kill rate analog
  float spotsPattern = lowFBM * 0.6 + midFBM * 0.3 + highFBM * 0.1;

  // Stripe tendency: use directional derivative approximation
  float dx = fbm6(vec3(warped1 + vec2(0.01, 0.0), slowTime * 0.3)) - lowFBM;
  float stripePattern = sin((spotsPattern + dx * 10.0) * PI * 3.0) * 0.5 + 0.5;

  // Morph between spots and stripes via kill rate (tension)
  float pattern = mix(spotsPattern, stripePattern, k * 8.0 - 0.4);

  // --- Sharp thresholds: create distinct cell boundaries ---
  // Feed rate controls the threshold position (cell density)
  float threshold = 0.5 - f * 4.0;
  float cellMask = smoothstep(threshold - 0.05, threshold + 0.05, pattern);

  // Finer edge for cell boundaries
  float edgeMask = smoothstep(threshold - 0.08, threshold - 0.02, pattern)
                 - smoothstep(threshold + 0.02, threshold + 0.08, pattern);
  edgeMask = clamp(edgeMask, 0.0, 1.0);

  // Beat stability: high = crisp boundaries, low = fuzzy chaos
  float sharpness = mix(0.15, 0.02, stability);
  float stableCellMask = smoothstep(threshold - sharpness, threshold + sharpness, pattern);

  // --- Color palette ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 0.9, energy) * uPaletteSaturation;

  // Cells colored by primary hue, gaps by secondary
  vec3 cellColor = hsv2rgb(vec3(hue1, sat, 0.8 + energy * 0.2));
  vec3 gapColor = hsv2rgb(vec3(hue2, sat * 0.7, 0.1 + slowE * 0.15));

  // Edge glow: mix of both hues
  vec3 edgeColor = hsv2rgb(vec3(mix(hue1, hue2, 0.5), sat, 1.0));

  // --- Compose ---
  vec3 col = mix(gapColor, cellColor, stableCellMask);

  // Add bright edges between cells
  col += edgeColor * edgeMask * (0.4 + energy * 0.6);

  // Vocal warmth adds subtle glow to cells
  col += cellColor * vocalGlow * stableCellMask;

  // Energy drives overall brightness/contrast
  col *= mix(0.6, 1.2, energy);

  // High-frequency micro-texture adds depth
  col += cellColor * highFBM * 0.08 * stableCellMask;

  // --- Onset disruption flash ---
  float disruptionGlow = onset * exp(-distFromCenter * 2.0) * 1.5;
  col += vec3(1.0, 0.95, 0.85) * disruptionGlow;

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;
  // Climax adds extra saturation and edge glow
  col += edgeColor * edgeMask * climaxBoost * 0.3;

  // --- Beat pulse ---
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.12;

  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.30, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(gapColor * 0.3, col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
