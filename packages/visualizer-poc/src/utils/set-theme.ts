/**
 * Set-Level Theming — per-set visual adjustments for narrative arc.
 *
 * A typical Grateful Dead show has three acts:
 *   Set 1:  Uptempo rock, warm & punchy — crowd getting warmed up
 *   Set 2:  Deep exploration, cool & ethereal — Dark Star, Drums/Space territory
 *   Encore: Intimate wind-down, subdued & reflective
 *
 * These are small additive/multiplicative offsets that compose with
 * EnergyEnvelope's existing modulation. They shift the overall color
 * temperature and energy feel without overriding per-song palettes
 * or per-section mode changes.
 */

export interface SetTheme {
  /** Multiplicative adjustment to saturation (1.0 = no change) */
  saturationMult: number;
  /** Hue-rotate offset in degrees (positive = warm, negative = cool) */
  warmthShift: number;
  /** Additive brightness offset (positive = brighter) */
  brightnessOffset: number;
}

const SET_THEMES: Record<number, SetTheme> = {
  // Set 1: warm, punchy — high-energy rock, crowd engagement
  1: { saturationMult: 1.10, warmthShift: 5, brightnessOffset: 0.03 },
  // Set 2: cool, ethereal — exploratory jams, psychedelic depths
  2: { saturationMult: 0.90, warmthShift: -8, brightnessOffset: -0.05 },
  // Encore (set 3): subdued, intimate — final statement
  3: { saturationMult: 0.85, warmthShift: 0, brightnessOffset: -0.08 },
};

/** Neutral theme — no adjustment. Used as fallback. */
const NEUTRAL: SetTheme = { saturationMult: 1.0, warmthShift: 0, brightnessOffset: 0 };

/**
 * Return visual theme adjustments for a given set number.
 * Falls back to neutral if the set number is unknown.
 */
export function getSetTheme(setNumber: number): SetTheme {
  return SET_THEMES[setNumber] ?? NEUTRAL;
}
