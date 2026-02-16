import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONTS } from '../styles/themes';

export const Branding: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 0.5], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 40,
        left: 48,
        fontFamily: FONTS.body,
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: 6,
        textTransform: 'uppercase',
        color: COLORS.textMuted,
        opacity,
        textShadow: '0 1px 4px rgba(0,0,0,0.5)',
      }}
    >
      Dead Air
    </div>
  );
};
