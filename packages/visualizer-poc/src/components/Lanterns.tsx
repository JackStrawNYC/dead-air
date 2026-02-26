/**
 * Lanterns -- 6-10 glowing sky lanterns rising slowly from bottom.
 * Each lantern is an oval/diamond shape with warm glow (orange/yellow/red).
 * Lanterns drift sideways with gentle wind.  Inner glow flickers subtly.
 * As they rise, they get smaller (perspective) and more transparent.
 * Energy drives release rate.  Cycle: 50s, 18s visible.
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

const NUM_LANTERNS = 8;
const CYCLE = 1500; // 50s at 30fps
const VISIBLE_DURATION = 540; // 18s
const RISE_DURATION = 360; // 12s for one lantern to rise fully

interface LanternData {
  /** Release delay (staggered from cycle start) */
  releaseDelay: number;
  /** Start x as fraction of width */
  startX: number;
  /** Drift frequency */
  driftFreq: number;
  /** Drift amplitude (px) */
  driftAmp: number;
  /** Drift phase */
  driftPhase: number;
  /** Rise speed multiplier */
  riseSpeed: number;
  /** Lantern width */
  lanternW: number;
  /** Lantern height */
  lanternH: number;
  /** Hue: warm range */
  hue: number;
  /** Flicker frequency */
  flickerFreq: number;
  /** Flicker phase */
  flickerPhase: number;
}

function generateLanterns(seed: number): LanternData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_LANTERNS }, (_, i) => ({
    releaseDelay: i * 35 + Math.floor(rng() * 25),
    startX: 0.15 + rng() * 0.7,
    driftFreq: 0.005 + rng() * 0.01,
    driftAmp: 20 + rng() * 40,
    driftPhase: rng() * Math.PI * 2,
    riseSpeed: 0.7 + rng() * 0.6,
    lanternW: 18 + rng() * 12,
    lanternH: 24 + rng() * 16,
    hue: 15 + rng() * 30, // 15-45: orange to warm yellow
    flickerFreq: 0.08 + rng() * 0.12,
    flickerPhase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Lanterns: React.FC<Props> = ({ frames }) => {
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
  const lanterns = React.useMemo(() => generateLanterns((ctx?.showSeed ?? 19770508)), [ctx?.showSeed]);

  /* Cycle: 50s total, 18s visible */
  const cycleFrame = frame % CYCLE;
  const isVisible = cycleFrame < VISIBLE_DURATION;

  /* Fade in/out */
  const fadeIn = interpolate(cycleFrame, [0, 45], [0, 1], {
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

  const masterOpacity = visibility * 0.65;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <filter id="lantern-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {lanterns.map((lantern, li) => {
          /* Check if this lantern has been released */
          const lanternAge = cycleFrame - lantern.releaseDelay;
          if (lanternAge < 0) return null;

          /* Rise progress: 0 = bottom, 1 = off top */
          const riseProgress = (lanternAge * lantern.riseSpeed) / RISE_DURATION;
          if (riseProgress > 1.2) return null; // off screen

          /* Y position: rises from bottom */
          const py = height * (1.1 - riseProgress * 1.3);

          /* X position: drift sideways */
          const px =
            lantern.startX * width +
            Math.sin(frame * lantern.driftFreq + lantern.driftPhase) * lantern.driftAmp;

          /* Perspective: shrinks as it rises */
          const perspectiveScale = interpolate(riseProgress, [0, 1], [1, 0.4], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          /* Fade as it rises */
          const riseFade = interpolate(riseProgress, [0, 0.1, 0.7, 1.1], [0, 1, 0.6, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          if (riseFade < 0.02) return null;

          /* Flicker */
          const flicker =
            0.75 +
            Math.sin(frame * lantern.flickerFreq + lantern.flickerPhase) * 0.15 +
            Math.sin(frame * lantern.flickerFreq * 2.3 + lantern.flickerPhase * 0.7) * 0.1;

          const w = lantern.lanternW * perspectiveScale;
          const h = lantern.lanternH * perspectiveScale;
          const hue = lantern.hue;

          /* Lantern shape: a rounded diamond / paper lantern */
          const lanternPath = `
            M ${px} ${py - h * 0.5}
            C ${px + w * 0.4} ${py - h * 0.3}, ${px + w * 0.5} ${py - h * 0.05}, ${px + w * 0.45} ${py + h * 0.15}
            C ${px + w * 0.35} ${py + h * 0.4}, ${px + w * 0.1} ${py + h * 0.5}, ${px} ${py + h * 0.5}
            C ${px - w * 0.1} ${py + h * 0.5}, ${px - w * 0.35} ${py + h * 0.4}, ${px - w * 0.45} ${py + h * 0.15}
            C ${px - w * 0.5} ${py - h * 0.05}, ${px - w * 0.4} ${py - h * 0.3}, ${px} ${py - h * 0.5}
            Z
          `;

          const bodyColor = `hsla(${hue}, 90%, 55%, ${riseFade * flicker})`;
          const glowColor = `hsla(${hue}, 100%, 65%, ${riseFade * flicker * 0.4})`;
          const innerColor = `hsla(${hue + 10}, 100%, 80%, ${riseFade * flicker * 0.7})`;

          return (
            <g key={li}>
              {/* Outer glow */}
              <ellipse
                cx={px}
                cy={py}
                rx={w * 1.5}
                ry={h * 1.2}
                fill={glowColor}
                style={{ filter: "blur(8px)" }}
              />
              {/* Lantern body */}
              <path d={lanternPath} fill={bodyColor} />
              {/* Inner glow (bright center) */}
              <ellipse
                cx={px}
                cy={py}
                rx={w * 0.25}
                ry={h * 0.2}
                fill={innerColor}
                style={{ filter: "blur(3px)" }}
              />
              {/* Horizontal ribs */}
              {[-0.2, 0, 0.2].map((yOff, ri) => (
                <line
                  key={ri}
                  x1={px - w * 0.35}
                  y1={py + h * yOff}
                  x2={px + w * 0.35}
                  y2={py + h * yOff}
                  stroke={`hsla(${hue - 5}, 70%, 40%, ${riseFade * 0.3})`}
                  strokeWidth={0.5 * perspectiveScale}
                />
              ))}
              {/* Bottom opening (flame hint) */}
              <circle
                cx={px}
                cy={py + h * 0.48}
                r={w * 0.1}
                fill={`hsla(40, 100%, 90%, ${riseFade * flicker * 0.5})`}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
