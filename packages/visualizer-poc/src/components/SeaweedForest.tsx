/**
 * SeaweedForest — 10-15 vertical seaweed strands swaying from bottom.
 * Each strand is a wavy line with leaf-like fronds branching off.
 * Deep green/emerald palette with bioluminescent tips.
 * Sway amplitude and frequency driven by energy (gentle in quiet, wild in loud).
 * Cycle: 55s, always visible at 0.08-0.2 opacity.
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

const CYCLE = 1650;     // 55 seconds at 30fps
const NUM_STRANDS = 13;
const SEGMENTS_PER_STRAND = 16;

const SEAWEED_COLORS = [
  "#0D5E2F", "#1A7A42", "#0A6B3A", "#2E8B57",
  "#006644", "#1B6B3A", "#237A4B",
];

const TIP_COLORS = [
  "#00FFAA", "#44FFCC", "#00FF88", "#66FFDD",
  "#33FFBB", "#00FFCC", "#88FFE0",
];

interface StrandData {
  baseX: number;
  height: number;
  colorIdx: number;
  tipColorIdx: number;
  swaySpeed: number;
  swayPhase: number;
  swayAmplitude: number;
  thickness: number;
  frondCount: number;
  frondSide: number;     // 1 or -1 for starting side
}

interface FrondData {
  segIndex: number;
  side: number;
  length: number;
  angle: number;
  curve: number;
}

function generateStrands(seed: number): StrandData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_STRANDS }, () => ({
    baseX: 0.03 + rng() * 0.94,
    height: 150 + rng() * 350,
    colorIdx: Math.floor(rng() * SEAWEED_COLORS.length),
    tipColorIdx: Math.floor(rng() * TIP_COLORS.length),
    swaySpeed: 0.012 + rng() * 0.018,
    swayPhase: rng() * Math.PI * 2,
    swayAmplitude: 8 + rng() * 15,
    thickness: 2 + rng() * 3,
    frondCount: 4 + Math.floor(rng() * 5),
    frondSide: rng() > 0.5 ? 1 : -1,
  }));
}

function generateFronds(strand: StrandData, seed: number): FrondData[] {
  const rng = seeded(seed);
  return Array.from({ length: strand.frondCount }, (_, i) => {
    const side = strand.frondSide * (i % 2 === 0 ? 1 : -1);
    return {
      segIndex: 3 + Math.floor(rng() * (SEGMENTS_PER_STRAND - 5)),
      side,
      length: 15 + rng() * 30,
      angle: (0.3 + rng() * 0.6) * side,
      curve: (rng() - 0.5) * 0.5,
    };
  });
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SeaweedForest: React.FC<Props> = ({ frames }) => {
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

  const strands = React.useMemo(() => generateStrands(5501), []);
  const allFronds = React.useMemo(() => {
    return strands.map((s, i) => generateFronds(s, 5501 + i * 100));
  }, [strands]);

  // Always visible with cycling opacity
  const cycleFrame = frame % CYCLE;
  const cycleProgress = cycleFrame / CYCLE;
  const breathe = interpolate(
    Math.sin(cycleProgress * Math.PI * 2),
    [-1, 1],
    [0.08, 0.2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = breathe + energy * 0.1;

  // Energy drives sway intensity
  const swayMult = interpolate(energy, [0.02, 0.3], [0.4, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: Math.min(opacity, 0.3), pointerEvents: "none" }}
      >
        <defs>
          <filter id="seaweed-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {strands.map((strand, si) => {
          const color = SEAWEED_COLORS[strand.colorIdx];
          const tipColor = TIP_COLORS[strand.tipColorIdx];
          const bx = strand.baseX * width;
          const by = height;

          // Build wavy strand path
          const points: Array<[number, number]> = [];
          for (let seg = 0; seg <= SEGMENTS_PER_STRAND; seg++) {
            const t = seg / SEGMENTS_PER_STRAND;
            const segDelay = t * 2.0; // wave propagation delay
            const sway = Math.sin(
              frame * strand.swaySpeed * swayMult + strand.swayPhase - segDelay,
            ) * strand.swayAmplitude * swayMult * t;
            const px = bx + sway;
            const py = by - t * strand.height;
            points.push([px, py]);
          }

          // Convert to smooth path
          let pathD = `M ${points[0][0]} ${points[0][1]}`;
          for (let p = 1; p < points.length; p++) {
            const prev = points[p - 1];
            const curr = points[p];
            const cpx = (prev[0] + curr[0]) / 2;
            pathD += ` Q ${prev[0]} ${prev[1]}, ${cpx} ${(prev[1] + curr[1]) / 2}`;
          }
          const lastPt = points[points.length - 1];
          pathD += ` L ${lastPt[0]} ${lastPt[1]}`;

          const fronds = allFronds[si];

          return (
            <g key={`strand-${si}`}>
              {/* Main strand */}
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={strand.thickness}
                strokeLinecap="round"
                opacity={0.7}
              />

              {/* Fronds (leaf-like branches) */}
              {fronds.map((frond, fi) => {
                if (frond.segIndex >= points.length) return null;
                const [fx, fy] = points[frond.segIndex];
                const frondSway = Math.sin(
                  frame * strand.swaySpeed * swayMult * 1.3 + strand.swayPhase + fi * 0.5,
                ) * 5 * swayMult;
                const endX = fx + (frond.length + frondSway) * Math.cos(frond.angle);
                const endY = fy - frond.length * 0.6 * Math.sin(Math.abs(frond.angle));
                const cpX = fx + frond.length * 0.5 * Math.cos(frond.angle) + frond.curve * 15;
                const cpY = fy - frond.length * 0.3;

                return (
                  <path
                    key={`frond-${fi}`}
                    d={`M ${fx} ${fy} Q ${cpX} ${cpY}, ${endX} ${endY}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={strand.thickness * 0.6}
                    strokeLinecap="round"
                    opacity={0.5}
                  />
                );
              })}

              {/* Bioluminescent tip */}
              <circle
                cx={lastPt[0]}
                cy={lastPt[1]}
                r={3 + energy * 4}
                fill={tipColor}
                opacity={0.4 + Math.sin(frame * 0.05 + si) * 0.15}
                filter="url(#seaweed-glow)"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
