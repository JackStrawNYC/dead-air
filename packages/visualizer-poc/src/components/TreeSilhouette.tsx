/**
 * TreeSilhouette -- 2-3 large tree silhouettes at screen edges.
 * Bare winter trees with many branching limbs built recursively (L-system style,
 * 4-5 levels of branching). Branches sway with wind (energy drives sway).
 * Dark silhouette on whatever is behind. Small leaves/buds appear during
 * high energy passages. Cycle: 80s (2400 frames), 25s (750 frames) visible.
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

interface BranchSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  depth: number;
  swayFreq: number;
  swayPhase: number;
  angle: number;
  // Leaf data (only on terminal branches)
  hasLeaf: boolean;
  leafX: number;
  leafY: number;
  leafSize: number;
  leafHue: number;
}

interface TreeData {
  baseX: number;
  baseY: number;
  trunkHeight: number;
  branches: BranchSegment[];
  mirrored: boolean;
}

function generateTree(
  rng: () => number,
  baseX: number,
  baseY: number,
  trunkHeight: number,
  mirrored: boolean,
): TreeData {
  const branches: BranchSegment[] = [];

  function buildBranch(
    x: number,
    y: number,
    angle: number,
    length: number,
    thickness: number,
    depth: number,
  ): void {
    if (depth > 5 || length < 6) return;

    const rad = (angle * Math.PI) / 180;
    const endX = x + Math.sin(rad) * length;
    const endY = y - Math.cos(rad) * length;

    const isTerminal = depth >= 4;

    branches.push({
      x1: x,
      y1: y,
      x2: endX,
      y2: endY,
      thickness,
      depth,
      swayFreq: 0.008 + rng() * 0.015,
      swayPhase: rng() * Math.PI * 2,
      angle,
      hasLeaf: isTerminal && rng() > 0.4,
      leafX: endX,
      leafY: endY,
      leafSize: 3 + rng() * 4,
      leafHue: 80 + rng() * 60, // green to yellow-green
    });

    // Branch into 2-3 sub-branches
    const numChildren = depth < 2 ? 3 : 2;
    const spreadBase = 25 + rng() * 15;
    for (let c = 0; c < numChildren; c++) {
      const childAngle =
        angle + (c - (numChildren - 1) / 2) * spreadBase + (rng() - 0.5) * 10;
      const childLength = length * (0.6 + rng() * 0.2);
      const childThickness = thickness * 0.6;
      buildBranch(endX, endY, childAngle, childLength, childThickness, depth + 1);
    }
  }

  // Trunk
  const trunkEndY = baseY - trunkHeight;
  branches.push({
    x1: baseX,
    y1: baseY,
    x2: baseX,
    y2: trunkEndY,
    thickness: 12,
    depth: 0,
    swayFreq: 0.005,
    swayPhase: rng() * Math.PI * 2,
    angle: 0,
    hasLeaf: false,
    leafX: 0,
    leafY: 0,
    leafSize: 0,
    leafHue: 0,
  });

  // Main branches from top of trunk
  const mainBranchCount = 3 + Math.floor(rng() * 2);
  for (let b = 0; b < mainBranchCount; b++) {
    const angle = (b - (mainBranchCount - 1) / 2) * 35 + (rng() - 0.5) * 15;
    const length = trunkHeight * (0.35 + rng() * 0.15);
    buildBranch(baseX, trunkEndY, angle, length, 7, 1);
  }

  return { baseX, baseY, trunkHeight, branches, mirrored };
}

function generateTrees(seed: number, width: number, height: number): TreeData[] {
  const rng = seeded(seed);
  const trees: TreeData[] = [];

  // Tree on left edge
  trees.push(generateTree(rng, width * 0.08, height, height * 0.55, false));
  // Tree on right edge
  trees.push(generateTree(rng, width * 0.92, height, height * 0.5, true));
  // Smaller tree left-center
  trees.push(generateTree(rng, width * 0.22, height, height * 0.35, false));

  return trees;
}

const CYCLE = 2400; // 80s at 30fps
const VISIBLE_DURATION = 750; // 25s

interface Props {
  frames: EnhancedFrameData[];
}

export const TreeSilhouette: React.FC<Props> = ({ frames }) => {
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

  const trees = React.useMemo(() => generateTrees(80197708, width, height), [width, height]);

  const cycleFrame = frame % CYCLE;
  const isVisible = cycleFrame < VISIBLE_DURATION;

  const fadeIn = isVisible
    ? interpolate(cycleFrame, [0, 90], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  const fadeOut = isVisible
    ? interpolate(cycleFrame, [VISIBLE_DURATION - 90, VISIBLE_DURATION], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const masterOpacity = Math.min(fadeIn, fadeOut);

  if (!isVisible || masterOpacity < 0.01) return null;

  const swayIntensity = interpolate(energy, [0.03, 0.3], [0.3, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const leafOpacity = interpolate(energy, [0.15, 0.35], [0, 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {trees.map((tree, ti) => (
          <g key={ti} transform={tree.mirrored ? `translate(${tree.baseX * 2}, 0) scale(-1, 1)` : undefined}>
            {tree.branches.map((branch, bi) => {
              // Sway displacement increases with depth
              const swayAmount = Math.sin(frame * branch.swayFreq + branch.swayPhase)
                * branch.depth * 2.5 * swayIntensity;

              return (
                <g key={bi}>
                  <line
                    x1={branch.x1}
                    y1={branch.y1}
                    x2={branch.x2 + swayAmount}
                    y2={branch.y2}
                    stroke="rgba(5, 5, 10, 0.9)"
                    strokeWidth={branch.thickness}
                    strokeLinecap="round"
                  />
                  {/* Leaf buds on terminal branches during high energy */}
                  {branch.hasLeaf && leafOpacity > 0.01 && (
                    <circle
                      cx={branch.leafX + swayAmount}
                      cy={branch.leafY}
                      r={branch.leafSize * (0.5 + energy)}
                      fill={`hsla(${branch.leafHue}, 60%, 40%, ${leafOpacity * 0.7})`}
                      style={{
                        filter: `drop-shadow(0 0 3px hsla(${branch.leafHue}, 80%, 50%, ${leafOpacity * 0.5}))`,
                      }}
                    />
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
};
