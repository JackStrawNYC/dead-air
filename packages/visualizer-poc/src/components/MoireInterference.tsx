/**
 * MoireInterference — Overlapping concentric circle patterns rotating
 * in opposite directions, creating natural moire interference.
 * Two groups of 18 concentric circles, one rotating clockwise and the
 * other counter-clockwise. The overlap produces mesmerizing visual
 * interference. Neon strokes. Energy drives rotation speed.
 * Appears every 55 seconds for 16 seconds. Low opacity (0.15-0.35).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1650; // 55 seconds at 30fps
const DURATION = 480; // 16 seconds visible
const CIRCLES_PER_GROUP = 18;

interface Props {
  frames: EnhancedFrameData[];
}

export const MoireInterference: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Clamp frame index to valid range
  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy: average RMS over a 151-frame window centered on current frame
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade in over first 8%, fade out over last 10%
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  // Overall opacity: 0.15-0.35 range driven by energy
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.15, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.45;

  // Energy-driven rotation speed (base +/- 0.3 deg/frame, boosted by energy)
  const rotSpeed = interpolate(energy, [0.03, 0.3], [0.2, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Group A rotates clockwise, Group B counter-clockwise
  const rotationA = frame * rotSpeed;
  const rotationB = -frame * rotSpeed;

  // Offset Group B slightly from center to amplify interference
  const offsetX = Math.sin(frame * 0.02) * 30;
  const offsetY = Math.cos(frame * 0.015) * 20;

  // Color cycling
  const hueA = (frame * 0.6) % 360;
  const hueB = (hueA + 150) % 360;
  const colorA = `hsl(${hueA}, 100%, 60%)`;
  const colorB = `hsl(${hueB}, 100%, 60%)`;
  const glowColorA = `hsl(${hueA}, 100%, 70%)`;
  const glowColorB = `hsl(${hueB}, 100%, 70%)`;

  // Stroke width breathes slightly with energy
  const strokeBase = interpolate(energy, [0.03, 0.25], [0.8, 1.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Generate radii for the concentric circles
  const radii: number[] = [];
  for (let c = 0; c < CIRCLES_PER_GROUP; c++) {
    const t = (c + 1) / CIRCLES_PER_GROUP;
    radii.push(t * maxRadius);
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 5px ${glowColorA}) drop-shadow(0 0 10px ${glowColorB})`,
          willChange: "opacity",
        }}
      >
        {/* Group A: centered, rotates clockwise */}
        <g transform={`translate(${cx}, ${cy}) rotate(${rotationA})`}>
          {radii.map((r, i) => (
            <circle
              key={`a-${i}`}
              cx={0}
              cy={0}
              r={r}
              stroke={colorA}
              strokeWidth={strokeBase}
              fill="none"
              opacity={0.6}
            />
          ))}
        </g>

        {/* Group B: slightly offset, rotates counter-clockwise */}
        <g transform={`translate(${cx + offsetX}, ${cy + offsetY}) rotate(${rotationB})`}>
          {radii.map((r, i) => (
            <circle
              key={`b-${i}`}
              cx={0}
              cy={0}
              r={r}
              stroke={colorB}
              strokeWidth={strokeBase}
              fill="none"
              opacity={0.6}
            />
          ))}
        </g>

        {/* Third subtle set of parallel lines for extra interference depth */}
        <g transform={`translate(${cx}, ${cy}) rotate(${frame * rotSpeed * 0.4})`}>
          {Array.from({ length: 14 }, (_, i) => {
            const y = (i - 6.5) * (maxRadius / 7);
            return (
              <line
                key={`line-${i}`}
                x1={-maxRadius}
                y1={y}
                x2={maxRadius}
                y2={y}
                stroke={`hsl(${(hueA + 75) % 360}, 100%, 65%)`}
                strokeWidth={strokeBase * 0.6}
                opacity={0.3}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
