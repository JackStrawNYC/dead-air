import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../styles/themes';
import { CINEMA_FONTS } from '../styles/fonts';
import { FilmGrain } from '../components/FilmGrain';

interface EndScreenProps {
  nextEpisodeTitle?: string;
  nextEpisodeDate?: string;
  channelName?: string;
}

export const EndScreen: React.FC<EndScreenProps> = ({
  nextEpisodeTitle,
  nextEpisodeDate,
  channelName = 'DEAD AIR',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Accent bar spring animation
  const barProgress = spring({
    frame: Math.max(0, frame - 30),
    fps,
    config: { damping: 14, mass: 0.8, stiffness: 80 },
  });
  const barWidth = barProgress * 200;

  const ctaOpacity = interpolate(frame, [60, 90], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const nextOpacity = interpolate(frame, [120, 150], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const fadeOut = interpolate(frame, [durationInFrames - 30, durationInFrames], [1, 0], {
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
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: `radial-gradient(ellipse at center, #1a1a1a 0%, ${COLORS.bg} 70%)`,
        opacity: fadeOut,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {/* Channel name in display serif */}
        <div
          style={{
            fontFamily: CINEMA_FONTS.display,
            fontSize: 80,
            fontWeight: 700,
            letterSpacing: 8,
            textTransform: 'uppercase',
            color: COLORS.text,
            opacity: interpolate(frame, [10, 40], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          {channelName}
        </div>

        {/* Accent bar */}
        <div
          style={{
            width: barWidth,
            height: 2,
            backgroundColor: COLORS.accent,
            margin: '24px auto',
          }}
        />

        {/* Subscribe CTA */}
        <div
          style={{
            opacity: ctaOpacity,
            fontFamily: CINEMA_FONTS.sans,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 5,
            textTransform: 'uppercase',
            color: COLORS.textMuted,
            marginTop: 16,
          }}
        >
          Subscribe for more
        </div>

        {/* Next episode tease */}
        {nextEpisodeTitle && (
          <div
            style={{
              opacity: nextOpacity,
              marginTop: 60,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: CINEMA_FONTS.sans,
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: 4,
                textTransform: 'uppercase',
                color: COLORS.textMuted,
                marginBottom: 12,
              }}
            >
              {nextEpisodeDate ? `Next — ${nextEpisodeDate}` : 'Next Episode'}
            </div>
            <div
              style={{
                fontFamily: CINEMA_FONTS.display,
                fontSize: 36,
                fontWeight: 700,
                color: COLORS.accent,
                letterSpacing: 1,
              }}
            >
              {nextEpisodeTitle}
            </div>
          </div>
        )}
      </div>
      <FilmGrain intensity={0.06} />
    </div>
  );
};
