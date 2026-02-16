import React from 'react';
import { Audio, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles/themes';
import { AnimatedTitle } from '../components/AnimatedTitle';
import { WaveformBar } from '../components/WaveformBar';
import { FilmGrain } from '../components/FilmGrain';
import { VintageFilter } from '../components/VintageFilter';
import { sampleEnergy, normalizeEnergy } from '../utils/energy';

interface ShortsCompositionProps {
  audioSrc: string;
  startFrom: number;
  images: string[];
  hookText: string;
  songName?: string;
  energyData?: number[];
}

const MAX_FRAMES_PER_IMAGE = 90; // 3s per image for faster pacing in Shorts

export const ShortsComposition: React.FC<ShortsCompositionProps> = ({
  audioSrc,
  startFrom,
  images,
  hookText,
  songName,
  energyData,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  if (images.length === 0) return null;

  // Image cycling
  const slotCount = Math.max(Math.ceil(durationInFrames / MAX_FRAMES_PER_IMAGE), images.length);
  const framesPerSlot = Math.ceil(durationInFrames / slotCount);

  const currentSlot = Math.min(Math.floor(frame / framesPerSlot), slotCount - 1);
  const imgIndex = currentSlot % images.length;
  const localFrame = frame - currentSlot * framesPerSlot;
  const progress = Math.max(0, Math.min(1, localFrame / framesPerSlot));

  // Ken Burns zoom for 9:16
  const scale = 1.1 + progress * 0.1;

  // Audio volume
  const volume = interpolate(
    frame,
    [0, 10, durationInFrames - 10, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Hook text fade
  const hookOpacity = interpolate(frame, [0, 15, durationInFrames * 0.25, durationInFrames * 0.35], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <VintageFilter intensity={0.7}>
      <div style={{ width: '100%', height: '100%', backgroundColor: COLORS.bg, overflow: 'hidden' }}>
        {/* Center-cropped background */}
        <Img
          src={staticFile(images[imgIndex])}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale})`,
          }}
        />

        <Audio src={staticFile(audioSrc)} startFrom={startFrom} volume={volume} />

        {/* Hook text in top 25% */}
        <div
          style={{
            position: 'absolute',
            top: '8%',
            left: 40,
            right: 40,
            textAlign: 'center',
            opacity: hookOpacity,
          }}
        >
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 72,
              fontWeight: 900,
              color: 'white',
              WebkitTextStroke: '3px black',
              lineHeight: 1.1,
              textShadow: '0 4px 16px rgba(0,0,0,0.8)',
            }}
          >
            {hookText}
          </div>
        </div>

        {/* Song name at bottom */}
        {songName && (
          <div
            style={{
              position: 'absolute',
              bottom: 100,
              left: 40,
              right: 40,
              textAlign: 'center',
              fontFamily: FONTS.heading,
              fontSize: 28,
              color: COLORS.accent,
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            }}
          >
            {songName}
          </div>
        )}

        {/* Waveform at bottom */}
        {energyData && energyData.length > 0 && (
          <WaveformBar energyData={energyData} height={50} />
        )}

        <FilmGrain intensity={0.12} />
      </div>
    </VintageFilter>
  );
};
