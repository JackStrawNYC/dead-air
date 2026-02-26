/**
 * DesertMirage — Shimmering desert mirage effect at bottom 20% of screen.
 * Horizontal wavy distortion lines that shimmer and undulate. Creates illusion
 * of water/reflection on hot sand. Very subtle -- thin wavy horizontal strokes
 * with low opacity. Shimmer frequency and intensity driven by energy.
 * Warm amber/gold tones. Always visible at 0.04-0.12 opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUM_LINES = 18;

interface MirageLine {
  yRatio: number; // 0-1 within the mirage zone
  amplitude: number;
  frequency: number;
  phase: number;
  strokeWidth: number;
  hue: number; // warm amber range
  saturation: number;
  lightness: number;
  baseOpacity: number;
  speedMult: number;
}

function generateLines(seed: number): MirageLine[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_LINES }, () => ({
    yRatio: rng(),
    amplitude: 2 + rng() * 6,
    frequency: 0.005 + rng() * 0.015,
    phase: rng() * Math.PI * 2,
    strokeWidth: 0.5 + rng() * 1.2,
    hue: 35 + rng() * 20, // amber to gold
    saturation: 40 + rng() * 30,
    lightness: 55 + rng() * 25,
    baseOpacity: 0.3 + rng() * 0.5,
    speedMult: 0.6 + rng() * 0.8,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const DesertMirage: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const lines = React.useMemo(() => generateLines(18770508), []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Always visible: opacity 0.04-0.12 based on energy
  const masterOpacity = interpolate(energy, [0, 0.3], [0.04, 0.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Mirage zone: bottom 20% of screen
  const zoneTop = height * 0.8;
  const zoneHeight = height * 0.2;

  // Shimmer speed multiplier from energy
  const shimmerSpeed = 1 + energy * 3;

  // Number of sample points per line
  const numPoints = 60;
  const stepX = width / (numPoints - 1);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {/* Subtle gradient overlay for mirage heat effect */}
        <defs>
          <linearGradient id="mirage-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,200,100,0)" stopOpacity="0" />
            <stop offset="40%" stopColor="rgba(255,200,100,0.15)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="rgba(255,200,100,0.05)" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* Heat haze background rectangle */}
        <rect
          x={0}
          y={zoneTop}
          width={width}
          height={zoneHeight}
          fill="url(#mirage-fade)"
          opacity={0.4 + energy * 0.3}
        />
        {/* Wavy distortion lines */}
        {lines.map((line, li) => {
          const baseY = zoneTop + line.yRatio * zoneHeight;
          const timePhase = frame * line.frequency * shimmerSpeed * line.speedMult + line.phase;

          // Build polyline path
          const points: string[] = [];
          for (let p = 0; p < numPoints; p++) {
            const px = p * stepX;
            // Multiple sine waves for organic feel
            const wave1 = Math.sin(px * 0.008 + timePhase) * line.amplitude;
            const wave2 = Math.sin(px * 0.015 + timePhase * 1.3 + 1.5) * line.amplitude * 0.5;
            const wave3 = Math.sin(px * 0.003 + timePhase * 0.7 + 3.0) * line.amplitude * 0.3;
            const py = baseY + wave1 + wave2 + wave3;
            points.push(`${px},${py}`);
          }

          // Shimmer opacity variation over time
          const shimmerOp =
            line.baseOpacity *
            (0.7 + 0.3 * Math.sin(frame * 0.04 * line.speedMult + li * 0.8));

          const color = `hsla(${line.hue}, ${line.saturation}%, ${line.lightness}%, ${shimmerOp})`;

          return (
            <polyline
              key={li}
              points={points.join(" ")}
              stroke={color}
              strokeWidth={line.strokeWidth}
              fill="none"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
};
