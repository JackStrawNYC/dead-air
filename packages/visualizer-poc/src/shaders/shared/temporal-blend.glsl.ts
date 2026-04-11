/**
 * Temporal Blend post-process pass — inter-frame coherence via reprojection.
 *
 * Blends the current frame with the previous frame's output to reduce shimmer
 * on thin geometry (raymarched edges, fine detail) and smooth energy changes
 * that would otherwise feel "steppy" at 30fps.
 *
 * A luminance-based rejection mask prevents ghosting on fast motion or scene
 * changes: pixels with high frame-to-frame difference get less blending.
 * Energy modulates the blend so sharp transients (drum hits, climax peaks)
 * aren't softened.
 *
 * Pipeline slot: main shader -> [post-passes] -> temporal blend -> FXAA -> output
 * (Not yet wired in — FullscreenQuad integration is a separate step.)
 *
 * Uniforms:
 *   uInputTexture          — sampler2D, current frame
 *   uPrevFrame             — sampler2D, previous frame's final output
 *   uTemporalBlendStrength — float 0-1, master blend control (default ~0.15)
 *   uEnergy                — float 0-1, audio energy (higher = less blend)
 */

/** Passthrough vertex shader for temporal blend post-pass */
export const temporalBlendVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/** Temporal blend fragment shader — luminance-aware inter-frame mix */
export const temporalBlendFrag = /* glsl */ `
precision highp float;

uniform sampler2D uInputTexture;
uniform sampler2D uPrevFrame;
uniform float uTemporalBlendStrength;
uniform float uEnergy;

varying vec2 vUv;

void main() {
  vec3 current = texture2D(uInputTexture, vUv).rgb;
  vec3 previous = texture2D(uPrevFrame, vUv).rgb;

  // Luminance difference between current and previous pixel.
  // High difference means fast motion or scene change — blend less to avoid ghosting.
  float lumDiff = abs(dot(current - previous, vec3(0.299, 0.587, 0.114)));
  float rejection = 1.0 - smoothstep(0.05, 0.20, lumDiff);

  // Energy modulation: higher energy = less temporal blend to preserve sharp transients.
  // At energy=0 the full blend strength is used; at energy=1 it's halved.
  float energyDampen = 1.0 - uEnergy * 0.5;

  // Final blend factor: master strength * rejection mask * energy dampening
  float blendFactor = uTemporalBlendStrength * rejection * energyDampen;

  vec3 result = mix(current, previous, blendFactor);

  gl_FragColor = vec4(result, 1.0);
}
`;
