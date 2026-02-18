import React from 'react';
import { Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { SilenceWindow } from '../utils/silenceWindows';
import { computeSilenceFactor } from '../utils/silenceWindows';

interface NarrationTiming {
  startFrame: number;
  endFrame: number;
}

interface AmbientBedProps {
  /** Path to ambient audio file (relative to public/) */
  src: string;
  /** Base volume (default: 0.06) */
  baseVolume?: number;
  /** Ducked volume under narration (default: 0.035) */
  duckedVolume?: number;
  /** Breathing swell volume in post-narration windows (default: 0.09) */
  breathingVolume?: number;
  /** Narration timings for ducking (composition-level frames) */
  narrationTimings?: NarrationTiming[];
  /** Silence windows for dramatic drops */
  silenceWindows?: SilenceWindow[];
  /** Post-narration breathing window in frames (default: 45) */
  breathingFrames?: number;
}

/**
 * AmbientBed — mood-based atmospheric audio layer.
 *
 * Runs for the entire composition with:
 * - Smoothstep crossfade in/out at composition boundaries
 * - Narration ducking (reduces to duckedVolume during VO)
 * - Breathing swell (rises after narration for emotional weight)
 * - Silence window support
 */
export const AmbientBed: React.FC<AmbientBedProps> = ({
  src,
  baseVolume = 0.06,
  duckedVolume = 0.035,
  breathingVolume = 0.09,
  narrationTimings = [],
  silenceWindows = [],
  breathingFrames = 45,
}) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  if (durationInFrames <= 0) return null;

  const volume = (() => {
    // Composition fade (smoothstep)
    const fadeIn = interpolate(frame, [0, 30], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const fadeOut = interpolate(frame, [durationInFrames - 30, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const compFade = Math.min(fadeIn, fadeOut);
    const compFadeSmooth = compFade * compFade * (3 - 2 * compFade);

    // Determine target volume based on narration state
    let targetVolume = baseVolume;

    for (const nt of narrationTimings) {
      if (frame >= nt.startFrame && frame <= nt.endFrame) {
        // During narration — duck
        targetVolume = duckedVolume;
        break;
      }
      // Post-narration breathing window
      if (frame > nt.endFrame && frame <= nt.endFrame + breathingFrames) {
        const breathT = (frame - nt.endFrame) / breathingFrames;
        // Swell up then back down (sin curve)
        const breathCurve = Math.sin(breathT * Math.PI);
        targetVolume = Math.max(targetVolume, baseVolume + (breathingVolume - baseVolume) * breathCurve);
      }
    }

    // Narration ducking ramp (smoothstep over 20 frames)
    for (const nt of narrationTimings) {
      // Ramp into duck
      if (frame >= nt.startFrame - 20 && frame < nt.startFrame) {
        const t = interpolate(frame, [nt.startFrame - 20, nt.startFrame], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });
        const eased = t * t * (3 - 2 * t);
        targetVolume = baseVolume + (duckedVolume - baseVolume) * eased;
      }
      // Ramp out of duck
      if (frame > nt.endFrame && frame <= nt.endFrame + 20) {
        const t = interpolate(frame, [nt.endFrame, nt.endFrame + 20], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });
        const eased = t * t * (3 - 2 * t);
        targetVolume = duckedVolume + (baseVolume - duckedVolume) * eased;
      }
    }

    // Silence factor
    const silence = computeSilenceFactor(frame, silenceWindows);

    return targetVolume * compFadeSmooth * silence;
  })();

  return (
    <Audio
      src={staticFile(src)}
      volume={volume}
      loop
    />
  );
};
