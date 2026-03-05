/**
 * RoseOverlay — American Beauty rose, slow bloom animation.
 * Grows from center with petals unfolding over time.
 * Energy-reactive glow, palette-locked colors.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useSongPalette } from "../data/SongPaletteContext";
import { useTempoFactor } from "../data/TempoContext";

interface Props {
  frames: EnhancedFrameData[];
}

export const RoseOverlay: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const palette = useSongPalette();
  const tempoFactor = useTempoFactor();

  const baseSize = Math.min(width, height) * 0.2;

  // Slow bloom cycle — opens and closes over ~20s
  const bloomCycle = (frame / 30 / 20) * tempoFactor;
  const bloomPhase = (Math.sin(bloomCycle * Math.PI * 2) + 1) / 2; // 0-1

  // Scale: bloom state + energy breathing
  const scale = 0.6 + bloomPhase * 0.4 + snap.energy * 0.1;

  // Opacity: subtle presence, energy reactive
  const opacity = interpolate(snap.energy, [0.03, 0.25], [0.15, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow rotation
  const rotation = (frame / 30) * 2 * tempoFactor;

  // Rose red (shifted toward palette)
  const roseHue = (0 + palette.primary * 0.2) % 360; // Blend toward palette
  const petalColor = `hsl(${roseHue}, 70%, 45%)`;
  const innerColor = `hsl(${(roseHue + 15) % 360}, 80%, 55%)`;
  const glowColor = `hsl(${roseHue}, 60%, 40%)`;

  // Number of visible petals (bloom state drives this)
  const petalCount = Math.floor(bloomPhase * 5) + 3; // 3-8 petals

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transform: `rotate(${rotation}deg) scale(${scale})`,
          opacity,
          filter: `drop-shadow(0 0 25px ${glowColor})`,
          willChange: "transform, opacity",
        }}
      >
        <svg width={baseSize} height={baseSize} viewBox="0 0 200 200" fill="none">
          {/* Petals arranged in a circle */}
          {Array.from({ length: petalCount }, (_, i) => {
            const angle = (i / petalCount) * 360;
            const petalOpacity = interpolate(
              i,
              [0, petalCount - 1],
              [1, 0.5 + bloomPhase * 0.5],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            return (
              <ellipse
                key={i}
                cx="100"
                cy="60"
                rx="22"
                ry="40"
                fill={petalColor}
                opacity={petalOpacity}
                transform={`rotate(${angle} 100 100)`}
              />
            );
          })}
          {/* Inner petals — smaller, brighter */}
          {Array.from({ length: Math.max(3, petalCount - 2) }, (_, i) => {
            const angle = (i / (petalCount - 2)) * 360 + 20;
            return (
              <ellipse
                key={`inner-${i}`}
                cx="100"
                cy="72"
                rx="14"
                ry="28"
                fill={innerColor}
                opacity={0.7}
                transform={`rotate(${angle} 100 100)`}
              />
            );
          })}
          {/* Center */}
          <circle cx="100" cy="100" r="12" fill={innerColor} opacity="0.8" />
          <circle cx="100" cy="100" r="6" fill={petalColor} opacity="0.9" />
        </svg>
      </div>
    </div>
  );
};
