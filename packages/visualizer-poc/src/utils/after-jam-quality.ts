/**
 * After-Jam Silence Quality — modulates intro atmosphere based on
 * what just happened in the previous song.
 *
 * The 20-second between-song breathing room should FEEL different:
 *   - After a massive jam:    cooler colors, wider vignette, slower shimmer, "vast" feel
 *   - After a tender ballad:  warmer colors, tighter frame, intimate feel
 *   - After a bustout/rarity: brighter intro, excited energy
 *   - After Drums/Space:      deep calm, meditative shimmer
 *   - After high-energy rock:  warm afterglow, comfortable
 *
 * Returns visual modifiers for the intro hold period.
 */

import type { PrevSongContext } from "./show-narrative-precompute";

export interface AfterJamModifiers {
  /** Color temperature shift: -1 cool, 0 neutral, +1 warm */
  temperatureShift: number;
  /** Shimmer speed multiplier (0.5 = half speed, 2.0 = double) */
  shimmerSpeed: number;
  /** Shimmer color RGB override (null = default warm amber) */
  shimmerColor: { r: number; g: number; b: number } | null;
  /** Intro quote display duration multiplier (longer after big moments) */
  quoteDurationMult: number;
  /** Ambient brightness offset (-0.05 to +0.05) */
  brightnessOffset: number;
}

const DEFAULT: AfterJamModifiers = {
  temperatureShift: 0,
  shimmerSpeed: 1,
  shimmerColor: null,
  quoteDurationMult: 1,
  brightnessOffset: 0,
};

/**
 * Derive intro visual modifiers from previous song context.
 */
export function computeAfterJamQuality(
  prevSong: PrevSongContext | null | undefined,
): AfterJamModifiers {
  if (!prevSong) return DEFAULT;

  // Drums/Space: deep meditative calm
  if (prevSong.wasJamSegment) {
    return {
      temperatureShift: -0.3,
      shimmerSpeed: 0.4,
      shimmerColor: { r: 60, g: 80, b: 140 }, // deep blue
      quoteDurationMult: 1.3,
      brightnessOffset: -0.03,
    };
  }

  // After massive jam: high energy + long duration + coherence lock
  const isLongJam = prevSong.durationFrames > 12000; // > 6.7 minutes at 30fps
  const isHighEnergy = prevSong.peakEnergy > 0.35;
  const hadLock = prevSong.hadCoherenceLock;

  if (isHighEnergy && (isLongJam || hadLock)) {
    return {
      temperatureShift: -0.4,
      shimmerSpeed: 0.5,
      shimmerColor: { r: 80, g: 70, b: 130 }, // cool purple — vast afterglow
      quoteDurationMult: 1.4,
      brightnessOffset: -0.02,
    };
  }

  // Tender ballad: low energy, not long
  const isQuiet = prevSong.avgEnergy < 0.1;
  const isShort = prevSong.durationFrames < 9000; // < 5 minutes

  if (isQuiet && isShort) {
    return {
      temperatureShift: 0.4,
      shimmerSpeed: 0.7,
      shimmerColor: { r: 140, g: 100, b: 60 }, // warm amber — intimate
      quoteDurationMult: 1.2,
      brightnessOffset: 0.02,
    };
  }

  // High-energy rock (but not a jam): warm afterglow
  if (isHighEnergy) {
    return {
      temperatureShift: 0.2,
      shimmerSpeed: 0.8,
      shimmerColor: { r: 120, g: 90, b: 50 }, // warm gold
      quoteDurationMult: 1.0,
      brightnessOffset: 0.01,
    };
  }

  // Medium energy: slight warm shift
  return {
    temperatureShift: 0.1,
    shimmerSpeed: 0.9,
    shimmerColor: null,
    quoteDurationMult: 1.0,
    brightnessOffset: 0,
  };
}
