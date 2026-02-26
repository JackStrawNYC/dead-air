/**
 * WormholeTransit — Cosmic wormhole with star streaks.
 * Central dark void (black circle) surrounded by bright ring of distorted light.
 * Radial streaks emanating outward (like hyperspace).
 * Streak length and count scale with energy.
 * Blue/purple/white color scheme. Appears every 70s for 10s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
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

const CYCLE = 2100;     // 70 seconds at 30fps
const DURATION = 300;   // 10 seconds
const NUM_STREAKS = 48;

const STREAK_COLORS = [
  "#8888FF", "#AA77FF", "#CCAAFF", "#FFFFFF",
  "#7799FF", "#9966FF", "#BBDDFF", "#EEDDFF",
];

interface StreakData {
  angle: number;
  innerRadius: number;
  length: number;
  width: number;
  colorIdx: number;
  speed: number;
  phaseOffset: number;
}

function generateStreaks(seed: number): StreakData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_STREAKS }, () => ({
    angle: rng() * Math.PI * 2,
    innerRadius: 0.08 + rng() * 0.12,
    length: 0.15 + rng() * 0.35,
    width: 0.5 + rng() * 2,
    colorIdx: Math.floor(rng() * STREAK_COLORS.length),
    speed: 0.5 + rng() * 1.5,
    phaseOffset: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const WormholeTransit: React.FC<Props> = ({ frames }) => {
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

  const streaks = React.useMemo(() => generateStreaks(9876), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.8, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.7;

  const cx = width / 2;
  const cy = height / 2;
  const maxDim = Math.max(width, height);
  const voidRadius = maxDim * 0.04 + energy * maxDim * 0.02;

  // Ring rotation
  const ringRotation = frame * 0.015;

  // Visible streaks scale with energy
  const visibleStreaks = Math.floor(NUM_STREAKS * (0.4 + energy * 0.6));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <radialGradient id="wormhole-void" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000000" stopOpacity="1" />
            <stop offset="60%" stopColor="#110022" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#220044" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wormhole-ring" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="#8866FF" stopOpacity="0" />
            <stop offset="85%" stopColor="#AABBFF" stopOpacity="0.8" />
            <stop offset="92%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#8866FF" stopOpacity="0.3" />
          </radialGradient>
          <filter id="wormhole-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Radial streaks */}
        {streaks.slice(0, visibleStreaks).map((s, i) => {
          const angle = s.angle + ringRotation;
          const streakPhase = (frame * s.speed * 0.03 + s.phaseOffset) % 1;
          const innerR = (s.innerRadius + streakPhase * 0.1) * maxDim;
          const outerR = innerR + s.length * maxDim * (0.5 + energy * 0.8);

          const x1 = cx + Math.cos(angle) * innerR;
          const y1 = cy + Math.sin(angle) * innerR;
          const x2 = cx + Math.cos(angle) * outerR;
          const y2 = cy + Math.sin(angle) * outerR;

          const color = STREAK_COLORS[s.colorIdx];
          const streakOpacity = 0.3 + energy * 0.5;

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={s.width * (1 + energy * 1.5)}
              strokeLinecap="round"
              opacity={streakOpacity}
            />
          );
        })}

        {/* Bright ring around void */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius + maxDim * 0.03}
          fill="none"
          stroke="#BBAAFF"
          strokeWidth={3 + energy * 5}
          opacity={0.6 + energy * 0.3}
          filter="url(#wormhole-glow)"
        />

        {/* Pulsing outer ring */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius + maxDim * 0.05 + Math.sin(frame * 0.08) * 5}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={1.5}
          opacity={0.3 + energy * 0.2}
          filter="url(#wormhole-glow)"
        />

        {/* Central void */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius}
          fill="url(#wormhole-void)"
        />
      </svg>
    </div>
  );
};
