/**
 * Era Presets — per-era visual tuning for the Grateful Dead's distinct periods.
 *
 * Each era has its own visual character:
 *   - primal (1965-1970):  16mm warmth, liquid projections, vintage film
 *   - classic (1970-1975): golden-era warmth, tie-dye, oil projectors
 *   - hiatus (1975-1976):  cool restraint, concert lighting, cosmic depth
 *   - touch_of_grey (1977-1990): stadium punch, bright lights, inferno
 *   - revival (1990-1995): neutral modern, all modes welcome
 *
 * Presets control:
 *   - preferredModes: 3x weight in mode pool
 *   - excludedModes: filtered out of pool
 *   - excludedOverlays: filtered from overlay rotation
 *   - grainIntensity: multiplier on film grain opacity
 *   - colorTempShift: hue-rotate degrees (+warm, -cool)
 *   - saturationOffset: additive saturation adjustment
 */

import type { VisualMode } from "./types";

export interface EraPreset {
  preferredModes: VisualMode[];
  excludedModes: VisualMode[];
  excludedOverlays: string[];
  grainIntensity: number;
  colorTempShift: number;
  saturationOffset: number;
}

export const ERA_PRESETS: Record<string, EraPreset> = {
  primal: {
    preferredModes: ["liquid_light", "oil_projector", "vintage_film"],
    excludedModes: ["concert_lighting", "crystal_cavern"],
    excludedOverlays: ["LaserShow"],
    grainIntensity: 1.8,
    colorTempShift: 8,
    saturationOffset: -0.05,
  },
  classic: {
    preferredModes: ["liquid_light", "tie_dye", "aurora", "oil_projector"],
    excludedModes: ["stark_minimal"],
    excludedOverlays: [],
    grainIntensity: 1.2,
    colorTempShift: 5,
    saturationOffset: 0,
  },
  hiatus: {
    preferredModes: ["concert_lighting", "cosmic_voyage", "deep_ocean"],
    excludedModes: ["oil_projector"],
    excludedOverlays: [],
    grainIntensity: 1.0,
    colorTempShift: -5,
    saturationOffset: -0.03,
  },
  touch_of_grey: {
    preferredModes: ["concert_lighting", "inferno", "tie_dye"],
    excludedModes: ["oil_projector"],
    excludedOverlays: [],
    grainIntensity: 0.6,
    colorTempShift: 0,
    saturationOffset: 0.05,
  },
  revival: {
    preferredModes: [],
    excludedModes: [],
    excludedOverlays: [],
    grainIntensity: 0.4,
    colorTempShift: 0,
    saturationOffset: 0,
  },
};

/** Get era preset for a given era string. Returns null for unknown eras. */
export function getEraPreset(era: string): EraPreset | null {
  return ERA_PRESETS[era] ?? null;
}
