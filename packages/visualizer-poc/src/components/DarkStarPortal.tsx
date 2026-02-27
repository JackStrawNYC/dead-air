/**
 * DarkStarPortal -- Cosmic dark star forming and pulsing.
 * Central void (large black circle) with bright accretion disk.
 * Multiple rings orbit at different speeds. Stars spiral inward.
 * Energy drives void size and ring brightness.
 * Deep purple/blue/white colors. Appears every 85s for 14s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";

interface OrbitRing {
  radius: number;
  width: number;
  speed: number;
  hue: number;
  dashLength: number;
  gapLength: number;
  phase: number;
}

interface SpiralStar {
  angle: number;
  startRadius: number;
  speed: number;
  size: number;
  hue: number;
  brightness: number;
  phase: number;
}

const NUM_RINGS = 5;
const NUM_SPIRAL_STARS = 40;
const CYCLE = 2550; // 85 seconds at 30fps
const DURATION = 420; // 14 seconds at 30fps

function generateRings(seed: number): OrbitRing[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_RINGS }, (_, i) => ({
    radius: 120 + i * 45 + rng() * 20,
    width: 2 + rng() * 4,
    speed: (0.3 + rng() * 0.7) * (i % 2 === 0 ? 1 : -1),
    hue: 240 + rng() * 80, // purple-blue range
    dashLength: 10 + rng() * 30,
    gapLength: 5 + rng() * 20,
    phase: rng() * Math.PI * 2,
  }));
}

function generateSpiralStars(seed: number): SpiralStar[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_SPIRAL_STARS }, () => ({
    angle: rng() * Math.PI * 2,
    startRadius: 150 + rng() * 250,
    speed: 0.5 + rng() * 1.5,
    size: 1 + rng() * 3,
    hue: 200 + rng() * 120, // blue to violet
    brightness: 0.4 + rng() * 0.6,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const DarkStarPortal: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;

  const rings = React.useMemo(() => generateRings(42_000_1), []);
  const spiralStars = React.useMemo(() => generateSpiralStars(42_000_2), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade in over first 10%, hold, fade out over last 10%
  const opacity = interpolate(progress, [0, 0.1, 0.85, 1], [0, 0.85, 0.85, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  if (opacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;

  // Void radius: energy drives size (100-200px)
  const voidRadius = interpolate(energy, [0.03, 0.35], [100, 200], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Accretion disk glow intensity
  const glowIntensity = interpolate(energy, [0.03, 0.3], [0.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Lensing warp strength
  const lensStrength = interpolate(energy, [0.05, 0.3], [0.02, 0.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Scale in the portal
  const formScale = interpolate(progress, [0, 0.15], [0.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          {/* Radial gradient for accretion disk glow */}
          <radialGradient id="dsp-accretion" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000" stopOpacity="1" />
            <stop offset="30%" stopColor="#1a0040" stopOpacity={0.8 * glowIntensity} />
            <stop offset="55%" stopColor="#6600cc" stopOpacity={0.5 * glowIntensity} />
            <stop offset="75%" stopColor="#9944ff" stopOpacity={0.3 * glowIntensity} />
            <stop offset="100%" stopColor="#cc88ff" stopOpacity="0" />
          </radialGradient>

          {/* Filter for glow effect */}
          <filter id="dsp-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Gravitational lensing: distort background shapes toward center */}
        {spiralStars.map((star, i) => {
          // Stars spiral inward over time
          const starCycleSpeed = star.speed * 0.8;
          const spiralProgress = ((cycleFrame * starCycleSpeed * 0.01 + star.phase) % 1);
          const r = star.startRadius * (1 - spiralProgress * 0.85) * formScale;

          if (r < voidRadius * 0.5) return null;

          // Angle rotates as star spirals in
          const angle = star.angle + spiralProgress * Math.PI * 4 + cycleFrame * 0.005 * star.speed;
          const sx = cx + Math.cos(angle) * r;
          const sy = cy + Math.sin(angle) * r;

          // Gravitational stretch: elongate toward center
          const distFromCenter = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
          const stretchFactor = 1 + (lensStrength * 300) / Math.max(distFromCenter, 50);
          const stretchAngle = Math.atan2(sy - cy, sx - cx) * (180 / Math.PI);

          // Highs → star shimmer (0.7-1.3x brightness)
          const highsShimmer = 0.7 + snap.highs * 1.2;
          const alpha = star.brightness * (1 - spiralProgress * 0.5) * glowIntensity * highsShimmer;
          const color = `hsla(${star.hue}, 80%, 75%, ${alpha})`;
          const glowColor = `hsla(${star.hue}, 100%, 85%, ${alpha * 0.6})`;

          return (
            <g key={`star-${i}`} transform={`translate(${sx}, ${sy}) rotate(${stretchAngle}) scale(${stretchFactor}, 1) rotate(${-stretchAngle})`}>
              <circle cx={0} cy={0} r={star.size * 2.5} fill={glowColor} style={{ filter: "blur(3px)" }} />
              <circle cx={0} cy={0} r={star.size} fill={color} />
            </g>
          );
        })}

        {/* Accretion disk glow */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * 2.5 * formScale}
          fill="url(#dsp-accretion)"
        />

        {/* Orbiting rings */}
        {rings.map((ring, i) => {
          // Bass → ring rotation speed multiplier
          const bassRotMult = 0.6 + snap.bass * 0.8;
          const rotAngle = cycleFrame * ring.speed * 0.5 * bassRotMult + ring.phase;
          const ringR = ring.radius * formScale;
          const ringAlpha = glowIntensity * 0.7;
          const color = `hsla(${ring.hue}, 85%, 70%, ${ringAlpha})`;

          return (
            <g key={`ring-${i}`} transform={`translate(${cx}, ${cy}) rotate(${rotAngle * (180 / Math.PI)})`}>
              <circle
                cx={0}
                cy={0}
                r={ringR}
                fill="none"
                stroke={color}
                strokeWidth={ring.width}
                strokeDasharray={`${ring.dashLength} ${ring.gapLength}`}
                style={{ filter: `drop-shadow(0 0 ${4 + glowIntensity * 6}px ${color})` }}
              />
            </g>
          );
        })}

        {/* Bright accretion ring edge */}
        <circle
          cx={cx}
          cy={cy}
          r={(voidRadius + 8) * formScale}
          fill="none"
          stroke={`hsla(270, 100%, 80%, ${glowIntensity * 0.6 + snap.onsetEnvelope * 0.3})`}
          strokeWidth={3 + energy * 4 + snap.onsetEnvelope * 3}
          style={{ filter: `drop-shadow(0 0 ${10 + glowIntensity * 15}px hsla(270, 100%, 75%, ${glowIntensity * 0.8}))` }}
        />
        <circle
          cx={cx}
          cy={cy}
          r={(voidRadius + 3) * formScale}
          fill="none"
          stroke={`hsla(220, 90%, 90%, ${glowIntensity * 0.4})`}
          strokeWidth={1.5}
          style={{ filter: `drop-shadow(0 0 ${6}px hsla(220, 100%, 85%, 0.5))` }}
        />

        {/* Central void (black hole) */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * formScale}
          fill="#000"
        />

        {/* Inner void edge highlight */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * formScale}
          fill="none"
          stroke={`hsla(280, 100%, 65%, ${glowIntensity * 0.3})`}
          strokeWidth={1}
        />
      </svg>
    </div>
  );
};
