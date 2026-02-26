/**
 * Seahorses — 3-5 seahorse shapes floating vertically.
 * Each seahorse has a curled tail, snout, dorsal fin ridge, and belly segments.
 * Bodies gently bob up/down. Tails curl tighter with energy.
 * Iridescent purple/gold/cyan colors. Tiny bubble trails from snouts.
 * Cycle: 60s, 16s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1800;    // 60 seconds at 30fps
const DURATION = 480;  // 16 seconds
const NUM_SEAHORSES = 4;
const NUM_BUBBLES_PER = 3;

const SEAHORSE_PALETTES = [
  { body: "#9B59B6", highlight: "#D4A0FF", accent: "#E8D44D" },
  { body: "#00BCD4", highlight: "#66FFEE", accent: "#FFD700" },
  { body: "#8E44AD", highlight: "#BB77FF", accent: "#00E5FF" },
  { body: "#1ABC9C", highlight: "#55FFD4", accent: "#FF88CC" },
  { body: "#6C3483", highlight: "#A855F7", accent: "#FFE066" },
];

interface SeahorseData {
  x: number;
  y: number;
  size: number;
  paletteIdx: number;
  bobSpeed: number;
  bobPhase: number;
  bobAmp: number;
  driftSpeed: number;
  driftPhase: number;
  facing: number;
  tailCurlBase: number;
  bellySegments: number;
}

function generateSeahorses(seed: number): SeahorseData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_SEAHORSES }, () => ({
    x: 0.1 + rng() * 0.8,
    y: 0.2 + rng() * 0.5,
    size: 28 + rng() * 22,
    paletteIdx: Math.floor(rng() * SEAHORSE_PALETTES.length),
    bobSpeed: 0.02 + rng() * 0.015,
    bobPhase: rng() * Math.PI * 2,
    bobAmp: 10 + rng() * 20,
    driftSpeed: 0.005 + rng() * 0.008,
    driftPhase: rng() * Math.PI * 2,
    facing: rng() > 0.5 ? 1 : -1,
    tailCurlBase: 1.5 + rng() * 0.8,
    bellySegments: 5 + Math.floor(rng() * 3),
  }));
}

function buildSeahorsePath(
  size: number,
  tailCurl: number,
): string {
  // Body: starts at head, curves down through body to tail
  const s = size;
  // Head/snout
  const headX = s * 0.4;
  const headY = -s * 1.2;
  // Chest
  const chestX = s * 0.3;
  const chestY = -s * 0.6;
  // Belly
  const bellyX = s * 0.35;
  const bellyY = 0;
  // Tail start
  const tailStartX = s * 0.1;
  const tailStartY = s * 0.5;

  // Curled tail (spiral)
  const tailMidX = -s * 0.2 * tailCurl;
  const tailMidY = s * 0.8;
  const tailEndX = -s * 0.1 * tailCurl;
  const tailEndY = s * 1.0;
  const tailTipX = s * 0.05 * tailCurl;
  const tailTipY = s * 0.9;

  return [
    `M ${headX} ${headY}`,
    // Snout extending forward
    `L ${s * 0.8} ${headY - s * 0.05}`,
    `L ${s * 0.85} ${headY}`,
    `L ${headX + s * 0.1} ${headY + s * 0.05}`,
    // Back of head curve
    `Q ${headX - s * 0.1} ${headY + s * 0.1}, ${s * 0.15} ${-s * 0.9}`,
    // Dorsal ridge (back of body)
    `Q ${-s * 0.05} ${-s * 0.5}, ${-s * 0.05} ${0}`,
    // Down to tail
    `Q ${-s * 0.05} ${s * 0.3}, ${tailStartX} ${tailStartY}`,
    // Curled tail
    `Q ${tailMidX} ${tailMidY}, ${tailEndX} ${tailEndY}`,
    `Q ${tailTipX} ${tailTipY + s * 0.05}, ${tailTipX} ${tailTipY}`,
    // Back up inside of tail
    `Q ${tailMidX + s * 0.15} ${tailMidY - s * 0.05}, ${tailStartX + s * 0.1} ${tailStartY}`,
    // Belly (front)
    `Q ${bellyX + s * 0.05} ${bellyY + s * 0.1}, ${bellyX} ${bellyY}`,
    // Front of body up to chest
    `Q ${chestX + s * 0.1} ${chestY + s * 0.1}, ${chestX} ${chestY}`,
    // Back to head
    `Q ${headX + s * 0.05} ${headY + s * 0.2}, ${headX} ${headY}`,
    "Z",
  ].join(" ");
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Seahorses: React.FC<Props> = ({ frames }) => {
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

  const seahorses = React.useMemo(() => generateSeahorses(6060), []);

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
  const opacity = Math.min(fadeIn, fadeOut) * 0.65;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="seahorse-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {seahorses.map((sh, si) => {
          const palette = SEAHORSE_PALETTES[sh.paletteIdx];
          const bob = Math.sin(frame * sh.bobSpeed + sh.bobPhase) * sh.bobAmp;
          const drift = Math.sin(frame * sh.driftSpeed + sh.driftPhase) * 15;
          const sx = sh.x * width + drift;
          const sy = sh.y * height + bob;

          // Tail curl increases with energy
          const tailCurl = sh.tailCurlBase + energy * 1.2;
          const bodyPath = buildSeahorsePath(sh.size, tailCurl);

          // Dorsal fin ridge bumps
          const finBumps: Array<{ x: number; y: number; r: number }> = [];
          for (let b = 0; b < 4; b++) {
            const t = 0.3 + b * 0.15;
            finBumps.push({
              x: -sh.size * 0.08 - b * 2,
              y: -sh.size * (0.9 - t * 1.2),
              r: 2 + energy * 2,
            });
          }

          // Belly segments
          const bellyLines: Array<{ y1: number; x1: number; x2: number }> = [];
          for (let b = 0; b < sh.bellySegments; b++) {
            const t = b / sh.bellySegments;
            bellyLines.push({
              y1: -sh.size * 0.4 + t * sh.size * 0.9,
              x1: sh.size * 0.05,
              x2: sh.size * 0.3 * (1 - Math.abs(t - 0.5) * 1.2),
            });
          }

          // Snout bubbles
          const snoutX = sh.size * 0.85;
          const snoutY = -sh.size * 1.2;

          return (
            <g
              key={`sh-${si}`}
              transform={`translate(${sx},${sy}) scale(${sh.facing},1)`}
              filter="url(#seahorse-glow)"
            >
              {/* Main body */}
              <path
                d={bodyPath}
                fill={palette.body}
                stroke={palette.highlight}
                strokeWidth={1.5}
                opacity={0.6}
              />

              {/* Dorsal fin bumps */}
              {finBumps.map((fb, fi) => (
                <circle
                  key={`fin-${fi}`}
                  cx={fb.x}
                  cy={fb.y}
                  r={fb.r}
                  fill={palette.accent}
                  opacity={0.4}
                />
              ))}

              {/* Belly segment lines */}
              {bellyLines.map((bl, bi) => (
                <line
                  key={`seg-${bi}`}
                  x1={bl.x1}
                  y1={bl.y1}
                  x2={bl.x2}
                  y2={bl.y1}
                  stroke={palette.highlight}
                  strokeWidth={0.8}
                  opacity={0.3}
                />
              ))}

              {/* Eye */}
              <circle
                cx={sh.size * 0.35}
                cy={-sh.size * 1.15}
                r={sh.size * 0.06}
                fill={palette.accent}
                opacity={0.7}
              />

              {/* Snout bubbles */}
              {Array.from({ length: NUM_BUBBLES_PER }, (_, bi) => {
                const bubT = ((frame * 0.02 + si * 1.3 + bi * 0.7) % 1);
                const bx = snoutX + bubT * 20 + Math.sin(frame * 0.08 + bi) * 3;
                const by = snoutY - bubT * 30;
                const bubOp = interpolate(bubT, [0, 0.1, 0.8, 1], [0, 0.35, 0.35, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                return (
                  <circle
                    key={`bub-${bi}`}
                    cx={bx}
                    cy={by}
                    r={1.5 + bi * 0.5}
                    fill="none"
                    stroke={palette.highlight}
                    strokeWidth={0.6}
                    opacity={bubOp}
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
