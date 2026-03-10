/**
 * Crystal Cavern — instanced crystalline geometry shaders.
 * 400 icosahedrons in a cylindrical cave distribution.
 * Bass-pulsing geometry, chroma-colored facets, helical camera.
 *
 * Audio reactivity:
 *   uBass       → crystal scale pulse, camera shake
 *   uHighs      → facet glow intensity, rotation speed
 *   uEnergy     → emissive glow, fog distance
 *   uOnsetSnap  → refraction flash
 *   uMusicalTime → rotation phase-lock
 *   uChroma0-2  → per-crystal color from pitch class
 */

import { noiseGLSL } from "./noise";

export const crystalCavernVert = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uBass;
uniform float uHighs;
uniform float uEnergy;
uniform float uMusicalTime;
uniform vec4 uChroma0;
uniform vec4 uChroma1;
uniform vec4 uChroma2;

${noiseGLSL}

attribute float aInstanceIndex;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vInstanceIndex;
varying float vGlow;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vInstanceIndex = aInstanceIndex;

  // Bass-driven scale pulse: each crystal pulses slightly with low frequencies
  float bassPhase = aInstanceIndex * 0.37;
  float scalePulse = 1.0 + uBass * 0.15 * sin(uMusicalTime * 3.14159 + bassPhase);

  // Highs-driven rotation around local Y axis
  float rotAngle = uTime * (0.3 + uHighs * 0.5) + aInstanceIndex * 1.618;
  float c = cos(rotAngle);
  float s = sin(rotAngle);
  mat3 rot = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);

  vec3 pos = rot * (position * scalePulse);
  vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;

  // Emissive glow: chroma-based per crystal
  int chromaIdx = int(mod(aInstanceIndex, 12.0));
  vGlow = getChroma(chromaIdx, uChroma0, uChroma1, uChroma2);

  gl_Position = projectionMatrix * modelViewMatrix * worldPos;
}
`;

export const crystalCavernFrag = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uEnergy;
uniform float uOnsetSnap;
uniform float uBass;
uniform float uHighs;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform float uBeatSnap;
uniform float uMusicalTime;
uniform float uClimaxPhase;
uniform float uClimaxIntensity;
uniform vec4 uChroma0;
uniform vec4 uChroma1;
uniform vec4 uChroma2;
uniform float uCoherence;

${noiseGLSL}

varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vInstanceIndex;
varying float vGlow;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  // Facet-aware shading: hard edges via flat normal
  vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
  float ndotl = max(0.0, dot(vNormal, lightDir));

  // Base crystal color from palette + instance index
  float hue = uPalettePrimary + mod(vInstanceIndex * 0.0833, 1.0) * 0.3;
  float sat = 0.6 * uPaletteSaturation;
  vec3 baseColor = hsv2rgb(vec3(hue, sat, 0.4 + ndotl * 0.4));

  // Chroma-reactive emissive glow: pitch class lights different crystals
  float emissive = vGlow * uEnergy * 1.5;
  float chromaIdx = mod(vInstanceIndex, 12.0);
  float chromaHue = chromaIdx / 12.0;
  vec3 glowColor = hsv2rgb(vec3(chromaHue, 0.8, 1.0));

  // === CLIMAX REACTIVITY ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Onset refraction flash (amplified)
  float flash = uOnsetSnap * 0.7 * (1.0 + climaxBoost * 0.5);

  // Beat snap: crystal brightness pulse
  float beatKick = uBeatSnap * 0.30 * (1.0 + climaxBoost * 0.4);

  // Rim glow for depth
  float rim = 1.0 - max(0.0, dot(vNormal, normalize(-vWorldPos)));
  rim = pow(rim, 3.0) * (0.3 + climaxBoost * 0.2);

  vec3 col = baseColor + glowColor * emissive + flash + beatKick + rim * glowColor * 0.5;

  // ONSET SATURATION PULSE: push colors away from gray (psychedelic, not white)
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse * 1.0);
  col *= 1.0 + onsetPulse * 0.12;

  // ONSET CHROMATIC ABERRATION
  if (uOnsetSnap > 0.4) {
    float caAmt = (uOnsetSnap - 0.4) * 0.15;
    col.r *= 1.0 + caAmt;
    col.b *= 1.0 - caAmt * 0.5;
  }

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, uEnergy);

  // === ANIMATED STAGE FLOOD: flowing palette noise in dark areas ===
  col = stageFloodFill(col, vWorldPos.xz * 0.3, uTime, uEnergy, uPalettePrimary, uPaletteSecondary);

  // Fog: distance-based
  float fogDist = length(vWorldPos);
  float fog = 1.0 - exp(-fogDist * (0.08 - uEnergy * 0.03));
  vec3 fogColor = vec3(0.02, 0.03, 0.06);
  col = mix(col, fogColor, fog);

  gl_FragColor = vec4(col, 1.0);
}
`;
