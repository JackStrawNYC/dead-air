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

// --- Curl noise: divergence-free 3D flow field ---
// Cross-product of two offset FBM gradients. Produces smooth, swirling
// motion ideal for fluid smoke, liquid light advection, and organic flow.
// 12 FBM evaluations per call — gate behind energy threshold in expensive shaders.
vec3 curlNoise(vec3 p) {
  float eps = 0.01;
  // Partial derivatives via central differences of two offset FBM fields
  float n1 = fbm3(p + vec3(eps, 0.0, 0.0));
  float n2 = fbm3(p - vec3(eps, 0.0, 0.0));
  float n3 = fbm3(p + vec3(0.0, eps, 0.0));
  float n4 = fbm3(p - vec3(0.0, eps, 0.0));
  float n5 = fbm3(p + vec3(0.0, 0.0, eps));
  float n6 = fbm3(p - vec3(0.0, 0.0, eps));
  // Second field with large offset to decorrelate
  float m1 = fbm3(p + vec3(eps, 0.0, 0.0) + 31.416);
  float m2 = fbm3(p - vec3(eps, 0.0, 0.0) + 31.416);
  float m3 = fbm3(p + vec3(0.0, eps, 0.0) + 31.416);
  float m4 = fbm3(p - vec3(0.0, eps, 0.0) + 31.416);
  float m5 = fbm3(p + vec3(0.0, 0.0, eps) + 31.416);
  float m6 = fbm3(p - vec3(0.0, 0.0, eps) + 31.416);
  float inv2eps = 1.0 / (2.0 * eps);
  // Cross product of gradients → divergence-free field
  vec3 gradA = vec3((n1 - n2), (n3 - n4), (n5 - n6)) * inv2eps;
  vec3 gradB = vec3((m1 - m2), (m3 - m4), (m5 - m6)) * inv2eps;
  return cross(gradA, gradB);
}

// --- Ridged multifractal: sharp ridges from abs(noise) ---
// Great for volcanic textures (inferno), coral (deep-ocean), crystal ridges.
float ridgedMultifractal(vec3 p, int octaves, float lacunarity, float gain) {
  float sum = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  float prev = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float n = abs(snoise(p * frequency));
    n = 1.0 - n;   // invert so ridges are peaks
    n = n * n;      // sharpen ridges
    sum += n * amplitude * prev;
    prev = n;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return sum;
}

// 4-octave convenience wrapper
float ridged4(vec3 p) {
  return ridgedMultifractal(p, 4, 2.0, 0.5);
}

// --- Film grain: animated 2-frame hold, warm-tinted ---
// Returns vec3 grain (warm amber bias). Intensity should be scaled externally.
// grainTime = floor(uTime * 15.0) / 15.0 for 2-frame hold at 30fps.
vec3 filmGrain(vec2 uv, float grainTime) {
  float n = fract(sin(dot(uv * 1000.0, vec2(12.9898, 78.233)) + grainTime * 43758.5453) * 43758.5453);
  n = (n - 0.5) * 2.0;
  return n * vec3(1.0, 0.95, 0.85);
}

// --- HSV to RGB conversion (standard) ---
// Previously duplicated in 5+ shaders; now shared.
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// --- HSV-to-cosine hue correction ---
// Cosine palette cycles R→B→G (reverse of HSV's R→G→B).
// All palette values in setlist.json use HSV convention,
// so we invert the hue to get correct colors.
float hsvToCosineHue(float h) { return 1.0 - h; }

// --- Animated stage flood: flowing palette-colored noise in dark areas ---
// Call BEFORE cinematicGrade (in HDR space) — tone curve will compress the result.
// Additive blend gated by darkness: lifts dark pixels, transparent on bright ones.
// Ensures no dead black voids — concerts are never pitch black.
vec3 stageFloodFill(vec3 col, vec2 uv, float time, float energy, float palHue1, float palHue2) {
  // Activate even at very low energy — concerts are never pitch black
  float gate = smoothstep(0.0, 0.08, energy);
  if (gate < 0.01) return col;
  // Darkness mask: fill dim pixels (luma < 0.60 in pre-tonemap HDR range)
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  float darkness = smoothstep(0.60, 0.05, luma);
  if (darkness < 0.01) return col;
  // Three-layer flowing noise: organic patterns
  float slowT = time * 0.12;
  float n1 = snoise(vec3(uv * 2.0, slowT));
  float n2 = snoise(vec3(uv * 4.5 + 30.0, slowT * 0.7));
  float n3 = snoise(vec3(uv * 9.0 + 70.0, slowT * 1.3));
  float pattern = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
  // Palette-derived colors with time-varying hue drift for color variety
  float cHue1 = hsvToCosineHue(palHue1) + sin(time * 0.04) * 0.08;
  float cHue2 = hsvToCosineHue(palHue2) + cos(time * 0.03) * 0.08;
  vec3 c1 = 0.5 + 0.5 * cos(6.28318 * vec3(cHue1, cHue1 + 0.33, cHue1 + 0.67));
  vec3 c2 = 0.5 + 0.5 * cos(6.28318 * vec3(cHue2, cHue2 + 0.33, cHue2 + 0.67));
  // Third color: complementary hue for richer palette (breaks monochromatic dominance)
  float cHue3 = hsvToCosineHue(palHue1 + 0.5);
  vec3 c3 = 0.5 + 0.5 * cos(6.28318 * vec3(cHue3, cHue3 + 0.33, cHue3 + 0.67));
  // Blend all three: primary + secondary + complementary
  vec3 floodColor = mix(c1, c2, pattern * 0.5 + 0.5);
  floodColor = mix(floodColor, c3, 0.15 + pattern * 0.1);
  // Energy-scaled brightness: quiet=0.65, loud=0.85
  floodColor *= mix(0.65, 0.85, gate);
  // Gentle spatial variation (never kills to zero — range 0.85-1.1)
  floodColor *= 0.85 + 0.25 * clamp(pattern + 0.5, 0.0, 1.0);
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
  float leakStrength = max(0.08, energy * 0.25);
  float leak = smoothstep(0.8, 0.1, dist) * leakStrength;
  vec3 leakColor = vec3(1.0, 0.7, 0.3) * leak * 0.10;
  return leakColor;
}

// --- Resolution-aware film grain (scales grain density with resolution) ---
vec3 filmGrainRes(vec2 uv, float grainTime, float resY) {
  float scale = 1000.0 * resY / 1080.0;
  float n = fract(sin(dot(uv * scale, vec2(12.9898, 78.233)) + grainTime * 43758.5453) * 43758.5453);
  n = (n - 0.5) * 2.0;
  return n * vec3(1.0, 0.95, 0.85);
}

// --- Halation: warm glow around bright areas (film stock red channel bleed) ---
// Stronger output feeds CSS backdrop-filter bloom for real spatial spread.
vec3 halation(vec2 uv, vec3 col, float energy) {
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // Lower threshold, wider range — CSS bloom will spread this
  float bloom = smoothstep(0.35, 0.9, lum);
  // Stronger warm halo (film stock red channel bleed)
  vec3 haloColor = vec3(1.0, 0.65, 0.35);
  float strength = bloom * (0.05 + energy * 0.04);
  // Edge warmth: brighter halation near screen edges (lens vignette inverse)
  float edgeDist = length(uv - 0.5) * 1.4;
  strength *= (1.0 + edgeDist * 0.3);
  return col + haloColor * strength;
}

// --- ACES filmic tone mapping (Krzysztof Narkowicz fit) ---
vec3 acesToneMap(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Full cinematic grade: hue-preserving filmic tone curve + energy-driven contrast.
// Should be the LAST color transform before film grain — compresses all additive effects.
// Hue-preserving: tone-maps the max channel, scales others proportionally.
// Without this, per-channel exponential mapping crushes HDR fire (3,2.8,2.5) → near-white.
// With hue preservation, (3,2.8,2.5) → (0.98,0.92,0.82) — reads as warm, not white.
//
// Era saturation is now handled here (CSS stripped of saturate/contrast to avoid
// compound color crushing: 0.70 × 0.75 = 0.525 effective saturation).
vec3 cinematicGrade(vec3 col, float energy) {
  // Hue-preserving normalization: extract color ratio before tone curve
  float maxC = max(col.r, max(col.g, col.b));
  vec3 hueRatio = col / max(maxC, 0.001);

  // Filmic tone curve on max channel: smooth shoulder rolloff
  float exposure = 1.35 + energy * 0.15;
  float mapped = 1.0 - exp(-maxC * exposure);

  // Reconstruct color with preserved hue ratios
  col = hueRatio * mapped;

  // Gentle contrast + era saturation: GLSL owns all color grading.
  // uEraSaturation plumbed from era data (default 1.0 for no era).
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float contrast = mix(0.95, 1.15, energy);
  contrast *= 1.0 + uHarmonicTension * 0.08;
  col = mix(vec3(luma), col, contrast * uEraSaturation + uShowSaturation);
  return col;
}

// --- Anamorphic flare: horizontal light streak from bright areas ---
vec3 anamorphicFlare(vec2 uv, vec3 col, float energy, float onset) {
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float threshold = mix(0.55, 0.38, energy); // conservative threshold to avoid white wash
  float bright = smoothstep(threshold, threshold + 0.3, luma);
  // Horizontal streak: wide Gaussian in X, narrow in Y
  float streak = bright * exp(-abs(uv.y - 0.5) * 6.0); // wider vertical spread
  streak *= (0.3 + energy * 0.7);
  streak *= (1.0 + onset * 0.4);  // gentle onset accent
  // Warm cyan-white flare color (anamorphic coatings)
  vec3 flareColor = mix(vec3(0.6, 0.8, 1.0), vec3(1.0, 0.95, 0.9), energy);
  return col + flareColor * streak * 0.12;
}

// --- Directional chromatic aberration: lens-like color fringing ---
// Separates R/B channels along a directional vector from center.
// Replaces simple channel scaling with physically-motivated fringing.
vec3 applyCA(vec3 col, vec2 uv, float amount) {
  vec2 dir = normalize(uv - vec2(0.5) + vec2(0.001));
  float shift = dot(dir, vec2(1.0, 0.3)) * amount;
  col.r = col.r * (1.0 + shift * 2.0) - col.g * shift * 0.3;
  col.b = col.b * (1.0 + abs(shift) * 1.5) - col.g * abs(shift) * 0.2;
  return max(col, vec3(0.0));
}

// --- Barrel distortion: subtle lens curvature ---
vec2 barrelDistort(vec2 uv, float strength) {
  vec2 centered = uv - 0.5;
  float r2 = dot(centered, centered);
  vec2 distorted = centered * (1.0 + strength * r2);
  return distorted + 0.5;
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
vec3 stealieEmergence(vec2 uv, float time, float energy, float bass, vec3 col1, vec3 col2, float noiseField, float climaxPhase) {
  // Climax gate: only during climax (2) or sustain (3)
  float climaxGate = smoothstep(1.5, 2.5, climaxPhase);
  // Energy gate: lowered so stealie appears during climax (max energy ~0.465)
  float energyGate = smoothstep(0.35, 0.55, energy);
  float gate = energyGate * climaxGate;
  if (gate < 0.001) return vec3(0.0);

  // Slow rotation
  float angle = time * 0.08;
  float ca = cos(angle);
  float sa = sin(angle);
  vec2 rotUv = vec2(ca * uv.x - sa * uv.y, sa * uv.x + ca * uv.y);

  // Bass pulse: stealie breathes with the low end
  float pulse = 1.0 + bass * 0.8;
  float radius = 0.45 * pulse;

  // SDF evaluation
  float d = sdStealie(rotUv, radius);

  // Noise dissolution: erode edges with the shader's own noise field
  d += noiseField * 0.08 * (1.0 - gate * 0.5);

  // Glow: inverse-square falloff from shape boundary
  float glow = 1.0 / (1.0 + d * d * 800.0);
  glow *= gate;

  // Edge line (crisp at high energy, dissolved at low)
  float edge = smoothstep(0.008, 0.0, abs(d)) * gate * 1.0;

  // Color: blend shader's own palette colors
  vec3 stealieColor = mix(col1, col2, 0.5 + 0.5 * sin(time * 0.3));

  return stealieColor * (glow * 0.70 + edge * 1.5);
}

// --- Multi-camera cut: instant UV transforms on strong beats ---
// Returns modified UV coordinates. Call at the start of main() to transform p.
// cutSeed should be uSectionIndex * 1000.0 + floor(uMusicalTime) to vary cuts.
vec2 applyCameraCut(vec2 uv, float onset, float beat, float energy, float coherence,
                     float climaxPhase, float musicalTime, float sectionIndex) {
  // Gate: only during intense climax moments
  float gate = step(0.7, onset) * step(0.3, beat) * step(0.2, energy)
             * step(0.5, coherence) * step(1.5, climaxPhase);
  if (gate < 0.5) return uv;

  // Cut type selection: hash of musical time + section for variety
  float cutSeed = sectionIndex * 1000.0 + floor(musicalTime);
  float cutHash = fract(sin(cutSeed * 12.9898) * 43758.5453);

  // Cut duration: 4 frames ≈ 0.133 at 30fps, check fractional musical time
  float beatFrac = fract(musicalTime);
  float cutActive = smoothstep(0.0, 0.01, beatFrac) * smoothstep(0.15, 0.1, beatFrac);

  if (cutActive < 0.01) return uv;

  vec2 center = vec2(0.5);

  if (cutHash < 0.4) {
    // Snap zoom: 1.2-1.5x
    float zoom = mix(1.2, 1.5, fract(cutHash * 7.13));
    uv = (uv - center) / zoom + center;
  } else if (cutHash < 0.75) {
    // Snap pan: 10-20% offset
    float panX = (fract(cutHash * 3.17) - 0.5) * 0.2;
    float panY = (fract(cutHash * 5.31) - 0.5) * 0.15;
    uv += vec2(panX, panY) * cutActive;
  } else {
    // Aspect flip: horizontal mirror
    uv.x = 1.0 - uv.x;
  }

  return uv;
}

// ═══════════════════════════════════════════════════════════
// SDF Iconography — Dancing Bear, American Beauty Rose, Skull
// with animated jaw. Prefixed _ns_ to avoid collision with
// overlay-sdf.ts equivalents. Used by iconEmergence() below.
// ═══════════════════════════════════════════════════════════

// Dancing bear with animated walk cycle
float _ns_sdDancingBear(vec2 p, float dancePhase) {
  // Body: ellipse
  float body = length(p * vec2(1.0, 1.3)) - 0.3;
  // Head: circle offset up
  float head = length(p - vec2(0.0, 0.35)) - 0.15;
  // Ears: two small circles
  float earL = length(p - vec2(-0.12, 0.48)) - 0.06;
  float earR = length(p - vec2(0.12, 0.48)) - 0.06;
  // Legs: animated with dancePhase
  float legSwing = sin(dancePhase * 6.28) * 0.12;
  vec2 legL = p - vec2(-0.12 + legSwing, -0.35);
  vec2 legR = p - vec2(0.12 - legSwing, -0.35);
  float legLD = length(legL * vec2(1.0, 0.5)) - 0.08;
  float legRD = length(legR * vec2(1.0, 0.5)) - 0.08;
  // Arms: animated opposite to legs
  float armSwing = sin(dancePhase * 6.28 + 3.14) * 0.1;
  vec2 armL = p - vec2(-0.28, 0.1 + armSwing);
  vec2 armR = p - vec2(0.28, 0.1 - armSwing);
  float armLD = length(armL * vec2(0.5, 1.0)) - 0.06;
  float armRD = length(armR * vec2(0.5, 1.0)) - 0.06;
  // Combine
  float d = min(body, head);
  d = min(d, min(earL, earR));
  d = min(d, min(legLD, legRD));
  d = min(d, min(armLD, armRD));
  return d;
}

// American Beauty rose with layered petals
float _ns_sdRose(vec2 p) {
  // Center bud
  float bud = length(p) - 0.08;
  // 5 petal layers at increasing radii
  float petals = 1e10;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float radius = 0.12 + fi * 0.06;
    float petalCount = 5.0 + fi * 2.0;
    float angle = atan(p.y, p.x) + fi * 0.3;
    float petalShape = cos(angle * petalCount) * 0.03 * (1.0 + fi * 0.3);
    float ring = abs(length(p) - radius + petalShape) - 0.02;
    petals = min(petals, ring);
  }
  return min(bud, petals);
}

// Skull with animated jaw
float _ns_sdSkull(vec2 p, float jawOpen) {
  // Cranium: slightly squashed circle
  float cranium = length(p * vec2(1.0, 0.9) - vec2(0.0, 0.05)) - 0.3;
  // Eye sockets: two holes
  float eyeL = length(p - vec2(-0.1, 0.08)) - 0.07;
  float eyeR = length(p - vec2(0.1, 0.08)) - 0.07;
  // Nose: inverted triangle (heart shape)
  vec2 np = p - vec2(0.0, -0.05);
  float nose = max(abs(np.x) - 0.04, np.y + 0.02);
  nose = min(nose, length(np + vec2(0.0, 0.03)) - 0.03);
  // Jaw: drops down with jawOpen (0-1)
  float jawDrop = jawOpen * 0.08;
  vec2 jp = p - vec2(0.0, -0.22 - jawDrop);
  float jaw = length(jp * vec2(1.0, 1.5)) - 0.18;
  // Teeth: horizontal line between skull and jaw
  float teeth = abs(p.y + 0.18 + jawDrop * 0.5) - 0.01;
  teeth = max(teeth, abs(p.x) - 0.12);
  // Combine: cranium minus eyes/nose, union jaw, add teeth edge
  float skull = max(cranium, -min(eyeL, eyeR));
  skull = max(skull, -nose);
  skull = min(skull, jaw);
  skull = min(skull, teeth);
  return skull;
}

// --- Icon emergence: SDF icon that materializes from noise field ---
// Selects icon type based on section index for variety per section.
// Returns additive light contribution (vec3) to blend with col += result.
//
// Parameters:
//   uv          — centered screen coords (aspect-corrected)
//   time        — uTime for slow rotation
//   energy      — 0-1 audio energy (gates appearance)
//   bass        — 0-1 bass for pulse
//   col1        — shader's primary palette color
//   col2        — shader's secondary palette color
//   noiseField  — shader's own FBM/noise value at this pixel (for dissolution)
//   climaxPhase — 0-3 climax state (2+ = active climax)
//   sectionIndex — uSectionIndex for icon variety
vec3 iconEmergence(vec2 uv, float time, float energy, float bass,
                    vec3 col1, vec3 col2, float noiseField, float climaxPhase, float sectionIndex) {
  // Only show during climax phases with sufficient energy
  float climaxGate = smoothstep(1.5, 2.5, climaxPhase);
  float energyGate = smoothstep(0.35, 0.55, energy);
  float gate = energyGate * climaxGate;
  if (gate < 0.001) return vec3(0.0);

  // Slow rotation
  float angle = time * 0.06;
  float ca = cos(angle); float sa = sin(angle);
  vec2 rotUv = vec2(ca * uv.x - sa * uv.y, sa * uv.x + ca * uv.y);

  // Bass pulse
  float pulse = 1.0 + bass * 0.6;
  vec2 scaledUv = rotUv / (0.4 * pulse);

  // Select icon based on section index
  float iconType = mod(sectionIndex, 4.0);
  float d;
  if (iconType < 1.0) {
    d = sdStealie(scaledUv, 1.0);
  } else if (iconType < 2.0) {
    d = _ns_sdDancingBear(scaledUv, time * 0.5);
  } else if (iconType < 3.0) {
    d = _ns_sdRose(scaledUv);
  } else {
    d = _ns_sdSkull(scaledUv, 0.3 + bass * 0.4);
  }

  // Noise dissolution
  d += noiseField * 0.08 * (1.0 - gate * 0.5);

  // Glow
  float glow = 1.0 / (1.0 + d * d * 800.0);
  glow *= gate;

  // Edge
  float edge = smoothstep(0.008, 0.0, abs(d)) * gate;

  // Color
  vec3 iconColor = mix(col1, col2, 0.5 + 0.5 * sin(time * 0.3));
  return iconColor * (glow * 0.5 + edge * 1.2);
}

// --- Hero Icon Emergence: fullscreen SDF icon at climax peaks ---
// 1.2x viewport scale (vs 0.4x for regular iconEmergence).
// Gated by uHeroIconTrigger + uHeroIconProgress uniforms.
// Includes chromatic fringe for prismatic edge effect.
vec3 heroIconEmergence(vec2 uv, float time, float energy, float bass,
                       vec3 col1, vec3 col2, float noiseField, float sectionIndex) {
  float gate = uHeroIconTrigger * uHeroIconProgress;
  if (gate < 0.01) return vec3(0.0);

  // Slow rotation
  float angle = time * 0.04;
  float ca = cos(angle); float sa = sin(angle);
  vec2 rotUv = vec2(ca * uv.x - sa * uv.y, sa * uv.x + ca * uv.y);

  // Full-screen scale: 1.2x viewport radius
  float pulse = 1.0 + bass * 0.3;
  vec2 scaledUv = rotUv / (1.2 * pulse);

  // Select icon based on section index
  float iconType = mod(sectionIndex, 4.0);
  float d;
  if (iconType < 1.0) {
    d = sdStealie(scaledUv, 1.0);
  } else if (iconType < 2.0) {
    d = _ns_sdDancingBear(scaledUv, time * 0.5);
  } else if (iconType < 3.0) {
    d = _ns_sdRose(scaledUv);
  } else {
    d = _ns_sdSkull(scaledUv, 0.3 + bass * 0.4);
  }

  // Noise dissolution: stronger at lifecycle edges
  float dissolveMask = 1.0 - smoothstep(0.3, 0.7, gate);
  d += noiseField * 0.12 * (0.3 + 0.7 * dissolveMask);

  // Wide glow (softer falloff than regular icon)
  float glow = 1.0 / (1.0 + d * d * 100.0) * gate;

  // Edge line
  float edge = smoothstep(0.015, 0.0, abs(d)) * gate;

  // Chromatic fringe: RGB separation along SDF boundary
  vec3 fringe;
  fringe.r = smoothstep(0.025, 0.0, abs(d + 0.008));
  fringe.g = smoothstep(0.025, 0.0, abs(d));
  fringe.b = smoothstep(0.025, 0.0, abs(d - 0.008));
  fringe *= gate * 0.5;

  // Color: blend palette with slow oscillation
  vec3 iconColor = mix(col1, col2, 0.5 + 0.5 * sin(time * 0.2));
  return iconColor * (glow * 0.8 + edge * 1.8) + fringe * iconColor;
}

// --- RGB to HSV conversion ---
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// --- Palette Cycling: rotates all hues via RGB→HSV→rotate→HSV→RGB ---
// speed: rotation speed (radians per unit time)
vec3 paletteCycle(vec3 col, float speed) {
  vec3 hsv = rgb2hsv(col);
  hsv.x = fract(hsv.x + speed);
  return hsv2rgb(hsv);
}

// --- Thermal Shimmer: heat-haze UV displacement ---
// Returns displaced UV coordinates. Call at the start of post-processing.
// Vertical bias (heat rises), layered sine waves.
vec2 thermalShimmer(vec2 uv, float time, float energy, vec2 resolution) {
  float intensity = energy * 0.003;
  float wave1 = sin(uv.y * resolution.y * 0.05 + time * 3.0) * intensity;
  float wave2 = sin(uv.y * resolution.y * 0.12 + time * 5.0 + 1.5) * intensity * 0.5;
  float wave3 = sin(uv.x * resolution.x * 0.03 + time * 2.0) * intensity * 0.3;
  // Vertical bias: displacement is primarily horizontal (heat shimmer)
  return uv + vec2(wave1 + wave2, wave3 * 0.3);
}
`;
