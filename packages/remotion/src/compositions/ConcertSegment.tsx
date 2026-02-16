import React from 'react';
import { Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { KenBurns } from '../components/KenBurns';
import { SongMetadata } from '../components/SongMetadata';
import { Branding } from '../components/Branding';
import { WaveformBar } from '../components/WaveformBar';
import { FilmGrain } from '../components/FilmGrain';
import { VintageFilter } from '../components/VintageFilter';
import { sampleEnergy, normalizeEnergy } from '../utils/energy';

interface ConcertSegmentProps {
  songName: string;
  audioSrc: string;
  startFrom: number; // frames offset into the full concert audio
  images: string[];
  mood: string;
  colorPalette: string[];
  energyData?: number[];
}

const FADE_FRAMES = 15; // 0.5s crossfade

export const ConcertSegment: React.FC<ConcertSegmentProps> = ({
  songName,
  audioSrc,
  startFrom,
  images,
  energyData,
}) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // Audio crossfade: fade in over first 0.5s, fade out over last 0.5s
  const volume = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Compute current energy for SongMetadata pulse
  let currentEnergy: number | undefined;
  if (energyData && energyData.length > 0) {
    const raw = sampleEnergy(energyData, frame, durationInFrames);
    const { min, range } = normalizeEnergy(energyData);
    currentEnergy = (raw - min) / range;
  }

  return (
    <VintageFilter>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <KenBurns images={images} durationInFrames={durationInFrames} energyData={energyData} />
        <Audio src={staticFile(audioSrc)} startFrom={startFrom} volume={volume} />
        <SongMetadata songName={songName} durationInFrames={durationInFrames} currentEnergy={currentEnergy} />
        {energyData && energyData.length > 0 && (
          <WaveformBar energyData={energyData} />
        )}
        <Branding />
        <FilmGrain intensity={0.12} />
      </div>
    </VintageFilter>
  );
};
