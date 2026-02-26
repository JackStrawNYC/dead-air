/**
 * GalaxyArm — Spiral galaxy arm sweeping across, star density follows energy.
 * Two logarithmic spiral arms rotate slowly. Stars are distributed along the arms
 * with density proportional to energy. Brighter core at center. Dust lanes as
 * subtle dark regions between arms. Star colors range from blue-white (hot) at
 * arm edges to yellow-red (cool) near center. Cycles: 35s on, 40s off (75s total).
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

interface ArmStar {
  armIndex: number;
  tParam: number; // 0-1 along spiral
  offsetR: number; // perpendicular offset from arm center
  size: number;
  brightness: number;
  twinkleFreq: number;
  twinklePhase: number;
  hueShift: number;
}

const MAX_STARS = 200;
const SPIRAL_TURNS = 1.8;
const ARM_COUNT = 2;

function generateStars(seed: number): ArmStar[] {
  const rng = seeded(seed);
  const stars: ArmStar[] = [];
  for (let i = 0; i < MAX_STARS; i++) {
    stars.push({
      armIndex: Math.floor(rng() * ARM_COUNT),
      tParam: rng(),
      offsetR: (rng() - 0.5) * 2, // -1 to 1
      size: 0.5 + rng() * 2.5,
      brightness: 0.3 + rng() * 0.7,
      twinkleFreq: 0.03 + rng() * 0.08,
      twinklePhase: rng() * Math.PI * 2,
      hueShift: rng() * 60 - 30,
    });
  }
  return stars;
}

const CYCLE = 2250; // 75s at 30fps
const DURATION = 1050; // 35s

interface Props {
  frames: EnhancedFrameData[];
}

export const GalaxyArm: React.FC<Props> = ({ frames }) => {
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

  const stars = React.useMemo(() => generateStars(23571113), []);

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
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.35 + energy * 0.4);

  if (masterOpacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxRadius = Math.min(width, height) * 0.35;

  // Galaxy rotation (very slow)
  const rotation = frame * 0.001;

  // Energy determines how many stars are visible
  const visibleCount = Math.floor(interpolate(energy, [0.02, 0.3], [40, MAX_STARS], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  // Spiral arm path function: logarithmic spiral
  const spiralPoint = (t: number, armIdx: number): { x: number; y: number } => {
    const armOffset = (armIdx / ARM_COUNT) * Math.PI * 2;
    const angle = t * SPIRAL_TURNS * Math.PI * 2 + armOffset + rotation;
    const r = t * maxRadius;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    };
  };

  // Spiral arm perpendicular direction
  const spiralNormal = (t: number, armIdx: number): { nx: number; ny: number } => {
    const armOffset = (armIdx / ARM_COUNT) * Math.PI * 2;
    const angle = t * SPIRAL_TURNS * Math.PI * 2 + armOffset + rotation;
    // Tangent direction
    const tx = -Math.sin(angle);
    const ty = Math.cos(angle);
    // Normal is perpendicular to tangent
    return { nx: -ty, ny: tx };
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, mixBlendMode: "screen" }}>
        <defs>
          <radialGradient id="galaxy-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFF0" stopOpacity="0.6" />
            <stop offset="30%" stopColor="#FFE8A0" stopOpacity="0.3" />
            <stop offset="60%" stopColor="#FFD060" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#FFD060" stopOpacity="0" />
          </radialGradient>
          <filter id="galaxy-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Arm paths (dust lanes as semi-transparent curves) */}
        {Array.from({ length: ARM_COUNT }, (_, armIdx) => {
          const points: string[] = [];
          for (let t = 0.05; t <= 1; t += 0.02) {
            const p = spiralPoint(t, armIdx);
            if (t === 0.05) {
              points.push(`M ${p.x} ${p.y}`);
            } else {
              points.push(`L ${p.x} ${p.y}`);
            }
          }
          return (
            <path
              key={`arm${armIdx}`}
              d={points.join(" ")}
              fill="none"
              stroke={`rgba(180, 160, 220, ${0.05 + energy * 0.08})`}
              strokeWidth={maxRadius * 0.08}
              strokeLinecap="round"
              style={{ filter: "blur(8px)" }}
            />
          );
        })}

        {/* Stars along arms */}
        {stars.slice(0, visibleCount).map((star, si) => {
          const p = spiralPoint(star.tParam, star.armIndex);
          const n = spiralNormal(star.tParam, star.armIndex);
          const armWidth = maxRadius * 0.06 * (1 + star.tParam * 0.5);
          const sx = p.x + n.nx * star.offsetR * armWidth;
          const sy = p.y + n.ny * star.offsetR * armWidth;

          const twinkle = (Math.sin(frame * star.twinkleFreq + star.twinklePhase) + 1) * 0.5;
          const alpha = star.brightness * (0.3 + twinkle * 0.7) * (0.5 + energy * 0.5);

          if (alpha < 0.05) return null;

          // Color: inner stars are warmer, outer stars are bluer
          const baseHue = star.tParam < 0.3
            ? 40 + star.hueShift // yellow-warm
            : star.tParam < 0.6
              ? 200 + star.hueShift // blue-white
              : 220 + star.hueShift; // blue

          const lightness = 70 + twinkle * 20;

          return (
            <circle
              key={`gs${si}`}
              cx={sx} cy={sy}
              r={star.size * (0.8 + energy * 0.4 + twinkle * 0.3)}
              fill={`hsla(${baseHue}, 60%, ${lightness}%, ${Math.min(alpha, 0.9)})`}
              filter={star.size > 2 ? "url(#galaxy-glow)" : undefined}
            />
          );
        })}

        {/* Bright core */}
        <circle cx={cx} cy={cy} r={maxRadius * 0.15} fill="url(#galaxy-core)" />
        <circle
          cx={cx} cy={cy}
          r={maxRadius * 0.04}
          fill="#FFFFF0"
          opacity={0.5 + energy * 0.3}
          filter="url(#galaxy-glow)"
        />
      </svg>
    </div>
  );
};
