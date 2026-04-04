/**
 * Forest — vertex/fragment shaders for 3D geometry materials.
 *
 * The ForestScene now uses React Three Fiber 3D geometry (CylinderGeometry
 * trunks, PlaneGeometry ground/canopy, Points fireflies) with inline
 * shaderMaterials. These exports are retained for backward compatibility
 * and provide basic 3D-aware shaders for mesh-based rendering.
 *
 * Audio reactivity is handled per-component in ForestScene.tsx via
 * useAudioData() rather than through shared GLSL uniforms.
 */

/** Basic 3D vertex shader with world position and normal output */
export const forestVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFogDepth;

void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mvPos.z;
  gl_Position = projectionMatrix * mvPos;
}
`;

/** Forest ground fragment shader with leaf litter noise and atmospheric fog */
export const forestFrag = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uDynamicTime;
uniform float uEnergy;
uniform float uSectionType;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform float uBass;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFogDepth;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 6-octave FBM for rich ground detail
float fbm6_ground(vec2 p) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    val += amp * noise(p * freq);
    freq *= 2.1;
    amp *= 0.48;
  }
  return val;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float energyFreq = 1.0 + energy * 0.5;

  // Section-type modulation
  float sType = uSectionType;
  float jamBoost = smoothstep(4.5, 5.5, sType);
  float spaceHush = smoothstep(6.5, 7.5, sType);
  float chorusVibe = smoothstep(2.5, 3.5, sType) * (1.0 - smoothstep(3.5, 4.5, sType));
  float soloFocus = smoothstep(3.5, 4.5, sType) * (1.0 - smoothstep(4.5, 5.5, sType));

  // Domain-warped leaf litter texture (fbm6 for rich detail)
  vec2 warpedUV = vWorldPos.xz * 1.5 * energyFreq;
  float warpOff = noise(vWorldPos.xz * 0.3 + uDynamicTime * 0.02) * 0.8;
  warpedUV += vec2(warpOff, -warpOff * 0.7);
  float leaves = fbm6_ground(warpedUV);

  vec3 soil = vec3(0.03, 0.04, 0.02);
  vec3 litter = vec3(0.08, 0.06, 0.03);
  // Palette-tinted litter
  vec3 paletteLitter = hsv2rgb(vec3(uPalettePrimary, uPaletteSaturation * 0.15, 0.06));
  litter = mix(litter, paletteLitter, 0.2);
  vec3 col = mix(soil, litter, leaves * 0.5 + 0.25);

  // Secondary layer: moss patches at 30% for depth
  float mossNoise = fbm6_ground(vWorldPos.xz * 2.5 + vec2(10.0, 7.0));
  vec3 mossColor = hsv2rgb(vec3(uPaletteSecondary, uPaletteSaturation * 0.3, 0.04));
  mossColor = mix(vec3(0.01, 0.03, 0.01), mossColor, 0.3);
  float mossMask = smoothstep(0.35, 0.65, mossNoise);
  col = mix(col, mossColor, mossMask * 0.3);

  // Fine detail: tiny fallen twigs/seeds
  float fineDetail = noise(vWorldPos.xz * 12.0 * energyFreq);
  col += vec3(0.005, 0.003, 0.001) * smoothstep(0.7, 0.9, fineDetail);

  // Basic directional lighting
  vec3 lightDir = normalize(vec3(0.3, 1.0, -0.2));
  float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.3 + 0.7;

  // Chorus: dappled sunlight — richer pattern with domain warp
  float dappleWarp = noise(vWorldPos.xz * 1.0 + uDynamicTime * 0.01);
  float dapple = noise(vWorldPos.xz * 2.5 + dappleWarp * 0.5);
  diffuse += chorusVibe * 0.2 * dapple;

  // Solo: concentrated single bright area, darker elsewhere
  float soloSpot = smoothstep(0.3, 0.0, length(vWorldPos.xz * 0.1));
  diffuse *= mix(1.0, 0.7 + soloSpot * 0.6, soloFocus);

  // Bass: subtle ground throb
  diffuse += bass * 0.04 * sin(vWorldPos.x * 0.5 + uDynamicTime * 1.5);

  col *= diffuse;

  // === ATMOSPHERIC FOG: volumetric depth fog ===
  float fogDensity = mix(0.04, 0.08, spaceHush);
  float fogFactor = 1.0 - exp(-vFogDepth * fogDensity);
  fogFactor = clamp(fogFactor, 0.0, 0.75);
  // Fog color: palette-tinted blue-green mist
  vec3 fogColor = mix(
    vec3(0.02, 0.04, 0.03),
    hsv2rgb(vec3(uPaletteSecondary, uPaletteSaturation * 0.15, 0.08)),
    0.3
  );
  // Space: thicker, more mysterious fog
  fogColor = mix(fogColor, vec3(0.03, 0.04, 0.05), spaceHush * 0.5);
  col = mix(col, fogColor, fogFactor);

  // Jam: warmer, denser leaf litter
  col += vec3(0.005, 0.003, 0.0) * jamBoost;

  gl_FragColor = vec4(col, 1.0);
}
`;

/** Tree bark fragment shader — rich multi-layer texture */
export const barkFrag = /* glsl */ `
precision highp float;

uniform float uEnergy;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;

varying vec3 vWorldPos;
varying vec3 vNormal;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  float energy = clamp(uEnergy, 0.0, 1.0);
  float energyFreq = 1.0 + energy * 0.5;

  // Vertical bark grain — richer multi-octave
  float grain = sin(vWorldPos.y * 8.0 * energyFreq + vWorldPos.x * 2.0) * 0.15;
  grain += sin(vWorldPos.y * 22.0 + vWorldPos.x * 5.0) * 0.05;

  // Domain-warped bark texture for knots and furrows
  float warp = noise(vec2(vWorldPos.y * 1.5, vWorldPos.x * 0.5)) * 0.4;
  float barkDetail = noise(vec2(vWorldPos.y * 6.0 + warp, vWorldPos.x * 3.0));
  float barkFine = noise(vec2(vWorldPos.y * 18.0 * energyFreq, vWorldPos.x * 8.0 + warp)) * 0.3;

  vec3 bark = vec3(0.06, 0.04, 0.03) + grain * vec3(0.02, 0.01, 0.005);
  bark += vec3(0.015, 0.008, 0.004) * barkDetail;
  bark += vec3(0.005, 0.003, 0.001) * barkFine;

  // Secondary layer: lichen patches tinted by palette (30%)
  float lichenMask = noise(vec2(vWorldPos.y * 2.0, vWorldPos.x * 3.0 + 5.0));
  vec3 lichenColor = hsv2rgb(vec3(uPaletteSecondary, uPaletteSaturation * 0.2, 0.06));
  lichenColor = mix(vec3(0.04, 0.05, 0.03), lichenColor, 0.3);
  bark = mix(bark, lichenColor, smoothstep(0.55, 0.75, lichenMask) * 0.3);

  // Lighting with ambient occlusion in furrows
  vec3 lightDir = normalize(vec3(0.2, 1.0, -0.3));
  float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.3 + 0.7;
  float ao = mix(0.85, 1.0, barkDetail);
  bark *= diffuse * ao;

  gl_FragColor = vec4(bark, 1.0);
}
`;

/** Canopy alpha fragment shader — rich leaf detail with light filtering */
export const canopyFrag = /* glsl */ `
precision highp float;

uniform float uDynamicTime;
uniform float uEnergy;
uniform float uSectionType;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 6-octave FBM for rich canopy pattern
float fbm6_canopy(vec2 p) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    val += amp * noise(p * freq);
    freq *= 2.1;
    amp *= 0.48;
  }
  return val;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  float energy = clamp(uEnergy, 0.0, 1.0);
  float energyFreq = 1.0 + energy * 0.5;

  // Section-type modulation
  float sType = uSectionType;
  float jamBoost = smoothstep(4.5, 5.5, sType);
  float spaceHush = smoothstep(6.5, 7.5, sType);
  float chorusVibe = smoothstep(2.5, 3.5, sType) * (1.0 - smoothstep(3.5, 4.5, sType));
  float soloFocus = smoothstep(3.5, 4.5, sType) * (1.0 - smoothstep(4.5, 5.5, sType));

  vec2 uv = vUv * 4.0;
  // Domain warp for organic leaf clusters
  float warp = noise(uv * 0.8 + uDynamicTime * 0.01) * 0.3;
  vec2 warpedUV = uv + vec2(warp, -warp * 0.6);

  // Rich 6-octave canopy pattern
  float n = fbm6_canopy(warpedUV * energyFreq);

  // Secondary leaf layer for depth (blended at 30%)
  float n2 = fbm6_canopy(warpedUV * 1.5 + vec2(15.0, 8.0));

  // Density threshold: jam/space=denser canopy, chorus/solo=more gaps
  float densityThreshold = 0.4 + jamBoost * 0.08 + spaceHush * 0.06 - chorusVibe * 0.1 - soloFocus * 0.05;
  float alpha = smoothstep(densityThreshold, densityThreshold + 0.15, n);
  // Secondary layer adds depth
  alpha = max(alpha, smoothstep(densityThreshold + 0.05, densityThreshold + 0.2, n2) * 0.3);

  // Canopy base color with palette influence
  vec3 canopyBase = vec3(0.02, 0.04, 0.02);
  vec3 paletteTint = hsv2rgb(vec3(uPalettePrimary, uPaletteSaturation * 0.2, 0.04));
  vec3 canopyColor = mix(canopyBase, paletteTint, 0.15);

  // Leaf variation: some leaves lighter (secondary palette)
  vec3 lightLeaf = hsv2rgb(vec3(uPaletteSecondary, uPaletteSaturation * 0.25, 0.06));
  float leafVar = noise(uv * 3.0);
  canopyColor = mix(canopyColor, lightLeaf, leafVar * 0.2);

  // Chorus: sunlight filtering through — golden-green patches
  float sunPatch = noise(uv * 1.5 + uDynamicTime * 0.005) * chorusVibe;
  canopyColor += vec3(0.008, 0.02, 0.005) * sunPatch;

  // Space: muted gray-green fog tone
  canopyColor = mix(canopyColor, vec3(0.03, 0.04, 0.035), spaceHush * 0.5);

  gl_FragColor = vec4(canopyColor, alpha * 0.85);
}
`;
