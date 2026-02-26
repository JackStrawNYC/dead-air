/**
 * HoneycombGrid -- Hexagonal honeycomb grid pattern.
 * Hexagons fill progressively from center outward. Each hex has a warm
 * amber/gold fill with darker edges. Some cells drip honey (small droplet
 * shapes hanging from bottom edges). Cells pulse brighter with energy.
 * Bees (tiny oval shapes) buzz around edges.
 * Cycle: 65s, 20s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 1950; // 65 seconds at 30fps
const DURATION = 600; // 20 seconds visible

const HEX_SIZE = 28; // radius of each hexagon
const HEX_GAP = 3;

interface HexCell {
  col: number;
  row: number;
  cx: number;
  cy: number;
  distFromCenter: number;
  hasDrip: boolean;
  dripPhase: number;
  dripLen: number;
}

interface Bee {
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  wobbleAmp: number;
  wobbleSpeed: number;
  size: number;
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 - 30) * Math.PI / 180;
    pts.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`);
  }
  return pts.join(" ");
}

interface Props {
  frames: EnhancedFrameData[];
}

export const HoneycombGrid: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate hex grid and bees
  const { hexCells, bees } = React.useMemo(() => {
    const rng = seeded(77050807);
    const cells: HexCell[] = [];
    const screenCx = width / 2;
    const screenCy = height / 2;

    const hexW = (HEX_SIZE + HEX_GAP) * Math.sqrt(3);
    const hexH = (HEX_SIZE + HEX_GAP) * 1.5;
    const cols = Math.ceil(width / hexW) + 2;
    const rows = Math.ceil(height / hexH) + 2;
    const startCol = -Math.floor(cols / 2);
    const startRow = -Math.floor(rows / 2);

    for (let row = startRow; row <= startRow + rows; row++) {
      for (let col = startCol; col <= startCol + cols; col++) {
        const offsetX = (row % 2 !== 0) ? hexW * 0.5 : 0;
        const cx = screenCx + col * hexW + offsetX;
        const cy = screenCy + row * hexH;
        const dx = cx - screenCx;
        const dy = cy - screenCy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        cells.push({
          col,
          row,
          cx,
          cy,
          distFromCenter: dist,
          hasDrip: rng() < 0.15,
          dripPhase: rng() * Math.PI * 2,
          dripLen: 5 + rng() * 12,
        });
      }
    }

    // Sort by distance for progressive reveal
    cells.sort((a, b) => a.distFromCenter - b.distFromCenter);

    // Bees
    const beeList: Bee[] = [];
    for (let i = 0; i < 5; i++) {
      beeList.push({
        orbitRadius: 80 + rng() * 200,
        orbitSpeed: 0.008 + rng() * 0.015,
        orbitPhase: rng() * Math.PI * 2,
        wobbleAmp: 5 + rng() * 15,
        wobbleSpeed: 0.05 + rng() * 0.1,
        size: 4 + rng() * 3,
      });
    }

    return { hexCells: cells, bees: beeList };
  }, [width, height]);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Progressive reveal: more cells appear over time
  const maxDist = Math.sqrt((width / 2) ** 2 + (height / 2) ** 2);
  const revealRadius = interpolate(progress, [0.02, 0.6], [0, maxDist], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Energy pulse brightness
  const energyPulse = interpolate(energy, [0.03, 0.3], [0.3, 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowSize = interpolate(energy, [0.03, 0.3], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const amberFill = "#DAA520";
  const amberDark = "#B8860B";
  const honeyDrip = "#CD8500";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px rgba(218, 165, 32, 0.4))`,
          willChange: "opacity",
        }}
      >
        {/* Hexagon cells */}
        {hexCells.map((cell, ci) => {
          if (cell.distFromCenter > revealRadius) return null;

          // Fade in as reveal reaches this cell
          const cellFade = interpolate(
            revealRadius - cell.distFromCenter,
            [0, 40],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          // Energy-driven brightness variation per cell
          const cellPulse = Math.sin(cycleFrame * 0.04 + ci * 0.7) * 0.15 + energyPulse;
          const fillOpacity = cellFade * cellPulse * 0.4;
          const strokeOpacity = cellFade * 0.3;

          return (
            <g key={`hex-${ci}`}>
              <polygon
                points={hexPoints(cell.cx, cell.cy, HEX_SIZE)}
                fill={amberFill}
                fillOpacity={fillOpacity}
                stroke={amberDark}
                strokeWidth={1.2}
                opacity={strokeOpacity}
              />

              {/* Honey drip */}
              {cell.hasDrip && cellFade > 0.5 && (
                <g>
                  {/* Drip line */}
                  <line
                    x1={cell.cx}
                    y1={cell.cy + HEX_SIZE * 0.85}
                    x2={cell.cx}
                    y2={cell.cy + HEX_SIZE * 0.85 + cell.dripLen + Math.sin(cycleFrame * 0.03 + cell.dripPhase) * 4}
                    stroke={honeyDrip}
                    strokeWidth={2}
                    opacity={0.3 * cellFade}
                    strokeLinecap="round"
                  />
                  {/* Drip droplet */}
                  <ellipse
                    cx={cell.cx}
                    cy={cell.cy + HEX_SIZE * 0.85 + cell.dripLen + Math.sin(cycleFrame * 0.03 + cell.dripPhase) * 4 + 3}
                    rx={2.5}
                    ry={3.5}
                    fill={honeyDrip}
                    opacity={0.35 * cellFade}
                  />
                </g>
              )}
            </g>
          );
        })}

        {/* Bees */}
        {bees.map((bee, bi) => {
          const beeAngle = cycleFrame * bee.orbitSpeed + bee.orbitPhase;
          const wobbleX = Math.sin(cycleFrame * bee.wobbleSpeed + bi * 3) * bee.wobbleAmp;
          const wobbleY = Math.cos(cycleFrame * bee.wobbleSpeed * 1.3 + bi * 2) * bee.wobbleAmp * 0.6;
          const bx = width / 2 + Math.cos(beeAngle) * bee.orbitRadius + wobbleX;
          const by = height / 2 + Math.sin(beeAngle) * bee.orbitRadius * 0.7 + wobbleY;

          // Only show bees within the reveal area
          const beeDist = Math.sqrt((bx - width / 2) ** 2 + (by - height / 2) ** 2);
          if (beeDist > revealRadius + 50) return null;

          const beeDir = beeAngle * 180 / Math.PI + 90;

          return (
            <g key={`bee-${bi}`} transform={`translate(${bx}, ${by}) rotate(${beeDir})`}>
              {/* Body */}
              <ellipse cx={0} cy={0} rx={bee.size * 0.5} ry={bee.size} fill="#2C2C00" opacity={0.4} />
              {/* Stripes */}
              <line x1={-bee.size * 0.4} y1={-bee.size * 0.3} x2={bee.size * 0.4} y2={-bee.size * 0.3} stroke="#FFD700" strokeWidth={1} opacity={0.3} />
              <line x1={-bee.size * 0.4} y1={bee.size * 0.1} x2={bee.size * 0.4} y2={bee.size * 0.1} stroke="#FFD700" strokeWidth={1} opacity={0.3} />
              {/* Wings */}
              <ellipse
                cx={-bee.size * 0.5}
                cy={-bee.size * 0.5}
                rx={bee.size * 0.6}
                ry={bee.size * 0.3}
                fill="white"
                opacity={0.15 + Math.sin(cycleFrame * 0.8 + bi) * 0.05}
                transform={`rotate(-20, ${-bee.size * 0.5}, ${-bee.size * 0.5})`}
              />
              <ellipse
                cx={bee.size * 0.5}
                cy={-bee.size * 0.5}
                rx={bee.size * 0.6}
                ry={bee.size * 0.3}
                fill="white"
                opacity={0.15 + Math.sin(cycleFrame * 0.8 + bi + 1) * 0.05}
                transform={`rotate(20, ${bee.size * 0.5}, ${-bee.size * 0.5})`}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
