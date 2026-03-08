/**
 * Music End Detection — shared utility for finding where music actually ends.
 *
 * Uses 3-second smoothed RMS to find the last window with real musical energy.
 * If there's a significant gap (>10s) between that and the track end,
 * everything after it is post-music dead air (applause/tuning/noodling).
 *
 * Used by:
 *   - SceneVideoLayer (to avoid placing videos in dead air)
 *   - SongVisualizer (to trigger ambient visuals after music ends)
 */

import type { EnhancedFrameData } from "../data/types";

const MUSIC_THRESHOLD = 0.10; // Smoothed RMS above this = actual music
const SMOOTH_WINDOW = 90;     // 3 seconds at 30fps
const MIN_TAIL_GAP = 300;     // 10 seconds to confirm song is over

/**
 * Detect where the music actually ends.
 * Returns the frame index of the last musical content, or totalFrames
 * if there's no significant dead air tail.
 */
export function findMusicEnd(frames: EnhancedFrameData[], totalFrames: number): number {
  if (frames.length === 0) return totalFrames;

  const scanEnd = Math.min(frames.length - 1, totalFrames);

  // Find the last 3-second window with meaningful musical energy
  let lastMusicalFrame = 0;
  for (let f = scanEnd; f >= SMOOTH_WINDOW; f -= 30) {
    let sum = 0;
    const windowStart = Math.max(0, f - SMOOTH_WINDOW / 2);
    const windowEnd = Math.min(scanEnd, f + SMOOTH_WINDOW / 2);
    const count = windowEnd - windowStart + 1;
    for (let w = windowStart; w <= windowEnd; w++) {
      sum += frames[w]?.rms ?? 0;
    }
    if (sum / count >= MUSIC_THRESHOLD) {
      lastMusicalFrame = f;
      break;
    }
  }

  const tailGap = totalFrames - lastMusicalFrame;
  if (tailGap >= MIN_TAIL_GAP) {
    return lastMusicalFrame;
  }

  return totalFrames;
}
