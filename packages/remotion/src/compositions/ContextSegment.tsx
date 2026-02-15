import React from 'react';
import { useVideoConfig } from 'remotion';
import { KenBurns } from '../components/KenBurns.js';
import { TextOverlay } from '../components/TextOverlay.js';
import { Branding } from '../components/Branding.js';
import { FPS } from '../styles/themes.js';

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
}

export const ContextSegment: React.FC<ContextSegmentProps> = ({
  textLines,
  images,
  colorPalette,
}) => {
  const { durationInFrames } = useVideoConfig();
  const accent = colorPalette?.[0];

  // Lay out text lines sequentially
  let cursor = 0;
  const entries = textLines.map((line) => {
    const dur = Math.round(line.displayDuration * FPS);
    const entry = { ...line, startFrame: cursor, durationInFrames: dur };
    cursor += dur;
    return entry;
  });

  return (
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
      <Branding />
    </div>
  );
};
