/**
 * CoralReef — Underwater coral formations growing from bottom.
 * 5-8 coral branches built from bezier curves with organic bulbous tips.
 * Colors: hot pink, orange, purple, teal corals.
 * Small fish silhouettes (3-4) swim between branches.
 * Bubbles rise from coral. Energy drives growth and fish speed.
 * Cycle: 65s, 20s visible.
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

const CYCLE = 1950;    // 65 seconds at 30fps
const DURATION = 600;  // 20 seconds
const NUM_BRANCHES = 7;
const NUM_FISH = 4;
const NUM_BUBBLES = 12;

const CORAL_COLORS = [
  "#FF1493", "#FF6B35", "#9B30FF", "#00CED1",
  "#FF69B4", "#FF8C00", "#8A2BE2",
];

interface BranchData {
  baseX: number;
  height: number;
  curve1X: number;
  curve1Y: number;
  curve2X: number;
  curve2Y: number;
  tipRadius: number;
  colorIdx: number;
  growDelay: number;
  swaySpeed: number;
  swayPhase: number;
}

interface FishData {
  baseY: number;
  speed: number;
  phase: number;
  size: number;
  direction: number;
  waveAmp: number;
}

interface BubbleData {
  baseX: number;
  speed: number;
  phase: number;
  size: number;
  wobbleAmp: number;
}

function generateBranches(seed: number): BranchData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_BRANCHES }, () => ({
    baseX: 0.08 + rng() * 0.84,
    height: 120 + rng() * 200,
    curve1X: (rng() - 0.5) * 80,
    curve1Y: 0.3 + rng() * 0.2,
    curve2X: (rng() - 0.5) * 60,
    curve2Y: 0.6 + rng() * 0.2,
    tipRadius: 8 + rng() * 14,
    colorIdx: Math.floor(rng() * CORAL_COLORS.length),
    growDelay: rng() * 0.25,
    swaySpeed: 0.015 + rng() * 0.02,
    swayPhase: rng() * Math.PI * 2,
  }));
}

function generateFish(seed: number): FishData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_FISH }, () => ({
    baseY: 0.4 + rng() * 0.45,
    speed: 0.5 + rng() * 1.5,
    phase: rng() * Math.PI * 2,
    size: 6 + rng() * 8,
    direction: rng() > 0.5 ? 1 : -1,
    waveAmp: 15 + rng() * 25,
  }));
}

function generateBubbles(seed: number): BubbleData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_BUBBLES }, () => ({
    baseX: 0.1 + rng() * 0.8,
    speed: 0.4 + rng() * 0.8,
    phase: rng() * Math.PI * 2,
    size: 2 + rng() * 5,
    wobbleAmp: 3 + rng() * 8,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CoralReef: React.FC<Props> = ({ frames }) => {
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

  const branches = React.useMemo(() => generateBranches(7701), []);
  const fish = React.useMemo(() => generateFish(7702), []);
  const bubbles = React.useMemo(() => generateBubbles(7703), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.7;

  const growFactor = 0.6 + energy * 0.8;
  const fishSpeedMult = 0.5 + energy * 2.0;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="coral-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Coral branches */}
        {branches.map((b, i) => {
          const growStart = b.growDelay;
          const growProgress = interpolate(progress, [growStart, growStart + 0.35], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          if (growProgress < 0.01) return null;

          const color = CORAL_COLORS[b.colorIdx];
          const sway = Math.sin(frame * b.swaySpeed + b.swayPhase) * (5 + energy * 15);
          const bx = b.baseX * width;
          const by = height;
          const curHeight = b.height * growProgress * growFactor;

          const tipX = bx + b.curve2X + sway;
          const tipY = by - curHeight;

          const cp1x = bx + b.curve1X * 0.5 + sway * 0.3;
          const cp1y = by - curHeight * b.curve1Y;
          const cp2x = bx + b.curve2X * 0.8 + sway * 0.7;
          const cp2y = by - curHeight * b.curve2Y;

          const pathD = `M ${bx} ${by} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${tipX} ${tipY}`;
          const tipR = b.tipRadius * growProgress;

          return (
            <g key={`branch-${i}`} filter="url(#coral-glow)">
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={4 + growProgress * 4}
                strokeLinecap="round"
                opacity={0.7}
              />
              {/* Bulbous tip */}
              <ellipse
                cx={tipX}
                cy={tipY}
                rx={tipR}
                ry={tipR * 0.8}
                fill={color}
                opacity={0.5}
              />
              <ellipse
                cx={tipX}
                cy={tipY}
                rx={tipR * 0.5}
                ry={tipR * 0.4}
                fill="#FFFFFF"
                opacity={0.15 + energy * 0.1}
              />
            </g>
          );
        })}

        {/* Fish silhouettes */}
        {fish.map((f, i) => {
          const t = (frame * f.speed * fishSpeedMult * 0.02 + f.phase) % 1;
          const fx = f.direction > 0 ? t * (width + 60) - 30 : width + 30 - t * (width + 60);
          const fy = f.baseY * height + Math.sin(frame * 0.05 + f.phase) * f.waveAmp;
          const scaleX = f.direction;
          const tailWag = Math.sin(frame * 0.15 + f.phase) * 4;

          return (
            <g key={`fish-${i}`} opacity={0.5}>
              <g transform={`translate(${fx},${fy}) scale(${scaleX},1)`}>
                {/* Body */}
                <ellipse cx={0} cy={0} rx={f.size} ry={f.size * 0.45} fill="#1A1A2E" />
                {/* Tail */}
                <polygon
                  points={`${-f.size},0 ${-f.size - f.size * 0.6},${-f.size * 0.4 + tailWag} ${-f.size - f.size * 0.6},${f.size * 0.4 + tailWag}`}
                  fill="#1A1A2E"
                />
                {/* Eye */}
                <circle cx={f.size * 0.4} cy={-f.size * 0.1} r={1.5} fill="#CCDDFF" />
              </g>
            </g>
          );
        })}

        {/* Rising bubbles */}
        {bubbles.map((bub, i) => {
          const bubProgress = ((frame * bub.speed * 0.015 + bub.phase) % 1);
          const bx = bub.baseX * width + Math.sin(frame * 0.03 + bub.phase) * bub.wobbleAmp;
          const by = height - bubProgress * (height + 40);
          const bubOpacity = interpolate(bubProgress, [0, 0.1, 0.85, 1], [0, 0.4, 0.4, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <circle
              key={`bub-${i}`}
              cx={bx}
              cy={by}
              r={bub.size}
              fill="none"
              stroke="#88DDFF"
              strokeWidth={0.8}
              opacity={bubOpacity}
            />
          );
        })}
      </svg>
    </div>
  );
};
