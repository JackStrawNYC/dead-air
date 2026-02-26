/**
 * MushroomForest — psychedelic mushrooms growing from bottom + skeleton crowd.
 * Mushrooms grow during quieter passages (meditative/spacey).
 * Skeleton crowd appears during jams, bobbing heads.
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

// ── MUSHROOM ────────────────────────────────────────────────────

const MUSHROOM_COLORS = ["#FF1493", "#FF4500", "#FFD700", "#00FF7F", "#DA70D6", "#FF69B4", "#00CED1", "#ADFF2F"];

interface MushroomData {
  x: number;
  height: number;
  capWidth: number;
  stemWidth: number;
  colorIdx: number;
  lean: number;
  spotCount: number;
}

const MUSHROOM_CYCLE = 1050;   // 35 seconds
const MUSHROOM_DURATION = 600; // 20 seconds
const NUM_MUSHROOMS = 10;

function generateMushrooms(seed: number): MushroomData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_MUSHROOMS }, () => ({
    x: 0.05 + rng() * 0.9,
    height: 60 + rng() * 100,
    capWidth: 30 + rng() * 40,
    stemWidth: 8 + rng() * 10,
    colorIdx: Math.floor(rng() * MUSHROOM_COLORS.length),
    lean: (rng() - 0.5) * 15,
    spotCount: 2 + Math.floor(rng() * 4),
  }));
}

const MushroomForestOverlay: React.FC<{ width: number; height: number; energy: number; frame: number }> = ({
  width, height, energy, frame,
}) => {
  // Mushrooms prefer quieter moments
  const quietEnergy = 1 - interpolate(energy, [0.05, 0.25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (quietEnergy < 0.2) return null;

  const cycleFrame = frame % MUSHROOM_CYCLE;
  const cycleIdx = Math.floor(frame / MUSHROOM_CYCLE);
  if (cycleFrame >= MUSHROOM_DURATION) return null;

  const mushrooms = React.useMemo(() => generateMushrooms(cycleIdx * 17 + 420), [cycleIdx]);

  const progress = cycleFrame / MUSHROOM_DURATION;
  // Grow up then shrink
  const growPhase = interpolate(progress, [0, 0.4, 0.8, 1], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const opacity = interpolate(progress, [0, 0.1, 0.85, 1], [0, 0.7, 0.7, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * quietEnergy;

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
      {mushrooms.map((m, i) => {
        const x = m.x * width;
        const baseY = height - 5;
        const mHeight = m.height * growPhase;
        const color = MUSHROOM_COLORS[m.colorIdx];
        const capH = m.capWidth * 0.6;

        // Gentle sway
        const sway = Math.sin(frame * 0.03 + i * 2) * 5 * growPhase;

        return (
          <g key={i} transform={`translate(${x + sway}, ${baseY}) rotate(${m.lean * growPhase})`}>
            {/* Stem */}
            <rect
              x={-m.stemWidth / 2}
              y={-mHeight}
              width={m.stemWidth}
              height={mHeight}
              rx={m.stemWidth / 2}
              fill={color}
              opacity="0.6"
            />
            {/* Cap */}
            <ellipse
              cx={0}
              cy={-mHeight}
              rx={m.capWidth / 2 * growPhase}
              ry={capH / 2 * growPhase}
              fill={color}
              opacity="0.8"
            />
            {/* Spots */}
            {Array.from({ length: m.spotCount }, (_, j) => {
              const spotAngle = (j / m.spotCount) * Math.PI - Math.PI * 0.15;
              const spotR = m.capWidth * 0.25 * growPhase;
              return (
                <circle
                  key={j}
                  cx={Math.cos(spotAngle) * spotR}
                  cy={-mHeight + Math.sin(spotAngle) * capH * 0.2 * growPhase}
                  r={3 + j}
                  fill={color}
                  opacity="0.4"
                />
              );
            })}
            {/* Stem ring */}
            <ellipse
              cx={0}
              cy={-mHeight * 0.6}
              rx={m.stemWidth * 0.8}
              ry={3}
              fill={color}
              opacity="0.5"
            />
            {/* Neon glow underneath */}
            <ellipse
              cx={0}
              cy={0}
              rx={m.capWidth * 0.3 * growPhase}
              ry={4}
              fill={color}
              opacity="0.3"
              filter={`blur(4px)`}
            />
          </g>
        );
      })}
    </svg>
  );
};

// ── SKELETON CROWD ──────────────────────────────────────────────

const NUM_SKULLS = 16;

interface SkullData {
  x: number;
  size: number;
  bobPhase: number;
  bobSpeed: number;
}

function generateSkulls(seed: number): SkullData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_SKULLS }, () => ({
    x: rng(),
    size: 22 + rng() * 18,
    bobPhase: rng() * Math.PI * 2,
    bobSpeed: 3 + rng() * 4,
  }));
}

const SkeletonCrowd: React.FC<{ width: number; height: number; energy: number; frame: number }> = ({
  width, height, energy, frame,
}) => {
  if (energy < 0.12) return null;

  const opacity = interpolate(energy, [0.12, 0.25], [0, 0.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const skulls = React.useMemo(() => generateSkulls(5081977), []);
  const baseY = height - 35;

  const hue = (frame * 0.6) % 360;
  const color = `hsl(${hue}, 80%, 60%)`;
  const glow = `drop-shadow(0 0 5px ${color})`;

  return (
    <svg
      width={width} height={height}
      style={{ position: "absolute", inset: 0, opacity, filter: glow, pointerEvents: "none" }}
    >
      {skulls.map((s, i) => {
        const x = s.x * width;
        const bob = Math.sin(frame * s.bobSpeed * 0.02 + s.bobPhase) * (4 + energy * 10);
        const y = baseY + bob;
        const tilt = Math.sin(frame * 0.05 + i) * 8;
        const skullColor = `hsl(${(hue + i * 25) % 360}, 80%, 60%)`;

        return (
          <g key={i} transform={`translate(${x}, ${y}) rotate(${tilt})`}>
            {/* Skull */}
            <ellipse cx={0} cy={0} rx={s.size * 0.7} ry={s.size * 0.85} fill={skullColor} opacity="0.7" />
            {/* Eyes */}
            <circle cx={-s.size * 0.22} cy={-s.size * 0.15} r={s.size * 0.15} fill="black" opacity="0.5" />
            <circle cx={s.size * 0.22} cy={-s.size * 0.15} r={s.size * 0.15} fill="black" opacity="0.5" />
            {/* Nose */}
            <ellipse cx={0} cy={s.size * 0.1} rx={s.size * 0.08} ry={s.size * 0.12} fill="black" opacity="0.4" />
            {/* Jaw */}
            <rect x={-s.size * 0.4} y={s.size * 0.35} width={s.size * 0.8} height={s.size * 0.25} rx={2} fill={skullColor} opacity="0.5" />
            {/* Teeth lines */}
            {[-0.2, -0.07, 0.07, 0.2].map((tx, j) => (
              <line key={j} x1={s.size * tx} y1={s.size * 0.35} x2={s.size * tx} y2={s.size * 0.6} stroke="black" strokeWidth="0.8" opacity="0.3" />
            ))}
          </g>
        );
      })}
    </svg>
  );
};

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const MushroomForest: React.FC<Props> = ({ frames }) => {
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

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <MushroomForestOverlay width={width} height={height} energy={energy} frame={frame} />
      <SkeletonCrowd width={width} height={height} energy={energy} frame={frame} />
    </div>
  );
};
