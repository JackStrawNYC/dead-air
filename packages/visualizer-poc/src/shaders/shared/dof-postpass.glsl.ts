/**
 * Depth-of-Field post-process pass — circle-of-confusion disc blur.
 *
 * Reads depth from the alpha channel (written by raymarched shaders via
 * buildDepthAlphaOutput) and applies a variable-radius disc blur based
 * on distance from the camera's focus plane.
 *
 * Pipeline slot: main shader -> DOF -> FXAA -> output
 * (Not yet wired in — FullscreenQuad integration is a separate step.)
 *
 * Uniforms (from shared set):
 *   uCamDof        — blur strength 0-1
 *   uCamFocusDist  — focus distance in world units
 *   uResolution    — viewport size for texel offsets
 *
 * Additional uniforms (set by the render pipeline):
 *   uInputTexture  — sampler2D, previous render target
 *   uMaxDist       — float, maximum scene depth for normalization
 */

/** Passthrough vertex shader for DOF post-pass */
export const dofVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/** Depth-of-field fragment shader — disc-sampled circle of confusion */
export const dofFrag = /* glsl */ `
precision highp float;

uniform sampler2D uInputTexture;
uniform vec2 uResolution;
uniform float uCamDof;
uniform float uCamFocusDist;
uniform float uMaxDist;

varying vec2 vUv;

// 8-tap Poisson disc — low-discrepancy sampling pattern that avoids
// the boxy artifacts of a regular grid while keeping the tap count
// GPU-friendly. Returned as a function because GLSL ES 1.0 (WebGL 1)
// does not support const array initializer lists.
vec2 discSample(int i) {
  if (i == 0) return vec2(-0.613392, 0.617481);
  if (i == 1) return vec2( 0.170019,-0.040254);
  if (i == 2) return vec2(-0.299417, 0.791925);
  if (i == 3) return vec2( 0.645680, 0.493210);
  if (i == 4) return vec2(-0.651784, 0.717887);
  if (i == 5) return vec2( 0.421003, 0.027070);
  if (i == 6) return vec2(-0.817194,-0.271096);
  return vec2( 0.977050,-0.108615);
}

// Maximum blur radius in pixels. Clamped so the disc never reaches
// across huge screen regions — keeps the blur physically plausible
// and prevents single-pixel depth edges from smearing the whole image.
#define DOF_BLUR_RADIUS 8.0

void main() {
  vec4 center = texture2D(uInputTexture, vUv);
  vec3 sharp = center.rgb;
  float depth = center.a;

  // Normalised focus distance
  float focusNorm = clamp(uCamFocusDist / uMaxDist, 0.0, 1.0);

  // Circle of confusion: how far this pixel's depth is from the focus plane,
  // scaled by the DOF strength uniform.
  float coc = abs(depth - focusNorm) * uCamDof * 20.0;
  coc = clamp(coc, 0.0, 1.0);

  // Early out: pixel is in focus (or DOF is disabled)
  if (coc < 0.01) {
    gl_FragColor = vec4(sharp, depth);
    return;
  }

  // Scatter-as-gather disc blur
  vec3 blurred = vec3(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < 8; i++) {
    vec2 offset = discSample(i) * coc * DOF_BLUR_RADIUS / uResolution;
    vec4 tap = texture2D(uInputTexture, vUv + offset);

    // Weight by the tap's own CoC so in-focus foreground objects don't
    // bleed into bokeh areas (scatter-as-gather approximation).
    float tapCoc = abs(tap.a - focusNorm) * uCamDof * 20.0;
    tapCoc = clamp(tapCoc, 0.0, 1.0);
    float w = 0.2 + tapCoc;

    blurred += tap.rgb * w;
    totalWeight += w;
  }
  blurred /= totalWeight;

  // Smooth blend from sharp to blurred — the smoothstep prevents a hard
  // boundary at the exact focus plane.
  vec3 col = mix(sharp, blurred, smoothstep(0.0, 0.15, coc));

  // Preserve alpha (depth) for potential further passes
  gl_FragColor = vec4(col, depth);
}
`;
