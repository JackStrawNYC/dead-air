import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles/themes';

interface CinematicLowerThirdProps {
  title: string;
  subtitle?: string;
  colorAccent?: string;
  /** Frame to begin entrance (default: 0) */
  showAt?: number;
  /** Frame to begin exit (default: 120 = 4s) */
  hideAt?: number;
  /** Normalized energy 0-1 for reactive accent bar */
  currentEnergy?: number;
}

/**
 * Cinematic lower-third with frosted glass backdrop, spring animation,
 * and energy-reactive accent bar. Replaces SongMetadata with a more
 * cinematic presentation.
 *
 * Features:
 * - Spring-animated slide-in from left
 * - Frosted glass (backdrop-filter: blur) card
 * - Energy-reactive accent bar width + glow
 * - Re-appears near end of segment for callback
 */
export const CinematicLowerThird: React.FC<CinematicLowerThirdProps> = ({
  title,
  subtitle,
  colorAccent = COLORS.accent,
  showAt = 0,
  hideAt = 120,
  currentEnergy,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Entrance spring
  const enterFrame = Math.max(0, frame - showAt);
  const slideProgress = spring({
    frame: enterFrame,
    fps,
    config: { damping: 18, mass: 0.6, stiffness: 100 },
  });

  // Exit fade
  const exitOpacity = interpolate(
    frame,
    [hideAt - 15, hideAt],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Re-appear near end
  const endOpacity = durationInFrames > 180
    ? interpolate(
        frame,
        [durationInFrames - 120, durationInFrames - 90, durationInFrames - 30, durationInFrames],
        [0, 0.7, 0.7, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 0;

  const inShowWindow = frame >= showAt && frame <= hideAt;
  const inEndWindow = endOpacity > 0;
  if (!inShowWindow && !inEndWindow) return null;

  const opacity = inShowWindow ? Math.min(slideProgress, exitOpacity) : endOpacity;
  const slideX = inShowWindow ? (1 - slideProgress) * -40 : 0;

  // Energy-reactive accent bar
  const barWidth = currentEnergy != null ? 3 + currentEnergy * 2 : 3;
  const barGlow = currentEnergy != null && currentEnergy > 0.7
    ? `0 0 ${8 + currentEnergy * 12}px ${colorAccent}`
    : 'none';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: 80,
        opacity,
        transform: `translateX(${slideX}px)`,
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          width: barWidth,
          backgroundColor: colorAccent,
          borderRadius: 1,
          boxShadow: barGlow,
          marginRight: 16,
          minHeight: 48,
        }}
      />
      {/* Frosted glass card */}
      <div
        style={{
          background: 'rgba(10, 10, 10, 0.5)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 4,
          padding: '12px 20px',
        }}
      >
        {subtitle && (
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 3,
              color: COLORS.textMuted,
              marginBottom: 4,
            }}
          >
            {subtitle}
          </div>
        )}
        <div
          style={{
            fontFamily: FONTS.heading,
            fontSize: 28,
            fontWeight: 700,
            color: COLORS.text,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
          }}
        >
          {title}
        </div>
      </div>
    </div>
  );
};
