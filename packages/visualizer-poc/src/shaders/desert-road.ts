/**
 * Desert Road — vertex/fragment shaders for 3D geometry materials.
 *
 * The DesertRoadScene now uses React Three Fiber 3D geometry (PlaneGeometry,
 * BoxGeometry, CylinderGeometry) with inline shaderMaterials. These exports
 * are retained for backward compatibility and provide basic 3D-aware shaders
 * that can be used with meshes if needed.
 *
 * Audio reactivity is handled per-component in DesertRoadScene.tsx via
 * useAudioData() rather than through shared GLSL uniforms.
 */

/** Basic 3D vertex shader with world position output */
export const desertRoadVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Asphalt road surface fragment shader — rich texture with heat shimmer */
export const desertRoadFrag = /* glsl */ `
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

// 6-octave FBM for detailed road texture
float fbm6_road(vec2 p) {
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

  // Domain-warped asphalt texture (fbm6 for aggregate detail)
  vec2 roadUV = vWorldPos.xz * 8.0 * energyFreq;
  float warp = noise(vWorldPos.xz * 1.5) * 0.3;
  float asphaltTex = fbm6_road(roadUV + warp);
  vec3 asphalt = vec3(0.08, 0.07, 0.06) + asphaltTex * 0.05;

  // Tar seam lines
  float seamNoise = noise(vec2(vWorldPos.x * 0.3, vWorldPos.z * 20.0));
  float seamMask = smoothstep(0.85, 0.88, seamNoise);
  asphalt = mix(asphalt, vec3(0.04, 0.035, 0.03), seamMask * 0.4);

  // === HEAT SHIMMER: domain-warped mirage effect ===
  float shimmerGate = jamBoost * 0.7 + energy * 0.3;
  float shimmerWave = sin(vWorldPos.z * 0.5 + uDynamicTime * 1.5) * 0.5 + 0.5;
  shimmerWave *= sin(vWorldPos.z * 1.3 - uDynamicTime * 0.8 + 2.0) * 0.5 + 0.5;
  float distFromCamera = length(vWorldPos.xz);
  float shimmerFade = smoothstep(5.0, 30.0, distFromCamera);
  float shimmer = shimmerWave * shimmerFade * shimmerGate;
  // Shimmer brightens and shifts color (hot air mirage)
  vec3 shimmerColor = mix(vec3(0.12, 0.10, 0.08), hsv2rgb(vec3(uPalettePrimary, uPaletteSaturation * 0.2, 0.15)), 0.2);
  asphalt = mix(asphalt, shimmerColor, shimmer * 0.3);

  // Basic directional lighting
  vec3 lightDir = normalize(vec3(0.2, 1.0, -0.5));
  float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.3 + 0.7;
  diffuse *= 1.0 - soloFocus * 0.25;
  asphalt *= diffuse;

  // Secondary layer: road wear / tire marks (30% blend)
  float wearNoise = noise(vec2(vWorldPos.x * 30.0, vWorldPos.z * 2.0));
  float wearMask = smoothstep(0.6, 0.7, wearNoise) * smoothstep(0.15, 0.0, abs(vWorldPos.x));
  vec3 wearColor = vec3(0.06, 0.055, 0.05);
  asphalt = mix(asphalt, wearColor, wearMask * 0.3);

  // Space: cool moonlit blue tint
  asphalt = mix(asphalt, asphalt * vec3(0.7, 0.75, 1.0), spaceHush * 0.4);

  // Chorus: warm sunset reflection — palette secondary
  vec3 sunsetTint = hsv2rgb(vec3(uPaletteSecondary, uPaletteSaturation * 0.3, 0.1));
  asphalt += mix(vec3(0.04, 0.02, 0.005), sunsetTint, 0.2) * chorusVibe;

  // Bass: road surface throb
  asphalt += vec3(0.01, 0.008, 0.005) * bass * 0.15;

  gl_FragColor = vec4(asphalt, 1.0);
}
`;

/** Sandy desert ground fragment shader — rich rippled sand texture */
export const desertGroundFrag = /* glsl */ `
precision highp float;

uniform float uDynamicTime;
uniform float uEnergy;
uniform float uSectionType;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;

varying vec2 vUv;
varying vec3 vWorldPos;

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

float fbm6_sand(vec2 p) {
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
  float spaceHush = smoothstep(6.5, 7.5, sType);
  float chorusVibe = smoothstep(2.5, 3.5, sType) * (1.0 - smoothstep(3.5, 4.5, sType));

  // Domain-warped sand ripple texture (fbm6)
  vec2 sandUV = vWorldPos.xz * 2.0 * energyFreq;
  float sandWarp = noise(vWorldPos.xz * 0.5) * 0.4;
  float sandTex = fbm6_sand(sandUV + sandWarp);
  // Wind ripple pattern
  float ripple = sin(vWorldPos.z * 3.0 + vWorldPos.x * 0.5) * 0.5 + 0.5;
  ripple *= noise(vWorldPos.xz * 5.0);

  vec3 sand = vec3(0.55, 0.42, 0.28) * (0.6 + sandTex * 0.2);
  // Ripple highlights
  sand += vec3(0.05, 0.04, 0.02) * ripple * 0.3;

  // Secondary layer: scattered pebbles/rocks (30%)
  float pebble = noise(vWorldPos.xz * 15.0);
  vec3 pebbleColor = mix(vec3(0.4, 0.35, 0.25), hsv2rgb(vec3(uPalettePrimary, uPaletteSaturation * 0.1, 0.35)), 0.1);
  sand = mix(sand, pebbleColor, smoothstep(0.78, 0.85, pebble) * 0.3);

  // Space: cool moonlit desert floor
  sand = mix(sand, sand * vec3(0.6, 0.65, 0.9), spaceHush * 0.5);

  // Chorus: vivid warm golden sand with palette influence
  vec3 goldenTint = mix(vec3(0.08, 0.05, 0.01), hsv2rgb(vec3(uPaletteSecondary, uPaletteSaturation * 0.2, 0.08)), 0.2);
  sand += goldenTint * chorusVibe;

  gl_FragColor = vec4(sand, 1.0);
}
`;

/** Mesa/butte sandstone fragment shader — rich stratified rock with erosion */
export const mesaFrag = /* glsl */ `
precision highp float;

uniform float uEnergy;
uniform float uSectionType;
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

  // Section-type modulation
  float sType = uSectionType;
  float spaceHush = smoothstep(6.5, 7.5, sType);
  float chorusVibe = smoothstep(2.5, 3.5, sType) * (1.0 - smoothstep(3.5, 4.5, sType));
  float soloFocus = smoothstep(3.5, 4.5, sType) * (1.0 - smoothstep(4.5, 5.5, sType));

  // Layered sandstone bands — richer with noise modulation
  float bandFreq = 3.0 * energyFreq;
  float bands = sin(vWorldPos.y * bandFreq) * 0.5 + 0.5;
  // Domain warp the bands for natural geological feel
  float bandWarp = noise(vec2(vWorldPos.y * 2.0, vWorldPos.x * 0.5)) * 0.2;
  bands = sin(vWorldPos.y * bandFreq + bandWarp * 3.0) * 0.5 + 0.5;
  // Fine strata detail
  float fineStrata = noise(vec2(vWorldPos.y * 15.0, vWorldPos.x * 1.0)) * 0.15;
  bands += fineStrata;

  vec3 darkStone = mix(vec3(0.45, 0.2, 0.08), hsv2rgb(vec3(uPalettePrimary, uPaletteSaturation * 0.15, 0.3)), 0.08);
  vec3 brightStone = mix(vec3(0.65, 0.3, 0.1), hsv2rgb(vec3(uPaletteSecondary, uPaletteSaturation * 0.1, 0.45)), 0.06);
  vec3 redRock = mix(darkStone, brightStone, bands);

  // Secondary layer: weathering / erosion pits (30%)
  float erosion = noise(vec2(vWorldPos.x * 8.0, vWorldPos.y * 4.0 + vWorldPos.z * 3.0));
  vec3 erosionColor = darkStone * 0.7;
  redRock = mix(redRock, erosionColor, smoothstep(0.65, 0.8, erosion) * 0.3);

  // Lighting with ambient occlusion in cracks
  vec3 lightDir = normalize(vec3(0.3, 1.0, -0.3));
  float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.4 + 0.6;
  diffuse *= 1.0 - soloFocus * 0.2;
  // Rim light on edges facing camera
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float rim = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
  diffuse += rim * 0.08;
  redRock *= diffuse;

  // Space: cool moonlit rock
  redRock = mix(redRock, redRock * vec3(0.65, 0.7, 1.0), spaceHush * 0.4);

  // Chorus: warm sunset glow — palette secondary tint
  vec3 sunsetGlow = mix(vec3(0.06, 0.02, 0.0), hsv2rgb(vec3(uPaletteSecondary, uPaletteSaturation * 0.2, 0.06)), 0.2);
  redRock += sunsetGlow * chorusVibe;

  gl_FragColor = vec4(redRock, 1.0);
}
`;
