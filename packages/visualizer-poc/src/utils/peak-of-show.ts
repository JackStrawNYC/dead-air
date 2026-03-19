/**
 * Peak-of-Show Recognition — detect THE moment of the show.
 *
 * In a Grateful Dead show, there's always THE moment — usually deep in Set 2
 * during a jam that achieves transcendence. This module detects when the
 * current musical moment exceeds all previous peaks in the show, triggering
 * a unique visual treatment that can only happen once.
 *
 * Detection:
 *   Score = energy × coherenceProxy × harmonicTension
 *   When score exceeds threshold AND exceeds all previous song peaks,
 *   enter "transcendent" visual state.
 *
 * Visual treatment (applied for ~5 seconds):
 *   - Golden luminance boost (+0.08 brightness)
 *   - Saturation push (+0.12)
 *   - Overlay density suppressed to 0.5 (clear the visual field)
 *   - Camera enters slow, reverent drift
 *   - Color convergence toward warm gold
 *
 * This is a ONE-TIME event per show. Once triggered, it won't fire again.
 */

import type { EnhancedFrameData } from "../data/types";

export interface PeakOfShowState {
  /** Whether we're currently in the peak-of-show moment */
  isActive: boolean;
  /** Intensity of the peak moment (0-1, ramps up then down) */
  intensity: number;
  /** Brightness boost during peak (+0.08 max) */
  brightnessBoost: number;
  /** Saturation boost during peak (+0.12 max) */
  saturationBoost: number;
  /** Overlay density multiplier (1.0 normally, 0.5 during peak) */
  densityMult: number;
  /** Camera motion multiplier (1.0 normally, 0.6 during peak for reverent drift) */
  motionMult: number;
}

const NEUTRAL: PeakOfShowState = {
  isActive: false,
  intensity: 0,
  brightnessBoost: 0,
  saturationBoost: 0,
  densityMult: 1,
  motionMult: 1,
};

// Duration of the peak visual treatment in frames (5 seconds at 30fps)
const PEAK_DURATION = 150;
// Ramp-up time (1 second)
const RAMP_UP = 30;
// Ramp-down time (2.5 seconds)
const RAMP_DOWN = 75;

/**
 * Compute a peak-of-show score for a given frame.
 * Higher = more likely to be THE moment.
 */
function peakScore(frame: EnhancedFrameData): number {
  const energy = frame.rms;
  const tension = frame.harmonicTension ?? 0;
  // Use flatness as inverse coherence proxy (low flatness = more tonal = more locked)
  const coherenceProxy = Math.max(0, 1 - (frame.flatness ?? 0.5) * 2);

  return energy * (0.5 + coherenceProxy * 0.5) * (0.7 + tension * 0.3);
}

/**
 * Detect peak-of-show moment.
 *
 * @param frames - Full frame array for current song
 * @param frameIdx - Current frame index
 * @param previousSongPeaks - Peak scores from songs already rendered
 * @param hasAlreadyFired - Whether peak-of-show already triggered in this show
 * @param songsCompleted - Number of songs completed so far
 * @param totalSongs - Total songs in the show
 */
export function detectPeakOfShow(
  frames: EnhancedFrameData[],
  frameIdx: number,
  previousSongPeaks: number[],
  hasAlreadyFired: boolean,
  songsCompleted: number,
  totalSongs: number,
): PeakOfShowState {
  // Already fired — one-time event
  if (hasAlreadyFired) return NEUTRAL;

  // Too early in the show (don't fire in first 40% of setlist)
  if (totalSongs > 0 && songsCompleted < totalSongs * 0.4) return NEUTRAL;

  // Need enough frame data
  if (frames.length < 90 || frameIdx < 60) return NEUTRAL;

  // Compute current moment's score (smoothed over 30 frames)
  let currentScore = 0;
  const windowStart = Math.max(0, frameIdx - 30);
  for (let i = windowStart; i <= frameIdx; i++) {
    currentScore += peakScore(frames[i]);
  }
  currentScore /= (frameIdx - windowStart + 1);

  // Find the previous show-wide maximum
  const previousMax = previousSongPeaks.length > 0
    ? Math.max(...previousSongPeaks)
    : 0;

  // Need to exceed both a minimum threshold AND all previous song peaks
  const MIN_THRESHOLD = 0.08;
  if (currentScore < MIN_THRESHOLD) return NEUTRAL;

  const requiredScore = previousMax > 0 ? previousMax * 1.1 : MIN_THRESHOLD;
  if (currentScore < requiredScore) return NEUTRAL;

  // Intensity: how far above the threshold (0-1, capped)
  // Stronger peaks = more intense visual treatment
  const excessRatio = (currentScore - requiredScore) / Math.max(0.01, requiredScore);
  const intensity = Math.max(0, Math.min(1, excessRatio * 2));

  return {
    isActive: intensity > 0.01,
    intensity,
    brightnessBoost: intensity * 0.08,
    saturationBoost: intensity * 0.12,
    densityMult: 1 - intensity * 0.5,   // 1.0 → 0.5
    motionMult: 1 - intensity * 0.4,    // 1.0 → 0.6
  };
}

/**
 * Compute the peak score for a full song (for cross-song comparison).
 * Returns the maximum 30-frame-smoothed peak score in the song.
 */
export function computeSongPeakScore(frames: EnhancedFrameData[]): number {
  if (frames.length < 30) return 0;

  let maxScore = 0;
  for (let i = 30; i < frames.length; i += 10) {
    let windowScore = 0;
    for (let j = i - 30; j <= i; j++) {
      windowScore += peakScore(frames[j]);
    }
    windowScore /= 31;
    if (windowScore > maxScore) maxScore = windowScore;
  }

  return maxScore;
}
