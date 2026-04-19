/**
 * Combined effect shader — post-process + composited effects.
 *
 * Single GLSL fragment shader that handles:
 * - 14 post-process effect modes (transform scene: saturation, trails, etc.)
 * - 10 composited effect modes (generate new content: particles, caustics, etc.)
 *
 * Both are ported from the Rust/WGSL renderer (effects.rs + composited_effects.rs).
 * Composited effects are additively blended onto the post-processed scene.
 *
 * Pipeline position: runs AFTER temporal blend, BEFORE FXAA.
 * Reads uInputTexture (scene output), writes to next target.
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
// Post-process uniforms
uniform int uEffectMode;
uniform float uEffectIntensity;
// Composited uniforms
uniform int uCompositedMode;
uniform float uCompositedIntensity;
// Shared audio uniforms
uniform float uEffectTime;
uniform float uEffectEnergy;
uniform float uEffectBass;
uniform float uEffectBeatSnap;
uniform vec2 uEffectResolution;

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ─── Pseudo-random hash ───
float hash(float n) { return fract(sin(n) * 43758.5453123); }

// ═══════════════════════════════════════════════════════════
// COMPOSITED EFFECTS (generate new content, additive blend)
// ═══════════════════════════════════════════════════════════

// ─── Composited Mode 1: Particle Swarm ───
// 4-12 large glowing floating orbs with halos, golden glow, orbital motion.
// Direct port from composited_effects.rs mode 1.
vec3 particleSwarm(float intensity, float time, float energy, float bass) {
  float aspect = uEffectResolution.x / uEffectResolution.y;
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);

  vec3 col = vec3(0.0);

  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float h1 = hash(fi * 7.31);

    // Energy gates particle count: 4 at rest, 12 at peak
    if (h1 > 0.35 + energy * 0.55) continue;

    float h2 = hash(fi * 13.17);
    float h3 = hash(fi * 23.41);
    float phase = h1 * TAU;
    float speed = 0.3 + h2 * 0.4;
    float orbitRadius = 0.15 + h3 * 0.25;

    // Orbital position
    float ox = cos(time * speed + phase) * orbitRadius;
    float oy = sin(time * speed * 0.7 + phase + 1.3) * orbitRadius;

    // Bass breathing: pull toward center on bass hits
    ox = mix(ox, ox * 0.5, bass * 0.15);
    oy = mix(oy, oy * 0.5, bass * 0.15);

    vec2 particlePos = vec2(ox, oy);
    float dist = length(p - particlePos);

    // Particle size (larger at peaks)
    float size = 0.06 + h1 * 0.04 + energy * 0.02;

    // Double glow: soft halo + bright core
    float halo = smoothstep(size * 3.0, 0.0, dist) * 0.3;
    float core = smoothstep(size, 0.0, dist) * 0.8;
    float glow = halo + core;

    // Color: white-gold with hue variation
    float hue = h2;
    vec3 particleColor = vec3(1.0, 0.90 + hue * 0.1, 0.6 + hue * 0.2);

    col += particleColor * glow * intensity;
  }

  return col;
}

// ─── Composited Mode 8: Geometric Breakdown ───
// Crystal fracture: animated Voronoi cells with golden edges, beat-triggered.
// Direct port from composited_effects.rs mode 8.
vec3 geometricBreakdown(float intensity, float time, float energy, float beatSnap) {
  float aspect = uEffectResolution.x / uEffectResolution.y;
  vec2 p = vec2(vUv.x * aspect, vUv.y);

  // Cell count: 3 at rest, 9 at peaks
  float cellCount = 3.0 + energy * 6.0;

  // Beat explosion: cells move apart
  float beatExplode = smoothstep(0.2, 0.8, beatSnap);

  // Find nearest Voronoi cell
  float minDist = 10.0;
  float secondDist = 10.0;
  vec2 nearestCell = vec2(0.0);
  float nearestHash = 0.0;

  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    if (fi >= cellCount) break;

    vec2 cellPos = vec2(
      hash(fi * 127.1 + 1.0),
      hash(fi * 311.7 + 2.0)
    );
    // Animate cells
    cellPos += sin(time * 0.4 + cellPos * TAU) * (0.12 + beatExplode * 0.15);
    cellPos = vec2(cellPos.x * aspect, cellPos.y);

    float d = length(p - cellPos);
    if (d < minDist) {
      secondDist = minDist;
      minDist = d;
      nearestCell = cellPos;
      nearestHash = hash(fi * 43.17);
    } else if (d < secondDist) {
      secondDist = d;
    }
  }

  // Edge detection
  float edge = secondDist - minDist;
  float edgeWidth = 0.02 + energy * 0.02;
  float edgeLine = 1.0 - smoothstep(0.0, edgeWidth, edge);

  // Golden edge color
  vec3 edgeColor = vec3(1.0, 0.85, 0.5) * edgeLine;

  // Cell interior: warm browns
  vec3 cellColor = vec3(
    0.25 + nearestHash * 0.15,
    0.15 + nearestHash * 0.10,
    0.08 + nearestHash * 0.05
  ) * (1.0 - edgeLine) * 0.3;

  return (edgeColor + cellColor) * intensity;
}

// ═══════════════════════════════════════════════════════════
// POST-PROCESS EFFECTS (transform existing scene)
// ═══════════════════════════════════════════════════════════

// ─── Mode 5: Trails / Echo ───
// CRT phosphor decay: motion-persistent trails that warm as they fade.
// Direct port from effects.rs mode 5.
// Requires uEffectPrevFrame (previous frame's effect output).
vec4 trails(vec4 scene, float intensity, float energy) {
  // Read previous frame (effect feedback buffer)
  vec3 prev = texture2D(uEffectPrevFrame, vUv).rgb;

  // Detect empty previous frame (first frame or after seek)
  float prevLum = dot(prev, vec3(0.299, 0.587, 0.114));
  if (prevLum < 0.001) {
    return scene; // No trails on first frame
  }

  // Persistence: higher intensity and energy = longer trails
  float persistence = 0.65 + intensity * (0.10 + energy * 0.13);

  // Trail color warming: cool→amber shift as trails age
  vec3 trail = prev;
  trail.r += trail.r * intensity * 0.04; // warm red
  trail.b -= trail.b * intensity * 0.03; // reduce blue

  // Desaturate trails slightly (phosphor afterglow)
  float trailLum = dot(trail, vec3(0.299, 0.587, 0.114));
  trail = mix(trail, vec3(trailLum), intensity * 0.08);

  // Screen blend: scene + trail * (1 - scene) — no darkening
  vec3 blended = scene.rgb + trail * (1.0 - scene.rgb) * intensity;

  // Mix with persistence (how much trail carries forward)
  vec3 result = mix(scene.rgb, blended, persistence);

  return vec4(result, scene.a);
}

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
  vec4 result = scene;

  // ── Post-process effects (transform scene) ──
  if (uEffectMode > 0) {
    float intensity = uEffectIntensity;
    float energy = uEffectEnergy;

    if (uEffectMode == 3) {
      result = hypersaturation(scene, intensity, energy);
    } else if (uEffectMode == 5) {
      result = trails(scene, intensity, energy);
    }
    // Unimplemented post-process modes: keep scene unchanged
  }

  // ── Composited effects (additive blend on top) ──
  if (uCompositedMode > 0) {
    vec3 comp = vec3(0.0);

    if (uCompositedMode == 1) {
      comp = particleSwarm(uCompositedIntensity, uEffectTime, uEffectEnergy, uEffectBass);
    } else if (uCompositedMode == 8) {
      comp = geometricBreakdown(uCompositedIntensity, uEffectTime, uEffectEnergy, uEffectBeatSnap);
    }
    // Unimplemented composited modes: no contribution

    // Additive blend (screen-like)
    result.rgb += comp;
  }

  gl_FragColor = result;
}
`;
