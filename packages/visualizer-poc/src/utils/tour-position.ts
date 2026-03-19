/**
 * Tour Position — night-in-run and days-off visual modifiers.
 *
 * Produces small additive/multiplicative tweaks that compose with the
 * existing ShowArcModifiers system. All values are deliberately ~10-20%
 * of show-arc magnitudes so the effect is barely perceptible.
 *
 * Night-in-run arc: opener feels cool/fresh/tight → closing night warm/deep/spacious.
 * Days-off arc: fresh legs after time off → brighter, tighter, denser.
 */

import { clamp, lerp } from "./math";
import type { ShowArcModifiers } from "../data/show-arc";
import type { OverlayCategory } from "../data/types";

// ─── Types ───

export interface TourPositionInput {
  /** 1-based night in consecutive run */
  nightInRun?: number;
  /** Total nights in this run */
  totalNights?: number;
  /** Days since last show (0 = consecutive) */
  daysOff?: number;
}

export interface TourPositionModifiers {
  warmthShift: number;
  brightnessOffset: number;
  saturationOffset: number;
  densityMult: number;
  windowDurationMult: number;
  abstractionOffset: number;
  overlayBias: Partial<Record<OverlayCategory, number>>;
}

// ─── Neutral identity ───

const NEUTRAL: TourPositionModifiers = {
  warmthShift: 0,
  brightnessOffset: 0,
  saturationOffset: 0,
  densityMult: 1,
  windowDurationMult: 1,
  abstractionOffset: 0,
  overlayBias: {},
};

// ─── Computation ───

export function computeTourModifiers(input: TourPositionInput): TourPositionModifiers {
  const { nightInRun, totalNights, daysOff } = input;

  let warmth = 0;
  let brightness = 0;
  let saturation = 0;
  let density = 1;
  let windowDuration = 1;
  let abstraction = 0;
  const bias: Partial<Record<OverlayCategory, number>> = {};

  // ─── Night-in-run arc ───
  if (nightInRun != null && totalNights != null && totalNights > 1) {
    const runProgress = clamp((nightInRun - 1) / (totalNights - 1), 0, 1);

    // Opener: -2° cool → Final: +4° warm
    warmth += lerp(-2, 4, runProgress);
    // Opener: +0.01 bright → Final: -0.02 deeper
    brightness += lerp(0.01, -0.02, runProgress);
    // Opener: -0.01 → Final: +0.02 richer
    saturation += lerp(-0.01, 0.02, runProgress);
    // Opener: 0.95× tighter → Final: 1.08× slower/breathe
    windowDuration *= lerp(0.95, 1.08, runProgress);
    // Opener: 1.02× eager → Final: 0.95× spacious
    density *= lerp(1.02, 0.95, runProgress);
    // Opener: +0 → Final: +0.05
    abstraction += lerp(0, 0.05, runProgress);

    // Later nights: sacred/nature bias up, character down
    if (runProgress > 0.3) {
      const lateProgress = clamp((runProgress - 0.3) / 0.7, 0, 1);
      bias.sacred = (bias.sacred ?? 0) + lerp(0, 0.05, lateProgress);
      bias.nature = (bias.nature ?? 0) + lerp(0, 0.03, lateProgress);
      bias.character = (bias.character ?? 0) + lerp(0, -0.03, lateProgress);
    }
  }

  // ─── Days-off arc ───
  if (daysOff != null && daysOff > 0) {
    // freshness: 0 at 1 day off, 1.0 at 7+ days
    const freshness = clamp((daysOff - 1) / 6, 0, 1);

    brightness += lerp(0, 0.02, freshness);
    warmth += lerp(0, -3, freshness);
    windowDuration *= lerp(1, 0.93, freshness);
    density *= lerp(1, 1.05, freshness);
    saturation += lerp(0, 0.01, freshness);

    if (freshness > 0.3) {
      const freshBias = clamp((freshness - 0.3) / 0.7, 0, 1);
      bias.reactive = (bias.reactive ?? 0) + lerp(0, 0.04, freshBias);
    }
  }

  return {
    warmthShift: clamp(warmth, -5, 6),
    brightnessOffset: clamp(brightness, -0.05, 0.05),
    saturationOffset: clamp(saturation, -0.03, 0.03),
    densityMult: clamp(density, 0.90, 1.10),
    windowDurationMult: clamp(windowDuration, 0.90, 1.10),
    abstractionOffset: clamp(abstraction, 0, 0.08),
    overlayBias: bias,
  };
}

// ─── Composition ───

/**
 * Compose tour modifiers into existing show arc modifiers.
 * Additive for offsets, multiplicative for multipliers, merged for overlay bias.
 */
export function applyTourModifiers(
  base: ShowArcModifiers,
  tour: TourPositionModifiers,
): ShowArcModifiers {
  // Merge overlay biases: additive
  const mergedBias = { ...base.overlayBias };
  for (const [cat, value] of Object.entries(tour.overlayBias)) {
    const key = cat as OverlayCategory;
    mergedBias[key] = (mergedBias[key] ?? 0) + (value ?? 0);
  }

  return {
    overlayBias: mergedBias,
    densityMult: base.densityMult * tour.densityMult,
    windowDurationMult: base.windowDurationMult * tour.windowDurationMult,
    saturationOffset: base.saturationOffset + tour.saturationOffset,
    brightnessOffset: base.brightnessOffset + tour.brightnessOffset,
    hueShift: base.hueShift + tour.warmthShift,
    abstractionLevel: clamp(base.abstractionLevel + tour.abstractionOffset, 0, 1),
  };
}
