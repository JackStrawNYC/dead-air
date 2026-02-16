import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../styles/themes';
import { AnimatedTitle } from '../components/AnimatedTitle';

interface ChapterCardProps {
  title: string;
  subtitle?: string;
  colorAccent?: string;
}

export const ChapterCard: React.FC<ChapterCardProps> = ({
  title,
  subtitle,
  colorAccent = COLORS.accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const barProgress = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.7, stiffness: 100 },
  });
  const barWidth = barProgress * 200;

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
        gap: 16,
      }}
    >
      <AnimatedTitle text={title} variant="slide_up" fontSize={56} />
      <div
        style={{
          width: barWidth,
          height: 3,
          backgroundColor: colorAccent,
          marginTop: 8,
        }}
      />
      {subtitle && (
        <AnimatedTitle
          text={subtitle}
          variant="fade_in"
          fontSize={24}
          color={COLORS.textMuted}
          startFrame={10}
        />
      )}
    </div>
  );
};
