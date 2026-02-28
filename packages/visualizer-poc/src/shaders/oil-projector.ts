/**
 * Oil Projector — overhead projector oil-lamp aesthetic.
 * Large colorful blobs morphing slowly, high saturation, 1960s light show feel.
 * Best for classic-era shows and mid-energy psychedelic passages.
 */

import { noiseGLSL } from "./noise";

export const oilProjectorVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const oilProjectorFrag = /* glsl */ `
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

// Oil blob: smooth step threshold of FBM creates distinct blob edges
float oilBlob(vec3 p, float threshold) {
  float n = fbm6(p);
  return smoothstep(threshold - 0.08, threshold + 0.08, n);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float tempoScale = uTempo / 120.0;
  float sectionSeed = uSectionIndex * 4.3;
  float t = uTime * 0.02 * tempoScale; // Very slow — oil moves lazily

  // Bass camera shake (gentle — projector on a table)
  float shakeX = snoise(vec3(uTime * 4.0, 0.0, sectionSeed)) * uBass * 0.002;
  float shakeY = snoise(vec3(0.0, uTime * 4.0, sectionSeed)) * uBass * 0.002;
  p += vec2(shakeX, shakeY);

  // === LAYER 1: Dark warm base (overhead projector glass) ===
  vec3 col = vec3(0.02, 0.015, 0.01);

  // === LAYER 2: Primary oil blob (largest, slowest) ===
  vec3 blob1Pos = vec3(p * 0.5, t * 0.3 + sectionSeed);
  // Warp for organic movement
  float w1x = fbm(blob1Pos + vec3(3.1, 7.2, 0.0));
  float w1y = fbm(blob1Pos + vec3(8.4, 1.9, 0.0));
  vec3 warped1 = vec3(p + vec2(w1x, w1y) * (0.4 + uBass * 0.2), t * 0.25);

  float blob1 = oilBlob(warped1 * 0.7, 0.05);
  float hue1 = uPalettePrimary + uChromaHue * 0.2;
  vec3 col1 = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  col1 *= mix(0.7, 1.0, energy);

  // === LAYER 3: Secondary oil blob (smaller, offset) ===
  vec3 blob2Pos = vec3(p * 0.6 + vec2(0.3, -0.2), t * 0.35 + sectionSeed * 0.7);
  float w2x = fbm(blob2Pos + vec3(5.5, 2.1, 0.0));
  float w2y = fbm(blob2Pos + vec3(1.3, 6.8, 0.0));
  vec3 warped2 = vec3(p + vec2(w2x, w2y) * (0.35 + uMids * 0.15), t * 0.3);

  float blob2 = oilBlob(warped2 * 0.8, 0.1);
  float hue2 = uPaletteSecondary + uChromaHue * 0.15 + 0.15;
  vec3 col2 = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));
  col2 *= mix(0.6, 0.9, energy);

  // === LAYER 4: Tertiary blob (smallest, fastest, accent) ===
  vec3 blob3Pos = vec3(p * 0.8 + vec2(-0.15, 0.25), t * 0.45 + sectionSeed * 1.3);
  float w3x = fbm3(blob3Pos + vec3(2.7, 4.4, 0.0));
  float w3y = fbm3(blob3Pos + vec3(7.1, 3.2, 0.0));
  vec3 warped3 = vec3(p + vec2(w3x, w3y) * (0.25 + uHighs * 0.1), t * 0.4);

  float blob3 = oilBlob(warped3 * 1.0, 0.15);
  float hue3 = uPalettePrimary + 0.5; // Complementary
  vec3 col3 = 0.5 + 0.5 * cos(6.28318 * vec3(hue3, hue3 + 0.33, hue3 + 0.67));
  col3 *= mix(0.5, 0.8, energy);

  // === COMPOSITE: additive blending (like real oil projector) ===
  col += col1 * blob1 * 0.5;
  col += col2 * blob2 * 0.4;
  col += col3 * blob3 * 0.3;

  // Blob overlap creates white-hot regions (additive)
  float overlap = blob1 * blob2 * 0.15 + blob2 * blob3 * 0.1 + blob1 * blob3 * 0.1;
  col += overlap * vec3(1.0, 0.95, 0.85) * energy;

  // Palette saturation
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 gray = vec3(lum);
  col = mix(gray, col, mix(0.7, 1.0, uPaletteSaturation));

  // === EDGE DARKENING: circular mask (projector lens falloff) ===
  float lensDist = length(p);
  float lensFalloff = smoothstep(0.7, 0.3, lensDist);
  col *= lensFalloff;

  // === GLASS TEXTURE: subtle refractive noise ===
  float glassTex = snoise(vec3(p * 8.0, uTime * 0.05)) * 0.02;
  col += glassTex * vec3(0.9, 0.85, 0.8);

  // === COLOR AFTERGLOW ===
  float afterglowStr = smoothstep(0.3, 0.6, energy) * 0.04;
  vec3 afterglowCol = 0.5 + 0.5 * cos(6.28318 * vec3(uAfterglowHue, uAfterglowHue + 0.33, uAfterglowHue + 0.67));
  col += afterglowCol * afterglowStr;

  // Light leak
  col += lightLeak(p, uTime, energy * 0.6, uOnsetSnap);

  // S-curve grading
  col = sCurveGrade(col, energy);

  // Film grain (moderate)
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.08, 0.04, energy);
  col += filmGrain(uv, grainTime) * grainIntensity;

  // Lifted blacks (warm)
  col = max(col, vec3(0.08, 0.065, 0.085));

  gl_FragColor = vec4(col, 1.0);
}
`;
