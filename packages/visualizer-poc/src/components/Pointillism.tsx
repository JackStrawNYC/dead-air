/**
 * Pointillism -- Thousands of tiny dots creating a pointillist field.
 * 200-300 small circles (2-4px) scattered across screen.
 * Each dot's color derived from position-based hash + frame hue offset.
 * Dots shimmer by varying opacity with sine waves.
 * Density increases with energy. Very subtle impressionist texture.
 * Always visible at 8-15% opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const MAX_DOTS = 300;
const MIN_DOTS = 200;

interface DotData {
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  radius: number; // 2-4
  hueBase: number; // 0-360
  phaseOffset: number; // for shimmer sine
  shimmerSpeed: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Pointillism: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate all dot positions deterministically
  const dots = React.useMemo(() => {
    const rng = seeded(55_551_234);
    const result: DotData[] = [];
    for (let d = 0; d < MAX_DOTS; d++) {
      result.push({
        x: rng(),
        y: rng(),
        radius: 2 + rng() * 2,
        hueBase: rng() * 360,
        phaseOffset: rng() * Math.PI * 2,
        shimmerSpeed: 0.03 + rng() * 0.05,
      });
    }
    return result;
  }, []);

  // Overall opacity: 8-15% driven by energy
  const masterOpacity = interpolate(energy, [0.02, 0.25], [0.08, 0.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Dot count: density increases with energy
  const visibleDots = Math.round(
    interpolate(energy, [0.02, 0.3], [MIN_DOTS, MAX_DOTS], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  // Hue offset cycling with frame
  const hueOffset = (frame * 0.6) % 360;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity: masterOpacity }}
      >
        {dots.slice(0, visibleDots).map((dot, di) => {
          // Shimmer: sine-based opacity variation
          const shimmer = 0.4 + 0.6 * ((Math.sin(frame * dot.shimmerSpeed + dot.phaseOffset) + 1) / 2);

          // Color: position-based hue + frame offset
          const hue = (dot.hueBase + hueOffset) % 360;

          return (
            <circle
              key={di}
              cx={dot.x * width}
              cy={dot.y * height}
              r={dot.radius}
              fill={`hsl(${hue}, 90%, 65%)`}
              opacity={shimmer}
            />
          );
        })}
      </svg>
    </div>
  );
};
