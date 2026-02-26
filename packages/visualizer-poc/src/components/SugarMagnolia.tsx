/**
 * SugarMagnolia -- Blooming magnolia flowers during crescendos.
 * 3-5 large flowers with 8-12 petals arranged radially.
 * Flowers bloom: petals scale from 0 to full size sequentially.
 * Center has stamen dots. Positioned at edges/corners.
 * Only bloom during rising energy (> 0.15).
 * Colors: pink, magenta, white, cream with green stems.
 * Bloom cycle: every 40s, 12s bloom duration. Flowers gently sway.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FlowerData {
  /** Position x 0-1 */
  x: number;
  /** Position y 0-1 */
  y: number;
  /** Number of petals */
  petalCount: number;
  /** Petal length */
  petalLength: number;
  /** Petal width */
  petalWidth: number;
  /** Base rotation */
  baseAngle: number;
  /** Sway speed */
  swaySpeed: number;
  /** Sway amplitude */
  swayAmp: number;
  /** Color index */
  colorIdx: number;
  /** Stamen count */
  stamenCount: number;
  /** Bloom delay (stagger among flowers) */
  bloomDelay: number;
  /** Stem length */
  stemLength: number;
  /** Stem curve direction */
  stemCurve: number;
}

const FLOWER_COLORS = [
  { petal: "#FF69B4", petalInner: "#FFB6D9", stamen: "#FFD700" }, // hot pink
  { petal: "#FF1493", petalInner: "#FF6EB4", stamen: "#FFA500" }, // deep pink
  { petal: "#DA70D6", petalInner: "#E8A0E8", stamen: "#FFD700" }, // orchid
  { petal: "#FFF0F5", petalInner: "#FFFFFF", stamen: "#FFE4B5" }, // lavender blush / white
  { petal: "#FFE4C4", petalInner: "#FFFAF0", stamen: "#DAA520" }, // cream
];

const NUM_FLOWERS = 4;
const CYCLE = 1200; // 40 seconds at 30fps
const DURATION = 360; // 12 seconds at 30fps

/** Corner/edge positions for flowers */
const POSITIONS: [number, number][] = [
  [0.08, 0.15], [0.92, 0.12], [0.06, 0.82], [0.93, 0.85], [0.5, 0.06],
];

function generateFlowers(seed: number): FlowerData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_FLOWERS }, (_, i) => {
    const pos = POSITIONS[i % POSITIONS.length];
    return {
      x: pos[0] + (rng() - 0.5) * 0.06,
      y: pos[1] + (rng() - 0.5) * 0.06,
      petalCount: 8 + Math.floor(rng() * 5), // 8-12
      petalLength: 50 + rng() * 30,
      petalWidth: 20 + rng() * 15,
      baseAngle: rng() * Math.PI * 2,
      swaySpeed: 0.015 + rng() * 0.01,
      swayAmp: 3 + rng() * 5,
      colorIdx: Math.floor(rng() * FLOWER_COLORS.length),
      stamenCount: 5 + Math.floor(rng() * 4),
      bloomDelay: i * 0.12, // stagger blooms
      stemLength: 80 + rng() * 60,
      stemCurve: (rng() - 0.5) * 40,
    };
  });
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SugarMagnolia: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const flowers = React.useMemo(() => generateFlowers(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  // Only bloom during rising energy
  if (energy < 0.15) return null;

  const progress = cycleFrame / DURATION;

  const masterOpacity = interpolate(progress, [0, 0.08, 0.85, 1], [0, 0.75, 0.75, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (masterOpacity < 0.01) return null;

  // Energy drives bloom fullness
  const energyBloom = interpolate(energy, [0.15, 0.35], [0.5, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          {FLOWER_COLORS.map((c, i) => (
            <radialGradient key={`petal-grad-${i}`} id={`sm-petal-${i}`} cx="30%" cy="30%" r="70%">
              <stop offset="0%" stopColor={c.petalInner} stopOpacity="0.9" />
              <stop offset="100%" stopColor={c.petal} stopOpacity="0.7" />
            </radialGradient>
          ))}
        </defs>

        {flowers.map((flower, fi) => {
          const fx = flower.x * width;
          const fy = flower.y * height;

          // Sway
          const sway = Math.sin(frame * flower.swaySpeed + fi * 1.5) * flower.swayAmp;

          // Bloom progress for this flower (delayed)
          const bloomEnd = Math.min(flower.bloomDelay + 0.5, 0.84);
          const bloomP = interpolate(
            progress,
            [flower.bloomDelay, bloomEnd, 0.85, 1],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          ) * energyBloom;

          const colors = FLOWER_COLORS[flower.colorIdx];
          const glowColor = colors.petal;

          // Stem control points
          const stemEndX = fx + sway;
          const stemEndY = fy;
          const stemStartX = fx + sway * 0.3;
          const stemStartY = fy + flower.stemLength;
          const stemCtrlX = fx + flower.stemCurve + sway * 0.6;
          const stemCtrlY = fy + flower.stemLength * 0.5;

          return (
            <g
              key={`flower-${fi}`}
              style={{ filter: `drop-shadow(0 0 8px ${glowColor}) drop-shadow(0 0 16px ${glowColor})` }}
            >
              {/* Stem */}
              <path
                d={`M ${stemStartX} ${stemStartY} Q ${stemCtrlX} ${stemCtrlY} ${stemEndX} ${stemEndY}`}
                stroke="hsla(120, 60%, 35%, 0.6)"
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
              />

              {/* Leaf on stem */}
              <ellipse
                cx={stemCtrlX + 12}
                cy={stemCtrlY + 5}
                rx={14 * bloomP}
                ry={6 * bloomP}
                fill="hsla(120, 55%, 40%, 0.5)"
                transform={`rotate(${25 + sway}, ${stemCtrlX + 12}, ${stemCtrlY + 5})`}
              />

              {/* Petals: sequential bloom */}
              {Array.from({ length: flower.petalCount }, (_, pi) => {
                const petalAngle = flower.baseAngle + (pi / flower.petalCount) * Math.PI * 2;
                // Each petal blooms sequentially
                const petalProgress = interpolate(
                  bloomP,
                  [pi / flower.petalCount * 0.6, pi / flower.petalCount * 0.6 + 0.4],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );

                if (petalProgress < 0.01) return null;

                const petalX = stemEndX + Math.cos(petalAngle) * flower.petalLength * 0.3 * petalProgress;
                const petalY = stemEndY + Math.sin(petalAngle) * flower.petalLength * 0.3 * petalProgress;

                return (
                  <ellipse
                    key={`petal-${pi}`}
                    cx={petalX}
                    cy={petalY}
                    rx={flower.petalWidth * 0.5 * petalProgress}
                    ry={flower.petalLength * 0.5 * petalProgress}
                    fill={`url(#sm-petal-${flower.colorIdx})`}
                    transform={`rotate(${petalAngle * (180 / Math.PI)}, ${petalX}, ${petalY})`}
                  />
                );
              })}

              {/* Center / stamen */}
              <circle
                cx={stemEndX}
                cy={stemEndY}
                r={8 * bloomP}
                fill={`hsla(45, 80%, 55%, ${0.7 * bloomP})`}
              />
              {/* Stamen dots */}
              {Array.from({ length: flower.stamenCount }, (_, si) => {
                const sa = (si / flower.stamenCount) * Math.PI * 2 + frame * 0.005;
                const sr = 4 + si * 1.5;
                return (
                  <circle
                    key={`stamen-${si}`}
                    cx={stemEndX + Math.cos(sa) * sr * bloomP}
                    cy={stemEndY + Math.sin(sa) * sr * bloomP}
                    r={2 * bloomP}
                    fill={colors.stamen}
                    opacity={0.8 * bloomP}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
