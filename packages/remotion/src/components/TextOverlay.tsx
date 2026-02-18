import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, EASE, FONTS } from '../styles/themes';

interface TextOverlayProps {
  text: string;
  style: 'fact' | 'quote' | 'analysis' | 'transition';
  startFrame: number;
  durationInFrames: number;
  colorAccent?: string;
}

const ENTER = 15;
const EXIT = 15;

const FROSTED_PANEL: React.CSSProperties = {
  backgroundColor: 'rgba(10, 10, 10, 0.55)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  padding: '16px 24px',
  borderRadius: 8,
};

export const TextOverlay: React.FC<TextOverlayProps> = ({
  text,
  style,
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

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: 120,
    right: 120,
    bottom: 160,
    opacity,
    transform: `translateY(${slideY}px)`,
    color: COLORS.text,
    textShadow: '0 2px 12px rgba(0,0,0,0.8)',
  };

  if (style === 'fact') {
    return (
      <div style={baseStyle}>
        <div style={{ width: 60, height: 3, backgroundColor: colorAccent, marginBottom: 16 }} />
        <div
          style={{
            ...FROSTED_PANEL,
            fontFamily: FONTS.body,
            fontSize: 42,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 2,
            lineHeight: 1.3,
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  if (style === 'quote') {
    const words = text.split(/\s+/);
    return (
      <div style={{ ...baseStyle, textAlign: 'center', left: 200, right: 200 }}>
        <div
          style={{
            ...FROSTED_PANEL,
            padding: '24px 32px',
            display: 'inline-block',
            fontFamily: FONTS.heading,
            fontSize: 48,
            fontStyle: 'italic',
            lineHeight: 1.4,
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
      </div>
    );
  }

  if (style === 'analysis') {
    return (
      <div style={baseStyle}>
        <div
          style={{
            ...FROSTED_PANEL,
            fontFamily: FONTS.body,
            fontSize: 38,
            fontWeight: 400,
            lineHeight: 1.5,
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  // transition — no backing panel (stays clean and cinematic)
  return (
    <div
      style={{
        ...baseStyle,
        top: '50%',
        bottom: 'auto',
        transform: `translateY(calc(-50% + ${slideY}px))`,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: FONTS.heading,
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: 4,
        }}
      >
        {text}
      </div>
    </div>
  );
};
