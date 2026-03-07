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
uniform vec4 uChroma0;
uniform vec4 uChroma1;
uniform vec4 uChroma2;
uniform vec2 uCamOffset;

varying vec2 vUv;

#define PI 3.14159265
#define VOLSTEPS 64
#define LIGHT_STEPS 6

// --- Tileable Water Caustic (joltz0r technique) ---
float causticPattern(vec2 p, float time, float scale) {
  p *= scale;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
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

  // === PARALLAX DEPTH ===
  float preDepth = length(p) * 0.5;
  p = parallaxUV(p, uCamOffset, preDepth);

  // === WATER COLORS from palette ===
  float hue1 = uPalettePrimary;
  vec3 waterColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  waterColor = mix(waterColor, vec3(0.02, 0.15, 0.25), 0.5);

  float hue2 = uPaletteSecondary;
  vec3 causticColorBase = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));
  causticColorBase = mix(causticColorBase, vec3(0.4, 0.8, 0.9), 0.3);
  // Chroma-colored caustics from Pillar 4
  vec3 chromaCaustic = chromaColor(p, uChroma0, uChroma1, uChroma2, energy);
  vec3 causticColor = mix(causticColorBase, causticColorBase + chromaCaustic * 0.8, 0.35);

  // === RAY SETUP: looking forward through water ===
  vec3 camPos = vec3(p.x * 0.5, p.y * 0.5 - 0.5, 0.0);
  vec3 rd = normalize(vec3(p.x * 0.3, p.y * 0.3 - 0.1, 1.0));

  // Light comes from above surface
  vec3 lightDir = normalize(vec3(0.2, 1.0, -0.3));

  // Wavelength-dependent absorption coefficients (R absorbs fastest → natural depth color)
  vec3 absorption = vec3(0.45, 0.18, 0.06);

  // === 64-STEP VOLUMETRIC UNDERWATER RAYMARCHING ===
  vec3 accColor = vec3(0.0);
  vec3 T = vec3(1.0);  // Per-channel transmittance for wavelength absorption

  for (int i = 0; i < VOLSTEPS; i++) {
    float travelDist = float(i) * 0.15 + 0.1;
    vec3 pos = camPos + rd * travelDist;

    // Noise-driven particle density (plankton/sediment scattering medium)
    float particleDensity = fbm3(vec3(pos.xz * 2.0 + uTime * 0.02, pos.y * 1.5 + uTime * 0.01));
    particleDensity = max(0.0, particleDensity * 0.3 + 0.15);
    particleDensity *= 1.0 + slowE * 0.3;

    float stepSize = 0.15;

    // Wavelength-dependent Beer's law (per channel)
    vec3 channelAbsorption = exp(-absorption * particleDensity * stepSize);
    vec3 absorbed = vec3(1.0) - channelAbsorption;

    // Caustic focusing: project caustic pattern at this depth
    float depth01 = travelDist / 9.6; // normalize to 0-1 over ray distance
    float causticScale = mix(4.0, 8.0, depth01);
    vec2 causticUv = pos.xz * 0.5 + onset * 0.03 * vec2(snoise(vec3(pos.xz, uTime)), snoise(vec3(pos.xz + 50.0, uTime)));
    float caustic = causticPattern(causticUv, uTime * 0.4, causticScale);
    caustic *= smoothstep(1.0, 0.0, depth01) * (0.5 + highs * 0.5); // brighter near surface

    // Volumetric god rays: trace toward surface light
    float lightDensity = 0.0;
    for (int j = 0; j < LIGHT_STEPS; j++) {
      float lt = float(j) * 0.2 + 0.1;
      vec3 lightPos = pos + lightDir * lt;
      float ld = fbm3(vec3(lightPos.xz * 2.0, lightPos.y * 1.5 + uTime * 0.01));
      lightDensity += max(0.0, ld * 0.3 + 0.1) * 0.2;
    }
    float lightReach = beerLaw(lightDensity * 2.0, 1.0);

    // Henyey-Greenstein forward scattering
    float cosTheta = dot(rd, lightDir);
    float scatter = hgPhase(cosTheta, 0.6) * particleDensity;

    // Emission: scattered surface light + caustic patterns
    vec3 waterEmit = waterColor * 0.3 * lightReach * particleDensity;
    waterEmit += causticColor * caustic * lightReach * 0.4;
    waterEmit += causticColor * scatter * lightReach * 0.5;

    // Beat pulse on god rays
    float bpH = beatPulseHalf(uMusicalTime);
    waterEmit *= 1.0 + bpH * 0.08 * lightReach;

    accColor += waterEmit * absorbed * T;
    T *= channelAbsorption;

    if (max(T.r, max(T.g, T.b)) < 0.01) break;
  }

  vec3 col = accColor;

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

  // === VIGNETTE (counterpoint: opens at peaks, closes at valleys) ===
  float vigInverse = inverseEnergy(energy);
  float vigScale = mix(0.60, 0.75, vigInverse);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = waterColor * 0.02;
  col = mix(vigTint, col, vignette);

  // === LIGHT LEAK ===
  col += lightLeak(p, uTime, energy, uOnsetSnap);

  // === COLOR GRADING: deep teal shadows, caustic gold highlights ===
  col = colorGrade(col, vec3(0.0, 0.08, 0.12), vec3(0.9, 1.0, 0.8), 1.1, 1.05);

  // === S-CURVE COLOR GRADING ===
  col = sCurveGrade(col, energy);

  // === HALATION: warm film bloom ===
  col = halation(vUv, col, energy);

  // === FILM GRAIN ===
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = mix(0.04, 0.02, energy);
  col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity;

  // === LIFTED BLACKS (cool blue tint for underwater) ===
  col = max(col, vec3(0.03, 0.05, 0.08));

  gl_FragColor = vec4(col, 1.0);
}
`;
