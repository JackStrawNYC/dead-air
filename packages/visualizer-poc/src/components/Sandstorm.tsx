/**
 * Sandstorm — Desert sand particles swirling. 100 tiny particles (1-3px circles)
 * moving generally right-to-left with turbulent vertical variation. Warm sand
 * colors (tan, amber, khaki). Particle density and speed scale with energy.
 * Horizontal streaks for fast particles. Dust haze gradient overlay (warm amber)
 * at bottom 20%. Only visible when energy > 0.1. Evokes desert/El Paso.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Warm sand palette
const SAND_COLORS = [
  "#D2B48C", // tan
  "#C19A6B", // camel
  "#DAA520", // goldenrod
  "#F0E68C", // khaki
  "#CD853F", // peru
  "#DEB887", // burlywood
  "#E8C872", // warm gold
  "#C4A35A", // desert sand
];

const NUM_PARTICLES = 100;

interface SandParticle {
  x: number; // 0-1 starting position
  y: number;
  speed: number; // pixels per frame
  size: number;
  colorIdx: number;
  turbulenceFreq: number;
  turbulenceAmp: number;
  phase: number;
  streakLength: number; // how much motion blur (0-1)
  opacity: number;
}

function generateParticles(seed: number): SandParticle[] {
  const rng = seeded(seed);
  const particles: SandParticle[] = [];
  for (let i = 0; i < NUM_PARTICLES; i++) {
    particles.push({
      x: rng(),
      y: rng(),
      speed: 1.5 + rng() * 4,
      size: 1 + rng() * 2,
      colorIdx: Math.floor(rng() * SAND_COLORS.length),
      turbulenceFreq: 0.02 + rng() * 0.06,
      turbulenceAmp: 10 + rng() * 40,
      phase: rng() * Math.PI * 2,
      streakLength: rng() * 0.8,
      opacity: 0.3 + rng() * 0.5,
    });
  }
  return particles;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Sandstorm: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // ALL useMemo BEFORE any return null
  const particles = React.useMemo(() => generateParticles(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Only visible when energy > 0.1
  const baseOpacity = interpolate(energy, [0.1, 0.2, 0.5], [0, 0.5, 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  if (baseOpacity < 0.01) return null;

  // Energy-driven speed multiplier
  const speedMult = interpolate(energy, [0.1, 0.4], [0.5, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Energy-driven particle visibility (more particles visible at higher energy)
  const visibleCount = Math.floor(
    interpolate(energy, [0.1, 0.5], [30, NUM_PARTICLES], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  // Dust haze opacity
  const hazeOpacity = interpolate(energy, [0.1, 0.4], [0.05, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: baseOpacity }}>
        {particles.slice(0, visibleCount).map((p, i) => {
          // Particle position: moves right-to-left with wrapping
          const totalTravel = frame * p.speed * speedMult;
          const rawX = p.x * width - (totalTravel % (width + 40));
          const px = ((rawX % (width + 40)) + width + 40) % (width + 40) - 20;

          // Turbulent vertical movement
          const turbulence = Math.sin(frame * p.turbulenceFreq + p.phase) * p.turbulenceAmp * speedMult;
          const py = p.y * height + turbulence;

          // Wrap Y
          const wy = ((py % height) + height) % height;

          const color = SAND_COLORS[p.colorIdx];
          const particleOpacity = p.opacity * baseOpacity;

          // Horizontal streak for fast particles
          const streakLen = p.streakLength * p.speed * speedMult * 3;

          if (streakLen > 2) {
            // Draw as a line (horizontal streak)
            return (
              <line
                key={i}
                x1={px}
                y1={wy}
                x2={px + streakLen}
                y2={wy}
                stroke={color}
                strokeWidth={p.size}
                strokeLinecap="round"
                opacity={particleOpacity * 0.7}
              />
            );
          }

          return (
            <circle
              key={i}
              cx={px}
              cy={wy}
              r={p.size}
              fill={color}
              opacity={particleOpacity}
            />
          );
        })}
      </svg>

      {/* Dust haze gradient overlay at bottom 20% */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: height * 0.2,
          background: `linear-gradient(to top, rgba(210, 180, 140, ${hazeOpacity}), transparent)`,
          pointerEvents: "none",
        }}
      />

      {/* Secondary haze at very bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: height * 0.08,
          background: `linear-gradient(to top, rgba(218, 165, 32, ${hazeOpacity * 0.5}), transparent)`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
