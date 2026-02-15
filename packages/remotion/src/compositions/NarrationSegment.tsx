import React from 'react';
import { Audio, staticFile, useVideoConfig } from 'remotion';
import { KenBurns } from '../components/KenBurns.js';
import { Branding } from '../components/Branding.js';

interface NarrationSegmentProps {
  audioSrc: string;
  images: string[];
  mood: string;
  colorPalette: string[];
}

export const NarrationSegment: React.FC<NarrationSegmentProps> = ({
  audioSrc,
  images,
}) => {
  const { durationInFrames } = useVideoConfig();

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <KenBurns images={images} durationInFrames={durationInFrames} />
      <Audio src={staticFile(audioSrc)} />
      <Branding />
    </div>
  );
};
