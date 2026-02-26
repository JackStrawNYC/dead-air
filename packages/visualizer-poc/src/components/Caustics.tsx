/**
 * Caustics — Underwater light caustic patterns. Overlapping sine-wave
 * interference creating bright rippling nodes, like light at the bottom
 * of a pool. Cool blue-white-cyan palette. Pattern complexity and brightness
 * driven by energy. Always visible at 0.05-0.2 opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Number of caustic "light patches" to render
const NUM_PATCHES = 18;

interface CausticPatch {
  cx: number;
  cy: number;
  baseRadius: number;
  freqX: number;
  freqY: number;
  phase: number;
  driftSpeed: number;
  driftAngle: number;
  hueShift: number;
}

function generatePatches(seed: number): CausticPatch[] {
  const rng = mulberry32(seed);
  return Array.from({ length: NUM_PATCHES }, () => ({
    cx: rng(),
    cy: rng(),
    baseRadius: 40 + rng() * 120,
    freqX: 0.01 + rng() * 0.025,
    freqY: 0.01 + rng() * 0.025,
    phase: rng() * Math.PI * 2,
    driftSpeed: 0.002 + rng() * 0.004,
    driftAngle: rng() * Math.PI * 2,
    hueShift: rng() * 30 - 15,
  }));
}

export const Caustics: React.FC<Props> = ({ frames }) => {
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

  const patches = React.useMemo(() => generatePatches(8181), []);

  // Always visible, opacity driven by energy: 0.05-0.2
  const opacity = interpolate(energy, [0.02, 0.25], [0.05, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.005) return null;

  // Complexity scales with energy — more patches shown at higher energy
  const visibleCount = Math.floor(interpolate(energy, [0.02, 0.3], [6, NUM_PATCHES], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  // Speed of pattern animation driven by energy
  const timeScale = interpolate(energy, [0.02, 0.3], [0.6, 1.5], {
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
          mixBlendMode: "screen",
          willChange: "opacity",
        }}
      >
        <defs>
          <filter id="caustic-blur">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feComposite in="blur" in2="blur" operator="arithmetic" k1="0" k2="1.5" k3="0" k4="-0.1" />
          </filter>
          <radialGradient id="caustic-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(200, 240, 255, 0.9)" />
            <stop offset="40%" stopColor="rgba(100, 200, 255, 0.5)" />
            <stop offset="100%" stopColor="rgba(50, 150, 255, 0)" />
          </radialGradient>
        </defs>

        <g filter="url(#caustic-blur)">
          {patches.slice(0, visibleCount).map((p, i) => {
            // Each patch drifts and deforms over time
            const t = frame * timeScale;
            const moveX = Math.sin(t * p.freqX + p.phase) * 80 + Math.cos(t * p.driftSpeed + p.driftAngle) * 40;
            const moveY = Math.cos(t * p.freqY + p.phase * 1.3) * 60 + Math.sin(t * p.driftSpeed * 0.7) * 30;
            const cx = p.cx * width + moveX;
            const cy = p.cy * height + moveY;

            // Radius "breathes" with interference pattern
            const breathe = 1 + Math.sin(t * 0.03 + p.phase) * 0.3 + Math.sin(t * 0.07 + i) * 0.15;
            const rx = p.baseRadius * breathe * (1 + energy * 0.5);
            const ry = p.baseRadius * breathe * (0.7 + Math.sin(t * 0.02 + p.phase * 0.5) * 0.3) * (1 + energy * 0.5);

            // Rotation
            const rotation = t * 0.5 + p.phase * 57.3;

            // Color: blue-cyan-white spectrum
            const hue = 190 + p.hueShift + Math.sin(t * 0.01 + i) * 15;
            const lightness = 70 + energy * 20;

            // Pulse opacity
            const pulseOp = 0.3 + Math.sin(t * 0.04 + p.phase) * 0.2 + energy * 0.3;

            return (
              <ellipse
                key={i}
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                fill={`hsla(${hue}, 80%, ${lightness}%, ${pulseOp})`}
                transform={`rotate(${rotation} ${cx} ${cy})`}
              />
            );
          })}

          {/* Network of bright lines connecting nearby patches — caustic network */}
          {patches.slice(0, Math.min(visibleCount, 10)).map((p, i) => {
            const t = frame * timeScale;
            const x1 = p.cx * width + Math.sin(t * p.freqX + p.phase) * 80;
            const y1 = p.cy * height + Math.cos(t * p.freqY + p.phase * 1.3) * 60;
            const nextP = patches[(i + 1) % visibleCount];
            const x2 = nextP.cx * width + Math.sin(t * nextP.freqX + nextP.phase) * 80;
            const y2 = nextP.cy * height + Math.cos(t * nextP.freqY + nextP.phase * 1.3) * 60;

            // Wavy connecting line
            const midX = (x1 + x2) / 2 + Math.sin(t * 0.02 + i) * 30;
            const midY = (y1 + y2) / 2 + Math.cos(t * 0.015 + i) * 25;

            return (
              <path
                key={`line-${i}`}
                d={`M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`}
                fill="none"
                stroke={`hsla(195, 90%, 80%, ${0.1 + energy * 0.15})`}
                strokeWidth={1.5 + energy * 2}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
