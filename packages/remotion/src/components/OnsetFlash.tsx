import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

interface OnsetFlashProps {
  /** Onset timings in frames (converted from librosa seconds) */
  onsetFrames: number[];
  /** Accent color for tinted flash */
  accentColor?: string;
  /** Flash duration in frames (default: 3) */
  flashDuration?: number;
  /** Maximum flash opacity (default: 0.15) */
  maxOpacity?: number;
}

/**
 * Onset Flash — radial light burst timed to strong audio onsets.
 *
 * Uses onset data from librosa's onset_detect() to trigger brief
 * visual impacts synced to actual musical events (drum hits, note attacks).
 *
 * Each onset triggers a 3-frame flash:
 * - Frame 0: instant full brightness
 * - Frame 1: 50% brightness
 * - Frame 2: 20% brightness
 * - Frame 3+: gone
 *
 * Multiple onsets blend naturally via screen blend mode.
 */
export const OnsetFlash: React.FC<OnsetFlashProps> = ({
  onsetFrames,
  accentColor = '#d4a853',
  flashDuration = 3,
  maxOpacity = 0.15,
}) => {
  const frame = useCurrentFrame();

  // Find nearest onset within flash window
  let flashIntensity = 0;

  for (const onset of onsetFrames) {
    const delta = frame - onset;
    if (delta >= 0 && delta < flashDuration) {
      // Exponential decay: 1.0 → 0.5 → 0.25 → ...
      const decay = Math.pow(0.4, delta);
      flashIntensity = Math.max(flashIntensity, decay);
    }
    // Early exit: onsets are sorted, no need to check past our window
    if (onset > frame + 1) break;
  }

  if (flashIntensity < 0.01) return null;

  const opacity = flashIntensity * maxOpacity;

  // Parse accent color
  const r = parseInt(accentColor.slice(1, 3), 16) || 255;
  const g = parseInt(accentColor.slice(3, 5), 16) || 255;
  const b = parseInt(accentColor.slice(5, 7), 16) || 255;

  // Blend with white for the flash (70% white, 30% accent)
  const fr = Math.round(255 * 0.7 + r * 0.3);
  const fg = Math.round(255 * 0.7 + g * 0.3);
  const fb = Math.round(255 * 0.7 + b * 0.3);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Central radial burst */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(
            ellipse 60% 50% at 50% 50%,
            rgba(${fr}, ${fg}, ${fb}, ${opacity}) 0%,
            rgba(${fr}, ${fg}, ${fb}, ${opacity * 0.3}) 40%,
            transparent 80%
          )`,
          mixBlendMode: 'screen',
        }}
      />
      {/* Horizontal light streak (stage lighting feel) */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(
            to right,
            transparent 10%,
            rgba(${fr}, ${fg}, ${fb}, ${opacity * 0.15}) 30%,
            rgba(${fr}, ${fg}, ${fb}, ${opacity * 0.25}) 50%,
            rgba(${fr}, ${fg}, ${fb}, ${opacity * 0.15}) 70%,
            transparent 90%
          )`,
          mixBlendMode: 'screen',
        }}
      />
    </AbsoluteFill>
  );
};
