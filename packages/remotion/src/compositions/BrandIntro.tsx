import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS, FPS } from '../styles/themes';
import { VintageFilter } from '../components/VintageFilter';
import { FilmGrain } from '../components/FilmGrain';

const DURATION = 5 * FPS; // 150 frames

export const BrandIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const fadeOut = interpolate(frame, [DURATION - 30, DURATION], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Spring-based glow: peaks then settles
  const glowSpring = spring({
    frame: Math.max(0, frame - 50),
    fps,
    config: { damping: 8, mass: 1, stiffness: 60 },
  });
  const glowIntensity = glowSpring * 20;

  const letterSpacing = interpolate(frame, [20, 60], [30, 16], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <VintageFilter intensity={0.6}>
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: COLORS.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: fadeOut,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 72,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing,
            color: COLORS.text,
            opacity: textOpacity,
            textShadow: `0 0 ${glowIntensity}px rgba(245, 240, 232, 0.6)`,
          }}
        >
          Dead Air
        </div>
      </div>
      <FilmGrain intensity={0.06} />
    </VintageFilter>
  );
};
