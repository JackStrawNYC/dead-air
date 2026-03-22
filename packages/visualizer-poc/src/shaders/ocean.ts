/**
 * Ocean 3D — GLSL shaders for React Three Fiber 3D ocean scene.
 *
 * Exports separate vertex/fragment pairs for each mesh:
 *   - Water surface (PlaneGeometry with vertex displacement)
 *   - Sky background (fullscreen quad behind everything)
 *   - Celestial body (SphereGeometry with emissive material)
 *   - Foam/spray particles (Points)
 *   - Bioluminescence particles (Points)
 *
 * Audio mapping:
 *   uBass + uEnergy → swell height (calm → massive waves)
 *   uOnsetSnap      → foam/spray burst
 *   uSlowEnergy     → celestial body pulse, atmosphere
 *   uVocalPresence  → bioluminescence intensity
 *   uMelodicPitch   → wave frequency modulation
 *   uChromaHue      → water/sky tint
 *   uFlatness       → wave chop detail
 */

// ═══════════════════════════════════════════════════
// WATER SURFACE — vertex-displaced PlaneGeometry
// ═══════════════════════════════════════════════════

export const oceanWaterVert = /* glsl */ `
uniform float uTime;
uniform float uDynamicTime;
uniform float uBass;
uniform float uEnergy;
uniform float uMelodicPitch;
uniform float uFlatness;
uniform float uSlowEnergy;
uniform float uBeatSnap;

varying vec2 vUv;
varying float vWaveHeight;
varying vec3 vWorldPos;
varying vec3 vNormal;

// Simplex-style hash for wave noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise2d(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289v2(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float oceanWave(vec2 pos, float time, float waveFreq, float waveAmp, float storminess) {
  float h = 0.0;
  float freq = waveFreq;
  float amp = waveAmp;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    float wave = sin(pos.x * freq + time * (0.8 + float(i) * 0.15))
               + sin(pos.y * freq * 0.7 + time * (0.6 + float(i) * 0.1));
    h += wave * amp;
    float nDisp = snoise2d(pos * freq * 0.3 + time * 0.1) * amp * 0.4 * storminess;
    h += nDisp;
    pos = rot * pos;
    freq *= 1.8;
    amp *= 0.5;
  }
  return h;
}

void main() {
  vUv = uv;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float storminess = clamp(energy + bass * 0.3, 0.0, 1.5);
  float melodicP = clamp(uMelodicPitch, 0.0, 1.0);

  float waveTime = uDynamicTime * (0.3 + energy * 0.4);
  float waveFreq = mix(1.5, 4.0, energy) + melodicP * 2.0;
  float waveAmp = mix(0.1, 2.5, storminess);

  vec3 pos = position;
  float h = oceanWave(pos.xz * 0.01, waveTime, waveFreq, waveAmp, storminess);

  // Add chop detail from flatness
  float chop = snoise2d(pos.xz * 0.05 + uDynamicTime * 0.2) * uFlatness * 0.3;
  h += chop;

  // Beat snap adds a quick vertical pulse
  h += uBeatSnap * 0.15;

  pos.y += h;
  vWaveHeight = h;

  // Compute normal via finite differences
  float dx = 0.5;
  float hx = oceanWave((pos.xz + vec2(dx, 0.0)) * 0.01, waveTime, waveFreq, waveAmp, storminess);
  float hz = oceanWave((pos.xz + vec2(0.0, dx)) * 0.01, waveTime, waveFreq, waveAmp, storminess);
  vNormal = normalize(vec3(h - hx, dx * 2.0, h - hz));

  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const oceanWaterFrag = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uEnergy;
uniform float uBass;
uniform float uSlowEnergy;
uniform float uOnsetSnap;
uniform float uVocalPresence;
uniform float uChromaHue;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform float uDynamicTime;
uniform vec3 uCelestialPos;

varying vec2 vUv;
varying float vWaveHeight;
varying vec3 vWorldPos;
varying vec3 vNormal;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  float energy = clamp(uEnergy, 0.0, 1.0);
  float storminess = clamp(energy + uBass * 0.3, 0.0, 1.5);
  float chromaH = clamp(uChromaHue, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);

  // Deep water color
  float hue = uPalettePrimary + chromaH * 0.05;
  float sat = mix(0.5, 0.9, uSlowEnergy) * uPaletteSaturation;
  vec3 calmDeep = hsv2rgb(vec3(hue, sat, mix(0.06, 0.18, uSlowEnergy)));
  vec3 stormDeep = vec3(0.08, 0.12, 0.10);
  vec3 waterColor = mix(calmDeep, stormDeep, storminess * 0.7);

  // Surface shading: lighter crests, darker troughs
  float maxWaveH = mix(0.5, 2.5, storminess);
  float surfaceShade = smoothstep(-maxWaveH, maxWaveH, vWaveHeight);
  vec3 crestColor = mix(waterColor * 1.6, vec3(0.25, 0.35, 0.30), storminess * 0.3);
  vec3 troughColor = waterColor * 0.5;
  vec3 col = mix(troughColor, crestColor, surfaceShade);

  // Fresnel reflection
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
  vec3 reflectColor = mix(vec3(0.05, 0.08, 0.15), vec3(0.2, 0.25, 0.35), uSlowEnergy);
  col = mix(col, reflectColor, fresnel * 0.6);

  // Foam on crests triggered by onset
  float foamMask = smoothstep(maxWaveH * 0.5, maxWaveH, vWaveHeight);
  float foamAmount = foamMask * (onset * 0.8 + storminess * 0.5 + energy * 0.3);
  foamAmount = clamp(foamAmount, 0.0, 1.0);
  col = mix(col, vec3(0.85, 0.9, 0.95), foamAmount * 0.7);

  // Bioluminescence during vocal presence
  if (uVocalPresence > 0.1) {
    float bioGate = smoothstep(0.1, 0.5, uVocalPresence) * (1.0 - storminess * 0.7);
    float bioPattern = sin(vWorldPos.x * 0.5 + uDynamicTime * 0.3) *
                       cos(vWorldPos.z * 0.7 + uDynamicTime * 0.2);
    bioPattern = smoothstep(0.3, 0.8, bioPattern * 0.5 + 0.5);
    vec3 bioColor = mix(vec3(0.1, 0.5, 0.9), vec3(0.0, 0.8, 0.6), bioPattern);
    col += bioColor * bioPattern * bioGate * 0.25;
  }

  // Celestial reflection in water (stretched vertical highlight)
  float reflectX = vWorldPos.x - uCelestialPos.x * 20.0;
  float reflectStretch = 8.0 + storminess * 12.0;
  float reflectDist = sqrt(reflectX * reflectX * 0.01 + pow(vWorldPos.z * 0.02, 2.0));
  float celestialReflect = exp(-reflectDist * reflectDist * reflectStretch * 0.01);
  celestialReflect *= (0.5 + 0.5 * sin(vWorldPos.z * 0.3 + uDynamicTime * 0.5));
  float celestialBrightness = mix(0.9, 0.15, storminess);
  col += vec3(1.0, 0.92, 0.7) * celestialReflect * celestialBrightness * 0.3;

  // Distance fog toward horizon
  float dist = length(vWorldPos.xz) * 0.005;
  float fog = 1.0 - exp(-dist * dist);
  vec3 fogColor = mix(waterColor, vec3(0.05, 0.06, 0.08), 0.5);
  col = mix(col, fogColor, clamp(fog, 0.0, 0.7));

  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════
// SKY BACKGROUND — fullscreen quad behind scene
// ═══════════════════════════════════════════════════

export const oceanSkyVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

export const oceanSkyFrag = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uDynamicTime;
uniform float uEnergy;
uniform float uSlowEnergy;
uniform float uChromaHue;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform vec2 uResolution;

varying vec2 vUv;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = vUv;
  float energy = clamp(uEnergy, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float storminess = clamp(energy + 0.3, 0.0, 1.5);
  float chromaH = clamp(uChromaHue, 0.0, 1.0);

  float hue1 = uPaletteSecondary + chromaH * 0.08;
  float sat = mix(0.5, 0.9, slowE) * uPaletteSaturation;

  vec3 horizonColor = hsv2rgb(vec3(hue1, sat * 0.6, mix(0.15, 0.35, slowE)));
  vec3 deepSkyColor = vec3(0.01, 0.01, 0.04);
  horizonColor = mix(horizonColor, vec3(0.08, 0.06, 0.12), storminess * 0.5);

  // Gradient: horizon at bottom of sky quad, deep space at top
  float skyGradient = uv.y;
  vec3 col = mix(horizonColor, deepSkyColor, skyGradient);

  // Stars: visible during calm
  float starVisibility = smoothstep(0.4, 0.0, storminess);
  if (starVisibility > 0.01) {
    float slowTime = uDynamicTime * 0.15;
    vec2 starUv = uv + slowTime * 0.005;
    float starH = fract(sin(dot(floor(starUv * 100.0), vec2(127.1, 311.7))) * 43758.5453);
    float starH2 = fract(sin(dot(floor(starUv * 100.0), vec2(269.5, 183.3))) * 43758.5453);
    vec2 starF = fract(starUv * 100.0);
    float starDist = length(starF - vec2(starH, starH2));
    float hasStar = step(0.75, starH);
    float twinkle = 0.6 + 0.4 * sin(uTime * 1.5 + starH * 50.0);
    float star = hasStar * twinkle * smoothstep(0.03, 0.005, starDist);
    col += vec3(0.8, 0.85, 1.0) * star * 0.5 * starVisibility;
  }

  // Horizon glow band at bottom
  float horizonGlow = exp(-pow((uv.y) * 8.0, 2.0));
  col += horizonColor * horizonGlow * 0.3;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════
// CELESTIAL BODY — emissive sphere on horizon
// ═══════════════════════════════════════════════════

export const oceanCelestialVert = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const oceanCelestialFrag = /* glsl */ `
precision highp float;

uniform float uSlowEnergy;
uniform float uEnergy;

varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  float storminess = clamp(uEnergy + 0.3, 0.0, 1.5);
  float brightness = mix(0.9, 0.15, storminess);

  // Warm amber body color
  vec3 bodyColor = mix(vec3(1.0, 0.92, 0.7), vec3(0.6, 0.6, 0.7), storminess);

  // Limb darkening for realistic celestial body
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float rim = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.0);
  float limbDarkening = 1.0 - rim * 0.4;

  vec3 col = bodyColor * brightness * limbDarkening;

  // Emissive glow falloff at edges
  float glow = pow(max(dot(viewDir, vNormal), 0.0), 0.5);
  col *= glow;

  gl_FragColor = vec4(col, glow * brightness);
}
`;

// ═══════════════════════════════════════════════════
// FOAM/SPRAY PARTICLES — Points on wave crests
// ═══════════════════════════════════════════════════

export const oceanFoamVert = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uOnsetSnap;

attribute float aPhase;
attribute float aSpeed;

varying float vAlpha;

void main() {
  vec3 pos = position;

  // Particles drift upward and outward from crests
  float life = fract(aPhase + uTime * aSpeed * 0.3);
  pos.y += life * (0.5 + uEnergy * 1.5);
  pos.x += sin(life * 6.28 + aPhase * 20.0) * 0.3;
  pos.z += cos(life * 4.0 + aPhase * 15.0) * 0.2;

  // Fade out over lifetime
  vAlpha = (1.0 - life) * (1.0 - life);
  vAlpha *= clamp(uOnsetSnap + uEnergy * 0.5, 0.0, 1.0);

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = max(1.0, (3.0 + uEnergy * 4.0) * (300.0 / -mvPos.z));
  gl_Position = projectionMatrix * mvPos;
}
`;

export const oceanFoamFrag = /* glsl */ `
precision highp float;
varying float vAlpha;

void main() {
  // Soft circular particle
  float dist = length(gl_PointCoord - 0.5);
  if (dist > 0.5) discard;
  float alpha = smoothstep(0.5, 0.1, dist) * vAlpha;
  gl_FragColor = vec4(0.85, 0.9, 0.95, alpha);
}
`;

// ═══════════════════════════════════════════════════
// BIOLUMINESCENCE PARTICLES — Points in water
// ═══════════════════════════════════════════════════

export const oceanBioVert = /* glsl */ `
uniform float uTime;
uniform float uVocalPresence;
uniform float uDynamicTime;

attribute float aPhase;

varying float vAlpha;
varying float vHue;

void main() {
  vec3 pos = position;

  // Gentle drift
  float t = uDynamicTime * 0.1 + aPhase * 6.28;
  pos.x += sin(t * 0.7 + aPhase * 10.0) * 0.5;
  pos.z += cos(t * 0.5 + aPhase * 8.0) * 0.5;
  pos.y += sin(t * 0.3 + aPhase * 12.0) * 0.1;

  // Vocal presence triggers visibility
  float gate = smoothstep(0.1, 0.5, uVocalPresence);
  // Individual pulse
  float pulse = sin(uTime * 2.0 + aPhase * 30.0) * 0.5 + 0.5;
  vAlpha = gate * pulse * 0.8;
  vHue = aPhase;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = max(1.0, (2.0 + pulse * 3.0) * gate * (200.0 / -mvPos.z));
  gl_Position = projectionMatrix * mvPos;
}
`;

export const oceanBioFrag = /* glsl */ `
precision highp float;
varying float vAlpha;
varying float vHue;

void main() {
  float dist = length(gl_PointCoord - 0.5);
  if (dist > 0.5) discard;
  float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;

  // Blue-green bioluminescence with variation
  vec3 col = mix(vec3(0.1, 0.5, 0.9), vec3(0.0, 0.8, 0.6), vHue);
  gl_FragColor = vec4(col, alpha);
}
`;
