/**
 * ParticleExplosion — Firework-style particle bursts on peak energy.
 * When RMS spikes above 0.35 (checked every 15 frames), spawn a burst of
 * 30-50 particles at a random position. Particles fly outward in all
 * directions with gravity pulling them down. Each particle is a small circle
 * with trail. Neon colors. Particles live 60-90 frames. Max 3 simultaneous
 * bursts.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
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

const NEON_COLORS = [
  { h: 320, s: 100, l: 65 }, // hot pink
  { h: 160, s: 100, l: 55 }, // neon green
  { h: 45, s: 100, l: 60 },  // neon gold
  { h: 190, s: 100, l: 60 }, // cyan
  { h: 275, s: 100, l: 65 }, // violet
  { h: 0, s: 100, l: 60 },   // neon red
  { h: 210, s: 100, l: 65 }, // electric blue
];

interface ParticleData {
  /** Initial velocity X (px/frame) */
  vx: number;
  /** Initial velocity Y (px/frame) */
  vy: number;
  /** Size (radius) */
  size: number;
  /** Color index into NEON_COLORS */
  colorIdx: number;
  /** Lifetime in frames */
  lifetime: number;
  /** Drag factor */
  drag: number;
}

interface BurstData {
  /** Center X position (fraction of width) */
  cx: number;
  /** Center Y position (fraction of height) */
  cy: number;
  /** Particles in this burst */
  particles: ParticleData[];
  /** Color palette index for the burst */
  paletteBase: number;
}

const CHECK_INTERVAL = 15;
const RMS_THRESHOLD = 0.35;
const MAX_BURSTS = 3;
const PARTICLES_PER_BURST = 40;
const GRAVITY = 0.12; // px/frame^2

interface BurstEvent {
  frame: number;
  burst: BurstData;
}

function precomputeBursts(
  frames: EnhancedFrameData[],
  masterSeed: number,
): BurstEvent[] {
  const rng = seeded(masterSeed);
  const events: BurstEvent[] = [];

  for (let f = 0; f < frames.length; f += CHECK_INTERVAL) {
    if (frames[f].rms > RMS_THRESHOLD) {
      // Check we don't have too many active bursts at this frame
      const activeBursts = events.filter(
        (e) => f - e.frame < 90,
      );
      if (activeBursts.length >= MAX_BURSTS) continue;

      const particles: ParticleData[] = Array.from({ length: PARTICLES_PER_BURST }, () => {
        const angle = rng() * Math.PI * 2;
        const speed = 2 + rng() * 8;
        return {
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2, // slight upward bias
          size: 1.5 + rng() * 3,
          colorIdx: Math.floor(rng() * NEON_COLORS.length),
          lifetime: 60 + Math.floor(rng() * 30),
          drag: 0.96 + rng() * 0.03,
        };
      });

      events.push({
        frame: f,
        burst: {
          cx: 0.15 + rng() * 0.7,
          cy: 0.15 + rng() * 0.5,
          particles,
          paletteBase: Math.floor(rng() * NEON_COLORS.length),
        },
      });
    }
  }

  return events;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const ParticleExplosion: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const _energy = eCount > 0 ? eSum / eCount : 0;

  // Precompute all burst events deterministically from the audio data
  const burstEvents = React.useMemo(
    () => precomputeBursts(frames, ctx?.showSeed ?? 19770508),
    [frames, ctx?.showSeed],
  );

  // Find active bursts at current frame
  const activeBursts = burstEvents.filter(
    (e) => frame >= e.frame && frame < e.frame + 90,
  );

  if (activeBursts.length === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}>
        {activeBursts.map((event, bi) => {
          const age = frame - event.frame;
          const originX = event.burst.cx * width;
          const originY = event.burst.cy * height;

          return (
            <g key={`burst-${event.frame}-${bi}`}>
              {event.burst.particles.map((p, pi) => {
                if (age >= p.lifetime) return null;

                // Physics simulation
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

                // Fade out over lifetime
                const lifeProgress = age / p.lifetime;
                const alpha = interpolate(lifeProgress, [0, 0.3, 1], [0.9, 0.9, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });

                if (alpha < 0.02) return null;

                const color = NEON_COLORS[p.colorIdx];
                const fillColor = `hsla(${color.h}, ${color.s}%, ${color.l}%, ${alpha})`;
                const glowColor = `hsla(${color.h}, 100%, ${color.l + 15}%, ${alpha * 0.6})`;

                // Trail: a line from current position back toward the origin
                const trailLen = Math.min(12, Math.sqrt(vx * vx + vy * vy) * 3);
                const trailX = px - (vx / (Math.sqrt(vx * vx + vy * vy) + 0.001)) * trailLen;
                const trailY = py - (vy / (Math.sqrt(vx * vx + vy * vy) + 0.001)) * trailLen;

                const r = p.size * (1 - lifeProgress * 0.5);

                return (
                  <g key={pi}>
                    {/* Trail */}
                    <line
                      x1={px}
                      y1={py}
                      x2={trailX}
                      y2={trailY}
                      stroke={fillColor}
                      strokeWidth={r * 0.7}
                      strokeLinecap="round"
                    />
                    {/* Glow */}
                    <circle
                      cx={px}
                      cy={py}
                      r={r * 2.5}
                      fill={glowColor}
                      style={{ filter: `blur(${2 + r}px)` }}
                    />
                    {/* Core */}
                    <circle
                      cx={px}
                      cy={py}
                      r={r}
                      fill={fillColor}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
