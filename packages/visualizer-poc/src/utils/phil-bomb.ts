/**
 * Phil Bomb Detection — radial shockwave trigger from bass transients.
 * Pure function, backward-scanning only (Remotion determinism safe).
 */
import type { EnhancedFrameData } from "../data/types";

const BOMB_DECAY_FRAMES = 8;

/**
 * Detect Phil bomb and return wave intensity (0-1).
 * Scans backward up to BOMB_DECAY_FRAMES to find the most recent bass bomb.
 * Returns exponentially decaying intensity from the bomb frame.
 */
export function detectPhilBomb(frames: EnhancedFrameData[], idx: number): number {
  for (let ago = 0; ago < BOMB_DECAY_FRAMES; ago++) {
    const checkIdx = idx - ago;
    if (checkIdx < 0) break;
    const f = frames[checkIdx];
    const bass = f.stemBassRms ?? 0;
    const onset = f.onset;
    if (bass > 0.7 && onset > 0.5) {
      // Exponential decay from bomb frame
      return Math.exp(-ago * 0.5) * Math.min(1, bass * onset * 2);
    }
  }
  return 0;
}
