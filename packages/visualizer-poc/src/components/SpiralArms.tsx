/**
 * SpiralArms — Galaxy-style spiral arms rotating from center.
 * 2-4 logarithmic spiral arms made of many small dot particles along the curve.
 * Arms rotate slowly. Particles along arms twinkle and vary in brightness.
 * Cosmic purple/blue/white palette with bright core.
 * Energy drives rotation speed, arm count (2 quiet, 4 loud), and particle brightness.
 * Cycle: 60s, 20s visible.
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

const CYCLE = 1800; // 60s at 30fps
const DURATION = 600; // 20s visible
const MAX_ARMS = 4;
const PARTICLES_PER_ARM = 80;

interface ParticleData {
  tOffset: number;
  radialOffset: number;
  size: number;
  twinklePhase: number;
  twinkleSpeed: number;
  hueShift: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SpiralArms: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate particle data for all arms
  const armParticles = React.useMemo(() => {
    const rng = seeded(60_020_008);
    return Array.from({ length: MAX_ARMS }, () =>
      Array.from({ length: PARTICLES_PER_ARM }, (): ParticleData => ({
        tOffset: rng() * 0.15 - 0.075,
        radialOffset: rng() * 12 - 6,
        size: 1 + rng() * 3,
        twinklePhase: rng() * Math.PI * 2,
        twinkleSpeed: 0.02 + rng() * 0.06,
        hueShift: rng() * 40 - 20,
      }))
    );
  }, []);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.15, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.42;

  // Arm count: 2 at low energy, up to 4 at high energy
  const armCount = Math.round(interpolate(energy, [0.05, 0.25], [2, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  // Rotation speed driven by energy
  const rotationSpeed = 0.08 + energy * 0.25;
  const baseRotation = frame * rotationSpeed;

  // Logarithmic spiral: r = a * e^(b*theta)
  const a = 8; // initial radius
  const b = 0.15; // growth rate

  // Build particles for each arm
  const particleElements: React.ReactNode[] = [];

  for (let arm = 0; arm < armCount; arm++) {
    const armAngleOffset = (arm / armCount) * Math.PI * 2;
    const particles = armParticles[arm];

    for (let pi = 0; pi < PARTICLES_PER_ARM; pi++) {
      const p = particles[pi];
      const t = (pi / PARTICLES_PER_ARM) * 4 * Math.PI; // spiral parameter

      // Logarithmic spiral position
      const r = Math.min(a * Math.exp(b * (t + p.tOffset)), maxRadius);
      const angle = t + armAngleOffset + (baseRotation * Math.PI) / 180;

      const px = Math.cos(angle) * r + p.radialOffset * Math.cos(angle + Math.PI / 2);
      const py = Math.sin(angle) * r + p.radialOffset * Math.sin(angle + Math.PI / 2);

      // Twinkle
      const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(frame * p.twinkleSpeed + p.twinklePhase));
      const brightness = twinkle * (0.4 + energy * 0.6);

      // Color: inner particles whiter, outer particles more purple/blue
      const distanceRatio = r / maxRadius;
      const hue = 260 + distanceRatio * 40 + p.hueShift; // purple to blue
      const sat = interpolate(distanceRatio, [0, 0.5, 1], [20, 70, 85], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const lightness = interpolate(distanceRatio, [0, 0.3, 1], [95, 75, 55], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

      const color = `hsl(${hue}, ${sat}%, ${lightness}%)`;
      const particleSize = p.size * (1 - distanceRatio * 0.3) * (0.8 + energy * 0.4);

      particleElements.push(
        <circle
          key={`arm${arm}-p${pi}`}
          cx={cx + px}
          cy={cy + py}
          r={particleSize}
          fill={color}
          opacity={brightness}
        />
      );
    }
  }

  // Bright core
  const coreGlow = 0.3 + energy * 0.5;
  const corePulse = 1 + Math.sin(frame * 0.05) * 0.15 * (1 + energy);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 12px rgba(147, 112, 219, 0.4)) drop-shadow(0 0 30px rgba(100, 100, 255, 0.15))`,
        }}
      >
        <defs>
          <radialGradient id="spiral-core-glow">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.8)" />
            <stop offset="30%" stopColor="rgba(200, 180, 255, 0.3)" />
            <stop offset="70%" stopColor="rgba(147, 112, 219, 0.08)" />
            <stop offset="100%" stopColor="rgba(147, 112, 219, 0)" />
          </radialGradient>
        </defs>

        {/* Core glow */}
        <circle
          cx={cx}
          cy={cy}
          r={30 * corePulse}
          fill="url(#spiral-core-glow)"
          opacity={coreGlow}
        />

        {/* Bright center dot */}
        <circle
          cx={cx}
          cy={cy}
          r={4 * corePulse}
          fill="#FFFFFF"
          opacity={0.9}
        />

        {/* All spiral arm particles */}
        {particleElements}
      </svg>
    </div>
  );
};
