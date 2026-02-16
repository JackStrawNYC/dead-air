import React from 'react';
import { Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { KenBurns } from '../components/KenBurns.js';
import { Branding } from '../components/Branding.js';

interface NarrationSegmentProps {
  audioSrc: string;
  images: string[];
  mood: string;
  colorPalette: string[];
}

const FADE_FRAMES = 75; // 2.5s crossfade

export const NarrationSegment: React.FC<NarrationSegmentProps> = ({
  audioSrc,
  images,
}) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // Audio crossfade: fade in over first 2.5s, fade out over last 2.5s
  const volume = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <KenBurns images={images} durationInFrames={durationInFrames} />
      <Audio src={staticFile(audioSrc)} volume={volume} />
      <Branding />
    </div>
  );
};
