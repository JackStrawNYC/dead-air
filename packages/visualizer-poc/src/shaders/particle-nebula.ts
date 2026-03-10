/**
 * Particle Nebula — vertex + fragment shaders for THREE.Points.
 * 8K particles in golden-ratio sphere distribution.
 *
 * v6 additions: distance fog, key change flash, color afterglow.
 */

import { noiseGLSL } from "./noise";

export const particleNebulaVert = /* glsl */ `
${noiseGLSL}

uniform float uTime;
uniform float uBass;
uniform float uMids;
uniform float uHighs;
uniform float uOnset;
uniform float uBeat;
uniform float uRms;
uniform float uEnergy;
uniform float uFlatness;
uniform float uSectionProgress;
uniform float uSectionIndex;
uniform float uTempo;
uniform float uOnsetSnap;
uniform float uBeatSnap;
uniform float uMusicalTime;
uniform float uFastEnergy;
uniform float uFastBass;
uniform float uDrumOnset;
uniform float uDrumBeat;
uniform float uSpectralFlux;

attribute float aRadius;
attribute float aTheta;
attribute float aPhi;
attribute float aRandom;

varying float vAlpha;
varying float vColorMix;
varying float vDist;
varying float vEnergy;
varying float vOnsetSnap;

void main() {
  float energy = clamp(uEnergy, 0.0, 1.0);
  float tempoScale = uTempo / 120.0;

  float r = aRadius;
  r *= mix(0.3, 1.5, energy);
  r *= 1.0 + uBass * 0.3;

  // Beat pulse for orbit modulation
  float bp = beatPulse(uMusicalTime);

  // === BEAT SNAP: radius pulse on transients ===
  r *= 1.0 + max(uBeatSnap, uDrumBeat) * 0.20;
  r *= 1.0 + uOnsetSnap * 0.08 + uDrumOnset * 0.12;

  // Tempo-aware orbit (amplified beat pulse)
  float orbitSpeed = (mix(0.02, 0.06, energy) + uMids * 0.04) * tempoScale * (1.0 + bp * 0.20);
  float theta = aTheta + uTime * orbitSpeed * (0.5 + aRandom * 0.5);
  float phi = aPhi + uTime * orbitSpeed * 0.2 * (aRandom - 0.5);

  // Flatness-driven jitter (single noise call, split across theta/phi)
  float jitterAmount = uFlatness * 0.15 + uHighs * 0.04;
  float sectionOffset = uSectionIndex * 3.7;
  float jitterNoise = snoise(vec3(aRandom * 100.0, uTime * 0.5, sectionOffset));
  theta += jitterNoise * jitterAmount * aRandom;
  phi += jitterNoise * jitterAmount * (1.0 - aRandom);

  vec3 pos = vec3(
    r * sin(phi) * cos(theta),
    r * sin(phi) * sin(theta),
    r * cos(phi)
  );

  float noiseDisp = snoise(vec3(pos * 0.5 + uTime * 0.1)) * 0.15;
  pos += normalize(pos) * noiseDisp;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  // Motion stretch: energy + beat reactive
  float velocity = uBass * 0.5 + energy * 0.3 + uBeatSnap * 0.3;
  float motionStretch = 1.0 + velocity * 0.5;

  float baseSize = mix(1.5, 4.5, energy) + uRms * 3.0 + uOnsetSnap * 2.0;
  gl_PointSize = baseSize * motionStretch * (200.0 / -mvPosition.z);

  gl_Position = projectionMatrix * mvPosition;

  vAlpha = mix(0.08, 0.45, energy) + uRms * 0.4 - aRadius * 0.08;
  vAlpha = clamp(vAlpha, 0.05, 0.9);
  vColorMix = aRandom;
  vDist = length(mvPosition.xyz);
  vEnergy = energy;
  vOnsetSnap = uOnsetSnap;
}
`;

export const particleNebulaFrag = /* glsl */ `
precision highp float;

// Film grain helper
vec3 filmGrain(vec2 uv, float grainTime) {
  float n = fract(sin(dot(uv * 1000.0, vec2(12.9898, 78.233)) + grainTime * 43758.5453) * 43758.5453);
  n = (n - 0.5) * 2.0;
  return n * vec3(1.0, 0.95, 0.85);
}

// HSV-to-cosine hue correction (see noise.ts for explanation)
float hsvToCosineHue(float h) { return 1.0 - h; }

// S-curve grading: hue-preserving tone mapping
vec3 sCurveGrade(vec3 col, float energy) {
  float maxC = max(col.r, max(col.g, col.b));
  float excess = 0.0;
  if (maxC > 1.0) {
    excess = min(maxC - 1.0, 3.0);
    col /= maxC;
  }
  col = max(col, vec3(0.0));
  vec3 curved = col * col * (3.0 - 2.0 * col);
  float amount = mix(0.3, 0.6, energy);
  col = mix(col, curved, amount);
  col = 1.0 - exp(-col * (1.2 + energy * 0.3));
  if (excess > 0.0) {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, 1.0 + excess * 0.6);
  }
  return col;
}

uniform float uCentroid;
uniform float uRms;
uniform float uEnergy;
uniform float uChromaHue;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform float uSectionProgress;
uniform float uBeatSnap;
uniform float uMusicalTime;
uniform float uOnsetSnap;
uniform float uBass;
uniform float uChromaShift;
uniform float uAfterglowHue;
uniform float uClimaxPhase;
uniform float uClimaxIntensity;
uniform float uCoherence;
uniform float uFastEnergy;
uniform float uDrumOnset;

varying float vAlpha;
varying float vColorMix;
varying float vDist;
varying float vEnergy;
varying float vOnsetSnap;

void main() {
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);
  if (dist > 0.5) discard;

  float glow = 1.0 - smoothstep(0.0, 0.5, dist);
  glow *= glow;

  // === CHROMATIC ABERRATION: hue-offset for R/G/B channels ===
  float caAmount = uBass * 0.03 + vEnergy * 0.015 + uOnsetSnap * 0.04 + uDrumOnset * 0.05;

  float hueCenter = hsvToCosineHue(uPalettePrimary) + uChromaHue * 0.25 + vColorMix * 0.3;
  float hueR = hueCenter - caAmount;
  float hueB = hueCenter + caAmount;

  vec3 cR = vec3(hueR, hueR + 0.33, hueR + 0.67);
  vec3 rgbR = 0.5 + 0.5 * cos(6.28318 * (cR + vec3(0.0, 0.33, 0.67)));

  vec3 cG = vec3(hueCenter, hueCenter + 0.33, hueCenter + 0.67);
  vec3 rgbG = 0.5 + 0.5 * cos(6.28318 * (cG + vec3(0.0, 0.33, 0.67)));

  vec3 cB = vec3(hueB, hueB + 0.33, hueB + 0.67);
  vec3 rgbB = 0.5 + 0.5 * cos(6.28318 * (cB + vec3(0.0, 0.33, 0.67)));

  vec3 rgb = vec3(rgbR.r, rgbG.g, rgbB.b);

  // Secondary palette blend
  float secHue = hsvToCosineHue(uPaletteSecondary) + vColorMix * 0.2;
  vec3 secRgb = 0.5 + 0.5 * cos(6.28318 * (vec3(secHue, secHue + 0.33, secHue + 0.67)));
  rgb = mix(rgb, secRgb, vColorMix * 0.3);

  // Color temperature
  vec3 warmShift = vec3(1.12, 0.95, 0.82);
  vec3 coolShift = vec3(0.85, 0.95, 1.12);
  rgb *= mix(coolShift, warmShift, vEnergy);

  // Warm shift
  rgb = mix(rgb, rgb * vec3(1.1, 0.95, 0.9), 0.2);

  // Palette saturation
  float sat = mix(0.6, 1.0, vEnergy) * uPaletteSaturation;
  vec3 gray = vec3(dot(rgb, vec3(0.299, 0.587, 0.114)));
  rgb = mix(gray, rgb, sat);

  // Section bloom
  float edgeDist = min(uSectionProgress, 1.0 - uSectionProgress);
  float sectionBloom = smoothstep(0.06, 0.0, edgeDist) * 0.15;
  rgb += sectionBloom * vec3(1.0, 0.98, 0.95);

  // === BEAT SNAP: particle brightness flash ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  rgb *= 1.0 + uBeatSnap * 0.30 * (1.0 + climaxBoost * 0.5);
  rgb *= 1.0 + vOnsetSnap * 0.12;

  float distFade = 1.0 / (1.0 + vDist * 0.05);
  float alpha = glow * vAlpha * distFade;

  rgb *= mix(0.40, 0.78, vEnergy) + uRms * 0.3 + uFastEnergy * 0.15;

  // === DISTANCE FOG: quiet = thick/intimate, loud = clear/vast ===
  float fogDensity = mix(0.15, 0.02, vEnergy);
  float fogAmount = 1.0 - exp(-fogDensity * vDist * vDist);
  vec3 fogColor = vec3(0.02, 0.02, 0.04);
  rgb = mix(rgb, fogColor, fogAmount);

  // === COLOR AFTERGLOW ===
  float afterglowStr = smoothstep(0.3, 0.7, vEnergy) * 0.04;
  float agHue = hsvToCosineHue(uAfterglowHue);
  vec3 afterglowCol = 0.5 + 0.5 * cos(6.28318 * vec3(agHue, agHue + 0.33, agHue + 0.67));
  rgb += afterglowCol * afterglowStr;

  // === BLOOM: bright particle self-illumination (climax-amplified) ===
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  float bThresh = 0.4 - climaxBoost * 0.08;
  float bloomAmount = max(0.0, lum - bThresh) * (2.0 + climaxBoost * 1.5);
  vec3 bloomColor = mix(rgb, vec3(1.0, 0.98, 0.95), 0.3);
  vec3 bloom = bloomColor * bloomAmount * (0.25 + climaxBoost * 0.15);
  rgb = rgb + bloom - rgb * bloom; // screen blend

  // ONSET SATURATION PULSE: push colors away from gray (psychedelic, not white)
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(vec3(onsetLuma), rgb, 1.0 + onsetPulse * 1.0);
  rgb *= 1.0 + onsetPulse * 0.12;

  // === S-CURVE COLOR GRADING ===
  rgb = sCurveGrade(rgb, vEnergy);

  // === FILM GRAIN (per-particle, using gl_PointCoord) ===
  float grainTime = floor(uRms * 50.0) / 50.0;
  float grainIntensity = mix(0.04, 0.01, vEnergy);
  rgb += filmGrain(gl_PointCoord, grainTime) * grainIntensity;

  gl_FragColor = vec4(rgb, alpha);
}
`;
