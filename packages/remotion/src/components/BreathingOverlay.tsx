import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

interface BreathingOverlayProps {
  /** Number of frames for the breathing window at end of scene */
  breathingFrames: number;
}

/**
 * Subtle vignette overlay that fades in during the breathing window
 * at the end of a scene. Almost subliminal — felt more than seen.
 * Placed inside the scene's Sequence so useVideoConfig().durationInFrames
 * gives the scene duration.
 */
export const BreathingOverlay: React.FC<BreathingOverlayProps> = ({
  breathingFrames,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Active window: last `breathingFrames` frames of the scene
  const windowStart = durationInFrames - breathingFrames;

  // Only render during the breathing window
  if (frame < windowStart) {
    return null;
  }

  // Gentle vignette fading in from 0 to ~0.15 opacity
  const vignetteOp = interpolate(
    frame,
    [windowStart, durationInFrames],
    [0, 0.15],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignetteOp}) 100%)`,
        pointerEvents: 'none',
      }}
    />
  );
};
