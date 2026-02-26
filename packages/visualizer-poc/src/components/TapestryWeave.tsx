/**
 * TapestryWeave — Woven fabric pattern building thread by thread.
 * Horizontal warp threads and vertical weft threads weaving over/under each other.
 * Threads draw themselves progressively using stroke-dasharray animation.
 * Colors form a pattern (stripes, checker, or gradient). Rich earth tones:
 * burgundy, gold, navy, forest green. Energy drives weaving speed.
 * Cycle: 75s, 24s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useShowContext } from "../data/ShowContext";

const CYCLE = 2250; // 75s at 30fps
const DURATION = 720; // 24s visible
const WARP_COUNT = 18;
const WEFT_COUNT = 14;

const EARTH_TONES = [
  "#8B1A1A", // burgundy
  "#C5961A", // gold
  "#1B2A4A", // navy
  "#2D5A27", // forest green
  "#6B3A2A", // sienna
  "#4A0E2E", // dark plum
  "#8B7D3C", // olive gold
  "#3A1F0B", // dark umber
];

interface ThreadData {
  colorIdx: number;
  offset: number;
  thickness: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const TapestryWeave: React.FC<Props> = ({ frames }) => {
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

  const warpThreads = React.useMemo(() => {
    const rng = seeded(ctx?.showSeed ?? 77_050_801);
    return Array.from({ length: WARP_COUNT }, (): ThreadData => ({
      colorIdx: Math.floor(rng() * EARTH_TONES.length),
      offset: rng() * 200,
      thickness: 3 + rng() * 4,
    }));
  }, [ctx?.showSeed]);

  const weftThreads = React.useMemo(() => {
    const rng = seeded(ctx?.showSeed ?? 77_050_802);
    return Array.from({ length: WEFT_COUNT }, (): ThreadData => ({
      colorIdx: Math.floor(rng() * EARTH_TONES.length),
      offset: rng() * 200,
      thickness: 3 + rng() * 4,
    }));
  }, [ctx?.showSeed]);

  // Cycle gating
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
    easing: Easing.in(Easing.cubic),
  });

  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.15, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  // Thread spacing
  const margin = 60;
  const weaveWidth = width - margin * 2;
  const weaveHeight = height - margin * 2;
  const warpSpacing = weaveWidth / (WARP_COUNT - 1);
  const weftSpacing = weaveHeight / (WEFT_COUNT - 1);

  // Progressive reveal driven by energy
  const speedMult = 0.5 + energy * 2.0;
  const revealProgress = interpolate(progress * speedMult, [0, 0.7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Total thread length for dasharray animation
  const warpLength = weaveHeight + 40;
  const weftLength = weaveWidth + 40;

  // Wave amplitude for weaving effect
  const waveAmp = 4 + energy * 6;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 6px rgba(197, 150, 26, 0.3))`,
        }}
      >
        {/* Warp threads (vertical) */}
        {warpThreads.map((thread, wi) => {
          const x = margin + wi * warpSpacing;
          const threadReveal = interpolate(
            revealProgress,
            [Math.max(0, wi / WARP_COUNT - 0.1), Math.min(1, wi / WARP_COUNT + 0.3)],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const dashDrawn = warpLength * threadReveal;
          const dashGap = warpLength - dashDrawn;

          // Weave wave: thread moves left/right at weft crossings
          let d = `M ${x} ${margin - 20}`;
          const steps = WEFT_COUNT * 2;
          for (let s = 0; s <= steps; s++) {
            const y = margin - 20 + (s / steps) * (weaveHeight + 40);
            const weftIdx = Math.floor(s / 2);
            const isOver = (wi + weftIdx) % 2 === 0;
            const xOff = isOver ? waveAmp : -waveAmp;
            const finalX = x + xOff * Math.sin((s / steps) * Math.PI * 4 + thread.offset * 0.01);
            if (s === 0) {
              d = `M ${finalX} ${y}`;
            } else {
              d += ` L ${finalX} ${y}`;
            }
          }

          return (
            <path
              key={`warp-${wi}`}
              d={d}
              stroke={EARTH_TONES[thread.colorIdx]}
              strokeWidth={thread.thickness}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dashDrawn} ${dashGap}`}
              opacity={0.8}
            />
          );
        })}

        {/* Weft threads (horizontal) */}
        {weftThreads.map((thread, wi) => {
          const y = margin + wi * weftSpacing;
          const threadReveal = interpolate(
            revealProgress,
            [Math.max(0, wi / WEFT_COUNT - 0.1), Math.min(1, wi / WEFT_COUNT + 0.3)],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const dashDrawn = weftLength * threadReveal;
          const dashGap = weftLength - dashDrawn;

          // Weave wave: thread moves up/down at warp crossings
          let d = "";
          const steps = WARP_COUNT * 2;
          for (let s = 0; s <= steps; s++) {
            const x = margin - 20 + (s / steps) * (weaveWidth + 40);
            const warpIdx = Math.floor(s / 2);
            const isOver = (wi + warpIdx) % 2 === 1;
            const yOff = isOver ? waveAmp : -waveAmp;
            const finalY = y + yOff * Math.sin((s / steps) * Math.PI * 4 + thread.offset * 0.01);
            if (s === 0) {
              d = `M ${x} ${finalY}`;
            } else {
              d += ` L ${x} ${finalY}`;
            }
          }

          return (
            <path
              key={`weft-${wi}`}
              d={d}
              stroke={EARTH_TONES[thread.colorIdx]}
              strokeWidth={thread.thickness}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dashDrawn} ${dashGap}`}
              opacity={0.8}
            />
          );
        })}
      </svg>
    </div>
  );
};
