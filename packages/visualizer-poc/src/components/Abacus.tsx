/**
 * Abacus — Traditional abacus with 5-7 horizontal rods and sliding beads.
 * Frame is a rectangular border with rods. Each rod has 2 beads on top section,
 * 5 on bottom. Beads slide to represent audio values (rms maps to a number
 * displayed). Wooden frame brown, colorful beads. Beads slide smoothly as
 * values change. Always visible at 0.12-0.25 opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUM_RODS = 7;
const FRAME_W = 220;
const FRAME_H = 300;
const ROD_PADDING = 22;
const BEAD_RADIUS = 8;
const TOP_SECTION_RATIO = 0.3; // top 30% for upper beads
const DIVIDER_Y = FRAME_H * TOP_SECTION_RATIO;

const BEAD_COLORS = [
  "#E53935", // red
  "#1E88E5", // blue
  "#43A047", // green
  "#FB8C00", // orange
  "#8E24AA", // purple
  "#00ACC1", // cyan
  "#FFD600", // yellow
];

interface Props {
  frames: EnhancedFrameData[];
}

export const Abacus: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-compute rod x positions
  const rodPositions = React.useMemo(() => {
    const spacing = (FRAME_W - ROD_PADDING * 2) / (NUM_RODS - 1);
    return Array.from({ length: NUM_RODS }, (_, i) => ROD_PADDING + i * spacing);
  }, []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Always visible: opacity 0.12-0.25
  const masterOpacity = interpolate(energy, [0, 0.3], [0.12, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Convert energy to a number for display (0-99)
  const displayNum = Math.floor(energy * 99);

  // Convert displayNum to per-rod digit values (each rod 0-9)
  // Use multiple audio features for different rods
  const currentFrame = frames[idx];
  const rodValues: number[] = [];
  for (let r = 0; r < NUM_RODS; r++) {
    let val: number;
    switch (r) {
      case 0:
        val = currentFrame.rms;
        break;
      case 1:
        val = currentFrame.centroid;
        break;
      case 2:
        val = currentFrame.sub;
        break;
      case 3:
        val = currentFrame.low;
        break;
      case 4:
        val = currentFrame.mid;
        break;
      case 5:
        val = currentFrame.high;
        break;
      default:
        val = currentFrame.onset;
        break;
    }
    rodValues.push(Math.floor(val * 9)); // 0-9
  }

  // Position in bottom-right corner
  const posX = width - FRAME_W - 40;
  const posY = height - FRAME_H - 40;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={FRAME_W}
        height={FRAME_H}
        style={{
          position: "absolute",
          left: posX,
          top: posY,
          opacity: masterOpacity,
        }}
      >
        {/* Wooden frame */}
        <rect
          x={2}
          y={2}
          width={FRAME_W - 4}
          height={FRAME_H - 4}
          rx={6}
          ry={6}
          fill="#5C3A1E"
          stroke="#8B6E4E"
          strokeWidth={4}
        />

        {/* Inner background */}
        <rect
          x={8}
          y={8}
          width={FRAME_W - 16}
          height={FRAME_H - 16}
          rx={3}
          fill="#FDF5E6"
          opacity={0.15}
        />

        {/* Divider bar between top and bottom sections */}
        <rect
          x={6}
          y={DIVIDER_Y - 3}
          width={FRAME_W - 12}
          height={6}
          fill="#8B6E4E"
          rx={2}
        />

        {/* Rods and beads */}
        {rodPositions.map((rx, ri) => {
          const val = rodValues[ri];
          const color = BEAD_COLORS[ri % BEAD_COLORS.length];

          // Upper section: 2 beads, val >= 5 means one upper bead is "down" (near divider)
          const upperActive = val >= 5 ? 1 : 0;
          const lowerActive = val % 5; // 0-4 beads pushed up

          // Smoothed positions using interpolate on frame for sliding
          const topBeadSpacing = (DIVIDER_Y - 20) / 3;

          return (
            <g key={ri}>
              {/* Rod line */}
              <line
                x1={rx}
                y1={12}
                x2={rx}
                y2={FRAME_H - 12}
                stroke="#A0845C"
                strokeWidth={2}
                opacity={0.6}
              />

              {/* Upper beads (2) */}
              {[0, 1].map((bi) => {
                // When active, bead moves toward divider
                const restY = 20 + bi * topBeadSpacing;
                const activeY = DIVIDER_Y - 12 - (1 - bi) * (BEAD_RADIUS * 2.2);
                const targetY = bi < upperActive ? activeY : restY;
                // Use sine for smooth sliding
                const smoothPhase = Math.sin(frame * 0.05 + ri * 0.7 + bi * 1.3);
                const jitter = smoothPhase * 0.5;
                return (
                  <ellipse
                    key={`u-${bi}`}
                    cx={rx}
                    cy={targetY + jitter}
                    rx={BEAD_RADIUS}
                    ry={BEAD_RADIUS * 0.65}
                    fill={color}
                    stroke="rgba(0,0,0,0.3)"
                    strokeWidth={0.8}
                  />
                );
              })}

              {/* Lower beads (5) */}
              {[0, 1, 2, 3, 4].map((bi) => {
                const bottomStart = DIVIDER_Y + 15;
                const beadSpacing = (FRAME_H - DIVIDER_Y - 30) / 6;
                const restY = bottomStart + (4 - bi) * beadSpacing + beadSpacing;
                const activeY = DIVIDER_Y + 12 + bi * (BEAD_RADIUS * 2.2);
                const isActive = bi < lowerActive;
                const targetY = isActive ? activeY : restY;
                const smoothPhase = Math.sin(frame * 0.04 + ri * 0.5 + bi * 0.9);
                const jitter = smoothPhase * 0.4;
                return (
                  <ellipse
                    key={`l-${bi}`}
                    cx={rx}
                    cy={targetY + jitter}
                    rx={BEAD_RADIUS}
                    ry={BEAD_RADIUS * 0.65}
                    fill={color}
                    stroke="rgba(0,0,0,0.3)"
                    strokeWidth={0.8}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Label text (subtle) */}
        <text
          x={FRAME_W / 2}
          y={FRAME_H - 6}
          textAnchor="middle"
          fill="#8B6E4E"
          fontSize={8}
          fontFamily="serif"
          opacity={0.5}
        >
          {displayNum.toString().padStart(2, "0")}
        </text>
      </svg>
    </div>
  );
};
