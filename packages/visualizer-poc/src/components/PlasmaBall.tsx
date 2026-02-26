/**
 * PlasmaBall — Electric plasma tendrils reaching from center toward edges.
 * 8-12 lightning-like paths using quadratic bezier curves, flickering rapidly.
 * Tendril length and brightness scale with energy.
 * Purple/blue/white color scheme.
 * Appears every 50s for 15s during energy > 0.15.
 * Central glowing orb pulses with sub-bass.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

// ── TENDRIL DATA ────────────────────────────────────────────────

const NUM_TENDRILS = 10;
const CYCLE = 1500; // 50 seconds
const DURATION = 450; // 15 seconds
const ENERGY_THRESHOLD = 0.15;

interface TendrilData {
  angle: number;
  lengthFactor: number;
  wobbleFreq: number;
  wobbleAmp: number;
  flickerSpeed: number;
  thickness: number;
  colorIdx: number;
}

const PLASMA_COLORS = [
  "#bb77ff", "#8844ff", "#6622dd", "#ffffff", "#aaccff",
  "#9955ee", "#cc88ff", "#7733ee", "#ddbbff", "#5511cc",
];

function generateTendrils(seed: number): TendrilData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_TENDRILS }, (_, i) => ({
    angle: (i / NUM_TENDRILS) * Math.PI * 2 + (rng() - 0.5) * 0.4,
    lengthFactor: 0.6 + rng() * 0.4,
    wobbleFreq: 0.15 + rng() * 0.25,
    wobbleAmp: 30 + rng() * 50,
    flickerSpeed: 0.3 + rng() * 0.5,
    thickness: 1.5 + rng() * 2.5,
    colorIdx: Math.floor(rng() * PLASMA_COLORS.length),
  }));
}

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const PlasmaBall: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  // Rolling energy (151-frame window)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const currentFrame = frames[idx];
  const subBass = currentFrame ? currentFrame.sub : 0;

  const tendrils = React.useMemo(() => generateTendrils(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;
  if (energy < ENERGY_THRESHOLD) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const envelope = Math.min(fadeIn, fadeOut);

  const cx = width / 2;
  const cy = height / 2;
  const maxReach = Math.min(width, height) * 0.45;

  // Orb pulse with sub-bass
  const orbRadius = 25 + subBass * 35 + Math.sin(frame * 0.15) * 5;
  const orbGlow = 15 + subBass * 25;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          opacity: envelope * 0.85,
          filter: `drop-shadow(0 0 10px rgba(136, 68, 255, 0.6))`,
        }}
      >
        <defs>
          <radialGradient id="plasma-orb-grad">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="40%" stopColor="#bb88ff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#6622dd" stopOpacity="0" />
          </radialGradient>
          <filter id="plasma-glow">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Central orb */}
        <circle cx={cx} cy={cy} r={orbRadius * 1.8} fill="url(#plasma-orb-grad)" opacity={0.4} filter="url(#plasma-glow)" />
        <circle cx={cx} cy={cy} r={orbRadius} fill="url(#plasma-orb-grad)" opacity={0.9} />

        {/* Tendrils */}
        {tendrils.map((t, i) => {
          const rng = seeded(frame * 3 + i * 137);
          const flicker = 0.4 + rng() * 0.6;
          if (flicker < 0.3) return null; // Random dropout for flickering effect

          const reach = maxReach * t.lengthFactor * energy * 3;
          const clampedReach = Math.min(reach, maxReach);
          const angle = t.angle + Math.sin(frame * 0.01 + i) * 0.15;

          // End point
          const ex = cx + Math.cos(angle) * clampedReach;
          const ey = cy + Math.sin(angle) * clampedReach;

          // Control points with wobble for lightning effect
          const wobble1 = Math.sin(frame * t.wobbleFreq + i * 2.3) * t.wobbleAmp;
          const wobble2 = Math.cos(frame * t.wobbleFreq * 1.3 + i * 1.7) * t.wobbleAmp * 0.7;

          const midAngle = angle + Math.PI / 2;
          const cp1x = cx + Math.cos(angle) * clampedReach * 0.35 + Math.cos(midAngle) * wobble1;
          const cp1y = cy + Math.sin(angle) * clampedReach * 0.35 + Math.sin(midAngle) * wobble1;
          const cp2x = cx + Math.cos(angle) * clampedReach * 0.7 + Math.cos(midAngle) * wobble2;
          const cp2y = cy + Math.sin(angle) * clampedReach * 0.7 + Math.sin(midAngle) * wobble2;

          const color = PLASMA_COLORS[t.colorIdx];
          const strokeOpacity = flicker * energy * 3;

          return (
            <g key={i}>
              {/* Glow layer */}
              <path
                d={`M ${cx} ${cy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`}
                stroke={color}
                strokeWidth={t.thickness * 3}
                fill="none"
                opacity={strokeOpacity * 0.3}
                filter="url(#plasma-glow)"
              />
              {/* Core tendril */}
              <path
                d={`M ${cx} ${cy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`}
                stroke={color}
                strokeWidth={t.thickness}
                fill="none"
                opacity={Math.min(strokeOpacity, 0.9)}
                strokeLinecap="round"
              />
              {/* White core */}
              <path
                d={`M ${cx} ${cy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`}
                stroke="white"
                strokeWidth={t.thickness * 0.4}
                fill="none"
                opacity={Math.min(strokeOpacity * 0.5, 0.6)}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
