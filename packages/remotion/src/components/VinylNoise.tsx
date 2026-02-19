import React from 'react';
import { Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { smoothstepVolume } from '../utils/audio';

interface VinylNoiseProps {
  /** Path to vinyl/tape noise audio file */
  src?: string;
  /** Peak volume (default: 0.03 — subliminal) */
  maxVolume?: number;
  /** Set to false to disable (e.g. when audio file is missing) */
  enabled?: boolean;
}

/**
 * Ultra-quiet analog hiss — vinyl surface noise / tape hiss.
 * Gives the audio the same "not-digital" character that the visual
 * ArchivalTexture provides. Rendered at composition level.
 *
 * Fades in/out over 1.5s (45 frames) with smoothstep.
 */
export const VinylNoise: React.FC<VinylNoiseProps> = ({
  src = 'assets/ambient/vinyl-noise.mp3',
  maxVolume = 0.03,
  enabled = true,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  if (!enabled) return null;

  const volume = smoothstepVolume(frame, durationInFrames, 45, 45, maxVolume);

  return <Audio src={staticFile(src)} volume={volume} />;
};
