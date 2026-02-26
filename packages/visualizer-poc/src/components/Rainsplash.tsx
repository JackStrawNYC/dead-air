/**
 * Rainsplash — Raindrops hitting a water surface with splash crown rings.
 * Rain drops fall from random positions at top. On impact at a "water line"
 * (80% down screen), they create expanding ring splashes (2-3 concentric
 * circles expanding outward). Drop count scales with energy. Blue/silver colors.
 * Splash rings are cyan with glow. Appears every 45s for 14s. Water line shown
 * as subtle horizontal gradient.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DROP_COLOR = "rgba(180, 200, 220, 0.7)";
const SPLASH_CYAN = "#00E5FF";
const SPLASH_DIM = "rgba(0, 229, 255, 0.3)";
const WATER_LINE_COLOR = "rgba(0, 150, 200, 0.15)";

const CYCLE_FRAMES = 1350; // 45 seconds at 30fps
const VISIBLE_FRAMES = 420; // 14 seconds at 30fps
const MAX_DROPS = 25;
const DROP_FALL_FRAMES = 30; // frames for a drop to fall from top to water line
const SPLASH_DURATION = 40; // frames for splash rings to expand and fade
const NUM_SPLASH_RINGS = 3;

interface RainDrop {
  x: number; // 0-1
  birthCycleFrame: number; // frame within cycle when drop spawns
  speed: number; // fall speed multiplier
  size: number;
}

function generateDropSchedule(seed: number, visibleFrames: number, energy: number): RainDrop[] {
  const rng = seeded(seed);
  const dropCount = Math.floor(3 + energy * (MAX_DROPS - 3));
  const drops: RainDrop[] = [];

  for (let i = 0; i < dropCount; i++) {
    drops.push({
      x: 0.05 + rng() * 0.9,
      birthCycleFrame: Math.floor(rng() * (visibleFrames - DROP_FALL_FRAMES - SPLASH_DURATION)),
      speed: 0.8 + rng() * 0.4,
      size: 1.5 + rng() * 2,
    });
  }

  return drops;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Rainsplash: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Generate drops schedule for this cycle (useMemo BEFORE return null)
  const cycleIndex = Math.floor(frame / CYCLE_FRAMES);
  const drops = React.useMemo(
    () => generateDropSchedule(cycleIndex * 137 + (ctx?.showSeed ?? 19770508), VISIBLE_FRAMES, energy),
    [cycleIndex, energy, ctx?.showSeed],
  );

  // Periodic visibility
  const cycleFrame = frame % CYCLE_FRAMES;
  const fadeIn = interpolate(cycleFrame, [0, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cycleFrame, [VISIBLE_FRAMES - 45, VISIBLE_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const visibilityOpacity = cycleFrame < VISIBLE_FRAMES ? fadeIn * fadeOut : 0;

  if (visibilityOpacity < 0.01) return null;

  // Water line position
  const waterLineY = height * 0.8;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: visibilityOpacity * 0.6,
          filter: `drop-shadow(0 0 4px ${SPLASH_CYAN})`,
        }}
      >
        {/* Water line gradient */}
        <defs>
          <linearGradient id="waterLineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0, 150, 200, 0)" />
            <stop offset="40%" stopColor={WATER_LINE_COLOR} />
            <stop offset="60%" stopColor={WATER_LINE_COLOR} />
            <stop offset="100%" stopColor="rgba(0, 100, 150, 0.05)" />
          </linearGradient>
        </defs>

        {/* Water line */}
        <rect
          x={0}
          y={waterLineY - 4}
          width={width}
          height={8}
          fill="url(#waterLineGrad)"
        />

        {/* Subtle water surface reflection */}
        <line
          x1={0}
          y1={waterLineY}
          x2={width}
          y2={waterLineY}
          stroke="rgba(0, 200, 255, 0.1)"
          strokeWidth={1}
        />

        {/* Render each drop */}
        {drops.map((drop, di) => {
          const dropAge = cycleFrame - drop.birthCycleFrame;
          if (dropAge < 0) return null;

          const dropX = drop.x * width;
          const fallDuration = DROP_FALL_FRAMES / drop.speed;

          if (dropAge < fallDuration) {
            // Drop is falling
            const fallProgress = dropAge / fallDuration;
            const dropY = interpolate(fallProgress, [0, 1], [0, waterLineY], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.in(Easing.quad),
            });

            // Elongated raindrop shape (small vertical ellipse)
            const stretch = 1 + fallProgress * 2;
            return (
              <ellipse
                key={`drop-${di}`}
                cx={dropX}
                cy={dropY}
                rx={drop.size * 0.6}
                ry={drop.size * stretch}
                fill={DROP_COLOR}
              />
            );
          }

          // Drop has hit water -- show splash rings
          const splashAge = dropAge - fallDuration;
          if (splashAge > SPLASH_DURATION) return null;

          const splashProgress = splashAge / SPLASH_DURATION;

          return (
            <g key={`splash-${di}`}>
              {/* Expanding splash rings */}
              {Array.from({ length: NUM_SPLASH_RINGS }, (_, ri) => {
                // Stagger ring appearances
                const ringDelay = ri * 0.15;
                const ringProgress = Math.max(0, (splashProgress - ringDelay) / (1 - ringDelay));
                if (ringProgress <= 0) return null;

                const ringRadius = interpolate(ringProgress, [0, 1], [2, 25 + ri * 12], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.cubic),
                });

                const ringOpacity = interpolate(ringProgress, [0, 0.2, 1], [0, 0.8, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });

                // Rings are ellipses (perspective: wider than tall)
                return (
                  <ellipse
                    key={`ring-${di}-${ri}`}
                    cx={dropX}
                    cy={waterLineY}
                    rx={ringRadius}
                    ry={ringRadius * 0.35}
                    fill="none"
                    stroke={ri === 0 ? SPLASH_CYAN : SPLASH_DIM}
                    strokeWidth={ri === 0 ? 1.5 : 1}
                    opacity={ringOpacity}
                  />
                );
              })}

              {/* Small upward splash droplets */}
              {splashProgress < 0.5 && (
                <>
                  {Array.from({ length: 4 }, (_, si) => {
                    const splashRng = seeded(di * 17 + si * 31 + cycleIndex);
                    const angle = splashRng() * Math.PI; // upper half circle
                    const dist = (5 + splashRng() * 15) * splashProgress;
                    const sx = dropX + Math.cos(angle) * dist * 2;
                    const sy = waterLineY - Math.sin(angle) * dist;
                    const dropletOpacity = interpolate(splashProgress, [0, 0.1, 0.5], [0, 0.7, 0], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    });

                    return (
                      <circle
                        key={`droplet-${di}-${si}`}
                        cx={sx}
                        cy={sy}
                        r={1 + splashRng() * 1.5}
                        fill={SPLASH_CYAN}
                        opacity={dropletOpacity}
                      />
                    );
                  })}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
