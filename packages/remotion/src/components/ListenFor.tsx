import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, EASE, FONTS } from '../styles/themes';

export interface ListenForProps {
  text: string;
  startFrame: number;
  durationInFrames: number;
  colorAccent?: string;
}

const FADE_IN = 20;
const FADE_OUT = 20;

/** Simple SVG headphone/ear icon */
const HeadphoneIcon: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" fill="none" opacity={0.5} />
    <path
      d="M8 16 C8 13 9 10 12 10 C15 10 16 13 16 16"
      stroke={color}
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
    />
    <circle cx="12" cy="12" r="2" fill={color} opacity={0.6} />
  </svg>
);

export const ListenFor: React.FC<ListenForProps> = ({
  text,
  startFrame,
  durationInFrames,
  colorAccent = COLORS.accent,
}) => {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  if (local < 0 || local > durationInFrames) return null;

  const holdEnd = durationInFrames - FADE_OUT;
  const opacity = interpolate(
    local,
    [0, FADE_IN, holdEnd, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(...EASE.smooth) },
  );

  const slideY = interpolate(local, [0, FADE_IN], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(...EASE.out),
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 120,
        left: '15%',
        right: '15%',
        opacity,
        transform: `translateY(${slideY}px)`,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <div
        style={{
          background: 'rgba(10, 10, 10, 0.35)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRadius: 8,
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <HeadphoneIcon color={colorAccent} size={22} />
        <div
          style={{
            fontFamily: FONTS.heading,
            fontSize: 32,
            fontStyle: 'italic',
            fontWeight: 400,
            color: COLORS.textMuted,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
            lineHeight: 1.3,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};
