import React from 'react';
import { Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { KenBurns } from '../components/KenBurns';
import { TextOverlay } from '../components/TextOverlay';
import { SongMetadata } from '../components/SongMetadata';
import { Branding } from '../components/Branding';
import { WaveformBar } from '../components/WaveformBar';
import { FilmGrain } from '../components/FilmGrain';
import { VintageFilter } from '../components/VintageFilter';
import { sampleEnergy, normalizeEnergy } from '../utils/energy';
import { FPS } from '../styles/themes';

interface TextLineProps {
  text: string;
  displayDuration: number; // seconds
  style: 'fact' | 'quote' | 'analysis' | 'transition';
}

interface ConcertSegmentProps {
  songName: string;
  audioSrc: string;
  startFrom: number; // frames offset into the full concert audio
  images: string[];
  mood: string;
  colorPalette: string[];
  energyData?: number[];
  textLines?: TextLineProps[];
}

const FADE_FRAMES = 15; // 0.5s crossfade

export const ConcertSegment: React.FC<ConcertSegmentProps> = ({
  songName,
  audioSrc,
  startFrom,
  images,
  colorPalette,
  energyData,
  textLines,
}) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const accent = colorPalette?.[0];

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

  // Lay out textLines sequentially (same cursor pattern as ContextSegment)
  let textEntries: Array<TextLineProps & { startFrame: number; durationInFrames: number }> = [];
  if (textLines && textLines.length > 0) {
    let cursor = Math.round(FPS * 3); // start 3s in so music establishes first
    textEntries = textLines.map((line) => {
      const dur = Math.round(line.displayDuration * FPS);
      const entry = { ...line, startFrame: cursor, durationInFrames: dur };
      cursor += dur;
      return entry;
    });
  }

  return (
    <VintageFilter>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <KenBurns images={images} durationInFrames={durationInFrames} energyData={energyData} />
        <Audio src={staticFile(audioSrc)} startFrom={startFrom} volume={volume} />
        {textEntries.length > 0 && (
          <>
            {/* Dim overlay for text readability */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(10,10,10,0.7) 0%, rgba(10,10,10,0.15) 40%, transparent 100%)',
              }}
            />
            {textEntries.map((entry, i) => (
              <TextOverlay
                key={i}
                text={entry.text}
                style={entry.style}
                startFrame={entry.startFrame}
                durationInFrames={entry.durationInFrames}
                colorAccent={accent}
              />
            ))}
          </>
        )}
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
