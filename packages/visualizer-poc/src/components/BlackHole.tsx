/**
 * BlackHole — Gravitational lensing effect.
 * A dark circle at center with an accretion disk ring (bright ellipse at an angle).
 * Space near the hole warps — nearby star dots bend their paths.
 * Intense glow on the accretion disk edge. Deep purple/orange/white palette.
 * Disk rotation and glow driven by energy.
 * Cycle: 70s (2100 frames), 22s (660 frames) visible.
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

const CYCLE_TOTAL = 2100; // 70s
const VISIBLE_DURATION = 660; // 22s
const NUM_STARS = 35;

interface StarData {
  baseAngle: number; // angle around black hole
  baseRadius: number; // distance from center (normalized 0-1)
  size: number;
  brightness: number;
  orbitSpeed: number; // how fast it orbits when close
}

function generateStars(seed: number): StarData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_STARS }, () => ({
    baseAngle: rng() * Math.PI * 2,
    baseRadius: 0.15 + rng() * 0.85,
    size: 1 + rng() * 2.5,
    brightness: 0.4 + rng() * 0.6,
    orbitSpeed: 0.002 + rng() * 0.008,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const BlackHole: React.FC<Props> = ({ frames }) => {
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

  const stars = React.useMemo(() => generateStars(99001122), []);

  const cycleFrame = frame % CYCLE_TOTAL;

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.75;

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.45;
  const holeRadius = 45 + energy * 10;
  const maxStarDist = Math.min(width, height) * 0.45;

  // Accretion disk rotation
  const diskRotation = frame * (0.3 + energy * 1.2);
  const diskRx = holeRadius * 3.2 + energy * 20;
  const diskRy = holeRadius * 0.8;
  const diskGlow = 0.5 + energy * 0.5;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          <filter id="bh-glow">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="bh-intense-glow">
            <feGaussianBlur stdDeviation="15" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="bh-center" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="black" />
            <stop offset="70%" stopColor="black" />
            <stop offset="100%" stopColor="rgba(40,0,60,0.8)" />
          </radialGradient>
          <radialGradient id="bh-lensing" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="60%" stopColor="rgba(0,0,0,0)" />
            <stop offset="85%" stopColor="rgba(80,0,120,0.15)" />
            <stop offset="100%" stopColor="rgba(150,50,0,0.3)" />
          </radialGradient>
        </defs>

        {/* Background stars that warp near the hole */}
        {stars.map((star, si) => {
          // Stars orbit: closer ones orbit faster
          const angle = star.baseAngle + frame * star.orbitSpeed * (1 / (star.baseRadius + 0.1));
          const dist = star.baseRadius * maxStarDist;

          // Gravitational lensing: bend position near the hole
          const rawX = cx + Math.cos(angle) * dist;
          const rawY = cy + Math.sin(angle) * dist;

          // Distance from black hole center
          const dx = rawX - cx;
          const dy = rawY - cy;
          const distFromCenter = Math.sqrt(dx * dx + dy * dy);
          const lensingStrength = Math.max(0, 1 - distFromCenter / (holeRadius * 4));

          // Bend star away from center (lensing pushes outward at edges)
          const pushFactor = lensingStrength * 30;
          const normDx = distFromCenter > 0 ? dx / distFromCenter : 0;
          const normDy = distFromCenter > 0 ? dy / distFromCenter : 0;
          const sx = rawX + normDx * pushFactor;
          const sy = rawY + normDy * pushFactor;

          // Stars inside the event horizon are not visible
          if (distFromCenter < holeRadius * 1.2) return null;

          const starAlpha = star.brightness * (1 - lensingStrength * 0.5);
          const starColor = `rgba(255, ${200 + Math.floor(star.brightness * 55)}, ${180 + Math.floor(star.brightness * 75)}, ${starAlpha})`;

          return (
            <circle
              key={si}
              cx={sx}
              cy={sy}
              r={star.size}
              fill={starColor}
            />
          );
        })}

        {/* Accretion disk (back half — behind the hole) */}
        <g transform={`rotate(${diskRotation}, ${cx}, ${cy})`} filter="url(#bh-glow)">
          {/* Outer glow ring */}
          <ellipse
            cx={cx}
            cy={cy}
            rx={diskRx + 15}
            ry={diskRy + 5}
            fill="none"
            stroke="rgba(255,100,0,0.15)"
            strokeWidth={20}
            opacity={diskGlow}
          />
          {/* Main disk ring */}
          <ellipse
            cx={cx}
            cy={cy}
            rx={diskRx}
            ry={diskRy}
            fill="none"
            stroke="rgba(255,150,50,0.6)"
            strokeWidth={12}
            opacity={diskGlow}
          />
          {/* Inner hot ring */}
          <ellipse
            cx={cx}
            cy={cy}
            rx={diskRx * 0.75}
            ry={diskRy * 0.7}
            fill="none"
            stroke="rgba(255,220,180,0.4)"
            strokeWidth={6}
            opacity={diskGlow}
          />
          {/* Brightest inner edge */}
          <ellipse
            cx={cx}
            cy={cy}
            rx={diskRx * 0.55}
            ry={diskRy * 0.5}
            fill="none"
            stroke="rgba(255,255,240,0.3)"
            strokeWidth={3}
            opacity={diskGlow}
          />
        </g>

        {/* Lensing halo around the hole */}
        <circle
          cx={cx}
          cy={cy}
          r={holeRadius * 2.5}
          fill="url(#bh-lensing)"
        />

        {/* The black hole itself */}
        <circle
          cx={cx}
          cy={cy}
          r={holeRadius}
          fill="url(#bh-center)"
        />

        {/* Photon ring (thin bright ring at event horizon) */}
        <circle
          cx={cx}
          cy={cy}
          r={holeRadius * 1.05}
          fill="none"
          stroke="rgba(200,120,255,0.4)"
          strokeWidth={2}
          filter="url(#bh-intense-glow)"
          opacity={0.5 + energy * 0.5}
        />

        {/* Relativistic jet hint (faint vertical beams) */}
        <line
          x1={cx}
          y1={cy - holeRadius * 1.2}
          x2={cx}
          y2={cy - holeRadius * 4}
          stroke="rgba(180,100,255,0.1)"
          strokeWidth={4 + energy * 4}
          opacity={energy * 0.5}
        />
        <line
          x1={cx}
          y1={cy + holeRadius * 1.2}
          x2={cx}
          y2={cy + holeRadius * 4}
          stroke="rgba(180,100,255,0.1)"
          strokeWidth={4 + energy * 4}
          opacity={energy * 0.5}
        />
      </svg>
    </div>
  );
};
