/**
 * RainbowArc -- Classic rainbow arc across upper portion of screen.
 * 7 concentric arcs in ROYGBIV colors. Energy controls band opacity and glow.
 * Arc width pulses gently with energy. Subtle secondary rainbow (fainter,
 * reversed colors) outside the main arc. Renders continuously —
 * the overlay rotation system controls visibility via opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

// ROYGBIV colors
const RAINBOW_COLORS = [
  "#FF0000", // Red
  "#FF7700", // Orange
  "#FFFF00", // Yellow
  "#00CC00", // Green
  "#0000FF", // Blue
  "#4B0082", // Indigo
  "#8B00FF", // Violet
];

// Reversed for secondary rainbow
const SECONDARY_COLORS = [...RAINBOW_COLORS].reverse();

const ARC_BAND_WIDTH = 18;
const ARC_GAP = 3;

interface Props {
  frames: EnhancedFrameData[];
}

export const RainbowArc: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);

  const energy = snap.energy;

  // Arc center and base radius
  const centerX = width * 0.5;
  const centerY = height * 0.65;
  const baseRadius = width * 0.38;

  // Energy-driven pulse on arc width
  const widthPulse = 1 + Math.sin(frame * 0.04) * 0.08 * (1 + energy * 2);
  const bandWidth = ARC_BAND_WIDTH * widthPulse;

  // Shimmer effect
  const shimmer = 1 + Math.sin(frame * 0.07) * 0.03 + Math.sin(frame * 0.13) * 0.02;

  // Master opacity driven by energy (brighter during louder passages)
  const masterOpacity = interpolate(energy, [0.03, 0.25], [0.35, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity * shimmer,
          filter: "blur(2px)",
          mixBlendMode: "screen",
        }}
      >
        {/* Secondary rainbow (fainter, outside main) */}
        {SECONDARY_COLORS.map((color, ci) => {
          const r = baseRadius + (RAINBOW_COLORS.length + 2 + ci) * (bandWidth + ARC_GAP);
          return (
            <path
              key={`sec-${ci}`}
              d={`M ${centerX - r} ${centerY} A ${r} ${r} 0 0 1 ${centerX + r} ${centerY}`}
              stroke={color}
              strokeWidth={bandWidth * 0.7}
              fill="none"
              opacity={0.15 + energy * 0.08}
            />
          );
        })}

        {/* Main rainbow - 7 concentric arcs (outer to inner: R-O-Y-G-B-I-V) */}
        {RAINBOW_COLORS.map((color, ci) => {
          const r = baseRadius + (RAINBOW_COLORS.length - 1 - ci) * (bandWidth + ARC_GAP);

          return (
            <path
              key={`main-${ci}`}
              d={`M ${centerX - r} ${centerY} A ${r} ${r} 0 0 1 ${centerX + r} ${centerY}`}
              stroke={color}
              strokeWidth={bandWidth}
              fill="none"
              opacity={0.5 + energy * 0.3}
              style={{
                filter: `drop-shadow(0 0 ${4 + energy * 8}px ${color}88)`,
              }}
            />
          );
        })}
      </svg>
    </div>
  );
};
