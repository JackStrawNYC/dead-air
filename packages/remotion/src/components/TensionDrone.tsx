import React from 'react';
import { Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { SilenceWindow } from '../utils/silenceWindows';
import { computeSilenceFactor } from '../utils/silenceWindows';

export type DroneType = 'crowd_rumble' | 'tape_hiss' | 'low_drone' | 'room_tone';

interface NarrationTiming {
  startFrame: number;
  endFrame: number;
}

interface TensionDroneProps {
  /** Drone audio source (relative to public/) */
  src: string;
  /** Drone type for logging/debugging */
  droneType?: DroneType;
  /** Base volume (default: 0.06) */
  baseVolume?: number;
  /** Ducked volume under narration (default: 0.03) */
  duckedVolume?: number;
  /** Narration timings for ducking */
  narrationTimings?: NarrationTiming[];
  /** Silence windows for dramatic drops */
  silenceWindows?: SilenceWindow[];
}

/**
 * TensionDrone — continuous low-frequency underscoring.
 *
 * Concert-doc drone types:
 * - crowd_rumble: venue audience ambience
 * - tape_hiss: analog tape character
 * - low_drone: sub-bass atmosphere
 * - room_tone: neutral space fill
 *
 * Supports narration ducking + silence windows.
 */
export const TensionDrone: React.FC<TensionDroneProps> = ({
  src,
  baseVolume = 0.06,
  duckedVolume = 0.03,
  narrationTimings = [],
  silenceWindows = [],
}) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  if (durationInFrames <= 0) return null;

  const volume = (() => {
    // Composition fade (smoothstep)
    const fadeIn = interpolate(frame, [0, 45], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const fadeOut = interpolate(frame, [durationInFrames - 30, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const compFade = Math.min(fadeIn, fadeOut);
    const compFadeSmooth = compFade * compFade * (3 - 2 * compFade);

    // Narration ducking
    let duckFactor = 1;
    for (const nt of narrationTimings) {
      if (frame >= nt.startFrame - 20 && frame <= nt.endFrame + 25) {
        if (frame < nt.startFrame) {
          const t = interpolate(frame, [nt.startFrame - 20, nt.startFrame], [1, 0], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          duckFactor = Math.min(duckFactor, t * t * (3 - 2 * t));
        } else if (frame > nt.endFrame) {
          const t = interpolate(frame, [nt.endFrame, nt.endFrame + 25], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          duckFactor = Math.min(duckFactor, t * t * (3 - 2 * t));
        } else {
          duckFactor = 0;
        }
      }
    }
    const narrationVolume = duckedVolume + (baseVolume - duckedVolume) * duckFactor;

    // Silence factor
    const silence = computeSilenceFactor(frame, silenceWindows);

    return narrationVolume * compFadeSmooth * silence;
  })();

  return (
    <Audio
      src={staticFile(src)}
      volume={volume}
      loop
    />
  );
};
