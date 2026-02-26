/**
 * MoirePattern — Two sets of parallel lines slowly rotating relative to each
 * other, creating mesmerizing moire interference patterns. Rotation speed driven
 * by energy. Thin (1-2px) white/cyan lines on transparent. The interference
 * naturally creates flowing organic shapes. Cycle: 65s (1950 frames), 20s (600) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1950; // 65s at 30fps
const DURATION = 600; // 20s visible
const LINE_COUNT = 40;

interface Props {
  frames: EnhancedFrameData[];
}

export const MoirePattern: React.FC<Props> = ({ frames }) => {
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

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.07], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  const baseOpacity = interpolate(energy, [0.02, 0.25], [0.12, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const extent = Math.max(width, height) * 0.8;

  // Rotation speeds driven by energy
  const rotSpeed = interpolate(energy, [0.02, 0.3], [0.12, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Set A rotates slowly clockwise, Set B counter-clockwise at different rate
  const rotA = frame * rotSpeed;
  const rotB = -frame * rotSpeed * 0.7 + 15; // offset start angle

  // Line spacing
  const spacing = extent / LINE_COUNT;

  // Stroke width varies with energy
  const strokeW = interpolate(energy, [0.02, 0.25], [0.8, 1.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Color hue drifts slowly
  const hue = (frame * 0.3) % 360;
  const colorA = `hsla(${hue}, 60%, 80%, 0.7)`;
  const colorB = `hsla(${(hue + 120) % 360}, 60%, 80%, 0.7)`;

  // Generate line positions (centered around 0)
  const linePositions: number[] = [];
  for (let l = 0; l < LINE_COUNT; l++) {
    linePositions.push((l - (LINE_COUNT - 1) / 2) * spacing);
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 4px ${colorA})`,
          willChange: "opacity",
        }}
      >
        {/* Set A: parallel lines rotating clockwise */}
        <g transform={`translate(${cx}, ${cy}) rotate(${rotA})`}>
          {linePositions.map((pos, i) => (
            <line
              key={`a-${i}`}
              x1={-extent}
              y1={pos}
              x2={extent}
              y2={pos}
              stroke={colorA}
              strokeWidth={strokeW}
            />
          ))}
        </g>

        {/* Set B: parallel lines rotating counter-clockwise */}
        <g transform={`translate(${cx}, ${cy}) rotate(${rotB})`}>
          {linePositions.map((pos, i) => (
            <line
              key={`b-${i}`}
              x1={-extent}
              y1={pos}
              x2={extent}
              y2={pos}
              stroke={colorB}
              strokeWidth={strokeW}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};
