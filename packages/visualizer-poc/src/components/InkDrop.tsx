/**
 * InkDrop — Watercolor ink blooms expanding during crescendos.
 * When energy crosses 0.25, spawn a bloom at random position.
 * Each bloom = cluster of 5-7 overlapping circles expanding with decreasing opacity.
 * Colors from chroma hue. Blooms live ~120 frames then fade. Max 4 simultaneous.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
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

// ── BLOOM DETECTION ─────────────────────────────────────────────

const BLOOM_LIFETIME = 120;
const MAX_BLOOMS = 4;
const BLOOM_COOLDOWN = 30; // min frames between spawns
const ENERGY_THRESHOLD = 0.25;
const CIRCLES_PER_BLOOM = 6;

interface BloomInstance {
  spawnFrame: number;
  x: number;
  y: number;
  hue: number;
  circles: { dx: number; dy: number; baseR: number; speed: number }[];
}

function getDominantHue(chroma: number[]): number {
  let maxVal = 0;
  let maxIdx = 0;
  for (let i = 0; i < chroma.length; i++) {
    if (chroma[i] > maxVal) {
      maxVal = chroma[i];
      maxIdx = i;
    }
  }
  return maxIdx * 30; // 12 pitch classes -> 360 degrees
}

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const InkDrop: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Rolling energy (151-frame window)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Pre-compute all blooms deterministically based on frame data
  const blooms = React.useMemo(() => {
    const result: BloomInstance[] = [];
    let lastSpawn = -BLOOM_COOLDOWN;

    for (let f = 0; f < frames.length; f++) {
      // Compute rolling energy at this frame
      let rSum = 0;
      let rCount = 0;
      for (let j = Math.max(0, f - 75); j <= Math.min(frames.length - 1, f + 75); j++) {
        rSum += frames[j].rms;
        rCount++;
      }
      const rollingEnergy = rCount > 0 ? rSum / rCount : 0;

      if (rollingEnergy >= ENERGY_THRESHOLD && f - lastSpawn >= BLOOM_COOLDOWN) {
        // Check how many active blooms at this frame
        const active = result.filter(b => f - b.spawnFrame < BLOOM_LIFETIME);
        if (active.length < MAX_BLOOMS) {
          const rng = seeded(f * 7 + 19770508);
          const hue = getDominantHue(frames[f].chroma);
          const circles = Array.from({ length: CIRCLES_PER_BLOOM }, () => ({
            dx: (rng() - 0.5) * 80,
            dy: (rng() - 0.5) * 80,
            baseR: 20 + rng() * 40,
            speed: 0.8 + rng() * 0.6,
          }));
          result.push({
            spawnFrame: f,
            x: 0.1 + rng() * 0.8,
            y: 0.1 + rng() * 0.8,
            hue,
            circles,
          });
          lastSpawn = f;
        }
      }
    }
    return result;
  }, [frames]);

  // Find active blooms for current frame
  const activeBlooms = blooms.filter(
    b => frame >= b.spawnFrame && frame < b.spawnFrame + BLOOM_LIFETIME
  );

  if (activeBlooms.length === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", mixBlendMode: "screen" }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <filter id="ink-blur">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        {activeBlooms.map((bloom, bi) => {
          const age = frame - bloom.spawnFrame;
          const progress = age / BLOOM_LIFETIME;

          // Fade in quickly, fade out slowly
          const opacity = interpolate(progress, [0, 0.08, 0.6, 1], [0, 0.65, 0.4, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const cx = bloom.x * width;
          const cy = bloom.y * height;

          return (
            <g key={`bloom-${bloom.spawnFrame}`} opacity={opacity} filter="url(#ink-blur)">
              {bloom.circles.map((c, ci) => {
                const expand = 1 + progress * c.speed * 2.5;
                const r = c.baseR * expand;
                const dx = c.dx * expand;
                const dy = c.dy * expand;
                const circleOpacity = interpolate(ci, [0, CIRCLES_PER_BLOOM - 1], [0.6, 0.15], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                const hueShift = ci * 15;

                return (
                  <circle
                    key={ci}
                    cx={cx + dx}
                    cy={cy + dy}
                    r={r}
                    fill={`hsla(${bloom.hue + hueShift}, 80%, 55%, ${circleOpacity})`}
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
