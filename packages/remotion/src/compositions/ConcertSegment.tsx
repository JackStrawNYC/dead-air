import React from 'react';
import { Audio, staticFile, useVideoConfig } from 'remotion';
import { KenBurns } from '../components/KenBurns.js';
import { SongMetadata } from '../components/SongMetadata.js';
import { Branding } from '../components/Branding.js';

interface ConcertSegmentProps {
  songName: string;
  audioSrc: string;
  startFrom: number; // frames offset into the full concert audio
  images: string[];
  mood: string;
  colorPalette: string[];
  energyData?: number[];
}

export const ConcertSegment: React.FC<ConcertSegmentProps> = ({
  songName,
  audioSrc,
  startFrom,
  images,
}) => {
  const { durationInFrames } = useVideoConfig();

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <KenBurns images={images} durationInFrames={durationInFrames} />
      <Audio src={staticFile(audioSrc)} startFrom={startFrom} />
      <SongMetadata songName={songName} durationInFrames={durationInFrames} />
      <Branding />
    </div>
  );
};
