/**
 * HilbertCurve — Space-filling Hilbert curve that draws itself progressively.
 * A single continuous line visiting every cell of a grid in a recursive
 * U-shaped pattern. Line draws frame by frame via stroke-dashoffset.
 * Rainbow gradient along the curve length (hue shifts). Grid order 5
 * (1024 cells). Energy drives draw speed.
 * Cycle: 65s (1950 frames), 22s visible (660 frames).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1950;    // 65 seconds at 30fps
const DURATION = 660;  // 22 seconds visible
const STAGGER_OFFSET = 420; // 14s offset
const ORDER = 5;       // 2^5 = 32x32 grid = 1024 cells

/**
 * Convert Hilbert curve index d to (x, y) coordinates for a given order n.
 * Uses the standard bit-manipulation algorithm.
 */
function d2xy(n: number, d: number): [number, number] {
  let x = 0;
  let y = 0;
  let rx: number;
  let ry: number;
  let s: number;
  let t = d;

  for (s = 1; s < n; s *= 2) {
    rx = 1 & (t / 2);
    ry = 1 & (t ^ rx);
    // Rotate
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const tmp = x;
      x = y;
      y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }

  return [x, y];
}

/** Generate all points along the Hilbert curve */
function generateHilbertPoints(order: number): Array<[number, number]> {
  const n = 1 << order; // 2^order
  const total = n * n;
  const points: Array<[number, number]> = [];
  for (let d = 0; d < total; d++) {
    points.push(d2xy(n, d));
  }
  return points;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const HilbertCurve: React.FC<Props> = ({ frames }) => {
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

  const hilbertPoints = React.useMemo(() => generateHilbertPoints(ORDER), []);

  // Periodic visibility
  const effectiveFrame = Math.max(0, frame - STAGGER_OFFSET);
  const cycleFrame = effectiveFrame % CYCLE;
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
  const visibility = Math.min(fadeIn, fadeOut);

  const energyOpacity = interpolate(energy, [0.04, 0.25], [0.12, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = visibility * energyOpacity;
  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const gridSize = Math.min(width, height) * 0.55;
  const n = 1 << ORDER;
  const cellSize = gridSize / n;

  // Build the SVG path
  const pathParts: string[] = [];
  for (let i = 0; i < hilbertPoints.length; i++) {
    const [gx, gy] = hilbertPoints[i];
    const px = (gx + 0.5) * cellSize - gridSize / 2;
    const py = (gy + 0.5) * cellSize - gridSize / 2;
    pathParts.push(i === 0 ? `M ${px} ${py}` : `L ${px} ${py}`);
  }
  const pathD = pathParts.join(" ");

  // Estimate total path length (each segment is cellSize)
  const totalLength = (hilbertPoints.length - 1) * cellSize;

  // Draw speed driven by energy
  const speedMult = interpolate(energy, [0.03, 0.3], [0.6, 1.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Progressive draw: dashoffset goes from totalLength to 0
  const drawProgress = interpolate(
    progress * speedMult,
    [0, 0.85],
    [totalLength, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Rainbow hue cycling along the curve
  const baseHue = (cycleFrame * 0.8) % 360;

  const glowSize = interpolate(energy, [0.03, 0.3], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Segment colors — multiple gradient stops along the curve
  const numSegments = 8;
  const gradientStops = Array.from({ length: numSegments + 1 }, (_, i) => {
    const t = i / numSegments;
    const hue = (baseHue + t * 360) % 360;
    return { offset: `${t * 100}%`, color: `hsl(${hue}, 100%, 65%)` };
  });

  const gradientId = "hilbert-grad";

  // Head dot position (where the draw currently ends)
  const drawnFraction = 1 - drawProgress / totalLength;
  const headIndex = Math.min(
    hilbertPoints.length - 1,
    Math.floor(drawnFraction * hilbertPoints.length),
  );
  const [headGx, headGy] = hilbertPoints[headIndex];
  const headX = (headGx + 0.5) * cellSize - gridSize / 2;
  const headY = (headGy + 0.5) * cellSize - gridSize / 2;

  const headHue = (baseHue + drawnFraction * 360) % 360;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          mixBlendMode: "screen",
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {gradientStops.map((stop, i) => (
              <stop key={i} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>

        <g transform={`translate(${cx}, ${cy})`}>
          {/* Glow layer */}
          <path
            d={pathD}
            fill="none"
            stroke={`hsla(${baseHue}, 100%, 70%, 0.3)`}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={totalLength}
            strokeDashoffset={drawProgress}
            style={{
              filter: `blur(${2 + energy * 3}px)`,
            }}
          />

          {/* Main curve with gradient */}
          <path
            d={pathD}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={1.8 + energy * 1}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={totalLength}
            strokeDashoffset={drawProgress}
            style={{
              filter: `drop-shadow(0 0 ${glowSize}px hsla(${baseHue}, 100%, 70%, 0.5))`,
            }}
          />

          {/* White core */}
          <path
            d={pathD}
            fill="none"
            stroke="white"
            strokeWidth={0.6}
            opacity={0.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={totalLength}
            strokeDashoffset={drawProgress}
          />

          {/* Head dot — bright point at the leading edge */}
          {drawnFraction > 0.01 && (
            <circle
              cx={headX}
              cy={headY}
              r={3 + energy * 5}
              fill={`hsl(${headHue}, 100%, 80%)`}
              opacity={0.9}
              style={{
                filter: `drop-shadow(0 0 ${8 + energy * 12}px hsl(${headHue}, 100%, 70%))`,
              }}
            />
          )}

          {/* Grid border (faint) */}
          <rect
            x={-gridSize / 2}
            y={-gridSize / 2}
            width={gridSize}
            height={gridSize}
            fill="none"
            stroke={`hsla(${baseHue}, 60%, 50%, 0.15)`}
            strokeWidth={0.5}
            strokeDasharray="4 8"
          />
        </g>
      </svg>
    </div>
  );
};
