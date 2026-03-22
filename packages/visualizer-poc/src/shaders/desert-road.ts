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

/** Asphalt road surface fragment shader */
export const desertRoadFrag = /* glsl */ `
precision highp float;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  // Asphalt texture from world-space noise
  float noise = hash(floor(vWorldPos.xz * 8.0)) * 0.04;
  vec3 asphalt = vec3(0.08, 0.07, 0.06) + noise;

  // Basic directional lighting
  vec3 lightDir = normalize(vec3(0.2, 1.0, -0.5));
  float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.3 + 0.7;
  asphalt *= diffuse;

  gl_FragColor = vec4(asphalt, 1.0);
}
`;

/** Sandy desert ground fragment shader */
export const desertGroundFrag = /* glsl */ `
precision highp float;

varying vec2 vUv;
varying vec3 vWorldPos;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float n = hash(floor(vWorldPos.xz * 2.0)) * 0.15;
  vec3 sand = vec3(0.55, 0.42, 0.28) * (0.6 + n);
  gl_FragColor = vec4(sand, 1.0);
}
`;

/** Mesa/butte sandstone fragment shader */
export const mesaFrag = /* glsl */ `
precision highp float;

varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
  // Layered sandstone bands
  float bands = sin(vWorldPos.y * 3.0) * 0.5 + 0.5;
  vec3 redRock = mix(
    vec3(0.45, 0.2, 0.08),  // dark sandstone
    vec3(0.65, 0.3, 0.1),   // bright sandstone
    bands
  );

  // Simple lighting
  vec3 lightDir = normalize(vec3(0.3, 1.0, -0.3));
  float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.4 + 0.6;
  redRock *= diffuse;

  gl_FragColor = vec4(redRock, 1.0);
}
`;
