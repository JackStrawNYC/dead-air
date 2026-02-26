/**
 * PlanetaryRings — Saturn-like planet with tilted ring system.
 * Planet is a circle with gradient (amber/orange). Ring is a tilted ellipse
 * (wider than tall). Ring has multiple bands of different opacities. Entire
 * system slowly rotates (tilt angle changes). Ring particles shimmer with
 * energy. Positioned upper area. Appears every 70s for 12s.
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

const CYCLE = 2100; // 70s at 30fps
const DURATION = 360; // 12s

interface RingBand {
  radiusInner: number; // normalized to planet radius
  radiusOuter: number;
  opacity: number;
  hue: number;
  saturation: number;
}

interface RingParticle {
  angle: number;
  radius: number; // normalized to planet radius
  size: number;
  speed: number;
  brightness: number;
}

function generateRingBands(): RingBand[] {
  return [
    { radiusInner: 1.3, radiusOuter: 1.5, opacity: 0.5, hue: 35, saturation: 60 },
    { radiusInner: 1.55, radiusOuter: 1.7, opacity: 0.35, hue: 40, saturation: 50 },
    { radiusInner: 1.75, radiusOuter: 2.05, opacity: 0.45, hue: 30, saturation: 55 },
    { radiusInner: 2.1, radiusOuter: 2.25, opacity: 0.25, hue: 45, saturation: 40 },
    { radiusInner: 2.3, radiusOuter: 2.5, opacity: 0.15, hue: 50, saturation: 35 },
  ];
}

function generateParticles(seed: number, count: number): RingParticle[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    angle: rng() * Math.PI * 2,
    radius: 1.3 + rng() * 1.2, // within ring range
    size: 0.8 + rng() * 1.5,
    speed: 0.003 + rng() * 0.008,
    brightness: 0.4 + rng() * 0.6,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PlanetaryRings: React.FC<Props> = ({ frames }) => {
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

  const ringBands = React.useMemo(() => generateRingBands(), []);
  const particles = React.useMemo(() => generateParticles(9999, 40), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.5 + energy * 0.3);

  // Planet properties
  const planetRadius = Math.min(width, height) * 0.06;
  const cx = width * 0.65;
  const cy = height * 0.25;

  // Tilt: slowly oscillates
  const tiltAngle = Math.sin(frame * 0.003) * 15 + 25; // degrees, oscillates around 25
  const tiltRad = (tiltAngle * Math.PI) / 180;
  const ringScaleY = Math.abs(Math.cos(tiltRad)) * 0.4 + 0.1; // how squished the ring looks

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <radialGradient id="planet-grad" cx="40%" cy="35%" r="55%">
            <stop offset="0%" stopColor="#FFD080" />
            <stop offset="40%" stopColor="#E8A030" />
            <stop offset="70%" stopColor="#CC7722" />
            <stop offset="100%" stopColor="#884411" />
          </radialGradient>
          <filter id="planet-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Clip for back ring (behind planet) */}
          <clipPath id="ring-back-clip">
            <rect x={0} y={0} width={width} height={height} />
            <circle cx={cx} cy={cy} r={planetRadius + 1} />
          </clipPath>
        </defs>

        {/* Back ring bands (behind planet) */}
        <g clipPath="url(#ring-back-clip)">
          {ringBands.map((band, i) => {
            const rInner = planetRadius * band.radiusInner;
            const rOuter = planetRadius * band.radiusOuter;
            const shimmer = 1 + Math.sin(frame * 0.05 + i * 1.2) * energy * 0.3;
            return (
              <ellipse
                key={`back${i}`}
                cx={cx}
                cy={cy}
                rx={(rInner + rOuter) / 2}
                ry={((rInner + rOuter) / 2) * ringScaleY}
                fill="none"
                stroke={`hsla(${band.hue}, ${band.saturation}%, 65%, ${band.opacity * shimmer * 0.5})`}
                strokeWidth={rOuter - rInner}
                transform={`rotate(${tiltAngle * 0.3}, ${cx}, ${cy})`}
              />
            );
          })}
        </g>

        {/* Planet body */}
        <circle
          cx={cx}
          cy={cy}
          r={planetRadius}
          fill="url(#planet-grad)"
          filter="url(#planet-glow)"
        />
        {/* Planet shadow */}
        <ellipse
          cx={cx + planetRadius * 0.15}
          cy={cy}
          rx={planetRadius * 0.95}
          ry={planetRadius}
          fill="rgba(0,0,0,0.3)"
        />

        {/* Front ring bands (in front of planet) */}
        {ringBands.map((band, i) => {
          const rInner = planetRadius * band.radiusInner;
          const rOuter = planetRadius * band.radiusOuter;
          const shimmer = 1 + Math.sin(frame * 0.05 + i * 1.2) * energy * 0.3;
          // Only draw the front half using a clip
          const avgR = (rInner + rOuter) / 2;
          const avgRy = avgR * ringScaleY;
          return (
            <ellipse
              key={`front${i}`}
              cx={cx}
              cy={cy}
              rx={avgR}
              ry={avgRy}
              fill="none"
              stroke={`hsla(${band.hue}, ${band.saturation}%, 65%, ${band.opacity * shimmer})`}
              strokeWidth={rOuter - rInner}
              strokeDasharray={`0 ${Math.PI * avgR} ${Math.PI * avgR} 0`}
              transform={`rotate(${tiltAngle * 0.3}, ${cx}, ${cy})`}
            />
          );
        })}

        {/* Ring particles shimmering */}
        {particles.map((p, i) => {
          const a = p.angle + frame * p.speed;
          const r = planetRadius * p.radius;
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r * ringScaleY;
          const shimmer = (Math.sin(frame * 0.1 + i * 2.3) + 1) * 0.5;
          const alpha = p.brightness * shimmer * energy * 2;
          if (alpha < 0.05) return null;
          return (
            <circle
              key={`p${i}`}
              cx={px}
              cy={py}
              r={p.size}
              fill={`rgba(255, 220, 150, ${Math.min(alpha, 0.8)})`}
              transform={`rotate(${tiltAngle * 0.3}, ${cx}, ${cy})`}
            />
          );
        })}
      </svg>
    </div>
  );
};
