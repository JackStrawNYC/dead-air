/**
 * BassWaveform — Layer 3 (Reactive)
 * Stem-reactive oscilloscope in lower third driven by uStemBass.
 * First stem-reactive overlay.
 * Tier B | Tags: intense, organic | dutyCycle: 100 | energyBand: mid
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

const STAGGER_START = 120;
const WAVE_POINTS = 120;

interface Props {
  frames: EnhancedFrameData[];
}

export const BassWaveform: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const f = frames[idx];
  const stemBass = f.stemBassRms ?? f.sub;
  const energy = f.rms;

  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const masterOpacity = interpolate(stemBass, [0.03, 0.15, 0.40], [0.02, 0.12, 0.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * masterFade;

  if (masterOpacity < 0.005) return null;

  // Generate waveform path using stem bass as amplitude
  const baseY = height * 0.82;
  const waveWidth = width * 0.9;
  const startX = width * 0.05;
  const amplitude = 30 + stemBass * 80;

  // Build waveform using a combination of frequencies driven by audio
  const points: string[] = [];
  for (let i = 0; i <= WAVE_POINTS; i++) {
    const t = i / WAVE_POINTS;
    const x = startX + t * waveWidth;

    // Composite wave from multiple frequencies
    const freq1 = Math.sin(t * Math.PI * 4 + frame * 0.15) * stemBass;
    const freq2 = Math.sin(t * Math.PI * 8 + frame * 0.25) * stemBass * 0.5;
    const freq3 = Math.sin(t * Math.PI * 16 + frame * 0.35) * energy * 0.3;

    // Windowing: taper at edges
    const window = Math.sin(t * Math.PI);

    const y = baseY + (freq1 + freq2 + freq3) * amplitude * window;

    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const pathD = `M ${points[0]} ${points.slice(1).map(p => `L ${p}`).join(" ")}`;

  // Glow intensity from stem bass
  const glowSize = 3 + stemBass * 8;
  const hue = 270 + stemBass * 30; // purple to blue shift

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, mixBlendMode: "screen" }}>
        {/* Outer glow */}
        <path
          d={pathD}
          fill="none"
          stroke={`hsla(${hue}, 60%, 50%, 0.3)`}
          strokeWidth={glowSize * 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `blur(${glowSize}px)` }}
        />
        {/* Mid glow */}
        <path
          d={pathD}
          fill="none"
          stroke={`hsla(${hue}, 70%, 60%, 0.5)`}
          strokeWidth={glowSize}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `blur(${glowSize * 0.5}px)` }}
        />
        {/* Core line */}
        <path
          d={pathD}
          fill="none"
          stroke={`hsla(${hue}, 80%, 75%, 0.8)`}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Center line reference */}
        <line
          x1={startX} y1={baseY} x2={startX + waveWidth} y2={baseY}
          stroke="hsla(270, 30%, 50%, 0.08)"
          strokeWidth={0.5}
          strokeDasharray="4 8"
        />
      </svg>
    </div>
  );
};
