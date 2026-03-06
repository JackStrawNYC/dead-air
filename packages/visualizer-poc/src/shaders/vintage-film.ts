/**
 * Vintage Film — 16mm film projector simulation with light leaks,
 * sprocket holes, gate weave, and grain. References actual concert
 * film footage aesthetic from the 1970s.
 * Audio-reactive: energy drives light leak intensity, beat triggers gate flicker.
 */

import { noiseGLSL } from "./noise";

export const vintageFilmVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const vintageFilmFrag = /* glsl */ `
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

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Gate weave — subtle frame jitter
vec2 gateWeave(float t) {
  float wx = sin(t * 7.3) * 0.002 + sin(t * 13.1) * 0.001;
  float wy = sin(t * 5.7) * 0.003 + sin(t * 11.3) * 0.0015;
  return vec2(wx, wy);
}

void main() {
  float t = uTime;
  vec2 weave = gateWeave(t) * (1.0 + uBeatSnap * 2.0);
  vec2 uv = vUv + weave;
  vec2 centered = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

  // Base scene — warm amber abstract shapes (as if projected concert footage)
  float n1 = snoise(vec3(centered * 1.5 + t * 0.1, t * 0.05));
  float n2 = snoise(vec3(centered * 3.0 - t * 0.08, t * 0.03 + 5.0));
  float n3 = snoise(vec3(centered * 0.8 + t * 0.15, t * 0.07 + 10.0));

  float scene = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
  scene = scene * 0.5 + 0.5;

  // Warm vintage color grading — amber/sepia tones
  vec3 warm = vec3(0.95, 0.8, 0.5);
  vec3 cool = vec3(0.3, 0.25, 0.4);
  vec3 color = mix(cool, warm, scene);

  // Palette influence
  vec3 palColor = hsv2rgb(vec3(uPalettePrimary, 0.4 * uPaletteSaturation, 0.6));
  color = mix(color, palColor, 0.25);

  // Audio reactivity — energy drives brightness
  color *= 0.5 + uEnergy * 0.4 + uRms * 0.2;

  // Light leaks — overexposed edges with color bleeding
  float leakAngle = t * 0.3 + uSectionIndex * 1.5;
  vec2 leakDir = vec2(cos(leakAngle), sin(leakAngle));
  float leak1 = smoothstep(0.4, 1.0, dot(normalize(centered + 0.01), leakDir));
  leak1 *= smoothstep(1.5, 0.3, length(centered));

  float leakAngle2 = t * 0.2 + 2.0;
  vec2 leakDir2 = vec2(cos(leakAngle2), sin(leakAngle2));
  float leak2 = smoothstep(0.5, 1.0, dot(normalize(centered + 0.01), leakDir2));
  leak2 *= smoothstep(1.2, 0.5, length(centered));

  vec3 leakColor1 = hsv2rgb(vec3(0.08, 0.8, 1.0)); // Orange
  vec3 leakColor2 = hsv2rgb(vec3(0.95, 0.6, 0.9)); // Red-magenta

  float leakIntensity = 0.15 + uEnergy * 0.25;
  color += leakColor1 * leak1 * leakIntensity;
  color += leakColor2 * leak2 * leakIntensity * 0.6;

  // Sprocket hole simulation — dark vertical bands at edges
  float sprocketEdge = smoothstep(0.0, 0.04, abs(uv.x - 0.03)) *
                        smoothstep(0.0, 0.04, abs(uv.x - 0.97));
  // Sprocket holes — periodic dark rectangles
  float sprocketY = fract(uv.y * 8.0 + t * 0.5);
  float hole = step(0.3, sprocketY) * step(sprocketY, 0.7);
  float sprocketMask = mix(1.0, 0.0,
    (1.0 - sprocketEdge) * hole * 0.3);
  color *= sprocketMask;

  // Film grain (uses shared filmGrain from noise.ts — returns warm-tinted vec3)
  float grainTime = floor(t * 15.0) / 15.0;
  color += filmGrain(uv, grainTime) * 0.06;

  // Vertical scratches — random thin lines
  float scratch = smoothstep(0.001, 0.0, abs(uv.x - hash(floor(t * 3.0)) ));
  scratch *= hash(floor(t * 3.0) + 0.5);
  color += scratch * 0.15;

  // Frame flicker — subtle brightness variation
  float flicker = 0.95 + 0.05 * sin(t * 24.0 * PI);
  flicker *= 0.97 + 0.03 * hash(floor(t * 24.0));
  color *= flicker;

  // Beat-triggered gate flicker (projector stutter)
  float bp = beatPulse(uMusicalTime);
  float gateFlicker = 1.0 - bp * 0.06;
  color *= gateFlicker;

  // Vignette — heavy, like a projector hotspot
  float vig = 1.0 - smoothstep(0.3, 1.0, length(centered));
  vig = 0.4 + vig * 0.6;
  color *= vig;

  // Clamp to valid range
  color = clamp(color, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
`;
