import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles/themes';

type TitleVariant = 'typewriter' | 'scale_in' | 'slide_up' | 'fade_in';

interface AnimatedTitleProps {
  text: string;
  variant?: TitleVariant;
  startFrame?: number;
  durationInFrames?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
}

export const AnimatedTitle: React.FC<AnimatedTitleProps> = ({
  text,
  variant = 'fade_in',
  startFrame = 0,
  durationInFrames: propDuration,
  fontSize = 64,
  fontFamily = FONTS.heading,
  color = COLORS.text,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames: configDuration } = useVideoConfig();
  const duration = propDuration ?? configDuration;
  const local = frame - startFrame;

  if (local < 0 || local > duration) return null;

  const baseStyle: React.CSSProperties = {
    fontFamily,
    fontSize,
    fontWeight: 700,
    color,
    textShadow: '0 2px 12px rgba(0,0,0,0.8)',
    whiteSpace: 'pre-wrap',
  };

  if (variant === 'typewriter') {
    const charsToShow = Math.floor(
      interpolate(local, [0, Math.min(duration * 0.7, text.length * 2)], [0, text.length], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }),
    );
    const fadeOut = interpolate(local, [duration - 15, duration], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

    return (
      <div style={{ ...baseStyle, opacity: fadeOut }}>
        {text.slice(0, charsToShow)}
        <span style={{ opacity: local % 16 < 8 ? 1 : 0 }}>|</span>
      </div>
    );
  }

  if (variant === 'scale_in') {
    const scale = spring({
      frame: local,
      fps,
      config: { damping: 14, mass: 0.8, stiffness: 120 },
    });
    const scaleVal = 0.8 + scale * 0.2;
    const fadeOut = interpolate(local, [duration - 15, duration], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

    return (
      <div
        style={{
          ...baseStyle,
          transform: `scale(${scaleVal})`,
          opacity: scale * fadeOut,
        }}
      >
        {text}
      </div>
    );
  }

  if (variant === 'slide_up') {
    const progress = spring({
      frame: local,
      fps,
      config: { damping: 16, mass: 0.7, stiffness: 100 },
    });
    const translateY = (1 - progress) * 40;
    const fadeOut = interpolate(local, [duration - 15, duration], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

    return (
      <div
        style={{
          ...baseStyle,
          transform: `translateY(${translateY}px)`,
          opacity: progress * fadeOut,
        }}
      >
        {text}
      </div>
    );
  }

  // fade_in
  const fadeIn = interpolate(local, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(local, [duration - 15, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ ...baseStyle, opacity: fadeIn * fadeOut }}>
      {text}
    </div>
  );
};
