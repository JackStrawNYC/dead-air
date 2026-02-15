import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONTS, FPS } from '../styles/themes.js';

const DURATION = 5 * FPS; // 150 frames

export const BrandIntro: React.FC = () => {
  const frame = useCurrentFrame();

  const textOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const fadeOut = interpolate(frame, [DURATION - 30, DURATION], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const glowIntensity = interpolate(frame, [50, 90, 120], [0, 20, 8], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const letterSpacing = interpolate(frame, [20, 60], [30, 16], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
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
  );
};
