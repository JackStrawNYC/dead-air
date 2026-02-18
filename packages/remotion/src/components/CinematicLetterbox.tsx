import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

interface CinematicLetterboxProps {
  /** Target aspect ratio (default: 2.39 = anamorphic widescreen) */
  aspectRatio?: number;
  /** Frames to fade bars in at composition start (default: 45 = 1.5s) */
  fadeInFrames?: number;
}

/**
 * Cinematic letterbox bars — instant cinema feel.
 *
 * Renders top/bottom black bars to crop 16:9 to the target aspect ratio.
 * 2.39:1 = ~138px bars on 1080p (anamorphic widescreen, HBO/Netflix standard).
 *
 * Bars fade in over the first 1.5s to avoid jarring appearance.
 * z-index: 999 so they sit above everything except dev overlays.
 */
export const CinematicLetterbox: React.FC<CinematicLetterboxProps> = ({
  aspectRatio = 2.39,
  fadeInFrames = 45,
}) => {
  const frame = useCurrentFrame();

  const frameAspect = 16 / 9;
  if (aspectRatio <= frameAspect) return null;

  // Bar height as percentage of frame height
  const barPercent = ((1 - frameAspect / aspectRatio) / 2) * 100;

  // Fade in from 0 to 1
  const opacity = interpolate(frame, [0, fadeInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 999 }}>
      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: `${barPercent}%`,
          backgroundColor: '#000000',
          opacity,
        }}
      />
      {/* Bottom bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: `${barPercent}%`,
          backgroundColor: '#000000',
          opacity,
        }}
      />
    </AbsoluteFill>
  );
};
