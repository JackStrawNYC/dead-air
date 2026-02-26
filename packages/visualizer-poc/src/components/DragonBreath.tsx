/**
 * DragonBreath — Fiery exhale effects from left and right edges.
 * Flame-like particle streams that shoot inward during energy peaks (>0.25).
 * Particles follow curved paths and fade. Red->orange->yellow gradient.
 * Particle count and reach scale with energy.
 * Cycle: 35s, 10s visible, energy-gated.
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

interface ParticleData {
  /** Which side: 0=left, 1=right */
  side: number;
  /** Y position as fraction of height (0.2-0.8) */
  yFrac: number;
  /** Arc curvature: positive = curves up, negative = curves down */
  curvature: number;
  /** Speed multiplier */
  speed: number;
  /** Life duration in frames */
  life: number;
  /** Spawn delay within burst cycle */
  spawnDelay: number;
  /** Particle size */
  size: number;
  /** Hue: 0=red, 30=orange, 55=yellow */
  hue: number;
  /** Flickering speed */
  flickerFreq: number;
  /** Flicker phase */
  flickerPhase: number;
}

const NUM_PARTICLES = 30;
const CYCLE_FRAMES = 35 * 30; // 35s
const VISIBLE_FRAMES = 10 * 30; // 10s
const FADE_FRAMES = 45;

function generateParticles(seed: number): ParticleData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_PARTICLES }, () => ({
    side: rng() > 0.5 ? 1 : 0,
    yFrac: 0.2 + rng() * 0.6,
    curvature: (rng() - 0.5) * 0.8,
    speed: 2 + rng() * 4,
    life: 30 + Math.floor(rng() * 50),
    spawnDelay: Math.floor(rng() * (VISIBLE_FRAMES - 60)),
    size: 2 + rng() * 5,
    hue: rng() * 55, // 0=red to 55=yellow
    flickerFreq: 0.1 + rng() * 0.25,
    flickerPhase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const DragonBreath: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const particles = React.useMemo(() => generateParticles(35197708), []);

  // Cycle timing
  const cyclePos = frame % CYCLE_FRAMES;
  const inShowWindow = cyclePos < VISIBLE_FRAMES;

  // Energy gate: only active when energy > 0.15, full at 0.25
  const energyGate = interpolate(energy, [0.15, 0.25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (!inShowWindow || energyGate < 0.01) return null;

  // Fade envelope within show window
  const fadeIn = interpolate(cyclePos, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cyclePos, [VISIBLE_FRAMES - FADE_FRAMES, VISIBLE_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const envelope = Math.min(fadeIn, fadeOut);

  // Particle count scales with energy
  const visibleCount = Math.round(interpolate(energy, [0.15, 0.4], [8, NUM_PARTICLES], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  // Reach scales with energy (how far particles travel inward)
  const reachMult = interpolate(energy, [0.15, 0.4], [0.15, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = envelope * energyGate * 0.8;

  if (masterOpacity < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `blur(1px) drop-shadow(0 0 12px rgba(255, 120, 20, 0.5)) drop-shadow(0 0 30px rgba(255, 60, 0, 0.3))`,
        }}
      >
        {particles.slice(0, visibleCount).map((p, pi) => {
          // Local time for this particle within the cycle window
          const particleLocal = cyclePos - p.spawnDelay;
          if (particleLocal < 0 || particleLocal > p.life) return null;

          const lifeFrac = particleLocal / p.life;

          // Start from edge, travel inward
          const startX = p.side === 0 ? 0 : width;
          const direction = p.side === 0 ? 1 : -1;
          const travel = lifeFrac * width * reachMult;

          const px = startX + direction * travel;

          // Curved path: quadratic curve up or down
          const baseY = p.yFrac * height;
          const curveY = baseY + p.curvature * travel * Math.sin(lifeFrac * Math.PI);

          // Flicker
          const flicker =
            0.6 +
            Math.sin(frame * p.flickerFreq + p.flickerPhase) * 0.25 +
            Math.sin(frame * p.flickerFreq * 2.3 + p.flickerPhase * 0.7) * 0.15;

          // Fade: born bright, fades as it travels
          const ageFade = interpolate(lifeFrac, [0, 0.1, 0.6, 1], [0.3, 1, 0.6, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const alpha = ageFade * flicker;
          if (alpha < 0.03) return null;

          // Size shrinks with age
          const r = p.size * (1 - lifeFrac * 0.5);

          // Color: starts yellow/white, cools to red/orange
          const hueShift = interpolate(lifeFrac, [0, 1], [55, p.hue], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const lightness = interpolate(lifeFrac, [0, 1], [85, 55], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <g key={pi}>
              {/* Outer glow */}
              <circle
                cx={px}
                cy={curveY}
                r={r * 3}
                fill={`hsla(${hueShift}, 100%, ${lightness - 10}%, ${alpha * 0.2})`}
              />
              {/* Core */}
              <circle
                cx={px}
                cy={curveY}
                r={r}
                fill={`hsla(${hueShift}, 100%, ${lightness}%, ${alpha})`}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
