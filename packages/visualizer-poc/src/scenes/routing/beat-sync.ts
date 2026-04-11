/**
 * Beat-synced transition alignment — finds the best frame to snap a crossfade to.
 */

import type { EnhancedFrameData } from "../../data/types";

/**
 * Find nearest strong beat within a frame range for beat-synced transitions.
 * Prefers downbeats (first beat of measure) when beatConfidence is high,
 * then falls back to regular beats and strong onsets.
 * Returns the frame index of the best alignment point, or null if none found.
 */
/** @internal exported for testing */
export function findNearestBeat(
  frames: EnhancedFrameData[],
  searchStart: number,
  searchEnd: number,
): number | null {
  let bestFrame: number | null = null;
  let bestScore = 0;

  for (let i = Math.max(0, searchStart); i < Math.min(frames.length, searchEnd); i++) {
    const f = frames[i];
    const confidence = f.beatConfidence ?? 0;
    // Downbeats score highest when beat confidence is strong (>0.5)
    // This snaps transitions to measure boundaries for musical phrasing
    const downbeatBonus = (f.downbeat && confidence > 0.5) ? 2.0 * confidence : 0;
    const beatScore = f.beat ? 1.0 : 0;
    const onsetScore = f.onset > 0.7 ? f.onset * 0.5 : 0;
    const score = downbeatBonus + beatScore + onsetScore;
    if (score > bestScore) {
      bestScore = score;
      bestFrame = i;
    }
  }

  return bestScore > 0 ? bestFrame : null;
}
