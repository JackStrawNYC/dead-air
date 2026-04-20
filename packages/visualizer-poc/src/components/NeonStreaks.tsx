/**
 * NeonStreaks — A+++ atmospheric overlay: luminous colored light trails
 * sweeping across the frame in slow arcs. Pure light — no objects, no hands,
 * no glow sticks. Just dozens of radiant streaks in vivid neon colors
 * (magenta, cyan, gold, lime, violet) with multi-layer glow halos and
 * motion-persistent tails.
 *
 * Each streak follows a sine-composite path with unique frequency, phase,
 * and amplitude. Trails persist via opacity decay, creating ribbons of light.
 * Energy increases streak count and brightness. Bass pulses streak width.
 * Beat snaps trigger brief flare bursts. Chroma hue rotates the palette.
 *
 * Audio reactivity:
 *   slowEnergy    → streak brightness and count gate
 *   energy        → arc speed and trail length
 *   bass          → streak width pulse
 *   beatDecay     → simultaneous brightness flare
 *   onsetEnvelope → new streak spawn burst
 *   chromaHue     → palette rotation
 *   tempoFactor   → sweep speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const STREAK_COUNT = 48;
const TRAIL_POINTS = 32;

interface Streak {
  freqX: number;
  freqY: number;
  ampX: number;
  ampY: number;
  phaseX: number;
  phaseY: number;
  speed: number;
  hue: number;
  saturation: number;
  baseWidth: number;
  baseOpacity: number;
  spawnThreshold: number;
}

function buildStreaks(seed: number): Streak[] {
  const rng = seeded(seed);
  const streaks: Streak[] = [];
  const hues = [320, 180, 45, 90, 270, 200, 350, 150]; // magenta, cyan, gold, lime, violet, teal, pink, green

  for (let i = 0; i < STREAK_COUNT; i++) {
    streaks.push({
      freqX: 0.3 + rng() * 1.2,
      freqY: 0.2 + rng() * 0.8,
      ampX: 0.15 + rng() * 0.35,
      ampY: 0.1 + rng() * 0.4,
      phaseX: rng() * Math.PI * 2,
      phaseY: rng() * Math.PI * 2,
      speed: 0.4 + rng() * 0.8,
      hue: hues[i % hues.length] + (rng() - 0.5) * 30,
      saturation: 80 + rng() * 20,
      baseWidth: 1.5 + rng() * 2.5,
      baseOpacity: 0.3 + rng() * 0.4,
      spawnThreshold: rng() * 0.7,
    });
  }
  return streaks;
}

const streaksData = buildStreaks(77291);

export const NeonStreaks: React.FC<{ frames: EnhancedFrameData[] }> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const audio = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = audio.energy ?? 0;
  const slowEnergy = audio.slowEnergy ?? energy;
  const bass = audio.bass ?? 0;
  const beatDecay = audio.beatDecay ?? 0;
  const onset = audio.onsetEnvelope ?? 0;
  const chromaHue = audio.chromaHue ?? 0;

  const t = (frame / 30) * tempoFactor;

  // Energy gates how many streaks are visible
  const visibleCount = Math.floor(8 + slowEnergy * (STREAK_COUNT - 8));

  // Beat flare
  const flare = 1.0 + beatDecay * 0.6;

  // Hue rotation from chroma
  const hueShift = chromaHue * 360;

  const paths: React.ReactNode[] = [];

  for (let i = 0; i < visibleCount; i++) {
    const s = streaksData[i];
    if (slowEnergy < s.spawnThreshold) continue;

    // Generate trail points
    const points: { x: number; y: number }[] = [];
    for (let p = 0; p < TRAIL_POINTS; p++) {
      const age = p / TRAIL_POINTS;
      const tt = t * s.speed - age * (0.5 + energy * 0.5);

      const x = 0.5 + Math.sin(tt * s.freqX + s.phaseX) * s.ampX
                     + Math.sin(tt * s.freqX * 1.7 + s.phaseY) * s.ampX * 0.3;
      const y = 0.5 + Math.cos(tt * s.freqY + s.phaseY) * s.ampY
                     + Math.cos(tt * s.freqY * 2.3 + s.phaseX) * s.ampY * 0.25;

      points.push({ x: x * width, y: y * height });
    }

    // Build SVG path
    if (points.length < 2) continue;
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let p = 1; p < points.length; p++) {
      d += ` L ${points[p].x.toFixed(1)} ${points[p].y.toFixed(1)}`;
    }

    const hue = (s.hue + hueShift) % 360;
    const strokeWidth = s.baseWidth * (1 + bass * 0.8) * flare;
    const opacity = s.baseOpacity * flare * Math.min(1, slowEnergy * 2);

    // Triple-layer glow: wide soft + medium + sharp core
    paths.push(
      <g key={`s${i}`}>
        <path
          d={d}
          fill="none"
          stroke={`hsla(${hue}, ${s.saturation}%, 70%, ${opacity * 0.15})`}
          strokeWidth={strokeWidth * 8}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#neonBlur)"
        />
        <path
          d={d}
          fill="none"
          stroke={`hsla(${hue}, ${s.saturation}%, 80%, ${opacity * 0.4})`}
          strokeWidth={strokeWidth * 3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={d}
          fill="none"
          stroke={`hsla(${hue}, ${s.saturation}%, 95%, ${opacity * 0.8})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>,
    );
  }

  if (paths.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <defs>
        <filter id="neonBlur">
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>
      {paths}
    </svg>
  );
};
