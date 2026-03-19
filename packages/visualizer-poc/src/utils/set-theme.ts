/**
 * Set-Level Theming — per-set visual adjustments for narrative arc.
 *
 * A typical Grateful Dead show has three acts:
 *   Set 1:  Uptempo rock, warm & punchy — crowd getting warmed up
 *   Set 2:  Deep exploration, cool & ethereal — Dark Star, Drums/Space territory
 *   Encore: Intimate wind-down, subdued & reflective
 *
 * These modifiers compose into the ShowArcModifiers pipeline via
 * applySetModifiers(), alongside tour-position modifiers.
 */

import { clamp } from "./math";
import type { ShowArcModifiers } from "../data/show-arc";
import type { OverlayCategory } from "../data/types";

export interface SetTheme {
  /** Hue-rotate offset in degrees (positive = warm, negative = cool) */
  warmthShift: number;
  /** Additive brightness offset (positive = brighter) */
  brightnessOffset: number;
  /** Additive saturation offset */
  saturationOffset: number;
  /** Overlay density multiplier */
  densityMult: number;
  /** Rotation window duration multiplier (< 1 = faster, > 1 = slower) */
  windowDurationMult: number;
  /** Abstraction level offset */
  abstractionOffset: number;
  /** Per-category overlay score bias */
  overlayBias: Partial<Record<OverlayCategory, number>>;
}

const SET_THEMES: Record<number, SetTheme> = {
  // Set 1: warm, punchy — high-energy rock, crowd engagement
  1: {
    warmthShift: 5,
    brightnessOffset: 0.03,
    saturationOffset: 0.02,
    densityMult: 1.05,
    windowDurationMult: 0.95,
    abstractionOffset: 0,
    overlayBias: { character: +0.08, atmospheric: +0.05, sacred: -0.03 },
  },
  // Set 2: cool, ethereal — exploratory jams, psychedelic depths
  2: {
    warmthShift: -8,
    brightnessOffset: -0.05,
    saturationOffset: -0.03,
    densityMult: 0.90,
    windowDurationMult: 1.15,
    abstractionOffset: 0.10,
    overlayBias: { sacred: +0.10, geometric: +0.08, nature: +0.06, character: -0.10 },
  },
  // Encore (set 3): subdued, intimate — final statement
  3: {
    warmthShift: 3,
    brightnessOffset: -0.04,
    saturationOffset: -0.01,
    densityMult: 0.85,
    windowDurationMult: 0.90,
    abstractionOffset: 0,
    overlayBias: { character: +0.10, atmospheric: +0.08, sacred: +0.03, reactive: -0.05 },
  },
};

/** Neutral theme — no adjustment. Used as fallback. */
const NEUTRAL: SetTheme = {
  warmthShift: 0,
  brightnessOffset: 0,
  saturationOffset: 0,
  densityMult: 1,
  windowDurationMult: 1,
  abstractionOffset: 0,
  overlayBias: {},
};

/**
 * Return visual theme adjustments for a given set number.
 * Falls back to neutral if the set number is unknown.
 */
export function getSetTheme(setNumber: number): SetTheme {
  return SET_THEMES[setNumber] ?? NEUTRAL;
}

/**
 * Compose set modifiers into existing show arc modifiers.
 * Additive for offsets, multiplicative for multipliers, merged for overlay bias.
 */
export function applySetModifiers(
  base: ShowArcModifiers,
  set: SetTheme,
): ShowArcModifiers {
  // Merge overlay biases: additive
  const mergedBias = { ...base.overlayBias };
  for (const [cat, value] of Object.entries(set.overlayBias)) {
    const key = cat as OverlayCategory;
    mergedBias[key] = (mergedBias[key] ?? 0) + (value ?? 0);
  }

  return {
    overlayBias: mergedBias,
    densityMult: base.densityMult * set.densityMult,
    windowDurationMult: base.windowDurationMult * set.windowDurationMult,
    saturationOffset: base.saturationOffset + set.saturationOffset,
    brightnessOffset: base.brightnessOffset + set.brightnessOffset,
    hueShift: base.hueShift + set.warmthShift,
    abstractionLevel: clamp(base.abstractionLevel + set.abstractionOffset, 0, 1),
  };
}
