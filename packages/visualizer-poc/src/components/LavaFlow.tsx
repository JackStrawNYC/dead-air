/**
 * LavaFlow — Flowing lava streams from top flowing downward.
 * 3-5 lava channels as bezier curves with glowing edges.
 * Lava color: bright orange core, red edges, dark crust patches.
 * Crust pieces form and break (dark patches appear and split).
 * Flow speed tied to energy. Intense glow around flow edges.
 * Cycle: 50s, 16s visible.
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

const NUM_CHANNELS = 4;
const VISIBLE_DURATION = 480; // 16s at 30fps
const CYCLE_GAP = 1020; // 34s gap (50s total - 16s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;
const NUM_CRUST_PATCHES = 12;

interface LavaChannel {
  xStart: number; // 0-1 normalized
  xEnd: number;
  controlPoints: { x: number; y: number }[];
  width: number;
  phaseOffset: number;
}

interface CrustPatch {
  channelIdx: number;
  tParam: number; // 0-1 along the channel curve
  size: number;
  phase: number;
}

function generateChannels(seed: number): LavaChannel[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_CHANNELS }, (_, i) => {
    const xStart = 0.1 + (i / NUM_CHANNELS) * 0.7 + (rng() - 0.5) * 0.1;
    const xEnd = xStart + (rng() - 0.5) * 0.3;
    const numCtrl = 3 + Math.floor(rng() * 2);
    const controlPoints = Array.from({ length: numCtrl }, (__, ci) => ({
      x: xStart + (xEnd - xStart) * ((ci + 1) / (numCtrl + 1)) + (rng() - 0.5) * 0.15,
      y: (ci + 1) / (numCtrl + 1),
    }));
    return {
      xStart,
      xEnd,
      controlPoints,
      width: 8 + rng() * 14,
      phaseOffset: rng() * Math.PI * 2,
    };
  });
}

function generateCrust(seed: number): CrustPatch[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_CRUST_PATCHES }, () => ({
    channelIdx: Math.floor(rng() * NUM_CHANNELS),
    tParam: 0.1 + rng() * 0.8,
    size: 3 + rng() * 6,
    phase: rng() * Math.PI * 2,
  }));
}

/** Evaluate a smooth path at parameter t using the control points */
function evalChannel(
  channel: LavaChannel,
  t: number,
  w: number,
  h: number,
  wobbleTime: number,
): { x: number; y: number } {
  // Simple interpolation through control points with sine wobble
  const allPts = [
    { x: channel.xStart, y: 0 },
    ...channel.controlPoints,
    { x: channel.xEnd, y: 1 },
  ];
  const segCount = allPts.length - 1;
  const rawIdx = t * segCount;
  const seg = Math.min(Math.floor(rawIdx), segCount - 1);
  const segT = rawIdx - seg;
  const p0 = allPts[seg];
  const p1 = allPts[seg + 1];
  const baseX = p0.x + (p1.x - p0.x) * segT;
  const baseY = p0.y + (p1.y - p0.y) * segT;
  // Wobble
  const wobble = Math.sin(wobbleTime + t * 6 + channel.phaseOffset) * 0.015;
  return {
    x: (baseX + wobble) * w,
    y: baseY * h,
  };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const LavaFlow: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const channels = React.useMemo(() => generateChannels(19770508), []);
  const crustPatches = React.useMemo(() => generateCrust(50819771), []);

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

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0, 0.3], [0.4, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const flowSpeed = 0.03 + energy * 0.05;
  const wobbleTime = frame * flowSpeed;
  const numSamples = 30;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <filter id="lava-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="lava-outer-glow">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>

        {channels.map((ch, ci) => {
          // Build path from sampled points
          const pts: { x: number; y: number }[] = [];
          for (let s = 0; s <= numSamples; s++) {
            const t = s / numSamples;
            pts.push(evalChannel(ch, t, width, height, wobbleTime));
          }

          // SVG path string
          let pathD = `M ${pts[0].x} ${pts[0].y}`;
          for (let s = 1; s < pts.length; s++) {
            pathD += ` L ${pts[s].x} ${pts[s].y}`;
          }

          const coreWidth = ch.width * (0.8 + energy * 0.6);
          const edgeWidth = coreWidth * 1.6;
          const glowWidth = coreWidth * 2.5;

          return (
            <g key={ci}>
              {/* Outer glow (reddish) */}
              <path
                d={pathD}
                stroke="rgba(200,30,0,0.35)"
                strokeWidth={glowWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#lava-outer-glow)"
              />
              {/* Red edges */}
              <path
                d={pathD}
                stroke="#CC2200"
                strokeWidth={edgeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.7}
              />
              {/* Bright orange core */}
              <path
                d={pathD}
                stroke="#FF6600"
                strokeWidth={coreWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#lava-glow)"
              />
              {/* Hottest center */}
              <path
                d={pathD}
                stroke="#FFAA00"
                strokeWidth={coreWidth * 0.4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85 + energy * 0.15}
              />
            </g>
          );
        })}

        {/* Crust patches — dark spots that form and break */}
        {crustPatches.map((cp, pi) => {
          if (cp.channelIdx >= channels.length) return null;
          const ch = channels[cp.channelIdx];
          const pos = evalChannel(ch, cp.tParam, width, height, wobbleTime);

          // Crust appears and disappears cyclically
          const crustCycle = Math.sin(frame * 0.04 + cp.phase);
          const crustVisible = crustCycle > 0.2;
          if (!crustVisible) return null;

          const crustOp = interpolate(crustCycle, [0.2, 0.6, 0.8, 1.0], [0, 0.7, 0.7, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          // Crust splits: offset two halves slightly
          const splitAmt = crustCycle > 0.7 ? (crustCycle - 0.7) * 15 : 0;

          return (
            <g key={`crust-${pi}`} opacity={crustOp}>
              <ellipse
                cx={pos.x - splitAmt}
                cy={pos.y}
                rx={cp.size}
                ry={cp.size * 0.6}
                fill="#331100"
                opacity={0.8}
              />
              <ellipse
                cx={pos.x + splitAmt}
                cy={pos.y}
                rx={cp.size * 0.8}
                ry={cp.size * 0.5}
                fill="#441500"
                opacity={0.6}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
