/**
 * FernUnfurl — Fibonacci spiral fern fronds that unfurl from corners.
 * Self-similar branching pattern: each branch has smaller sub-branches.
 * Emerald/forest green palette with golden tips. Growth follows golden ratio
 * spiral. Energy drives unfurl speed. 2-3 fronds from different corners.
 * Cycle: 75s, 20s grow duration.
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

const CYCLE = 2250; // 75s at 30fps
const DURATION = 600; // 20s grow duration
const PHI = 1.618033988749;

interface FrondPoint {
  x: number;
  y: number;
  angle: number;
  /** Normalized position along spiral 0-1 */
  t: number;
  /** Depth level (0 = main spine, 1+ = sub-branches) */
  depth: number;
}

interface SubBranch {
  /** Index along parent spine */
  parentIdx: number;
  /** Side: -1 or 1 */
  side: number;
  /** Length */
  length: number;
  /** Angle relative to parent */
  angle: number;
  /** Sub-sub-branches */
  children: Array<{
    t: number;
    side: number;
    length: number;
  }>;
}

interface FrondData {
  /** Corner origin: 0=BL, 1=BR, 2=TL, 3=TR */
  corner: number;
  /** Base angle of frond */
  baseAngle: number;
  /** Spiral tightness */
  spiralTightness: number;
  /** Main spine points */
  spine: FrondPoint[];
  /** Sub-branches */
  branches: SubBranch[];
  /** Scale factor */
  scale: number;
}

const NUM_FRONDS = 3;
const SPINE_POINTS = 24;

function generateFronds(seed: number): FrondData[] {
  const rng = seeded(seed);
  const corners = [0, 1, 3]; // BL, BR, TR

  return corners.slice(0, NUM_FRONDS).map((corner, fi) => {
    const baseAngle = (() => {
      switch (corner) {
        case 0: return -Math.PI * 0.3 + rng() * 0.2; // BL -> upward right
        case 1: return -Math.PI * 0.7 + rng() * 0.2; // BR -> upward left
        case 2: return Math.PI * 0.3 + rng() * 0.2;  // TL -> downward right
        default: return Math.PI * 0.7 + rng() * 0.2;  // TR -> downward left
      }
    })();

    const spiralTightness = 0.08 + rng() * 0.04;
    const spine: FrondPoint[] = [];

    for (let i = 0; i < SPINE_POINTS; i++) {
      const t = i / (SPINE_POINTS - 1);
      // Golden spiral: r = a * phi^(2*theta/pi)
      const theta = t * Math.PI * 2.5;
      const r = 20 + t * 200;
      const spiralAngle = baseAngle + theta * spiralTightness;

      spine.push({
        x: Math.cos(spiralAngle) * r,
        y: Math.sin(spiralAngle) * r,
        angle: spiralAngle,
        t,
        depth: 0,
      });
    }

    // Sub-branches: every 3rd spine point
    const branches: SubBranch[] = [];
    for (let i = 3; i < SPINE_POINTS - 2; i += 2) {
      const side = (i % 4 < 2) ? 1 : -1;
      const branchLen = 30 + rng() * 40;
      const branchAngle = side * (0.4 + rng() * 0.3);

      // Sub-sub-branches
      const numChildren = 2 + Math.floor(rng() * 3);
      const children = Array.from({ length: numChildren }, (_, j) => ({
        t: (j + 1) / (numChildren + 1),
        side: ((j % 2) * 2 - 1) as -1 | 1,
        length: branchLen * (0.3 + rng() * 0.3) / PHI,
      }));

      branches.push({
        parentIdx: i,
        side,
        length: branchLen * (1 - i / SPINE_POINTS * 0.5),
        angle: branchAngle,
        children,
      });
    }

    return {
      corner,
      baseAngle,
      spiralTightness,
      spine,
      branches,
      scale: 0.8 + rng() * 0.4 + fi * 0.1,
    };
  });
}

function getCornerOrigin(
  corner: number,
  width: number,
  height: number,
): { x: number; y: number } {
  switch (corner) {
    case 0: return { x: 0, y: height };
    case 1: return { x: width, y: height };
    case 2: return { x: 0, y: 0 };
    default: return { x: width, y: 0 };
  }
}

interface Props {
  frames: EnhancedFrameData[];
}

export const FernUnfurl: React.FC<Props> = ({ frames }) => {
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

  const fronds = React.useMemo(() => generateFronds(16180339), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const unfurlSpeed = 0.6 + energy * 1.2;
  const unfurlProgress = Math.min(1, progress * unfurlSpeed);

  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.45 + energy * 0.35);

  if (masterOpacity < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 6px rgba(34, 139, 34, 0.4))`,
        }}
      >
        {fronds.map((frond, fi) => {
          const origin = getCornerOrigin(frond.corner, width, height);
          const sway = Math.sin(frame * 0.006 + fi * 1.8) * 4;

          // How many spine points are visible
          const visibleCount = Math.floor(unfurlProgress * SPINE_POINTS);

          return (
            <g key={fi} transform={`translate(${origin.x + sway}, ${origin.y})`}>
              {/* Main spine */}
              {frond.spine.map((pt, pi) => {
                if (pi === 0 || pi > visibleCount) return null;
                const prev = frond.spine[pi - 1];
                const depthFade = 1 - pi / SPINE_POINTS * 0.4;
                const emerald = 80 + pi * 5;
                const strokeColor = pi > SPINE_POINTS * 0.8
                  ? `rgba(218, 165, 32, ${0.6 * depthFade})` // golden tips
                  : `rgba(20, ${emerald}, 30, ${0.7 * depthFade})`;
                const strokeW = Math.max(1, 4 - pi * 0.15) * frond.scale;

                return (
                  <line
                    key={`spine-${pi}`}
                    x1={prev.x * frond.scale}
                    y1={prev.y * frond.scale}
                    x2={pt.x * frond.scale}
                    y2={pt.y * frond.scale}
                    stroke={strokeColor}
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Sub-branches */}
              {frond.branches.map((branch, bi) => {
                if (branch.parentIdx > visibleCount) return null;

                const parent = frond.spine[branch.parentIdx];
                const branchGrow = interpolate(
                  unfurlProgress,
                  [
                    branch.parentIdx / SPINE_POINTS,
                    Math.min(1, branch.parentIdx / SPINE_POINTS + 0.12),
                  ],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );

                if (branchGrow < 0.05) return null;

                const bAngle = parent.angle + branch.angle;
                const bLen = branch.length * branchGrow * frond.scale;
                const bx = parent.x * frond.scale;
                const by = parent.y * frond.scale;
                const bex = bx + Math.cos(bAngle) * bLen;
                const bey = by + Math.sin(bAngle) * bLen;

                const isGolden = branch.parentIdx > SPINE_POINTS * 0.7;
                const branchColor = isGolden
                  ? `rgba(218, 165, 32, ${0.5 * branchGrow})`
                  : `rgba(30, 120, 40, ${0.5 * branchGrow})`;

                return (
                  <g key={`branch-${bi}`}>
                    <line
                      x1={bx}
                      y1={by}
                      x2={bex}
                      y2={bey}
                      stroke={branchColor}
                      strokeWidth={Math.max(0.5, 2 * frond.scale * (1 - branch.parentIdx / SPINE_POINTS * 0.5))}
                      strokeLinecap="round"
                    />

                    {/* Sub-sub-branches (leaflets) */}
                    {branch.children.map((child, ci) => {
                      const childGrow = interpolate(branchGrow, [0.4, 1], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      });
                      if (childGrow < 0.1) return null;

                      const cx = bx + (bex - bx) * child.t;
                      const cy = by + (bey - by) * child.t;
                      const cAngle = bAngle + child.side * 0.6;
                      const cLen = child.length * childGrow * frond.scale;
                      const cex = cx + Math.cos(cAngle) * cLen;
                      const cey = cy + Math.sin(cAngle) * cLen;

                      const leafletColor = isGolden
                        ? `rgba(255, 200, 50, ${0.4 * childGrow})`
                        : `rgba(40, 140, 50, ${0.4 * childGrow})`;

                      return (
                        <g key={`leaflet-${ci}`}>
                          <line
                            x1={cx}
                            y1={cy}
                            x2={cex}
                            y2={cey}
                            stroke={leafletColor}
                            strokeWidth={Math.max(0.3, 1 * frond.scale)}
                            strokeLinecap="round"
                          />
                          {/* Tiny leaf dot at tip */}
                          <circle
                            cx={cex}
                            cy={cey}
                            r={2 * childGrow * frond.scale}
                            fill={isGolden ? "rgba(255, 215, 0, 0.5)" : "rgba(50, 180, 60, 0.5)"}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Golden tip glow on the furthest visible point */}
              {visibleCount > SPINE_POINTS * 0.5 && (() => {
                const tip = frond.spine[Math.min(visibleCount, SPINE_POINTS - 1)];
                const pulse = (Math.sin(frame * 0.05 + fi * 2) + 1) * 0.5;
                return (
                  <circle
                    cx={tip.x * frond.scale}
                    cy={tip.y * frond.scale}
                    r={4 + pulse * 3 + energy * 4}
                    fill={`rgba(255, 215, 0, ${0.3 + pulse * 0.3})`}
                    style={{ filter: "blur(4px)" }}
                  />
                );
              })()}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
