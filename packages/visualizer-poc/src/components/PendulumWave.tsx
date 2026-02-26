/**
 * PendulumWave — 15 pendulums in a row, each slightly different length.
 * Creates mesmerizing wave patterns as they swing at slightly different frequencies.
 * Classic physics demo effect. Pendulum bobs are neon-colored circles.
 * String rendered as thin lines from top. Swing amplitude driven by energy.
 * Always visible at 15-30% opacity. Positioned in lower third.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const NUM_PENDULUMS = 15;

interface Props {
  frames: EnhancedFrameData[];
}

export const PendulumWave: React.FC<Props> = ({ frames }) => {
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

  // Always visible at 15-30% opacity, energy-driven
  const opacity = interpolate(energy, [0.02, 0.2], [0.15, 0.30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  // Lower third positioning
  const anchorY = height * 0.62; // top anchor of pendulums
  const startX = width * 0.15;
  const endX = width * 0.85;
  const spacing = (endX - startX) / (NUM_PENDULUMS - 1);

  // Swing amplitude driven by energy
  const amplitude = interpolate(energy, [0.02, 0.3], [15, 45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Base hue cycles slowly
  const baseHue = (frame * 0.4) % 360;

  const glowSize = interpolate(energy, [0.02, 0.3], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bob radius driven by energy
  const bobRadius = interpolate(energy, [0.02, 0.3], [5, 9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          willChange: "opacity",
        }}
      >
        <defs>
          <filter id="pendulum-glow">
            <feGaussianBlur stdDeviation={glowSize} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Anchor bar */}
        <line
          x1={startX - 10}
          y1={anchorY}
          x2={endX + 10}
          y2={anchorY}
          stroke="#FFFFFF"
          strokeWidth={2}
          opacity={0.2}
        />

        {/* Pendulums */}
        {Array.from({ length: NUM_PENDULUMS }).map((_, pi) => {
          // Each pendulum has a slightly different length, creating phase differences
          const minLen = height * 0.12;
          const maxLen = height * 0.30;
          const pendLength = minLen + (pi / (NUM_PENDULUMS - 1)) * (maxLen - minLen);

          // Period proportional to sqrt(length) -- physics: T = 2*pi*sqrt(L/g)
          // We use arbitrary time scaling for visual effect
          const period = Math.sqrt(pendLength / minLen);
          const freq = 1.0 / period;

          // Angular position: sin(2*pi*freq*t)
          const t = frame * 0.04;
          const angle = amplitude * Math.sin(2 * Math.PI * freq * t);
          const angleRad = (angle * Math.PI) / 180;

          const anchorX = startX + pi * spacing;

          // Bob position
          const bobX = anchorX + Math.sin(angleRad) * pendLength;
          const bobY = anchorY + Math.cos(angleRad) * pendLength;

          // Color: each pendulum gets a different hue
          const hue = (baseHue + (pi / NUM_PENDULUMS) * 360) % 360;
          const color = `hsl(${hue}, 100%, 65%)`;
          const glowColor = `hsl(${hue}, 100%, 50%)`;

          return (
            <g key={pi}>
              {/* String */}
              <line
                x1={anchorX}
                y1={anchorY}
                x2={bobX}
                y2={bobY}
                stroke={color}
                strokeWidth={1}
                opacity={0.4}
              />
              {/* Bob */}
              <circle
                cx={bobX}
                cy={bobY}
                r={bobRadius}
                fill={color}
                opacity={0.8}
                filter="url(#pendulum-glow)"
              />
              {/* Inner glow */}
              <circle
                cx={bobX}
                cy={bobY}
                r={bobRadius * 0.4}
                fill="white"
                opacity={0.3}
              />
              {/* Trail glow at bottom of swing (when near center) */}
              {Math.abs(angle) < amplitude * 0.3 && (
                <circle
                  cx={bobX}
                  cy={bobY}
                  r={bobRadius * 2}
                  fill={glowColor}
                  opacity={0.15}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
