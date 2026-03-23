/**
 * Era Presets — per-era visual tuning delegated to BandConfig.
 *
 * Presets control:
 *   - preferredModes: 3x weight in mode pool
 *   - excludedModes: filtered out of pool
 *   - excludedOverlays: filtered from overlay rotation
 *   - grainIntensity: multiplier on film grain opacity
 *   - colorTempShift: hue-rotate degrees (+warm, -cool)
 *   - saturationOffset: additive saturation adjustment
 *
 * Era definitions live in BandConfig so adding a new band's eras
 * requires only a config object — no core engine changes.
 */

import type { VisualMode } from "./types";

export interface EraPreset {
  preferredModes: VisualMode[];
  excludedModes: VisualMode[];
  excludedOverlays: string[];
  grainIntensity: number;
  colorTempShift: number;
  saturationOffset: number;
  /** Era-level overlay density multiplier (0.5-1.5) */
  overlayDensityMult?: number;
  /** Warm/cool color temperature bounds [warm, cool] */
  colorTempRange?: [number, number];
  /** Maximum dual-shader composition blend (0-0.55) */
  maxDualBlend?: number;
  /** Era-appropriate transition styles */
  preferredTransitions?: string[];
}

import { BAND_CONFIG } from "./band-config";

/** Era presets sourced from active band configuration. */
export const ERA_PRESETS: Record<string, EraPreset> = BAND_CONFIG.eraPresets;

/** Get era preset for a given era string. Returns null for unknown eras. */
export function getEraPreset(era: string): EraPreset | null {
  return BAND_CONFIG.eraPresets[era] ?? null;
}
