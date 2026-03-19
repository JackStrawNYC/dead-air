/**
 * Visual Fatigue Governor — prevents visual overload during long shows.
 *
 * After 90+ minutes of sustained high-energy visuals, the engine dampens
 * overlay density, motion speed, saturation, and brightness to give
 * the audience's eyes a rest. Quiet songs and set breaks provide recovery.
 *
 * Pure function — no React dependency, fully testable.
 */

import { lerp, clamp } from "./math";

export interface FatigueInput {
  /** Per-song peak energies completed so far */
  songPeakEnergies: number[];
  /** Current song's running average energy (sampled every ~30 frames) */
  currentSongAvgEnergy: number;
  /** Minutes into the show (derived from songsCompleted * avg duration) */
  showMinutesElapsed: number;
  /** Songs completed */
  songsCompleted: number;
}

export interface FatigueDampening {
  /** Overlay density multiplier (0.80-1.0) — gentle dampening preserves vibrancy */
  densityMult: number;
  /** Motion speed multiplier (0.7-1.0) — slows camera/drift */
  motionMult: number;
  /** Saturation offset (-0.08 to 0) — subtly desaturates */
  saturationOffset: number;
  /** Brightness offset (-0.05 to 0) — slight dimming */
  brightnessOffset: number;
}

/** Neutral dampening — no effect on visuals */
const NEUTRAL: FatigueDampening = {
  densityMult: 1,
  motionMult: 1,
  saturationOffset: 0,
  brightnessOffset: 0,
};

/**
 * Compute visual fatigue dampening from show history + current song state.
 *
 * @param input - Show history and current song energy
 * @param isEncore - Whether this is the encore set (gets fatigue reduction)
 * @returns Dampening multipliers/offsets to apply to visuals
 */
export function computeFatigueDampening(
  input: FatigueInput,
  isEncore = false,
): FatigueDampening {
  const { songPeakEnergies, currentSongAvgEnergy, showMinutesElapsed, songsCompleted } = input;

  // Too early for fatigue
  if (songsCompleted < 6 || showMinutesElapsed < 30) {
    return NEUTRAL;
  }

  // Compute intensity score: weighted average of recent song peaks
  // Last 5 songs weighted 2x vs earlier songs
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < songPeakEnergies.length; i++) {
    const isRecent = i >= songPeakEnergies.length - 5;
    const weight = isRecent ? 2 : 1;
    weightedSum += songPeakEnergies[i] * weight;
    totalWeight += weight;
  }
  const intensityScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Show fatigue factor: ramps 0→1 over 90 minutes (0 = fresh, 1 = full fatigue)
  const showFatigueFactor = clamp((showMinutesElapsed - 30) / 60, 0, 1);

  let fatiguePressure = intensityScore * showFatigueFactor;

  // Recovery: quiet songs ARE the rest
  if (currentSongAvgEnergy < 0.12) {
    fatiguePressure *= 0.7;
  }

  // Encore reset: audience refreshed after set break
  if (isEncore) {
    fatiguePressure *= 0.6;
  }

  // No dampening until pressure exceeds threshold
  if (fatiguePressure <= 0.5) {
    return NEUTRAL;
  }

  // Map pressure 0.5→1.0 to dampening 0→1
  const dampenAmount = clamp((fatiguePressure - 0.5) * 2, 0, 1);

  return {
    densityMult: lerp(1.0, 0.80, dampenAmount),
    motionMult: lerp(1.0, 0.7, dampenAmount),
    saturationOffset: lerp(0, -0.08, dampenAmount),
    brightnessOffset: lerp(0, -0.05, dampenAmount),
  };
}
