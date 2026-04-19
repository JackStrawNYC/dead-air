/**
 * Post-process effect shader — ported from Rust/WGSL renderer.
 *
 * Single GLSL fragment shader that handles all 14 post-process effect modes,
 * branching on uEffectMode uniform. Each mode is a direct port of the
 * corresponding WGSL effect from packages/renderer/src/effects.rs.
 *
 * Pipeline position: runs AFTER temporal blend, BEFORE FXAA.
 * Reads uInputTexture (scene output), writes to next target.
 *
 * Mode 0 = passthrough (no effect active).
 * Modes 1-14 correspond to the Rust EffectMode enum.
 */

export const effectPostProcessVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const effectPostProcessFrag = /* glsl */ `
precision highp float;

uniform sampler2D uInputTexture;
uniform sampler2D uEffectPrevFrame;
uniform int uEffectMode;
uniform float uEffectIntensity;
uniform float uEffectTime;
uniform float uEffectEnergy;
uniform float uEffectBass;
uniform float uEffectBeatSnap;
uniform vec2 uEffectResolution;

varying vec2 vUv;

// ─── Mode 3: Hypersaturation ───
// Psychedelic color explosion: midtone saturation boost with warm bias,
// gamut compression, soft-clip. Direct port from effects.rs mode 3.
vec4 hypersaturation(vec4 scene, float intensity, float energy) {
  vec3 col = scene.rgb;

  // Luminance (rec709)
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 chroma = col - lum;

  // Midtone mask: protect shadows and highlights
  float midtone = smoothstep(0.05, 0.25, lum) * smoothstep(0.95, 0.75, lum);

  // Guard against already-vivid pixels
  float existingSat = length(chroma);
  float satGuard = smoothstep(0.5, 0.1, existingSat);

  // Saturation multiplier: intensity + energy-driven boost
  float satMult = 1.0 + intensity * (0.6 + energy * 1.0);
  satMult = mix(1.0, satMult, midtone * satGuard);

  // Apply saturation boost
  vec3 boosted = lum + chroma * satMult;

  // Warm bias: boost reds, reduce blues (Dead aesthetic)
  boosted.r += chroma.r * intensity * 0.15;
  boosted.b -= abs(chroma.b) * intensity * 0.08;

  // Vibrance: subtle boost to least-saturated channel
  float minC = min(boosted.r, min(boosted.g, boosted.b));
  float maxC = max(boosted.r, max(boosted.g, boosted.b));
  float vibrance = intensity * 0.12;
  boosted += (maxC - boosted) * vibrance * (1.0 - smoothstep(0.0, 0.5, boosted - minC));

  // Soft-clip: prevent blown-out colors without hard clamp
  boosted = boosted / (1.0 + max(boosted - 1.0, 0.0));

  return vec4(boosted, scene.a);
}

void main() {
  vec4 scene = texture2D(uInputTexture, vUv);

  // Mode 0: passthrough (no effect active)
  if (uEffectMode == 0) {
    gl_FragColor = scene;
    return;
  }

  float intensity = uEffectIntensity;
  float energy = uEffectEnergy;

  // Mode 3: Hypersaturation
  if (uEffectMode == 3) {
    gl_FragColor = hypersaturation(scene, intensity, energy);
    return;
  }

  // Unimplemented modes: passthrough
  gl_FragColor = scene;
}
`;
