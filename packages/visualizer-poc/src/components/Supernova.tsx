/**
 * Supernova — Massive stellar explosion effect.
 * A bright central point expands outward in a burst of light. Expanding shell of
 * glowing debris (particle ring). Shock wave ripple circle expands beyond. Colors
 * shift from white-hot center through yellow/orange to red/purple at edges. Energy
 * drives expansion speed and brightness.
 * Cycle: 80s, 20s visible, energy > 0.2.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const VISIBLE_DURATION = 600; // 20s at 30fps
const CYCLE_GAP = 1800; // 60s gap (80s total - 20s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;
const NUM_DEBRIS = 24;
const NUM_SHOCK_RINGS = 3;

interface DebrisParticle {
  angle: number;
  speed: number;
  size: number;
  hueShift: number;
  startDelay: number; // 0-1
  trailLength: number;
}

function generateDebris(seed: number): DebrisParticle[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_DEBRIS }, () => ({
    angle: rng() * Math.PI * 2,
    speed: 0.3 + rng() * 0.7,
    size: 2 + rng() * 5,
    hueShift: rng() * 60 - 30, // shift around base hue
    startDelay: rng() * 0.15,
    trailLength: 10 + rng() * 30,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Supernova: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const debris = React.useMemo(() => generateDebris(50819770), []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleFrame = frame % CYCLE_TOTAL;

  // Only render during visible portion AND when energy > 0.2
  if (cycleFrame >= VISIBLE_DURATION) return null;
  if (energy <= 0.2) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const energyOpacity = interpolate(energy, [0.2, 0.4], [0.3, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * energyOpacity;

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.45;

  // Expansion phase: 0-0.4 is rapid expansion, 0.4-1.0 is slow expansion + fade
  const expansionSpeed = 1 + energy * 1.5;
  const expandProgress = Math.min(1, progress * expansionSpeed);

  // Core size: starts small, expands then contracts
  const coreRadius = interpolate(expandProgress, [0, 0.15, 0.5, 1], [2, 30, 20, 5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Core brightness
  const coreBrightness = interpolate(expandProgress, [0, 0.1, 0.4, 1], [1, 1, 0.7, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Shell radius
  const shellRadius = interpolate(expandProgress, [0, 0.1, 1], [5, 20, maxRadius], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Shell thickness
  const shellThickness = interpolate(expandProgress, [0.1, 0.5, 1], [8, 15, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Color shift: white -> yellow -> orange -> red -> purple
  const colorHue = interpolate(expandProgress, [0, 0.2, 0.5, 0.8, 1], [60, 45, 25, 0, 300], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          {/* Core glow */}
          <radialGradient id="supernova-core">
            <stop offset="0%" stopColor="white" stopOpacity={coreBrightness} />
            <stop offset="40%" stopColor={`hsl(${colorHue}, 100%, 80%)`} stopOpacity={coreBrightness * 0.8} />
            <stop offset="100%" stopColor={`hsl(${colorHue}, 100%, 50%)`} stopOpacity="0" />
          </radialGradient>

          {/* Shell gradient */}
          <radialGradient id="supernova-shell">
            <stop offset="70%" stopColor="transparent" stopOpacity="0" />
            <stop offset="85%" stopColor={`hsl(${colorHue + 10}, 90%, 60%)`} stopOpacity="0.6" />
            <stop offset="95%" stopColor={`hsl(${colorHue - 10}, 80%, 40%)`} stopOpacity="0.3" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>

          <filter id="supernova-glow">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="supernova-outer">
            <feGaussianBlur stdDeviation="16" />
          </filter>
        </defs>

        {/* Outer glow halo */}
        <circle
          cx={cx}
          cy={cy}
          r={shellRadius * 1.3}
          fill={`hsl(${colorHue}, 80%, 50%)`}
          opacity={0.1 * coreBrightness}
          filter="url(#supernova-outer)"
        />

        {/* Expanding shell ring */}
        <circle
          cx={cx}
          cy={cy}
          r={shellRadius}
          fill="none"
          stroke={`hsl(${colorHue + 10}, 90%, 60%)`}
          strokeWidth={shellThickness}
          opacity={interpolate(expandProgress, [0.05, 0.3, 0.8, 1], [0, 0.7, 0.4, 0.1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          filter="url(#supernova-glow)"
        />

        {/* Shock wave rings */}
        {Array.from({ length: NUM_SHOCK_RINGS }, (_, ri) => {
          const ringDelay = ri * 0.08;
          const ringProgress = Math.max(0, expandProgress - ringDelay);
          const ringRadius = interpolate(ringProgress, [0, 1], [shellRadius * 0.5, maxRadius * (1.2 + ri * 0.2)], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const ringOp = interpolate(ringProgress, [0, 0.1, 0.6, 1], [0, 0.3, 0.15, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <circle
              key={`shock-${ri}`}
              cx={cx}
              cy={cy}
              r={ringRadius}
              fill="none"
              stroke={`hsl(${colorHue + 30 + ri * 20}, 60%, 70%)`}
              strokeWidth={2 - ri * 0.4}
              opacity={ringOp}
            />
          );
        })}

        {/* Debris particles */}
        {debris.map((d, di) => {
          const dProgress = Math.max(0, expandProgress - d.startDelay);
          if (dProgress <= 0) return null;

          const dist = dProgress * d.speed * maxRadius;
          const px = cx + Math.cos(d.angle) * dist;
          const py = cy + Math.sin(d.angle) * dist;

          // Trail
          const trailDist = Math.max(0, dist - d.trailLength);
          const tx = cx + Math.cos(d.angle) * trailDist;
          const ty = cy + Math.sin(d.angle) * trailDist;

          const debrisHue = colorHue + d.hueShift;
          const debrisOp = interpolate(dProgress, [0, 0.1, 0.7, 1], [0, 0.8, 0.5, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <g key={`d-${di}`} opacity={debrisOp}>
              {/* Trail line */}
              <line
                x1={tx}
                y1={ty}
                x2={px}
                y2={py}
                stroke={`hsl(${debrisHue}, 80%, 60%)`}
                strokeWidth={d.size * 0.4}
                strokeLinecap="round"
                opacity={0.5}
              />
              {/* Particle head */}
              <circle
                cx={px}
                cy={py}
                r={d.size * (1 - dProgress * 0.5)}
                fill={`hsl(${debrisHue}, 90%, 70%)`}
                filter="url(#supernova-glow)"
              />
            </g>
          );
        })}

        {/* Central core */}
        <circle
          cx={cx}
          cy={cy}
          r={coreRadius * 2}
          fill="url(#supernova-core)"
          filter="url(#supernova-glow)"
        />
        <circle
          cx={cx}
          cy={cy}
          r={coreRadius}
          fill="white"
          opacity={coreBrightness * 0.9}
        />
      </svg>
    </div>
  );
};
