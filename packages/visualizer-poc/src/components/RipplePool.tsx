/**
 * RipplePool — Water ripple rings expanding from center.
 * Concentric circles expanding outward continuously. New ring spawns every
 * 8-12 frames (faster when energy is high). Rings fade as they expand.
 * Ring stroke color shifts through blues/cyans. Ring count and expansion
 * speed driven by energy. Always visible at 15-35% opacity. Meditative
 * water-surface effect.
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

interface RippleData {
  /** Frame when this ripple was "born" */
  birthFrame: number;
  /** Hue (blues/cyans: 180-220) */
  hue: number;
  /** Max radius as fraction of screen diagonal */
  maxRadiusFraction: number;
  /** Stroke width */
  strokeWidth: number;
  /** Lifetime in frames */
  lifetime: number;
  /** Center offset X (fraction of width, small) */
  offsetX: number;
  /** Center offset Y (fraction of height, small) */
  offsetY: number;
}

// Pre-generate a large pool of ripples deterministically
const MAX_RIPPLES = 600;

function generateRippleSchedule(seed: number): RippleData[] {
  const rng = seeded(seed);
  const ripples: RippleData[] = [];
  let currentFrame = 30; // first ripple at 1s

  for (let i = 0; i < MAX_RIPPLES; i++) {
    ripples.push({
      birthFrame: currentFrame,
      hue: 180 + rng() * 40, // blue-cyan range
      maxRadiusFraction: 0.5 + rng() * 0.4,
      strokeWidth: 1 + rng() * 2,
      lifetime: 90 + Math.floor(rng() * 60), // 90-150 frames
      offsetX: (rng() - 0.5) * 0.08,
      offsetY: (rng() - 0.5) * 0.06,
    });
    // Base interval between ripples: 8-12 frames (will be modulated by energy)
    currentFrame += 8 + Math.floor(rng() * 5);
  }

  return ripples;
}

// Stagger: gentle fade in
const STAGGER_START = 60;

interface Props {
  frames: EnhancedFrameData[];
}

export const RipplePool: React.FC<Props> = ({ frames }) => {
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
  const energy = eCount > 0 ? eSum / eCount : 0;

  const rippleSchedule = React.useMemo(() => generateRippleSchedule(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Overall opacity: 15-35% depending on energy
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.15, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = baseOpacity * masterFade;

  if (masterOpacity < 0.01) return null;

  // Expansion speed: faster when energy is high
  const expansionMult = interpolate(energy, [0.03, 0.3], [0.7, 1.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  // Find active ripples: born before current frame, still within lifetime
  const activeRipples = rippleSchedule.filter(
    (r) => frame >= r.birthFrame && frame < r.birthFrame + r.lifetime,
  );

  if (activeRipples.length === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {activeRipples.map((ripple, i) => {
          const age = (frame - ripple.birthFrame) * expansionMult;
          const lifeProgress = age / (ripple.lifetime * expansionMult);

          // Radius expands from 0 to max
          const radius = lifeProgress * ripple.maxRadiusFraction * maxR;

          // Alpha fades as ripple expands
          const alpha = interpolate(lifeProgress, [0, 0.1, 0.7, 1], [0, 0.8, 0.3, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          if (alpha < 0.02 || radius < 1) return null;

          // Stroke thins as it expands
          const sw = ripple.strokeWidth * (1 - lifeProgress * 0.6);

          const color = `hsla(${ripple.hue}, 80%, 65%, ${alpha})`;
          const glowColor = `hsla(${ripple.hue}, 100%, 75%, ${alpha * 0.3})`;

          const ringCx = cx + ripple.offsetX * width;
          const ringCy = cy + ripple.offsetY * height;

          return (
            <g key={`${ripple.birthFrame}-${i}`}>
              {/* Glow ring */}
              <circle
                cx={ringCx}
                cy={ringCy}
                r={radius}
                fill="none"
                stroke={glowColor}
                strokeWidth={sw * 3}
                style={{ filter: `blur(${3}px)` }}
              />
              {/* Core ring */}
              <circle
                cx={ringCx}
                cy={ringCy}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={sw}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
