import React from 'react';
import { Img, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

interface ParallaxBgProps {
  /** Background image path */
  image: string;
  /** Background layer scroll speed multiplier (default: 0.4) */
  bgSpeed?: number;
  /** Foreground layer scroll speed multiplier (default: 1.8) */
  fgSpeed?: number;
  /** Overall speed multiplier for mood-aware velocity (default: 1.0) */
  speedMultiplier?: number;
  children?: React.ReactNode;
}

/**
 * Depth-separated parallax background.
 *
 * Renders the background image at a slower pan rate than the foreground
 * content, creating the perception of depth. The background layer
 * moves at 0.4x and foreground at 1.8x the base speed.
 *
 * This is a significant upgrade over flat KenBurns for context segments
 * where creating depth from static photos sells production value.
 */
export const ParallaxBg: React.FC<ParallaxBgProps> = ({
  image,
  bgSpeed = 0.4,
  fgSpeed = 1.8,
  speedMultiplier = 1.0,
  children,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = frame / durationInFrames;

  // Background: slow pan right + gentle zoom
  const bgPanX = progress * 3 * bgSpeed * speedMultiplier;
  const bgZoom = 1.05 + progress * 0.05 * bgSpeed * speedMultiplier;

  // Foreground: faster parallax offset
  const fgPanX = progress * 3 * fgSpeed * speedMultiplier;

  // Fade in
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* Background layer — slow */}
      <Img
        src={staticFile(image)}
        delayRenderTimeoutInMilliseconds={120_000}
        style={{
          position: 'absolute',
          width: '120%',
          height: '120%',
          top: '-10%',
          left: '-10%',
          objectFit: 'cover',
          transform: `scale(${bgZoom}) translateX(${bgPanX}%)`,
          opacity,
          willChange: 'transform',
        }}
      />
      {/* Foreground content — faster parallax */}
      {children && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translateX(${fgPanX * 0.3}px)`,
            willChange: 'transform',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};
