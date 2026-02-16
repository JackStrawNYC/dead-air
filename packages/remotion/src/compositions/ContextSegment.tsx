import React from 'react';
import { Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { KenBurns } from '../components/KenBurns';
import { TextOverlay } from '../components/TextOverlay';
import { Branding } from '../components/Branding';
import { FilmGrain } from '../components/FilmGrain';
import { VintageFilter } from '../components/VintageFilter';
import { FPS } from '../styles/themes';

interface TextLineProps {
  text: string;
  displayDuration: number; // seconds
  style: 'fact' | 'quote' | 'analysis' | 'transition';
}

interface ContextSegmentProps {
  textLines: TextLineProps[];
  images: string[];
  mood: string;
  colorPalette: string[];
  ambientAudioSrc?: string;
  ambientStartFrom?: number;
}

const FADE_FRAMES = 15; // 0.5s
const AMBIENT_VOLUME = 0.18; // audible background bleed

export const ContextSegment: React.FC<ContextSegmentProps> = ({
  textLines,
  images,
  colorPalette,
  ambientAudioSrc,
  ambientStartFrom,
}) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const accent = colorPalette?.[0];

  // Ambient audio bed: fade in/out at very low volume
  const ambientVolume = ambientAudioSrc
    ? interpolate(
        frame,
        [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
        [0, AMBIENT_VOLUME, AMBIENT_VOLUME, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 0;

  // Lay out text lines sequentially
  let cursor = 0;
  const entries = textLines.map((line) => {
    const dur = Math.round(line.displayDuration * FPS);
    const entry = { ...line, startFrame: cursor, durationInFrames: dur };
    cursor += dur;
    return entry;
  });

  return (
    <VintageFilter>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <KenBurns images={images} durationInFrames={durationInFrames} />
        {/* Dim overlay for text readability */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0.2) 50%, transparent 100%)',
          }}
        />
        {entries.map((entry, i) => (
          <TextOverlay
            key={i}
            text={entry.text}
            style={entry.style}
            startFrame={entry.startFrame}
            durationInFrames={entry.durationInFrames}
            colorAccent={accent}
          />
        ))}
        {ambientAudioSrc && (
          <Audio
            src={staticFile(ambientAudioSrc)}
            startFrom={ambientStartFrom ?? 0}
            volume={ambientVolume}
          />
        )}
        <Branding />
        <FilmGrain intensity={0.10} />
      </div>
    </VintageFilter>
  );
};
