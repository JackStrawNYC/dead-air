/**
 * Liquid Light — fullscreen fragment shader.
 * Oil-on-glass aesthetic via multi-pass FBM domain warping.
 *
 * v6 additions: beat rings, dust motes, warp trails, key change flash,
 *   color afterglow, waveform ring, dynamic letterboxing (CSS).
 */

import { noiseGLSL } from "./noise";

export const liquidLightVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const liquidLightFrag = /* glsl */ `
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

// --- Cosine color palette ---
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

// --- FBM with flatness-controlled octave damping ---
float fbmFlat(vec3 p, float smoothness) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 6; i++) {
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5 * pow(smoothness, float(i) * 0.3);
  }
  return value;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // Bass camera shake
  float shakeX = snoise(vec3(uTime * 8.0, 0.0, 0.0)) * uBass * 0.004;
  float shakeY = snoise(vec3(0.0, uTime * 8.0, 0.0)) * uBass * 0.004;
  p += vec2(shakeX, shakeY);

  float energy = clamp(uEnergy, 0.0, 1.0);
  float complexity = mix(0.3, 1.0, energy);
  float tempoScale = uTempo / 120.0;
  float sectionSeed = uSectionIndex * 7.3;
  float sectionWarp = 1.0 + (uSectionProgress - 0.5) * 0.3;
  float t = uTime * (0.04 + uRms * 0.03) * tempoScale;
  float smoothness = 1.0 - uFlatness * 0.6;
  float grainAmount = uFlatness * 0.12;

  // Spectral contrast spatial shaping
  float normY = uv.y;
  float bandInfluence =
    uContrast0.x * smoothstep(0.15, 0.0, normY) +
    uContrast0.y * smoothstep(0.0, 0.15, normY) * smoothstep(0.3, 0.15, normY) +
    uContrast0.z * smoothstep(0.15, 0.3, normY) * smoothstep(0.5, 0.3, normY) +
    uContrast0.w * smoothstep(0.3, 0.5, normY) * smoothstep(0.65, 0.5, normY) +
    uContrast1.x * smoothstep(0.5, 0.65, normY) * smoothstep(0.8, 0.65, normY) +
    uContrast1.y * smoothstep(0.65, 0.8, normY) * smoothstep(0.95, 0.8, normY) +
    uContrast1.z * smoothstep(0.8, 1.0, normY);
  float contrastWarp = 0.5 + bandInfluence * 0.8;

  // ============ LAYER 1: Background ============
  vec3 bgQ = vec3(p * 0.4, t * 0.03 + sectionSeed);
  float bgNoise = fbm(bgQ);
  float bgHue = uPaletteSecondary + bgNoise * 0.15;
  vec3 bgCol = palette(bgHue, vec3(0.4), vec3(0.3), vec3(1.0), vec3(bgHue, bgHue + 0.33, bgHue + 0.67));
  bgCol *= 0.35 + energy * 0.15;

  // ============ LAYER 2: Midground (hero) ============
  float warpStrength = (0.5 + uBass * 0.5) * complexity * contrastWarp;
  vec3 q = vec3(p * 1.2 * sectionWarp, t * 0.2 + sectionSeed);
  float warpX = fbmFlat(q + vec3(1.7, 9.2, 0.0), smoothness);
  float warpY = fbmFlat(q + vec3(8.3, 2.8, 0.0), smoothness);
  vec2 warp1 = vec2(warpX, warpY) * warpStrength;

  float pass2Strength = (0.3 + uBass * 0.25) * complexity;
  vec3 r = vec3((p + warp1) * 1.6, t * 0.12 + sectionSeed * 0.5);
  float warp2X = fbmFlat(r + vec3(3.1, 4.7, t * 0.08), smoothness);
  float warp2Y = fbmFlat(r + vec3(6.5, 1.3, t * 0.06), smoothness);
  vec2 warp2 = vec2(warp2X, warp2Y) * pass2Strength;
  vec2 warped = p + warp1 + warp2;

  float n = fbmFlat(vec3(warped * 0.9, t * 0.15 + sectionSeed * 0.3), smoothness);

  // === CHROMATIC ABERRATION ===
  // Compute palette at 3 hue offsets for R/G/B channel separation
  float caAmount = uBass * 0.04 + length(p) * 0.015;
  float hue = uPalettePrimary + uChromaHue * 0.3 + t * 0.05;

  vec3 palA = vec3(0.5, 0.5, 0.5);
  vec3 palB = vec3(0.5, 0.5, 0.4);
  vec3 palC = vec3(1.0, 0.8, 0.7);

  // G channel: center hue
  vec3 dG = vec3(hue, hue + 0.33, hue + 0.67);
  vec3 midColG = palette(n * 0.7 + hue, palA, palB, palC, dG);

  // R channel: hue shifted inward
  float hueR = hue - caAmount;
  vec3 dR = vec3(hueR, hueR + 0.33, hueR + 0.67);
  vec3 midColR = palette(n * 0.7 + hueR, palA, palB, palC, dR);

  // B channel: hue shifted outward
  float hueB = hue + caAmount;
  vec3 dB = vec3(hueB, hueB + 0.33, hueB + 0.67);
  vec3 midColB = palette(n * 0.7 + hueB, palA, palB, palC, dB);

  // Composite: R from red-shifted, G from center, B from blue-shifted
  vec3 midCol = vec3(midColR.r, midColG.g, midColB.b);

  // Palette saturation
  float sat = mix(0.6, 1.0, energy) * uPaletteSaturation * (1.0 - uFlatness * 0.15);
  vec3 midGray = vec3(dot(midCol, vec3(0.299, 0.587, 0.114)));
  midCol = mix(midGray, midCol, sat);

  // Color temperature
  vec3 warmShift = vec3(1.12, 0.95, 0.82);
  vec3 coolShift = vec3(0.85, 0.95, 1.12);
  midCol *= mix(coolShift, warmShift, energy);

  float brightness = mix(0.35, 0.75, energy) + uRms * 0.2;
  midCol *= brightness;

  // ============ LAYER 3: Foreground ============
  float fgNoise = fbm3(vec3(warped * 3.0, t * 0.2 + sectionSeed * 1.7));
  float fgIntensity = uHighs * 0.18 * complexity;
  vec3 fgCol = vec3(fgNoise * 0.5 + 0.5) * vec3(0.8, 0.9, 1.0) * fgIntensity;

  // ============ COMPOSITE ============
  float bgMix = mix(0.4, 0.25, energy);
  float midMix = mix(0.5, 0.6, energy);
  float fgMix = mix(0.1, 0.18, energy);
  vec3 col = bgCol * bgMix + midCol * midMix + fgCol * fgMix;

  // Flatness grain
  float grain = snoise(vec3(p * 40.0, t * 2.0)) * grainAmount;
  col += grain * vec3(0.9, 0.85, 0.8);

  // Shimmer
  float shimmer = snoise(vec3(warped * 6.0, t * 1.0)) * 0.5 + 0.5;
  col += shimmer * uHighs * 0.05 * vec3(0.8, 0.9, 1.0);

  // === DUST MOTES: gentle floating particles during quiet passages ===
  float dustIntensity = smoothstep(0.35, 0.1, energy) * 0.1;
  if (dustIntensity > 0.001) {
    float dust1 = snoise(vec3(p * 15.0 + uTime * 0.05, uTime * 0.1));
    float dust2 = snoise(vec3(p * 20.0 - uTime * 0.03, uTime * 0.15 + 5.0));
    float dustParticle = max(0.0, dust1 * dust2 - 0.3) * 4.0;
    col += dustParticle * dustIntensity * vec3(1.0, 0.95, 0.85);
  }

  // === WARP SPEED TRAILS: radial lines during sustained peaks ===
  float warpIntensity = smoothstep(0.6, 0.9, energy) * 0.12;
  if (warpIntensity > 0.001) {
    float warpAngle = atan(p.y, p.x);
    float radialNoise = snoise(vec3(warpAngle * 10.0, length(p) * 3.0, uTime * 2.0));
    float trail = max(0.0, radialNoise - 0.5) * 2.0;
    float radialFade = smoothstep(0.1, 0.5, length(p));
    col += trail * warpIntensity * radialFade * vec3(0.9, 0.95, 1.0);
  }

  // === COLOR AFTERGLOW: lingering color from recent peaks ===
  float afterglowStrength = smoothstep(0.3, 0.7, energy) * 0.05;
  vec3 afterglowColor = 0.5 + 0.5 * cos(6.28318 * vec3(uAfterglowHue, uAfterglowHue + 0.33, uAfterglowHue + 0.67));
  col += afterglowColor * afterglowStrength;

  // === WAVEFORM RING: subtle spectrum circle, radius driven by contrast bands ===
  float wfAngle = atan(p.y, p.x);
  float wfR = length(p);
  float baseWfRadius = 0.3 + uRms * 0.1;
  float normAngle = (wfAngle + PI) / (2.0 * PI);
  float bandVal = 0.0;
  float bandIdx = normAngle * 7.0;
  int band = int(floor(bandIdx));
  if (band == 0) bandVal = uContrast0.x;
  else if (band == 1) bandVal = uContrast0.y;
  else if (band == 2) bandVal = uContrast0.z;
  else if (band == 3) bandVal = uContrast0.w;
  else if (band == 4) bandVal = uContrast1.x;
  else if (band == 5) bandVal = uContrast1.y;
  else bandVal = uContrast1.z;
  float wfRadius = baseWfRadius + bandVal * 0.08;
  float wfRing = smoothstep(0.006, 0.0, abs(wfR - wfRadius)) * 0.08 * energy;
  vec3 wfColor = 0.5 + 0.5 * cos(6.28318 * vec3(uPalettePrimary, uPalettePrimary + 0.33, uPalettePrimary + 0.67));
  col += wfRing * wfColor;

  // (beat/onset pulsing removed — unreliable detection for live music)

  // Section transition bloom
  float edgeDist = min(uSectionProgress, 1.0 - uSectionProgress);
  float sectionBloom = smoothstep(0.06, 0.0, edgeDist) * 0.1;
  col += sectionBloom * vec3(1.0, 0.98, 0.94);

  // Vignette (energy-driven, no beat pulse)
  float vigScale = mix(0.75, 0.55, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);

  // Colored vignette edges
  vec3 vigTint = 0.5 + 0.5 * cos(6.28318 * vec3(uPaletteSecondary, uPaletteSecondary + 0.33, uPaletteSecondary + 0.67));
  vigTint *= 0.03;
  col = mix(vigTint, col, vignette);

  // === LIGHT LEAK: warm amber glow from drifting edge ===
  col += lightLeak(p, uTime, energy, uOnsetSnap);

  // === BLOOM: bright pixel self-illumination ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.5, 0.35, energy);
  float bloomAmount = max(0.0, lum - bloomThreshold) * 2.5;
  vec3 bloomColor = mix(col, vec3(1.0, 0.98, 0.95), 0.3);
  col += bloomColor * bloomAmount * 0.35;

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, energy);

  // === FILM GRAIN: animated 2-frame hold ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.06, 0.02, energy);
  col += filmGrain(uv, grainTime) * grainIntensity;

  // Lifted blacks
  col = max(col, vec3(0.025, 0.018, 0.03));

  gl_FragColor = vec4(col, 1.0);
}
`;
