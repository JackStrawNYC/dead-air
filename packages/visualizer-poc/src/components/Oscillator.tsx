/**
 * Oscillator — Sine/square/sawtooth waveform generator visualization.
 * Draws 3 waveforms stacked vertically, each morphing shape based on
 * spectral data (sub/mid/high). Wave amplitude tracks energy, frequency
 * tracks centroid. Neon green/cyan on dark background.
 * Appears every 40s for 14s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE = 1200; // 40s at 30fps
const DURATION = 420; // 14s
const WAVE_POINTS = 120;

type WaveType = "sine" | "square" | "sawtooth";

interface WaveConfig {
  type: WaveType;
  color: string;
  glowColor: string;
  yOffset: number; // fraction of height (0-1)
  bandKey: "sub" | "mid" | "high";
  freqBase: number;
  phaseOffset: number;
}

function generateWaves(seed: number): WaveConfig[] {
  const rng = seeded(seed);
  return [
    {
      type: "sine",
      color: "#00ff88",
      glowColor: "rgba(0, 255, 136, 0.4)",
      yOffset: 0.25,
      bandKey: "sub",
      freqBase: 2 + rng() * 1,
      phaseOffset: rng() * Math.PI * 2,
    },
    {
      type: "square",
      color: "#00ddff",
      glowColor: "rgba(0, 221, 255, 0.4)",
      yOffset: 0.5,
      bandKey: "mid",
      freqBase: 3 + rng() * 2,
      phaseOffset: rng() * Math.PI * 2,
    },
    {
      type: "sawtooth",
      color: "#ff44cc",
      glowColor: "rgba(255, 68, 204, 0.4)",
      yOffset: 0.75,
      bandKey: "high",
      freqBase: 4 + rng() * 2,
      phaseOffset: rng() * Math.PI * 2,
    },
  ];
}

function waveValue(type: WaveType, t: number): number {
  const normalized = ((t % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  switch (type) {
    case "sine":
      return Math.sin(t);
    case "square":
      return normalized < Math.PI ? 1 : -1;
    case "sawtooth":
      return (normalized / Math.PI - 1);
    default:
      return Math.sin(t);
  }
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Oscillator: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const tempoFactor = useTempoFactor();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const currentFrame = frames[idx];
  const centroid = currentFrame?.centroid ?? 0.5;
  const sub = currentFrame?.sub ?? 0;
  const mid = currentFrame?.mid ?? 0;
  const high = currentFrame?.high ?? 0;
  const bandValues: Record<string, number> = { sub, mid, high };

  const waves = React.useMemo(() => generateWaves(14142), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const envelope = Math.min(fadeIn, fadeOut) * (0.45 + energy * 0.45);

  const margin = width * 0.05;
  const waveWidth = width - margin * 2;
  const ampScale = height * 0.08;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: envelope }}>
        <defs>
          <filter id="osc-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {waves.map((wave, wi) => {
          const bandEnergy = bandValues[wave.bandKey];
          const amplitude = ampScale * (0.3 + bandEnergy * 2.5) * (0.5 + energy * 1.5);
          const freq = wave.freqBase + centroid * 3;
          const cy = height * wave.yOffset;
          const phase = frame * 0.06 * tempoFactor + wave.phaseOffset;

          // Build path
          const points: string[] = [];
          for (let p = 0; p <= WAVE_POINTS; p++) {
            const t = p / WAVE_POINTS;
            const px = margin + t * waveWidth;
            const theta = t * freq * Math.PI * 2 + phase;
            const val = waveValue(wave.type, theta);
            const py = cy + val * amplitude;
            points.push(`${p === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`);
          }
          const pathD = points.join(" ");

          // Label
          const labelX = margin + 4;
          const labelY = cy - amplitude - 12;

          return (
            <g key={`wave${wi}`}>
              {/* Center line */}
              <line
                x1={margin}
                y1={cy}
                x2={margin + waveWidth}
                y2={cy}
                stroke={wave.color}
                strokeWidth={0.3}
                opacity={0.15}
                strokeDasharray="4 8"
              />
              {/* Glow layer */}
              <path
                d={pathD}
                stroke={wave.glowColor}
                strokeWidth={4}
                fill="none"
                filter="url(#osc-glow)"
                opacity={0.5}
              />
              {/* Main wave */}
              <path
                d={pathD}
                stroke={wave.color}
                strokeWidth={1.8}
                fill="none"
                strokeLinejoin="round"
              />
              {/* Label */}
              <text
                x={labelX}
                y={labelY}
                fill={wave.color}
                fontSize={10}
                fontFamily="monospace"
                opacity={0.6}
              >
                {wave.type.toUpperCase()} [{wave.bandKey.toUpperCase()}]
              </text>
            </g>
          );
        })}

        {/* Frequency readout */}
        <text
          x={width - margin}
          y={height * 0.25 - ampScale - 12}
          fill="#00ff88"
          fontSize={9}
          fontFamily="monospace"
          opacity={0.4}
          textAnchor="end"
        >
          f={((centroid * 8000) + 200).toFixed(0)}Hz
        </text>
      </svg>
    </div>
  );
};
