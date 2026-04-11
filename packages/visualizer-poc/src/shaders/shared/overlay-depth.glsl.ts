/**
 * Overlay Depth Shader — renders an overlay texture as a WebGL quad
 * with configurable depth positioning and atmospheric fog blending.
 *
 * Used by WebGLOverlayQuad.tsx to composite overlays into the 3D scene
 * with depth-dependent atmospheric haze, replacing flat CSS stacking.
 *
 * Vertex: positions quad at uDepth along Z axis.
 * Fragment: samples overlay texture, applies opacity + atmospheric fog.
 */

export const overlayDepthVert = /* glsl */ `
uniform float uDepth;

varying vec2 vUv;

void main() {
  vUv = uv;
  // Position the quad at the specified depth (0 = near camera, 1 = far)
  // Map depth [0,1] to Z range [-0.1, -0.9] (camera looks down -Z)
  vec3 pos = position;
  pos.z = mix(-0.1, -0.9, uDepth);
  gl_Position = vec4(pos.xy, pos.z, 1.0);
}
`;

export const overlayDepthFrag = /* glsl */ `
precision highp float;

uniform sampler2D uOverlayTexture;
uniform float uOpacity;
uniform float uDepth;
uniform float uAtmosphericBlend;
uniform vec3 uFogColor;

varying vec2 vUv;

void main() {
  vec4 texColor = texture2D(uOverlayTexture, vUv);

  // Pre-multiplied alpha with overlay engine opacity
  float alpha = texColor.a * uOpacity;

  // Atmospheric depth fog — farther overlays blend toward the scene fog color,
  // creating the illusion of depth between layers rather than flat stacking.
  vec3 foggedColor = mix(texColor.rgb, uFogColor, uAtmosphericBlend * uDepth);

  gl_FragColor = vec4(foggedColor, alpha);
}
`;
