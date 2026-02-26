/**
 * ConfettiCannon — Burst of 50-80 confetti pieces from bottom corners on energy peaks (>0.3).
 * Confetti shoots upward in a fountain arc, then falls with gravity. Each piece is a small
 * rect with random bright color and rotation. Multiple cannons can fire from alternating sides.
 * Cycle: 30s, 8s visible, energy-gated.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CONFETTI_COLORS = [
  "#FF1744", "#FF9100", "#FFD600", "#00E676",
  "#2979FF", "#D500F9", "#FF4081", "#00BCD4",
  "#76FF03", "#FFAB40", "#E040FB", "#40C4FF",
];

const GRAVITY = 0.08;
const PARTICLES_PER_BURST = 65;
const MAX_ACTIVE_BURSTS = 4;
const BURST_LIFETIME = 150; // 5 seconds at 30fps
const CHECK_INTERVAL = 12;
const ENERGY_THRESHOLD = 0.3;

interface ConfettiPiece {
  vx: number;
  vy: number;
  width: number;
  height: number;
  colorIdx: number;
  rotSpeed: number;
  rotPhase: number;
  drag: number;
  tumbleSpeed: number;
  lifetime: number;
}

interface BurstEvent {
  frame: number;
  side: "left" | "right";
  pieces: ConfettiPiece[];
}

function precomputeBursts(
  frames: EnhancedFrameData[],
  masterSeed: number,
): BurstEvent[] {
  const rng = seeded(masterSeed);
  const events: BurstEvent[] = [];

  for (let f = 0; f < frames.length; f += CHECK_INTERVAL) {
    if (frames[f].rms > ENERGY_THRESHOLD) {
      const active = events.filter((e) => f - e.frame < BURST_LIFETIME);
      if (active.length >= MAX_ACTIVE_BURSTS) continue;

      // Alternate sides
      const side: "left" | "right" = events.length % 2 === 0 ? "left" : "right";

      const pieces: ConfettiPiece[] = Array.from({ length: PARTICLES_PER_BURST }, () => {
        const angle = -Math.PI / 2 + (rng() - 0.5) * 1.2; // upward with spread
        const speed = 4 + rng() * 8;
        const sideDir = side === "left" ? 1 : -1;
        return {
          vx: Math.cos(angle) * speed * sideDir + (rng() - 0.5) * 2,
          vy: Math.sin(angle) * speed - 1,
          width: 3 + rng() * 6,
          height: 2 + rng() * 4,
          colorIdx: Math.floor(rng() * CONFETTI_COLORS.length),
          rotSpeed: (rng() - 0.5) * 15,
          rotPhase: rng() * 360,
          drag: 0.97 + rng() * 0.02,
          tumbleSpeed: 3 + rng() * 8,
          lifetime: 100 + Math.floor(rng() * 50),
        };
      });

      events.push({ frame: f, side, pieces });
    }
  }

  return events;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const ConfettiCannon: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const _energy = eCount > 0 ? eSum / eCount : 0;

  const burstEvents = React.useMemo(
    () => precomputeBursts(frames, 7777_1977),
    [frames],
  );

  // Timing gate -- cycle: 30s visible window of 8s
  const CYCLE = 900;     // 30 seconds
  const DURATION = 240;  // 8 seconds
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const activeBursts = burstEvents.filter(
    (e) => frame >= e.frame && frame < e.frame + BURST_LIFETIME,
  );

  if (activeBursts.length === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}>
        {activeBursts.map((event, bi) => {
          const age = frame - event.frame;
          const originX = event.side === "left" ? 40 : width - 40;
          const originY = height - 20;

          return (
            <g key={`burst-${event.frame}-${bi}`}>
              {event.pieces.map((p, pi) => {
                if (age >= p.lifetime) return null;

                // Physics
                let px = originX;
                let py = originY;
                let vx = p.vx;
                let vy = p.vy;
                for (let t = 0; t < age; t++) {
                  px += vx;
                  py += vy;
                  vy += GRAVITY;
                  vx *= p.drag;
                  vy *= p.drag;
                }

                // Off-screen culling
                if (py > height + 20 || px < -30 || px > width + 30) return null;

                const lifeProgress = age / p.lifetime;
                const alpha = interpolate(lifeProgress, [0, 0.1, 0.8, 1], [1, 1, 0.8, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });

                if (alpha < 0.02) return null;

                const rot = p.rotPhase + age * p.rotSpeed;
                // Tumble creates a "flat" phase making confetti appear to flip
                const tumbleScale = Math.cos(age * p.tumbleSpeed * 0.1);
                const color = CONFETTI_COLORS[p.colorIdx];

                return (
                  <rect
                    key={pi}
                    x={px - p.width / 2}
                    y={py - p.height / 2}
                    width={p.width}
                    height={p.height * Math.abs(tumbleScale)}
                    fill={color}
                    opacity={alpha}
                    rx={0.5}
                    transform={`rotate(${rot} ${px} ${py})`}
                    style={{ filter: `drop-shadow(0 0 2px ${color})` }}
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
