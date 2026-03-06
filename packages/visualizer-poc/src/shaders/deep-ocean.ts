/**
 * Deep Ocean — underwater caustics and god rays shader.
 * Camera drifting through deep blue-green water with caustic light patterns.
 * Designed for quiet passages (Row Jimmy, Morning Dew intros).
 *
 * Audio reactivity:
 *   uEnergy     → surface chop, fog distance, bioluminescence (inverse)
 *   uBass       → god ray pulse intensity
 *   uHighs      → caustic sharpness/detail
 *   uOnsetSnap  → caustic pattern distortion
 *   uSlowEnergy → particle drift speed, ambient sway
 *   uPalettePrimary   → water body color (deep blue-green)
 *   uPaletteSecondary → caustic/god ray highlight color
 */

import { noiseGLSL } from "./noise";

export const deepOceanVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const deepOceanFrag = /* glsl */ `
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
uniform float uSlowEnergy;
uniform vec4 uContrast0;
uniform vec4 uContrast1;

varying vec2 vUv;

#define PI 3.14159265

// --- Tileable Water Caustic (joltz0r / Dave_Hoskins technique) ---
// Iterative trig-based caustic: 5 iterations of sin/cos folding produce
// sharp, physically plausible light networks. Cheaper than 3-layer Voronoi.
float causticPattern(vec2 p, float time, float scale) {
  p *= scale;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;

  for (int n = 0; n < 5; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(
      cos(t - i.x) + sin(t + i.y),
      sin(t - i.y) + cos(t + i.x)
    );
    c += 1.0 / length(vec2(
      p.x / (sin(i.x + t) / inten),
      p.y / (cos(i.y + t) / inten)
    ));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);

  // === WATER COLORS from palette ===
  float hue1 = uPalettePrimary;
  vec3 waterColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  // Push towards deep blue-green
  waterColor = mix(waterColor, vec3(0.02, 0.15, 0.25), 0.5);

  float hue2 = uPaletteSecondary;
  vec3 causticColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));
  causticColor = mix(causticColor, vec3(0.4, 0.8, 0.9), 0.3);

  // === AMBIENT SWAY: gentle UV distortion from slowEnergy ===
  vec2 swayUv = p;
  float swayAmt = 0.02 + slowE * 0.02;
  swayUv += swayAmt * vec2(
    sin(p.y * 3.0 + uTime * 0.3),
    cos(p.x * 2.5 + uTime * 0.25)
  );

  // Surface chop from energy: quiet = glassy, loud = churning
  float chop = energy * 0.04;
  swayUv += chop * vec2(
    snoise(vec3(p * 6.0, uTime * 1.5)),
    snoise(vec3(p * 6.0 + 50.0, uTime * 1.5))
  );

  // === CAUSTIC LIGHT PATTERNS: multiple overlapping layers ===
  float causticSharpness = 0.5 + highs * 0.5;

  // Onset distortion on caustic domain
  vec2 causticUv = swayUv;
  causticUv += onset * 0.05 * vec2(
    snoise(vec3(p * 3.0, uTime * 2.0)),
    snoise(vec3(p * 3.0 + 70.0, uTime * 2.0))
  );

  float c1 = causticPattern(causticUv, uTime * 0.4, 4.0);
  float c2 = causticPattern(causticUv + 0.3, uTime * 0.35 + 10.0, 6.0);
  float c3 = causticPattern(causticUv - 0.2, uTime * 0.45 + 20.0, 8.0);

  // Combine caustic layers: sharper with highs (pow sharpens peaks)
  float sharpPow = mix(1.0, 2.5, causticSharpness);
  float caustic = pow(c1, sharpPow);
  caustic += pow(c2, sharpPow) * 0.6;
  caustic += pow(c3, sharpPow) * 0.3;
  caustic = clamp(caustic, 0.0, 1.0);

  // Base water color
  vec3 col = waterColor * 0.3;

  // Add caustics
  col += causticColor * caustic * 0.35;

  // === GOD RAYS: vertical light shafts from above ===
  float bpH = beatPulseHalf(uMusicalTime);
  float rayIntensity = (0.3 + bass * 0.5) * (1.0 + bpH * 0.12);
  float rayX = swayUv.x * 3.0;
  float ray1 = smoothstep(0.8, 1.0, sin(rayX * 2.0 + uTime * 0.2)) * rayIntensity;
  float ray2 = smoothstep(0.85, 1.0, sin(rayX * 3.5 + uTime * 0.15 + 1.0)) * rayIntensity * 0.7;
  float ray3 = smoothstep(0.9, 1.0, sin(rayX * 1.5 + uTime * 0.25 + 2.5)) * rayIntensity * 0.5;
  float rays = ray1 + ray2 + ray3;
  // Rays fade toward bottom of screen
  float rayFade = smoothstep(-0.5, 0.5, swayUv.y);
  rays *= rayFade;
  col += causticColor * rays * 0.25;

  // === DEPTH FOG: clears with energy ===
  float fogDensity = mix(0.6, 0.2, energy);
  float fogNoise = fbm3(vec3(swayUv * 2.0, uTime * 0.05));
  float fog = fogDensity * (0.5 + fogNoise * 0.5);
  vec3 fogColor = waterColor * 0.15;
  col = mix(col, fogColor, fog * 0.6);

  // === BIOLUMINESCENT PARTICLES: active during quiet ===
  float quietness = smoothstep(0.35, 0.05, energy);
  if (quietness > 0.01) {
    for (int j = 0; j < 6; j++) {
      float fj = float(j);
      float seed = fj * 11.31;
      vec2 particlePos = vec2(
        snoise(vec3(seed, uTime * 0.04, 0.0)) * 0.7,
        snoise(vec3(0.0, seed, uTime * 0.03)) * 0.5
      );
      float dist = length(p - particlePos);
      float glow = smoothstep(0.04, 0.005, dist);
      float pulse = 0.5 + 0.5 * sin(uTime * 1.5 + seed * 3.0);
      vec3 bioColor = mix(causticColor, vec3(0.2, 0.9, 0.7), 0.5);
      col += bioColor * glow * pulse * quietness * 0.2;
    }
  }

  // === FLOATING DEBRIS / PLANKTON ===
  float driftSpeed = 0.02 + slowE * 0.03;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float seed = fk * 5.73 + 100.0;
    vec2 debrisPos = vec2(
      fract(seed * 0.37 + uTime * driftSpeed * 0.5) * 2.0 - 1.0,
      fract(seed * 0.53 + uTime * driftSpeed * 0.3) * 2.0 - 1.0
    );
    debrisPos *= 0.6;
    float dist = length(p - debrisPos);
    float debris = smoothstep(0.008, 0.002, dist);
    col += vec3(0.3, 0.5, 0.6) * debris * 0.08;
  }

  // === VIGNETTE ===
  float vigScale = mix(0.72, 0.65, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = waterColor * 0.02;
  col = mix(vigTint, col, vignette);

  // === LIGHT LEAK ===
  col += lightLeak(p, uTime, energy, uOnsetSnap);

  // === BLOOM: soft underwater glow ===
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float bloomThreshold = mix(0.4, 0.3, energy);
  float bloomAmount = max(0.0, lum - bloomThreshold) * 2.0;
  vec3 bloomColor = mix(col, causticColor, 0.3);
  col += bloomColor * bloomAmount * 0.3;

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, energy);

  // === FILM GRAIN ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.04, 0.02, energy);
  col += filmGrain(uv, grainTime) * grainIntensity;

  // === LIFTED BLACKS (cool blue tint for underwater) ===
  col = max(col, vec3(0.03, 0.05, 0.08));

  gl_FragColor = vec4(col, 1.0);
}
`;
