/**
 * ButterflySwarm -- 12-20 monarch butterflies migrating across the screen.
 * Each butterfly is 2 wing shapes (triangular) that flap (scaleX oscillation).
 * Wings have orange/black pattern (fill gradient).  Butterflies follow gentle
 * curved paths with slight randomness.  Swarm density increases with energy.
 * Warm orange/black palette.
 * Cycle: 50s total, 16s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

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

const CYCLE = 1500;   // 50s
const DURATION = 480;  // 16s
const MAX_BUTTERFLIES = 18;

/* wing colours */
const WING_ORANGE = "#FF8C00";
const WING_DARK = "#1A1A1A";
const WING_ACCENT = "#FFB347";

interface ButterflyData {
  startX: number;   // 0-1
  startY: number;   // 0-1
  endX: number;     // 0-1
  endY: number;     // 0-1
  curveAmp: number;  // bezier curve amplitude
  flapSpeed: number; // wing flap rate
  flapPhase: number;
  size: number;
  delayFrac: number; // 0-1 stagger
}

function generateButterflies(seed: number): ButterflyData[] {
  const rng = seeded(seed);
  const result: ButterflyData[] = [];
  for (let i = 0; i < MAX_BUTTERFLIES; i++) {
    const fromLeft = rng() > 0.5;
    result.push({
      startX: fromLeft ? -0.05 : 1.05,
      startY: 0.1 + rng() * 0.7,
      endX: fromLeft ? 1.05 : -0.05,
      endY: 0.1 + rng() * 0.7,
      curveAmp: 0.1 + rng() * 0.25,
      flapSpeed: 0.25 + rng() * 0.2,
      flapPhase: rng() * Math.PI * 2,
      size: 14 + rng() * 12,
      delayFrac: rng() * 0.3,
    });
  }
  return result;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const ButterflySwarm: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  /* ----- energy ----- */
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleIndex = Math.floor(frame / CYCLE);

  /* memos BEFORE conditional returns */
  const butterflies = React.useMemo(
    () => generateButterflies(cycleIndex * 43 + 770508),
    [cycleIndex],
  );

  /* ----- cycle gate ----- */
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.8;
  if (masterOpacity < 0.01) return null;

  /* energy drives how many butterflies are visible */
  const visibleCount = Math.floor(
    interpolate(energy, [0.03, 0.25], [6, MAX_BUTTERFLIES], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <linearGradient id="wing-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={WING_ORANGE} />
            <stop offset="60%" stopColor={WING_ACCENT} />
            <stop offset="100%" stopColor={WING_DARK} />
          </linearGradient>
        </defs>

        {butterflies.slice(0, visibleCount).map((bf, bi) => {
          /* per-butterfly progress with stagger */
          const bfProgress = interpolate(
            progress,
            [bf.delayFrac, bf.delayFrac + (1 - bf.delayFrac)],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          if (bfProgress < 0.001 || bfProgress > 0.999) return null;

          /* position along bezier-ish path */
          const t = bfProgress;
          const midY = (bf.startY + bf.endY) / 2 - bf.curveAmp;
          const px = (1 - t) * (1 - t) * bf.startX + 2 * (1 - t) * t * ((bf.startX + bf.endX) / 2) + t * t * bf.endX;
          const py = (1 - t) * (1 - t) * bf.startY + 2 * (1 - t) * t * midY + t * t * bf.endY;

          /* add gentle wave */
          const waveY = Math.sin(t * Math.PI * 3 + bf.flapPhase) * 0.03;
          const waveX = Math.sin(t * Math.PI * 2.3 + bf.flapPhase * 1.3) * 0.015;

          const cx = (px + waveX) * width;
          const cy = (py + waveY) * height;

          /* wing flap: scaleX oscillates between 0.2 and 1 */
          const flap = Math.sin(frame * bf.flapSpeed + bf.flapPhase);
          const wingScaleX = 0.2 + (flap + 1) * 0.4; // 0.2 - 1.0

          /* heading angle based on velocity direction */
          const headingAngle = Math.atan2(bf.endY - bf.startY, bf.endX - bf.startX) * (180 / Math.PI);

          const s = bf.size;

          return (
            <g key={bi} transform={`translate(${cx}, ${cy}) rotate(${headingAngle})`}>
              {/* body */}
              <ellipse cx={0} cy={0} rx={s * 0.12} ry={s * 0.5} fill={WING_DARK} />
              {/* antennae */}
              <line x1={-s * 0.06} y1={-s * 0.5} x2={-s * 0.2} y2={-s * 0.75} stroke={WING_DARK} strokeWidth={1} />
              <line x1={s * 0.06} y1={-s * 0.5} x2={s * 0.2} y2={-s * 0.75} stroke={WING_DARK} strokeWidth={1} />
              {/* left wing (upper) */}
              <ellipse
                cx={-s * 0.35}
                cy={-s * 0.1}
                rx={s * 0.35}
                ry={s * 0.4}
                fill="url(#wing-grad)"
                opacity={0.85}
                transform={`scale(${wingScaleX}, 1)`}
                style={{ transformOrigin: "0 0" }}
              />
              {/* right wing (upper) */}
              <ellipse
                cx={s * 0.35}
                cy={-s * 0.1}
                rx={s * 0.35}
                ry={s * 0.4}
                fill="url(#wing-grad)"
                opacity={0.85}
                transform={`scale(${wingScaleX}, 1)`}
                style={{ transformOrigin: "0 0" }}
              />
              {/* left wing (lower, smaller) */}
              <ellipse
                cx={-s * 0.25}
                cy={s * 0.2}
                rx={s * 0.25}
                ry={s * 0.3}
                fill={WING_ORANGE}
                opacity={0.7}
                transform={`scale(${wingScaleX}, 1)`}
                style={{ transformOrigin: "0 0" }}
              />
              {/* right wing (lower, smaller) */}
              <ellipse
                cx={s * 0.25}
                cy={s * 0.2}
                rx={s * 0.25}
                ry={s * 0.3}
                fill={WING_ORANGE}
                opacity={0.7}
                transform={`scale(${wingScaleX}, 1)`}
                style={{ transformOrigin: "0 0" }}
              />
              {/* wing spots */}
              <circle cx={-s * 0.3} cy={-s * 0.1} r={s * 0.06} fill={WING_DARK} opacity={0.6 * wingScaleX} />
              <circle cx={s * 0.3} cy={-s * 0.1} r={s * 0.06} fill={WING_DARK} opacity={0.6 * wingScaleX} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
