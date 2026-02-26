/**
 * RainOnGlass — Water droplets that appear and run down the screen surface.
 * 20-30 droplets at various sizes. Each droplet is a small circle that leaves
 * a thin trail as it slides down. New droplets appear based on deterministic
 * seeded timing. Energy drives droplet creation rate. Cool blue-white palette.
 * Cycle: 55s (1650 frames), 18s (540 frames) visible.
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

interface DropletData {
  /** X position (0-1) */
  x: number;
  /** Y start position (0-0.3) */
  yStart: number;
  /** Fall speed (px per frame) */
  fallSpeed: number;
  /** Horizontal wobble frequency */
  wobbleFreq: number;
  /** Horizontal wobble amplitude (px) */
  wobbleAmp: number;
  /** Wobble phase */
  wobblePhase: number;
  /** Radius (px) */
  radius: number;
  /** Trail length (number of past positions to draw) */
  trailLength: number;
  /** Spawn delay within the visible window (frames) */
  spawnDelay: number;
  /** Opacity multiplier */
  opacityMult: number;
  /** Fall cycle length */
  fallCycle: number;
}

const NUM_DROPLETS = 30;
const CYCLE = 1650;     // 55s
const DURATION = 540;   // 18s

function generateDroplets(seed: number): DropletData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_DROPLETS }, () => {
    const fallCycle = 120 + Math.floor(rng() * 180);
    return {
      x: rng(),
      yStart: rng() * 0.25,
      fallSpeed: 1.5 + rng() * 3.5,
      wobbleFreq: 0.02 + rng() * 0.04,
      wobbleAmp: 1.5 + rng() * 4,
      wobblePhase: rng() * Math.PI * 2,
      radius: 2 + rng() * 4,
      trailLength: 6 + Math.floor(rng() * 10),
      spawnDelay: Math.floor(rng() * 300),
      opacityMult: 0.4 + rng() * 0.6,
      fallCycle,
    };
  });
}

interface Props {
  frames: EnhancedFrameData[];
}

export const RainOnGlass: React.FC<Props> = ({ frames }) => {
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

  const droplets = React.useMemo(() => generateDroplets(88077), []);

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
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.5;

  if (masterOpacity < 0.01) return null;

  // Energy drives how many droplets are visible (more active during high energy)
  const visibleCount = Math.round(interpolate(energy, [0.05, 0.35], [12, NUM_DROPLETS], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  // Speed scale from energy
  const speedScale = interpolate(energy, [0.05, 0.35], [0.6, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: masterOpacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="rain-refract">
            <feGaussianBlur stdDeviation="0.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="rain-drop-grad">
            <stop offset="0%" stopColor="rgba(200, 220, 255, 0.8)" />
            <stop offset="40%" stopColor="rgba(180, 210, 250, 0.5)" />
            <stop offset="100%" stopColor="rgba(150, 190, 240, 0)" />
          </radialGradient>
        </defs>

        {droplets.slice(0, visibleCount).map((drop, di) => {
          // Check if this droplet has "spawned" within the visible window
          const localFrame = cycleFrame - drop.spawnDelay;
          if (localFrame < 0) return null;

          // Each droplet has its own fall cycle
          const fallFrame = (localFrame * speedScale) % drop.fallCycle;
          const fallProgress = fallFrame / drop.fallCycle;

          // Y position: top to bottom
          const baseY = drop.yStart * height + fallProgress * height * 1.1;
          if (baseY > height * 1.05) return null;

          // X position with slight wobble
          const baseX = drop.x * width;
          const wobbleX = Math.sin(fallFrame * drop.wobbleFreq + drop.wobblePhase) * drop.wobbleAmp;
          const px = baseX + wobbleX;

          // Droplet fades as it approaches bottom
          const verticalAlpha = interpolate(fallProgress, [0, 0.05, 0.8, 1], [0, 1, 0.7, 0.2], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const alpha = verticalAlpha * drop.opacityMult;
          if (alpha < 0.03) return null;

          // Trail: thin line behind the droplet
          const trailStartY = baseY - drop.trailLength * drop.fallSpeed * speedScale * 0.8;
          const trailEndY = baseY - drop.radius;

          // Slight highlight on the droplet (refraction effect)
          const highlightX = px - drop.radius * 0.3;
          const highlightY = baseY - drop.radius * 0.3;

          return (
            <g key={di}>
              {/* Trail */}
              {trailStartY < trailEndY && (
                <line
                  x1={px}
                  y1={trailStartY}
                  x2={px}
                  y2={trailEndY}
                  stroke={`rgba(180, 210, 245, ${alpha * 0.3})`}
                  strokeWidth={drop.radius * 0.35}
                  strokeLinecap="round"
                />
              )}
              {/* Droplet body */}
              <circle
                cx={px}
                cy={baseY}
                r={drop.radius}
                fill={`rgba(190, 215, 250, ${alpha * 0.35})`}
                stroke={`rgba(210, 230, 255, ${alpha * 0.5})`}
                strokeWidth={0.6}
                filter="url(#rain-refract)"
              />
              {/* Highlight */}
              <circle
                cx={highlightX}
                cy={highlightY}
                r={drop.radius * 0.35}
                fill={`rgba(255, 255, 255, ${alpha * 0.6})`}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
