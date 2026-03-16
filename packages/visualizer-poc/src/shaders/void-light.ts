/**
 * Void Light — darkness-forward shader for Space passages and contemplation.
 *
 * Deep near-black background with a single drifting light point.
 * The anti-shader: when the music goes to nothing, the visuals should too.
 * Silence is visual too.
 *
 * Audio mapping:
 *   energy → light intensity
 *   chromaHue → light color
 *   bass → glow radius
 *   onsetSnap → sparkle triggers
 *   coherence → light stability (high = steadier)
 *   climax → additional lights at Fibonacci angles
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";

export const voidLightVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const voidLightFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

varying vec2 vUv;

// Palette color from hue
vec3 paletteColor(float hue, float sat) {
  float h = hsvToCosineHue(hue);
  vec3 col = 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
  return mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, sat);
}

// Golden ratio for Fibonacci-spaced angles
const float PHI = 1.618033988749;

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  float t = uDynamicTime;

  // ─── Deep near-black background ───
  vec3 col = vec3(0.01, 0.008, 0.015);

  // Subtle background texture (barely visible noise)
  float bgNoise = snoise(vec3(p * 3.0, t * 0.02)) * 0.008;
  col += vec3(bgNoise * 0.5, bgNoise * 0.3, bgNoise);

  // ─── Primary drifting light point ───
  // Position via slow simplex noise (coherence = stability)
  float stability = 0.3 + uCoherence * 0.7; // high coherence = steadier
  float driftSpeed = 0.08 / stability;
  vec2 lightPos = vec2(
    snoise(vec3(t * driftSpeed, 0.0, 0.0)) * 0.4,
    snoise(vec3(0.0, t * driftSpeed, 10.0)) * 0.3
  );

  // Distance to light
  float dist = length(p - lightPos);

  // Glow radius: bass-driven
  float glowRadius = 0.08 + uBass * 0.15;

  // Intensity from energy
  float lightIntensity = uEnergy * 3.0;

  // Inverse-square falloff (physically motivated)
  float glow = lightIntensity / (1.0 + dist * dist / (glowRadius * glowRadius));

  // Light color from chromaHue + palette
  vec3 lightColor = paletteColor(
    mix(uPalettePrimary, uChromaHue, 0.4),
    uPaletteSaturation * 0.8
  );

  col += lightColor * glow;

  // ─── Onset sparkles: brief secondary lights on transients ───
  float sparkleDecay = 10.0; // fade in ~10 frames (0.33s)
  if (uOnsetSnap > 0.2) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float sparkleAngle = fi * PHI * 6.28318 + uMusicalTime * 0.5;
      float sparkleRadius = 0.15 + fi * 0.1;
      vec2 sparklePos = lightPos + vec2(cos(sparkleAngle), sin(sparkleAngle)) * sparkleRadius;

      float sDist = length(p - sparklePos);
      float sparkle = uOnsetSnap * 0.5 / (1.0 + sDist * sDist * 200.0);

      vec3 sparkleCol = paletteColor(uPaletteSecondary + fi * 0.1, uPaletteSaturation);
      col += sparkleCol * sparkle;
    }
  }

  // ─── Build/climax: additional lights at Fibonacci-spaced angles ───
  float buildGate = smoothstep(0.5, 2.0, uClimaxPhase) * uClimaxIntensity;
  if (buildGate > 0.01) {
    int extraLights = 2 + int(buildGate * 4.0);
    for (int i = 0; i < 6; i++) {
      if (i >= extraLights) break;
      float fi = float(i + 1);
      float angle = fi * PHI * 6.28318 + t * 0.1;
      float radius = 0.2 + fi * 0.08;
      vec2 extraPos = vec2(cos(angle), sin(angle)) * radius;

      float eDist = length(p - extraPos);
      float eGlow = buildGate * uEnergy * 2.0 / (1.0 + eDist * eDist / (glowRadius * glowRadius * 0.5));

      vec3 eColor = paletteColor(uPalettePrimary + fi * 0.06, uPaletteSaturation * 0.6);
      col += eColor * eGlow;
    }
  }

  // ─── Heavy film grain (0.06-0.08 range — much more than other shaders) ───
  float grainTime = floor(uTime * 15.0) / 15.0;
  float grainIntensity = 0.06 + uEnergy * 0.02;
  col += filmGrainRes(uv, grainTime, uResolution.y) * grainIntensity;

  // ─── NO stage flood fill — void should be dark ───
  // ─── NO bloom — darkness is the point ───

  // Minimal tone mapping (keep dark areas dark)
  col = max(col, vec3(0.0));
  col = 1.0 - exp(-col * 1.5);

  gl_FragColor = vec4(col, 1.0);
}
`;
