/**
 * MeteorShower — Shooting stars streaking across during peaks.
 * When energy > 0.2, meteors fire. Each meteor is a bright circle head + fading
 * line trail angled diagonally. 2-4 active at once. Random entry points from
 * top/sides. Fast movement (cross screen in 20-30 frames). Bright white/yellow/cyan
 * colors with long glowing tails. Trail length from energy. Deterministic spawn
 * via pre-computed schedule in useMemo.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface MeteorData {
  /** Frame when this meteor spawns */
  spawnFrame: number;
  /** Duration in frames (20-30) */
  duration: number;
  /** Start x (0-1 normalized) */
  startX: number;
  /** Start y (0-1 normalized) */
  startY: number;
  /** Angle in radians (downward diagonal) */
  angle: number;
  /** Speed pixels/frame */
  speed: number;
  /** Color hue */
  hue: number;
  /** Head radius */
  headRadius: number;
  /** Trail width */
  trailWidth: number;
}

const SCHEDULE_LENGTH = 108000; // 1 hour at 30fps
const SPAWN_INTERVAL = 12; // attempt a meteor every 12 frames during peaks

function generateMeteorSchedule(seed: number): MeteorData[] {
  const rng = seeded(seed);
  const meteors: MeteorData[] = [];

  for (let f = 0; f < SCHEDULE_LENGTH; f += SPAWN_INTERVAL) {
    // Generate a candidate meteor — we'll gate visibility on energy at render time
    const roll = rng();
    if (roll > 0.35) continue; // only ~35% of slots produce a meteor

    const side = rng(); // 0-1: determines entry side
    let startX: number;
    let startY: number;
    let angle: number;

    if (side < 0.5) {
      // Enter from top
      startX = rng();
      startY = -0.02;
      angle = Math.PI * 0.55 + rng() * Math.PI * 0.35; // angled down-left to down-right
    } else if (side < 0.8) {
      // Enter from left
      startX = -0.02;
      startY = rng() * 0.5;
      angle = -Math.PI * 0.15 + rng() * Math.PI * 0.3;
    } else {
      // Enter from right
      startX = 1.02;
      startY = rng() * 0.5;
      angle = Math.PI * 0.65 + rng() * Math.PI * 0.3;
    }

    const hueRoll = rng();
    const hue = hueRoll < 0.4 ? 0 : hueRoll < 0.7 ? 50 : 185; // white(0), yellow(50), cyan(185)

    meteors.push({
      spawnFrame: f,
      duration: 20 + Math.floor(rng() * 11), // 20-30 frames
      startX,
      startY,
      angle,
      speed: 30 + rng() * 25,
      hue,
      headRadius: 2.5 + rng() * 2,
      trailWidth: 1.5 + rng() * 2,
    });
  }

  return meteors;
}

const COLORS: Record<number, { core: string; glow: string; trail: string }> = {
  0: { core: "#FFFFFF", glow: "rgba(255,255,255,0.6)", trail: "rgba(255,255,255,0.15)" },
  50: { core: "#FFFACD", glow: "rgba(255,215,0,0.6)", trail: "rgba(255,215,0,0.15)" },
  185: { core: "#E0FFFF", glow: "rgba(0,255,255,0.6)", trail: "rgba(0,255,255,0.15)" },
};

interface Props {
  frames: EnhancedFrameData[];
}

export const MeteorShower: React.FC<Props> = ({ frames }) => {
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

  const schedule = React.useMemo(() => generateMeteorSchedule(77770508), []);

  // Gate: only show when energy > 0.2
  if (energy <= 0.1) return null;

  // Find active meteors: spawned within their duration window
  const activeMeteors: { meteor: MeteorData; progress: number }[] = [];
  for (const m of schedule) {
    const elapsed = frame - m.spawnFrame;
    if (elapsed >= 0 && elapsed <= m.duration) {
      activeMeteors.push({ meteor: m, progress: elapsed / m.duration });
    }
    // Limit to 4 simultaneous
    if (activeMeteors.length >= 4) break;
    // Early exit: if meteor spawn is well past current frame, stop searching
    if (m.spawnFrame > frame + 60) break;
  }

  if (activeMeteors.length === 0) return null;

  const masterOpacity = interpolate(energy, [0.1, 0.3], [0.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const trailLengthMult = interpolate(energy, [0.1, 0.4], [0.6, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <filter id="meteor-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {activeMeteors.map(({ meteor, progress }, i) => {
          const dist = progress * meteor.speed * meteor.duration;
          const headX = meteor.startX * width + Math.cos(meteor.angle) * dist;
          const headY = meteor.startY * height + Math.sin(meteor.angle) * dist;

          const trailLen = (60 + energy * 100) * trailLengthMult;
          const tailX = headX - Math.cos(meteor.angle) * trailLen;
          const tailY = headY - Math.sin(meteor.angle) * trailLen;

          // Fade in/out
          const fadeIn = interpolate(progress, [0, 0.15], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const fadeOut = interpolate(progress, [0.7, 1], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const alpha = Math.min(fadeIn, fadeOut);

          const colors = COLORS[meteor.hue] ?? COLORS[0];

          return (
            <g key={`m${meteor.spawnFrame}`} opacity={alpha}>
              {/* Trail gradient line */}
              <defs>
                <linearGradient
                  id={`trail-grad-${i}`}
                  x1={tailX}
                  y1={tailY}
                  x2={headX}
                  y2={headY}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor={colors.trail} stopOpacity="0" />
                  <stop offset="100%" stopColor={colors.glow} stopOpacity="0.8" />
                </linearGradient>
              </defs>
              <line
                x1={tailX}
                y1={tailY}
                x2={headX}
                y2={headY}
                stroke={`url(#trail-grad-${i})`}
                strokeWidth={meteor.trailWidth}
                strokeLinecap="round"
              />
              {/* Bright head */}
              <circle
                cx={headX}
                cy={headY}
                r={meteor.headRadius * (1 + energy * 0.5)}
                fill={colors.core}
                filter="url(#meteor-glow)"
              />
              {/* Outer glow */}
              <circle
                cx={headX}
                cy={headY}
                r={meteor.headRadius * 3}
                fill={colors.glow}
                opacity={0.3}
                style={{ filter: "blur(6px)" }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
