/**
 * CrowdOverlay — visual treatments for crowd energy moments.
 *
 * 4 event types with distinct visual treatments:
 *   applause:  warm radial glow from bottom-center
 *   roar:      shockwave ring expanding inward from edges
 *   holy_shit: 2-frame white flash + palette shift signal
 *   singalong: warm amber overlay rising from bottom edge
 */

import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
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

  const layers: React.ReactNode[] = [];

  for (const m of moments) {
    if (frame < m.frameStart - FADE_FRAMES || frame >= m.frameEnd + FADE_FRAMES) continue;

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
    const momentOpacity = Math.min(fadeIn, fadeOut);
    if (momentOpacity < 0.01) continue;

    const hue = palette?.primary ?? 30;
    const intensity = Math.min(1, m.avgIntensity * 2);

    switch (m.type) {
      case "applause": {
        // Warm radial glow from bottom-center
        const opacity = momentOpacity * MAX_OPACITY * intensity;
        layers.push(
          <div
            key={`applause-${m.frameStart}`}
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse 120% 80% at 50% 100%, hsla(${hue}, 70%, 50%, ${opacity}), transparent 70%)`,
              pointerEvents: "none",
            }}
          />,
        );
        break;
      }

      case "roar": {
        // Shockwave ring from edges inward over 15 frames
        const eventProgress = interpolate(
          frame,
          [m.frameStart, m.frameStart + 15],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const ringSize = 150 - eventProgress * 100; // 150% → 50%
        const ringOpacity = momentOpacity * 0.5 * intensity * (1 - eventProgress * 0.5);
        layers.push(
          <div
            key={`roar-${m.frameStart}`}
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse ${ringSize}% ${ringSize}% at 50% 50%, transparent 60%, hsla(${hue}, 80%, 60%, ${ringOpacity}) 75%, transparent 90%)`,
              pointerEvents: "none",
            }}
          />,
        );
        break;
      }

      case "holy_shit": {
        // White flash (2 frames) + brightness shift
        const flashProgress = frame - m.peakFrame;
        let flashOpacity = 0;
        if (flashProgress === 0) flashOpacity = 0.3;
        else if (flashProgress === 1) flashOpacity = 0.15;

        if (flashOpacity > 0) {
          layers.push(
            <div
              key={`holyshit-flash-${m.frameStart}`}
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: `rgba(255, 255, 255, ${flashOpacity})`,
                pointerEvents: "none",
              }}
            />,
          );
        }

        // Warm glow aftermath (longer duration)
        const afterGlow = interpolate(
          frame,
          [m.peakFrame + 2, m.frameEnd],
          [0.4, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
        );
        if (afterGlow > 0.01) {
          layers.push(
            <div
              key={`holyshit-glow-${m.frameStart}`}
              style={{
                position: "absolute",
                inset: 0,
                background: `radial-gradient(circle at 50% 50%, hsla(${(hue + 30) % 360}, 90%, 60%, ${afterGlow * intensity}), transparent 80%)`,
                pointerEvents: "none",
              }}
            />,
          );
        }
        break;
      }

      case "singalong": {
        // Warm amber palette shift from bottom edge
        const warmHue = 35; // amber
        const opacity = momentOpacity * 0.25 * intensity;
        const glowHeight = 30 + momentOpacity * 20; // 30-50% from bottom
        layers.push(
          <div
            key={`singalong-${m.frameStart}`}
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(to top, hsla(${warmHue}, 75%, 55%, ${opacity}) 0%, hsla(${warmHue}, 60%, 50%, ${opacity * 0.3}) ${glowHeight}%, transparent ${glowHeight + 20}%)`,
              pointerEvents: "none",
            }}
          />,
        );
        break;
      }
    }
  }

  if (layers.length === 0) return null;

  return <>{layers}</>;
};
