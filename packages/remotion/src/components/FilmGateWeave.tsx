import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

interface FilmGateWeaveProps {
  /** Weave intensity in pixels (default: 0.5) */
  intensity?: number;
  /** Film format affects weave characteristics */
  format?: '16mm' | '35mm' | 'super8';
}

/**
 * Film Gate Weave — sub-pixel position jitter simulating projector mechanics.
 *
 * Real film projected in a cinema exhibits gate weave: the film strip
 * sits slightly differently in the gate on each frame, creating a
 * subtle organic jitter. This is one of the most subliminal yet
 * important differences between "shot on film" and digital.
 *
 * - 16mm: More pronounced weave (cheaper cameras, less precise gates)
 * - 35mm: Subtle, professional weave
 * - Super 8: Most pronounced (home movie feel)
 *
 * Uses multi-frequency sine waves for organic, non-repeating motion.
 * All values are deterministic (frame-based, no Math.random).
 */
export const FilmGateWeave: React.FC<FilmGateWeaveProps> = ({
  intensity = 0.5,
  format = '35mm',
}) => {
  const frame = useCurrentFrame();

  // Format-specific characteristics
  const formatMultiplier = {
    'super8': 2.5,
    '16mm': 1.6,
    '35mm': 1.0,
  }[format];

  const scale = intensity * formatMultiplier;

  // Multi-frequency sine waves for organic, non-repeating motion
  // X axis: horizontal weave (film sits left/right in gate)
  const weaveX =
    Math.sin(frame * 0.17) * 0.3 +
    Math.sin(frame * 0.31 + 1.2) * 0.2 +
    Math.sin(frame * 0.53 + 0.7) * 0.1;

  // Y axis: vertical weave (film pulls up/down through gate)
  const weaveY =
    Math.sin(frame * 0.13 + 0.5) * 0.25 +
    Math.sin(frame * 0.29 + 2.1) * 0.15 +
    Math.sin(frame * 0.47 + 1.4) * 0.08;

  // Rotation: very subtle tilt (film not perfectly square in gate)
  const rotation =
    Math.sin(frame * 0.11 + 0.3) * 0.015 +
    Math.sin(frame * 0.23 + 1.7) * 0.008;

  const translateX = weaveX * scale;
  const translateY = weaveY * scale;
  const rotateDeg = rotation * scale;

  return (
    <AbsoluteFill
      style={{
        transform: `translate(${translateX}px, ${translateY}px) rotate(${rotateDeg}deg)`,
        // Scale slightly up to prevent edge reveal during weave
        scale: `${1 + scale * 0.002}`,
        transformOrigin: '50% 50%',
        willChange: 'transform',
      }}
    />
  );
};

/**
 * Wrap children in film gate weave.
 * Use this to apply weave to the entire composition content.
 */
export const FilmGateWeaveWrapper: React.FC<
  FilmGateWeaveProps & { children: React.ReactNode }
> = ({ children, intensity = 0.5, format = '35mm' }) => {
  const frame = useCurrentFrame();

  const formatMultiplier = {
    'super8': 2.5,
    '16mm': 1.6,
    '35mm': 1.0,
  }[format];

  const scale = intensity * formatMultiplier;

  const weaveX =
    Math.sin(frame * 0.17) * 0.3 +
    Math.sin(frame * 0.31 + 1.2) * 0.2 +
    Math.sin(frame * 0.53 + 0.7) * 0.1;

  const weaveY =
    Math.sin(frame * 0.13 + 0.5) * 0.25 +
    Math.sin(frame * 0.29 + 2.1) * 0.15 +
    Math.sin(frame * 0.47 + 1.4) * 0.08;

  const rotation =
    Math.sin(frame * 0.11 + 0.3) * 0.015 +
    Math.sin(frame * 0.23 + 1.7) * 0.008;

  const translateX = weaveX * scale;
  const translateY = weaveY * scale;
  const rotateDeg = rotation * scale;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `translate(${translateX}px, ${translateY}px) rotate(${rotateDeg}deg) scale(${1 + scale * 0.002})`,
        transformOrigin: '50% 50%',
        willChange: 'transform',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
};
