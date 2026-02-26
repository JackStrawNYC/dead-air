/**
 * StalactiteCave — Hanging stalactites from top and stalagmites from bottom.
 * 12-16 pointed cone shapes (triangles) hanging down, 8-10 growing up.
 * Occasional water drops fall from stalactite tips (small circles that fall and splash).
 * Brown/limestone/amber colors. Drop frequency tied to energy.
 * Mineral sparkle highlights. Cycle: 65s, 20s visible.
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

const CYCLE = 1950; // 65s at 30fps
const DURATION = 600; // 20s visible

interface FormationData {
  x: number;           // 0-1 horizontal position
  length: number;      // height of formation
  baseWidth: number;   // width at base
  colorIdx: number;    // index into color palette
  sparklePhase: number;
}

interface WaterDrop {
  sourceIdx: number;   // which stalactite it falls from
  phase: number;       // timing offset
  speed: number;       // fall speed
  fallCycle: number;   // frames per drop cycle
}

interface Props {
  frames: EnhancedFrameData[];
}

export const StalactiteCave: React.FC<Props> = ({ frames }) => {
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

  const COLORS = ["#8B7355", "#A0885C", "#C4A265", "#D4B880", "#6B5B45", "#B09060"];

  const stalactites = React.useMemo(() => {
    const rng = seeded(3456);
    const result: FormationData[] = [];
    const count = 14;
    for (let i = 0; i < count; i++) {
      result.push({
        x: 0.05 + rng() * 0.9,
        length: 60 + rng() * 140,
        baseWidth: 12 + rng() * 25,
        colorIdx: Math.floor(rng() * COLORS.length),
        sparklePhase: rng() * Math.PI * 2,
      });
    }
    return result;
  }, []);

  const stalagmites = React.useMemo(() => {
    const rng = seeded(6543);
    const result: FormationData[] = [];
    const count = 9;
    for (let i = 0; i < count; i++) {
      result.push({
        x: 0.05 + rng() * 0.9,
        length: 40 + rng() * 100,
        baseWidth: 14 + rng() * 30,
        colorIdx: Math.floor(rng() * COLORS.length),
        sparklePhase: rng() * Math.PI * 2,
      });
    }
    return result;
  }, []);

  const waterDrops = React.useMemo(() => {
    const rng = seeded(2222);
    const result: WaterDrop[] = [];
    for (let i = 0; i < 8; i++) {
      result.push({
        sourceIdx: Math.floor(rng() * 14),
        phase: rng() * 200,
        speed: 2 + rng() * 3,
        fallCycle: 60 + Math.floor(rng() * 90),
      });
    }
    return result;
  }, []);

  const sparkles = React.useMemo(() => {
    const rng = seeded(1111);
    return Array.from({ length: 20 }, () => ({
      x: rng(),
      y: rng(),
      onTop: rng() > 0.5, // top or bottom region
      size: 1 + rng() * 2,
      phase: rng() * Math.PI * 2,
      freq: 0.03 + rng() * 0.06,
    }));
  }, []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Drop frequency: more drops at higher energy
  const dropVisibility = interpolate(energy, [0.03, 0.2], [0.3, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity, willChange: "opacity" }}
      >
        <defs>
          <filter id="cave-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="stalactite-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8B7355" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#A0885C" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#C4A265" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="stalagmite-grad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#6B5B45" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#8B7355" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#B09060" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Stalactites (hanging from top) */}
        {stalactites.map((s, si) => {
          const sx = s.x * width;
          const tipY = s.length + energy * 20;
          const halfW = s.baseWidth / 2;
          // Triangle: base at top, tip pointing down
          const points = `${sx - halfW},0 ${sx + halfW},0 ${sx},${tipY}`;
          const highlight = Math.sin(frame * 0.02 + s.sparklePhase) * 0.15 + 0.1;
          return (
            <g key={`stalactite-${si}`}>
              <polygon
                points={points}
                fill={COLORS[s.colorIdx]}
                opacity={0.6}
              />
              {/* Wet sheen line */}
              <line
                x1={sx}
                y1={4}
                x2={sx}
                y2={tipY - 2}
                stroke="#D4C8A0"
                strokeWidth={1}
                opacity={highlight}
              />
              {/* Drip bulge at tip */}
              <circle
                cx={sx}
                cy={tipY}
                r={2 + energy * 1.5}
                fill="#88AACC"
                opacity={0.3 + energy * 0.2}
              />
            </g>
          );
        })}

        {/* Stalagmites (growing from bottom) */}
        {stalagmites.map((s, si) => {
          const sx = s.x * width;
          const baseY = height;
          const tipY = height - s.length - energy * 15;
          const halfW = s.baseWidth / 2;
          // Triangle: base at bottom, tip pointing up
          const points = `${sx - halfW},${baseY} ${sx + halfW},${baseY} ${sx},${tipY}`;
          return (
            <g key={`stalagmite-${si}`}>
              <polygon
                points={points}
                fill={COLORS[s.colorIdx]}
                opacity={0.55}
              />
              {/* Highlight edge */}
              <line
                x1={sx - halfW * 0.3}
                y1={baseY}
                x2={sx}
                y2={tipY + 4}
                stroke="#E0D0A0"
                strokeWidth={0.8}
                opacity={0.15}
              />
            </g>
          );
        })}

        {/* Water drops */}
        {waterDrops.map((drop, di) => {
          if (di / waterDrops.length > dropVisibility) return null;

          const src = stalactites[drop.sourceIdx];
          if (!src) return null;

          const sx = src.x * width;
          const startY = src.length;
          const targetY = height;
          const dropCycle = drop.fallCycle;
          const t = ((cycleFrame + drop.phase) % dropCycle) / dropCycle;

          // Drop falls with acceleration
          const fallProgress = t * t; // quadratic ease-in
          const dy = startY + fallProgress * (targetY - startY);

          // Splash at bottom
          const isSplashing = fallProgress > 0.95;
          const splashProgress = isSplashing ? (fallProgress - 0.95) / 0.05 : 0;

          if (t < 0.02) return null; // forming phase

          return (
            <g key={`drop-${di}`}>
              {!isSplashing && (
                <ellipse
                  cx={sx}
                  cy={dy}
                  rx={1.5}
                  ry={2.5}
                  fill="#88BBDD"
                  opacity={0.6}
                />
              )}
              {isSplashing && (
                <>
                  {/* Splash rings */}
                  <ellipse
                    cx={sx}
                    cy={targetY - 5}
                    rx={4 + splashProgress * 12}
                    ry={2 + splashProgress * 4}
                    fill="none"
                    stroke="#88BBDD"
                    strokeWidth={0.8}
                    opacity={(1 - splashProgress) * 0.5}
                  />
                  {/* Splash droplets */}
                  <circle cx={sx - 4 * splashProgress} cy={targetY - 8 * splashProgress} r={1} fill="#88BBDD" opacity={(1 - splashProgress) * 0.4} />
                  <circle cx={sx + 3 * splashProgress} cy={targetY - 6 * splashProgress} r={0.8} fill="#88BBDD" opacity={(1 - splashProgress) * 0.4} />
                </>
              )}
            </g>
          );
        })}

        {/* Mineral sparkles */}
        {sparkles.map((sp, si) => {
          const sparkleOpacity = Math.sin(frame * sp.freq + sp.phase) * 0.5 + 0.5;
          if (sparkleOpacity < 0.3) return null;
          const sy = sp.onTop ? sp.y * height * 0.3 : height - sp.y * height * 0.25;
          return (
            <circle
              key={`sparkle-${si}`}
              cx={sp.x * width}
              cy={sy}
              r={sp.size}
              fill="#FFEEBB"
              opacity={sparkleOpacity * 0.4 * (0.5 + energy)}
              filter="url(#cave-glow)"
            />
          );
        })}
      </svg>
    </div>
  );
};
