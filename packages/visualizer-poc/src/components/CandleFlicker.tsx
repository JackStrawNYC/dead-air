/**
 * CandleFlicker — 3-5 gentle candle flames at corners/edges of screen.
 * Each flame is a teardrop SVG shape that wobbles and flickers. Very subtle,
 * meditative feel. Warm amber/gold palette. Visible during quiet passages
 * (energy < 0.2). Flame height responds inversely to energy -- bigger when
 * quiet. Always on during quiet.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";

interface CandleData {
  /** Position x (0-1) */
  x: number;
  /** Position y (0-1) */
  y: number;
  /** Base flame height (px) */
  baseHeight: number;
  /** Base flame width (px) */
  baseWidth: number;
  /** Wobble frequency */
  wobbleFreq: number;
  /** Wobble phase */
  wobblePhase: number;
  /** Flicker frequency (brightness pulse) */
  flickerFreq: number;
  /** Flicker phase */
  flickerPhase: number;
  /** Secondary wobble freq (higher harmonic) */
  wobbleFreq2: number;
  /** Hue: 28-48 (amber/gold range) */
  hue: number;
}

const NUM_CANDLES = 5;

// Positions at corners and edges
const CANDLE_POSITIONS: [number, number][] = [
  [0.06, 0.88],  // bottom-left
  [0.94, 0.85],  // bottom-right
  [0.04, 0.15],  // top-left
  [0.96, 0.18],  // top-right
  [0.50, 0.92],  // bottom-center
];

function generateCandles(seed: number): CandleData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_CANDLES }, (_, i) => ({
    x: CANDLE_POSITIONS[i][0],
    y: CANDLE_POSITIONS[i][1],
    baseHeight: 28 + rng() * 18,
    baseWidth: 8 + rng() * 5,
    wobbleFreq: 0.06 + rng() * 0.08,
    wobblePhase: rng() * Math.PI * 2,
    flickerFreq: 0.09 + rng() * 0.12,
    flickerPhase: rng() * Math.PI * 2,
    wobbleFreq2: 0.15 + rng() * 0.2,
    hue: 28 + rng() * 20,
  }));
}

function buildFlamePath(
  cx: number,
  baseY: number,
  flameWidth: number,
  flameHeight: number,
  wobble: number,
): string {
  // Teardrop shape: point at top, round at bottom
  const topX = cx + wobble;
  const topY = baseY - flameHeight;
  const leftX = cx - flameWidth / 2;
  const rightX = cx + flameWidth / 2;

  // Control points for bezier curves forming teardrop
  const cp1LeftX = leftX - flameWidth * 0.15;
  const cp1LeftY = baseY - flameHeight * 0.35;
  const cp2LeftX = topX - flameWidth * 0.3;
  const cp2LeftY = topY + flameHeight * 0.2;

  const cp1RightX = topX + flameWidth * 0.3;
  const cp1RightY = topY + flameHeight * 0.2;
  const cp2RightX = rightX + flameWidth * 0.15;
  const cp2RightY = baseY - flameHeight * 0.35;

  return [
    `M ${cx} ${baseY}`,
    `C ${cp1LeftX} ${cp1LeftY} ${cp2LeftX} ${cp2LeftY} ${topX} ${topY}`,
    `C ${cp1RightX} ${cp1RightY} ${cp2RightX} ${cp2RightY} ${cx} ${baseY}`,
    "Z",
  ].join(" ");
}

const STAGGER_START = 180;

interface Props {
  frames: EnhancedFrameData[];
}

export const CandleFlicker: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;

  const candles = React.useMemo(() => generateCandles(770805), []);

  // Visible during quiet passages (energy < 0.2)
  const quietness = interpolate(energy, [0.08, 0.22], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const masterOpacity = quietness * masterFade * 0.65;

  if (masterOpacity < 0.01) return null;

  // Flame height responds inversely to energy: bigger when quiet
  const flameScale = interpolate(energy, [0.02, 0.2], [1.3, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: masterOpacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="candle-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="candle-outer">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {candles.map((candle, ci) => {
          const cx = candle.x * width;
          const baseY = candle.y * height;

          // Wobble: primary + secondary harmonic
          const wobble = Math.sin(frame * candle.wobbleFreq + candle.wobblePhase) * 3
            + Math.sin(frame * candle.wobbleFreq2 + candle.wobblePhase * 1.4) * 1.5;

          // Flicker: brightness pulse — flatness scales flicker rate (0.6-1.5x)
          const flatnessFlickerMult = 0.6 + snap.flatness * 0.9;
          const flicker = 0.7 + Math.sin(frame * candle.flickerFreq * flatnessFlickerMult + candle.flickerPhase) * 0.2
            + Math.sin(frame * candle.flickerFreq * 2.3 * flatnessFlickerMult + candle.flickerPhase * 0.7) * 0.1;

          const flameH = candle.baseHeight * flameScale * flicker;
          const flameW = candle.baseWidth * (0.9 + flicker * 0.15);

          const outerPath = buildFlamePath(cx, baseY, flameW * 1.6, flameH * 1.15, wobble * 1.2);
          const mainPath = buildFlamePath(cx, baseY, flameW, flameH, wobble);
          const innerPath = buildFlamePath(cx, baseY, flameW * 0.5, flameH * 0.65, wobble * 0.7);

          // Chroma → flame hue: 10% blend toward chroma hue (keep in warm range)
          const chromaBlend = snap.chromaHue * 0.1;
          const hue = candle.hue * 0.9 + chromaBlend;
          // Centroid → core brightness (brighter when treble-heavy)
          const centroidBright = 0.9 + snap.centroid * 0.2;

          return (
            <g key={ci}>
              {/* Outer warm glow */}
              <path
                d={outerPath}
                fill={`hsla(${hue}, 100%, 50%, ${0.1 * flicker})`}
                filter="url(#candle-outer)"
              />
              {/* Main flame body */}
              <path
                d={mainPath}
                fill={`hsla(${hue}, 100%, 55%, ${0.5 * flicker})`}
                filter="url(#candle-glow)"
              />
              {/* Inner bright core — centroid boosts brightness */}
              <path
                d={innerPath}
                fill={`hsla(${hue + 15}, 90%, ${Math.min(97, 85 * centroidBright)}%, ${0.7 * flicker})`}
              />
              {/* Wick dot */}
              <circle
                cx={cx}
                cy={baseY + 2}
                r={1.5}
                fill={`hsla(${hue - 5}, 60%, 25%, 0.6)`}
              />
              {/* Ground glow */}
              <ellipse
                cx={cx}
                cy={baseY + 4}
                rx={flameW * 1.5}
                ry={4}
                fill={`hsla(${hue}, 100%, 50%, ${0.08 * flicker})`}
                filter="url(#candle-outer)"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
