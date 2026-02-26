/**
 * PollenDrift — 40-60 tiny floating particles like dandelion seeds or pollen.
 * Each particle is a small starburst (4-6 tiny lines from center). Drift slowly
 * with gentle sine-wave paths. Warm golden/white color. Very subtle, always
 * visible at low opacity. Particle count and drift speed scale with energy.
 * Wind direction shifts slowly.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

const NUM_POLLEN = 55;

interface PollenData {
  x: number;
  y: number;
  driftFreqX: number;
  driftFreqY: number;
  driftAmpX: number;
  driftAmpY: number;
  phaseX: number;
  phaseY: number;
  baseDriftX: number;
  baseDriftY: number;
  /** Number of starburst rays */
  rays: number;
  /** Length of each ray */
  rayLength: number;
  /** Rotation speed */
  rotSpeed: number;
  /** Base rotation */
  rotPhase: number;
  hue: number;
  saturation: number;
  lightness: number;
  pulseFreq: number;
  pulsePhase: number;
  /** Visibility threshold: particle fades in above this energy */
  energyThreshold: number;
}

function generatePollen(seed: number): PollenData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_POLLEN }, (_, i) => {
    const colorType = rng();
    let hue: number;
    let saturation: number;
    let lightness: number;

    if (colorType < 0.5) {
      // Warm golden
      hue = 38 + rng() * 25;
      saturation = 55 + rng() * 35;
      lightness = 72 + rng() * 18;
    } else if (colorType < 0.8) {
      // Warm white
      hue = 42 + rng() * 15;
      saturation = 10 + rng() * 25;
      lightness = 85 + rng() * 12;
    } else {
      // Pale green-gold
      hue = 55 + rng() * 30;
      saturation = 35 + rng() * 25;
      lightness = 75 + rng() * 15;
    }

    return {
      x: rng(),
      y: rng(),
      driftFreqX: 0.001 + rng() * 0.005,
      driftFreqY: 0.001 + rng() * 0.004,
      driftAmpX: 10 + rng() * 30,
      driftAmpY: 8 + rng() * 22,
      phaseX: rng() * Math.PI * 2,
      phaseY: rng() * Math.PI * 2,
      baseDriftX: (rng() - 0.5) * 0.1,
      baseDriftY: -0.02 - rng() * 0.06, // gentle upward drift
      rays: 4 + Math.floor(rng() * 3),
      rayLength: 2 + rng() * 4,
      rotSpeed: 0.005 + rng() * 0.015,
      rotPhase: rng() * Math.PI * 2,
      hue,
      saturation,
      lightness,
      pulseFreq: 0.012 + rng() * 0.035,
      pulsePhase: rng() * Math.PI * 2,
      // First 30 particles always visible, rest need more energy
      energyThreshold: i < 30 ? 0 : 0.05 + rng() * 0.2,
    };
  });
}

// Stagger: appears at frame 300 (10s)
const STAGGER_START = 300;

interface Props {
  frames: EnhancedFrameData[];
}

export const PollenDrift: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const pollen = React.useMemo(() => generatePollen(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Always visible at low opacity, brighter with energy
  const baseOpacity = 0.15 + energy * 0.35;
  const masterOpacity = baseOpacity * masterFade;

  if (masterOpacity < 0.01) return null;

  // Wind direction shifts slowly
  const windAngle = Math.sin(frame * 0.0008) * Math.PI * 0.3;
  const windX = Math.cos(windAngle) * (0.3 + energy * 0.5);
  const windY = Math.sin(windAngle) * 0.15;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {pollen.map((p, i) => {
          // Energy-based visibility: some particles only show at higher energy
          if (energy < p.energyThreshold) return null;

          // Stagger individual entrance
          const pollenFade = interpolate(
            frame,
            [STAGGER_START + i * 2, STAGGER_START + i * 2 + 60],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          );
          if (pollenFade < 0.01) return null;

          // Drift with sine waves + wind
          const px = p.x * width
            + Math.sin(frame * p.driftFreqX + p.phaseX) * p.driftAmpX * (1 + energy * 0.8)
            + Math.sin(frame * p.driftFreqX * 0.37 + p.phaseX * 1.7) * p.driftAmpX * 0.3
            + frame * (p.baseDriftX + windX);

          const py = p.y * height
            + Math.cos(frame * p.driftFreqY + p.phaseY) * p.driftAmpY * (1 + energy * 0.5)
            + Math.cos(frame * p.driftFreqY * 0.41 + p.phaseY * 1.3) * p.driftAmpY * 0.25
            + frame * (p.baseDriftY + windY);

          // Wrap positions
          const wx = ((px % width) + width) % width;
          const wy = ((py % height) + height) % height;

          // Glow pulse
          const pulse = (Math.sin(frame * p.pulseFreq + p.pulsePhase) + 1) * 0.5;
          const glowIntensity = 0.3 + pulse * 0.7;

          const alpha = glowIntensity * pollenFade;
          const coreColor = `hsla(${p.hue}, ${p.saturation}%, ${p.lightness}%, ${alpha})`;
          const glowColor = `hsla(${p.hue}, ${p.saturation + 10}%, ${p.lightness - 10}%, ${alpha * 0.3})`;

          const rot = frame * p.rotSpeed + p.rotPhase;
          const rayLen = p.rayLength * (0.8 + pulse * 0.4);

          return (
            <g key={i}>
              {/* Soft glow halo */}
              <circle
                cx={wx}
                cy={wy}
                r={rayLen * 2.5}
                fill={glowColor}
                style={{ filter: `blur(${2 + pulse}px)` }}
              />
              {/* Starburst rays */}
              {Array.from({ length: p.rays }, (_, ri) => {
                const angle = rot + (ri / p.rays) * Math.PI * 2;
                return (
                  <line
                    key={ri}
                    x1={wx}
                    y1={wy}
                    x2={wx + Math.cos(angle) * rayLen}
                    y2={wy + Math.sin(angle) * rayLen}
                    stroke={coreColor}
                    strokeWidth={0.6}
                    strokeLinecap="round"
                  />
                );
              })}
              {/* Center dot */}
              <circle
                cx={wx}
                cy={wy}
                r={1}
                fill={coreColor}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
