/**
 * Aurora — northern lights / atmospheric curtains of luminous color.
 * Vertical ribbons ripple and fold across a dark starfield sky.
 * Designed for tender, contemplative songs (Stella Blue, Loser, Wharf Rat).
 *
 * Movement is always slow and organic — never frantic. Quiet passages
 * show faint distant shimmer; peaks flood the sky with curtains of light.
 *
 * Audio reactivity:
 *   uBass       → curtain sway amplitude, low-frequency ripple
 *   uEnergy     → curtain brightness, vertical coverage (quiet=faint, loud=full sky)
 *   uHighs      → fine ribbon detail, edge sharpness
 *   uOnsetSnap  → brief brightness pulse through curtains
 *   uSlowEnergy → overall drift speed, color saturation (ambient signal)
 *   uChromaHue  → shifts curtain color over time with harmonic content
 *   uPalettePrimary   → dominant curtain color
 *   uPaletteSecondary → secondary curtain/edge glow color
 */

import { noiseGLSL } from "./noise";

export const auroraVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const auroraFrag = /* glsl */ `
precision highp float;

${noiseGLSL}

uniform float uTime;
uniform float uBass;
uniform float uRms;
uniform float uCentroid;
uniform float uHighs;
uniform float uOnset;
uniform float uBeat;
uniform float uMids;
uniform vec2 uResolution;
uniform float uEnergy;
uniform float uSectionProgress;
uniform float uSectionIndex;
uniform float uChromaHue;
uniform float uFlatness;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform float uTempo;
uniform float uOnsetSnap;
uniform float uBeatSnap;
uniform float uMusicalTime;
uniform float uChromaShift;
uniform float uAfterglowHue;
uniform float uClimaxPhase;
uniform float uClimaxIntensity;
uniform float uSlowEnergy;
uniform vec4 uContrast0;
uniform vec4 uContrast1;
uniform float uJamDensity;

varying vec2 vUv;

#define PI 3.14159265

// --- HSV to RGB conversion ---
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// --- Starfield: simple procedural stars ---
float stars(vec2 uv, float density) {
  vec2 cell = floor(uv * density);
  vec2 f = fract(uv * density);
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
  vec2 starPos = vec2(h, h2);
  float dist = length(f - starPos);
  float hasStar = step(0.7, h);
  float brightness = h2 * 0.5 + 0.5;
  return hasStar * brightness * smoothstep(0.03, 0.005, dist);
}

// --- Volumetric Aurora FBM (nimitz-inspired) ---
// Rotation matrix per octave for organic swirl
mat2 m2 = mat2(0.80, 0.60, -0.60, 0.80);

// Octave count modulated by jam density: sparse exploration (3) → dense peak (6)
// At neutral density (0.5) this produces 5 octaves, matching the original behavior.
float auroraFBM(vec3 p, float turbulence) {
  int octaves = int(mix(3.0, 7.0, uJamDensity));
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    val += amp * snoise(p * freq);
    // Rotate XZ per octave for organic swirl (nimitz technique)
    p.xz = m2 * p.xz;
    p.y *= 1.1;
    // Turbulence from onset adds extra displacement per octave
    p.x += turbulence * 0.2 * float(i);
    freq *= 2.1;
    amp *= 0.5;
  }
  return val;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float chromaH = clamp(uChromaHue, 0.0, 1.0);

  // === SLOW TIME: aurora should never feel rushed ===
  float slowTime = uTime * 0.08;
  float driftSpeed = 0.03 + slowE * 0.02;

  // === DARK SKY background ===
  vec3 skyColor = mix(
    vec3(0.005, 0.008, 0.02),
    vec3(0.02, 0.03, 0.06),
    smoothstep(0.5, -0.3, p.y)
  );
  vec3 col = skyColor;

  // === STARS: visible through gaps in aurora ===
  float starLayer1 = stars(uv + slowTime * 0.01, 80.0);
  float starLayer2 = stars(uv + slowTime * 0.005 + 10.0, 120.0) * 0.6;
  float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + uv.x * 50.0 + uv.y * 30.0);
  vec3 starColor = vec3(0.8, 0.85, 1.0) * (starLayer1 + starLayer2) * twinkle;
  col += starColor * 0.4;

  // === AURORA COLORS from palette + chromaHue shift ===
  float hue1 = uPalettePrimary + chromaH * 0.1;
  float hue2 = uPaletteSecondary + chromaH * 0.08;
  float sat = mix(0.7, 1.0, slowE) * uPaletteSaturation;

  vec3 auroraColor1 = hsv2rgb(vec3(hue1, sat, 1.0));
  vec3 auroraColor2 = hsv2rgb(vec3(hue2, sat * 0.9, 0.9));
  vec3 classicGreen = vec3(0.1, 0.9, 0.4);
  vec3 classicPurple = vec3(0.5, 0.2, 0.8);
  auroraColor1 = mix(auroraColor1, classicGreen, 0.25);
  auroraColor2 = mix(auroraColor2, classicPurple, 0.2);

  // === VOLUMETRIC AURORA RAYMARCHING (nimitz-inspired) ===
  // Energy controls step count (24-32 range) and vertical coverage
  // Jam density expands step budget and coverage during peak jams
  // At neutral density (0.5) this produces 24 base steps, matching original behavior.
  int maxSteps = int(mix(16.0, 32.0, uJamDensity)) + int(energy * 8.0);
  float verticalCoverage = mix(0.15, 0.7, energy) * mix(0.8, 1.2, uJamDensity);
  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  float curtainBrightness = mix(0.10, 0.75, energy) * mix(0.7, 1.3, uJamDensity);
  curtainBrightness += onset * 0.5;
  float bpH = beatPulseHalf(uMusicalTime);
  curtainBrightness += bpH * 0.20 + uBeatSnap * 0.15;
  curtainBrightness += climaxBoost * 0.25;

  // Ray setup: looking upward into aurora band
  vec3 rd = normalize(vec3(p.x, 0.6 + p.y * 0.8, -1.0));

  // Volumetric accumulation
  vec4 auroraAcc = vec4(0.0);
  float stepSize = mix(0.15, 0.1, energy);

  // Aurora exists in a constrained vertical band
  float bandLow = mix(2.0, 1.0, energy);
  float bandHigh = mix(3.5, 5.0, energy);

  for (int i = 0; i < 40; i++) {
    if (i >= maxSteps) break;
    if (auroraAcc.a > 0.95) break;   // Early exit at near-opaque

    float t = float(i) * stepSize + 0.5;
    vec3 pos = rd * t;

    // Constrain to aurora band (skip steps outside)
    if (pos.y < bandLow || pos.y > bandHigh) continue;

    // Curtain sway from bass
    float swayAmt = bass * 0.4;
    pos.x += swayAmt * sin(pos.y * 2.0 + slowTime * 0.5);
    pos.z += swayAmt * 0.5 * cos(pos.y * 1.5 + slowTime * 0.3);

    // Slow ambient drift
    pos.x += slowTime * driftSpeed * 10.0;
    pos.z += slowTime * driftSpeed * 5.0;

    // FBM density with onset turbulence
    float density = auroraFBM(pos * 0.3, onset);

    // Threshold: must exceed 0 to be visible
    density = smoothstep(-0.1, 0.4, density);

    // Vertical falloff: fade at edges of band
    float bandFade = smoothstep(bandLow, bandLow + 0.5, pos.y)
                   * smoothstep(bandHigh, bandHigh - 0.5, pos.y);
    density *= bandFade;

    if (density > 0.01) {
      // Color varies with height (green at bottom, purple at top)
      float heightMix = smoothstep(bandLow, bandHigh, pos.y);
      vec3 auroraCol = mix(auroraColor1, auroraColor2, heightMix);

      // Noise-based luminosity variation for shimmer
      float lumNoise = snoise(vec3(pos.x * 2.0, pos.y * 3.0, slowTime * 0.5));
      density *= 0.6 + 0.4 * lumNoise;

      // Front-to-back alpha compositing
      float alpha = density * stepSize * 3.0;
      alpha = min(alpha, 1.0);
      float weight = alpha * (1.0 - auroraAcc.a);

      auroraAcc.rgb += auroraCol * curtainBrightness * weight;
      auroraAcc.a += weight;
    }
  }

  float auroraIntensity = auroraAcc.a;

  // Apply aurora to scene
  col += auroraAcc.rgb;

  // === SDF STEALIE: subtler emergence in aurora (scale 0.7) ===
  {
    float nf = auroraFBM(vec3(p * 2.0, slowTime), 0.0);
    vec3 stLight = stealieEmergence(p, uTime, energy, bass, auroraColor1, auroraColor2, nf) * 0.7;
    col += stLight;
  }

  // === ATMOSPHERIC GLOW: diffuse light beneath aurora ===
  float glowY = smoothstep(0.3, -0.2, p.y);
  float glowStrength = auroraIntensity * energy * 0.15;
  vec3 glowColor = mix(auroraColor1, vec3(0.1, 0.2, 0.15), 0.5);
  col += glowColor * glowY * glowStrength;

  // === DIM STARS behind bright aurora ===
  col -= starColor * 0.4 * auroraIntensity * curtainBrightness;

  // === VIGNETTE ===
  float vigScale = mix(0.70, 0.62, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.0), col, vignette);

  // === LIGHT LEAK ===
  col += lightLeak(p, uTime, energy * 0.5, uOnsetSnap) * 0.7;

  // === BLOOM: soft ethereal glow (climax-amplified) ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.35, 0.25, energy) - climaxBoost * 0.08;
  float bloomAmount = max(0.0, lum - bloomThreshold) * (2.0 + climaxBoost * 1.5);
  vec3 bloomColor = mix(col, auroraColor1, 0.3);
  col += bloomColor * bloomAmount * (0.3 + climaxBoost * 0.20);

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, energy);

  // === HALATION: warm film bloom ===
  col = halation(vUv, col, energy);

  // === FILM GRAIN ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.05, 0.025, energy);
  col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity;

  // ONSET BRIGHTNESS PULSE: raw transient spike
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap * 0.30;
  col *= 1.0 + onsetPulse;

  // ONSET CHROMATIC ABERRATION
  if (uOnsetSnap > 0.4) {
    float caAmt = (uOnsetSnap - 0.4) * 0.15;
    col.r *= 1.0 + caAmt;
    col.b *= 1.0 - caAmt * 0.5;
  }

  // === LIFTED BLACKS (cold blue-green tint) ===
  col = max(col, vec3(0.02, 0.03, 0.05));

  gl_FragColor = vec4(col, 1.0);
}
`;
