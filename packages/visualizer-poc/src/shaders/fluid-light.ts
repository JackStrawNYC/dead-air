/**
 * Fluid Light — Navier-Stokes-inspired liquid light show shader.
 *
 * Faked fluid via multi-octave turbulent advection (not true NS — fits
 * single-pass architecture). Inspired by Bill Ham's liquid light projections:
 * oil, water, and dye between glass slides on overhead projectors.
 *
 * Audio mapping:
 *   bass → viscosity (high bass = thick, slow flow)
 *   highs → diffusion (high treble = thin, spreading color)
 *   onsetSnap → blob injection (new color blobs at seeded positions)
 *   energy → temperature (high energy = rising warm currents)
 *   chromaHue → color injection hue
 *   beatSnap → pulsation (blob breathing)
 *   musicalTime → convection rotation direction
 *   jamDensity → blob count (3-8)
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";

export const fluidLightVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const fluidLightFrag = /* glsl */ `
precision highp float;

${noiseGLSL}

${sharedUniformsGLSL}

varying vec2 vUv;

// ─── Fluid helpers ───

// Turbulent velocity field: multi-scale FBM-based flow
vec2 velocityField(vec2 p, float t) {
  float viscosity = 0.3 + uBass * 0.7; // bass = thick flow
  float speed = 0.15 / (0.5 + viscosity);

  vec2 v;
  // Large-scale convection
  float angle = uMusicalTime * 0.3;
  v.x = snoise(vec3(p * 1.5, t * speed)) * 0.8;
  v.y = snoise(vec3(p * 1.5 + 100.0, t * speed)) * 0.8;

  // Medium-scale turbulence
  v.x += snoise(vec3(p * 3.0, t * speed * 1.5)) * 0.3;
  v.y += snoise(vec3(p * 3.0 + 50.0, t * speed * 1.5)) * 0.3;

  // Convection rotation (musical time driven)
  float rotAngle = sin(angle) * 0.5;
  float ca = cos(rotAngle), sa = sin(rotAngle);
  v = vec2(ca * v.x - sa * v.y, sa * v.x + ca * v.y);

  // Temperature: energy drives upward current
  v.y += uEnergy * 0.4;

  return v;
}

// Multi-step coordinate advection (flowing trails)
vec2 advect(vec2 p, float t, int steps) {
  float dt = 0.02;
  vec2 pos = p;
  for (int i = 0; i < 4; i++) {
    if (i >= steps) break;
    vec2 vel = velocityField(pos, t);
    pos += vel * dt;
  }
  return pos;
}

// Smooth minimum for metaball-like blob merging
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Palette color from hue (cosine palette)
vec3 paletteColor(float hue, float saturation) {
  float h = hsvToCosineHue(hue);
  vec3 col = 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
  return mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, saturation);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // Camera offset for parallax
  p += uCamOffset * 0.0005;

  float t = uDynamicTime;

  // ─── Blob field ───
  // 3-8 metaball-like blobs via smooth-min
  int blobCount = 3 + int(uJamDensity * 5.0);
  float blobField = 10.0;
  vec3 blobColor = vec3(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < 8; i++) {
    if (i >= blobCount) break;
    float fi = float(i);

    // Seeded blob positions (advected through velocity field)
    vec2 seed = vec2(
      sin(fi * 2.39996 + t * 0.1) * 0.6,
      cos(fi * 1.61803 + t * 0.08) * 0.4
    );

    // Advect blob center through fluid
    vec2 blobPos = advect(seed, t + fi * 10.0, 4);

    // Blob radius: bass-driven breathing + beat pulse
    float baseRadius = 0.15 + sin(fi * 3.7) * 0.05;
    float breathing = 1.0 + uBeatSnap * 0.3 + uBass * 0.2;
    float radius = baseRadius * breathing;

    // Distance to blob
    float d = length(p - blobPos) / radius;

    // Smooth-min merge
    blobField = smin(blobField, d, 0.8);

    // Per-blob color from palette + chroma
    float blobHue = uPalettePrimary + fi * 0.08 + uChromaHue * 0.3;
    if (mod(fi, 2.0) < 1.0) blobHue = uPaletteSecondary + fi * 0.05;
    vec3 col = paletteColor(blobHue, uPaletteSaturation);

    // Onset injection: bright flash at blob positions on transients
    col *= 1.0 + uOnsetSnap * 2.0 * smoothstep(0.5, 0.0, d);

    // Weight by inverse distance
    float w = 1.0 / (1.0 + d * d * 4.0);
    blobColor += col * w;
    totalWeight += w;
  }

  if (totalWeight > 0.0) blobColor /= totalWeight;

  // ─── Surface tension rings (oil-on-glass signature) ───
  // Edge detection on blob field: bright outlines where gradient is steep
  float dx = dFdx(blobField);
  float dy = dFdy(blobField);
  float gradient = length(vec2(dx, dy));
  float rings = smoothstep(0.0, 2.0, gradient) * 1.5;

  // ─── Diffusion (treble-driven color bleed) ───
  float diffusion = 0.5 + uHighs * 1.5;
  vec2 advectedUv = advect(p, t, 4);
  float diffuseNoise = fbm(vec3(advectedUv * diffusion, t * 0.3));

  // ─── Compose layers ───
  // Base: blob field coloring
  float blobIntensity = smoothstep(1.5, 0.0, blobField);
  vec3 col = blobColor * blobIntensity;

  // Surface tension rings: bright palette-colored outlines
  vec3 ringColor = paletteColor(uPalettePrimary + 0.15, uPaletteSaturation);
  col += ringColor * rings * 0.6;

  // Diffusion overlay: treble-driven flowing patterns
  vec3 diffuseColor = paletteColor(uPaletteSecondary + diffuseNoise * 0.2, uPaletteSaturation * 0.8);
  col = mix(col, diffuseColor, diffuseNoise * 0.15 * uHighs);

  // Energy-driven warmth
  col *= 0.7 + uEnergy * 0.6;

  // ─── Stage flood fill (no dead black) ───
  col = stageFloodFill(col, uv, t, uEnergy, uPalettePrimary, uPaletteSecondary);

  // ─── Stealie emergence during climax ───
  float noiseField = fbm(vec3(p * 2.0, t * 0.2));
  vec3 col1 = paletteColor(uPalettePrimary, uPaletteSaturation);
  vec3 col2 = paletteColor(uPaletteSecondary, uPaletteSaturation);
  col += stealieEmergence(p, t, uEnergy, uBass, col1, col2, noiseField, uClimaxPhase);

  // ─── Post-processing ───
  // Halation
  col = halation(uv, col, uEnergy);

  // Chromatic aberration (energy-driven)
  float caAmount = 0.002 + uEnergy * 0.008;
  col = applyCA(col, uv, caAmount);

  // Cinematic grade
  col = cinematicGrade(col, uEnergy);

  // Film grain
  float grainTime = floor(uTime * 15.0) / 15.0;
  col += filmGrainRes(uv, grainTime, uResolution.y) * 0.035;

  gl_FragColor = vec4(col, 1.0);
}
`;
