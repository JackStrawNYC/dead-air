/**
 * Stark Minimal — clean geometric abstraction.
 * High contrast, slow-moving shapes, mostly monochrome with accent color.
 * Best for contemplative/acoustic sections and low-energy passages.
 */

import { noiseGLSL } from "./noise";

export const starkMinimalVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const starkMinimalFrag = /* glsl */ `
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
uniform float uChromaShift;
uniform float uAfterglowHue;
uniform vec4 uContrast0;
uniform vec4 uContrast1;

varying vec2 vUv;

#define PI 3.14159265

// Signed distance to a circle
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

// Signed distance to a line segment
float sdLine(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float tempoScale = uTempo / 120.0;
  float sectionSeed = uSectionIndex * 3.14;
  float t = uTime * 0.03 * tempoScale;

  // Deep black background with subtle warm gradient
  float bgGrad = 1.0 - length(p) * 0.3;
  vec3 col = vec3(0.015, 0.012, 0.018) * bgGrad;

  // === GEOMETRIC ELEMENTS ===

  // Breathing circle — radius tied to RMS
  float circleR = 0.15 + uRms * 0.12 + sin(t * 2.0) * 0.02;
  float circleDist = sdCircle(p, circleR);
  float circleEdge = smoothstep(0.003, 0.0, abs(circleDist));
  float circleFill = smoothstep(0.02, 0.0, circleDist) * 0.03;

  // Accent color from palette (used sparingly)
  vec3 accentCol = 0.5 + 0.5 * cos(6.28318 * vec3(uPalettePrimary, uPalettePrimary + 0.33, uPalettePrimary + 0.67));
  vec3 accentGray = vec3(dot(accentCol, vec3(0.299, 0.587, 0.114)));
  accentCol = mix(accentGray, accentCol, uPaletteSaturation * 0.7); // Reduced saturation

  col += circleEdge * vec3(0.5, 0.48, 0.45) * 0.4; // Thin white circle outline
  col += circleFill * accentCol * energy; // Subtle accent fill

  // Concentric rings — expand on beats
  float ringExpand = uBeatSnap * 0.08;
  for (int i = 1; i <= 3; i++) {
    float fi = float(i);
    float ringR = circleR + fi * 0.08 + ringExpand * fi;
    float ringDist = sdCircle(p, ringR);
    float ringEdge = smoothstep(0.002, 0.0, abs(ringDist));
    float ringAlpha = 0.15 / fi; // Fades with distance
    col += ringEdge * vec3(0.35, 0.33, 0.30) * ringAlpha;
  }

  // Rotating line — sweeps slowly, brightens on mids
  float lineAngle = t * 0.5 + sectionSeed;
  float lineLen = 0.35 + uMids * 0.15;
  vec2 lineDir = vec2(cos(lineAngle), sin(lineAngle));
  float lineDist = sdLine(p, -lineDir * lineLen, lineDir * lineLen);
  float lineEdge = smoothstep(0.002, 0.0, abs(lineDist - 0.001));
  col += lineEdge * vec3(0.3, 0.28, 0.25) * 0.3;

  // Cross-hair at center — subtle
  float crossH = smoothstep(0.001, 0.0, abs(p.y)) * smoothstep(0.06, 0.04, abs(p.x));
  float crossV = smoothstep(0.001, 0.0, abs(p.x)) * smoothstep(0.06, 0.04, abs(p.y));
  col += (crossH + crossV) * vec3(0.2, 0.19, 0.17) * 0.15;

  // === SLOW NOISE FIELD: very subtle background texture ===
  float noiseField = fbm(vec3(p * 2.0, t * 0.2 + sectionSeed));
  col += noiseField * 0.015 * vec3(0.8, 0.75, 0.7);

  // === CENTROID-DRIVEN GLOW: brighter when treble-heavy ===
  float centroidGlow = uCentroid * 0.04;
  float glowDist = length(p);
  float glow = exp(-glowDist * 4.0) * centroidGlow;
  col += glow * accentCol;

  // === SECTION TRANSITION: horizontal wipe line ===
  float edgeDist = min(uSectionProgress, 1.0 - uSectionProgress);
  float wipeLine = smoothstep(0.04, 0.0, edgeDist);
  float wipeY = mix(-0.5, 0.5, uSectionProgress) * aspect.y;
  float wipeEdge = smoothstep(0.003, 0.0, abs(p.y - wipeY)) * wipeLine;
  col += wipeEdge * vec3(0.4, 0.38, 0.35) * 0.5;

  // Subtle vignette
  float vig = 1.0 - dot(p * 0.7, p * 0.7);
  vig = smoothstep(0.0, 1.0, vig);
  col *= mix(0.7, 1.0, vig);

  // Very light grain
  float grainTime = floor(uTime * 15.0) / 15.0;
  col += filmGrain(uv, grainTime) * 0.03;

  // Lifted blacks (cold)
  col = max(col, vec3(0.08, 0.065, 0.085));

  gl_FragColor = vec4(col, 1.0);
}
`;
