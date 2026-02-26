/**
 * RainbowArc -- Classic rainbow arc across upper portion of screen.
 * 7 concentric arcs in ROYGBIV colors. Rainbow fades in gradually,
 * holds, then fades out. Arc width pulses gently with energy.
 * Subtle secondary rainbow (fainter, reversed colors) outside the
 * main arc. Cycle: 90s, 25s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const VISIBLE_DURATION = 750; // 25s at 30fps
const CYCLE_GAP = 1950;       // 65s gap (90s total - 25s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;

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

  // Memo to satisfy hooks-before-conditionals rule
  const _stable = React.useMemo(() => true, []);
  void _stable;

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleFrame = frame % CYCLE_TOTAL;

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  // Slow fade in (20% of duration), hold, slow fade out (20% of duration)
  const fadeIn = interpolate(progress, [0, 0.2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.8, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.65;

  if (masterOpacity < 0.01) return null;

  // Arc center and base radius
  const centerX = width * 0.5;
  const centerY = height * 0.65;
  const baseRadius = width * 0.38;

  // Energy-driven pulse on arc width
  const widthPulse = 1 + Math.sin(frame * 0.04) * 0.08 * (1 + energy * 2);
  const bandWidth = ARC_BAND_WIDTH * widthPulse;

  // Shimmer effect
  const shimmer = 1 + Math.sin(frame * 0.07) * 0.03 + Math.sin(frame * 0.13) * 0.02;

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

          // Stagger the fade-in per band
          const bandDelay = ci * 0.02;
          const bandFade = interpolate(progress, [bandDelay, bandDelay + 0.15], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <path
              key={`main-${ci}`}
              d={`M ${centerX - r} ${centerY} A ${r} ${r} 0 0 1 ${centerX + r} ${centerY}`}
              stroke={color}
              strokeWidth={bandWidth}
              fill="none"
              opacity={bandFade * (0.5 + energy * 0.3)}
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
