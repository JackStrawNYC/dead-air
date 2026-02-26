/**
 * BambooForest -- 8-12 vertical bamboo stalks swaying gently.
 * Each stalk is a series of segments with nodes (wider rings).
 * Stalks sway with sine motion, phase-offset.  Small leaves branch from nodes.
 * Green/emerald palette with darker nodes.  Sway amplitude driven by energy.
 * Cycle: 75s, 22s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

/* ---- seeded PRNG (mulberry32) ---- */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUM_STALKS = 10;
const SEGMENTS_PER_STALK = 7;
const CYCLE = 2250; // 75s at 30fps
const VISIBLE_DURATION = 660; // 22s

interface LeafData {
  /** Which side: -1 or 1 */
  side: number;
  /** Angle offset from horizontal */
  angle: number;
  /** Length of leaf */
  length: number;
  /** Width of leaf */
  leafWidth: number;
  /** Phase for gentle wave */
  wavePhase: number;
}

interface StalkData {
  /** X position as fraction of width */
  x: number;
  /** Stalk width (px) */
  stalkWidth: number;
  /** Segment height (px) */
  segmentHeight: number;
  /** Sway frequency */
  swayFreq: number;
  /** Sway phase */
  swayPhase: number;
  /** Base sway amplitude (px) */
  swayAmp: number;
  /** Hue: green range */
  hue: number;
  /** Saturation */
  sat: number;
  /** Lightness */
  light: number;
  /** Node hue (darker) */
  nodeHue: number;
  /** Leaves at each node */
  leaves: LeafData[];
  /** Stalk height offset (from bottom of screen) */
  yOffset: number;
}

function generateStalks(seed: number): StalkData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_STALKS }, () => {
    const leaves: LeafData[] = Array.from(
      { length: SEGMENTS_PER_STALK - 1 },
      () => ({
        side: rng() > 0.5 ? 1 : -1,
        angle: 15 + rng() * 30,
        length: 20 + rng() * 30,
        leafWidth: 4 + rng() * 5,
        wavePhase: rng() * Math.PI * 2,
      }),
    );
    return {
      x: 0.05 + rng() * 0.9,
      stalkWidth: 6 + rng() * 6,
      segmentHeight: 80 + rng() * 50,
      swayFreq: 0.008 + rng() * 0.012,
      swayPhase: rng() * Math.PI * 2,
      swayAmp: 8 + rng() * 12,
      hue: 100 + rng() * 40, // 100-140: green to emerald
      sat: 40 + rng() * 30,
      light: 30 + rng() * 25,
      nodeHue: 90 + rng() * 30,
      leaves,
      yOffset: rng() * 60,
    };
  });
}

interface Props {
  frames: EnhancedFrameData[];
}

export const BambooForest: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  /* ----- energy ----- */
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  /* memos BEFORE conditional returns */
  const stalks = React.useMemo(() => generateStalks((ctx?.showSeed ?? 19770508)), [ctx?.showSeed]);

  /* Cycle: 75s total, 22s visible */
  const cycleFrame = frame % CYCLE;
  const isVisible = cycleFrame < VISIBLE_DURATION;

  /* Fade in/out */
  const fadeIn = interpolate(cycleFrame, [0, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(
    cycleFrame,
    [VISIBLE_DURATION - 60, VISIBLE_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const visibility = isVisible ? Math.min(fadeIn, fadeOut) : 0;

  if (visibility < 0.01) return null;

  /* Energy drives sway amplitude */
  const swayMult = interpolate(energy, [0.03, 0.3], [0.5, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = visibility * 0.55;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {stalks.map((stalk, si) => {
          const baseX = stalk.x * width;
          const baseY = height + stalk.yOffset;

          /* Build segments from bottom up, each segment sways more the higher it is */
          const segments: Array<{
            x1: number;
            y1: number;
            x2: number;
            y2: number;
            nodeY: number;
            nodeX: number;
          }> = [];

          let currentX = baseX;
          let currentY = baseY;

          for (let seg = 0; seg < SEGMENTS_PER_STALK; seg++) {
            const heightFactor = (seg + 1) / SEGMENTS_PER_STALK;
            const sway =
              Math.sin(frame * stalk.swayFreq + stalk.swayPhase + seg * 0.3) *
              stalk.swayAmp *
              swayMult *
              heightFactor;

            const nextX = currentX + sway;
            const nextY = currentY - stalk.segmentHeight;

            segments.push({
              x1: currentX,
              y1: currentY,
              x2: nextX,
              y2: nextY,
              nodeY: nextY,
              nodeX: nextX,
            });

            currentX = nextX;
            currentY = nextY;
          }

          const stalkColor = `hsl(${stalk.hue}, ${stalk.sat}%, ${stalk.light}%)`;
          const nodeColor = `hsl(${stalk.nodeHue}, ${stalk.sat + 10}%, ${stalk.light - 8}%)`;
          const leafColor = `hsl(${stalk.hue + 10}, ${stalk.sat + 5}%, ${stalk.light + 10}%)`;

          return (
            <g key={si}>
              {/* Stalk segments */}
              {segments.map((seg, segIdx) => (
                <g key={`seg-${segIdx}`}>
                  {/* Segment tube */}
                  <line
                    x1={seg.x1}
                    y1={seg.y1}
                    x2={seg.x2}
                    y2={seg.y2}
                    stroke={stalkColor}
                    strokeWidth={stalk.stalkWidth}
                    strokeLinecap="round"
                  />
                  {/* Inner highlight (lighter stripe) */}
                  <line
                    x1={seg.x1 + stalk.stalkWidth * 0.15}
                    y1={seg.y1}
                    x2={seg.x2 + stalk.stalkWidth * 0.15}
                    y2={seg.y2}
                    stroke={`hsl(${stalk.hue}, ${stalk.sat - 10}%, ${stalk.light + 15}%)`}
                    strokeWidth={stalk.stalkWidth * 0.25}
                    strokeLinecap="round"
                    opacity={0.4}
                  />
                  {/* Node ring at top of segment */}
                  {segIdx < SEGMENTS_PER_STALK - 1 && (
                    <ellipse
                      cx={seg.nodeX}
                      cy={seg.nodeY}
                      rx={stalk.stalkWidth * 0.7}
                      ry={stalk.stalkWidth * 0.25}
                      fill={nodeColor}
                      opacity={0.8}
                    />
                  )}
                  {/* Leaf at each node (except base and top) */}
                  {segIdx > 0 && segIdx < stalk.leaves.length + 1 && (() => {
                    const leaf = stalk.leaves[segIdx - 1];
                    if (!leaf) return null;
                    const leafSway =
                      Math.sin(frame * 0.03 + leaf.wavePhase) * 5 * swayMult;
                    const leafAngle =
                      leaf.side * leaf.angle + leafSway;
                    const rad = (leafAngle * Math.PI) / 180;
                    const lx1 = seg.nodeX;
                    const ly1 = seg.nodeY;
                    const lx2 = lx1 + Math.cos(rad) * leaf.length;
                    const ly2 = ly1 - Math.sin(rad) * leaf.length * 0.3;
                    /* Leaf as a thin elliptical arc */
                    const midX = (lx1 + lx2) / 2;
                    const midY = (ly1 + ly2) / 2 - leaf.leafWidth * 0.5 * leaf.side;
                    return (
                      <path
                        d={`M ${lx1} ${ly1} Q ${midX} ${midY} ${lx2} ${ly2}`}
                        fill="none"
                        stroke={leafColor}
                        strokeWidth={leaf.leafWidth}
                        strokeLinecap="round"
                        opacity={0.6}
                      />
                    );
                  })()}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
