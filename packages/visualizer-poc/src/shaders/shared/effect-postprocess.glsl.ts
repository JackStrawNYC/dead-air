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

// ─── Composited Mode 2: Caustics ───
// Underwater light refraction: Voronoi cell edges at 3 scales,
// chromatic dispersion, warm golden-aqua. Direct port from composited_effects.rs mode 2.
vec3 caustics(float intensity, float time, float energy, float bass) {
  float aspect = uEffectResolution.x / uEffectResolution.y;
  vec3 col = vec3(0.0);

  // Bass-reactive wave amplitude
  float bassAmp = 0.3 + bass * 0.3;

  // 3 layers at different scales
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float scale = 5.0 + fl * 3.0; // 5, 8, 11 cells
    float speed = 0.8 + fl * 0.4;

    vec2 p = vec2(vUv.x * aspect, vUv.y) * scale;

    // Find nearest Voronoi cell
    float minDist = 10.0;
    float secondDist = 10.0;

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 cell = floor(p) + vec2(float(x), float(y));
        vec2 point = cell + vec2(
          hash(dot(cell, vec2(127.1, 311.7))),
          hash(dot(cell, vec2(269.5, 183.3)))
        );
        // Animate points with bass
        point += sin(time * speed * (1.0 + point.x * 2.0)) * bassAmp * 0.3;

        float d = length(p - point);
        if (d < minDist) { secondDist = minDist; minDist = d; }
        else if (d < secondDist) { secondDist = d; }
      }
    }

    // Edge detection: bright where cells meet
    float edge = secondDist - minDist;
    // Sharpness: energy-reactive
    float sharpness = 2.0 + energy * 6.0;
    float caustic = pow(max(1.0 - edge * sharpness, 0.0), 2.0);

    col += caustic * (0.33 + fl * 0.1);
  }

  // Warm golden-aqua color (not clinical blue)
  vec3 causticColor = vec3(1.0, 0.85, 0.55) * col;

  return causticColor * intensity * 0.65;
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

// ─── Mode 10: Light Leak Burst ───
// Film camera light leak: warm amber/gold/magenta drifting sources,
// horizontal streak, edge vignette. Direct port from effects.rs mode 10.
vec4 lightLeak(vec4 scene, float intensity, float time, float beatSnap) {
  vec2 uv = vUv;
  vec3 leak = vec3(0.0);

  // Beat-reactive glow strength
  float glowMult = 0.30 + beatSnap * 0.40;

  // 4 drifting leak sources
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    // Source position drifts over time
    float sx = 0.5 + sin(time * 0.03 + fi * 1.7) * 0.35;
    float sy = 0.5 + cos(time * 0.025 + fi * 2.3) * 0.3;

    // Elliptical falloff (wider horizontally, like anamorphic lens)
    float dx = (uv.x - sx) * 0.7;
    float dy = uv.y - sy;
    float dist = sqrt(dx * dx + dy * dy);

    float glow = smoothstep(0.65, 0.0, dist) * glowMult;

    // Warm spectral variation per source
    vec3 leakColor;
    if (i == 0) leakColor = vec3(1.0, 0.55, 0.15);       // amber
    else if (i == 1) leakColor = vec3(1.0, 0.75, 0.25);   // gold
    else if (i == 2) leakColor = vec3(0.9, 0.45, 0.55);   // magenta
    else leakColor = vec3(1.0, 0.65, 0.20);               // orange

    leak += leakColor * glow;
  }

  // Horizontal streak at varying Y position
  float streakY = 0.5 + sin(time * 0.015) * 0.3;
  float streak = smoothstep(0.20, 0.0, abs(uv.y - streakY)) * 0.15 * glowMult;
  leak += vec3(1.0, 0.7, 0.3) * streak;

  // Edge vignette leak
  float edgeDist = max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0;
  float edgeLeak = smoothstep(0.7, 1.0, edgeDist) * 0.2;
  leak += vec3(0.9, 0.4, 0.1) * edgeLeak;

  // Screen blend to avoid blown whites
  vec3 result = scene.rgb + leak * intensity * (1.0 - scene.rgb);

  return vec4(result, scene.a);
}

// ─── Mode 12: Moire Patterns ───
// Optical interference: 3 overlapping grids + circular rings, color fringing.
// Direct port from effects.rs mode 12.
vec4 moirePatterns(vec4 scene, float intensity, float energy, float time) {
  float aspect = uEffectResolution.x / uEffectResolution.y;
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);

  // Grid base frequency (tighter at peaks)
  float baseFreq = 35.0 + energy * 40.0;

  // 3 grids at 60° angles, slowly rotating
  float moire = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float angle = fi * 1.0472 + time * (0.01 + fi * 0.005); // 60° spacing + rotation
    float freq = baseFreq * (1.0 + fi * 0.3);
    float gridCoord = p.x * cos(angle) + p.y * sin(angle);
    moire += sin(gridCoord * freq) * 0.33;
  }

  // Circular rings from center
  float ringFreq = baseFreq * 0.8;
  float rings = sin(length(p) * ringFreq - time * 0.5);
  moire += rings * 0.25;

  // Interference peak
  float interference = pow(abs(moire), 1.5);

  // Color fringing: warm bias
  vec3 fringe = vec3(
    interference * 1.3,
    interference * 0.85,
    interference * 0.55
  );

  // Multiply blend onto scene
  vec3 result = scene.rgb * max(1.0 - fringe * intensity * 0.25, 0.3);

  return vec4(result, scene.a);
}

// ─── Mode 1: Kaleidoscope ───
// Radial symmetry with 6-8 folds, smooth interpolation, anti-aliased edges.
// Direct port from effects.rs mode 1.
vec4 kaleidoscope(vec4 scene, float intensity, float energy, float time) {
  vec2 uv = vUv;
  float aspect = uEffectResolution.x / uEffectResolution.y;

  // Center and aspect-correct
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  // Convert to polar coordinates
  float radius = length(p);
  float angle = atan(p.y, p.x);

  // Fold count: 6 at rest, 8 at peak energy
  float folds = 6.0 + energy * 2.0;

  // Slow rotation
  angle += time * 0.04;

  // Modulo into one sector and mirror
  float sectorAngle = TAU / folds;
  angle = mod(angle, sectorAngle);
  // Mirror: fold at midpoint of sector
  if (angle > sectorAngle * 0.5) {
    angle = sectorAngle - angle;
  }

  // Convert back to UV space
  vec2 kaleidUv = vec2(
    cos(angle) * radius / aspect + 0.5,
    sin(angle) * radius + 0.5
  );

  // Clamp and fade at edges to prevent border artifacts
  float edgeFade = smoothstep(0.0, 0.02, kaleidUv.x) * smoothstep(1.0, 0.98, kaleidUv.x)
                 * smoothstep(0.0, 0.02, kaleidUv.y) * smoothstep(1.0, 0.98, kaleidUv.y);

  vec4 kaleidScene = texture2D(uInputTexture, clamp(kaleidUv, 0.0, 1.0));

  // Blend between original and kaleidoscope based on intensity
  return mix(scene, kaleidScene * edgeFade + scene * (1.0 - edgeFade), intensity);
}

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

    if (uEffectMode == 1) {
      result = kaleidoscope(scene, intensity, energy, uEffectTime);
    } else if (uEffectMode == 3) {
      result = hypersaturation(scene, intensity, energy);
    } else if (uEffectMode == 5) {
      result = trails(scene, intensity, energy);
    } else if (uEffectMode == 10) {
      result = lightLeak(scene, intensity, uEffectTime, uEffectBeatSnap);
    } else if (uEffectMode == 12) {
      result = moirePatterns(scene, intensity, uEffectEnergy, uEffectTime);
    }
    // Unimplemented post-process modes: keep scene unchanged
  }

  // ── Composited effects (additive blend on top) ──
  if (uCompositedMode > 0) {
    vec3 comp = vec3(0.0);

    if (uCompositedMode == 1) {
      comp = particleSwarm(uCompositedIntensity, uEffectTime, uEffectEnergy, uEffectBass);
    } else if (uCompositedMode == 2) {
      comp = caustics(uCompositedIntensity, uEffectTime, uEffectEnergy, uEffectBass);
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
