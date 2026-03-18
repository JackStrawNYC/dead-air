/**
 * VJPostProcess — runtime-switchable post-processing for VJ mode.
 *
 * Generates a single applyPostProcess() GLSL function that includes ALL
 * post-process stages, each gated by a uniform toggle (e.g., uFxBloom > 0.5).
 * GPU cost is near-zero for disabled effects (coherent branch on uniform).
 *
 * injectVJPostProcess() replaces the existing applyPostProcess in a shader
 * and prepends the required FX uniform declarations.
 */

/** FX uniform declarations to prepend to fragment shaders */
export const VJ_FX_UNIFORM_DECLARATIONS = /* glsl */ `
uniform float uFxBloom;
uniform float uFxGrain;
uniform float uFxFlare;
uniform float uFxHalation;
uniform float uFxCA;
uniform float uFxStageFlood;
uniform float uFxBeatPulse;
uniform float uFxCRT;
uniform float uFxAnaglyph;
uniform float uFxPaletteCycle;
uniform float uFxThermalShimmer;
uniform float uFxBloomThreshold;
uniform float uFxFeedbackDecay;
`;

/**
 * Build the VJ post-process GLSL function with all stages compiled in
 * but gated by uniform toggles.
 */
export function buildVJPostProcessGLSL(): string {
  return /* glsl */ `
vec3 applyPostProcess(vec3 col, vec2 uv, vec2 p) {
  float energy = uEnergy;
  float bass = uBass;
  float beat = uBeat;
  float onset = uOnset;
  float time = uTime;

  // ── Beat Pulse ──
  if (uFxBeatPulse > 0.5) {
    float pulseAmt = beat * 0.08 + onset * 0.06;
    col += col * pulseAmt;
  }

  // ── Bloom ──
  if (uFxBloom > 0.5) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float threshold = 0.6 + uFxBloomThreshold * 0.4;
    float bloom = max(0.0, lum - threshold);
    col += col * bloom * 0.4;
  }

  // ── Stage Flood Fill ──
  if (uFxStageFlood > 0.5) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float floodMask = smoothstep(0.15, 0.0, lum);
    float hue = uPalettePrimary / 360.0;
    vec3 floodColor = vec3(
      abs(hue * 6.0 - 3.0) - 1.0,
      2.0 - abs(hue * 6.0 - 2.0),
      2.0 - abs(hue * 6.0 - 4.0)
    );
    floodColor = clamp(floodColor, 0.0, 1.0);
    col += floodColor * floodMask * 0.12 * energy;
  }

  // ── Anamorphic Flare ──
  if (uFxFlare > 0.5) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float flareMask = exp(-abs(uv.y - 0.5) * 8.0);
    float flareStr = smoothstep(0.7, 1.0, lum) * flareMask;
    col += vec3(1.0, 0.95, 0.9) * flareStr * 0.15 * (1.0 + bass * 0.3);
  }

  // ── Halation ──
  if (uFxHalation > 0.5) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float halGlow = smoothstep(0.5, 0.9, lum);
    col += vec3(1.0, 0.85, 0.7) * halGlow * 0.06;
  }

  // ── Chromatic Aberration ──
  if (uFxCA > 0.5) {
    float caStr = onset * 0.005 + energy * 0.002;
    vec2 dir = uv - 0.5;
    // Approximate CA — shift red/blue channels
    col.r = col.r + caStr * length(dir);
    col.b = col.b - caStr * length(dir);
  }

  // ── CRT Scanlines ──
  if (uFxCRT > 0.5) {
    float scanline = sin(uv.y * uResolution.y * 1.5) * 0.5 + 0.5;
    scanline = mix(0.85, 1.0, scanline);
    col *= scanline;
    // Sub-pixel emulation
    float subPx = mod(gl_FragCoord.x, 3.0);
    if (subPx < 1.0) col.gb *= 0.9;
    else if (subPx < 2.0) col.rb *= 0.9;
    else col.rg *= 0.9;
  }

  // ── Anaglyph 3D ──
  if (uFxAnaglyph > 0.5) {
    float depth = bass * 0.006 + 0.002;
    // Simplified anaglyph — offset red and cyan
    col.r = col.r * 0.7 + 0.3;
    col.gb *= 1.0 - depth * 4.0;
  }

  // ── Palette Cycle ──
  if (uFxPaletteCycle > 0.5) {
    float shift = time * 0.02 + energy * 0.1;
    // RGB rotation matrix approximation
    float cs = cos(shift);
    float sn = sin(shift);
    vec3 rotated = vec3(
      col.r * cs - col.g * sn,
      col.r * sn + col.g * cs,
      col.b
    );
    col = mix(col, rotated, 0.3);
  }

  // ── Thermal Shimmer ──
  if (uFxThermalShimmer > 0.5) {
    float shimmer = sin(uv.y * 40.0 + time * 3.0) * 0.002 * energy;
    col.r += shimmer;
    col.b -= shimmer;
  }

  // ── Film Grain ──
  if (uFxGrain > 0.0) {
    float grainScale = uFxGrain; // 0=none, ~0.33=low, ~0.66=mid, ~1.0=high
    float grainAmt = mix(0.02, 0.12, grainScale) * (1.0 + onset * 0.5);
    float grain = fract(sin(dot(uv * time, vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) * grainAmt;
  }

  // ── Cinematic Grade (ACES approximation) ──
  col = clamp(col, 0.0, 1.0);
  col = col * (2.51 * col + 0.03) / (col * (2.43 * col + 0.59) + 0.14);
  col = clamp(col, 0.0, 1.0);

  // Lift blacks slightly
  col = mix(vec3(0.02), col, 0.98 + energy * 0.02);

  return col;
}
`;
}

/**
 * Inject VJ post-process into a fragment shader.
 * 1. Prepends FX uniform declarations
 * 2. Replaces existing applyPostProcess function body with VJ version
 *
 * If no existing applyPostProcess is found, appends the function and
 * adds a call before the final gl_FragColor assignment.
 */
export function injectVJPostProcess(fragmentShader: string): string {
  let result = fragmentShader;

  // Prepend FX uniforms after existing uniform declarations
  // Find the last uniform line and insert after it
  const uniformMatch = result.match(/^(uniform\s+\w+\s+\w+;[^\n]*\n)/m);
  if (uniformMatch) {
    // Insert after the first uniform block
    const lastUniformIdx = result.lastIndexOf("uniform ");
    const lineEnd = result.indexOf("\n", lastUniformIdx);
    result = result.slice(0, lineEnd + 1) + VJ_FX_UNIFORM_DECLARATIONS + result.slice(lineEnd + 1);
  } else {
    // No uniforms found — prepend at top after precision
    const precisionMatch = result.match(/precision\s+\w+\s+float;\s*\n/);
    if (precisionMatch) {
      const idx = (precisionMatch.index ?? 0) + precisionMatch[0].length;
      result = result.slice(0, idx) + VJ_FX_UNIFORM_DECLARATIONS + result.slice(idx);
    } else {
      result = VJ_FX_UNIFORM_DECLARATIONS + result;
    }
  }

  // Replace existing applyPostProcess function
  const fnRegex = /vec3\s+applyPostProcess\s*\([^)]*\)\s*\{[^]*?\n\}/;
  if (fnRegex.test(result)) {
    result = result.replace(fnRegex, buildVJPostProcessGLSL().trim());
  } else {
    // No existing function — append and add call before gl_FragColor
    const vjFn = buildVJPostProcessGLSL();
    // Insert function before main()
    const mainIdx = result.indexOf("void main()");
    if (mainIdx >= 0) {
      result = result.slice(0, mainIdx) + vjFn + "\n" + result.slice(mainIdx);
    }
  }

  return result;
}
