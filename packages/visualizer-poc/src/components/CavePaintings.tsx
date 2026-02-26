/**
 * CavePaintings — Ancient cave art style animal figures and hand prints.
 * 4-6 figures drawn in rough ochre/red-brown strokes on dark background.
 * Figures animate stroke-by-stroke using strokeDasharray.
 * Hand prints are simple circles with 5 finger dots.
 * Rough, primitive aesthetic. Energy drives draw speed.
 * Cycle: 75s, 22s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2250; // 75 seconds at 30fps
const DURATION = 660; // 22 seconds visible

// Ochre/red-brown palette
const COLORS = ["#A0522D", "#CD853F", "#8B4513", "#D2691E", "#B22222", "#CC6633"];

// SVG path data for cave art figures — rough, primitive shapes
const BISON_PATH =
  "M 10,50 Q 15,30 30,25 Q 45,20 55,28 Q 65,35 70,45 Q 72,55 65,60 L 60,70 L 55,60 L 50,70 L 45,60 L 40,70 L 35,60 Q 20,55 15,55 Z M 30,25 Q 28,15 35,12 Q 40,10 38,20";

const DEER_PATH =
  "M 20,60 Q 25,40 35,35 Q 45,30 55,35 Q 60,38 60,45 Q 65,50 60,55 L 55,65 L 50,55 L 45,65 L 40,55 Q 30,55 22,58 Z M 55,35 L 60,20 L 65,25 M 55,35 L 50,18 L 45,22";

const HORSE_PATH =
  "M 15,55 Q 20,35 35,30 Q 50,25 60,30 Q 70,35 72,45 Q 75,50 70,50 L 65,65 L 60,55 L 55,65 L 50,55 Q 35,50 20,52 Z M 60,30 Q 62,22 58,18 Q 55,22 57,28";

const FIGURES = [
  { path: BISON_PATH, x: 0.12, y: 0.35, scale: 2.5, label: "bison" },
  { path: DEER_PATH, x: 0.55, y: 0.25, scale: 2.2, label: "deer" },
  { path: HORSE_PATH, x: 0.35, y: 0.55, scale: 2.8, label: "horse" },
  { path: BISON_PATH, x: 0.72, y: 0.45, scale: 2.0, label: "bison2" },
];

// Hand print positions
const HAND_PRINTS = [
  { x: 0.18, y: 0.7 },
  { x: 0.82, y: 0.3 },
  { x: 0.65, y: 0.72 },
];

interface Props {
  frames: EnhancedFrameData[];
}

export const CavePaintings: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Precompute positions with useMemo-safe seeded random
  const rng = React.useMemo(() => seeded(9173), []);
  const figureOffsets = React.useMemo(() => {
    const r = seeded(9173);
    return FIGURES.map(() => ({
      jitterX: (r() - 0.5) * 30,
      jitterY: (r() - 0.5) * 20,
      colorIdx: Math.floor(r() * COLORS.length),
      pathLen: 400 + r() * 200,
    }));
  }, []);

  const handData = React.useMemo(() => {
    const r = seeded(4421);
    return HAND_PRINTS.map(() => ({
      colorIdx: Math.floor(r() * COLORS.length),
      rot: (r() - 0.5) * 30,
    }));
  }, []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Timing gate
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
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.3, 0.75], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Draw speed driven by energy
  const drawSpeed = 0.3 + energy * 2.5;

  const glowSize = interpolate(energy, [0.02, 0.25], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px #A0522D) drop-shadow(0 0 ${glowSize * 2}px #8B4513)`,
          willChange: "opacity",
        }}
      >
        {/* Animal figures with stroke-dasharray draw animation */}
        {FIGURES.map((fig, fi) => {
          const fo = figureOffsets[fi];
          const staggerDelay = fi * 0.15;
          const drawProgress = interpolate(
            progress,
            [staggerDelay, Math.min(staggerDelay + 0.5 / drawSpeed, 0.95)],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const dashLen = fo.pathLen;
          const dashOffset = dashLen * (1 - drawProgress);
          const color = COLORS[fo.colorIdx];
          const cx = fig.x * width + fo.jitterX;
          const cy = fig.y * height + fo.jitterY;

          return (
            <g key={fig.label} transform={`translate(${cx}, ${cy}) scale(${fig.scale})`}>
              <path
                d={fig.path}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dashLen}
                strokeDashoffset={dashOffset}
                opacity={0.85}
              />
              {/* Faint fill that appears as drawing completes */}
              <path
                d={fig.path}
                fill={color}
                stroke="none"
                opacity={drawProgress * 0.15}
              />
            </g>
          );
        })}

        {/* Hand prints */}
        {HAND_PRINTS.map((hp, hi) => {
          const hd = handData[hi];
          const staggerDelay = 0.3 + hi * 0.12;
          const handProgress = interpolate(
            progress,
            [staggerDelay, Math.min(staggerDelay + 0.2, 0.95)],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const color = COLORS[hd.colorIdx];
          const hx = hp.x * width;
          const hy = hp.y * height;
          const handOpacity = handProgress * 0.7;

          // Simple hand: palm circle + 5 finger dots
          return (
            <g
              key={`hand-${hi}`}
              transform={`translate(${hx}, ${hy}) rotate(${hd.rot})`}
              opacity={handOpacity}
            >
              {/* Palm */}
              <circle cx={0} cy={0} r={18} fill={color} opacity={0.6} />
              {/* Thumb */}
              <circle cx={-18} cy={-8} r={7} fill={color} opacity={0.55} />
              {/* Index */}
              <circle cx={-8} cy={-22} r={6} fill={color} opacity={0.55} />
              {/* Middle */}
              <circle cx={2} cy={-25} r={6} fill={color} opacity={0.55} />
              {/* Ring */}
              <circle cx={12} cy={-22} r={5.5} fill={color} opacity={0.55} />
              {/* Pinky */}
              <circle cx={20} cy={-16} r={5} fill={color} opacity={0.55} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
