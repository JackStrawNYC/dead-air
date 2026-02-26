/**
 * Snowfall — Gentle snowflakes during quiet passages.
 * 80 snowflake particles (small circles + 6-pointed star shapes for larger ones).
 * Drift downward with slight horizontal sine wobble.
 * Only visible when energy < 0.12. Flake size 2-8px.
 * White/ice-blue colors. Gentle and serene.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const NUM_FLAKES = 80;
const DRIFT_CYCLE = 42 * 30; // 42s stagger

interface Flake {
  x: number;       // initial x 0-1
  y: number;       // initial y 0-1
  size: number;    // 2-8
  isStar: boolean; // larger ones are 6-pointed stars
  fallSpeed: number;
  wobbleFreq: number;
  wobbleAmp: number;
  wobblePhase: number;
  hue: number;     // 195-215 (ice blue) or 0 with 0 sat (white)
  isWhite: boolean;
  opacity: number;
}

function generateFlakes(seed: number): Flake[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_FLAKES }, () => {
    const size = 2 + rng() * 6;
    const isWhite = rng() > 0.4;
    return {
      x: rng(),
      y: rng(),
      size,
      isStar: size > 5,
      fallSpeed: 0.3 + rng() * 0.8,
      wobbleFreq: 0.008 + rng() * 0.02,
      wobbleAmp: 10 + rng() * 30,
      wobblePhase: rng() * Math.PI * 2,
      hue: 195 + rng() * 20,
      isWhite,
      opacity: 0.3 + rng() * 0.5,
    };
  });
}

/** 6-pointed star SVG for larger snowflakes */
const StarFlake: React.FC<{ cx: number; cy: number; r: number; color: string; opacity: number }> = ({
  cx,
  cy,
  r,
  color,
  opacity,
}) => {
  // 6 arms at 60-degree intervals
  const arms: string[] = [];
  for (let a = 0; a < 6; a++) {
    const angle = (a * 60 - 90) * (Math.PI / 180);
    const x2 = cx + Math.cos(angle) * r;
    const y2 = cy + Math.sin(angle) * r;
    arms.push(`M ${cx} ${cy} L ${x2} ${y2}`);
    // Small branches
    const branchLen = r * 0.4;
    const branchAngle1 = angle + 0.5;
    const branchAngle2 = angle - 0.5;
    const midX = cx + Math.cos(angle) * r * 0.6;
    const midY = cy + Math.sin(angle) * r * 0.6;
    arms.push(`M ${midX} ${midY} L ${midX + Math.cos(branchAngle1) * branchLen} ${midY + Math.sin(branchAngle1) * branchLen}`);
    arms.push(`M ${midX} ${midY} L ${midX + Math.cos(branchAngle2) * branchLen} ${midY + Math.sin(branchAngle2) * branchLen}`);
  }
  return (
    <path
      d={arms.join(" ")}
      stroke={color}
      strokeWidth={0.8}
      fill="none"
      opacity={opacity}
      strokeLinecap="round"
    />
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const Snowfall: React.FC<Props> = ({ frames }) => {
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

  const flakes = React.useMemo(() => generateFlakes(12_21_1968), []);

  // Only visible when energy < 0.12 — smooth fade
  const quietness = interpolate(energy, [0.06, 0.12], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (quietness < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: quietness }}>
        {flakes.map((flake, i) => {
          // Fall position with wrapping
          const rawY = flake.y * height + frame * flake.fallSpeed;
          const y = ((rawY % (height + 20)) + (height + 20)) % (height + 20) - 10;

          // Horizontal wobble
          const x =
            flake.x * width +
            Math.sin(frame * flake.wobbleFreq + flake.wobblePhase) * flake.wobbleAmp;

          const wx = ((x % width) + width) % width;

          const color = flake.isWhite
            ? `rgba(240, 245, 255, ${flake.opacity})`
            : `hsla(${flake.hue}, 40%, 85%, ${flake.opacity})`;

          if (flake.isStar) {
            return (
              <StarFlake
                key={i}
                cx={wx}
                cy={y}
                r={flake.size}
                color={color}
                opacity={flake.opacity}
              />
            );
          }

          return (
            <circle
              key={i}
              cx={wx}
              cy={y}
              r={flake.size / 2}
              fill={color}
              style={{ filter: `blur(${flake.size > 4 ? 0.5 : 0}px)` }}
            />
          );
        })}
      </svg>
    </div>
  );
};
