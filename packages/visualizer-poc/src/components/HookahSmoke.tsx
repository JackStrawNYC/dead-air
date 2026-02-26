/**
 * HookahSmoke — Thick curling smoke tendrils rising from bottom center.
 * 5-7 tendrils built from bezier curves with varying curl frequencies.
 * Smoke is semi-transparent white/gray with subtle color tinting from chroma.
 * Tendrils drift and curl more aggressively with energy.
 * Low energy = gentle lazy wisps, high energy = fast twisting plumes.
 * Always visible at 0.05-0.2 opacity.
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

interface TendrilData {
  /** X offset from center as fraction of width (-0.15 to 0.15) */
  xOffset: number;
  /** Curl frequency multiplier */
  curlFreq: number;
  /** Curl amplitude in px */
  curlAmp: number;
  /** Rise speed multiplier */
  riseSpeed: number;
  /** Phase offset for animation */
  phase: number;
  /** Stroke width base */
  strokeWidth: number;
  /** Secondary curl frequency for complex motion */
  curlFreq2: number;
  /** Secondary curl amplitude */
  curlAmp2: number;
  /** Opacity multiplier */
  opacityMult: number;
}

const NUM_TENDRILS = 6;

function generateTendrils(seed: number): TendrilData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_TENDRILS }, () => ({
    xOffset: (rng() - 0.5) * 0.3,
    curlFreq: 0.006 + rng() * 0.012,
    curlAmp: 40 + rng() * 80,
    riseSpeed: 0.4 + rng() * 0.6,
    phase: rng() * Math.PI * 2,
    strokeWidth: 8 + rng() * 18,
    curlFreq2: 0.003 + rng() * 0.007,
    curlAmp2: 20 + rng() * 50,
    opacityMult: 0.6 + rng() * 0.4,
  }));
}

const STAGGER_START = 60;

interface Props {
  frames: EnhancedFrameData[];
}

export const HookahSmoke: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const tendrils = React.useMemo(() => generateTendrils(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Chroma tinting: pick dominant chroma pitch for subtle color
  const chromaData = frames[idx].chroma;
  const chromaTint = React.useMemo(() => {
    // Find the strongest chroma bin
    let maxIdx = 0;
    let maxVal = 0;
    for (let c = 0; c < 12; c++) {
      if (chromaData[c] > maxVal) {
        maxVal = chromaData[c];
        maxIdx = c;
      }
    }
    // Map chroma index to hue (C=0->0, C#->30, D->60, ... B->330)
    return maxIdx * 30;
  }, [chromaData]);

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Always visible at 0.05-0.2 opacity based on energy
  const baseOpacity = interpolate(energy, [0.03, 0.3], [0.05, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = baseOpacity * masterFade;

  if (masterOpacity < 0.005) return null;

  // Energy drives curl aggressiveness and rise speed
  const curlMult = interpolate(energy, [0.03, 0.3], [0.4, 1.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const speedMult = interpolate(energy, [0.03, 0.3], [0.5, 1.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Center x
  const cx = width / 2;

  // Build tendril paths: each tendril rises from bottom center
  // with curling bezier segments
  const NUM_SEGMENTS = 8;
  const SEGMENT_HEIGHT = (height * 0.85) / NUM_SEGMENTS;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `blur(6px) drop-shadow(0 0 20px rgba(200, 200, 220, 0.3))`,
        }}
      >
        <defs>
          {tendrils.map((_, i) => {
            const tintStrength = 0.15 + energy * 0.2;
            return (
              <linearGradient key={`hg-${i}`} id={`hookah-grad-${i}`} x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor={`hsla(${chromaTint}, ${20 + tintStrength * 30}%, 90%, 0.7)`} />
                <stop offset="40%" stopColor={`hsla(${chromaTint}, ${10 + tintStrength * 20}%, 85%, 0.5)`} />
                <stop offset="70%" stopColor={`hsla(0, 0%, 88%, 0.3)`} />
                <stop offset="100%" stopColor={`hsla(0, 0%, 90%, 0)`} />
              </linearGradient>
            );
          })}
        </defs>
        {tendrils.map((tendril, ti) => {
          // Stagger entrance per tendril
          const tendrilFade = interpolate(
            frame,
            [STAGGER_START + ti * 20, STAGGER_START + ti * 20 + 90],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          );
          if (tendrilFade < 0.01) return null;

          const t = frame * speedMult * tendril.riseSpeed;

          // Build a multi-segment cubic bezier path rising from bottom
          const baseX = cx + tendril.xOffset * width;
          const points: { x: number; y: number }[] = [];

          for (let seg = 0; seg <= NUM_SEGMENTS; seg++) {
            const segFrac = seg / NUM_SEGMENTS;
            const segY = height - seg * SEGMENT_HEIGHT;

            // Curl displacement increases with height (smoke spreads as it rises)
            const heightFactor = segFrac * segFrac; // quadratic spread
            const curlX =
              Math.sin(t * tendril.curlFreq + tendril.phase + segFrac * 4) *
                tendril.curlAmp * curlMult * heightFactor +
              Math.sin(t * tendril.curlFreq2 + tendril.phase * 1.7 + segFrac * 6) *
                tendril.curlAmp2 * curlMult * heightFactor;

            points.push({ x: baseX + curlX, y: segY });
          }

          // Build cubic bezier path through points
          let path = `M ${points[0].x} ${points[0].y}`;
          for (let p = 1; p < points.length; p++) {
            const prev = points[p - 1];
            const curr = points[p];
            // Control points offset for smooth curves
            const cpOffset = SEGMENT_HEIGHT * 0.4;
            const cp1x = prev.x + (curr.x - prev.x) * 0.3;
            const cp1y = prev.y - cpOffset;
            const cp2x = curr.x - (curr.x - prev.x) * 0.3;
            const cp2y = curr.y + cpOffset;
            path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
          }

          return (
            <path
              key={ti}
              d={path}
              stroke={`url(#hookah-grad-${ti})`}
              strokeWidth={tendril.strokeWidth * (0.6 + energy * 1.2)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={tendrilFade * tendril.opacityMult}
            />
          );
        })}
      </svg>
    </div>
  );
};
