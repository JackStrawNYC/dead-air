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

varying vec2 vUv;

#define PI 3.14159265
#define MAX_STEPS 64
#define MAX_DIST 8.0

// --- Multi-octave FBM with vertical bias for flame structure ---
float flameFBM(vec3 p, float bassAmp, float detailAmp) {
  // Stretch Y for vertical flame bias
  p.y *= 0.5;
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 5; i++) {
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

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);

  // === HEAT SHIMMER: UV distortion from onset hits ===
  vec2 shimmerUv = p;
  float shimmerStrength = onset * 0.03 + bass * 0.01;
  shimmerUv += shimmerStrength * vec2(
    snoise(vec3(p * 8.0, uTime * 2.0)),
    snoise(vec3(p * 8.0 + 50.0, uTime * 2.0 + 30.0))
  );

  // === CAMERA: looking upward through flames ===
  vec3 camPos = vec3(0.0, -1.5, 0.0);
  vec3 camDir = normalize(vec3(shimmerUv.x * 0.8, 1.0, shimmerUv.y * 0.8));

  // === FLAME COLORS from palette ===
  float hue1 = uPalettePrimary;
  vec3 flameColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  // Push towards warm orange/red
  flameColor = mix(flameColor, vec3(1.0, 0.5, 0.1), 0.4);

  float hue2 = uPaletteSecondary;
  vec3 coreColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));
  // Push cores towards white-hot
  coreColor = mix(coreColor, vec3(1.0, 0.95, 0.8), 0.5);

  // === RAYMARCHING: volumetric flames ===
  vec3 accColor = vec3(0.0);
  float accAlpha = 0.0;
  float stepSize = 0.1;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (accAlpha > 0.95) break;

    float t = float(i) * stepSize;
    if (t > MAX_DIST) break;

    vec3 pos = camPos + camDir * t;

    // Domain warp from bass hits — flames churn
    vec3 warpedPos = pos;
    warpedPos.xz += bass * 0.3 * vec2(
      snoise(pos * 0.6 + uTime * 0.5),
      snoise(pos * 0.6 + uTime * 0.5 + 100.0)
    );

    // Rising motion: offset Y with time
    warpedPos.y -= uTime * 0.8;

    // Flame density from FBM
    float density = flameFBM(warpedPos * 0.4, bass, highs);

    // Bass controls flame intensity: quiet = smoldering, peaks = full blaze
    float threshold = mix(0.25, -0.05, bass);
    density = smoothstep(threshold, threshold + 0.35, density);

    // Fade flames at distance
    float heightFade = smoothstep(MAX_DIST, MAX_DIST * 0.3, t);
    density *= heightFade;

    if (density > 0.01) {
      // Core temperature: inner regions are white-hot
      float coreNoise = snoise(warpedPos * 1.2 + uTime * 0.3);
      float coreStrength = smoothstep(0.2, 0.6, coreNoise) * energy;

      // Depth coloring: near=white-hot, far=deep orange/red
      float depthT = t / MAX_DIST;
      vec3 localColor = mix(coreColor * (0.8 + coreStrength * 0.5), flameColor * 0.6, depthT);
      localColor += coreColor * coreStrength * 0.4;

      // Front-to-back compositing
      float alpha = density * stepSize * 4.0;
      alpha = min(alpha, 1.0);
      float weight = alpha * (1.0 - accAlpha);

      accColor += localColor * weight;
      accAlpha += weight;

      stepSize = 0.1;
    } else {
      stepSize = 0.15;
    }
  }

  vec3 col = accColor;

  // === BEAT PULSE: tempo-locked flame intensity ===
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.08;

  // === RISING EMBERS: particle field ===
  float emberCount = 5.0 + energy * 20.0;
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
  float vigScale = mix(0.68, 0.58, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = flameColor * 0.03;
  col = mix(vigTint, col, vignette);

  // === LIGHT LEAK ===
  col += lightLeak(p, uTime, energy, uOnsetSnap);

  // === BLOOM: aggressive for fire ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.3, 0.2, energy);
  float bloomAmount = max(0.0, lum - bloomThreshold) * 3.0;
  vec3 bloomColor = mix(col, vec3(1.0, 0.9, 0.7), 0.4);
  col += bloomColor * bloomAmount * 0.5;

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, energy);

  // === FILM GRAIN ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.04, 0.02, energy);
  col += filmGrain(uv, grainTime) * grainIntensity;

  // === LIFTED BLACKS (warm tint for fire) ===
  col = max(col, vec3(0.08, 0.04, 0.02));

  gl_FragColor = vec4(col, 1.0);
}
`;
