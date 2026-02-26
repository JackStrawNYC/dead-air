/**
 * DrumCircles — Concentric pulse rings expanding outward from center.
 * When energy is above a threshold, rings spawn and expand outward while fading.
 * Rolling buffer approach: every N frames, if energy is high enough, add a ring.
 * Each ring has a birth frame, radius = (currentFrame - birthFrame) * speed.
 * Fades as rings expand. Multiple rings active at once (up to 8).
 * Neon colors. Always active but only spawning rings during higher energy moments.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const MAX_RINGS = 8;
const SPAWN_INTERVAL = 12;  // Check every 12 frames (~0.4s)
const ENERGY_THRESHOLD = 0.12;
const RING_LIFETIME = 90;   // Frames a ring lives before fully faded
const RING_SPEED = 4.5;     // Pixels per frame of expansion

const RING_COLORS = [
  "#FF0066",
  "#FF6600",
  "#FFFF00",
  "#00FF66",
  "#00CCFF",
  "#6644FF",
  "#FF00FF",
  "#FF3399",
];

interface RingState {
  birthFrame: number;
  colorIdx: number;
  speedMult: number;
  strokeBase: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const DrumCircles: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy window: idx-75 to idx+75
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.sqrt(cx * cx + cy * cy);

  // Deterministically compute which rings are active at the current frame.
  // Scan backward from current frame to find all spawn points within ring lifetime.
  const activeRings: RingState[] = [];

  // Look back up to MAX_RINGS * SPAWN_INTERVAL frames to find recently spawned rings
  const lookback = MAX_RINGS * SPAWN_INTERVAL + RING_LIFETIME;
  const startScan = Math.max(0, frame - lookback);

  for (let f = startScan; f <= frame; f++) {
    // Only check on spawn interval boundaries
    if (f % SPAWN_INTERVAL !== 0) continue;

    const fIdx = Math.min(Math.max(0, f), frames.length - 1);

    // Compute rolling energy at this candidate frame
    let spawnESum = 0;
    let spawnECount = 0;
    for (let j = Math.max(0, fIdx - 30); j <= Math.min(frames.length - 1, fIdx + 30); j++) {
      spawnESum += frames[j].rms;
      spawnECount++;
    }
    const spawnEnergy = spawnECount > 0 ? spawnESum / spawnECount : 0;

    if (spawnEnergy < ENERGY_THRESHOLD) continue;

    const age = frame - f;
    if (age > RING_LIFETIME) continue;

    // Use seeded RNG for ring properties
    const rng = seeded(f * 13 + 1977);
    const colorIdx = Math.floor(rng() * RING_COLORS.length);
    const speedMult = 0.8 + rng() * 0.5;
    const strokeBase = 1.5 + rng() * 2;

    activeRings.push({
      birthFrame: f,
      colorIdx,
      speedMult,
      strokeBase,
    });
  }

  // Keep only the most recent MAX_RINGS
  const rings = activeRings.slice(-MAX_RINGS);

  // Overall component opacity: always visible (rings just may not be spawning)
  const baseOpacity = interpolate(energy, [0.02, 0.15], [0.15, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Glow intensity
  const glowSize = interpolate(energy, [0.05, 0.3], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Ambient center pulse even when no rings are active
  const ambientPulse = Math.sin(frame * 0.08) * 0.5 + 0.5;
  const ambientRadius = 20 + ambientPulse * 30 + energy * 50;
  const ambientHue = (frame * 0.5) % 360;
  const ambientColor = `hsla(${ambientHue}, 100%, 65%, ${0.08 + energy * 0.1})`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: baseOpacity }}>
        {/* Ambient center glow */}
        <circle
          cx={cx}
          cy={cy}
          r={ambientRadius}
          fill="none"
          stroke={ambientColor}
          strokeWidth={1.5}
        />
        <circle
          cx={cx}
          cy={cy}
          r={ambientRadius * 0.5}
          fill={ambientColor}
          opacity={0.15}
        />

        {/* Active rings */}
        {rings.map((ring, ri) => {
          const age = frame - ring.birthFrame;
          const lifeProgress = age / RING_LIFETIME; // 0 to 1

          // Radius expands over lifetime
          const radius = age * RING_SPEED * ring.speedMult;

          // Don't render if beyond screen
          if (radius > maxRadius * 1.2) return null;

          // Opacity: bright at birth, fades as it expands
          const ringOpacity = interpolate(lifeProgress, [0, 0.1, 0.7, 1], [0, 0.9, 0.4, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });

          // Stroke width: starts thick, thins as it expands
          const strokeW = ring.strokeBase * interpolate(lifeProgress, [0, 1], [1.5, 0.3], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const color = RING_COLORS[ring.colorIdx];

          // Slight wobble on the ring
          const wobbleX = Math.sin(age * 0.15 + ring.birthFrame * 0.3) * 3;
          const wobbleY = Math.cos(age * 0.12 + ring.birthFrame * 0.5) * 3;

          return (
            <g
              key={`ring-${ring.birthFrame}`}
              style={{
                filter: `drop-shadow(0 0 ${glowSize}px ${color})`,
              }}
            >
              {/* Outer glow ring */}
              <circle
                cx={cx + wobbleX}
                cy={cy + wobbleY}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeW + 3}
                opacity={ringOpacity * 0.15}
              />

              {/* Main ring */}
              <circle
                cx={cx + wobbleX}
                cy={cy + wobbleY}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeW}
                opacity={ringOpacity}
              />

              {/* Inner bright edge */}
              <circle
                cx={cx + wobbleX}
                cy={cy + wobbleY}
                r={radius}
                fill="none"
                stroke="white"
                strokeWidth={strokeW * 0.3}
                opacity={ringOpacity * 0.4}
              />

              {/* Segment markers on ring (like drum notation) */}
              {Array.from({ length: 8 }, (_, seg) => {
                const angle = (seg / 8) * Math.PI * 2 + age * 0.02;
                const sx = cx + wobbleX + Math.cos(angle) * radius;
                const sy = cy + wobbleY + Math.sin(angle) * radius;
                const dotR = 2 + (1 - lifeProgress) * 2;

                return (
                  <circle
                    key={`seg-${ring.birthFrame}-${seg}`}
                    cx={sx}
                    cy={sy}
                    r={dotR}
                    fill={color}
                    opacity={ringOpacity * 0.6}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Center dot: bright when energy is high */}
        <circle
          cx={cx}
          cy={cy}
          r={5 + energy * 10}
          fill={`hsl(${ambientHue}, 100%, 70%)`}
          opacity={0.3 + energy * 0.4}
        />
      </svg>
    </div>
  );
};
