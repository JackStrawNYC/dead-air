/**
 * Plasma Field — chroma-driven sinusoidal plasma.
 * 12-layer sinusoidal wave summation where each wave is driven by a chroma bin.
 * Major chords produce smooth harmonic interference; dissonance tears the pattern apart.
 * Classic demoscene plasma elevated by real harmonic content.
 *
 * Audio reactivity:
 *   uChroma0/1/2    → individual wave frequencies/amplitudes
 *   uBass           → global wave scale
 *   uEnergy         → brightness + wave count
 *   uHarmonicTension → turbulence
 *   uBeatSnap       → color inversion flash
 *   uMelodicPitch   → hue offset
 *   uChordIndex     → palette selection
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const plasmaFieldVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const plasmaFieldFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  caEnabled: true,
  paletteCycleEnabled: true,
  grainStrength: "light",
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// Extract individual chroma value from packed vec4s
float getChromaVal(int idx) {
  if (idx < 4) {
    if (idx == 0) return uChroma0.x;
    if (idx == 1) return uChroma0.y;
    if (idx == 2) return uChroma0.z;
    return uChroma0.w;
  }
  if (idx < 8) {
    if (idx == 4) return uChroma1.x;
    if (idx == 5) return uChroma1.y;
    if (idx == 6) return uChroma1.z;
    return uChroma1.w;
  }
  if (idx == 8) return uChroma2.x;
  if (idx == 9) return uChroma2.y;
  if (idx == 10) return uChroma2.z;
  return uChroma2.w;
}

// Single plasma wave driven by chroma amplitude
float plasmaWave(vec2 p, float freq, float phase, float amplitude) {
  return amplitude * sin(p.x * freq + phase) * cos(p.y * freq * 0.7 + phase * 1.3);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.06;
  float chromaHueMod = uChromaHue * 0.2;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;
  float accelBoost = 1.0 + uEnergyAccel * 0.1;

  // --- Global wave scale from bass ---
  float waveScale = (2.0 + bass * 3.0) * accelBoost;

  // --- 12-layer plasma summation driven by chroma bins ---
  float plasma = 0.0;
  float totalWeight = 0.0;

  for (int i = 0; i < 12; i++) {
    float chromaAmp = getChromaVal(i);
    float fi = float(i);

    // Each pitch class drives a different wave frequency
    float baseFreq = 2.0 + fi * 0.8;
    float freq = baseFreq * waveScale;

    // Phase offset from time + pitch class position
    float phase = slowTime * (1.0 + fi * 0.13) + fi * TAU / 12.0;

    // Harmonic tension adds turbulence to wave frequencies
    float turbulence = tension * sin(slowTime * 3.0 + fi * 1.7) * 0.5;
    freq += turbulence * baseFreq;

    // Wave contribution weighted by chroma amplitude
    float weight = 0.1 + chromaAmp * 0.9;
    plasma += plasmaWave(p, freq, phase, weight);
    totalWeight += weight;
  }

  // Normalize
  plasma /= max(totalWeight, 1.0);

  // --- Additional crossing waves for richness ---
  float crossWave1 = sin(p.x * waveScale * 1.5 + p.y * waveScale * 2.0 + slowTime * 2.0);
  float crossWave2 = cos(p.y * waveScale * 1.8 - p.x * waveScale * 1.2 + slowTime * 1.7);
  plasma += (crossWave1 + crossWave2) * 0.15 * energy;

  // --- Radial modulation ---
  float r = length(p);
  float radial = sin(r * waveScale * 3.0 - slowTime * 1.5);
  plasma += radial * 0.2 * bass;

  // --- Color mapping ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.6, 1.0, energy) * uPaletteSaturation;

  // Map plasma value to dual-hue palette
  float hueT = plasma * 0.5 + 0.5; // remap -1..1 to 0..1
  float hue = mix(hue1, hue2, hueT) + melodicPitch * 0.1;
  float brightness = 0.4 + energy * 0.5 + abs(plasma) * 0.3;

  vec3 col = hsv2rgb(vec3(hue, sat, brightness));

  // --- Beat snap color inversion flash ---
  if (beatSnap > 0.3) {
    float invertStrength = beatSnap * 0.6;
    col = mix(col, vec3(1.0) - col, invertStrength);
  }

  // --- Tension distortion: tear pattern with noise ---
  if (tension > 0.3) {
    float tearNoise = snoise(vec3(p * 4.0, slowTime * 2.0));
    col += vec3(tearNoise * tension * 0.2);
    // Shift hue in tense moments
    vec3 tensionShift = hsv2rgb(vec3(hue + 0.5, sat, brightness * 0.5));
    col = mix(col, tensionShift, tension * 0.2 * abs(tearNoise));
  }

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;

  // --- Beat pulse ---
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.15;

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
  col = mix(vec3(0.01, 0.008, 0.015), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
