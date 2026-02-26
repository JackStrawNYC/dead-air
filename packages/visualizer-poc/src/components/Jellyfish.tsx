/**
 * Jellyfish — 3-5 translucent jellyfish floating upward. Each jellyfish has
 * a bell (dome shape) that pulses (contracts/expands) rhythmically with the beat.
 * Long trailing tentacles that wave sinusoidally. Bioluminescent colors: pink,
 * cyan, purple, blue with internal glow. Larger jellyfish move slower (parallax).
 * Cycle: 50s (1500 frames), 18s (540 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1500; // 50s at 30fps
const DURATION = 540; // 18s visible
const NUM_JELLY = 4;

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const JELLY_COLORS = [
  { body: "rgba(255, 100, 200, 0.3)", stroke: "rgba(255, 120, 220, 0.7)", glow: "rgba(255, 100, 200, 0.5)" },
  { body: "rgba(0, 220, 255, 0.3)", stroke: "rgba(0, 240, 255, 0.7)", glow: "rgba(0, 220, 255, 0.5)" },
  { body: "rgba(180, 80, 255, 0.3)", stroke: "rgba(200, 100, 255, 0.7)", glow: "rgba(180, 80, 255, 0.5)" },
  { body: "rgba(60, 120, 255, 0.3)", stroke: "rgba(80, 140, 255, 0.7)", glow: "rgba(60, 120, 255, 0.5)" },
];

interface JellyData {
  startX: number;
  startY: number;
  size: number;
  colorIdx: number;
  riseSpeed: number;
  driftPhase: number;
  driftAmp: number;
  pulsePhase: number;
  pulseFreq: number;
  tentacleCount: number;
  tentacleLen: number;
}

function generateJellies(seed: number): JellyData[] {
  const rng = mulberry32(seed);
  return Array.from({ length: NUM_JELLY }, () => {
    const size = 30 + rng() * 45;
    return {
      startX: 0.15 + rng() * 0.7,
      startY: 0.85 + rng() * 0.15, // start near bottom
      size,
      colorIdx: Math.floor(rng() * JELLY_COLORS.length),
      riseSpeed: 0.08 + rng() * 0.06, // larger = faster, but we invert with size
      driftPhase: rng() * Math.PI * 2,
      driftAmp: 20 + rng() * 30,
      pulsePhase: rng() * Math.PI * 2,
      pulseFreq: 0.05 + rng() * 0.04,
      tentacleCount: 5 + Math.floor(rng() * 4),
      tentacleLen: 50 + rng() * 60,
    };
  });
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Jellyfish: React.FC<Props> = ({ frames }) => {
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

  const jellies = React.useMemo(() => generateJellies(3737), []);

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

  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.35, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          willChange: "opacity",
        }}
      >
        <defs>
          <filter id="jelly-bio-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {jellies.map((j, ji) => {
          const colors = JELLY_COLORS[j.colorIdx];

          // Larger jellyfish rise slower (parallax)
          const sizeFactor = j.size / 75; // 0.4 - 1.0
          const riseRate = j.riseSpeed * (1 - sizeFactor * 0.5);

          // Rise upward over the cycle duration
          const riseDistance = cycleFrame * riseRate;
          const jx = j.startX * width + Math.sin(cycleFrame * 0.012 + j.driftPhase) * j.driftAmp;
          const jy = j.startY * height - riseDistance;

          // Bell pulse driven by beat and energy
          const beatPulse = frames[idx].beat ? 0.12 : 0;
          const pulse = 1 + Math.sin(cycleFrame * j.pulseFreq + j.pulsePhase) * 0.15 + beatPulse;

          const bellRx = j.size * pulse;
          const bellRy = j.size * 0.65 * pulse;

          // Internal glow pulses
          const glowPulse = 0.2 + Math.sin(cycleFrame * j.pulseFreq * 1.3 + j.pulsePhase) * 0.15 + energy * 0.2;

          // Skip if off-screen
          if (jy < -100 || jy > height + 100) return null;

          return (
            <g key={ji} filter="url(#jelly-bio-glow)">
              {/* Bell dome — upper half of ellipse */}
              <defs>
                <clipPath id={`jelly-bell-${ji}`}>
                  <rect x={jx - bellRx - 2} y={jy - bellRy - 2} width={bellRx * 2 + 4} height={bellRy + 4} />
                </clipPath>
                <radialGradient id={`jelly-grad-${ji}`} cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor={colors.glow} stopOpacity={glowPulse} />
                  <stop offset="100%" stopColor={colors.body} stopOpacity={0.1} />
                </radialGradient>
              </defs>

              {/* Bell fill */}
              <ellipse
                cx={jx}
                cy={jy}
                rx={bellRx}
                ry={bellRy}
                fill={`url(#jelly-grad-${ji})`}
                clipPath={`url(#jelly-bell-${ji})`}
              />
              {/* Bell outline */}
              <ellipse
                cx={jx}
                cy={jy}
                rx={bellRx}
                ry={bellRy}
                fill="none"
                stroke={colors.stroke}
                strokeWidth={1.5}
                clipPath={`url(#jelly-bell-${ji})`}
              />
              {/* Rim at bottom of bell */}
              <ellipse
                cx={jx}
                cy={jy}
                rx={bellRx}
                ry={2.5}
                fill="none"
                stroke={colors.stroke}
                strokeWidth={1}
                opacity={0.5}
              />

              {/* Tentacles */}
              {Array.from({ length: j.tentacleCount }, (_, ti) => {
                const spread = ((ti / (j.tentacleCount - 1)) - 0.5) * 2;
                const tentStartX = jx + spread * bellRx * 0.8;
                const tentStartY = jy + 2;
                const segments = 14;
                const points: string[] = [];

                for (let s = 0; s <= segments; s++) {
                  const t = s / segments;
                  const delay = t * 1.8;
                  const waveX = Math.sin(cycleFrame * 0.035 - delay + j.driftPhase + ti * 0.7) * (6 + t * 18);
                  const outward = spread * t * 15;
                  const x = tentStartX + waveX + outward;
                  const y = tentStartY + t * j.tentacleLen * (0.9 + energy * 0.3);
                  points.push(s === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
                }

                return (
                  <path
                    key={`t-${ti}`}
                    d={points.join(" ")}
                    fill="none"
                    stroke={colors.stroke}
                    strokeWidth={1}
                    strokeLinecap="round"
                    opacity={0.35}
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
