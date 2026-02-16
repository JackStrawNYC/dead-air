import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles/themes';
import { AnimatedTitle } from '../components/AnimatedTitle';
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
        <AnimatedTitle
          text={channelName}
          variant="scale_in"
          fontSize={80}
          fontFamily={FONTS.body}
          color={COLORS.text}
        />

        {/* Accent bar */}
        <div
          style={{
            width: barWidth,
            height: 3,
            backgroundColor: COLORS.accent,
            margin: '24px auto',
          }}
        />

        {/* Subscribe CTA */}
        <div
          style={{
            opacity: ctaOpacity,
            fontFamily: FONTS.body,
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 4,
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
                fontFamily: FONTS.body,
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: 3,
                textTransform: 'uppercase',
                color: COLORS.textMuted,
                marginBottom: 8,
              }}
            >
              {nextEpisodeDate ? `Next — ${nextEpisodeDate}` : 'Next Episode'}
            </div>
            <div
              style={{
                fontFamily: FONTS.heading,
                fontSize: 36,
                fontWeight: 700,
                color: COLORS.accent,
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
