import React from 'react';
import { Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { smoothstepVolume } from '../utils/audio';

interface CrowdAmbienceProps {
  /** Path to crowd ambience audio file */
  src?: string;
  /** Peak volume (default: 0.06 — barely perceptible) */
  maxVolume?: number;
  /** Frame offset into the audio file */
  startFrom?: number;
  /** Set to false to disable (e.g. when audio file is missing) */
  enabled?: boolean;
}

/**
 * Subtle crowd ambience bed — audience murmur, venue room tone.
 * Fades in/out over ~1s (30 frames) with smoothstep curve.
 * Creates "you are there" immersion under concert segments.
 */
export const CrowdAmbience: React.FC<CrowdAmbienceProps> = ({
  src = 'assets/ambient/crowd-ambience.mp3',
  maxVolume = 0.06,
  startFrom = 0,
  enabled = true,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  if (!enabled) return null;

  const volume = smoothstepVolume(frame, durationInFrames, 30, 30, maxVolume);

  return <Audio src={staticFile(src)} startFrom={startFrom} volume={volume} />;
};
