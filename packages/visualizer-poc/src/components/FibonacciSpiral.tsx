/**
 * FibonacciSpiral — Golden spiral growing outward from center.
 * Quarter-circle arcs with radii following the Fibonacci sequence.
 * Golden/amber color with neon glow. Spiral growth speed driven
 * by energy. Small dots at Fibonacci positions along the spiral.
 * Sacred geometry feel. Cycle: 50s (1500 frames), 15s visible (450 frames).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1500;    // 50 seconds at 30fps
const DURATION = 450;  // 15 seconds visible
const STAGGER_OFFSET = 90; // 3s offset

// Fibonacci numbers for arc radii
const FIB: number[] = [];
{
  let a = 1, b = 1;
  for (let i = 0; i < 14; i++) {
    FIB.push(a);
    const tmp = a + b;
    a = b;
    b = tmp;
  }
}

/**
 * Build a quarter-circle arc SVG path.
 * Each arc turns 90 degrees, centered at corner of the growing spiral.
 */
function buildSpiralPath(
  numArcs: number,
  scaleFactor: number,
): { path: string; dots: Array<{ x: number; y: number }> } {
  const parts: string[] = [];
  const dots: Array<{ x: number; y: number }> = [];

  // Starting at origin, each arc is a quarter turn
  // Direction cycles: right, down, left, up
  let cx = 0;
  let cy = 0;
  let angle = 0; // current heading: 0=right, 90=down, 180=left, 270=up

  for (let i = 0; i < numArcs && i < FIB.length; i++) {
    const r = FIB[i] * scaleFactor;
    const startAngle = angle - 90;
    const endAngle = angle;

    // Arc endpoint
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const sx = cx + Math.cos(startRad) * r;
    const sy = cy + Math.sin(startRad) * r;
    const ex = cx + Math.cos(endRad) * r;
    const ey = cy + Math.sin(endRad) * r;

    if (i === 0) {
      parts.push(`M ${sx} ${sy}`);
    }

    // SVG arc: A rx ry x-rotation large-arc-flag sweep-flag x y
    parts.push(`A ${r} ${r} 0 0 1 ${ex} ${ey}`);

    // Dot at the end of each arc
    dots.push({ x: ex, y: ey });

    // Move center for next arc: the center shifts to the endpoint corner
    cx = cx + Math.cos(endRad) * r + Math.cos(startRad) * r;
    cy = cy + Math.sin(endRad) * r + Math.sin(startRad) * r;

    // Turn 90 degrees clockwise
    angle += 90;
  }

  return { path: parts.join(" "), dots };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const FibonacciSpiral: React.FC<Props> = ({ frames }) => {
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

  // No useMemo needed — pure computation each frame

  // Periodic visibility
  const effectiveFrame = Math.max(0, frame - STAGGER_OFFSET);
  const cycleFrame = effectiveFrame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const visibility = Math.min(fadeIn, fadeOut);

  const energyOpacity = interpolate(energy, [0.04, 0.25], [0.15, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = visibility * energyOpacity;
  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;

  // Number of arcs revealed over time, energy drives speed
  const speedMult = interpolate(energy, [0.03, 0.3], [0.6, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const numArcs = Math.min(
    FIB.length,
    Math.floor(2 + progress * 12 * speedMult),
  );

  // Scale factor so the spiral fits on screen
  const maxFib = FIB[Math.min(numArcs, FIB.length - 1)];
  const scaleFactor = Math.min(width, height) * 0.3 / Math.max(maxFib, 1);

  const { path, dots } = buildSpiralPath(numArcs, scaleFactor);

  // Golden/amber palette
  const baseHue = 42 + Math.sin(cycleFrame * 0.01) * 10; // 32-52 golden range
  const primaryColor = `hsl(${baseHue}, 85%, 60%)`;
  const glowColor = `hsla(${baseHue}, 100%, 65%, 0.6)`;
  const accentHue = (baseHue + 30) % 360;
  const accentColor = `hsl(${accentHue}, 90%, 70%)`;

  // Rotation: slow spin
  const rotation = cycleFrame * 0.15 * speedMult;

  const glowSize = interpolate(energy, [0.03, 0.3], [4, 16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Stroke-dashoffset for progressive draw effect
  const totalLength = 5000; // generous estimate
  const drawProgress = interpolate(progress, [0, 0.7], [totalLength, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          mixBlendMode: "screen",
          filter: `drop-shadow(0 0 ${glowSize}px ${glowColor}) drop-shadow(0 0 ${glowSize * 2}px ${glowColor})`,
        }}
      >
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
          {/* Outer glow layer */}
          <path
            d={path}
            fill="none"
            stroke={glowColor}
            strokeWidth={5}
            opacity={0.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={totalLength}
            strokeDashoffset={drawProgress}
          />

          {/* Main spiral */}
          <path
            d={path}
            fill="none"
            stroke={primaryColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={totalLength}
            strokeDashoffset={drawProgress}
          />

          {/* White center line */}
          <path
            d={path}
            fill="none"
            stroke="white"
            strokeWidth={0.8}
            opacity={0.3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={totalLength}
            strokeDashoffset={drawProgress}
          />

          {/* Fibonacci dots at arc endpoints */}
          {dots.map((dot, di) => {
            const dotProgress = interpolate(
              di,
              [0, Math.max(1, numArcs - 1)],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            const dotOpacity = interpolate(
              dotProgress,
              [0, 0.5, 1],
              [0.8, 0.6, 0.4],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            const dotSize = 2 + (1 - dotProgress) * 4 + energy * 3;
            return (
              <circle
                key={`fib-${di}`}
                cx={dot.x}
                cy={dot.y}
                r={dotSize}
                fill={accentColor}
                opacity={dotOpacity}
              />
            );
          })}

          {/* Center golden dot */}
          <circle
            cx={0}
            cy={0}
            r={5 + energy * 8}
            fill={`hsl(${baseHue}, 100%, 75%)`}
            opacity={0.7}
          />

          {/* Phi ratio indicator lines */}
          {numArcs > 3 && (
            <>
              <line
                x1={0}
                y1={-FIB[2] * scaleFactor}
                x2={0}
                y2={FIB[2] * scaleFactor}
                stroke={accentColor}
                strokeWidth={0.5}
                opacity={0.2}
                strokeDasharray="3 6"
              />
              <line
                x1={-FIB[2] * scaleFactor}
                y1={0}
                x2={FIB[2] * scaleFactor}
                y2={0}
                stroke={accentColor}
                strokeWidth={0.5}
                opacity={0.2}
                strokeDasharray="3 6"
              />
            </>
          )}
        </g>
      </svg>
    </div>
  );
};
