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
uniform float uMusicalTime;
uniform float uChromaShift;
uniform float uAfterglowHue;
uniform float uClimaxPhase;
uniform float uClimaxIntensity;
uniform vec4 uContrast0;
uniform vec4 uContrast1;
uniform vec4 uChroma0;
uniform vec4 uChroma1;
uniform vec4 uChroma2;
uniform vec2 uCamOffset;
uniform float uJamDensity;

varying vec2 vUv;

#define PI 3.14159265

// --- Cosine color palette ---
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

// --- FBM with flatness-controlled octave damping ---
// Octave count modulated by jam density: sparse exploration (3) → dense peak (6)
// At neutral density (0.5) this produces 5 octaves, matching the original behavior.
float fbmFlat(vec3 p, float smoothness) {
  int octaves = int(mix(3.0, 7.0, uJamDensity));
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
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
  float complexity = mix(0.5, 1.0, energy);
  float tempoScale = uTempo / 120.0;
  float sectionSeed = uSectionIndex * 7.3;
  float sectionWarp = 1.0 + (uSectionProgress - 0.5) * 0.3;
  float t = uTime * (0.08 + uRms * 0.02) * tempoScale;
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
  // fbm3 (3 octaves) suffices — background gets dominated by warp passes
  vec3 bgQ = vec3(p * 0.4, t * 0.03 + sectionSeed);
  float bgNoise = fbm3(bgQ);
  float bgHue = hsvToCosineHue(uPaletteSecondary) + bgNoise * 0.15;
  vec3 bgCol = palette(bgHue, vec3(0.4), vec3(0.3), vec3(1.0), vec3(bgHue, bgHue + 0.33, bgHue + 0.67));
  bgCol *= 0.65 + energy * 0.08;

  // ============ LAYER 2: Midground (hero) ============
  float warpStrength = (0.7 + uBass * 0.8) * complexity * contrastWarp;
  vec3 q = vec3(p * 1.2 * sectionWarp, t * 0.2 + sectionSeed);
  float warpX = fbmFlat(q + vec3(1.7, 9.2, 0.0), smoothness);
  float warpY = fbmFlat(q + vec3(8.3, 2.8, 0.0), smoothness);
  vec2 warp1 = vec2(warpX, warpY) * warpStrength;

  vec2 warped = p + warp1;

  float n = fbmFlat(vec3(warped * 0.9, t * 0.15 + sectionSeed * 0.3), smoothness);

  // === CHROMATIC ABERRATION (aggressive) ===
  // Compute palette at 3 hue offsets for R/G/B channel separation
  float caAmount = uBass * 0.08 + length(p) * 0.025 + uOnsetSnap * 0.04;
  float hue = hsvToCosineHue(uPalettePrimary) + uChromaHue * 0.3 + t * 0.05;

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

  // Multi-chroma domain warping: harmonic content adds multi-colored regions
  // instead of single-hue uChromaHue, the oil-on-glass gains harmonic complexity
  vec3 chromaInfluence = chromaColor(warped * 0.5, uChroma0, uChroma1, uChroma2, energy);
  midCol = mix(midCol, midCol + chromaInfluence * 0.6, 0.2);

  // Palette saturation — vivid, not washed out
  float sat = mix(0.92, 1.25, energy) * uPaletteSaturation * (1.0 - uFlatness * 0.08);
  vec3 midGray = vec3(dot(midCol, vec3(0.299, 0.587, 0.114)));
  midCol = mix(midGray, midCol, sat);

  // Color temperature (warm at peaks, cool at rest)
  vec3 warmShift = vec3(1.10, 0.95, 0.88);
  vec3 coolShift = vec3(0.90, 0.97, 1.10);
  midCol *= mix(coolShift, warmShift, energy);

  float brightness = mix(0.45, 1.10, energy);
  midCol *= brightness;

  // ============ LAYER 3: Foreground ============
  float fgNoise = fbm3(vec3(warped * 3.0, t * 0.2 + sectionSeed * 1.7));
  float fgIntensity = uHighs * 0.18 * complexity;
  vec3 fgCol = vec3(fgNoise * 0.5 + 0.5) * vec3(0.8, 0.9, 1.0) * fgIntensity;

  // ============ COMPOSITE (hero-dominant) ============
  float bgMix = mix(0.25, 0.15, energy);
  float midMix = mix(0.62, 0.72, energy);
  float fgMix = mix(0.13, 0.18, energy);
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
  float agHue = hsvToCosineHue(uAfterglowHue);
  vec3 afterglowColor = 0.5 + 0.5 * cos(6.28318 * vec3(agHue, agHue + 0.33, agHue + 0.67));
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
  float wfHue = hsvToCosineHue(uPalettePrimary);
  vec3 wfColor = 0.5 + 0.5 * cos(6.28318 * vec3(wfHue, wfHue + 0.33, wfHue + 0.67));
  col += wfRing * wfColor;

  // === SDF STEALIE: emerges from the liquid light ===
  {
    float stHue1 = hsvToCosineHue(uPalettePrimary);
    float stHue2 = hsvToCosineHue(uPaletteSecondary);
    vec3 palCol1 = 0.5 + 0.5 * cos(6.28318 * vec3(stHue1, stHue1 + 0.33, stHue1 + 0.67));
    vec3 palCol2 = 0.5 + 0.5 * cos(6.28318 * vec3(stHue2, stHue2 + 0.33, stHue2 + 0.67));
    float nf = fbm3(vec3(p * 2.0, uTime * 0.1));
    col += stealieEmergence(p, uTime, energy, uBass, palCol1, palCol2, nf);
  }

  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // === BEAT SNAP: onset-reactive color saturation surge ===
  float beatKick = uBeatSnap * 0.20 * (1.0 + climaxBoost * 0.5);
  col *= 1.0 + beatKick;

  // Section transition bloom
  float edgeDist = min(uSectionProgress, 1.0 - uSectionProgress);
  float sectionBloom = smoothstep(0.06, 0.0, edgeDist) * 0.1;
  col += sectionBloom * vec3(1.0, 0.98, 0.94);

  // Vignette (energy-driven, no beat pulse)
  float vigScale = mix(0.48, 0.32, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);

  // Colored vignette edges
  float vigHue = hsvToCosineHue(uPaletteSecondary);
  vec3 vigTint = 0.5 + 0.5 * cos(6.28318 * vec3(vigHue, vigHue + 0.33, vigHue + 0.67));
  vigTint *= 0.03;
  col = mix(vigTint, col, vignette);

  // === LIGHT LEAK: warm amber glow from drifting edge ===
  col += lightLeak(p, uTime, energy, uOnsetSnap);

  // === BEAT PULSE: tempo-locked brightness swell ===
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.28 + climaxBoost * bp * 0.12;

  // === BLOOM: bright pixel self-illumination (climax-amplified) ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.50, 0.42, energy) - climaxBoost * 0.10;
  float bloomAmount = max(0.0, lum - bloomThreshold) * (2.5 + climaxBoost * 1.5);
  vec3 bloomColor = mix(col, vec3(1.0, 0.98, 0.95), 0.3);
  vec3 bloom = bloomColor * bloomAmount * (0.35 + climaxBoost * 0.20);
  col = col + bloom - col * bloom; // screen blend: preserves color, can't exceed 1.0

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, energy);

  // === ANIMATED STAGE FLOOD: flowing palette noise in dark areas ===
  col = stageFloodFill(col, p, uTime, energy, uPalettePrimary, uPaletteSecondary);

  // === HALATION: warm film bloom ===
  col = halation(vUv, col, energy);

  // === FILM GRAIN: animated 2-frame hold ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.06, 0.02, energy);
  col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity;

  // ONSET SATURATION PULSE: push colors away from gray (psychedelic, not white)
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse * 0.7);
  col *= 1.0 + onsetPulse * 0.08;

  // Lifted blacks
  col = max(col, vec3(0.14, 0.11, 0.15));

  gl_FragColor = vec4(col, 1.0);
}
`;
