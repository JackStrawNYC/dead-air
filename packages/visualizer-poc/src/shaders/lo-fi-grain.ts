/**
 * Lo-Fi Grain — warm 16mm film aesthetic.
 * Heavy grain, desaturated palette, slow organic movement.
 * Best for early-era shows (primal/classic) and low-energy sections.
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";

export const loFiGrainVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const loFiGrainFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

varying vec2 vUv;

#define PI 3.14159265

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float tempoScale = uTempo / 120.0;
  float sectionSeed = uSectionIndex * 5.7;
  float t = uDynamicTime * 0.07 * tempoScale; // Purposeful movement

  // Subtle gate weave (projector instability)
  float weaveX = snoise(vec3(uTime * 2.0, 0.0, sectionSeed)) * 0.001;
  float weaveY = snoise(vec3(0.0, uTime * 3.0, sectionSeed)) * 0.0008;
  p += vec2(weaveX, weaveY);

  // === LAYER 1: Warm base wash ===
  float baseNoise = fbm(vec3(p * 0.6, t * 0.5 + sectionSeed));
  float warmHue = hsvToCosineHue(uPalettePrimary + 0.05); // Push slightly warm
  vec3 baseCol = vec3(0.12, 0.08, 0.05); // Dark warm brown
  baseCol += vec3(0.08, 0.06, 0.03) * (baseNoise * 0.5 + 0.5);

  // === LAYER 2: Slow organic blobs ===
  vec3 q = vec3(p * 0.8, t * 0.3 + sectionSeed);
  float warpX = fbm(q + vec3(1.3, 5.7, 0.0));
  float warpY = fbm(q + vec3(4.1, 2.3, 0.0));
  vec2 warped = p + vec2(warpX, warpY) * (0.3 + uBass * 0.15);

  float n = fbm(vec3(warped * 0.7, t * 0.4 + sectionSeed * 0.3));

  // Warm amber-to-brown palette
  vec3 warmA = vec3(0.15, 0.10, 0.06);
  vec3 warmB = vec3(0.25, 0.15, 0.08);
  vec3 midCol = mix(warmA, warmB, n * 0.5 + 0.5);

  // Subtle palette tinting
  vec3 palTint = 0.5 + 0.5 * cos(6.28318 * vec3(warmHue, warmHue + 0.33, warmHue + 0.67));
  midCol = mix(midCol, palTint * 0.3, 0.15 * uPaletteSaturation);

  // Energy brightens the warm tones
  float brightness = mix(0.12, 0.72, energy) + uRms * 0.15;
  midCol *= brightness;

  // === LAYER 3: High frequency shimmer ===
  float fgNoise = fbm3(vec3(warped * 4.0, t * 0.6));
  float fgIntensity = uHighs * 0.08;
  vec3 fgCol = vec3(fgNoise * 0.5 + 0.5) * vec3(1.0, 0.9, 0.75) * fgIntensity;

  // === COMPOSITE ===
  vec3 col = baseCol * 0.3 + midCol * 0.55 + fgCol * 0.15;

  // Desaturate significantly (lo-fi look)
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 0.45); // Only 45% saturation

  // Warm sepia push
  col = mix(col, col * vec3(1.15, 1.0, 0.82), 0.3);

  // === HEAVY FILM GRAIN: 2-frame hold, much stronger than other modes ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.14, 0.08, energy) + uFastEnergy * 0.04; // Much heavier grain
  col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity;

  // Gate scratch (vertical line that occasionally appears)
  float scratchSeed = floor(uTime * 2.0);
  float scratchX = fract(sin(scratchSeed * 43758.5453) * 43758.5453);
  float scratchPresent = step(0.92, fract(sin(scratchSeed * 12345.6789) * 43758.5453));
  float scratch = smoothstep(0.001, 0.0, abs(uv.x - scratchX)) * scratchPresent * 0.08;
  col += scratch * vec3(1.0, 0.95, 0.85);

  // Strong vignette (16mm lens falloff)
  float vig = 1.0 - dot(p * 0.55, p * 0.55);
  vig = smoothstep(-0.1, 0.8, vig);
  col *= 0.3 + vig * 0.7;

  // === CLIMAX REACTIVITY ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // === BEAT PULSE: tempo-locked warm glow (amplified) ===
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.22 + climaxBoost * bp * 0.10;
  col *= 1.0 + uBeatSnap * 0.18;

  // Lifted blacks (build-phase-aware: near true black during build for anticipation)
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float liftMult = mix(1.0, 0.15, isBuild * uClimaxIntensity);
  col = max(col, vec3(0.06, 0.05, 0.08) * liftMult);

  // Cinematic grade for film look (gentler)
  col = cinematicGrade(col, energy * 0.6);

  // === ANIMATED STAGE FLOOD: flowing palette noise in dark areas ===
  col = stageFloodFill(col, p, uDynamicTime, energy, uPalettePrimary, uPaletteSecondary);

  // === ANAMORPHIC FLARE: horizontal light streak ===
  col = anamorphicFlare(vUv, col, energy, uOnsetSnap);

  // ONSET SATURATION PULSE: push colors away from gray (psychedelic, not white)
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse * 1.0);
  col *= 1.0 + onsetPulse * 0.12;

  // ONSET CHROMATIC ABERRATION (directional fringing)
  if (uOnsetSnap > 0.4) {
    float caAmt = (uOnsetSnap - 0.4) * 0.15;
    col = applyCA(col, vUv, caAmt);
  }

  // === HALATION: warm film bloom ===
  col = halation(vUv, col, energy);

  gl_FragColor = vec4(col, 1.0);
}
`;
