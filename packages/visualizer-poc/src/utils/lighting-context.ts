/**
 * Shared Lighting Context -- computes a unified lighting state per frame
 * that all shaders can reference through shared GLSL uniforms.
 *
 * When crossfading between shaders via DualShaderQuad, each shader previously
 * computed its own lighting independently, causing discontinuous jumps in light
 * direction and color. This module provides a single source of truth.
 *
 * The lighting state is derived from:
 *   - Section type (verse/chorus/jam/space/solo/bridge/intro/outro)
 *   - Smoothed energy (from audio analysis)
 *   - Narrative temperature (from visual-narrator.ts)
 *
 * EMA smoothing (alpha ~0.03) ensures ~2-second transitions between states,
 * matching the crossfade duration of DualShaderQuad.
 */

export interface LightingState {
  /** Key light direction (normalized) */
  keyLightDir: [number, number, number];
  /** Key light color RGB (0-1) */
  keyLightColor: [number, number, number];
  /** Key light intensity (0-1) */
  keyLightIntensity: number;
  /** Ambient fill color RGB (0-1) */
  ambientColor: [number, number, number];
  /** Color temperature (-1 cool to +1 warm) */
  colorTemperature: number;
}

export const DEFAULT_LIGHTING: LightingState = {
  keyLightDir: [0.3, 0.8, 0.5],
  keyLightColor: [1.0, 0.95, 0.9],
  keyLightIntensity: 0.7,
  ambientColor: [0.08, 0.07, 0.09],
  colorTemperature: 0.0,
};

/** Section-specific lighting presets (target states before smoothing) */
const SECTION_LIGHTING: Record<string, LightingState> = {
  verse: {
    keyLightDir: [0.2, 0.6, 0.8],
    keyLightColor: [1.0, 0.93, 0.85],
    keyLightIntensity: 0.6,
    ambientColor: [0.10, 0.08, 0.06],
    colorTemperature: 0.3,
  },
  chorus: {
    keyLightDir: [0.0, 1.0, 0.3],
    keyLightColor: [1.0, 1.0, 1.0],
    keyLightIntensity: 0.9,
    ambientColor: [0.12, 0.11, 0.12],
    colorTemperature: 0.0,
  },
  jam: {
    keyLightDir: [0.7, 0.4, -0.3],
    keyLightColor: [0.85, 0.9, 1.0],
    keyLightIntensity: 0.7,
    ambientColor: [0.06, 0.07, 0.12],
    colorTemperature: -0.3,
  },
  space: {
    keyLightDir: [0.0, 1.0, 0.0],
    keyLightColor: [0.8, 0.75, 0.9],
    keyLightIntensity: 0.3,
    ambientColor: [0.05, 0.03, 0.08],
    colorTemperature: -0.5,
  },
  solo: {
    keyLightDir: [0.1, 0.9, 0.2],
    keyLightColor: [1.0, 0.92, 0.75],
    keyLightIntensity: 0.85,
    ambientColor: [0.09, 0.07, 0.05],
    colorTemperature: 0.4,
  },
  bridge: {
    keyLightDir: [0.3, 0.7, 0.5],
    keyLightColor: [0.95, 0.93, 0.95],
    keyLightIntensity: 0.55,
    ambientColor: [0.08, 0.08, 0.09],
    colorTemperature: 0.0,
  },
  intro: {
    keyLightDir: [0.2, 0.5, 0.7],
    keyLightColor: [0.9, 0.88, 0.85],
    keyLightIntensity: 0.45,
    ambientColor: [0.06, 0.05, 0.07],
    colorTemperature: 0.1,
  },
  outro: {
    keyLightDir: [0.1, 0.7, 0.4],
    keyLightColor: [0.9, 0.85, 0.8],
    keyLightIntensity: 0.4,
    ambientColor: [0.06, 0.05, 0.06],
    colorTemperature: 0.15,
  },
};

export interface LightingInput {
  /** Current section type string (verse/chorus/jam/space/solo/bridge/intro/outro) */
  sectionType?: string;
  /** Smoothed energy (0-1) */
  energy: number;
  /** Narrative temperature (-1 cool to +1 warm) from visual-narrator */
  temperature: number;
}

/** Normalize a 3-component vector in place (returns same array) */
function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 1e-6) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Clamp a value to [min, max] */
function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

/**
 * Compute the target lighting state for the current frame (before smoothing).
 *
 * Pure function: no side effects, no mutation.
 */
export function computeTargetLighting(input: LightingInput): LightingState {
  const sectionKey = (input.sectionType ?? "").toLowerCase();
  const base = SECTION_LIGHTING[sectionKey] ?? DEFAULT_LIGHTING;

  // Energy modulation: brighter light at higher energy, expand ambient
  const energyBoost = input.energy * 0.15;
  const intensity = clamp(base.keyLightIntensity + energyBoost, 0, 1);

  // Ambient gets slightly brighter with energy (prevents crushing blacks)
  const ambientBoost = input.energy * 0.04;
  const ambientColor: [number, number, number] = [
    clamp(base.ambientColor[0] + ambientBoost, 0, 1),
    clamp(base.ambientColor[1] + ambientBoost, 0, 1),
    clamp(base.ambientColor[2] + ambientBoost, 0, 1),
  ];

  // Blend narrative temperature with section temperature
  // Narrative has 40% influence, section has 60% influence
  const temperature = clamp(
    base.colorTemperature * 0.6 + input.temperature * 0.4,
    -1,
    1,
  );

  return {
    keyLightDir: normalize3([...base.keyLightDir]),
    keyLightColor: [base.keyLightColor[0], base.keyLightColor[1], base.keyLightColor[2]],
    keyLightIntensity: intensity,
    ambientColor,
    colorTemperature: temperature,
  };
}

/** EMA smoothing alpha (~0.03 at 30fps gives ~2-second time constant) */
const EMA_ALPHA = 0.03;

/** Lerp a single number */
function lerpScalar(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

/** Lerp a 3-component tuple */
function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    lerpScalar(a[0], b[0], alpha),
    lerpScalar(a[1], b[1], alpha),
    lerpScalar(a[2], b[2], alpha),
  ];
}

/**
 * Apply EMA smoothing to transition from previous state to target.
 *
 * Pure function: returns a new LightingState.
 *
 * @param prev  Previous smoothed state
 * @param target  Target state for this frame
 * @param alpha  EMA smoothing factor (0-1), defaults to EMA_ALPHA (~0.03)
 */
export function smoothLighting(
  prev: LightingState,
  target: LightingState,
  alpha: number = EMA_ALPHA,
): LightingState {
  const a = clamp(alpha, 0, 1);
  return {
    keyLightDir: normalize3(lerp3(prev.keyLightDir, target.keyLightDir, a)),
    keyLightColor: lerp3(prev.keyLightColor, target.keyLightColor, a),
    keyLightIntensity: lerpScalar(prev.keyLightIntensity, target.keyLightIntensity, a),
    ambientColor: lerp3(prev.ambientColor, target.ambientColor, a),
    colorTemperature: lerpScalar(prev.colorTemperature, target.colorTemperature, a),
  };
}

/**
 * Compute the smoothed lighting state for the current frame.
 *
 * Combines target computation + EMA smoothing in one call.
 * Stateless: caller must pass the previous smoothed state.
 *
 * @param prev  Previous smoothed lighting state (or DEFAULT_LIGHTING for first frame)
 * @param input  Current frame's audio/section/narrative inputs
 * @param alpha  EMA smoothing factor (default ~0.03 = ~2s transition at 30fps)
 */
export function computeLightingState(
  prev: LightingState,
  input: LightingInput,
  alpha: number = EMA_ALPHA,
): LightingState {
  const target = computeTargetLighting(input);
  return smoothLighting(prev, target, alpha);
}
