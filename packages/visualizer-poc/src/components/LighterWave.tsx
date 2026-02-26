/**
 * LighterWave — Sea of lighters swaying during slow songs.
 * 30-40 tiny flame SVGs arranged along bottom third. Each lighter has a small
 * rectangle body + teardrop flame. Flames sway gently with sine waves
 * (different phase per lighter). Only appears during QUIET passages
 * (energy < 0.12) — this is for the ballads. Flame brightness flickers.
 * Warm yellow/orange colors. Always ready but only visible when quiet.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface LighterData {
  /** x position as fraction of width */
  x: number;
  /** y position as fraction of height (bottom third: 0.67-0.95) */
  y: number;
  /** Sway frequency */
  swayFreq: number;
  /** Sway phase offset */
  swayPhase: number;
  /** Sway amplitude in degrees */
  swayAmp: number;
  /** Flicker frequency */
  flickerFreq: number;
  /** Flicker phase offset */
  flickerPhase: number;
  /** Base flame height multiplier */
  flameScale: number;
  /** Hue: warm yellow-orange range (30-55) */
  hue: number;
  /** Lighter body color darkness */
  bodyDarkness: number;
  /** Size multiplier (depth variation) */
  sizeMult: number;
}

const NUM_LIGHTERS = 35;

function generateLighters(seed: number): LighterData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_LIGHTERS }, () => ({
    x: 0.02 + rng() * 0.96,
    y: 0.67 + rng() * 0.28,
    swayFreq: 0.015 + rng() * 0.03,
    swayPhase: rng() * Math.PI * 2,
    swayAmp: 5 + rng() * 12,
    flickerFreq: 0.08 + rng() * 0.15,
    flickerPhase: rng() * Math.PI * 2,
    flameScale: 0.7 + rng() * 0.6,
    hue: 30 + rng() * 25,
    bodyDarkness: 0.15 + rng() * 0.25,
    sizeMult: 0.6 + rng() * 0.5,
  }));
}

// Stagger timing: 300 frames (10s) to build atmosphere
const STAGGER_START = 300;

interface Props {
  frames: EnhancedFrameData[];
}

export const LighterWave: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const lighters = React.useMemo(() => generateLighters(19770508), []);

  // Quiet detection: only visible when energy < 0.12
  const quietness = interpolate(energy, [0.04, 0.12], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const masterOpacity = quietness * masterFade * 0.85;

  if (masterOpacity < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          {lighters.map((_, i) => (
            <radialGradient key={`fg-${i}`} id={`flame-glow-${i}`} cx="50%" cy="60%" r="50%">
              <stop offset="0%" stopColor={`hsla(${lighters[i].hue}, 100%, 90%, 0.9)`} />
              <stop offset="50%" stopColor={`hsla(${lighters[i].hue}, 100%, 65%, 0.6)`} />
              <stop offset="100%" stopColor={`hsla(${lighters[i].hue + 10}, 100%, 45%, 0)`} />
            </radialGradient>
          ))}
        </defs>
        {lighters.map((lighter, i) => {
          // Stagger each lighter's entrance
          const lighterFade = interpolate(
            frame,
            [STAGGER_START + i * 6, STAGGER_START + i * 6 + 90],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          );
          if (lighterFade < 0.01) return null;

          const px = lighter.x * width;
          const py = lighter.y * height;
          const size = lighter.sizeMult;

          // Sway angle
          const sway = Math.sin(frame * lighter.swayFreq + lighter.swayPhase) * lighter.swayAmp;

          // Flicker intensity
          const flicker = 0.5 + (Math.sin(frame * lighter.flickerFreq + lighter.flickerPhase) * 0.3
            + Math.sin(frame * lighter.flickerFreq * 2.3 + lighter.flickerPhase * 1.7) * 0.2);

          // Flame height varies with flicker
          const flameH = 10 * lighter.flameScale * (0.8 + flicker * 0.4) * size;
          const flameW = 5 * lighter.flameScale * size;

          // Lighter body dimensions
          const bodyW = 6 * size;
          const bodyH = 16 * size;

          const alpha = lighterFade * flicker;
          const coreColor = `hsla(${lighter.hue}, 100%, 85%, ${alpha})`;
          const midColor = `hsla(${lighter.hue + 5}, 100%, 65%, ${alpha * 0.8})`;
          const outerColor = `hsla(${lighter.hue + 15}, 90%, 50%, ${alpha * 0.4})`;

          return (
            <g
              key={i}
              transform={`translate(${px}, ${py}) rotate(${sway}, 0, ${bodyH / 2})`}
              opacity={lighterFade}
            >
              {/* Lighter body */}
              <rect
                x={-bodyW / 2}
                y={0}
                width={bodyW}
                height={bodyH}
                rx={1.5}
                fill={`rgba(${40 + lighter.bodyDarkness * 80}, ${35 + lighter.bodyDarkness * 60}, ${50 + lighter.bodyDarkness * 50}, 0.7)`}
              />
              {/* Lighter top nozzle */}
              <rect
                x={-bodyW * 0.3 / 2}
                y={-2 * size}
                width={bodyW * 0.3}
                height={2 * size}
                fill="rgba(100, 100, 110, 0.6)"
              />
              {/* Outer glow */}
              <ellipse
                cx={0}
                cy={-flameH * 0.5 - 2 * size}
                rx={flameW * 2.5}
                ry={flameH * 1.8}
                fill={outerColor}
                style={{ filter: `blur(${4 * size}px)` }}
              />
              {/* Mid flame */}
              <ellipse
                cx={0}
                cy={-flameH * 0.4 - 2 * size}
                rx={flameW * 1.2}
                ry={flameH * 1.1}
                fill={midColor}
                style={{ filter: `blur(${2 * size}px)` }}
              />
              {/* Core flame (teardrop via ellipse) */}
              <ellipse
                cx={0}
                cy={-flameH * 0.35 - 2 * size}
                rx={flameW * 0.6}
                ry={flameH * 0.8}
                fill={coreColor}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
