/**
 * GeyserEruption — Water/steam geyser shooting upward from bottom center.
 * Eruption column built from 30-50 particles rising fast then slowing.
 * White/blue-white steam color. Splash pool at base with ripple rings.
 * Eruption intensity driven by energy — gentle bubbling when quiet, full eruption during peaks.
 * Cycle: 50s, 15s visible.
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

const CYCLE = 1500; // 50s at 30fps
const DURATION = 450; // 15s visible
const NUM_PARTICLES = 40;

interface ParticleData {
  xOffset: number;      // lateral spread from center (-1 to 1)
  speedBase: number;    // base rise speed
  sizeBase: number;     // base radius
  driftFreq: number;    // horizontal drift frequency
  driftAmp: number;     // horizontal drift amplitude
  phase: number;        // time offset
  opacity: number;      // base opacity
  isSteam: boolean;     // true = steam (larger, more transparent), false = water droplet
}

interface Props {
  frames: EnhancedFrameData[];
}

export const GeyserEruption: React.FC<Props> = ({ frames }) => {
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

  const particles = React.useMemo(() => {
    const rng = seeded(7777);
    const result: ParticleData[] = [];
    for (let i = 0; i < NUM_PARTICLES; i++) {
      result.push({
        xOffset: (rng() - 0.5) * 2,
        speedBase: 1.5 + rng() * 3.0,
        sizeBase: 3 + rng() * 8,
        driftFreq: 0.01 + rng() * 0.04,
        driftAmp: 5 + rng() * 20,
        phase: rng() * 200,
        opacity: 0.3 + rng() * 0.5,
        isSteam: rng() > 0.5,
      });
    }
    return result;
  }, []);

  const rippleSeeds = React.useMemo(() => {
    const rng = seeded(8888);
    return Array.from({ length: 5 }, () => ({
      delay: rng() * 0.6,
      maxRadius: 30 + rng() * 50,
      speed: 0.5 + rng() * 1.0,
    }));
  }, []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.2, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Eruption intensity: quiet = gentle bubbles, loud = full blast
  const intensity = interpolate(energy, [0.02, 0.15, 0.35], [0.1, 0.5, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const baseCx = width * 0.5;
  const baseCy = height * 0.92;
  const maxColumnHeight = height * 0.7 * intensity;
  const spreadWidth = 60 + intensity * 80;

  const glowStd = interpolate(energy, [0.02, 0.3], [3, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity, willChange: "opacity" }}
      >
        <defs>
          <filter id="geyser-glow">
            <feGaussianBlur stdDeviation={glowStd} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="geyser-pool-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#88CCFF" stopOpacity="0.3" />
            <stop offset="70%" stopColor="#4488CC" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#224466" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Splash pool at base */}
        <ellipse
          cx={baseCx}
          cy={baseCy + 10}
          rx={60 + intensity * 40}
          ry={15 + intensity * 8}
          fill="url(#geyser-pool-grad)"
        />

        {/* Ripple rings */}
        {rippleSeeds.map((ripple, ri) => {
          const rippleTime = ((cycleFrame * ripple.speed + ripple.delay * DURATION) % 90) / 90;
          const r = ripple.maxRadius * rippleTime * intensity;
          const rippleOp = (1 - rippleTime) * 0.4 * intensity;
          if (rippleOp < 0.01) return null;
          return (
            <ellipse
              key={`ripple-${ri}`}
              cx={baseCx}
              cy={baseCy + 10}
              rx={r}
              ry={r * 0.3}
              fill="none"
              stroke="#AAD4FF"
              strokeWidth={1.2}
              opacity={rippleOp}
            />
          );
        })}

        {/* Particle column */}
        {particles.map((p, pi) => {
          // Only show a subset based on intensity
          if (pi / NUM_PARTICLES > intensity + 0.2) return null;

          const t = ((cycleFrame + p.phase) % 120) / 120; // particle lifecycle
          // Rise fast then slow (deceleration curve)
          const riseProgress = 1 - Math.pow(1 - t, 0.5);
          const py = baseCy - riseProgress * maxColumnHeight;

          // Lateral spread increases with height
          const lateralSpread = p.xOffset * spreadWidth * riseProgress * 0.5;
          const drift = Math.sin((cycleFrame + p.phase) * p.driftFreq) * p.driftAmp * riseProgress;
          const px = baseCx + lateralSpread + drift;

          // Particles expand and fade as they rise
          const sizeScale = p.isSteam ? (1 + riseProgress * 2.5) : (1 + riseProgress * 0.8);
          const radius = p.sizeBase * sizeScale * (0.5 + intensity * 0.5);
          const fadeAlpha = (1 - riseProgress * 0.8) * p.opacity * intensity;

          if (fadeAlpha < 0.02) return null;

          const color = p.isSteam
            ? `rgba(200, 220, 255, ${fadeAlpha * 0.6})`
            : `rgba(230, 240, 255, ${fadeAlpha})`;

          return (
            <circle
              key={`particle-${pi}`}
              cx={px}
              cy={py}
              r={radius}
              fill={color}
              filter={p.isSteam ? "url(#geyser-glow)" : undefined}
            />
          );
        })}

        {/* Central glow column */}
        <rect
          x={baseCx - 8 - intensity * 12}
          y={baseCy - maxColumnHeight * 0.7}
          width={16 + intensity * 24}
          height={maxColumnHeight * 0.7}
          fill={`rgba(180, 210, 255, ${0.05 + intensity * 0.1})`}
          filter="url(#geyser-glow)"
          rx={8 + intensity * 12}
        />
      </svg>
    </div>
  );
};
