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
uniform float uMusicalTime;
uniform float uChromaShift;
uniform float uAfterglowHue;
uniform float uClimaxPhase;
uniform float uClimaxIntensity;
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
  float caStrength = uBass * 0.006 + uRms * 0.003 + uOnsetSnap * 0.04;

  // Background — deeper and more colorful
  float bgHue = hsvToCosineHue(uPalettePrimary) + uTime * 0.02;
  vec3 bgColor = 0.5 + 0.5 * cos(6.28318 * (vec3(bgHue, bgHue + 0.33, bgHue + 0.67) + vec3(0.0, 0.1, 0.2)));
  bgColor *= 0.08 + uRms * 0.12;
  vec3 col = bgColor;

  float activeBeamCount = 3.0 + energy * 5.0;
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
    float width = mix(0.03, 0.11, energy) + uMids * 0.04;

    float contrastBoost = getContrastForBeam(i) * 0.3;
    // Snappy beat for intensity
    float intensity = (0.5 + uRms * 0.5 + contrastBoost) * beamActive;

    // Single beam evaluation (simplified from per-channel chromatic aberration)
    float beamVal = beam(p, beamX, angle, width, intensity);

    // Beam color
    float hue = hsvToCosineHue(uPalettePrimary) + uChromaHue * 0.3 + fi * 0.12 + sectionHueShift;
    vec3 beamCol = 0.5 + 0.5 * cos(6.28318 * (vec3(hue, hue + 0.33, hue + 0.67)));

    // Palette saturation
    vec3 beamGray = vec3(dot(beamCol, vec3(0.299, 0.587, 0.114)));
    beamCol = mix(beamGray, beamCol, uPaletteSaturation);

    // Warm white alternating beams
    if (i == 0 || i == 3) {
      vec3 warmWhite = vec3(1.0, 0.95, 0.85);
      float ptHue = hsvToCosineHue(uPaletteSecondary);
      vec3 palTint = 0.5 + 0.5 * cos(6.28318 * vec3(ptHue, ptHue + 0.33, ptHue + 0.67));
      beamCol = mix(beamCol, mix(warmWhite, palTint, 0.3), 0.5);
    }

    // Color temperature
    vec3 warmShift = vec3(1.1, 0.95, 0.85);
    vec3 coolShift = vec3(0.88, 0.95, 1.1);
    beamCol *= mix(coolShift, warmShift, energy);

    // Simple chromatic offset on composite
    vec2 caOffset = normalize(p + vec2(0.001)) * caStrength;
    float caShift = dot(caOffset, vec2(1.0, 0.5)) * 0.5;
    beamCol.r *= 1.0 + caShift;
    beamCol.b *= 1.0 - caShift;

    col += beamCol * beamVal * 0.85;
  }

  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // === BEAT SNAP: strobe-like flash on hard transients ===
  float strobeKick = uBeatSnap * 0.25 * (1.0 + climaxBoost * 0.5);
  col += strobeKick * vec3(1.0, 0.95, 0.85);

  // === COLOR AFTERGLOW ===
  float afterglowStr = smoothstep(0.3, 0.7, energy) * 0.04;
  float agHue = hsvToCosineHue(uAfterglowHue);
  vec3 afterglowCol = 0.5 + 0.5 * cos(6.28318 * vec3(agHue, agHue + 0.33, agHue + 0.67));
  col += afterglowCol * afterglowStr;

  // Stage silhouette
  float stageY = smoothstep(0.35, 0.25, uv.y);
  col = mix(col, vec3(0.02, 0.015, 0.025), stageY * 0.80);

  // === CROWD SILHOUETTE: wavy heads along bottom edge ===
  // Higher frequency + extra octave prevents visible repeating patterns at 1920px
  float crowdY = 0.12 + snoise(vec3(uv.x * 20.0, uTime * 0.3, 0.0)) * 0.02
               + snoise(vec3(uv.x * 50.0, 0.0, uTime * 0.1)) * 0.008
               + snoise(vec3(uv.x * 80.0, uTime * 0.05, 3.7)) * 0.004;
  crowdY += uBeatSnap * 0.005 * sin(uv.x * 15.0 + uTime);
  float crowdMask = smoothstep(crowdY + 0.01, crowdY - 0.01, uv.y);
  col = mix(col, vec3(0.015, 0.012, 0.02), crowdMask * 0.85);

  // Sparkle dust
  float sparkle = snoise(vec3(p * 30.0, uTime * 3.0));
  sparkle = max(0.0, sparkle - 0.85) * 6.0;
  col += sparkle * uHighs * 0.15 * vec3(1.0, 0.95, 0.9);

  // Vignette (energy-driven, no beat pulse)
  float vigScale = mix(0.50, 0.35, energy);
  float vig = 1.0 - dot((uv - 0.5) * vigScale, (uv - 0.5) * vigScale);
  vig = smoothstep(0.0, 1.0, vig);

  // Colored vignette
  float vigHue = hsvToCosineHue(uPaletteSecondary);
  vec3 vigTint = 0.5 + 0.5 * cos(6.28318 * vec3(vigHue, vigHue + 0.33, vigHue + 0.67));
  vigTint *= 0.02;
  col = mix(vigTint, col, vig);

  // === LIGHT LEAK ===
  col += lightLeak(p, uTime, energy, uOnsetSnap);

  // === BEAT PULSE: tempo-locked beam intensity ===
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.35 + climaxBoost * bp * 0.15;

  // === BLOOM (climax-amplified) ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.45, 0.3, energy) - climaxBoost * 0.10;
  float bloomAmount = max(0.0, lum - bloomThreshold) * (2.5 + climaxBoost * 1.5);
  vec3 bloomColor = mix(col, vec3(1.0, 0.98, 0.95), 0.35);
  vec3 bloom = bloomColor * bloomAmount * (0.3 + climaxBoost * 0.20);
  col = col + bloom - col * bloom; // screen blend

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, energy);

  // === ANIMATED STAGE FLOOD: flowing palette noise in dark areas ===
  col = stageFloodFill(col, p, uTime, energy, uPalettePrimary, uPaletteSecondary);

  // === HALATION: warm film bloom ===
  col = halation(vUv, col, energy);

  // === FILM GRAIN ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.05, 0.015, energy);
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
