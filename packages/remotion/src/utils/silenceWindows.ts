import { interpolate } from 'remotion';

export interface SilenceWindow {
  /** Composition-level frame where silence begins */
  startFrame: number;
  /** Duration in frames */
  durationFrames: number;
}

/**
 * Compute a silence factor (0 = total silence, 1 = normal volume).
 *
 * Used by all audio components (BGM, ambient, SFX) to implement
 * "silence drops" at dramatic moments. The silence ramps down over
 * rampFrames, holds at 0, then ramps back up.
 */
export function computeSilenceFactor(
  frame: number,
  windows: SilenceWindow[],
  rampFrames: number = 25,
): number {
  let factor = 1;

  for (const w of windows) {
    const silenceStart = w.startFrame;
    const silenceEnd = w.startFrame + w.durationFrames;

    if (frame >= silenceStart - rampFrames && frame <= silenceEnd + rampFrames) {
      let windowFactor: number;

      if (frame < silenceStart) {
        // Ramping down into silence
        const t = interpolate(
          frame,
          [silenceStart - rampFrames, silenceStart],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        windowFactor = t * t * (3 - 2 * t);
      } else if (frame > silenceEnd) {
        // Ramping back up from silence
        const t = interpolate(
          frame,
          [silenceEnd, silenceEnd + rampFrames],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        windowFactor = t * t * (3 - 2 * t);
      } else {
        windowFactor = 0;
      }

      factor = Math.min(factor, windowFactor);
    }
  }

  return factor;
}

export interface PreSwellWindow {
  /** Frame where the swell peaks (= dramatic scene start boundary) */
  peakFrame: number;
  /** How many frames before peak the ramp begins (default: 45 = 1.5s) */
  rampFrames: number;
  /** Volume multiplier at peak (default: 1.8 = 80% louder) */
  boostMultiplier: number;
}

/**
 * Compute a volume swell factor (1 = normal, >1 = boosted).
 *
 * Used by BGM components to ramp volume UP before dramatic reveals,
 * creating the "hold your breath" effect.
 */
export function computePreSwellFactor(
  frame: number,
  windows: PreSwellWindow[],
): number {
  let factor = 1;

  for (const w of windows) {
    const rampStart = w.peakFrame - w.rampFrames;

    if (frame >= rampStart && frame < w.peakFrame) {
      const t = (frame - rampStart) / w.rampFrames;
      const eased = t * t * (3 - 2 * t);
      const boost = 1 + (w.boostMultiplier - 1) * eased;
      factor = Math.max(factor, boost);
    }
  }

  return factor;
}
