/**
 * Crowd Noise Detection — identifies applause/crowd noise moments.
 *
 * Heuristic: high spectral flatness (noise-like) + moderate RMS energy
 * sustained for 30+ frames with sparse onsets = crowd noise.
 */

import type { EnhancedFrameData } from "./types";

export interface CrowdMoment {
  /** First frame of crowd noise (inclusive) */
  frameStart: number;
  /** Last frame of crowd noise (exclusive) */
  frameEnd: number;
  /** Average intensity (0-1) */
  avgIntensity: number;
}

const MIN_DURATION = 30; // ~1 second at 30fps
const FLATNESS_THRESHOLD = 0.15;
const RMS_THRESHOLD = 0.1;
const ONSET_SPARSITY_WINDOW = 15; // check onsets in ±15 frame window
const MAX_ONSET_DENSITY = 0.3; // max 30% of frames with strong onsets

/**
 * Scan all frames and return crowd noise moments.
 * Called once per song via useMemo — O(n) single pass.
 */
export function detectCrowdMoments(frames: EnhancedFrameData[]): CrowdMoment[] {
  const moments: CrowdMoment[] = [];
  let momentStart = -1;
  let intensitySum = 0;
  let count = 0;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const isCrowdFrame = f.flatness > FLATNESS_THRESHOLD && f.rms > RMS_THRESHOLD;

    // Check onset sparsity — crowd noise has few sharp transients
    let onsetCount = 0;
    let windowSize = 0;
    if (isCrowdFrame) {
      for (let j = Math.max(0, i - ONSET_SPARSITY_WINDOW); j <= Math.min(frames.length - 1, i + ONSET_SPARSITY_WINDOW); j++) {
        windowSize++;
        if (frames[j].onset > 0.5) onsetCount++;
      }
    }
    const sparseOnsets = windowSize > 0 ? (onsetCount / windowSize) < MAX_ONSET_DENSITY : true;

    if (isCrowdFrame && sparseOnsets) {
      if (momentStart === -1) {
        momentStart = i;
        intensitySum = 0;
        count = 0;
      }
      intensitySum += f.rms;
      count++;
    } else {
      if (momentStart !== -1 && count >= MIN_DURATION) {
        moments.push({
          frameStart: momentStart,
          frameEnd: i,
          avgIntensity: intensitySum / count,
        });
      }
      momentStart = -1;
    }
  }

  // Handle moment extending to end of track
  if (momentStart !== -1 && count >= MIN_DURATION) {
    moments.push({
      frameStart: momentStart,
      frameEnd: frames.length,
      avgIntensity: intensitySum / count,
    });
  }

  return moments;
}
