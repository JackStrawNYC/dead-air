/**
 * JellyfishSwarm — 6-8 bioluminescent jellyfish floating.
 * Each jellyfish is an SVG bell (half-ellipse) with 6-8 trailing tentacle lines (sine-wave paths).
 * Gentle floating motion, tentacles trail with physics-like delay.
 * Jellyfish pulse (bell contracts/expands) with energy.
 * Neon bioluminescent colors (cyan, magenta, green).
 * Appears during quiet/spacey passages (energy < 0.15). Cycle: every 45s for 18s.
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

const CYCLE = 1350;     // 45 seconds at 30fps
const DURATION = 540;   // 18 seconds
const NUM_JELLYFISH = 7;

const JELLY_COLORS = [
  "#00FFFF", "#FF00FF", "#00FF88", "#44FFDD",
  "#FF44CC", "#88FF44", "#CCAAFF",
];

interface JellyfishData {
  x: number;
  y: number;
  size: number;
  colorIdx: number;
  floatSpeed: number;
  floatPhase: number;
  driftX: number;
  pulseSpeed: number;
  pulsePhase: number;
  tentacleCount: number;
  tentacleLength: number;
}

function generateJellyfish(seed: number): JellyfishData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_JELLYFISH }, () => ({
    x: 0.1 + rng() * 0.8,
    y: 0.15 + rng() * 0.6,
    size: 25 + rng() * 35,
    colorIdx: Math.floor(rng() * JELLY_COLORS.length),
    floatSpeed: 0.01 + rng() * 0.015,
    floatPhase: rng() * Math.PI * 2,
    driftX: (rng() - 0.5) * 0.003,
    pulseSpeed: 0.06 + rng() * 0.04,
    pulsePhase: rng() * Math.PI * 2,
    tentacleCount: 6 + Math.floor(rng() * 3),
    tentacleLength: 40 + rng() * 50,
  }));
}

function buildTentaclePath(
  startX: number,
  startY: number,
  length: number,
  index: number,
  totalCount: number,
  frame: number,
  jellyPhase: number,
): string {
  const segments = 12;
  const spread = (index / (totalCount - 1) - 0.5) * 2;
  const points: string[] = [];

  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    // Delayed sine wave creating trailing physics effect
    const delay = t * 1.5;
    const waveX = Math.sin(frame * 0.04 - delay + jellyPhase + index * 0.8) * (8 + t * 15);
    const driftOutward = spread * t * 20;
    const x = startX + waveX + driftOutward;
    const y = startY + t * length;
    points.push(s === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }

  return points.join(" ");
}

interface Props {
  frames: EnhancedFrameData[];
}

export const JellyfishSwarm: React.FC<Props> = ({ frames }) => {
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

  const jellyfish = React.useMemo(() => generateJellyfish(4242), []);

  // Timing gate - appears during quiet passages
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;
  if (energy > 0.15) return null;

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
  const opacity = Math.min(fadeIn, fadeOut) * 0.6;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="jelly-glow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {jellyfish.map((j, i) => {
          const color = JELLY_COLORS[j.colorIdx];

          // Floating motion
          const floatY = Math.sin(frame * j.floatSpeed + j.floatPhase) * 30;
          const driftXPos = Math.sin(frame * j.driftX * 10 + j.floatPhase) * 40;
          const jx = j.x * width + driftXPos;
          const jy = j.y * height + floatY;

          // Bell pulse (contracts and expands)
          const pulse = 1 + Math.sin(frame * j.pulseSpeed + j.pulsePhase) * 0.15;
          const bellRX = j.size * pulse;
          const bellRY = j.size * 0.7 * pulse;

          // Inner glow brightness modulation
          const glowPulse = 0.3 + Math.sin(frame * j.pulseSpeed * 1.5 + j.pulsePhase) * 0.15;

          return (
            <g key={i} filter="url(#jelly-glow)">
              {/* Bell (upper half of ellipse via clipPath) */}
              <defs>
                <clipPath id={`bell-clip-${i}`}>
                  <rect x={jx - bellRX - 5} y={jy - bellRY - 5} width={bellRX * 2 + 10} height={bellRY + 5} />
                </clipPath>
              </defs>
              <ellipse
                cx={jx}
                cy={jy}
                rx={bellRX}
                ry={bellRY}
                fill={color}
                opacity={0.25}
                clipPath={`url(#bell-clip-${i})`}
              />
              {/* Bell outline */}
              <ellipse
                cx={jx}
                cy={jy}
                rx={bellRX}
                ry={bellRY}
                fill="none"
                stroke={color}
                strokeWidth={2}
                opacity={0.6}
                clipPath={`url(#bell-clip-${i})`}
              />
              {/* Inner glow */}
              <ellipse
                cx={jx}
                cy={jy - bellRY * 0.2}
                rx={bellRX * 0.5}
                ry={bellRY * 0.3}
                fill={color}
                opacity={glowPulse}
                clipPath={`url(#bell-clip-${i})`}
              />
              {/* Bell bottom rim */}
              <ellipse
                cx={jx}
                cy={jy}
                rx={bellRX}
                ry={3}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                opacity={0.5}
              />

              {/* Tentacles */}
              {Array.from({ length: j.tentacleCount }, (_, ti) => {
                const tentaclePath = buildTentaclePath(
                  jx,
                  jy + 2,
                  j.tentacleLength * (0.8 + energy * 0.4),
                  ti,
                  j.tentacleCount,
                  frame,
                  j.floatPhase,
                );
                return (
                  <path
                    key={`t${ti}`}
                    d={tentaclePath}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.2}
                    strokeLinecap="round"
                    opacity={0.4}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
