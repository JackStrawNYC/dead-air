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

void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Forest ground fragment shader with leaf litter noise */
export const forestFrag = /* glsl */ `
precision highp float;

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

void main() {
  // Leaf litter texture from layered noise
  float n1 = noise(vWorldPos.xz * 1.5);
  float n2 = noise(vWorldPos.xz * 4.0 + 20.0) * 0.5;
  float leaves = n1 + n2;

  vec3 soil = vec3(0.03, 0.04, 0.02);
  vec3 litter = vec3(0.08, 0.06, 0.03);
  vec3 col = mix(soil, litter, leaves * 0.5 + 0.25);

  // Moss tint
  col += vec3(0.0, 0.01, 0.0) * noise(vWorldPos.xz * 3.0);

  // Basic directional lighting
  vec3 lightDir = normalize(vec3(0.3, 1.0, -0.2));
  float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.3 + 0.7;
  col *= diffuse;

  gl_FragColor = vec4(col, 1.0);
}
`;

/** Tree bark fragment shader */
export const barkFrag = /* glsl */ `
precision highp float;

varying vec3 vWorldPos;
varying vec3 vNormal;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  // Vertical bark grain
  float grain = sin(vWorldPos.y * 8.0 + vWorldPos.x * 2.0) * 0.15;
  vec3 bark = vec3(0.06, 0.04, 0.03) + grain * vec3(0.02, 0.01, 0.005);

  // Simple lighting
  vec3 lightDir = normalize(vec3(0.2, 1.0, -0.3));
  float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.3 + 0.7;
  bark *= diffuse;

  gl_FragColor = vec4(bark, 1.0);
}
`;

/** Canopy alpha fragment shader */
export const canopyFrag = /* glsl */ `
precision highp float;

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

void main() {
  vec2 uv = vUv * 4.0;
  float n = noise(uv * 2.0);
  n += noise(uv * 5.0 + 20.0) * 0.5;
  n += noise(uv * 11.0 + 50.0) * 0.25;
  n /= 1.75;

  float alpha = smoothstep(0.4, 0.55, n);
  vec3 canopyColor = vec3(0.02, 0.04, 0.02);

  gl_FragColor = vec4(canopyColor, alpha * 0.85);
}
`;
