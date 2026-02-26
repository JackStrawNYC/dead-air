/**
 * VineGrowth — Climbing vine tendrils growing from bottom corners upward.
 * Organic bezier curves with small leaves branching off. Vine growth speed
 * driven by energy. Deep green stems with lighter green leaves. New vine
 * segments appear progressively. Leaves unfurl when vine reaches their position.
 * Cycle: 65s, 25s grow duration.
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

const CYCLE = 1950; // 65s at 30fps
const DURATION = 750; // 25s grow duration

interface VineSegment {
  /** Control points for bezier: [startX, startY, cp1x, cp1y, cp2x, cp2y, endX, endY] */
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  ex: number;
  ey: number;
  /** 0-1 normalized time when this segment should start growing */
  growStart: number;
  /** Thickness multiplier */
  thickness: number;
}

interface LeafData {
  /** Segment index this leaf is attached to */
  segmentIdx: number;
  /** Position along segment 0-1 */
  t: number;
  /** Leaf angle offset */
  angle: number;
  /** Leaf size */
  size: number;
  /** Side: -1 or 1 */
  side: number;
  /** Hue variation (around green) */
  hue: number;
}

interface VineData {
  /** Starting x (fraction of width) */
  startX: number;
  /** Starting from left (true) or right (false) */
  fromLeft: boolean;
  segments: VineSegment[];
  leaves: LeafData[];
}

const NUM_VINES = 4;
const SEGMENTS_PER_VINE = 12;
const LEAVES_PER_VINE = 18;

function generateVines(seed: number): VineData[] {
  const rng = seeded(seed);
  const vines: VineData[] = [];

  for (let v = 0; v < NUM_VINES; v++) {
    const fromLeft = v % 2 === 0;
    const startX = fromLeft ? 0.02 + rng() * 0.08 : 0.9 + rng() * 0.08;
    const segments: VineSegment[] = [];
    let curX = startX;
    let curY = 1.0; // start at bottom

    for (let s = 0; s < SEGMENTS_PER_VINE; s++) {
      const segHeight = 0.05 + rng() * 0.04;
      const drift = (rng() - 0.4) * 0.08 * (fromLeft ? 1 : -1);
      const endX = Math.max(0.01, Math.min(0.99, curX + drift));
      const endY = curY - segHeight;

      segments.push({
        cx1: curX + (rng() - 0.5) * 0.06,
        cy1: curY - segHeight * 0.3,
        cx2: endX + (rng() - 0.5) * 0.06,
        cy2: endY + segHeight * 0.3,
        ex: endX,
        ey: endY,
        growStart: s / SEGMENTS_PER_VINE,
        thickness: 1 - s * 0.06,
      });

      curX = endX;
      curY = endY;
    }

    const leaves: LeafData[] = [];
    for (let l = 0; l < LEAVES_PER_VINE; l++) {
      const segIdx = Math.floor(rng() * SEGMENTS_PER_VINE);
      leaves.push({
        segmentIdx: segIdx,
        t: rng(),
        angle: (rng() - 0.5) * 1.2,
        size: 6 + rng() * 10,
        side: rng() > 0.5 ? 1 : -1,
        hue: 100 + rng() * 40, // green range
      });
    }

    vines.push({ startX, fromLeft, segments, leaves });
  }

  return vines;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const VineGrowth: React.FC<Props> = ({ frames }) => {
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

  const vines = React.useMemo(() => generateVines(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const growSpeed = 0.7 + energy * 1.5;
  const growProgress = Math.min(1, progress * growSpeed);

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
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.5 + energy * 0.3);

  if (masterOpacity < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 4px rgba(50, 200, 80, 0.4))`,
        }}
      >
        <defs>
          <filter id="vine-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {vines.map((vine, vi) => {
          let prevX = vine.startX * width;
          let prevY = height;

          return (
            <g key={vi}>
              {/* Vine stems */}
              {vine.segments.map((seg, si) => {
                const segGrowFraction = interpolate(
                  growProgress,
                  [seg.growStart, Math.min(1, seg.growStart + 1 / SEGMENTS_PER_VINE)],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );

                if (segGrowFraction < 0.01) {
                  return null;
                }

                const sx = prevX;
                const sy = prevY;
                const cx1 = seg.cx1 * width;
                const cy1 = seg.cy1 * height;
                const cx2 = seg.cx2 * width;
                const cy2 = seg.cy2 * height;
                const ex = seg.ex * width;
                const ey = seg.ey * height;

                // Sway with energy
                const sway = Math.sin(frame * 0.008 + vi * 2 + si * 0.5) * (3 + energy * 8);

                const strokeW = Math.max(1, (3.5 - si * 0.2) * seg.thickness);
                const greenVal = 120 + si * 8;
                const stemColor = `rgba(30, ${greenVal}, 40, ${0.7 + energy * 0.2})`;

                // Build path with partial growth using dasharray
                const pathD = `M ${sx + sway * 0.3} ${sy} C ${cx1 + sway * 0.5} ${cy1}, ${cx2 + sway * 0.7} ${cy2}, ${ex + sway} ${ey}`;
                // Approximate arc length
                const approxLen = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2) * 1.4;
                const drawnLen = approxLen * segGrowFraction;

                // Update prev for next segment
                prevX = ex + sway;
                prevY = ey;

                return (
                  <path
                    key={si}
                    d={pathD}
                    stroke={stemColor}
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={`${drawnLen} ${approxLen}`}
                    filter={si > 8 ? "url(#vine-glow)" : undefined}
                  />
                );
              })}

              {/* Leaves */}
              {vine.leaves.map((leaf, li) => {
                const seg = vine.segments[leaf.segmentIdx];
                const segGrowFraction = interpolate(
                  growProgress,
                  [seg.growStart, Math.min(1, seg.growStart + 1 / SEGMENTS_PER_VINE)],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );

                // Leaf only appears when its segment is fully grown
                if (segGrowFraction < 0.9) return null;

                const leafUnfurl = interpolate(segGrowFraction, [0.9, 1], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.cubic),
                });

                // Position along segment
                const lx = (vine.startX + seg.ex * leaf.t) * width * 0.5 + width * 0.25;
                const ly = (1.0 - (1.0 - seg.ey) * leaf.t) * height;

                const sway = Math.sin(frame * 0.012 + li * 1.3) * 3;
                const leafScale = leafUnfurl * (0.8 + energy * 0.4);
                const rot = leaf.angle * 57.3 + leaf.side * 30 + sway;
                const leafColor = `hsl(${leaf.hue}, 65%, ${45 + energy * 15}%)`;

                return (
                  <g
                    key={`leaf-${li}`}
                    transform={`translate(${lx + sway}, ${ly}) rotate(${rot}) scale(${leafScale})`}
                  >
                    {/* Leaf shape: simple elliptical with pointed tip */}
                    <ellipse
                      cx={0}
                      cy={-leaf.size * 0.4}
                      rx={leaf.size * 0.35}
                      ry={leaf.size * 0.6}
                      fill={leafColor}
                      opacity={0.7}
                    />
                    {/* Leaf vein */}
                    <line
                      x1={0}
                      y1={0}
                      x2={0}
                      y2={-leaf.size * 0.9}
                      stroke={`hsl(${leaf.hue - 10}, 50%, 35%)`}
                      strokeWidth={0.8}
                      opacity={0.5}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
