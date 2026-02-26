/**
 * WaterfallMist — Cascading particle curtain like waterfall spray.
 * 50-80 small particles falling from the top in a curtain pattern.
 * Particles accelerate downward (gravity), have slight horizontal drift.
 * White/cyan with blur. Mist cloud builds at bottom (low-opacity ellipse).
 * Flow rate driven by energy.
 * Cycle: 45s (1350 frames), 15s visible (450 frames).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 1350;    // 45 seconds at 30fps
const DURATION = 450;  // 15 seconds visible
const STAGGER_OFFSET = 180; // 6s offset
const NUM_PARTICLES = 65;

interface Particle {
  /** Horizontal start position (0-1) */
  x0: number;
  /** Horizontal drift speed */
  driftX: number;
  /** Start delay (frames into cycle) */
  delay: number;
  /** Fall speed multiplier */
  speedMult: number;
  /** Size */
  radius: number;
  /** Opacity base */
  alpha: number;
  /** Hue offset (slight cyan variation) */
  hueOffset: number;
}

function generateParticles(seed: number): Particle[] {
  const rng = mulberry32(seed);
  return Array.from({ length: NUM_PARTICLES }, () => ({
    x0: 0.1 + rng() * 0.8,
    driftX: (rng() - 0.5) * 0.3,
    delay: Math.floor(rng() * DURATION * 0.6),
    speedMult: 0.5 + rng() * 1.0,
    radius: 1.5 + rng() * 3,
    alpha: 0.3 + rng() * 0.5,
    hueOffset: rng() * 30 - 15,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const WaterfallMist: React.FC<Props> = ({ frames }) => {
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

  const particles = React.useMemo(() => generateParticles(5550123), []);

  // Periodic visibility
  const effectiveFrame = Math.max(0, frame - STAGGER_OFFSET);
  const cycleFrame = effectiveFrame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const visibility = Math.min(fadeIn, fadeOut);

  const energyOpacity = interpolate(energy, [0.04, 0.25], [0.15, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = visibility * energyOpacity;
  if (masterOpacity < 0.01) return null;

  // Energy drives flow rate (more particles active at higher energy)
  const flowMult = interpolate(energy, [0.03, 0.3], [0.5, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Gravity constant: pixels per frame^2 (acceleration)
  const gravity = 0.08 * flowMult;

  // Mist cloud opacity at bottom (builds over time)
  const mistOpacity = interpolate(progress, [0.1, 0.5, 0.9, 1], [0, 0.2 + energy * 0.15, 0.25, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Cyan-white palette
  const baseHue = 190 + Math.sin(cycleFrame * 0.01) * 15;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          mixBlendMode: "screen",
        }}
      >
        <defs>
          <radialGradient id="mist-cloud" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`hsl(${baseHue}, 60%, 80%)`} stopOpacity="0.6" />
            <stop offset="70%" stopColor={`hsl(${baseHue}, 40%, 70%)`} stopOpacity="0.2" />
            <stop offset="100%" stopColor={`hsl(${baseHue}, 30%, 60%)`} stopOpacity="0" />
          </radialGradient>
          <filter id="water-blur">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>

        {/* Mist cloud at bottom */}
        <ellipse
          cx={width / 2}
          cy={height - 40}
          rx={width * 0.45}
          ry={60 + energy * 30}
          fill="url(#mist-cloud)"
          opacity={mistOpacity}
          style={{
            filter: `blur(${15 + energy * 10}px)`,
          }}
        />

        {/* Falling particles */}
        {particles.map((p, pi) => {
          // Each particle: starts at top, accelerates downward
          const particleAge = cycleFrame - p.delay;
          if (particleAge < 0) return null;

          // Reset cycle per particle (particle lifetime ~120-200 frames)
          const lifetime = Math.floor(150 / p.speedMult);
          const particleFrame = particleAge % lifetime;

          // Position with gravity
          const t = particleFrame;
          const x = p.x0 * width + p.driftX * t * flowMult;
          const y = t * 1.5 * p.speedMult * flowMult + 0.5 * gravity * t * t;

          if (y > height + 20) return null;

          // Fade out as particle approaches bottom
          const yFade = interpolate(y, [0, height * 0.7, height], [1, 0.8, 0.1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          // Brief flash at spawn
          const spawnFade = interpolate(particleFrame, [0, 5, lifetime * 0.8, lifetime], [0, 1, 0.8, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const hue = baseHue + p.hueOffset;
          const color = `hsl(${hue}, 50%, 85%)`;
          const opacity = p.alpha * yFade * spawnFade;

          if (opacity < 0.02) return null;

          return (
            <circle
              key={`p-${pi}`}
              cx={x}
              cy={y}
              r={p.radius * (1 + energy * 0.5)}
              fill={color}
              opacity={opacity}
              filter="url(#water-blur)"
            />
          );
        })}

        {/* Spray wisps — horizontal streaks near the top */}
        {[0.25, 0.4, 0.55, 0.7].map((xFrac, wi) => {
          const wispY = 20 + wi * 15;
          const wispX = xFrac * width + Math.sin(cycleFrame * 0.05 + wi) * 30;
          const wispLen = 30 + energy * 40;
          return (
            <line
              key={`wisp-${wi}`}
              x1={wispX - wispLen / 2}
              y1={wispY}
              x2={wispX + wispLen / 2}
              y2={wispY + 5}
              stroke={`hsla(${baseHue}, 40%, 80%, 0.2)`}
              strokeWidth={1.5}
              strokeLinecap="round"
              style={{ filter: "blur(2px)" }}
            />
          );
        })}
      </svg>
    </div>
  );
};
