/**
 * Inferno — volumetric fire raymarching shader.
 * Camera looking upward through rising flames with embers and heat shimmer.
 * Primary mode for Fire on the Mountain.
 *
 * Audio reactivity:
 *   uBass       → flame intensity/density, heat shimmer
 *   uEnergy     → ember count/brightness, overall blaze level
 *   uSlowEnergy → smoke wisp density (ambient drift signal)
 *   uOnsetSnap  → heat shimmer distortion pulses
 *   uHighs      → spark detail, ember sharpness
 *   uPalettePrimary   → flame body color
 *   uPaletteSecondary → ember/core glow color
 */

import { noiseGLSL } from "./noise";

export const infernoVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const infernoFrag = /* glsl */ `
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
#define MAX_STEPS_LIMIT 50
#define MAX_DIST 8.0

// --- Flame FBM with noise displacement (XT95 technique) ---
// Octave count modulated by jam density: sparse fire (3) → detailed blaze (6)
float flameFBM(vec3 p, float bassAmp, float detailAmp) {
  int octaves = int(mix(3.0, 6.0, uJamDensity));
  p.y *= 0.5;
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    float octaveBoost = 1.0;
    if (i < 2) {
      octaveBoost += bassAmp * 0.6;
    } else if (i > 2) {
      octaveBoost += detailAmp * 0.5;
    }
    value += amplitude * octaveBoost * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// --- Flame SDF: stretched sphere with noise displacement ---
float flameSDF(vec3 p, float bass, float highs, float onset) {
  // Bass stretches flame wider and flatter
  vec3 q = p;
  q.x *= mix(1.0, 0.7, bass);   // wider with bass
  q.y *= mix(1.0, 1.4, bass);   // taller with bass
  q.z *= mix(1.0, 0.7, bass);

  // Base sphere distance
  float d = length(q) - 1.0;

  // Noise displacement for fire shape
  vec3 np = p * 1.5;
  np.y -= uTime * (0.8 + bass * 0.6);  // rise speed from bass
  // Onset churns domain
  np.xy += onset * 0.3 * vec2(
    sin(p.z * 3.0 + uTime * 2.0),
    cos(p.x * 3.0 + uTime * 2.0)
  );
  float noiseVal = flameFBM(np, bass, highs);
  d += noiseVal * 0.5;

  return d;
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

  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // === HEAT SHIMMER: UV distortion from onset hits ===
  vec2 shimmerUv = p;
  float shimmerStrength = onset * 0.08 + bass * 0.02 + uBeatSnap * 0.05;
  shimmerUv += shimmerStrength * vec2(
    snoise(vec3(p * 8.0, uTime * 2.0)),
    snoise(vec3(p * 8.0 + 50.0, uTime * 2.0 + 30.0))
  );

  // === CAMERA: looking upward through flames ===
  vec3 camPos = vec3(0.0, -1.5, 0.0);
  vec3 camDir = normalize(vec3(shimmerUv.x * 0.8, 1.0, shimmerUv.y * 0.8));

  // === FLAME COLORS from palette ===
  float hue1 = hsvToCosineHue(uPalettePrimary);
  vec3 flameColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  flameColor = mix(flameColor, vec3(1.0, 0.5, 0.1), 0.4);

  float hue2 = hsvToCosineHue(uPaletteSecondary);
  vec3 coreColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));
  coreColor = mix(coreColor, vec3(1.0, 0.95, 0.8), 0.5);

  // === GLOW ACCUMULATION RAYMARCHING (XT95 Flame technique) ===
  // Track how deep ray penetrates fire volume, accumulate glow
  // Jam density modulates step count: sparse fire during exploration (20), intense at peak (50)
  // At neutral density (0.5) this produces 40 steps, matching original MAX_STEPS behavior.
  int maxSteps = int(mix(20.0, 60.0, uJamDensity));
  vec3 accColor = vec3(0.0);
  float glow = 0.0;
  float glowPower = mix(2.0, 4.8, energy);  // energy controls glow exponent — wider range

  for (int i = 0; i < MAX_STEPS_LIMIT; i++) {
    if (i >= maxSteps) break;
    float t = float(i) * 0.15 + 0.05;
    if (t > MAX_DIST) break;

    vec3 pos = camPos + camDir * t;
    float d = flameSDF(pos, bass, highs, onset);

    // Accumulate glow based on proximity to fire surface
    // Closer to surface = stronger glow (XT95 key insight)
    if (d < 0.5) {
      float proximity = 1.0 - smoothstep(0.0, 0.5, d);
      glow += proximity * 0.04;

      // Color based on depth into flame: core=white, edge=orange
      float depthInFlame = max(0.0, -d);
      float coreStrength = smoothstep(0.0, 0.3, depthInFlame) * energy;
      float depthT = t / MAX_DIST;
      vec3 localColor = mix(flameColor, coreColor, coreStrength);
      localColor = mix(localColor, flameColor * 0.6, depthT);
      accColor += localColor * proximity * 0.04;
    }
  }

  // Punchy emission: pow(glow*2, 4) — the XT95 signature (amplified)
  float emission = pow(clamp(glow * 2.0, 0.0, 1.0), glowPower);
  vec3 col = accColor * emission * 6.0;

  // Add core white-hot bloom from emission
  col += coreColor * pow(emission, 2.0) * 0.8;

  // === BEAT PULSE: tempo-locked flame intensity ===
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.30 + climaxBoost * bp * 0.15;

  // === BEAT SNAP: sharp flame flare on transients ===
  col *= 1.0 + uBeatSnap * 0.15 * (1.0 + climaxBoost * 0.5);

  // === RISING EMBERS: particle field (beat-reactive) ===
  float emberCount = 5.0 + energy * 20.0 + uBeatSnap * 8.0;
  for (int j = 0; j < 8; j++) {
    float fj = float(j);
    float seed = fj * 7.13;
    vec2 emberPos = vec2(
      snoise(vec3(seed, 0.0, uTime * 0.1)) * 0.8,
      fract(seed * 0.37 + uTime * (0.05 + energy * 0.08)) * 2.0 - 0.5
    );
    float dist = length(p - emberPos);
    float size = 0.003 + highs * 0.002;
    float ember = smoothstep(size, size * 0.3, dist);
    float flicker = 0.5 + 0.5 * snoise(vec3(seed * 3.0, uTime * 4.0, 0.0));
    col += coreColor * ember * flicker * energy * 0.6;
  }

  // === SMOKE WISPS: slow drifting layer from slowEnergy ===
  float smokeOpacity = slowE * 0.4 * (1.0 - energy * 0.6);
  if (smokeOpacity > 0.01) {
    vec3 smokePos = vec3(p * 1.5, uTime * 0.03);
    float smoke = fbm3(smokePos) * 0.5 + 0.5;
    smoke *= smokeOpacity;
    vec3 smokeColor = flameColor * 0.15 + vec3(0.05, 0.03, 0.02);
    col = mix(col, smokeColor, smoke * 0.5);
  }

  // === VIGNETTE ===
  float vigScale = mix(0.46, 0.30, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = flameColor * 0.03;
  col = mix(vigTint, col, vignette);

  // === LIGHT LEAK ===
  col += lightLeak(p, uTime, energy, uOnsetSnap);

  // === BLOOM: aggressive for fire (climax-amplified) ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.3, 0.2, energy) - climaxBoost * 0.08;
  float bloomAmount = max(0.0, lum - bloomThreshold) * (3.0 + climaxBoost * 2.0);
  vec3 bloomColor = mix(col, vec3(1.0, 0.9, 0.7), 0.4);
  vec3 bloom = bloomColor * bloomAmount * (0.5 + climaxBoost * 0.25);
  col = col + bloom - col * bloom; // screen blend

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, energy);

  // === ANIMATED STAGE FLOOD: flowing palette noise in dark areas ===
  col = stageFloodFill(col, p, uTime, energy, uPalettePrimary, uPaletteSecondary);

  // === HALATION: warm film bloom ===
  col = halation(vUv, col, energy);

  // === FILM GRAIN ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.04, 0.02, energy);
  col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity;

  // ONSET SATURATION PULSE: push colors away from gray (psychedelic, not white)
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse * 0.7);
  col *= 1.0 + onsetPulse * 0.08;

  // ONSET CHROMATIC ABERRATION
  if (uOnsetSnap > 0.4) {
    float caAmt = (uOnsetSnap - 0.4) * 0.15;
    col.r *= 1.0 + caAmt;
    col.b *= 1.0 - caAmt * 0.5;
  }

  // === LIFTED BLACKS (warm tint for fire) ===
  col = max(col, vec3(0.14, 0.08, 0.06));

  gl_FragColor = vec4(col, 1.0);
}
`;
