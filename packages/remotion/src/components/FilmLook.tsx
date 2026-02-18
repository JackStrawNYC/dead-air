import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

interface FilmLookProps {
  /** Lift black floor intensity 0-1 (default: 0.5) */
  liftIntensity?: number;
  /** Halation bloom intensity 0-1 (default: 0.4) */
  halationIntensity?: number;
  /** Enable highlight rolloff (default: true) */
  highlightRolloff?: boolean;
}

/**
 * Film-like tonal processing overlay.
 *
 * 1. Lifted blacks: Floor at ~RGB(10,10,14). Never crush to pure black.
 * 2. Halation: Warm amber bloom simulating film light scatter.
 * 3. Highlight rolloff: Gentle compression of brightest values.
 */
export const FilmLook: React.FC<FilmLookProps> = ({
  liftIntensity = 0.5,
  halationIntensity = 0.4,
  highlightRolloff = true,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Gentle fade in/out
  const fade = interpolate(frame, [0, 15, durationInFrames - 15, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const liftAlpha = 0.12 * liftIntensity * fade;
  const halationAlpha = 0.025 * halationIntensity * fade;
  const warmAlpha = 0.015 * halationIntensity * fade;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 90 }}>
      {/* Lifted blacks — prevents crushing to pure black */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(10, 10, 14, ${liftAlpha})`,
          mixBlendMode: 'lighten',
        }}
      />

      {/* Halation — warm bloom simulating film light scatter */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(
            ellipse 80% 70% at 50% 45%,
            rgba(201, 168, 76, ${halationAlpha}) 0%,
            rgba(180, 140, 60, ${halationAlpha * 0.5}) 40%,
            transparent 75%
          )`,
          mixBlendMode: 'screen',
        }}
      />

      {/* Subtle warm tint — film warmth in highlights */}
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(255, 240, 220, ${warmAlpha})`,
          mixBlendMode: 'screen',
        }}
      />

      {/* Highlight rolloff — gentle darkening to prevent hard clipping */}
      {highlightRolloff && (
        <AbsoluteFill
          style={{
            backgroundColor: `rgba(0, 0, 0, ${0.02 * fade})`,
            mixBlendMode: 'color-burn',
          }}
        />
      )}
    </AbsoluteFill>
  );
};
