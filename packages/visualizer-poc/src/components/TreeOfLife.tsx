/**
 * TreeOfLife — Fractal tree that grows.
 * Start from bottom-center trunk. Recursive branching: each branch splits into 2
 * at ~30deg angles. Branch length decreases with depth (6-7 levels). Tree "grows"
 * over the display period — branches extend sequentially from trunk outward.
 * Leaves (small circles) appear at tips when energy > 0.15. Colors: brown trunk
 * -> green branches -> neon flower tips. Appears every 75s for 16s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2250; // 75s at 30fps
const DURATION = 480; // 16s
const MAX_DEPTH = 7;
const BASE_LENGTH = 90;
const LENGTH_DECAY = 0.72;
const BRANCH_ANGLE = 0.52; // ~30 degrees in radians
const GROWTH_FRAMES_PER_LEVEL = 50; // how many frames to grow each level

interface BranchData {
  /** Start point */
  x1: number;
  y1: number;
  /** End point */
  x2: number;
  y2: number;
  /** Depth level (0 = trunk) */
  depth: number;
  /** Branch width */
  width: number;
  /** Is this a terminal branch (leaf node)? */
  isLeaf: boolean;
  /** Unique index for deterministic leaf hue */
  index: number;
  /** Slight angle variation from seeded PRNG */
  angleVariation: number;
}

function generateTree(seed: number): BranchData[] {
  const rng = seeded(seed);
  const branches: BranchData[] = [];
  let branchIndex = 0;

  function recurse(
    x: number,
    y: number,
    angle: number,
    length: number,
    depth: number,
    width: number,
  ) {
    if (depth > MAX_DEPTH) return;

    const variation = (rng() - 0.5) * 0.2;
    const endX = x + Math.sin(angle) * length;
    const endY = y - Math.cos(angle) * length; // y goes up (negative)

    branches.push({
      x1: x,
      y1: y,
      x2: endX,
      y2: endY,
      depth,
      width,
      isLeaf: depth >= MAX_DEPTH - 1,
      index: branchIndex++,
      angleVariation: variation,
    });

    const nextLen = length * (LENGTH_DECAY + (rng() - 0.5) * 0.08);
    const nextWidth = Math.max(1, width * 0.7);

    // Left branch
    recurse(endX, endY, angle - BRANCH_ANGLE + variation, nextLen, depth + 1, nextWidth);
    // Right branch
    recurse(endX, endY, angle + BRANCH_ANGLE + variation, nextLen, depth + 1, nextWidth);
  }

  // Start from trunk
  recurse(0, 0, 0, BASE_LENGTH, 0, 8);

  return branches;
}

// Colors by depth: brown trunk -> green mid -> neon tips
function getBranchColor(depth: number, energy: number): string {
  if (depth <= 1) return `rgba(120, 80, 40, ${0.7 + energy * 0.2})`;
  if (depth <= 3) return `rgba(80, 140, 50, ${0.6 + energy * 0.3})`;
  if (depth <= 5) return `rgba(50, 200, 80, ${0.5 + energy * 0.4})`;
  return `rgba(100, 255, 120, ${0.5 + energy * 0.4})`;
}

// Leaf/flower colors: neon spectrum
const LEAF_COLORS = [
  "#FF00AA", "#FF4488", "#FF66CC", "#AA00FF",
  "#00FFAA", "#44FF88", "#FFAA00", "#00FFFF",
];

interface Props {
  frames: EnhancedFrameData[];
}

export const TreeOfLife: React.FC<Props> = ({ frames }) => {
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

  const tree = React.useMemo(() => generateTree(19671967), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.5 + energy * 0.35);

  // Tree position: bottom-center
  const treeBaseX = width * 0.5;
  const treeBaseY = height * 0.88;

  // Growth: which depth level is currently visible based on cycleFrame
  const growthProgress = cycleFrame / GROWTH_FRAMES_PER_LEVEL;
  const currentMaxDepth = Math.min(MAX_DEPTH, growthProgress);

  // Sway: slight wind effect
  const swayAngle = Math.sin(frame * 0.008) * 0.02;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <filter id="tree-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="leaf-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${treeBaseX}, ${treeBaseY}) rotate(${swayAngle * (180 / Math.PI)})`}>
          {/* Branches */}
          {tree.map((branch, i) => {
            if (branch.depth > currentMaxDepth) return null;

            // Partial growth for the current frontier level
            let branchGrowth = 1;
            if (branch.depth > currentMaxDepth - 1 && branch.depth <= currentMaxDepth) {
              branchGrowth = interpolate(
                currentMaxDepth - branch.depth,
                [0, 1],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
            }

            const dx = branch.x2 - branch.x1;
            const dy = branch.y2 - branch.y1;
            const endX = branch.x1 + dx * branchGrowth;
            const endY = branch.y1 + dy * branchGrowth;

            // Sway increases with depth
            const depthSway = Math.sin(frame * 0.01 + branch.index * 0.5) * branch.depth * 1.5;

            const color = getBranchColor(branch.depth, energy);

            return (
              <line
                key={`b${i}`}
                x1={branch.x1 + depthSway * 0.3}
                y1={branch.y1}
                x2={endX + depthSway}
                y2={endY}
                stroke={color}
                strokeWidth={branch.width}
                strokeLinecap="round"
                filter={branch.depth >= 5 ? "url(#tree-glow)" : undefined}
              />
            );
          })}

          {/* Leaves/flowers at tips when energy > 0.15 */}
          {energy > 0.15 &&
            tree
              .filter((b) => b.isLeaf && b.depth <= currentMaxDepth)
              .map((branch, i) => {
                const leafGrowth =
                  branch.depth <= currentMaxDepth - 0.5 ? 1 : 0;
                if (leafGrowth < 0.1) return null;

                const depthSway =
                  Math.sin(frame * 0.01 + branch.index * 0.5) *
                  branch.depth *
                  1.5;
                const lx = branch.x2 + depthSway;
                const ly = branch.y2;

                const leafColor = LEAF_COLORS[branch.index % LEAF_COLORS.length];
                const pulse =
                  (Math.sin(frame * 0.06 + branch.index * 1.1) + 1) * 0.5;
                const leafRadius = (2 + pulse * 2 + energy * 3) * leafGrowth;

                return (
                  <g key={`leaf${i}`}>
                    <circle
                      cx={lx}
                      cy={ly}
                      r={leafRadius * 2.5}
                      fill={leafColor}
                      opacity={0.2}
                      style={{ filter: "blur(4px)" }}
                    />
                    <circle
                      cx={lx}
                      cy={ly}
                      r={leafRadius}
                      fill={leafColor}
                      opacity={0.7 + pulse * 0.3}
                      filter="url(#leaf-glow)"
                    />
                  </g>
                );
              })}
        </g>
      </svg>
    </div>
  );
};
