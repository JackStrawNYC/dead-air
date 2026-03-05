/**
 * CrowdOverlay — warm radial glow during detected crowd noise moments.
 *
 * Shows a radial gradient from bottom-center when the crowd roars.
 * 30-frame fade in/out at moment boundaries, max opacity 0.35.
 * Palette-locked hue for visual consistency.
 */

import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import type { CrowdMoment } from "../data/crowd-detector";
import { useSongPalette } from "../data/SongPaletteContext";

const FADE_FRAMES = 30;
const MAX_OPACITY = 0.35;

interface Props {
  moments: CrowdMoment[];
}

export const CrowdOverlay: React.FC<Props> = ({ moments }) => {
  const frame = useCurrentFrame();
  const palette = useSongPalette();

  // Find active crowd moment (if any)
  let momentOpacity = 0;
  let intensity = 0;

  for (const m of moments) {
    if (frame >= m.frameStart - FADE_FRAMES && frame < m.frameEnd + FADE_FRAMES) {
      const fadeIn = interpolate(
        frame,
        [m.frameStart - FADE_FRAMES, m.frameStart],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      const fadeOut = interpolate(
        frame,
        [m.frameEnd, m.frameEnd + FADE_FRAMES],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      momentOpacity = Math.max(momentOpacity, Math.min(fadeIn, fadeOut));
      intensity = Math.max(intensity, m.avgIntensity);
    }
  }

  if (momentOpacity < 0.01) return null;

  const hue = palette?.primary ?? 30; // Warm amber fallback
  const opacity = momentOpacity * MAX_OPACITY * Math.min(1, intensity * 2);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(ellipse 120% 80% at 50% 100%, hsla(${hue}, 70%, 50%, ${opacity}), transparent 70%)`,
        pointerEvents: "none",
      }}
    />
  );
};
