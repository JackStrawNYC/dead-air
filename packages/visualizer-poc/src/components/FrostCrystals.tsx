/**
 * FrostCrystals -- Ice crystal patterns growing from corners and edges inward.
 * Branching hexagonal crystal structures (dendrite patterns).
 * Crystals are white/ice-blue with sparkle highlights.
 * Growth follows 60-degree branching angles. Growth speed driven by energy.
 * Screen gradually frosts over then clears. Cycle: 55s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const VISIBLE_DURATION = 540; // 18s at 30fps
const CYCLE_GAP = 1110;       // 37s gap (55s total - 18s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;

// Crystal grows from a seed point with branches at 60-degree angles
interface CrystalBranch {
  startX: number;
  startY: number;
  angle: number;     // radians
  length: number;
  depth: number;     // branch generation (0=trunk, 1=primary, 2=secondary)
  growStart: number;  // progress 0-1 when this branch starts growing
  growEnd: number;    // progress 0-1 when this branch finishes
  children: CrystalBranch[];
}

interface CrystalSeed {
  originX: number; // 0-1 fraction
  originY: number; // 0-1 fraction
  branches: CrystalBranch[];
}

const NUM_SEEDS = 6;
const BRANCH_ANGLE = Math.PI / 3; // 60 degrees

function generateCrystal(
  rng: () => number,
  x: number,
  y: number,
  angle: number,
  length: number,
  depth: number,
  growOffset: number,
): CrystalBranch {
  const growDuration = 0.08 + rng() * 0.06;
  const growStart = Math.min(0.85, growOffset);
  const growEnd = Math.min(1, growStart + growDuration);

  const children: CrystalBranch[] = [];

  if (depth < 3 && length > 15) {
    const numChildren = depth < 2 ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2);
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;

    for (let c = 0; c < numChildren; c++) {
      const childAngle = angle + (c === 0 ? BRANCH_ANGLE : -BRANCH_ANGLE) + (rng() - 0.5) * 0.3;
      const childLength = length * (0.5 + rng() * 0.25);
      const branchPoint = 0.4 + rng() * 0.5;
      const branchX = x + Math.cos(angle) * length * branchPoint;
      const branchY = y + Math.sin(angle) * length * branchPoint;

      children.push(
        generateCrystal(
          rng,
          branchX,
          branchY,
          childAngle,
          childLength,
          depth + 1,
          growEnd + rng() * 0.05,
        ),
      );

      // Continuation branch from end
      if (c === 0 && depth < 2) {
        children.push(
          generateCrystal(
            rng,
            endX,
            endY,
            angle + (rng() - 0.5) * 0.4,
            childLength * 0.8,
            depth + 1,
            growEnd + rng() * 0.03,
          ),
        );
      }
    }
  }

  return {
    startX: x,
    startY: y,
    angle,
    length,
    depth,
    growStart,
    growEnd,
    children,
  };
}

function generateSeeds(seed: number): CrystalSeed[] {
  const rng = seeded(seed);
  // Seeds from corners and edges
  const origins: Array<[number, number, number]> = [
    [0, 0, Math.PI / 4 + 0.2],
    [1, 0, (3 * Math.PI) / 4 - 0.2],
    [0, 1, -Math.PI / 4 - 0.1],
    [1, 1, (-3 * Math.PI) / 4 + 0.1],
    [0.5, 0, Math.PI / 2 + (rng() - 0.5) * 0.3],
    [0.5, 1, -Math.PI / 2 + (rng() - 0.5) * 0.3],
  ];

  return origins.slice(0, NUM_SEEDS).map(([ox, oy, baseAngle]) => {
    const numTrunks = 2 + Math.floor(rng() * 3);
    const branches: CrystalBranch[] = [];
    for (let t = 0; t < numTrunks; t++) {
      const trunkAngle = baseAngle + (rng() - 0.5) * 0.8;
      const trunkLength = 60 + rng() * 100;
      branches.push(
        generateCrystal(rng, ox, oy, trunkAngle, trunkLength, 0, rng() * 0.15),
      );
    }
    return { originX: ox, originY: oy, branches };
  });
}

/** Recursively render crystal branches */
function renderBranch(
  branch: CrystalBranch,
  progress: number,
  w: number,
  h: number,
  parentKey: string,
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  // How much of this branch has grown
  const branchProgress = interpolate(
    progress,
    [branch.growStart, branch.growEnd],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  if (branchProgress <= 0) return elements;

  const x1 = branch.startX * w;
  const y1 = branch.startY * h;
  const endLen = branch.length * branchProgress;
  const x2 = x1 + Math.cos(branch.angle) * endLen;
  const y2 = y1 + Math.sin(branch.angle) * endLen;

  const lineWidth = Math.max(0.5, 2 - branch.depth * 0.5);
  const opacity = 0.7 - branch.depth * 0.15;

  // Main branch line
  elements.push(
    <line
      key={`${parentKey}-line`}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="rgba(200, 230, 255, 0.8)"
      strokeWidth={lineWidth}
      opacity={opacity * branchProgress}
      strokeLinecap="round"
    />,
  );

  // Sparkle at the tip of growing branches
  if (branchProgress > 0.1 && branchProgress < 0.95) {
    elements.push(
      <circle
        key={`${parentKey}-spark`}
        cx={x2}
        cy={y2}
        r={1.5 + (1 - branch.depth * 0.3)}
        fill="white"
        opacity={0.6 * (1 - Math.abs(branchProgress - 0.5) * 2)}
      />,
    );
  }

  // Render children
  if (branchProgress > 0.3) {
    branch.children.forEach((child, ci) => {
      elements.push(
        ...renderBranch(child, progress, w, h, `${parentKey}-${ci}`),
      );
    });
  }

  return elements;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const FrostCrystals: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const seeds = React.useMemo(() => generateSeeds(12211968), []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleFrame = frame % CYCLE_TOTAL;

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  // Growth progresses faster with energy
  const growthSpeed = 0.7 + energy * 1.5;
  const growthProgress = Math.min(1, progress * growthSpeed * 1.3);

  // Fade in and out
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.82, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.7;

  if (masterOpacity < 0.01) return null;

  // Frost overlay (screen gradually gets frosty)
  const frostOverlayOpacity = interpolate(growthProgress, [0, 0.5, 0.8, 1], [0, 0.03, 0.06, 0.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Subtle frost overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(200, 225, 255, ${frostOverlayOpacity * masterOpacity}) 100%)`,
        }}
      />

      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 4px rgba(180, 220, 255, 0.5)) drop-shadow(0 0 12px rgba(180, 220, 255, 0.2))`,
        }}
      >
        {seeds.map((seed, si) =>
          seed.branches.map((branch, bi) =>
            renderBranch(branch, growthProgress, width, height, `s${si}-b${bi}`),
          ),
        )}
      </svg>
    </div>
  );
};
