/**
 * ChakraStack — 7 chakra energy centers stacked vertically.
 * 7 circles positioned vertically from bottom (root) to top (crown).
 * Each has its traditional color (red -> orange -> yellow -> green -> blue -> indigo -> violet).
 * Circles pulse/breathe individually mapped to 7 contrast frequency bands.
 * Energy causes them to glow brighter. Connected by a thin energy line.
 * Always visible at 8-20% opacity, positioned on left edge.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CHAKRAS = [
  { name: "Root", color: "#FF0044", hue: 0 },
  { name: "Sacral", color: "#FF6600", hue: 25 },
  { name: "Solar Plexus", color: "#FFD700", hue: 50 },
  { name: "Heart", color: "#00FF66", hue: 140 },
  { name: "Throat", color: "#00BBFF", hue: 200 },
  { name: "Third Eye", color: "#6644FF", hue: 260 },
  { name: "Crown", color: "#CC44FF", hue: 290 },
];

interface Props {
  frames: EnhancedFrameData[];
}

export const ChakraStack: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Get current frame's contrast bands (7 bands for 7 chakras)
  const fd = frames[idx];
  const contrast = fd.contrast;

  // Opacity: 8-20% based on energy
  const masterOpacity = interpolate(energy, [0.02, 0.3], [0.08, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Layout: left edge, vertically centered
  const xPos = 65;
  const stackHeight = height * 0.6;
  const stackTop = (height - stackHeight) / 2;
  const baseRadius = 18;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {/* Connecting energy line (sushumna) */}
        <line
          x1={xPos}
          y1={stackTop + stackHeight}
          x2={xPos}
          y2={stackTop}
          stroke="white"
          strokeWidth={1.5}
          opacity={0.3 + energy * 0.4}
          strokeDasharray={`${4 + energy * 8} ${3}`}
        />

        {/* Energy flow animation along the line */}
        {Array.from({ length: 5 }, (_, pi) => {
          const flowCycle = 180 + pi * 37; // stagger flow particles
          const flowProgress = ((frame + pi * 36) % flowCycle) / flowCycle;
          const flowY = stackTop + stackHeight - flowProgress * stackHeight;
          const flowOpacity = Math.sin(flowProgress * Math.PI) * 0.6;
          const flowHue = flowProgress * 360;
          return (
            <circle
              key={`flow-${pi}`}
              cx={xPos}
              cy={flowY}
              r={2 + energy * 3}
              fill={`hsl(${flowHue}, 100%, 70%)`}
              opacity={flowOpacity}
            />
          );
        })}

        {/* 7 Chakras: bottom (root) to top (crown) */}
        {CHAKRAS.map((chakra, ci) => {
          // Root at bottom, crown at top
          const yPos = stackTop + stackHeight - (ci / (CHAKRAS.length - 1)) * stackHeight;

          // Each chakra pulses with its corresponding contrast band
          const bandEnergy = contrast[ci];
          const pulse = Math.sin(frame * (0.04 + ci * 0.008) + ci * 1.2) * 0.5 + 0.5;
          const breathe = 1 + bandEnergy * 0.5 + pulse * 0.2;
          const r = baseRadius * breathe;

          // Glow intensity from band energy + overall energy
          const glowIntensity = 0.4 + bandEnergy * 0.4 + energy * 0.2;
          const glowRadius = 6 + bandEnergy * 14 + energy * 8;

          return (
            <g key={ci}>
              {/* Outer glow */}
              <circle
                cx={xPos}
                cy={yPos}
                r={r * 1.8}
                fill={chakra.color}
                opacity={glowIntensity * 0.15}
                style={{ filter: `blur(${glowRadius}px)` }}
              />

              {/* Main chakra circle */}
              <circle
                cx={xPos}
                cy={yPos}
                r={r}
                stroke={chakra.color}
                strokeWidth={2}
                fill={chakra.color}
                fillOpacity={0.15 + bandEnergy * 0.2}
                style={{
                  filter: `drop-shadow(0 0 ${glowRadius * 0.6}px ${chakra.color})`,
                }}
              />

              {/* Inner spinning symbol: simple rotating lines */}
              {Array.from({ length: 3 }, (_, li) => {
                const angle = (li / 3) * Math.PI + frame * 0.03 * (ci % 2 === 0 ? 1 : -1);
                const len = r * 0.6;
                return (
                  <line
                    key={li}
                    x1={xPos + Math.cos(angle) * len}
                    y1={yPos + Math.sin(angle) * len}
                    x2={xPos - Math.cos(angle) * len}
                    y2={yPos - Math.sin(angle) * len}
                    stroke={chakra.color}
                    strokeWidth={1}
                    opacity={0.4 + bandEnergy * 0.3}
                  />
                );
              })}

              {/* Center dot */}
              <circle
                cx={xPos}
                cy={yPos}
                r={3 + bandEnergy * 4}
                fill={chakra.color}
                opacity={0.7 + bandEnergy * 0.3}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
