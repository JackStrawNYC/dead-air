/**
 * ResolutionManager — configurable render resolution for performance.
 * Half-res (0.5) = 4x fewer fragment invocations, CSS-scaled to fullscreen.
 */

export type ResolutionPreset = "full" | "high" | "half" | "quarter";

export const RESOLUTION_PRESETS: Record<ResolutionPreset, number> = {
  full: 1.0,
  high: 0.75,
  half: 0.5,
  quarter: 0.25,
};

/** Get DPR-capped resolution multiplier for projector/performance use */
export function getEffectiveDPR(preset: ResolutionPreset): number {
  const base = RESOLUTION_PRESETS[preset];
  return Math.min(window.devicePixelRatio * base, 1.5);
}

/** Get render dimensions for a given viewport and resolution */
export function getRenderSize(
  viewportWidth: number,
  viewportHeight: number,
  preset: ResolutionPreset,
): { width: number; height: number } {
  const scale = RESOLUTION_PRESETS[preset];
  return {
    width: Math.round(viewportWidth * scale),
    height: Math.round(viewportHeight * scale),
  };
}
