import React from 'react';
import { Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { KenBurns } from '../components/KenBurns';
import { SongMetadata } from '../components/SongMetadata';
import { Branding } from '../components/Branding';

interface ConcertSegmentProps {
  songName: string;
  audioSrc: string;
  startFrom: number; // frames offset into the full concert audio
  images: string[];
  mood: string;
  colorPalette: string[];
  energyData?: number[];
}

const FADE_FRAMES = 75; // 2.5s crossfade

export const ConcertSegment: React.FC<ConcertSegmentProps> = ({
  songName,
  audioSrc,
  startFrom,
  images,
  energyData,
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
      <KenBurns images={images} durationInFrames={durationInFrames} energyData={energyData} />
      <Audio src={staticFile(audioSrc)} startFrom={startFrom} volume={volume} />
      <SongMetadata songName={songName} durationInFrames={durationInFrames} />
      <Branding />
    </div>
  );
};
