/**
 * LensFlare — Anamorphic lens flare effect: a horizontal streak with hexagonal
 * bokeh shapes. Flare drifts across screen slowly. Color: warm amber core with
 * blue/purple fringing. Brightness tied to energy. Multiple smaller ghost flares
 * follow the main one.
 * Cycle: 45s (1350 frames), 12s (360 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface GhostFlare {
  /** Offset ratio from main flare along drift axis (negative = behind, positive = ahead) */
  offsetRatio: number;
  /** Size multiplier relative to main */
  sizeMult: number;
  /** Opacity multiplier */
  opacityMult: number;
  /** Hue shift from main */
  hueShift: number;
  /** Whether this ghost is a hexagonal bokeh shape */
  isHex: boolean;
}

const NUM_GHOSTS = 6;

function generateGhosts(seed: number): GhostFlare[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_GHOSTS }, () => ({
    offsetRatio: (rng() - 0.4) * 1.2,
    sizeMult: 0.2 + rng() * 0.5,
    opacityMult: 0.15 + rng() * 0.35,
    hueShift: -60 + rng() * 120,
    isHex: rng() > 0.4,
  }));
}

function hexagonPath(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }
  return points.join(" ") + " Z";
}

const CYCLE = 1350;     // 45s
const DURATION = 360;   // 12s

interface Props {
  frames: EnhancedFrameData[];
}

export const LensFlare: React.FC<Props> = ({ frames }) => {
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

  const ghosts = React.useMemo(() => generateGhosts(42077), []);

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
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.55;

  if (masterOpacity < 0.01) return null;

  // Brightness tied to energy
  const brightnessMult = interpolate(energy, [0.05, 0.35], [0.4, 1.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Main flare drifts slowly across screen
  const driftX = interpolate(progress, [0, 1], [width * 0.15, width * 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const driftY = height * 0.4 + Math.sin(frame * 0.005) * height * 0.08;

  // Horizontal streak length scales with energy
  const streakHalfWidth = (width * 0.25 + energy * width * 0.35) * brightnessMult;
  const streakHeight = 2 + energy * 4;

  // Core hue: warm amber
  const coreHue = 38;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: masterOpacity, pointerEvents: "none" }}
      >
        <defs>
          <linearGradient id="flare-streak" x1="0" y1="0.5" x2="1" y2="0.5">
            <stop offset="0%" stopColor={`hsl(${coreHue}, 100%, 75%)`} stopOpacity="0" />
            <stop offset="30%" stopColor={`hsl(${coreHue}, 100%, 85%)`} stopOpacity={0.4 * brightnessMult} />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity={0.8 * brightnessMult} />
            <stop offset="70%" stopColor={`hsl(${coreHue}, 100%, 85%)`} stopOpacity={0.4 * brightnessMult} />
            <stop offset="100%" stopColor={`hsl(${coreHue}, 100%, 75%)`} stopOpacity="0" />
          </linearGradient>
          <radialGradient id="flare-core">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.9 * brightnessMult} />
            <stop offset="30%" stopColor={`hsl(${coreHue}, 100%, 80%)`} stopOpacity={0.5 * brightnessMult} />
            <stop offset="100%" stopColor={`hsl(${coreHue}, 100%, 60%)`} stopOpacity="0" />
          </radialGradient>
          <filter id="flare-blur">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="flare-soft">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Main horizontal streak */}
        <rect
          x={driftX - streakHalfWidth}
          y={driftY - streakHeight / 2}
          width={streakHalfWidth * 2}
          height={streakHeight}
          fill="url(#flare-streak)"
          filter="url(#flare-soft)"
        />

        {/* Secondary wider soft streak */}
        <rect
          x={driftX - streakHalfWidth * 1.3}
          y={driftY - streakHeight * 2}
          width={streakHalfWidth * 2.6}
          height={streakHeight * 4}
          fill="url(#flare-streak)"
          opacity={0.25}
          filter="url(#flare-soft)"
        />

        {/* Core bright spot */}
        <circle
          cx={driftX}
          cy={driftY}
          r={12 + energy * 15}
          fill="url(#flare-core)"
          filter="url(#flare-blur)"
        />

        {/* Ghost flares */}
        {ghosts.map((ghost, gi) => {
          const ghostX = driftX + ghost.offsetRatio * width * 0.3;
          const ghostY = driftY + ghost.offsetRatio * height * 0.08;
          const ghostR = (8 + energy * 12) * ghost.sizeMult;
          const ghostHue = coreHue + ghost.hueShift;
          const ghostAlpha = ghost.opacityMult * brightnessMult;

          if (ghost.isHex) {
            return (
              <path
                key={gi}
                d={hexagonPath(ghostX, ghostY, ghostR)}
                fill="none"
                stroke={`hsla(${ghostHue}, 70%, 70%, ${ghostAlpha * 0.6})`}
                strokeWidth={1.5}
                filter="url(#flare-blur)"
              />
            );
          }

          return (
            <circle
              key={gi}
              cx={ghostX}
              cy={ghostY}
              r={ghostR}
              fill={`hsla(${ghostHue}, 80%, 75%, ${ghostAlpha * 0.3})`}
              filter="url(#flare-blur)"
            />
          );
        })}
      </svg>
    </div>
  );
};
