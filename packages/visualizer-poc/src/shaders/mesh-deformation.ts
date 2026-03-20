/**
 * Mesh Deformation Grid — audio-reactive vertex-displaced plane overlay.
 *
 * A 48×48 grid plane where vertices are displaced by audio features:
 * - Bass → horizontal sine wave displacement
 * - Treble/highs → vertical ripple
 * - Energy → overall amplitude scaling
 * - Beat snap → z-pulse depth punch
 * - Section type modulation: jam=faster oscillation, space=slow drift
 *
 * Fragment shader renders a palette-tinted luminosity wash based on
 * displacement magnitude. Very low alpha (0.08-0.15 × energy) —
 * this is a texture layer, not primary visual.
 */

import { sharedUniformsGLSL } from "./shared/uniforms.glsl";

export const meshDeformationVert = /* glsl */ `
${sharedUniformsGLSL}

varying vec2 vUv;
varying float vDisplacement;

#define PI 3.14159265

void main() {
  vUv = uv;

  vec3 pos = position;

  // Section type speed modulation: jam(5)=fast, space(7)=slow drift
  float speedMult = 1.0;
  if (uSectionType > 4.5 && uSectionType < 5.5) speedMult = 1.8; // jam
  else if (uSectionType > 6.5 && uSectionType < 7.5) speedMult = 0.4; // space

  float t = uDynamicTime * speedMult;

  // Bass → horizontal sine wave displacement
  float bassWave = sin(pos.y * 4.0 + t * 2.5) * uBass * 0.15;

  // Treble/highs → vertical ripple
  float trebleRipple = sin(pos.x * 6.0 + t * 3.2) * uHighs * 0.10;

  // Combined displacement with energy scaling
  float disp = (bassWave + trebleRipple) * (0.3 + uEnergy * 0.7);

  // Beat snap → z-pulse depth punch
  float beatPunch = uBeatSnap * 0.08;

  pos.x += bassWave * (0.3 + uEnergy * 0.7);
  pos.y += trebleRipple * (0.3 + uEnergy * 0.7);
  pos.z += disp * 0.5 + beatPunch;

  vDisplacement = abs(disp) + beatPunch;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const meshDeformationFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

varying vec2 vUv;
varying float vDisplacement;

#define PI 3.14159265

// Simple HSV to RGB
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  // Palette-tinted luminosity based on displacement magnitude
  float hue = uPalettePrimary + vDisplacement * 0.15;
  float sat = 0.4 + uPaletteSaturation * 0.3;
  float val = 0.6 + vDisplacement * 2.0;

  vec3 color = hsv2rgb(vec3(hue, sat, val));

  // Very low alpha — subtle texture layer, not primary visual
  float alpha = (0.08 + vDisplacement * 0.5) * (0.15 + uEnergy * 0.85);
  alpha = clamp(alpha, 0.0, 0.20);

  gl_FragColor = vec4(color, alpha);
}
`;
