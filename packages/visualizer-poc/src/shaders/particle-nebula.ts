/**
 * Particle Nebula — vertex + fragment shaders for THREE.Points.
 * 15K particles in golden-ratio sphere distribution.
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
  r *= mix(0.7, 1.3, energy);
  r *= 1.0 + uBass * 0.3;

  // (beat/onset pulsing removed — unreliable for live music)

  // Tempo-aware orbit
  float orbitSpeed = (mix(0.008, 0.025, energy) + uMids * 0.015) * tempoScale;
  float theta = aTheta + uTime * orbitSpeed * (0.5 + aRandom * 0.5);
  float phi = aPhi + uTime * orbitSpeed * 0.2 * (aRandom - 0.5);

  // Flatness-driven jitter
  float jitterAmount = uFlatness * 0.15 + uHighs * 0.04;
  float sectionOffset = uSectionIndex * 3.7;
  theta += snoise(vec3(aRandom * 100.0, uTime * 0.5, sectionOffset)) * jitterAmount * aRandom;
  phi += snoise(vec3(sectionOffset, aRandom * 100.0, uTime * 0.5)) * jitterAmount * aRandom;

  vec3 pos = vec3(
    r * sin(phi) * cos(theta),
    r * sin(phi) * sin(theta),
    r * cos(phi)
  );

  float noiseDisp = snoise(vec3(pos * 0.5 + uTime * 0.1)) * 0.15;
  pos += normalize(pos) * noiseDisp;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  // Motion stretch: energy-driven (smooth, no beat pulsing)
  float velocity = uBass * 0.5 + energy * 0.3;
  float motionStretch = 1.0 + velocity * 0.5;

  float baseSize = mix(1.5, 4.5, energy) + uRms * 3.0;
  gl_PointSize = baseSize * motionStretch * (200.0 / -mvPosition.z);

  gl_Position = projectionMatrix * mvPosition;

  vAlpha = mix(0.15, 0.5, energy) + uRms * 0.4 - aRadius * 0.08;
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

// S-curve grading helper
vec3 sCurveGrade(vec3 col, float energy) {
  col = clamp(col, 0.0, 1.0);
  vec3 curved = col * col * (3.0 - 2.0 * col);
  float amount = mix(0.3, 0.6, energy);
  col = mix(col, curved, amount);
  col = 1.0 - exp(-col * (1.2 + energy * 0.3));
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
uniform float uOnsetSnap;
uniform float uBass;
uniform float uChromaShift;
uniform float uAfterglowHue;

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
  float caAmount = uBass * 0.03 + vEnergy * 0.015;

  float hueCenter = uPalettePrimary + uChromaHue * 0.25 + vColorMix * 0.3;
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
  float secHue = uPaletteSecondary + vColorMix * 0.2;
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

  // (beat/onset pulsing removed — smooth energy drives everything)

  float distFade = 1.0 / (1.0 + vDist * 0.05);
  float alpha = glow * vAlpha * distFade;

  rgb *= mix(0.5, 0.8, vEnergy) + uRms * 0.3;

  // === DISTANCE FOG: quiet = thick/intimate, loud = clear/vast ===
  float fogDensity = mix(0.15, 0.02, vEnergy);
  float fogAmount = 1.0 - exp(-fogDensity * vDist * vDist);
  vec3 fogColor = vec3(0.02, 0.02, 0.04);
  rgb = mix(rgb, fogColor, fogAmount);

  // === COLOR AFTERGLOW ===
  float afterglowStr = smoothstep(0.3, 0.7, vEnergy) * 0.04;
  vec3 afterglowCol = 0.5 + 0.5 * cos(6.28318 * vec3(uAfterglowHue, uAfterglowHue + 0.33, uAfterglowHue + 0.67));
  rgb += afterglowCol * afterglowStr;

  // === BLOOM: bright particle self-illumination ===
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  float bloomAmount = max(0.0, lum - 0.4) * 2.0;
  vec3 bloomColor = mix(rgb, vec3(1.0, 0.98, 0.95), 0.3);
  rgb += bloomColor * bloomAmount * 0.25;

  // === S-CURVE COLOR GRADING ===
  rgb = sCurveGrade(rgb, vEnergy);

  // === FILM GRAIN (per-particle, using gl_PointCoord) ===
  float grainTime = floor(uRms * 50.0) / 50.0;
  float grainIntensity = mix(0.04, 0.01, vEnergy);
  rgb += filmGrain(gl_PointCoord, grainTime) * grainIntensity;

  gl_FragColor = vec4(rgb, alpha);
}
`;
