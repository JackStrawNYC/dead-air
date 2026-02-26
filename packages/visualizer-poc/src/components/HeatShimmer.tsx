/**
 * HeatShimmer -- Vertical heat distortion lines rising from bottom of screen.
 * 15-20 thin vertical wavy lines that shimmer and undulate.
 * Creates mirage-like heat haze effect. Very subtle -- transparent lines
 * with slight brightness variation. More intense shimmer with higher energy.
 * Desert/summer atmosphere. Always visible at 0.05-0.15 opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
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

interface ShimmerLine {
  xFraction: number;   // 0-1 x position
  waveFreq1: number;   // primary horizontal wave frequency
  waveAmp1: number;    // primary amplitude
  waveFreq2: number;   // secondary wave frequency
  waveAmp2: number;    // secondary amplitude
  phase: number;       // phase offset
  riseSpeed: number;   // vertical rise rate
  heightFraction: number; // how much of screen this line covers (0.3-0.7)
  lineWidth: number;   // stroke width
  brightnessOffset: number; // slight color variation
}

function generateLines(seed: number): ShimmerLine[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_LINES }, () => ({
    xFraction: 0.03 + rng() * 0.94,
    waveFreq1: 0.008 + rng() * 0.015,
    waveAmp1: 2 + rng() * 5,
    waveFreq2: 0.02 + rng() * 0.03,
    waveAmp2: 1 + rng() * 3,
    phase: rng() * Math.PI * 2,
    riseSpeed: 0.3 + rng() * 0.6,
    heightFraction: 0.3 + rng() * 0.4,
    lineWidth: 0.5 + rng() * 1.5,
    brightnessOffset: -10 + rng() * 20,
  }));
}

const SEGMENTS_PER_LINE = 30;

interface Props {
  frames: EnhancedFrameData[];
}

export const HeatShimmer: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const lines = React.useMemo(() => generateLines(7041977), []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Always visible -- opacity scales with energy between 0.05 and 0.15
  const masterOpacity = interpolate(energy, [0, 0.2], [0.05, 0.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Intensity scales wave amplitude with energy
  const intensityScale = interpolate(energy, [0, 0.25], [0.6, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          mixBlendMode: "overlay",
        }}
      >
        {lines.map((line, li) => {
          const baseX = line.xFraction * width;
          const startY = height; // bottom of screen
          const endY = height * (1 - line.heightFraction);

          // Build wavy vertical path from bottom upward
          const points: string[] = [];
          for (let s = 0; s <= SEGMENTS_PER_LINE; s++) {
            const t = s / SEGMENTS_PER_LINE;
            const y = startY - t * (startY - endY);

            // Rising motion offset
            const riseOffset = frame * line.riseSpeed * 0.5;

            // Horizontal undulation (combines two sine waves)
            const wave1 = Math.sin((y + riseOffset) * line.waveFreq1 + line.phase + frame * 0.03) * line.waveAmp1 * intensityScale;
            const wave2 = Math.sin((y + riseOffset) * line.waveFreq2 + line.phase * 1.7 + frame * 0.05) * line.waveAmp2 * intensityScale;

            const x = baseX + wave1 + wave2;

            points.push(s === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
          }

          // Fade out toward top
          const gradId = `shimmer-fade-${li}`;

          // Color: near-white with slight warm tint, varying brightness
          const brightness = 220 + line.brightnessOffset;
          const r = Math.min(255, brightness + 15);
          const g = Math.min(255, brightness + 8);
          const b = Math.min(255, brightness - 5);

          return (
            <g key={li}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor={`rgb(${r},${g},${b})`} stopOpacity="0.5" />
                  <stop offset="40%" stopColor={`rgb(${r},${g},${b})`} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={`rgb(${r},${g},${b})`} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={points.join(" ")}
                stroke={`url(#${gradId})`}
                strokeWidth={line.lineWidth}
                fill="none"
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
