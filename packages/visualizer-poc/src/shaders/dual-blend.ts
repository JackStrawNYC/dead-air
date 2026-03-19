/**
 * Dual-blend compositing shader — blends two scene render targets.
 * 5 blend modes: luminance_key, noise_dissolve, additive, multiplicative, depth_aware.
 *
 * Uniforms:
 *   uSceneA       — render target texture from shader A
 *   uSceneB       — render target texture from shader B
 *   uBlendMode    — integer: 0=luminance_key, 1=noise_dissolve, 2=additive, 3=multiplicative, 4=depth_aware
 *   uBlendProgress — 0.0 = all A, 1.0 = all B
 *   uTime         — for noise animation
 *   uResolution   — viewport dimensions
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";

export const dualBlendVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const dualBlendFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

uniform sampler2D uSceneA;
uniform sampler2D uSceneB;
uniform int uBlendMode;
uniform float uBlendProgress;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec3 a = texture2D(uSceneA, uv).rgb;
  vec3 b = texture2D(uSceneB, uv).rgb;
  float progress = clamp(uBlendProgress, 0.0, 1.0);

  vec3 result;

  if (uBlendMode == 0) {
    // Luminance key: bright areas of B show through A
    float lumB = dot(b, vec3(0.299, 0.587, 0.114));
    float mask = smoothstep(0.3, 0.7, lumB) * progress;
    result = mix(a, b, mask);
  } else if (uBlendMode == 1) {
    // Noise dissolve: organic FBM-masked dissolve
    float noise = fbm3(vec3(uv * 4.0, uTime * 0.1));
    float threshold = progress;
    float mask = smoothstep(threshold - 0.1, threshold + 0.1, noise);
    result = mix(a, b, mask);
  } else if (uBlendMode == 2) {
    // Additive: both contribute light
    result = a + b * progress;
    result = min(result, vec3(1.5)); // prevent blowout, allow slight HDR
  } else if (uBlendMode == 3) {
    // Multiplicative: both contribute shadow
    result = mix(a, a * b, progress);
  } else {
    // Depth aware (mode 4): brightness-as-depth proxy, closer wins
    float lumA = dot(a, vec3(0.299, 0.587, 0.114));
    float lumB = dot(b, vec3(0.299, 0.587, 0.114));
    float depthMask = smoothstep(-0.1, 0.1, lumB - lumA) * progress;
    result = mix(a, b, depthMask);
  }

  gl_FragColor = vec4(result, 1.0);
}
`;
