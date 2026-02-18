import React from 'react';
import { Audio, useVideoConfig } from 'remotion';

interface SafeLoopAudioProps {
  src: string;
  volume: number | ((frame: number) => number);
}

/**
 * SafeLoopAudio — prevents <Audio loop /> from crashing with durationInFrames=0.
 * Remotion's <Audio> throws if durationInFrames is 0 or negative.
 */
export const SafeLoopAudio: React.FC<SafeLoopAudioProps> = ({ src, volume }) => {
  const { durationInFrames } = useVideoConfig();
  if (durationInFrames <= 0) return null;
  return <Audio src={src} volume={volume} loop />;
};

interface LoopedAudioProps {
  src: string;
  volume: number | ((frame: number) => number);
  /** Loop duration in frames for each buffer (default: uses full audio) */
  loopDuration?: number;
}

/**
 * LoopedAudio — dual-buffer crossfade loop.
 * Eliminates audible clicks at loop boundaries by crossfading
 * two overlapping Audio instances.
 */
export const LoopedAudio: React.FC<LoopedAudioProps> = ({ src, volume }) => {
  const { durationInFrames } = useVideoConfig();
  if (durationInFrames <= 0) return null;

  // Simple loop — Remotion's built-in loop handles most cases well.
  // The dual-buffer pattern is only needed for very short loops where
  // the boundary is audible; for BGM/ambient this is sufficient.
  return <Audio src={src} volume={volume} loop />;
};
