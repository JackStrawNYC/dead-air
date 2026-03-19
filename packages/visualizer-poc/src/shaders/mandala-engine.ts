/**
 * Mandala Engine — concentric petal rings in polar coords with N-fold symmetry.
 *
 * Symmetry order driven by chord index: C=3, D=4, ..., B=12 petals.
 * FBM domain warping creates organic, breathing mandala patterns.
 *
 * Audio mapping:
 *   bass           -> rotation speed (pushes mandala spin)
 *   melodicPitch   -> complexity (more rings at higher pitch)
 *   harmonicTension -> distortion amount (warps symmetry axes)
 *   beatStability   -> symmetry fidelity (tight = clean, loose = fractured)
 *   energy         -> brightness + ring count
 *   chromaHue      -> color rotation
 *   climaxPhase    -> stealie SDF emergence at center
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const mandalaEngineVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const mandalaEngineFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'light', flareEnabled: false, paletteCycleEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  float energy = clamp(uEnergy, 0.0, 1.0);
  float t = uDynamicTime;

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  // Jam: faster rotation, more rings. Space: still, minimal. Chorus: extra petals.
  float sectionRotMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.2, sChorus);
  float sectionRingMod = mix(0.0, 3.0, sJam) + mix(0.0, -2.0, sSpace) + mix(0.0, 1.0, sChorus);
  t *= sectionRotMod;

  // ─── N-fold symmetry from chord index ───
  // Map chord index (0-23) to 3-12 petals
  float rawN = mod(uChordIndex, 12.0);
  float N = mix(3.0, 12.0, rawN / 11.0);
  N = floor(N + 0.5); // Snap to integer

  // Beat stability modulates symmetry precision
  // High stability = clean N-fold, low = slightly fractured
  float stabilityWarp = (1.0 - uBeatStability) * 0.15;

  // ─── Polar coordinates with rotation ───
  float angle = atan(p.y, p.x);
  float radius = length(p);

  // Bass-driven rotation
  float rotation = t * 0.2 + uBass * 1.5 + uStemBass * 0.8;
  angle += rotation;

  // Fold angle into N-fold symmetry
  float sector = TAU / N;
  float foldedAngle = mod(angle + sector * 0.5, sector) - sector * 0.5;
  foldedAngle = abs(foldedAngle);

  // Harmonic tension warps the fold lines
  foldedAngle += sin(radius * 8.0 + t * 0.5) * uHarmonicTension * 0.3;
  // Beat stability jitter
  foldedAngle += snoise(vec3(p * 3.0, t * 0.3)) * stabilityWarp;

  // ─── FBM domain warping for organic feel ───
  vec2 polarP = vec2(foldedAngle * 2.0, radius);

  // Melodic pitch controls complexity (more FBM octaves at high pitch)
  float complexity = 2.0 + uMelodicPitch * 4.0 + energy * 2.0;
  float warpAmount = 0.3 + uHarmonicTension * 0.5;

  vec3 warpSeed = vec3(polarP * complexity, t * 0.15);
  float warp1 = fbm(warpSeed);
  float warp2 = fbm(warpSeed + vec3(5.2, 1.3, 2.7));
  vec2 warpedP = polarP + vec2(warp1, warp2) * warpAmount;

  // ─── Petal ring pattern ───
  // Concentric rings modulated by angle
  float ringCount = max(1.0, 3.0 + energy * 5.0 + uMelodicPitch * 3.0 + sectionRingMod);
  float ringPattern = sin(warpedP.y * ringCount * PI) * 0.5 + 0.5;

  // Petal shape: angular modulation
  float petalShape = cos(warpedP.x * N) * 0.5 + 0.5;
  petalShape = pow(petalShape, mix(0.5, 2.0, uBeatStability));

  // Combined pattern
  float pattern = ringPattern * petalShape;

  // Radial falloff (mandala fades at edges)
  float falloff = 1.0 - smoothstep(0.3, 0.8, radius);
  pattern *= falloff;

  // ─── Color from palette + chroma hue ───
  float hue1 = hsvToCosineHue(uPalettePrimary) + uChromaHue * 0.15;
  float hue2 = hsvToCosineHue(uPaletteSecondary) + uChromaShift * 0.1;

  vec3 color1 = 0.5 + 0.5 * cos(TAU * (hue1 + vec3(0.0, 0.33, 0.67)));
  vec3 color2 = 0.5 + 0.5 * cos(TAU * (hue2 + vec3(0.0, 0.33, 0.67)));

  // Blend colors based on radius and pattern
  vec3 col = mix(color2, color1, pattern);

  // Ring edges glow brighter
  float ringEdge = abs(sin(warpedP.y * ringCount * PI));
  ringEdge = pow(ringEdge, 8.0);
  col += vec3(0.3) * ringEdge * energy;

  // Petal center glow
  float petalGlow = pow(petalShape, 4.0) * ringPattern;
  col += color1 * petalGlow * 0.4;

  // ─── Background: dark with subtle FBM texture ───
  float bg = fbm3(vec3(p * 2.0, t * 0.1)) * 0.03;
  col = mix(vec3(bg), col, smoothstep(0.0, 0.15, pattern));

  // Energy brightness
  col *= 0.6 + energy * 0.6;

  // ─── Stealie emergence during climax ───
  float noiseField = fbm3(vec3(p * 2.0, t * 0.15));
  vec3 palCol1 = color1;
  vec3 palCol2 = color2;
  col += stealieEmergence(p, uTime, energy, uBass, palCol1, palCol2, noiseField, uClimaxPhase);

  // ─── Post-processing ───
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
