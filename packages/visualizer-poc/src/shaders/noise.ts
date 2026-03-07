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

// --- Film grain: dual-layer (fine + coarse), warm-tinted, resolution-aware ---
// Returns vec3 grain (warm amber bias). Intensity should be scaled externally.
// grainTime = floor(uTime * 15.0) / 15.0 for 2-frame hold at 30fps.
// resY: pass uResolution.y to keep grain density consistent across resolutions.
vec3 filmGrainRes(vec2 uv, float grainTime, float resY) {
  // Scale grain UV so density stays consistent regardless of resolution
  float scale = resY / 1080.0;
  float fineScale = 2000.0 * scale;
  float coarseScale = 400.0 * scale;
  // Dual-layer grain: fine + coarse
  float fine = fract(sin(dot(uv * fineScale, vec2(12.9898, 78.233)) + grainTime * 43758.5453) * 43758.5453);
  float coarse = fract(sin(dot(floor(uv * coarseScale), vec2(45.164, 97.231)) + grainTime * 12345.6789) * 65432.1);
  float n = mix(fine, coarse, 0.3);
  n = (n - 0.5) * 4.0;  // doubled intensity
  // Warm-tinted grain (film stock color response)
  return n * vec3(1.0, 0.92, 0.78);
}
// Backward-compatible overload (assumes 1080p)
vec3 filmGrain(vec2 uv, float grainTime) {
  return filmGrainRes(uv, grainTime, 1080.0);
}

// --- S-curve color grading: deeper blacks, hotter highlights, quintic Hermite ---
vec3 sCurveGrade(vec3 col, float energy) {
  col = clamp(col, 0.0, 1.0);
  // Stronger quintic Hermite S-curve
  vec3 curved = col * col * col * (col * (col * 6.0 - 15.0) + 10.0);
  float amount = mix(0.5, 0.85, energy); // stronger blend range
  col = mix(col, curved, amount);
  // Stronger tone mapping — deeper blacks, hotter highlights
  col = 1.0 - exp(-col * (1.5 + energy * 0.5));
  // Crush blacks slightly
  col = smoothstep(vec3(0.02), vec3(1.0), col);
  return col;
}

// --- Beat pulse: sharp spike at beat boundaries, locked to musical time ---
float beatPulse(float musicalTime) {
  return pow(1.0 - fract(musicalTime), 4.0);
}
float beatPulseHalf(float musicalTime) {
  return pow(1.0 - fract(musicalTime * 0.5), 4.0);
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
    // Convert hue to RGB (simplified HSV with S=1, V=1)
    vec3 rgb = clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    col += rgb * ch;
  }
  return col * energy * 0.5;
}

// --- Parallax UV offset: bright areas shift more than dark (depth illusion) ---
vec2 parallaxUV(vec2 uv, vec2 camOffset, float depth) {
  return uv + camOffset * depth * 0.015;
}

// --- Inverse energy response: OPENS at peaks, CLOSES at valleys ---
// Use for vignette in deep_ocean/aurora: vastness at peaks, intimacy in quiet
float inverseEnergy(float e) { return 1.0 - smoothstep(0.15, 0.45, e); }

// --- Henyey-Greenstein phase function for anisotropic scattering ---
float hgPhase(float cosTheta, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

// --- Beer's law transmittance ---
float beerLaw(float density, float stepSize) {
  return exp(-density * stepSize);
}

// --- Blackbody radiation approximation (temperature 1000-6500K mapped to 0-1) ---
vec3 blackbodyColor(float t) {
  vec3 cold = vec3(1.0, 0.2, 0.0);   // 1000K deep red
  vec3 warm = vec3(1.0, 0.6, 0.1);   // 2500K orange
  vec3 hot  = vec3(1.0, 0.9, 0.7);   // 5000K warm white
  vec3 blue = vec3(0.7, 0.85, 1.0);  // 6500K blue-white
  if (t < 0.33) return mix(cold, warm, t / 0.33);
  if (t < 0.66) return mix(warm, hot, (t - 0.33) / 0.33);
  return mix(hot, blue, (t - 0.66) / 0.34);
}

// --- Per-shader color grading (call as final step before output) ---
vec3 colorGrade(vec3 col, vec3 shadows, vec3 highlights, float contrast, float saturation) {
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(shadows, col, smoothstep(0.0, 0.3, lum));
  col = mix(col, highlights, smoothstep(0.6, 1.0, lum));
  col = mix(vec3(lum), col, saturation);
  col = 0.5 + (col - 0.5) * contrast;
  return clamp(col, 0.0, 1.0);
}

// --- Halation/bloom: warm color bleed around bright areas (film artifact) ---
vec3 halation(vec2 uv, vec3 col, float energy) {
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float bloom = smoothstep(0.6, 1.0, lum);
  // Halation: warm color bleed around bright areas
  vec3 halo = vec3(1.0, 0.7, 0.4) * bloom * (0.15 + energy * 0.1);
  return col + halo;
}

// --- Light leak: prominent multi-source with distinct warm colors ---
vec3 lightLeak(vec2 p, float time, float energy, float onsetSnap) {
  vec3 total = vec3(0.0);
  // 3 independent leak sources with different colors, 120 degrees apart
  for (int i = 0; i < 3; i++) {
    float phase = float(i) * 2.094; // 120 degrees apart
    float t = time * (0.05 + float(i) * 0.02) + phase;
    vec2 leakPos = vec2(cos(t), sin(t * 0.7)) * 0.65;
    float dist = length(p - leakPos);
    float leak = smoothstep(0.9, 0.0, dist) * (energy * 0.8 + 0.1);
    // Each leak has a distinct warm color
    vec3 leakColor;
    if (i == 0) leakColor = vec3(1.0, 0.4, 0.1);  // amber
    else if (i == 1) leakColor = vec3(1.0, 0.7, 0.2);  // gold
    else leakColor = vec3(0.9, 0.3, 0.5);  // rose
    total += leakColor * leak * 0.25;
  }
  // Onset flash — bright white leak burst
  total += vec3(1.0, 0.9, 0.7) * onsetSnap * 0.15;
  return total;
}
`;
