/**
 * Per-song shader parameter profiles.
 *
 * Every shader has hardcoded audio-reactivity coefficients (e.g. `uBass * 0.15`).
 * These profiles let songs modulate those coefficients so that, for example, a
 * gentle ballad can halve bass reactivity while a heavy jam cranks it up.
 *
 * The 7 parameters are passed as GLSL uniforms (uParamBassScale, etc.) and
 * default to identity values (1.0 for scales, 0.0 for biases). Existing shaders
 * are unaffected until they opt in to reading these uniforms.
 */

export interface ShaderParameterProfile {
  /** Multiplier on bass reactivity (default 1.0). 0.5 = gentle, 1.5 = punchy */
  bassScale?: number;
  /** Multiplier on energy reactivity (default 1.0) */
  energyScale?: number;
  /** Multiplier on time/dynamicTime derivatives (default 1.0). 0.6 = slow, 1.4 = fast */
  motionSpeed?: number;
  /** Additive saturation shift (default 0.0). -0.1 = desaturated, +0.1 = vivid */
  colorSaturationBias?: number;
  /** Raymarching complexity bias (default 0.0). -0.3 = simpler, +0.3 = more detail */
  complexityBias?: number;
  /** Drum onset impulse scale (default 1.0) */
  drumReactivity?: number;
  /** How much vocal presence affects the visual (default 1.0) */
  vocalWeight?: number;
}

export const DEFAULT_SHADER_PARAMS: ShaderParameterProfile = {
  bassScale: 1.0,
  energyScale: 1.0,
  motionSpeed: 1.0,
  colorSaturationBias: 0.0,
  complexityBias: 0.0,
  drumReactivity: 1.0,
  vocalWeight: 1.0,
};
