/**
 * RomanColumns — 4-6 classical Roman/Greek column silhouettes framing the screen edges.
 * Columns have Ionic/Corinthian capitals (decorative tops) and fluted shafts (vertical lines).
 * An architrave (horizontal bar) connects top columns.
 * White marble color with subtle shadow. Columns scale-breathe with energy.
 * Cycle: 70s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2100; // 70 seconds at 30fps
const DURATION = 540; // 18 seconds visible

// Marble color palette
const MARBLE_WHITE = "#E8E4DF";
const MARBLE_LIGHT = "#D4D0CB";
const MARBLE_SHADOW = "#A8A29E";
const WARM_CREAM = "#F5F0E8";
const COLUMN_ACCENT = "#C8C0B4";

interface ColumnDef {
  x: number; // fraction of width
  heightFrac: number; // fraction of screen height for shaft
  capitalStyle: "ionic" | "corinthian";
  flutes: number;
}

const COLUMNS: ColumnDef[] = [
  { x: 0.04, heightFrac: 0.75, capitalStyle: "ionic", flutes: 5 },
  { x: 0.14, heightFrac: 0.72, capitalStyle: "corinthian", flutes: 6 },
  { x: 0.24, heightFrac: 0.70, capitalStyle: "ionic", flutes: 5 },
  { x: 0.76, heightFrac: 0.70, capitalStyle: "ionic", flutes: 5 },
  { x: 0.86, heightFrac: 0.72, capitalStyle: "corinthian", flutes: 6 },
  { x: 0.96, heightFrac: 0.75, capitalStyle: "ionic", flutes: 5 },
];

const COLUMN_WIDTH = 45;

interface Props {
  frames: EnhancedFrameData[];
}

export const RomanColumns: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.2, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Scale-breathe with energy
  const breathe = 1 + Math.sin(frame * 0.04) * energy * 0.03;

  const glowSize = interpolate(energy, [0.02, 0.25], [1, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Architrave Y position: top of tallest column
  const architraveY = height * (1 - 0.75) - 10;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${MARBLE_WHITE}) drop-shadow(0 0 ${glowSize * 2}px ${MARBLE_SHADOW})`,
          willChange: "opacity",
        }}
      >
        {/* Architrave connecting top of columns */}
        <rect
          x={0}
          y={architraveY - 14}
          width={width * 0.27}
          height={14}
          fill={MARBLE_LIGHT}
          opacity={0.4}
          rx={1}
        />
        <rect
          x={width * 0.73}
          y={architraveY - 14}
          width={width * 0.27}
          height={14}
          fill={MARBLE_LIGHT}
          opacity={0.4}
          rx={1}
        />
        {/* Decorative molding line */}
        <line
          x1={0}
          y1={architraveY}
          x2={width * 0.27}
          y2={architraveY}
          stroke={COLUMN_ACCENT}
          strokeWidth={1.5}
          opacity={0.3}
        />
        <line
          x1={width * 0.73}
          y1={architraveY}
          x2={width}
          y2={architraveY}
          stroke={COLUMN_ACCENT}
          strokeWidth={1.5}
          opacity={0.3}
        />

        {/* Columns */}
        {COLUMNS.map((col, ci) => {
          const cx = col.x * width;
          const shaftH = col.heightFrac * height;
          const baseY = height;
          const topY = baseY - shaftH;
          const halfW = COLUMN_WIDTH / 2;

          // Capital height
          const capH = 28;

          return (
            <g
              key={`col-${ci}`}
              transform={`translate(${cx}, 0) scale(${breathe})`}
              style={{ transformOrigin: `${cx}px ${baseY}px` }}
            >
              {/* Column shaft */}
              <rect
                x={-halfW}
                y={topY + capH}
                width={COLUMN_WIDTH}
                height={shaftH - capH - 15}
                fill={MARBLE_WHITE}
                opacity={0.35}
                rx={2}
              />

              {/* Flutes (vertical lines on shaft) */}
              {Array.from({ length: col.flutes }).map((_, fi) => {
                const fluteX = -halfW + 6 + (fi * (COLUMN_WIDTH - 12)) / (col.flutes - 1);
                return (
                  <line
                    key={`flute-${ci}-${fi}`}
                    x1={fluteX}
                    y1={topY + capH + 5}
                    x2={fluteX}
                    y2={baseY - 20}
                    stroke={MARBLE_SHADOW}
                    strokeWidth={0.8}
                    opacity={0.25}
                  />
                );
              })}

              {/* Base */}
              <rect
                x={-halfW - 5}
                y={baseY - 15}
                width={COLUMN_WIDTH + 10}
                height={15}
                fill={MARBLE_LIGHT}
                opacity={0.35}
                rx={1}
              />

              {/* Capital */}
              {col.capitalStyle === "ionic" ? (
                // Ionic capital: scroll volutes
                <g>
                  <rect
                    x={-halfW - 3}
                    y={topY + capH - 8}
                    width={COLUMN_WIDTH + 6}
                    height={8}
                    fill={MARBLE_WHITE}
                    opacity={0.4}
                    rx={1}
                  />
                  {/* Left volute */}
                  <circle
                    cx={-halfW - 2}
                    cy={topY + capH - 4}
                    r={8}
                    fill="none"
                    stroke={MARBLE_WHITE}
                    strokeWidth={1.5}
                    opacity={0.35}
                  />
                  <circle
                    cx={-halfW - 2}
                    cy={topY + capH - 4}
                    r={4}
                    fill="none"
                    stroke={WARM_CREAM}
                    strokeWidth={1}
                    opacity={0.3}
                  />
                  {/* Right volute */}
                  <circle
                    cx={halfW + 2}
                    cy={topY + capH - 4}
                    r={8}
                    fill="none"
                    stroke={MARBLE_WHITE}
                    strokeWidth={1.5}
                    opacity={0.35}
                  />
                  <circle
                    cx={halfW + 2}
                    cy={topY + capH - 4}
                    r={4}
                    fill="none"
                    stroke={WARM_CREAM}
                    strokeWidth={1}
                    opacity={0.3}
                  />
                </g>
              ) : (
                // Corinthian capital: leafy decorations (simplified)
                <g>
                  <rect
                    x={-halfW - 6}
                    y={topY}
                    width={COLUMN_WIDTH + 12}
                    height={capH}
                    fill={MARBLE_WHITE}
                    opacity={0.3}
                    rx={2}
                  />
                  {/* Acanthus leaves (simplified as small ovals) */}
                  {[-1, 0, 1].map((side) => (
                    <ellipse
                      key={`leaf-${ci}-${side}`}
                      cx={side * 12}
                      cy={topY + capH * 0.5}
                      rx={8}
                      ry={12}
                      fill="none"
                      stroke={WARM_CREAM}
                      strokeWidth={1}
                      opacity={0.3}
                    />
                  ))}
                  {/* Abacus top */}
                  <rect
                    x={-halfW - 8}
                    y={topY}
                    width={COLUMN_WIDTH + 16}
                    height={5}
                    fill={MARBLE_LIGHT}
                    opacity={0.35}
                    rx={1}
                  />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
