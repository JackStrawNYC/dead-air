/**
 * Cosmic Dust — starfield with slow cosmic drift and nebula clouds.
 * Works well for Space/quiet passages. Deep, contemplative visuals.
 * Audio-reactive: energy brightens stars, onset creates shooting stars.
 */

import { noiseGLSL } from "./noise";

export const cosmicDustVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const cosmicDustFrag = /* glsl */ `
precision highp float;

${noiseGLSL}

uniform float uTime;
uniform float uDynamicTime;
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
uniform vec4 uContrast0;
uniform vec4 uContrast1;
uniform float uCoherence;
uniform float uFastEnergy;
uniform float uFastBass;
uniform float uDrumOnset;
uniform float uDrumBeat;
uniform float uSpectralFlux;

varying vec2 vUv;

#define PI 3.14159265

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Hash for star positions
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

// Star field layer
float starField(vec2 uv, float scale, float brightness) {
  vec2 id = floor(uv * scale);
  vec2 f = fract(uv * scale) - 0.5;

  float stars = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cellId = id + neighbor;
      float h = hash(cellId);
      if (h > 0.92) { // ~8% of cells have stars
        vec2 starPos = neighbor + vec2(hash(cellId + 0.1), hash(cellId + 0.2)) - 0.5 - f;
        float d = length(starPos);
        float twinkle = 0.7 + 0.3 * sin(uTime * (2.0 + h * 3.0) + h * 100.0);
        float star = smoothstep(0.05 * brightness, 0.0, d) * twinkle;
        // Color variation
        float colorVar = hash(cellId + 0.3);
        stars += star * (0.5 + colorVar * 0.5);
      }
    }
  }
  return stars;
}

// Nebula cloud (FBM-based)
float nebula(vec2 uv, float t) {
  float v = 0.0;
  float a = 0.5;
  vec3 p = vec3(uv, t * 0.05);
  for (int i = 0; i < 5; i++) {
    v += a * (snoise(p) * 0.5 + 0.5);
    p = p * 2.1 + vec3(0.0, 0.0, t * 0.02);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
  float t = uDynamicTime * 0.08;

  // Slow cosmic drift
  vec2 drift = vec2(t * 0.1, t * 0.05);
  vec2 starUv = uv + drift;

  // Star layers at different depths (parallax: different speeds per layer)
  float stars = 0.0;
  vec2 parallax1 = starUv;
  vec2 parallax2 = starUv * 1.1 + drift * 0.3 + 5.0;  // medium depth — slower
  vec2 parallax3 = starUv * 0.8 + drift * 0.1 + 10.0;  // far depth — slowest
  stars += starField(parallax1, 30.0, 1.0) * 0.6;
  stars += starField(parallax2, 50.0, 0.7) * 0.3;
  stars += starField(parallax3, 80.0, 0.5) * 0.15;

  // Energy brightens stars
  stars *= 0.7 + uEnergy * 0.6 + uFastEnergy * 0.2;

  // === STAR GLOW: diffraction spikes (4-point cross) on bright stars ===
  float spikeStar = starField(parallax1, 30.0, 1.0);
  if (spikeStar > 0.3) {
    // Find approximate star center from grid
    vec2 spikeCenter = (floor(parallax1 * 30.0) + 0.5) / 30.0;
    vec2 toStar = uv - spikeCenter;
    // 4-point cross spikes
    float spikeH = exp(-abs(toStar.y) * 200.0) * exp(-abs(toStar.x) * 20.0);
    float spikeV = exp(-abs(toStar.x) * 200.0) * exp(-abs(toStar.y) * 20.0);
    float spikes = (spikeH + spikeV) * spikeStar * 0.15;
    stars += spikes;
  }

  // === VOLUMETRIC NEBULA: raymarched dust clouds (4-step accumulation) ===
  vec3 nebColor1 = hsv2rgb(vec3(uPalettePrimary, 0.6 * uPaletteSaturation, 0.25));
  vec3 nebColor2 = hsv2rgb(vec3(uPaletteSecondary, 0.5 * uPaletteSaturation, 0.20));

  vec3 nebulaMix = vec3(0.0);
  float nebAlpha = 0.0;
  for (int s = 0; s < 4; s++) {
    float fs = float(s);
    float depth = 0.8 + fs * 0.4;
    vec2 sampleUv = uv * (0.6 + fs * 0.15) + drift * (0.5 - fs * 0.1);
    float density = nebula(sampleUv, uDynamicTime + fs * 50.0);
    density = smoothstep(0.25, 0.7, density);
    float layerAlpha = density * 0.3 * (1.0 - nebAlpha);
    vec3 layerColor = mix(nebColor1, nebColor2, fs / 3.0 + density * 0.2);
    // Depth-dependent brightness (further = dimmer)
    layerColor *= 1.0 / depth;
    nebulaMix += layerColor * layerAlpha;
    nebAlpha += layerAlpha;
  }

  // Bass makes nebula pulse
  nebulaMix *= 0.8 + uBass * 0.5;

  // Background deep space gradient
  float bgGrad = smoothstep(1.5, 0.0, length(uv));
  vec3 bgColor = hsv2rgb(vec3(uPalettePrimary + 0.15, 0.3, 0.03)) * bgGrad;

  // Combine layers
  vec3 color = bgColor + nebulaMix + vec3(stars);

  // === CLIMAX REACTIVITY ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Onset: shooting star flash (amplified)
  float shootAngle = uTime * 0.5 + uSectionIndex * 2.0;
  vec2 shootDir = vec2(cos(shootAngle), sin(shootAngle));
  float shootTrail = smoothstep(0.02, 0.0, abs(dot(uv - shootDir * 0.3, vec2(-shootDir.y, shootDir.x))));
  shootTrail *= smoothstep(0.8, 0.0, length(uv - shootDir * 0.3));
  color += shootTrail * uOnsetSnap * 0.8 * (1.0 + climaxBoost * 0.5);

  // Beat: pulse on nebula brightness (amplified + beat snap)
  float bp = beatPulse(uMusicalTime);
  color *= 1.0 + bp * 0.20 + climaxBoost * bp * 0.12;
  color *= 1.0 + max(uBeatSnap, uDrumBeat) * 0.20 * (1.0 + climaxBoost * 0.4);

  // Vignette — subtle
  float vig = 1.0 - smoothstep(0.8, 1.6, length(uv));
  color *= 0.3 + vig * 0.7;

  // === ANIMATED STAGE FLOOD: flowing palette noise in dark areas ===
  color = stageFloodFill(color, uv, uDynamicTime, uEnergy, uPalettePrimary, uPaletteSecondary);

  // === ANAMORPHIC FLARE: horizontal light streak ===
  color = anamorphicFlare(vUv, color, uEnergy, uOnsetSnap);

  // === HALATION: warm film bloom ===
  color = halation(vUv, color, uEnergy);

  // === CINEMATIC GRADE (ACES filmic tone mapping) ===
  color = cinematicGrade(color, uEnergy);

  // ONSET SATURATION PULSE: push colors away from gray (psychedelic, not white)
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(onsetLuma), color, 1.0 + onsetPulse * 1.0);
  color *= 1.0 + onsetPulse * 0.12;

  // ONSET CHROMATIC ABERRATION
  if (uOnsetSnap > 0.4) {
    float caAmt = (uOnsetSnap - 0.4) * 0.15;
    color.r *= 1.0 + caAmt;
    color.b *= 1.0 - caAmt * 0.5;
  }

  // Lifted blacks
  color = max(color, vec3(0.06, 0.05, 0.08));

  gl_FragColor = vec4(color, 1.0);
}
`;
