import React from 'react';
import { Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { KenBurns } from '../components/KenBurns';
import { Branding } from '../components/Branding';
import { FilmGrain } from '../components/FilmGrain';
import { VintageFilter } from '../components/VintageFilter';

interface NarrationSegmentProps {
  audioSrc: string;
  images: string[];
  mood: string;
  colorPalette: string[];
  concertBedSrc?: string;
  concertBedStartFrom?: number;
}

const FADE_FRAMES = 15; // 0.5s crossfade

const CONCERT_BED_VOLUME = 0.07; // subtle concert bleed under narration

export const NarrationSegment: React.FC<NarrationSegmentProps> = ({
  audioSrc,
  images,
  concertBedSrc,
  concertBedStartFrom,
}) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // Narration audio: quick fade in/out
  const volume = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Concert bed: fade in/out at low volume
  const bedVolume = concertBedSrc
    ? interpolate(
        frame,
        [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
        [0, CONCERT_BED_VOLUME, CONCERT_BED_VOLUME, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 0;

  return (
    <VintageFilter intensity={0.5}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <KenBurns images={images} durationInFrames={durationInFrames} />
        <Audio src={staticFile(audioSrc)} volume={volume} />
        {concertBedSrc && (
          <Audio
            src={staticFile(concertBedSrc)}
            startFrom={concertBedStartFrom ?? 0}
            volume={bedVolume}
          />
        )}
        <Branding />
        <FilmGrain intensity={0.10} />
      </div>
    </VintageFilter>
  );
};
