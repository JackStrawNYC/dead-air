/**
 * Concert Lighting — volumetric cone beams + stage silhouette.
 * Fullscreen fragment shader (ANGLE-friendly, no ray marching).
 *
 * v6 additions: beat rings, crowd silhouette, key change flash, color afterglow.
 */

import { noiseGLSL } from "./noise";

export const concertBeamsVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const concertBeamsFrag = /* glsl */ `
precision highp float;

${noiseGLSL}

uniform float uTime;
uniform float uBass;
uniform float uMids;
uniform float uHighs;
uniform float uOnset;
uniform float uBeat;
uniform float uRms;
uniform float uCentroid;
uniform vec2 uResolution;
uniform float uEnergy;
uniform float uSectionProgress;
uniform float uSectionIndex;
uniform float uChromaHue;
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

#define NUM_BEAMS 6
#define PI 3.14159265

float beam(vec2 uv, float beamX, float angle, float width, float intensity) {
  float ca = cos(angle);
  float sa = sin(angle);
  vec2 local = uv - vec2(beamX, 0.0);
  float along = local.x * sa + local.y * ca;
  float perp = abs(local.x * ca - local.y * sa);
  float coneWidth = width * (0.02 + along * 0.6);
  if (along < 0.0) return 0.0;
  float edge = smoothstep(coneWidth, coneWidth * 0.3, perp);
  float falloff = 1.0 / (1.0 + along * 2.0);
  float scatter = snoise(vec3(uv * 5.0, uTime * 0.3)) * 0.3 + 0.7;
  return edge * falloff * intensity * scatter;
}

float getContrastForBeam(int i) {
  if (i == 0) return uContrast0.x;
  if (i == 1) return uContrast0.y;
  if (i == 2) return uContrast0.z;
  if (i == 3) return uContrast0.w;
  if (i == 4) return uContrast1.x;
  return uContrast1.y;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - vec2(0.5, 0.0)) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float tempoScale = uTempo / 120.0;

  // Bass camera shake
  float shakeX = snoise(vec3(uTime * 8.0, 1.0, 0.0)) * uBass * 0.003;
  float shakeY = snoise(vec3(1.0, uTime * 8.0, 0.0)) * uBass * 0.003;
  p += vec2(shakeX, shakeY);

  // === CHROMATIC ABERRATION setup ===
  float caStrength = uBass * 0.006 + uRms * 0.003;

  // Background
  float bgHue = uPalettePrimary + uTime * 0.02;
  vec3 bgColor = 0.5 + 0.5 * cos(6.28318 * (vec3(bgHue, bgHue + 0.33, bgHue + 0.67) + vec3(0.0, 0.1, 0.2)));
  bgColor *= 0.04 + uRms * 0.03;
  vec3 col = bgColor;

  float activeBeamCount = 2.0 + energy * 4.0;
  float beamSpacing = aspect.x / float(NUM_BEAMS + 1);
  float sectionHueShift = mod(uSectionIndex * 0.15, 1.0);

  for (int i = 0; i < NUM_BEAMS; i++) {
    float fi = float(i);
    float beamPhase = fi * 1.618;

    float beamActive = smoothstep(activeBeamCount, activeBeamCount - 1.0, fi);
    if (beamActive < 0.01) continue;

    float beamX = -aspect.x * 0.5 + beamSpacing * (fi + 1.0);
    float sweepSpeed = mix(0.1, 0.3, energy) * tempoScale + uBass * 0.1;
    float angle = PI * 0.5 + sin(uTime * sweepSpeed + beamPhase * 2.0) * mix(0.2, 0.45, energy);
    float width = mix(0.05, 0.12, energy) + uMids * 0.04;

    float contrastBoost = getContrastForBeam(i) * 0.3;
    // Snappy beat for intensity
    float intensity = (0.3 + uRms * 0.4 + contrastBoost) * beamActive;

    // === CHROMATIC ABERRATION on beams ===
    // Compute beam at 3 UV offsets for R/G/B separation
    vec2 caOffset = normalize(p + vec2(0.001)) * caStrength;
    float beamR = beam(p - caOffset, beamX, angle, width, intensity);
    float beamG = beam(p, beamX, angle, width, intensity);
    float beamB = beam(p + caOffset, beamX, angle, width, intensity);

    // Beam color
    float hue = uPalettePrimary + uChromaHue * 0.3 + fi * 0.12 + sectionHueShift;
    vec3 beamCol = 0.5 + 0.5 * cos(6.28318 * (vec3(hue, hue + 0.33, hue + 0.67)));

    // Palette saturation
    vec3 beamGray = vec3(dot(beamCol, vec3(0.299, 0.587, 0.114)));
    beamCol = mix(beamGray, beamCol, uPaletteSaturation);

    // Warm white alternating beams
    if (i == 0 || i == 3) {
      vec3 warmWhite = vec3(1.0, 0.95, 0.85);
      vec3 palTint = 0.5 + 0.5 * cos(6.28318 * vec3(uPaletteSecondary, uPaletteSecondary + 0.33, uPaletteSecondary + 0.67));
      beamCol = mix(beamCol, mix(warmWhite, palTint, 0.3), 0.5);
    }

    // Color temperature
    vec3 warmShift = vec3(1.1, 0.95, 0.85);
    vec3 coolShift = vec3(0.88, 0.95, 1.1);
    beamCol *= mix(coolShift, warmShift, energy);

    // Composite with chromatic aberration
    col += beamCol * vec3(beamR, beamG, beamB) * 0.6;
  }

  // (beat/onset pulsing removed — unreliable detection for live music)

  // === COLOR AFTERGLOW ===
  float afterglowStr = smoothstep(0.3, 0.7, energy) * 0.04;
  vec3 afterglowCol = 0.5 + 0.5 * cos(6.28318 * vec3(uAfterglowHue, uAfterglowHue + 0.33, uAfterglowHue + 0.67));
  col += afterglowCol * afterglowStr;

  // Stage silhouette
  float stageY = smoothstep(0.35, 0.25, uv.y);
  col = mix(col, vec3(0.005, 0.005, 0.01), stageY * 0.95);

  // === CROWD SILHOUETTE: wavy heads along bottom edge ===
  float crowdY = 0.12 + snoise(vec3(uv.x * 8.0, uTime * 0.3, 0.0)) * 0.02
               + snoise(vec3(uv.x * 25.0, 0.0, uTime * 0.1)) * 0.008;
  crowdY += uBeatSnap * 0.005 * sin(uv.x * 15.0 + uTime);
  float crowdMask = smoothstep(crowdY + 0.01, crowdY - 0.01, uv.y);
  col = mix(col, vec3(0.003, 0.003, 0.008), crowdMask * 0.92);

  // Floor reflection
  if (uv.y < 0.25) {
    float reflection = smoothstep(0.15, 0.25, uv.y) * 0.15;
    vec2 mirrorUv = vec2(uv.x, 0.5 - uv.y);
    vec2 mirrorP = (mirrorUv - vec2(0.5, 0.0)) * aspect;

    for (int i = 0; i < NUM_BEAMS; i++) {
      float fi = float(i);
      float beamActive = smoothstep(activeBeamCount, activeBeamCount - 1.0, fi);
      if (beamActive < 0.01) continue;

      float beamPhase = fi * 1.618;
      float beamX = -aspect.x * 0.5 + beamSpacing * (fi + 1.0);
      float sweepSpeed = mix(0.1, 0.3, energy) * tempoScale + uBass * 0.1;
      float angle = PI * 0.5 + sin(uTime * sweepSpeed + beamPhase * 2.0) * mix(0.2, 0.45, energy);
      float width = mix(0.05, 0.12, energy) + uMids * 0.06;
      float intensity = (0.3 + uRms * 0.3) * beamActive;
      float beamVal = beam(mirrorP, beamX, angle, width, intensity);

      float hue = uPalettePrimary + uChromaHue * 0.3 + fi * 0.12 + sectionHueShift;
      vec3 beamCol = 0.5 + 0.5 * cos(6.28318 * (vec3(hue, hue + 0.33, hue + 0.67)));
      col += beamCol * beamVal * reflection;
    }
  }

  // Sparkle dust
  float sparkle = snoise(vec3(p * 30.0, uTime * 3.0));
  sparkle = max(0.0, sparkle - 0.85) * 6.0;
  col += sparkle * uHighs * 0.15 * vec3(1.0, 0.95, 0.9);

  // Vignette (energy-driven, no beat pulse)
  float vigScale = 1.2;
  float vig = 1.0 - dot((uv - 0.5) * vigScale, (uv - 0.5) * vigScale);
  vig = smoothstep(0.0, 1.0, vig);

  // Colored vignette
  vec3 vigTint = 0.5 + 0.5 * cos(6.28318 * vec3(uPaletteSecondary, uPaletteSecondary + 0.33, uPaletteSecondary + 0.67));
  vigTint *= 0.02;
  col = mix(vigTint, col, vig);

  // === LIGHT LEAK ===
  col += lightLeak(p, uTime, energy, uOnsetSnap);

  // === BLOOM ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.45, 0.3, energy);
  float bloomAmount = max(0.0, lum - bloomThreshold) * 2.5;
  vec3 bloomColor = mix(col, vec3(1.0, 0.98, 0.95), 0.35);
  col += bloomColor * bloomAmount * 0.3;

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, energy);

  // === FILM GRAIN ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.05, 0.015, energy);
  col += filmGrain(uv, grainTime) * grainIntensity;

  // Lifted blacks
  col = max(col, vec3(0.008, 0.006, 0.012));

  gl_FragColor = vec4(col, 1.0);
}
`;
