/**
 * Tie-Dye — swirling color wash in classic Grateful Dead aesthetic.
 * Radial gradient rotation with palette-locked hue bands.
 * Audio-reactive: bass swirls, onset flashes, energy intensity.
 */

import { noiseGLSL } from "./noise";

export const tieDyeVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const tieDyeFrag = /* glsl */ `
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

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * snoise(p);
    p *= 2.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

  // Radial coordinates
  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Time-based rotation — bass drives swirl speed
  float t = uTime * 0.15 * (0.8 + uBass * 0.6);
  float bassSwirl = uBass * 1.5;

  // Domain warping — noise-based spiral distortion
  float warp1 = fbm3(vec3(uv * 2.0 + t * 0.3, t * 0.2));
  float warp2 = fbm3(vec3(uv * 1.5 - t * 0.2, t * 0.15 + 10.0));

  // Spiral pattern
  float spiral = angle / TAU + r * (3.0 + bassSwirl) + warp1 * 0.8 + t;
  float bands = sin(spiral * TAU * 3.0 + warp2 * TAU) * 0.5 + 0.5;

  // Radial rings
  float rings = sin(r * 12.0 - t * 2.0 + warp1 * 3.0) * 0.5 + 0.5;

  // Mix pattern
  float pattern = mix(bands, rings, 0.3 + uMids * 0.2);

  // Palette-locked hue bands — rotate through palette colors
  float hueBase = uPalettePrimary;
  float hueRange = mod(uPaletteSecondary - uPalettePrimary + 0.5, 1.0) - 0.5;
  float hue = hueBase + pattern * hueRange + warp1 * 0.1;

  // Chroma hue influence
  hue = mix(hue, uChromaHue, 0.15);

  float sat = 0.7 + pattern * 0.25;
  sat *= uPaletteSaturation;

  float val = 0.4 + pattern * 0.35 + uEnergy * 0.15;

  vec3 color = hsv2rgb(vec3(fract(hue), sat, val));

  // === CLIMAX REACTIVITY ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Onset flash — bright center pulse (amplified)
  float flash = uOnsetSnap * 0.9 * smoothstep(0.6, 0.0, r) * (1.0 + climaxBoost * 0.5);
  color += flash;

  // Beat snap — sharp saturation kick on transients
  color *= 1.0 + uBeatSnap * 0.18 * (1.0 + climaxBoost * 0.4);

  // Beat pulse — tempo-locked saturation boost
  float bp = beatPulse(uMusicalTime);
  color = mix(color, color * 1.3, bp * 0.35 + climaxBoost * bp * 0.15);

  // Vignette
  float vig = 1.0 - smoothstep(0.5, 1.2, r);
  color *= vig;

  // Energy-reactive overall brightness
  color *= 0.8 + uRms * 0.4;

  // === HALATION: warm film bloom ===
  color = halation(vUv, color, uEnergy);

  gl_FragColor = vec4(color, 1.0);
}
`;
