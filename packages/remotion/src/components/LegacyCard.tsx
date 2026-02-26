import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../styles/themes';
import { CINEMA_FONTS } from '../styles/fonts';

interface LegacyCardProps {
  /** Main legacy/impact statement (1-3 sentences) */
  statement: string;
  /** Optional attribution or source */
  attribution?: string;
  /** Accent color for decorative elements */
  accentColor?: string;
}

/**
 * Legacy Card — full-screen cinematic impact statement.
 *
 * The final emotional beat before credits. Shows a single powerful
 * statement about the show's cultural legacy, set in elegant display
 * serif on a dark background with subtle grain texture.
 *
 * HBO's "Long Strange Trip" ends with exactly this kind of card.
 */
export const LegacyCard: React.FC<LegacyCardProps> = ({
  statement,
  attribution,
  accentColor = COLORS.accent,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Slow, dignified fade-in
  const textOpacity = interpolate(
    frame,
    [30, 90],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Accent bar spring
  const barProgress = spring({
    frame: Math.max(0, frame - 60),
    fps,
    config: { damping: 20, mass: 1.0, stiffness: 60 },
  });

  // Attribution fade
  const attrOpacity = interpolate(
    frame,
    [100, 140],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Fade out
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 45, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

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
      {/* Subtle radial warmth */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 50% 40% at 50% 50%, rgba(40,30,20,0.4) 0%, transparent 100%)`,
        }}
      />

      <div
        style={{
          maxWidth: 1000,
          textAlign: 'center',
          padding: '0 80px',
          opacity: textOpacity,
        }}
      >
        {/* Statement */}
        <div
          style={{
            fontFamily: CINEMA_FONTS.display,
            fontSize: 38,
            fontWeight: 400,
            fontStyle: 'italic',
            color: COLORS.text,
            lineHeight: 1.6,
            letterSpacing: 0.5,
          }}
        >
          {statement}
        </div>

        {/* Accent bar */}
        <div
          style={{
            width: barProgress * 80,
            height: 2,
            backgroundColor: accentColor,
            margin: '40px auto',
            opacity: barProgress,
          }}
        />

        {/* Attribution */}
        {attribution && (
          <div
            style={{
              fontFamily: CINEMA_FONTS.sans,
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: COLORS.textMuted,
              opacity: attrOpacity,
            }}
          >
            {attribution}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
