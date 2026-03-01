/**
 * CrowdAmbience — subtle crowd atmosphere layer for SBD recordings.
 *
 * Plays a looped crowd ambience track at very low volume, modulated by
 * audio energy. During quiet passages the crowd fades nearly silent;
 * during peaks they swell slightly — creating the feeling of a live room
 * without overwhelming the board tape clarity.
 *
 * Energy-reactive volume: 1-4% base, swelling to 6-8% during peaks.
 */

import React from "react";
import { Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { AudioSnapshot } from "../utils/audio-reactive";

interface Props {
  snapshot: AudioSnapshot;
  /** Override base volume (default 0.02) */
  baseVolume?: number;
  /** Override peak volume (default 0.07) */
  peakVolume?: number;
}

const FADE_IN_FRAMES = 90; // 3s gentle fade-in at start

export const CrowdAmbience: React.FC<Props> = ({
  snapshot,
  baseVolume = 0.02,
  peakVolume = 0.07,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Energy-reactive volume — uses slowEnergy for drift, not pulse
  const energyVolume = interpolate(
    snapshot.slowEnergy,
    [0.03, 0.25],
    [baseVolume, peakVolume],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Fade in at start, fade out at end
  const fadeIn = interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - FADE_IN_FRAMES, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const volume = energyVolume * Math.min(fadeIn, fadeOut);

  return (
    <Audio
      src={staticFile("assets/ambient/crowd-ambience.mp3")}
      volume={volume}
      loop
    />
  );
};
