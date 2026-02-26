/**
 * VaporTrails — 3-5 jet contrail-like lines crossing the screen diagonally.
 * Each trail draws itself from one edge to the other, then fades.
 * Trails have slight waviness. White/silver color with glow.
 * Speed driven by energy.
 * Cycle: 45s, 14s visible.
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

interface TrailData {
  /** Start edge: 0=left, 1=top, 2=right, 3=bottom */
  startEdge: number;
  /** Start position along that edge (0-1) */
  startPos: number;
  /** End edge (opposite-ish) */
  endEdge: number;
  /** End position along that edge (0-1) */
  endPos: number;
  /** Wave frequency along trail length */
  waveFreq: number;
  /** Wave amplitude in px */
  waveAmp: number;
  /** Wave phase */
  wavePhase: number;
  /** Stroke width */
  strokeWidth: number;
  /** Lightness (85-100 for white/silver) */
  lightness: number;
  /** Stagger delay in frames within show window */
  stagger: number;
  /** Draw duration in frames */
  drawDuration: number;
  /** Fade duration after draw */
  fadeDuration: number;
}

const NUM_TRAILS = 4;
const CYCLE_FRAMES = 45 * 30; // 45s
const VISIBLE_FRAMES = 14 * 30; // 14s

function generateTrails(seed: number): TrailData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_TRAILS }, () => {
    const startEdge = Math.floor(rng() * 2); // 0=left, 1=top
    const endEdge = startEdge === 0 ? 2 : 3; // opposite edge
    return {
      startEdge,
      startPos: 0.1 + rng() * 0.8,
      endEdge,
      endPos: 0.1 + rng() * 0.8,
      waveFreq: 2 + rng() * 4,
      waveAmp: 3 + rng() * 12,
      wavePhase: rng() * Math.PI * 2,
      strokeWidth: 1.5 + rng() * 2.5,
      lightness: 85 + rng() * 15,
      stagger: Math.floor(rng() * 90),
      drawDuration: 60 + Math.floor(rng() * 90),
      fadeDuration: 60 + Math.floor(rng() * 60),
    };
  });
}

function edgeToPoint(
  edge: number,
  pos: number,
  w: number,
  h: number,
): { x: number; y: number } {
  switch (edge) {
    case 0:
      return { x: 0, y: pos * h };
    case 1:
      return { x: pos * w, y: 0 };
    case 2:
      return { x: w, y: pos * h };
    case 3:
      return { x: pos * w, y: h };
    default:
      return { x: 0, y: 0 };
  }
}

interface Props {
  frames: EnhancedFrameData[];
}

export const VaporTrails: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const trails = React.useMemo(() => generateTrails(45197708), []);

  // Cycle timing
  const cyclePos = frame % CYCLE_FRAMES;
  const inShowWindow = cyclePos < VISIBLE_FRAMES;

  if (!inShowWindow) return null;

  // Energy drives trail draw speed
  const speedMult = interpolate(energy, [0.03, 0.3], [0.6, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          filter: `drop-shadow(0 0 8px rgba(220, 230, 255, 0.6)) drop-shadow(0 0 20px rgba(200, 210, 240, 0.3))`,
        }}
      >
        {trails.map((trail, ti) => {
          const localFrame = cyclePos - trail.stagger;
          if (localFrame < 0) return null;

          const scaledDraw = trail.drawDuration / speedMult;
          const totalLife = scaledDraw + trail.fadeDuration;

          // Draw progress (0 to 1)
          const drawProgress = interpolate(localFrame, [0, scaledDraw], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          });

          // Fade out after draw completes
          const fadeAlpha = interpolate(
            localFrame,
            [scaledDraw, totalLife],
            [1, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.in(Easing.cubic),
            },
          );

          if (fadeAlpha < 0.01) return null;

          // Compute trail start/end in screen coords
          const start = edgeToPoint(trail.startEdge, trail.startPos, width, height);
          const end = edgeToPoint(trail.endEdge, trail.endPos, width, height);

          // Build path with waviness using line segments
          const NUM_PTS = 40;
          const drawnPts = Math.max(2, Math.ceil(NUM_PTS * drawProgress));
          const pathParts: string[] = [];

          for (let p = 0; p < drawnPts; p++) {
            const frac = p / (NUM_PTS - 1);
            const bx = start.x + (end.x - start.x) * frac;
            const by = start.y + (end.y - start.y) * frac;

            // Perpendicular wave displacement
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / (len || 1);
            const ny = dx / (len || 1);

            const wave =
              Math.sin(frac * trail.waveFreq * Math.PI + trail.wavePhase + frame * 0.02) *
              trail.waveAmp;

            const fx = bx + nx * wave;
            const fy = by + ny * wave;

            if (p === 0) {
              pathParts.push(`M ${fx} ${fy}`);
            } else {
              pathParts.push(`L ${fx} ${fy}`);
            }
          }

          const pathD = pathParts.join(" ");

          return (
            <path
              key={ti}
              d={pathD}
              stroke={`hsla(220, 15%, ${trail.lightness}%, ${fadeAlpha * 0.7})`}
              strokeWidth={trail.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
    </div>
  );
};
