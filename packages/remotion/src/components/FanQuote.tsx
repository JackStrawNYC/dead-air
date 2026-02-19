import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, EASE, FONTS } from '../styles/themes';

export interface FanQuoteProps {
  text: string;
  reviewer: string;
  startFrame: number;
  durationInFrames: number;
  colorAccent?: string;
}

const ENTER = 15;
const EXIT = 15;

export const FanQuote: React.FC<FanQuoteProps> = ({
  text,
  reviewer,
  startFrame,
  durationInFrames,
  colorAccent = COLORS.accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  if (local < 0 || local > durationInFrames) return null;

  const holdEnd = durationInFrames - EXIT;
  const opacity = interpolate(
    local,
    [0, ENTER, holdEnd, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(...EASE.smooth) },
  );

  const slideY = interpolate(local, [0, ENTER], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(...EASE.out),
  });

  // Staggered word animation
  const words = text.split(/\s+/);

  return (
    <div
      style={{
        position: 'absolute',
        left: 120,
        right: 120,
        bottom: 200,
        opacity,
        transform: `translateY(${slideY}px)`,
        textAlign: 'center',
        zIndex: 10,
      }}
    >
      <div
        style={{
          background: 'rgba(10, 10, 10, 0.55)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRadius: 8,
          padding: '24px 32px 16px',
          display: 'inline-block',
          borderLeft: `3px solid ${colorAccent}`,
        }}
      >
        {/* Quote text with staggered word animation */}
        <div
          style={{
            fontFamily: FONTS.heading,
            fontSize: 40,
            fontStyle: 'italic',
            lineHeight: 1.4,
            color: COLORS.text,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
          }}
        >
          <span>&ldquo;</span>
          {words.map((word, wi) => {
            const delay = wi * 3;
            const wordProgress = spring({
              frame: Math.max(0, local - delay),
              fps,
              config: { damping: 20, mass: 0.5, stiffness: 120 },
            });
            const wordSlide = (1 - wordProgress) * 15;
            return (
              <span
                key={wi}
                style={{
                  display: 'inline-block',
                  opacity: wordProgress,
                  transform: `translateY(${wordSlide}px)`,
                  marginRight: '0.3em',
                }}
              >
                {word}
              </span>
            );
          })}
          <span>&rdquo;</span>
        </div>

        {/* Attribution */}
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 18,
            fontWeight: 400,
            color: COLORS.textMuted,
            marginTop: 10,
            textAlign: 'right',
          }}
        >
          &mdash; {reviewer}, archive.org
        </div>
      </div>
    </div>
  );
};
