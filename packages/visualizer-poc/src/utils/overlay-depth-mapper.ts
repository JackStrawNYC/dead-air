/**
 * Overlay Depth Mapper — maps overlay layer numbers to WebGL depth configs.
 *
 * Each of the 10 overlay layers in Dead Air has a distinct visual role:
 * atmospheric backgrounds, sacred centerpieces, reactive flashes, etc.
 * This module assigns each layer a depth position and atmospheric fog amount
 * so that when overlays render as WebGL quads (instead of flat CSS divs),
 * they integrate into the 3D scene with natural depth separation.
 *
 * Layer assignments match overlay-registry.ts:
 *   1=Atmospheric, 2=Sacred/Center, 3=Reactive, 4=Geometric/Physics,
 *   5=Nature/Cosmic, 6=Character, 7=Frame/Info, 8=Typography,
 *   9=HUD, 10=Distortion
 */

export type OverlayBlendMode = "normal" | "screen" | "additive";

export interface OverlayDepthConfig {
  /** Z depth in the scene (0 = near camera, 1 = far back) */
  depth: number;
  /** Atmospheric fog blend amount (0 = no fog, 1 = fully fogged out) */
  atmosphericBlend: number;
  /** Recommended WebGL blend mode for compositing */
  blendMode: OverlayBlendMode;
}

/**
 * Per-layer depth configurations.
 *
 * Design rationale:
 * - Layer 1 (Atmospheric): deep in the scene, heavy fog — part of the sky/ambient
 * - Layer 2 (Sacred): mid-depth, slight haze — iconic imagery floats in the middle
 * - Layer 3 (Reactive): near camera, minimal fog — bright flashes punch through
 * - Layer 4 (Geometric): mid-far, moderate haze — pattern textures recede slightly
 * - Layer 5 (Nature): far-ish, noticeable fog — nature elements feel distant
 * - Layer 6 (Character): mid-near, light haze — characters are present but integrated
 * - Layer 7 (Info/Artifact): very near, zero fog — text must be readable
 * - Layer 8 (Typography): very near, zero fog — same as info
 * - Layer 9 (HUD): near, zero fog — data readouts always crisp
 * - Layer 10 (Distortion): on top of everything, no fog — screen-space effects
 */
const LAYER_CONFIGS: Record<number, OverlayDepthConfig> = {
  1:  { depth: 0.9, atmosphericBlend: 0.4, blendMode: "additive" },
  2:  { depth: 0.5, atmosphericBlend: 0.15, blendMode: "screen" },
  3:  { depth: 0.3, atmosphericBlend: 0.05, blendMode: "additive" },
  4:  { depth: 0.6, atmosphericBlend: 0.2, blendMode: "normal" },
  5:  { depth: 0.7, atmosphericBlend: 0.3, blendMode: "normal" },
  6:  { depth: 0.4, atmosphericBlend: 0.1, blendMode: "screen" },
  7:  { depth: 0.1, atmosphericBlend: 0.0, blendMode: "normal" },
  8:  { depth: 0.1, atmosphericBlend: 0.0, blendMode: "normal" },
  9:  { depth: 0.15, atmosphericBlend: 0.0, blendMode: "normal" },
  10: { depth: 0.0, atmosphericBlend: 0.0, blendMode: "normal" },
};

/** Default config for unknown layers — safe mid-depth values */
const DEFAULT_CONFIG: OverlayDepthConfig = {
  depth: 0.5,
  atmosphericBlend: 0.15,
  blendMode: "normal",
};

/**
 * Map an overlay layer number (1-10) to its WebGL depth configuration.
 *
 * Returns depth position, atmospheric fog amount, and recommended blend mode.
 * Unknown layer numbers fall back to safe mid-depth defaults.
 */
export function getOverlayDepthConfig(layer: number): OverlayDepthConfig {
  return LAYER_CONFIGS[layer] ?? DEFAULT_CONFIG;
}
