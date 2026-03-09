/**
 * GLSL noise functions — Perlin, simplex, and FBM.
 * Based on Inigo Quilez / Patricio Gonzalez Vivo (MIT license).
 * Injected as GLSL string into shader source.
 */

export const noiseGLSL = /* glsl */ `
// --- Permutation helpers ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

// --- 3D Simplex Noise ---
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// --- Fractional Brownian Motion (4 octaves) ---
float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 4; i++) {
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// --- 6-octave FBM for richer detail ---
float fbm6(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 6; i++) {
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// --- 3-octave FBM for fast shallow layer (cheaper) ---
float fbm3(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 3; i++) {
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// --- Film grain: animated 2-frame hold, warm-tinted ---
// Returns vec3 grain (warm amber bias). Intensity should be scaled externally.
// grainTime = floor(uTime * 15.0) / 15.0 for 2-frame hold at 30fps.
vec3 filmGrain(vec2 uv, float grainTime) {
  float n = fract(sin(dot(uv * 1000.0, vec2(12.9898, 78.233)) + grainTime * 43758.5453) * 43758.5453);
  n = (n - 0.5) * 2.0;
  return n * vec3(1.0, 0.95, 0.85);
}

// --- S-curve color grading: hue-preserving tone mapping ---
// Over-bright pixels become MORE SATURATED, not white.
// Dark pixels get lifted to visible color during peaks (stage flood lights).
vec3 sCurveGrade(vec3 col, float energy) {
  // Hue-preserving normalization: scale down to 0-1 keeping color ratios
  float maxC = max(col.r, max(col.g, col.b));
  float excess = 0.0;
  if (maxC > 1.0) {
    excess = min(maxC - 1.0, 3.0);
    col /= maxC; // preserve hue — (3.0, 0.5, 0.1) → (1.0, 0.17, 0.03) stays RED
  }
  col = max(col, vec3(0.0));
  // S-curve: lifts shadows, compresses highlights, punches mids
  vec3 curved = col * col * (3.0 - 2.0 * col);
  float amount = mix(0.3, 0.6, energy);
  col = mix(col, curved, amount);
  // Highlight rolloff
  col = 1.0 - exp(-col * (1.2 + energy * 0.3));
  // Convert excess brightness to SATURATION BOOST (psychedelic color)
  if (excess > 0.0) {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, 1.0 + excess * 0.6);
  }
  return col;
}

// --- HSV-to-cosine hue correction ---
// Cosine palette cycles R→B→G (reverse of HSV's R→G→B).
// All palette values in setlist.json use HSV convention,
// so we invert the hue to get correct colors.
float hsvToCosineHue(float h) { return 1.0 - h; }

// --- Animated stage flood: flowing palette-colored noise in dark areas ---
// Call AFTER sCurveGrade so flood colors bypass tone mapping compression.
// Additive blend gated by darkness: lifts dark pixels, transparent on bright ones.
vec3 stageFloodFill(vec3 col, vec2 uv, float time, float energy, float palHue1, float palHue2) {
  // Activate even at very low energy — concerts are never pitch black
  float gate = smoothstep(0.02, 0.15, energy);
  if (gate < 0.01) return col;
  // Darkness mask: fill dim pixels (luma < 0.20 after tone mapping)
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  float darkness = smoothstep(0.20, 0.02, luma);
  if (darkness < 0.01) return col;
  // Three-layer flowing noise: organic patterns
  float slowT = time * 0.12;
  float n1 = snoise(vec3(uv * 2.0, slowT));
  float n2 = snoise(vec3(uv * 4.5 + 30.0, slowT * 0.7));
  float n3 = snoise(vec3(uv * 9.0 + 70.0, slowT * 1.3));
  float pattern = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
  // Palette-derived colors (convert HSV hue to cosine-palette hue)
  float cHue1 = hsvToCosineHue(palHue1);
  float cHue2 = hsvToCosineHue(palHue2);
  vec3 c1 = 0.5 + 0.5 * cos(6.28318 * vec3(cHue1, cHue1 + 0.33, cHue1 + 0.67));
  vec3 c2 = 0.5 + 0.5 * cos(6.28318 * vec3(cHue2, cHue2 + 0.33, cHue2 + 0.67));
  vec3 floodColor = mix(c1, c2, pattern * 0.5 + 0.5);
  // Energy-scaled brightness: quiet=0.28, loud=0.40
  // Gate already controls early-out; no double-gating in final blend.
  floodColor *= mix(0.28, 0.40, gate);
  // Gentle spatial variation (never kills to zero — range 0.8-1.1)
  floodColor *= 0.8 + 0.3 * clamp(pattern + 0.5, 0.0, 1.0);
  // Additive blend gated by darkness only: dark areas get lifted, bright areas unchanged
  col += floodColor * darkness;
  return col;
}

// --- Beat pulse: sharp spike at beat boundaries, locked to musical time ---
float beatPulse(float musicalTime) {
  return pow(1.0 - fract(musicalTime), 4.0);
}
float beatPulseHalf(float musicalTime) {
  return pow(1.0 - fract(musicalTime * 0.5), 4.0);
}

// --- Light leak: warm amber glow from drifting edge position ---
// Energy-only driven (no onset snap) for smooth, non-flashy behavior.
vec3 lightLeak(vec2 p, float time, float energy, float onsetSnap) {
  float leakAngle = time * 0.07;
  vec2 leakPos = vec2(cos(leakAngle), sin(leakAngle)) * 0.7;
  float dist = length(p - leakPos);
  float leakStrength = energy * 0.5;
  float leak = smoothstep(0.8, 0.1, dist) * leakStrength;
  vec3 leakColor = vec3(1.0, 0.7, 0.3) * leak * 0.12;
  return leakColor;
}

// --- Resolution-aware film grain (scales grain density with resolution) ---
vec3 filmGrainRes(vec2 uv, float grainTime, float resY) {
  float scale = 1000.0 * resY / 1080.0;
  float n = fract(sin(dot(uv * scale, vec2(12.9898, 78.233)) + grainTime * 43758.5453) * 43758.5453);
  n = (n - 0.5) * 2.0;
  return n * vec3(1.0, 0.95, 0.85);
}

// --- Halation: subtle warm glow around bright areas (film artifact) ---
vec3 halation(vec2 uv, vec3 col, float energy) {
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float bloom = smoothstep(0.6, 1.0, lum);
  vec3 halo = vec3(1.0, 0.7, 0.4) * bloom * (0.04 + energy * 0.03);
  return col + halo;
}

// --- Chroma helpers: access 12-element pitch class array from 3 vec4s ---
float getChroma(int idx, vec4 c0, vec4 c1, vec4 c2) {
  if (idx < 4) {
    if (idx == 0) return c0.x;
    if (idx == 1) return c0.y;
    if (idx == 2) return c0.z;
    return c0.w;
  }
  if (idx < 8) {
    if (idx == 4) return c1.x;
    if (idx == 5) return c1.y;
    if (idx == 6) return c1.z;
    return c1.w;
  }
  if (idx == 8) return c2.x;
  if (idx == 9) return c2.y;
  if (idx == 10) return c2.z;
  return c2.w;
}

// Map chroma to color: each pitch class gets a hue, weighted by energy
vec3 chromaColor(vec2 uv, vec4 c0, vec4 c1, vec4 c2, float energy) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float ch = getChroma(i, c0, c1, c2);
    float hue = float(i) / 12.0;
    vec3 rgb = clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    col += rgb * ch;
  }
  return col * energy * 0.5;
}

// ═══════════════════════════════════════════════════════════
// SDF Stealie — Steal Your Face as signed distance field.
// Emerges from the shader's own noise field like a vision
// forming in liquid light. Prefixed _ns_ to avoid collision
// with overlay-sdf.ts which has its own sdCircle/sdBox/sdBolt.
// ═══════════════════════════════════════════════════════════

float _ns_sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float _ns_sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Lightning bolt SDF (simplified 13-point bolt shape)
float _ns_sdBolt(vec2 p) {
  // Zigzag bolt: 3 segments approximated as rotated boxes
  float d = 1e10;
  // Top segment
  vec2 p1 = p - vec2(0.0, 0.25);
  float seg1 = _ns_sdBox(vec2(p1.x * 0.9 + p1.y * 0.4, -p1.x * 0.4 + p1.y * 0.9), vec2(0.04, 0.18));
  d = min(d, seg1);
  // Middle segment
  vec2 p2 = p - vec2(0.0, 0.0);
  float seg2 = _ns_sdBox(vec2(p2.x * 0.9 - p2.y * 0.4, p2.x * 0.4 + p2.y * 0.9), vec2(0.04, 0.16));
  d = min(d, seg2);
  // Bottom segment
  vec2 p3 = p - vec2(0.0, -0.25);
  float seg3 = _ns_sdBox(vec2(p3.x * 0.9 + p3.y * 0.4, -p3.x * 0.4 + p3.y * 0.9), vec2(0.04, 0.18));
  d = min(d, seg3);
  return d;
}

// Steal Your Face SDF: outer ring + dividing line + bolt
float sdStealie(vec2 p, float radius) {
  // Outer ring
  float ring = abs(length(p) - radius) - radius * 0.08;
  // Inner circle (skull face area)
  float inner = length(p) - radius * 0.85;
  // Horizontal divider across the middle
  float divider = _ns_sdBox(p, vec2(radius * 0.85, radius * 0.035));
  // Lightning bolt through center
  float bolt = _ns_sdBolt(p * (1.0 / radius));
  // Combine: ring OR divider OR bolt, masked to circle
  float shape = min(ring, min(divider, bolt * radius));
  return shape;
}

// Complete stealie emergence effect — call this from shaders.
// Returns additive light contribution (vec3) to blend with col += result.
//
// Parameters:
//   uv       — centered screen coords (aspect-corrected)
//   time     — uTime for slow rotation
//   energy   — 0-1 audio energy (gates appearance)
//   bass     — 0-1 bass for pulse
//   col1     — shader's primary palette color
//   col2     — shader's secondary palette color
//   noiseField — shader's own FBM/noise value at this pixel (for dissolution)
vec3 stealieEmergence(vec2 uv, float time, float energy, float bass, vec3 col1, vec3 col2, float noiseField) {
  // Energy gate: only visible when energy > 0.3, fully formed at 0.7
  float gate = smoothstep(0.3, 0.7, energy);
  if (gate < 0.001) return vec3(0.0);

  // Slow rotation
  float angle = time * 0.05;
  float ca = cos(angle);
  float sa = sin(angle);
  vec2 rotUv = vec2(ca * uv.x - sa * uv.y, sa * uv.x + ca * uv.y);

  // Bass pulse: stealie breathes with the low end
  float pulse = 1.0 + bass * 0.5;
  float radius = 0.18 * pulse;

  // SDF evaluation
  float d = sdStealie(rotUv, radius);

  // Noise dissolution: erode edges with the shader's own noise field
  d += noiseField * 0.08 * (1.0 - gate * 0.5);

  // Glow: inverse-square falloff from shape boundary
  float glow = 1.0 / (1.0 + d * d * 800.0);
  glow *= gate;

  // Edge line (crisp at high energy, dissolved at low)
  float edge = smoothstep(0.008, 0.0, abs(d)) * gate * 0.6;

  // Color: blend shader's own palette colors
  vec3 stealieColor = mix(col1, col2, 0.5 + 0.5 * sin(time * 0.3));

  return stealieColor * (glow * 0.35 + edge);
}
`;
