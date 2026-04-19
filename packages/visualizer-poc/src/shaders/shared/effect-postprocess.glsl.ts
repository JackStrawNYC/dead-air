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

// ─── Composited Mode 3: Celestial Map ───
// Deep star field: 3 depth layers, realistic twinkling, star color temperature.
// Direct port from composited_effects.rs mode 3.
vec3 celestialMap(float intensity, float time, float energy) {
  vec2 uv = vUv;
  vec3 col = vec3(0.0);

  // Slow celestial rotation
  float rot = time * 0.005;
  float cr = cos(rot), sr = sin(rot);
  uv = vec2(uv.x * cr - uv.y * sr, uv.x * sr + uv.y * cr);

  // 3 star layers at different depths
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float gridSize = 8.0 + fl * 6.0; // 8, 14, 20 cells
    float brightMult = 1.0 - fl * 0.25; // closer = brighter

    vec2 grid = floor(uv * gridSize);
    vec2 frac_uv = fract(uv * gridSize);

    // Star placement per cell
    float cellHash = hash2(grid + fl * 100.0);
    if (cellHash < 0.65 + fl * 0.10) continue; // density gate

    // Star position within cell
    vec2 starPos = vec2(hash2(grid * 1.1 + fl), hash2(grid * 2.3 + fl));
    float dist = length(frac_uv - starPos);

    // Star size (smaller for distant layers)
    float starSize = (0.08 - fl * 0.02);
    float star = smoothstep(starSize, 0.0, dist);

    // Realistic twinkling (atmospheric scintillation)
    float twinkleSpeed = 1.0 + hash2(grid * 3.7) * 3.0;
    float twinkle = 0.6 + sin(time * twinkleSpeed) * 0.25
                       + sin(time * twinkleSpeed * 2.3) * 0.15;

    // Star color temperature
    float tempHash = hash2(grid * 5.1 + fl);
    vec3 starColor;
    if (tempHash < 0.3) starColor = vec3(0.7, 0.8, 1.0);       // blue giant
    else if (tempHash < 0.7) starColor = vec3(1.0, 0.98, 0.92); // white
    else starColor = vec3(1.0, 0.85, 0.6);                       // red dwarf

    // Energy makes stars brighter
    float energyBoost = 1.2 + energy * 0.8;

    col += starColor * star * twinkle * brightMult * energyBoost * intensity;
  }

  // Faint nebula wisps
  float nebula = sin(uv.x * 3.0 + time * 0.02) * sin(uv.y * 2.5 + time * 0.015) * 0.5 + 0.5;
  col += vec3(0.4, 0.25, 0.6) * nebula * 0.03 * intensity;

  return col;
}

// ─── Composited Mode 4: Tunnel / Wormhole ───
// Hyperspace tunnel: concentric rings with parallax, spiral twist, warm palette.
// Direct port from composited_effects.rs mode 4.
vec3 tunnel(float intensity, float time, float energy, float bass) {
  float aspect = uEffectResolution.x / uEffectResolution.y;
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);
  float radius = length(p);
  float angle = atan(p.y, p.x);

  // Bass ring pulse
  float bassPulse = bass * 0.04 * intensity;

  vec3 col = vec3(0.0);

  // 2 ring layers at different speeds
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    float speed = 0.3 + fl * 0.2;
    float ringSpace = 0.08 + fl * 0.04;

    float ringPos = fract(radius / ringSpace - time * speed * 0.2 + bassPulse);
    float thickness = 0.03 + energy * 0.08;
    float ring = smoothstep(thickness, 0.0, abs(ringPos - 0.5));

    // Spiral twist
    float twist = angle + radius * 3.0 * intensity + time * 0.3;

    // Warm color gradient
    vec3 ringColor = mix(
      vec3(1.0, 0.75, 0.3),  // gold
      vec3(0.8, 0.2, 0.1),    // red
      sin(twist + fl * 1.5) * 0.5 + 0.5
    );

    // Depth fade
    float depthFade = smoothstep(0.6, 0.1, radius);
    col += ringColor * ring * depthFade * intensity * 0.5;
  }

  return col;
}

// ─── Composited Mode 5: Fire / Embers ───
// Rising ember field with hot→cool color gradient, turbulent drift.
// Direct port from composited_effects.rs mode 5.
vec3 fireEmbers(float intensity, float time, float energy, float bass) {
  float aspect = uEffectResolution.x / uEffectResolution.y;
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);

  vec3 col = vec3(0.0);

  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float h1 = hash(fi * 7.31);

    // Energy gates count: 3 at rest, 10 at peak
    if (h1 > 0.30 + energy * 0.70) continue;

    float h2 = hash(fi * 13.17);
    float h3 = hash(fi * 23.41);

    // Rise cycle (bottom to top, looping)
    float riseSpeed = 0.1 + h2 * 0.15;
    float life = fract(h1 * 0.5 - time * riseSpeed);

    // Horizontal drift
    float baseX = (h3 - 0.5) * 0.6;
    float driftX = baseX + sin(time * (1.0 + h1 * 2.0)) * 0.08 * (0.5 + life);

    // Ember position
    vec2 emberPos = vec2(driftX, -0.4 + life * 0.9);
    float dist = length(p - emberPos);

    // Size tapers as ember rises + bass puff
    float size = (0.04 + h3 * 0.025) * (1.0 - life * 0.5) * (1.0 + bass * 0.3);

    // Glow
    float halo = smoothstep(size * 3.0, 0.0, dist) * 0.3;
    float core = smoothstep(size, 0.0, dist) * 0.8;
    float glow = halo + core;

    // Hot→cool color gradient based on life
    vec3 emberColor;
    if (life < 0.15) emberColor = vec3(1.0, 0.95, 0.85);       // white-hot
    else if (life < 0.4) emberColor = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.6, 0.15), (life - 0.15) / 0.25);
    else if (life < 0.7) emberColor = mix(vec3(1.0, 0.6, 0.15), vec3(0.9, 0.2, 0.05), (life - 0.4) / 0.3);
    else emberColor = mix(vec3(0.9, 0.2, 0.05), vec3(0.3, 0.05, 0.0), (life - 0.7) / 0.3);

    col += emberColor * glow * intensity;
  }

  return col;
}

// ─── Composited Mode 6: Ripple / Waves ───
// Concentric wave rings from multiple sources, beat-triggered center burst.
// Direct port from composited_effects.rs mode 6.
vec3 rippleWaves(float intensity, float time, float energy, float beatSnap) {
  float aspect = uEffectResolution.x / uEffectResolution.y;
  vec3 col = vec3(0.0);

  // 2 wave sources
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float phase = fi * 3.14;
    vec2 source = vec2(
      (0.5 + sin(time * 0.04 + phase) * 0.15) * aspect,
      0.5 + cos(time * 0.03 + phase + 1.0) * 0.15
    );

    vec2 p = vec2(vUv.x * aspect, vUv.y);
    float dist = length(p - source);

    // Wave frequency (tighter at peaks)
    float freq = 18.0 + energy * 12.0;
    float speed = time * 2.0 + fi * 1.5;

    // Sharp peaks
    float wave = pow(max(sin(dist * freq - speed), 0.0), 4.0);

    // Decay with distance
    float decay = smoothstep(0.55, 0.08, dist);

    col += vec3(1.0, 1.0, 0.90) * wave * decay * intensity * 0.4;
  }

  // Beat burst from center
  if (beatSnap > 0.2) {
    vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);
    float centerDist = length(p);
    float burst = pow(max(sin(centerDist * 30.0 - time * 3.0), 0.0), 3.0);
    float burstDecay = smoothstep(0.4, 0.0, centerDist);
    col += vec3(1.0, 0.95, 0.85) * burst * burstDecay * beatSnap * intensity * 0.5;
  }

  return col;
}

// ─── Composited Mode 7: Strobe / Flicker ───
// Safe controlled flash: broadcast-safe (<3Hz, <20% delta), beat-gated, warm amber.
// Direct port from composited_effects.rs mode 7.
vec3 strobeFlicker(float intensity, float energy, float beatSnap) {
  // Gate: beat_snap * intensity
  float gate = beatSnap * intensity;
  float trigger = smoothstep(0.2, 0.6, gate);

  // Energy gate: only during energetic moments
  float energyGate = smoothstep(0.15, 0.5, energy);

  // Max flash capped at 30% (broadcast safe)
  float flash = trigger * energyGate * 0.30;

  // Warm amber (not clinical white)
  return vec3(1.0, 0.85, 0.55) * flash;
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

// ─── Mode 4: Chromatic Split ───
// Prismatic RGB channel separation at screen edges, beats trigger split pulse.
// Direct port from effects.rs mode 4.
vec4 chromaticSplit(vec4 scene, float intensity, float energy, float beatSnap, float time) {
  vec2 uv = vUv;
  float aspect = uEffectResolution.x / uEffectResolution.y;

  // Radial distance from center (stronger at edges)
  vec2 center = uv - 0.5;
  center.x *= aspect;
  float dist = length(center);

  // Split direction rotates over time
  float angle = atan(center.y, center.x) + time * 0.1;

  // Offset amount: edge-weighted, energy-scaled, beat-pulsed
  float offsetBase = intensity * (0.008 + energy * 0.006) * dist;
  float beatPulse = 1.0 + beatSnap * 0.8;
  float offset = offsetBase * beatPulse;

  // Split direction vector
  vec2 dir = vec2(cos(angle), sin(angle)) * offset;
  dir.x /= aspect;

  // Sample R, G, B at different offsets (2-tap per channel for smoothness)
  float r = (texture2D(uInputTexture, uv + dir).r + texture2D(uInputTexture, uv + dir * 0.7).r) * 0.5;
  float g = texture2D(uInputTexture, uv).g;
  float b = (texture2D(uInputTexture, uv - dir).b + texture2D(uInputTexture, uv - dir * 0.7).b) * 0.5;

  return vec4(r, g, b, scene.a);
}

// ─── Mode 6: Mirror Symmetry ───
// Bilateral reflection along rotating axis, quad symmetry at high energy.
// Direct port from effects.rs mode 6.
vec4 mirrorSymmetry(vec4 scene, float intensity, float energy, float time) {
  vec2 uv = vUv - 0.5;
  float aspect = uEffectResolution.x / uEffectResolution.y;
  uv.x *= aspect;

  // Rotating mirror axis
  float axisAngle = time * (0.015 + energy * 0.01);
  float ca = cos(axisAngle), sa = sin(axisAngle);

  // Rotate UV into mirror space
  vec2 rotUv = vec2(uv.x * ca + uv.y * sa, -uv.x * sa + uv.y * ca);

  // Reflect across X axis
  rotUv.x = abs(rotUv.x);

  // Quad symmetry at high energy
  float quadBlend = smoothstep(0.4, 0.8, energy);
  vec2 quadUv = abs(rotUv);
  rotUv = mix(rotUv, quadUv, quadBlend);

  // Rotate back and convert to texture coords
  vec2 mirrorUv = vec2(rotUv.x * ca - rotUv.y * sa, rotUv.x * sa + rotUv.y * ca);
  mirrorUv.x /= aspect;
  mirrorUv += 0.5;

  // Anti-aliased edge near axis
  float edgeDist = abs(uv.x * ca + uv.y * sa);
  float edgeAA = smoothstep(0.0, 0.008, edgeDist);

  vec4 mirrorScene = texture2D(uInputTexture, clamp(mirrorUv, 0.0, 1.0));

  return mix(scene, mirrorScene, intensity * edgeAA);
}

// ─── Mode 7: Audio Displacement ───
// Frequency-mapped UV warping: bass=slow undulations, mids=ripples, highs=fine detail.
// Direct port from effects.rs mode 7.
vec4 audioDisplacement(vec4 scene, float intensity, float energy, float bass, float beatSnap, float time) {
  vec2 uv = vUv;

  // Three frequency layers
  float bassWarp = sin(uv.y * 2.5 + time * 0.8) * bass * 0.10;
  float midWarp = sin(uv.y * 6.0 + time * 1.5) * energy * 0.055;
  float highWarp = sin(uv.y * 16.0 + time * 3.0) * energy * 0.018;

  // Beat spike
  float beatWarp = sin(uv.y * 5.0 + time * 10.0) * beatSnap * 0.06;

  float totalWarp = (bassWarp + midWarp + highWarp + beatWarp) * intensity;

  vec2 warpedUv = uv + vec2(totalWarp, totalWarp * 0.3);

  return texture2D(uInputTexture, clamp(warpedUv, 0.0, 1.0));
}

// ─── Mode 8: Zoom Punch ───
// Beat-triggered zoom impact with barrel distortion.
// Direct port from effects.rs mode 8.
vec4 zoomPunch(vec4 scene, float intensity, float energy, float beatSnap) {
  vec2 uv = vUv;
  vec2 center = uv - 0.5;
  float dist = length(center);

  // Punch strength from beat
  float punchStrength = beatSnap * intensity * (0.06 + energy * 0.06);

  // Barrel distortion at peak
  float barrel = 1.0 + punchStrength * dist * 3.0;

  // Zoom
  float zoom = 1.0 - punchStrength * barrel;

  vec2 punchedUv = center * zoom + 0.5;

  return texture2D(uInputTexture, clamp(punchedUv, 0.0, 1.0));
}

// ─── Mode 9: Slow Breath Pulse ───
// "Walls breathing" psychedelic pulse: layered sine waves, drifting center.
// Direct port from effects.rs mode 9.
vec4 breathPulse(vec4 scene, float intensity, float energy, float bass, float time) {
  vec2 uv = vUv;

  // Breath rate (faster at high energy)
  float rate = 0.15 + energy * 0.10;

  // Multi-layered breathing
  float primary = sin(time * rate * TAU) * intensity * 0.035;
  float secondary = sin(time * rate * TAU * 1.7 + 1.3) * intensity * 0.012;
  float tertiary = sin(time * rate * TAU * 3.1 + 2.7) * intensity * 0.005;

  // Bass breath
  float bassBreath = sin(time * 0.8 + 0.5) * bass * 0.020;

  float totalBreath = primary + secondary + tertiary + bassBreath;

  // Breathing center drifts organically
  float cx = 0.5 + sin(time * 0.07) * 0.04;
  float cy = 0.5 + cos(time * 0.05) * 0.03;

  vec2 center = uv - vec2(cx, cy);
  float zoom = 1.0 - totalBreath;

  vec2 breathedUv = center * zoom + vec2(cx, cy);

  return texture2D(uInputTexture, clamp(breathedUv, 0.0, 1.0));
}

// ─── Mode 13: Depth of Field ───
// Bokeh blur: sharp center, blurry edges, 13-tap Poisson disk sampling.
// Direct port from effects.rs mode 13.
vec4 depthOfField(vec4 scene, float intensity, float energy) {
  vec2 uv = vUv;
  float aspect = uEffectResolution.x / uEffectResolution.y;

  // Focus radius: expands at high energy
  float focusRadius = 0.15 + energy * 0.15;

  vec2 center = uv - 0.5;
  center.x *= aspect;
  float dist = length(center);

  // Blur amount: stronger at edges
  float blur = smoothstep(focusRadius, focusRadius + 0.3, dist) * intensity * 0.008;

  if (blur < 0.0001) return scene;

  // Aspect correction for offsets
  vec2 aspectCorr = vec2(1.0, aspect);

  // 13-tap Poisson disk sampling
  vec3 col = scene.rgb;
  float totalWeight = 1.0;

  // Well-distributed Poisson points
  vec2 taps[12];
  taps[0] = vec2(-0.94, 0.34);  taps[1] = vec2(0.76, -0.65);
  taps[2] = vec2(-0.09, -0.93); taps[3] = vec2(0.97, 0.26);
  taps[4] = vec2(-0.81, -0.59); taps[5] = vec2(0.33, 0.95);
  taps[6] = vec2(-0.50, 0.87);  taps[7] = vec2(0.60, 0.44);
  taps[8] = vec2(-0.38, -0.35); taps[9] = vec2(0.21, -0.47);
  taps[10] = vec2(-0.73, 0.10); taps[11] = vec2(0.48, -0.15);

  for (int i = 0; i < 12; i++) {
    vec2 offset = taps[i] * blur * aspectCorr;
    float weight = 1.0 - length(taps[i]) * 0.3;
    col += texture2D(uInputTexture, uv + offset).rgb * weight;
    totalWeight += weight;
  }

  col /= totalWeight;
  return vec4(col, scene.a);
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

// ─── Mode 2: Deep Feedback ───
// Analog video feedback vortex: infinite spiral tunnel with color shift, organic decay.
// Direct port from effects.rs mode 2.
vec4 deepFeedback(vec4 scene, float intensity, float energy, float bass, float time) {
  vec3 col = scene.rgb;
  vec3 prev = texture2D(uEffectPrevFrame, vUv).rgb;

  // Detect empty previous frame
  float prevLum = dot(prev, vec3(0.299, 0.587, 0.114));
  if (prevLum < 0.001) return scene;

  // Zoom + rotation for feedback vortex
  float zoomSpeed = 1.0 - bass * 0.015;
  float rotSpeed = 0.004 + energy * 0.006;
  float angle = time * rotSpeed;
  float ca = cos(angle), sa = sin(angle);

  // 3-tap sampling for smooth trails
  vec3 feedback = vec3(0.0);
  for (int tap = 0; tap < 3; tap++) {
    float ft = float(tap);
    float tapOffset = ft * 0.003;
    vec2 uv = vUv - 0.5;
    uv *= zoomSpeed - tapOffset;
    uv = vec2(uv.x * ca + uv.y * sa, -uv.x * sa + uv.y * ca);
    uv += 0.5;
    feedback += texture2D(uEffectPrevFrame, clamp(uv, 0.0, 1.0)).rgb;
  }
  feedback /= 3.0;

  // HSV hue rotation per recursion
  float hueShift = intensity * 0.05;
  // Approximate hue rotation via channel rotation
  feedback = vec3(
    feedback.r * cos(hueShift) + feedback.g * sin(hueShift),
    feedback.g * cos(hueShift) - feedback.r * sin(hueShift),
    feedback.b
  );

  // Saturation decay (prevent white-out)
  float fbLum = dot(feedback, vec3(0.299, 0.587, 0.114));
  feedback = mix(feedback, vec3(fbLum), 0.03);

  // Blend: energy drives recursion depth
  float blend = intensity * (0.3 + energy * 0.4);
  col = mix(col, feedback, blend);

  return vec4(col, scene.a);
}

// ─── Mode 11: Time Dilation ───
// Slow-motion perception: weighted multi-frame averaging, spatial drift, desaturation.
// Direct port from effects.rs mode 11.
vec4 timeDilation(vec4 scene, float intensity) {
  vec3 prev = texture2D(uEffectPrevFrame, vUv + vec2(0.003, 0.002) * intensity).rgb;

  // Detect empty previous frame
  float prevLum = dot(prev, vec3(0.299, 0.587, 0.114));
  if (prevLum < 0.001) return scene;

  // Heavy blend from previous (70-82% history)
  float historyWeight = 0.70 + 0.12 * intensity;
  vec3 col = mix(scene.rgb, prev, historyWeight);

  // Slight desaturation (dreamlike)
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), intensity * 0.10);

  // Contrast reduction
  col = mix(vec3(0.5), col, 1.0 - intensity * 0.08);

  return vec4(col, scene.a);
}

// ─── Mode 14: Glitch / Datamosh ───
// Digital corruption: scanlines, block displacement, color banding, static noise.
// Direct port from effects.rs mode 14.
vec4 glitchDatamosh(vec4 scene, float intensity, float energy, float beatSnap, float time) {
  vec2 uv = vUv;
  vec3 col = scene.rgb;
  float quantTime = floor(time * 6.0);

  // Layer 1: VHS tracking lines (horizontal bands with shift + RGB split)
  float scanY = floor(uv.y * 80.0);
  float scanHash = hash(scanY + quantTime * 13.37);
  if (scanHash > 1.0 - intensity * 0.15) {
    float shift = (scanHash - 0.5) * intensity * 0.05;
    col.r = texture2D(uInputTexture, vec2(uv.x + shift, uv.y)).r;
    col.b = texture2D(uInputTexture, vec2(uv.x - shift * 0.7, uv.y)).b;
  }

  // Layer 2: Block hold (beat-triggered, holds previous frame in random blocks)
  if (beatSnap > 0.4) {
    float blockSize = 8.0 + (1.0 - energy) * 8.0;
    vec2 block = floor(uv * blockSize);
    float blockHash = hash(dot(block, vec2(127.1, 311.7)) + quantTime);
    if (blockHash > 0.6) {
      vec3 prev = texture2D(uEffectPrevFrame, uv).rgb;
      float prevLum = dot(prev, vec3(0.299, 0.587, 0.114));
      if (prevLum > 0.001) col = prev;
    }
  }

  // Layer 3: Color banding (posterization on random scanlines)
  float bandHash = hash(scanY * 2.71 + quantTime * 7.13);
  if (bandHash > 1.0 - intensity * 0.1) {
    col = floor(col * 4.0) / 4.0;
  }

  // Layer 4: Static noise overlay
  float noise = hash(uv.x * 1000.0 + uv.y * 777.0 + time * 100.0);
  col = mix(col, vec3(noise), intensity * 0.03);

  // Gradual desaturation
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), intensity * 0.05);

  return vec4(col, scene.a);
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

// ─── Composited Mode 9: Liquid Metal ───
// Chrome/mercury surface: multi-layer noise, fresnel rim, specular highlights.
// Direct port from composited_effects.rs mode 9.
vec3 liquidMetal(float intensity, float time, float energy, float bass) {
  float aspect = uEffectResolution.x / uEffectResolution.y;
  vec2 p = vec2((vUv.x - 0.5) * aspect * 2.0, (vUv.y - 0.5) * 2.0);

  float t = time * 0.5;

  // Layer 1: large undulations
  float surface = sin(p.x * 2.5 + t + sin(p.y * 1.8 + t * 0.6)) * 0.35;
  // Layer 2: medium detail
  surface += sin(p.x * 5.0 + p.y * 3.0 + t * 1.2) * 0.20;
  // Layer 3: bass ripples
  float rippleFreq = 8.0 + bass * 8.0;
  surface += sin(p.x * rippleFreq + t * 3.0) * sin(p.y * rippleFreq * 0.8) * bass * 0.25;

  // Approximate normal from surface
  float normal = cos(surface * PI);

  // Fresnel rim lighting
  float fresnel = pow(1.0 - abs(normal), 3.0) * 0.4;

  // Specular highlights
  float radius = length(p);
  float angle = atan(p.y, p.x);
  float specPow = 6.0 + energy * 8.0;
  float specular = pow(max(sin(angle * 4.0 + radius * 12.0), 0.0), specPow) * 0.6;

  // Chrome color: cool dark → warm gold
  vec3 baseColor = mix(
    vec3(0.18, 0.20, 0.25),  // cool chrome
    vec3(0.85, 0.78, 0.60),  // warm gold
    abs(surface) * 0.7 + 0.3
  );

  vec3 col = baseColor * (0.5 + abs(surface) * 0.7) + vec3(specular * 1.5) + vec3(fresnel * 1.3);

  return col * intensity;
}

// ─── Composited Mode 10: Concert Poster ───
// Halftone CMYK dots, limited warm palette, ornate border, aged paper.
// Direct port from composited_effects.rs mode 10.
vec3 concertPoster(float intensity, float time, float energy) {
  vec2 uv = vUv;

  // Halftone dot scale (larger dots at peaks, smaller at rest)
  float dotScale = 40.0 + energy * 30.0;

  // 3 halftone grids at 30° angles
  float dots = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float angle = fi * 0.524; // ~30° each
    float ca = cos(angle), sa = sin(angle);
    vec2 rotUv = vec2(uv.x * ca - uv.y * sa, uv.x * sa + uv.y * ca);
    vec2 grid = fract(rotUv * dotScale) - 0.5;

    // Tone hash for dot size variation
    float tone = hash2(floor(rotUv * dotScale));
    float dotDist = length(grid);
    float dot = smoothstep(tone * 0.4 + 0.02, tone * 0.4, dotDist);
    dots += dot * 0.33;
  }

  // Paper texture: cream with noise grain
  vec3 paper = vec3(0.92, 0.88, 0.78);
  paper += (hash2(uv * 200.0 + time * 0.01) - 0.5) * 0.03;

  // Poster ink colors
  vec3 red = vec3(0.75, 0.15, 0.08);
  vec3 dark = vec3(0.15, 0.08, 0.03);
  vec3 ink = mix(red, dark, smoothstep(0.3, 0.7, dots));

  vec3 col = mix(paper, ink, smoothstep(0.3, 0.7, dots));

  // Border frame
  float borderOuter = max(
    smoothstep(0.03, 0.04, uv.x) * smoothstep(0.03, 0.04, 1.0 - uv.x),
    0.0
  ) * max(
    smoothstep(0.03, 0.04, uv.y) * smoothstep(0.03, 0.04, 1.0 - uv.y),
    0.0
  );
  float borderInner = smoothstep(0.05, 0.06, uv.x) * smoothstep(0.05, 0.06, 1.0 - uv.x)
                    * smoothstep(0.05, 0.06, uv.y) * smoothstep(0.05, 0.06, 1.0 - uv.y);
  float frame = (1.0 - borderOuter) + (1.0 - borderInner) * 0.5;
  col = mix(col, vec3(0.12, 0.06, 0.02), clamp(frame, 0.0, 1.0) * 0.8);

  return col * intensity * 0.18;
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
    } else if (uEffectMode == 2) {
      result = deepFeedback(scene, intensity, energy, uEffectBass, uEffectTime);
    } else if (uEffectMode == 3) {
      result = hypersaturation(scene, intensity, energy);
    } else if (uEffectMode == 4) {
      result = chromaticSplit(scene, intensity, energy, uEffectBeatSnap, uEffectTime);
    } else if (uEffectMode == 5) {
      result = trails(scene, intensity, energy);
    } else if (uEffectMode == 6) {
      result = mirrorSymmetry(scene, intensity, energy, uEffectTime);
    } else if (uEffectMode == 7) {
      result = audioDisplacement(scene, intensity, energy, uEffectBass, uEffectBeatSnap, uEffectTime);
    } else if (uEffectMode == 8) {
      result = zoomPunch(scene, intensity, energy, uEffectBeatSnap);
    } else if (uEffectMode == 9) {
      result = breathPulse(scene, intensity, energy, uEffectBass, uEffectTime);
    } else if (uEffectMode == 10) {
      result = lightLeak(scene, intensity, uEffectTime, uEffectBeatSnap);
    } else if (uEffectMode == 11) {
      result = timeDilation(scene, intensity);
    } else if (uEffectMode == 12) {
      result = moirePatterns(scene, intensity, uEffectEnergy, uEffectTime);
    } else if (uEffectMode == 13) {
      result = depthOfField(scene, intensity, energy);
    } else if (uEffectMode == 14) {
      result = glitchDatamosh(scene, intensity, energy, uEffectBeatSnap, uEffectTime);
    }
    // All 14 post-process modes implemented
  }

  // ── Composited effects (additive blend on top) ──
  if (uCompositedMode > 0) {
    vec3 comp = vec3(0.0);

    if (uCompositedMode == 1) {
      comp = particleSwarm(uCompositedIntensity, uEffectTime, uEffectEnergy, uEffectBass);
    } else if (uCompositedMode == 2) {
      comp = caustics(uCompositedIntensity, uEffectTime, uEffectEnergy, uEffectBass);
    } else if (uCompositedMode == 3) {
      comp = celestialMap(uCompositedIntensity, uEffectTime, uEffectEnergy);
    } else if (uCompositedMode == 4) {
      comp = tunnel(uCompositedIntensity, uEffectTime, uEffectEnergy, uEffectBass);
    } else if (uCompositedMode == 5) {
      comp = fireEmbers(uCompositedIntensity, uEffectTime, uEffectEnergy, uEffectBass);
    } else if (uCompositedMode == 6) {
      comp = rippleWaves(uCompositedIntensity, uEffectTime, uEffectEnergy, uEffectBeatSnap);
    } else if (uCompositedMode == 7) {
      comp = strobeFlicker(uCompositedIntensity, uEffectEnergy, uEffectBeatSnap);
    } else if (uCompositedMode == 8) {
      comp = geometricBreakdown(uCompositedIntensity, uEffectTime, uEffectEnergy, uEffectBeatSnap);
    }
    } else if (uCompositedMode == 9) {
      comp = liquidMetal(uCompositedIntensity, uEffectTime, uEffectEnergy, uEffectBass);
    } else if (uCompositedMode == 10) {
      comp = concertPoster(uCompositedIntensity, uEffectTime, uEffectEnergy);
    }
    // Unimplemented composited modes: no contribution

    // Additive blend (screen-like)
    result.rgb += comp;
  }

  gl_FragColor = result;
}
`;
