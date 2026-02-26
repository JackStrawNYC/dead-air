/**
 * WarpDrive — Star streak / hyperspace effect.
 * 40-60 star dots that stretch into long lines pointing away from center
 * (radial motion blur). Stars start as dots then streak outward with
 * increasing length. Speed and streak length driven by energy.
 * Blue-white-purple star colors. Classic "jump to light speed" effect.
 * Cycle: 35s (1050 frames), 8s (240 frames) visible, energy > 0.25.
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

const CYCLE_TOTAL = 1050; // 35s
const VISIBLE_DURATION = 240; // 8s
const NUM_STARS = 55;

interface WarpStar {
  angle: number; // radial angle from center
  baseSpeed: number; // normalized speed 0-1
  size: number;
  hue: number; // blue(220), white(0), purple(270)
  brightness: number;
  startDist: number; // starting distance from center (0-1)
}

function generateWarpStars(seed: number): WarpStar[] {
  const rng = seeded(seed);
  const hues = [220, 220, 240, 260, 270, 0, 0]; // mostly blue/purple with some white
  return Array.from({ length: NUM_STARS }, () => ({
    angle: rng() * Math.PI * 2,
    baseSpeed: 0.3 + rng() * 0.7,
    size: 1 + rng() * 2,
    hue: hues[Math.floor(rng() * hues.length)],
    brightness: 0.6 + rng() * 0.4,
    startDist: rng() * 0.15,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const WarpDrive: React.FC<Props> = ({ frames }) => {
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

  const stars = React.useMemo(() => generateWarpStars(12345678), []);

  // Energy gate: only visible when energy > 0.25
  if (energy <= 0.25) return null;

  const cycleFrame = frame % CYCLE_TOTAL;

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.25, 0.5], [0.4, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy) * 1.2;

  // Warp phase: stars accelerate
  // Phase 1 (0-0.2): dots appear, short streaks
  // Phase 2 (0.2-0.8): full warp streaks
  // Phase 3 (0.8-1.0): decelerate
  const warpIntensity = interpolate(progress, [0, 0.15, 0.2, 0.8, 0.85, 1], [0, 0.3, 1, 1, 0.3, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Speed multiplier from energy
  const speedMult = interpolate(energy, [0.25, 0.5], [0.6, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Streak length from energy + warp intensity
  const maxStreakLen = interpolate(energy, [0.25, 0.5], [30, 150], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * warpIntensity;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          <filter id="warp-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Central flash during peak warp */}
        {warpIntensity > 0.8 && (
          <circle
            cx={cx}
            cy={cy}
            r={15 + energy * 20}
            fill="rgba(200,220,255,0.1)"
            opacity={warpIntensity * 0.3}
          />
        )}

        {stars.map((star, si) => {
          // Each star flies outward from center, looping
          const period = 60 / (star.baseSpeed * speedMult);
          const t = ((cycleFrame * speedMult) % period) / period;
          const dist = (star.startDist + t * (1 - star.startDist)) * maxDist;

          // Head position
          const headX = cx + Math.cos(star.angle) * dist;
          const headY = cy + Math.sin(star.angle) * dist;

          // Streak: extends back toward center
          const streakLen = maxStreakLen * star.baseSpeed * (0.5 + t * 0.5);
          const tailX = cx + Math.cos(star.angle) * Math.max(0, dist - streakLen);
          const tailY = cy + Math.sin(star.angle) * Math.max(0, dist - streakLen);

          // Fade: brighter as they move outward
          const alpha = star.brightness * t * warpIntensity;

          if (alpha < 0.05) return null;

          // Color
          const saturation = star.hue === 0 ? 0 : 80;
          const lightness = star.hue === 0 ? 95 : 75 + energy * 15;
          const color = `hsla(${star.hue}, ${saturation}%, ${lightness}%, ${alpha})`;
          const glowColor = `hsla(${star.hue}, ${saturation}%, ${Math.min(lightness + 10, 100)}%, ${alpha * 0.5})`;

          return (
            <g key={si}>
              {/* Streak line */}
              <line
                x1={tailX}
                y1={tailY}
                x2={headX}
                y2={headY}
                stroke={color}
                strokeWidth={star.size * (1 + warpIntensity)}
                strokeLinecap="round"
              />
              {/* Bright head dot */}
              <circle
                cx={headX}
                cy={headY}
                r={star.size * (1.5 + energy)}
                fill={glowColor}
                filter="url(#warp-glow)"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
