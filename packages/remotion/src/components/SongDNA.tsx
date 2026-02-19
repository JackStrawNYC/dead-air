import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles/themes';

export interface SongDNAProps {
  songName: string;
  timesPlayed: number;
  firstPlayed: string;
  lastPlayed: string;
  rank?: string;
  colorAccent?: string;
}

const SHOW_AT = 30;  // 1s delay
const HIDE_AT = 180; // 6s

export const SongDNA: React.FC<SongDNAProps> = ({
  songName,
  timesPlayed,
  firstPlayed,
  lastPlayed,
  rank,
  colorAccent = COLORS.accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Skip rendering if data is missing/placeholder
  if (timesPlayed <= 0 && !firstPlayed) return null;
  if (frame < SHOW_AT || frame > HIDE_AT + 15) return null;

  // Spring slide-in from right
  const enterFrame = Math.max(0, frame - SHOW_AT);
  const slideProgress = spring({
    frame: enterFrame,
    fps,
    config: { damping: 18, mass: 0.6, stiffness: 100 },
  });

  // Exit fade
  const exitOpacity = interpolate(
    frame,
    [HIDE_AT - 15, HIDE_AT],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const opacity = Math.min(slideProgress, exitOpacity);
  const slideX = (1 - slideProgress) * 40; // from right

  return (
    <div
      style={{
        position: 'absolute',
        top: 100,
        right: 80,
        opacity,
        transform: `translateX(${slideX}px)`,
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        zIndex: 10,
      }}
    >
      {/* Frosted glass card */}
      <div
        style={{
          background: 'rgba(10, 10, 10, 0.5)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 4,
          padding: '14px 22px',
          borderLeft: `3px solid ${colorAccent}`,
          minWidth: 200,
        }}
      >
        {/* Label */}
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 3,
            color: COLORS.textMuted,
            marginBottom: 6,
          }}
        >
          Song DNA
        </div>

        {/* Main stat */}
        <div
          style={{
            fontFamily: FONTS.heading,
            fontSize: 26,
            fontWeight: 700,
            color: COLORS.text,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
            marginBottom: 4,
          }}
        >
          Played {timesPlayed} times
        </div>

        {/* Date range */}
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 16,
            fontWeight: 400,
            color: COLORS.textMuted,
            marginBottom: rank ? 4 : 0,
          }}
        >
          {firstPlayed} &mdash; {lastPlayed}
        </div>

        {/* Rank */}
        {rank && (
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: 13,
              fontWeight: 400,
              color: colorAccent,
            }}
          >
            {rank}
          </div>
        )}
      </div>
    </div>
  );
};
