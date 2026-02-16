import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles/themes';

interface SongMetadataProps {
  songName: string;
  durationInFrames: number;
  currentEnergy?: number;
}

export const SongMetadata: React.FC<SongMetadataProps> = ({
  songName,
  durationInFrames,
  currentEnergy,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, 20, 90, 120],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Spring-based slide in instead of linear
  const slideProgress = spring({
    frame,
    fps,
    config: { damping: 18, mass: 0.6, stiffness: 100 },
  });
  const slideX = (1 - slideProgress) * -30;

  // Subtle re-appear near the end
  const endOpacity = durationInFrames > 180
    ? interpolate(
        frame,
        [durationInFrames - 120, durationInFrames - 90, durationInFrames - 30, durationInFrames],
        [0, 0.6, 0.6, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 0;

  const combinedOpacity = Math.max(opacity, endOpacity);

  // Energy-reactive accent bar
  const barHeight = currentEnergy != null ? 48 + currentEnergy * 16 : 48;
  const barOpacity = currentEnergy != null ? 0.8 + currentEnergy * 0.2 : 1;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: 80,
        opacity: combinedOpacity,
        transform: `translateX(${slideX}px)`,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 4,
          height: barHeight,
          backgroundColor: COLORS.accent,
          borderRadius: 2,
          opacity: barOpacity,
        }}
      />
      <div>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 14,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 3,
            color: COLORS.textMuted,
          }}
        >
          Now Playing
        </div>
        <div
          style={{
            fontFamily: FONTS.heading,
            fontSize: 32,
            fontWeight: 700,
            color: COLORS.text,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
          }}
        >
          {songName}
        </div>
      </div>
    </div>
  );
};
