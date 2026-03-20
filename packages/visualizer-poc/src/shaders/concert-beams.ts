/**
 * Concert Lighting — volumetric cone beams + stage silhouette.
 * Fullscreen fragment shader (ANGLE-friendly, no ray marching).
 *
 * v6 additions: beat rings, crowd silhouette, key change flash, color afterglow.
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const concertBeamsVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const concertBeamsFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ halationEnabled: true, bloomThresholdOffset: -0.08 })}

varying vec2 vUv;

#define NUM_BEAMS 8
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
  float scatter = snoise(vec3(uv * 5.0, uDynamicTime * 0.3)) * 0.3 + 0.7;
  return edge * falloff * intensity * scatter;
}

float getContrastForBeam(int i) {
  if (i == 0) return uContrast0.x;
  if (i == 1) return uContrast0.y;
  if (i == 2) return uContrast0.z;
  if (i == 3) return uContrast0.w;
  if (i == 4) return uContrast1.x;
  if (i == 5) return uContrast1.y;
  if (i == 6) return uContrast1.z;
  return uContrast1.w;
}

void main() {
  vec2 uv = vUv;
  uv = applyCameraCut(uv, uOnsetSnap, uBeatSnap, uEnergy, uCoherence, uClimaxPhase, uMusicalTime, uSectionIndex);
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - vec2(0.5, 0.0)) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float tempoScale = uLocalTempo / 120.0;
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);

  // --- Phase 1: New uniform integrations ---
  // Vocal warmth on center beams
  float vocalWarmth = uVocalEnergy * 0.15;
  // Guitar drives foreground beam intensity
  float guitarIntensity = uOtherEnergy * 0.3;
  // Guitar brightness shifts warm/cool
  float guitarBrightness = uOtherCentroid;
  // Energy acceleration drives sweep speed
  float accelSweep = 1.0 + uEnergyAccel * 0.15;
  // Melodic pitch shifts beam sweep center
  float melInfluence = uMelodicPitch * uMelodicConfidence;
  float pitchSweep = (melInfluence - 0.5) * 0.1;
  // Beat stability: high=steady beams, low=erratic
  float beamSteadiness = uBeatStability;
  // Harmonic tension: beam angle complexity
  float tensionAngle = uHarmonicTension * 0.2;
  // Chord hue micro-rotation
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;
  // Downbeat flash: beam intensity bump on measure start
  float downbeatFlash = uDownbeat * 0.15;

  // Bass camera shake
  float shakeX = snoise(vec3(uTime * 8.0, 1.0, 0.0)) * uBass * 0.003;
  float shakeY = snoise(vec3(1.0, uTime * 8.0, 0.0)) * uBass * 0.003;
  p += vec2(shakeX, shakeY);

  // === CHROMATIC ABERRATION setup ===
  float caStrength = uBass * 0.006 + uRms * 0.003 + uOnsetSnap * 0.06;

  // Background — deeper and more colorful
  float bgHue = hsvToCosineHue(uPalettePrimary) + uDynamicTime * 0.02;
  vec3 bgColor = 0.5 + 0.5 * cos(6.28318 * (vec3(bgHue, bgHue + 0.33, bgHue + 0.67) + vec3(0.0, 0.1, 0.2)));
  bgColor *= 0.08 + uRms * 0.12;
  // FBM noise to break flat background banding
  float bgNoise = fbm3(vec3(p * 3.0, uDynamicTime * 0.1));
  bgColor *= 0.85 + bgNoise * 0.3;
  vec3 col = bgColor;

  float activeBeamCount = 3.0 + energy * 5.0 + uJamDensity * 2.0;
  float beamSpacing = aspect.x / float(NUM_BEAMS + 1);
  float sectionHueShift = mod(uSectionIndex * 0.15, 1.0);

  for (int i = 0; i < NUM_BEAMS; i++) {
    float fi = float(i);
    float beamPhase = fi * 1.618;

    float beamActive = smoothstep(activeBeamCount, activeBeamCount - 1.0, fi);
    if (beamActive < 0.01) continue;

    float beamX = -aspect.x * 0.5 + beamSpacing * (fi + 1.0) + sin(uDynamicTime * 0.15 + fi * 0.7) * 0.08;
    float sweepSpeed = mix(0.25, 0.6, energy) * tempoScale * accelSweep + uBass * 0.1;
    float angle = PI * 0.5 + sin(uDynamicTime * sweepSpeed + beamPhase * 2.0 + pitchSweep) * mix(0.35, 0.70, energy + uFastEnergy * 0.15 + tensionAngle);
    float width = mix(0.03, 0.11, energy) + uMids * 0.04;

    float contrastBoost = getContrastForBeam(i) * 0.3;
    // Snappy beat for intensity
    float intensity = (0.5 + uRms * 0.5 + contrastBoost + downbeatFlash) * beamActive;

    // Single beam evaluation (simplified from per-channel chromatic aberration)
    float beamVal = beam(p, beamX, angle, width, intensity);

    // Beam color
    float hue = hsvToCosineHue(uPalettePrimary) + uChromaHue * 0.25 + chordHue + fi * 0.12 + sectionHueShift;
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

    // Color temperature (with guitar brightness + vocal warmth)
    vec3 warmShift = vec3(1.1, 0.95, 0.85);
    vec3 coolShift = vec3(0.88, 0.95, 1.1);
    beamCol *= mix(coolShift, warmShift, energy + guitarBrightness * 0.15);
    // Vocal warmth on center beams
    if (i == 3 || i == 4) {
      beamCol += vec3(0.08, 0.04, 0.0) * vocalWarmth;
    }

    // Directional chromatic aberration on beam color
    beamCol = applyCA(beamCol, vUv, caStrength);

    col += beamCol * beamVal * 0.85;
  }

  // === ATMOSPHERIC HAZE: fbm-driven secondary palette color between beams ===
  float hazeNoise = fbm3(vec3(p * 2.0 + 50.0, uDynamicTime * 0.08));
  float secHue = hsvToCosineHue(uPaletteSecondary) + hazeNoise * 0.15;
  vec3 hazeColor = 0.5 + 0.5 * cos(6.28318 * vec3(secHue, secHue + 0.33, secHue + 0.67));
  float hazeAmount = (0.03 + energy * 0.05) * (0.5 + hazeNoise * 0.5);
  col += hazeColor * hazeAmount;

  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // === BEAT SNAP: strobe-like flash on hard transients ===
  float strobeKick = max(effectiveBeat, uDrumBeat) * 0.60 * (1.0 + climaxBoost * 0.5);
  col += strobeKick * vec3(1.0, 0.95, 0.85);

  // === COLOR AFTERGLOW ===
  float afterglowStr = smoothstep(0.3, 0.7, energy) * 0.04;
  float agHue = hsvToCosineHue(uAfterglowHue);
  vec3 afterglowCol = 0.5 + 0.5 * cos(6.28318 * vec3(agHue, agHue + 0.33, agHue + 0.67));
  col += afterglowCol * afterglowStr;

  // Stage silhouette — softened with wider smoothstep + noise edge
  float stageNoise = snoise(vec3(uv.x * 12.0, uDynamicTime * 0.15, 5.0)) * 0.02;
  float stageY = smoothstep(0.38, 0.22, uv.y + stageNoise);
  col = mix(col, vec3(0.04, 0.03, 0.05), stageY * 0.70);

  // === CROWD SILHOUETTE: wavy heads along bottom edge ===
  // Higher frequency + extra octave prevents visible repeating patterns at 1920px
  float crowdY = 0.12 + snoise(vec3(uv.x * 20.0, uDynamicTime * 0.3, 0.0)) * 0.02
               + snoise(vec3(uv.x * 50.0, 0.0, uDynamicTime * 0.1)) * 0.008
               + snoise(vec3(uv.x * 80.0, uDynamicTime * 0.05, 3.7)) * 0.004;
  crowdY += uDrumBeat * 0.005 * sin(uv.x * 15.0 + uDynamicTime);
  float crowdMask = smoothstep(crowdY + 0.01, crowdY - 0.01, uv.y);
  col = mix(col, vec3(0.035, 0.028, 0.04), crowdMask * 0.65);

  // Sparkle dust
  float sparkle = snoise(vec3(p * 30.0, uDynamicTime * 3.0));
  sparkle = max(0.0, sparkle - 0.85) * 6.0;
  col += sparkle * uHighs * 0.15 * vec3(1.0, 0.95, 0.9);

  // Vignette (energy-driven, no beat pulse)
  float vigScale = mix(0.30, 0.29, energy);
  float vig = 1.0 - dot((uv - 0.5) * vigScale, (uv - 0.5) * vigScale);
  vig = smoothstep(0.0, 1.0, vig);

  // Colored vignette
  float vigHue = hsvToCosineHue(uPaletteSecondary);
  vec3 vigTint = 0.5 + 0.5 * cos(6.28318 * vec3(vigHue, vigHue + 0.33, vigHue + 0.67));
  vigTint = max(vigTint * 0.02, vec3(0.05, 0.04, 0.06));
  col = mix(vigTint, col, vig);

  // Drum onset flash (scene-specific)
  col += uDrumOnset * 0.15 * vec3(1.0, 0.95, 0.85);

  // SDF hero icon
  {
    float nf = fbm3(vec3(p * 2.0, uDynamicTime * 0.1));
    float heroHue1 = uPalettePrimary;
    float heroHue2 = uPaletteSecondary;
    vec3 c1 = hsv2rgb(vec3(heroHue1, uPaletteSaturation, 1.0));
    vec3 c2 = hsv2rgb(vec3(heroHue2, uPaletteSaturation, 1.0));
    col += heroIconEmergence(p, uTime, energy, uBass, c1, c2, nf, uSectionIndex);
  }

  // === POST-PROCESSING (shared chain) ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
