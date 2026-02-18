import React from 'react';
import { Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { SilenceWindow, PreSwellWindow } from '../utils/silenceWindows';
import { computeSilenceFactor, computePreSwellFactor } from '../utils/silenceWindows';

interface NarrationTiming {
  startFrame: number;
  endFrame: number;
}

interface DuckedBGMProps {
  /** Path to BGM audio file (relative to public/) */
  src: string;
  /** Full volume when no narration (default: 0.15) */
  fullVolume?: number;
  /** Ducked volume under narration (default: 0.05) */
  duckedVolume?: number;
  /** Narration timings for ducking (composition-level frames) */
  narrationTimings?: NarrationTiming[];
  /** Silence windows for dramatic drops */
  silenceWindows?: SilenceWindow[];
  /** Pre-swell windows for dramatic builds */
  preSwellWindows?: PreSwellWindow[];
  /** Duck-down ramp in frames (default: 24 — cubic out) */
  duckDownFrames?: number;
  /** Duck-up recovery in frames (default: 30 — cubic in) */
  duckUpFrames?: number;
}

/**
 * DuckedBGM — background music with multi-layer volume automation.
 *
 * Composes four volume factors:
 * 1. Narration ducking (asymmetric: fast duck-down, slow recovery)
 * 2. Composition fade (smoothstep in/out at start/end)
 * 3. Silence factor (dramatic drops to zero)
 * 4. Pre-swell factor (builds before dramatic reveals)
 */
export const DuckedBGM: React.FC<DuckedBGMProps> = ({
  src,
  fullVolume = 0.15,
  duckedVolume = 0.05,
  narrationTimings = [],
  silenceWindows = [],
  preSwellWindows = [],
  duckDownFrames = 24,
  duckUpFrames = 30,
}) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  if (durationInFrames <= 0) return null;

  const volume = (() => {
    // 1. Narration ducking
    let duckFactor = 1; // 1 = full, 0 = fully ducked
    for (const nt of narrationTimings) {
      if (frame >= nt.startFrame - duckDownFrames && frame <= nt.endFrame + duckUpFrames) {
        if (frame < nt.startFrame) {
          // Ramping down (cubic out — fast initial duck)
          const t = interpolate(frame, [nt.startFrame - duckDownFrames, nt.startFrame], [1, 0], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          const eased = 1 - (1 - t) * (1 - t) * (1 - t); // cubic out
          duckFactor = Math.min(duckFactor, eased);
        } else if (frame > nt.endFrame) {
          // Recovering (cubic in — slow gentle return)
          const t = interpolate(frame, [nt.endFrame, nt.endFrame + duckUpFrames], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          const eased = t * t * t; // cubic in
          duckFactor = Math.min(duckFactor, eased);
        } else {
          // During narration — fully ducked
          duckFactor = 0;
        }
      }
    }
    const narrationVolume = duckedVolume + (fullVolume - duckedVolume) * duckFactor;

    // 2. Composition fade (smoothstep in/out)
    const fadeIn = interpolate(frame, [0, 45], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const fadeOut = interpolate(frame, [durationInFrames - 30, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const compFade = Math.min(fadeIn, fadeOut);
    const compFadeSmooth = compFade * compFade * (3 - 2 * compFade);

    // 3. Silence factor
    const silence = computeSilenceFactor(frame, silenceWindows);

    // 4. Pre-swell factor
    const swell = computePreSwellFactor(frame, preSwellWindows);

    return narrationVolume * compFadeSmooth * silence * swell;
  })();

  return (
    <Audio
      src={staticFile(src)}
      volume={volume}
      loop
    />
  );
};
