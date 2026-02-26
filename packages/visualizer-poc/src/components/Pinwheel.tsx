/**
 * Pinwheel -- 4-6 spinning pinwheels at corners and edges of screen.
 * Each pinwheel has 4-6 vanes in alternating bright colors (red/yellow, blue/green, etc).
 * Vanes are triangular segments. Spin speed driven directly by energy (fast during loud,
 * slow during quiet). Pinwheel sticks/handles visible. Carnival/childhood aesthetic.
 * Cycle: 45s (1350 frames), 14s (420 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface PinwheelData {
  x: number; // fraction of width
  y: number; // fraction of height
  radius: number;
  vaneCount: number;
  colors: string[];
  spinDirection: number; // 1 or -1
  stickAngle: number; // degrees from vertical
  stickLength: number;
  phaseOffset: number; // initial rotation
}

const COLOR_SETS: string[][] = [
  ["#FF1744", "#FFD600", "#FF1744", "#FFD600", "#FF1744", "#FFD600"],
  ["#2979FF", "#00E676", "#2979FF", "#00E676", "#2979FF", "#00E676"],
  ["#D500F9", "#FF9100", "#D500F9", "#FF9100", "#D500F9", "#FF9100"],
  ["#00BCD4", "#FFEB3B", "#00BCD4", "#FFEB3B", "#00BCD4", "#FFEB3B"],
  ["#E91E63", "#76FF03", "#E91E63", "#76FF03", "#E91E63", "#76FF03"],
];

function generatePinwheels(seed: number): PinwheelData[] {
  const rng = seeded(seed);

  const positions: [number, number][] = [
    [0.08, 0.12],  // top-left
    [0.92, 0.15],  // top-right
    [0.06, 0.75],  // bottom-left
    [0.94, 0.78],  // bottom-right
    [0.5, 0.08],   // top-center
  ];

  return positions.map((pos, i) => {
    const vaneCount = 4 + Math.floor(rng() * 3); // 4-6
    return {
      x: pos[0],
      y: pos[1],
      radius: 35 + rng() * 25,
      vaneCount,
      colors: COLOR_SETS[i % COLOR_SETS.length].slice(0, vaneCount),
      spinDirection: rng() > 0.5 ? 1 : -1,
      stickAngle: (rng() - 0.5) * 20,
      stickLength: 60 + rng() * 30,
      phaseOffset: rng() * 360,
    };
  });
}

const CYCLE = 1350; // 45s
const VISIBLE_DURATION = 420; // 14s

interface Props {
  frames: EnhancedFrameData[];
}

export const Pinwheel: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const pinwheels = React.useMemo(() => generatePinwheels(45197708), []);

  // Accumulate rotation. Use a simple approximation: rotation grows with frame.
  // Speed factor scaled by energy.
  const spinSpeed = React.useMemo(() => {
    // Pre-compute a base spin that we modulate by current energy
    return 1.0;
  }, []);

  const cycleFrame = frame % CYCLE;
  const isVisible = cycleFrame < VISIBLE_DURATION;

  const fadeIn = isVisible
    ? interpolate(cycleFrame, [0, 45], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  const fadeOut = isVisible
    ? interpolate(cycleFrame, [VISIBLE_DURATION - 45, VISIBLE_DURATION], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const masterOpacity = Math.min(fadeIn, fadeOut);

  if (!isVisible || masterOpacity < 0.01) return null;

  // Energy drives spin speed: slow when quiet, fast when loud
  const currentSpinRate = interpolate(energy, [0.02, 0.35], [0.5, 8.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * spinSpeed;

  // Rotation angle in degrees (accumulates with frame)
  const baseRotation = frame * currentSpinRate;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity * 0.75 }}>
        <defs>
          <filter id="pinwheel-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {pinwheels.map((pw, pi) => {
          const cx = pw.x * width;
          const cy = pw.y * height;
          const rotation = (baseRotation * pw.spinDirection + pw.phaseOffset) % 360;
          const anglePerVane = 360 / pw.vaneCount;

          // Stick endpoint
          const stickRad = ((pw.stickAngle + 180) * Math.PI) / 180;
          const stickEndX = cx + Math.sin(stickRad) * pw.stickLength;
          const stickEndY = cy + Math.cos(stickRad) * pw.stickLength;

          return (
            <g key={pi}>
              {/* Stick */}
              <line
                x1={cx}
                y1={cy}
                x2={stickEndX}
                y2={stickEndY}
                stroke="rgba(139, 90, 43, 0.8)"
                strokeWidth={4}
                strokeLinecap="round"
              />

              {/* Vanes */}
              <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
                {pw.colors.map((color, vi) => {
                  const startAngle = (vi * anglePerVane * Math.PI) / 180;
                  const endAngle = ((vi * anglePerVane + anglePerVane * 0.85) * Math.PI) / 180;

                  // Triangle vane: center -> tip at radius along startAngle -> tip at radius along endAngle
                  const tipX1 = cx + Math.cos(startAngle) * pw.radius;
                  const tipY1 = cy + Math.sin(startAngle) * pw.radius;
                  const tipX2 = cx + Math.cos(endAngle) * pw.radius * 0.7;
                  const tipY2 = cy + Math.sin(endAngle) * pw.radius * 0.7;

                  return (
                    <polygon
                      key={vi}
                      points={`${cx},${cy} ${tipX1},${tipY1} ${tipX2},${tipY2}`}
                      fill={color}
                      opacity={0.85}
                      filter="url(#pinwheel-glow)"
                    />
                  );
                })}
              </g>

              {/* Center pin */}
              <circle cx={cx} cy={cy} r={4} fill="rgba(200, 200, 200, 0.9)" />
              <circle cx={cx} cy={cy} r={2} fill="rgba(100, 100, 100, 0.9)" />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
