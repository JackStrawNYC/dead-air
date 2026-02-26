import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../styles/themes';
import { CINEMA_FONTS } from '../styles/fonts';
import { FilmGrain } from '../components/FilmGrain';

interface ChapterCardProps {
  title: string;
  subtitle?: string;
  colorAccent?: string;
  /** Optional act number badge (e.g., "I", "II", "III") */
  actNumber?: string;
}

/**
 * Chapter Card — HBO-quality act/chapter title card.
 *
 * Multi-layer design:
 * 1. Dark background with subtle radial warmth
 * 2. Thin horizontal rules that spring outward
 * 3. Act number badge (small, uppercase, accented)
 * 4. Chapter title in display serif
 * 5. Subtitle in clean sans
 * 6. Film grain overlay for texture
 *
 * Much more sophisticated than a centered fade-in.
 * The horizontal rules and staggered animation give it
 * the feeling of a premium title card reveal.
 */
export const ChapterCard: React.FC<ChapterCardProps> = ({
  title,
  subtitle,
  colorAccent = COLORS.accent,
  actNumber,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Staggered spring animations
  const ruleProgress = spring({
    frame,
    fps,
    config: { damping: 18, mass: 0.6, stiffness: 100 },
  });

  const badgeProgress = spring({
    frame: Math.max(0, frame - 6),
    fps,
    config: { damping: 16, mass: 0.5, stiffness: 120 },
  });

  const titleProgress = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 14, mass: 0.7, stiffness: 80 },
  });

  const subtitleProgress = spring({
    frame: Math.max(0, frame - 18),
    fps,
    config: { damping: 16, mass: 0.6, stiffness: 90 },
  });

  // Fade out
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const ruleWidth = ruleProgress * 300;
  const titleY = interpolate(titleProgress, [0, 1], [20, 0]);
  const subtitleY = interpolate(subtitleProgress, [0, 1], [12, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut,
      }}
    >
      {/* Subtle radial warmth behind text */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 40% 35% at 50% 48%, rgba(60,45,25,0.3) 0%, transparent 100%)`,
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
        }}
      >
        {/* Act number badge */}
        {actNumber && (
          <div
            style={{
              fontFamily: CINEMA_FONTS.sans,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: colorAccent,
              opacity: badgeProgress,
              marginBottom: 20,
              transform: `translateY(${interpolate(badgeProgress, [0, 1], [10, 0])}px)`,
            }}
          >
            {actNumber}
          </div>
        )}

        {/* Top rule */}
        <div
          style={{
            width: ruleWidth,
            height: 1,
            backgroundColor: colorAccent,
            opacity: ruleProgress * 0.6,
            marginBottom: 28,
          }}
        />

        {/* Title */}
        <div
          style={{
            fontFamily: CINEMA_FONTS.display,
            fontSize: 64,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: 3,
            textTransform: 'uppercase',
            opacity: titleProgress,
            transform: `translateY(${titleY}px)`,
          }}
        >
          {title}
        </div>

        {/* Bottom rule */}
        <div
          style={{
            width: ruleWidth * 0.6,
            height: 1,
            backgroundColor: colorAccent,
            opacity: ruleProgress * 0.4,
            marginTop: 24,
            marginBottom: subtitle ? 20 : 0,
          }}
        />

        {/* Subtitle */}
        {subtitle && (
          <div
            style={{
              fontFamily: CINEMA_FONTS.serif,
              fontSize: 22,
              fontWeight: 400,
              fontStyle: 'italic',
              color: COLORS.textMuted,
              letterSpacing: 1,
              opacity: subtitleProgress,
              transform: `translateY(${subtitleY}px)`,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      <FilmGrain intensity={0.05} />
    </AbsoluteFill>
  );
};
