/**
 * CosmicStarfield — Dark Star themed flying stars streaming past.
 * Stars fly from center outward (warp speed effect).
 * Speed and density tied to energy. Always present but subtle.
 * Deterministic star positions via seeded PRNG.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  angle: number;    // radians from center
  speed: number;    // 0-1, determines streak length
  baseRadius: number; // starting distance from center (0-1 normalized)
  size: number;
  hue: number;
  brightness: number;
}

const NUM_STARS = 120;
const STAR_CYCLE = 300; // each star loops every 10 seconds

function generateStars(seed: number): Star[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_STARS }, () => ({
    angle: rng() * Math.PI * 2,
    speed: 0.3 + rng() * 0.7,
    baseRadius: rng() * 0.3,
    size: 1 + rng() * 3,
    hue: rng() * 360,
    brightness: 0.5 + rng() * 0.5,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CosmicStarfield: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 60); i <= Math.min(frames.length - 1, idx + 60); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const stars = React.useMemo(() => generateStars(19770508), []);

  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  // Speed multiplier from energy
  const speedMult = interpolate(energy, [0.03, 0.3], [0.5, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Overall opacity
  const opacity = interpolate(energy, [0.02, 0.2], [0.15, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        {stars.map((star, i) => {
          // Each star loops: flies from center outward then resets
          const period = STAR_CYCLE / star.speed;
          const t = ((frame * speedMult) % period) / period; // 0-1 progress
          const r = (star.baseRadius + t * (1 - star.baseRadius)) * maxR;

          const x = cx + Math.cos(star.angle) * r;
          const y = cy + Math.sin(star.angle) * r;

          // Streak: line from current pos toward center
          const streakLen = interpolate(energy, [0.05, 0.3], [2, 15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * star.speed;
          const x2 = cx + Math.cos(star.angle) * (r - streakLen);
          const y2 = cy + Math.sin(star.angle) * (r - streakLen);

          // Fade: dim near center, bright at edges
          const fadeDist = r / maxR;
          const alpha = fadeDist * star.brightness;

          if (alpha < 0.05) return null;

          const color = `hsla(${star.hue}, 80%, ${70 + energy * 20}%, ${alpha})`;
          const glowColor = `hsla(${star.hue}, 100%, 80%, ${alpha * 0.5})`;

          return (
            <g key={i}>
              <line
                x1={x} y1={y} x2={x2} y2={y2}
                stroke={color}
                strokeWidth={star.size * (0.8 + energy * 0.5)}
                strokeLinecap="round"
              />
              {/* Glow dot at head */}
              <circle
                cx={x} cy={y}
                r={star.size * (1 + energy * 1.5)}
                fill={glowColor}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
