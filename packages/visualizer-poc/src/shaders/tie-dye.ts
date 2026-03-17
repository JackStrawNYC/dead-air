/**
 * Tie-Dye — swirling color wash in classic Grateful Dead aesthetic.
 * Radial gradient rotation with palette-locked hue bands.
 * Audio-reactive: bass swirls, onset flashes, energy intensity.
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";

export const tieDyeVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const tieDyeFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

  // Time-based rotation — bass drives swirl speed
  float t = uDynamicTime * 0.15 * (0.8 + uBass * 0.6 + uFastBass * 0.4);
  float bassSwirl = uBass * 1.5;

  // === CURL NOISE UV WARPING: simulate fabric wrinkles ===
  vec2 warpedUv = uv + curlNoise(vec3(uv * 2.0, uDynamicTime * 0.08)).xy * 0.15;

  // Radial coordinates (using warped UVs for wrinkle distortion)
  float r = length(warpedUv);
  float angle = atan(warpedUv.y, warpedUv.x);

  // Domain warping — noise-based spiral distortion
  float warp1 = fbm3(vec3(warpedUv * 2.0 + t * 0.3, t * 0.2));
  float warp2 = fbm3(vec3(warpedUv * 1.5 - t * 0.2, t * 0.15 + 10.0));

  // Spiral pattern (harmonic tension drives spiral arm count)
  float armCount = 3.0 + uHarmonicTension * 2.0;
  float spiral = angle / TAU + r * (armCount + bassSwirl) + warp1 * 0.8 + t;
  float bands = sin(spiral * TAU * 3.0 + warp2 * TAU) * 0.5 + 0.5;

  // Radial rings
  float rings = sin(r * 12.0 - t * 2.0 + warp1 * 3.0) * 0.5 + 0.5;

  // Mix pattern
  float pattern = mix(bands, rings, 0.3 + uMids * 0.2);

  // Palette-locked hue bands — rotate through palette colors
  float hueBase = uPalettePrimary;
  float hueRange = mod(uPaletteSecondary - uPalettePrimary + 0.5, 1.0) - 0.5;
  float hue = hueBase + pattern * hueRange + warp1 * 0.1;

  // Chroma hue influence + chord shift
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;
  hue = mix(hue, uChromaHue, 0.15) + chordHue;

  float sat = 0.7 + pattern * 0.25 + uVocalEnergy * 0.12;
  sat *= uPaletteSaturation;

  float val = 0.25 + pattern * 0.35 + uEnergy * 0.25;

  vec3 color = hsv2rgb(vec3(fract(hue), sat, val));

  // === FABRIC TEXTURE: ridged noise for creases and folds ===
  float fabric = ridged4(vec3(warpedUv * 3.0, uDynamicTime * 0.05));
  color *= 0.85 + fabric * 0.3; // darken creases, brighten ridges

  // === FOLD-LINE SDF: sharp tie-dye boundaries where fabric was tied ===
  // Radial fold lines from center with energy-driven bleeding
  {
    float foldCount = 6.0;
    float foldAngle = mod(angle * foldCount / TAU, 1.0);
    // Sharp fold boundary (SDF of angular fold lines)
    float foldSDF = abs(foldAngle - 0.5) * 2.0;
    // Energy drives bleeding width: quiet = razor-sharp folds, loud = dye bleeds
    float bleedWidth = 0.05 + clamp(uEnergy, 0.0, 1.0) * 0.15;
    float foldEdge = smoothstep(bleedWidth, bleedWidth * 0.3, foldSDF);
    // Concentric ring folds (where rubber bands were)
    float ringFold = abs(sin(r * 8.0 + warp1 * 2.0));
    float ringEdge = smoothstep(bleedWidth * 1.5, bleedWidth * 0.5, ringFold);
    // Darken at fold boundaries (dye concentrates where fabric was tied)
    float foldDarken = max(foldEdge, ringEdge) * 0.25;
    color *= 1.0 - foldDarken;
    // Color bleed: shift hue at fold boundaries
    float hueShift = foldEdge * 0.08 + ringEdge * 0.05;
    color = hsv2rgb(vec3(fract(hue + hueShift), sat, dot(color, vec3(0.299, 0.587, 0.114))));
  }

  // === SDF STEALIE: emerges from the tie-dye swirl ===
  {
    vec3 palCol1 = hsv2rgb(vec3(uPalettePrimary, 0.8, 1.0));
    vec3 palCol2 = hsv2rgb(vec3(uPaletteSecondary, 0.8, 1.0));
    float nf = warp1;
    color += stealieEmergence(uv, uTime, clamp(uEnergy, 0.0, 1.0), uBass, palCol1, palCol2, nf, uClimaxPhase);
  }

  // === CLIMAX REACTIVITY ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Onset flash — bright center pulse (amplified)
  float flash = max(uOnsetSnap, uDrumOnset) * 0.9 * smoothstep(0.6, 0.0, r) * (1.0 + climaxBoost * 0.5);
  color += flash;

  // Beat snap — sharp saturation kick on transients
  color *= 1.0 + uBeatSnap * 0.28 * (1.0 + climaxBoost * 0.4);

  // Beat pulse — tempo-locked saturation boost
  float bp = beatPulse(uMusicalTime);
  color = mix(color, color * 1.3, bp * 0.35 + climaxBoost * bp * 0.15);

  // Vignette
  float vig = 1.0 - smoothstep(0.7, 1.5, r);
  color *= 0.3 + vig * 0.7;

  // Energy-reactive overall brightness
  color *= 0.8 + uRms * 0.4;

  // === CINEMATIC GRADE (ACES filmic tone mapping) ===
  color = cinematicGrade(color, uEnergy);

  // === ANIMATED STAGE FLOOD: flowing palette noise in dark areas ===
  color = stageFloodFill(color, uv, uDynamicTime, uEnergy, uPalettePrimary, uPaletteSecondary);

  // === ANAMORPHIC FLARE: horizontal light streak ===
  color = anamorphicFlare(vUv, color, uEnergy, uOnsetSnap);

  // ONSET SATURATION PULSE: push colors away from gray (psychedelic, not white)
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(onsetLuma), color, 1.0 + onsetPulse * 1.0);
  color *= 1.0 + onsetPulse * 0.12;

  // ONSET CHROMATIC ABERRATION (directional fringing)
  if (uOnsetSnap > 0.4) {
    float caAmt = (uOnsetSnap - 0.4) * 0.15;
    color = applyCA(color, vUv, caAmt);
  }

  // === HALATION: warm film bloom ===
  color = halation(vUv, color, uEnergy);

  // Lifted blacks (build-phase-aware: near true black during build for anticipation)
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float liftMult = mix(1.0, 0.15, isBuild * uClimaxIntensity);
  color = max(color, vec3(0.06, 0.05, 0.08) * liftMult);

  gl_FragColor = vec4(color, 1.0);
}
`;
