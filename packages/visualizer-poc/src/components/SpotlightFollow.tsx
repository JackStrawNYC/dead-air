/**
 * SpotlightFollow — Single followspot beam that tracks a wandering point.
 * The beam originates from upper-left or upper-right (alternates each cycle)
 * and illuminates a circular pool that drifts slowly across the stage area.
 * Beam width (cone angle) varies with energy — tight during quiet, wide during
 * loud. The pool has a soft feathered edge. Color is warm white/amber.
 * Appears every 35s for 15s when energy > 0.05.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

// Timing: appears every 35s (1050 frames) for 15s (450 frames)
const CYCLE_PERIOD = 1050;
const SHOW_DURATION = 450;
const FADE_FRAMES = 40;

interface Props {
  frames: EnhancedFrameData[];
}

export const SpotlightFollow: React.FC<Props> = ({ frames }) => {
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

  // All useMemo calls before conditionals (none needed here, but pattern compliance)
  const cycleIndex = React.useMemo(() => Math.floor(frame / CYCLE_PERIOD), [frame]);

  // Cycle timing
  const cyclePos = frame % CYCLE_PERIOD;
  const inShowWindow = cyclePos < SHOW_DURATION;

  // Energy gate
  const energyGate = energy > 0.05 ? 1 : 0;

  // Fade envelope
  const showFadeIn = interpolate(cyclePos, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const showFadeOut = interpolate(
    cyclePos,
    [SHOW_DURATION - FADE_FRAMES, SHOW_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) },
  );
  const showEnvelope = Math.min(showFadeIn, showFadeOut);

  const masterOpacity = inShowWindow ? showEnvelope * energyGate : 0;

  if (masterOpacity < 0.01) return null;

  // Origin alternates sides each cycle
  const fromLeft = cycleIndex % 2 === 0;
  const originX = fromLeft ? width * 0.05 : width * 0.95;
  const originY = -20;

  // Target point wanders with slow sine motion in the lower 2/3 of frame
  const targetX = width * 0.3 + Math.sin(frame * 0.008 + 1.2) * width * 0.2
    + Math.sin(frame * 0.013 + 3.7) * width * 0.1;
  const targetY = height * 0.4 + Math.sin(frame * 0.006 + 0.5) * height * 0.15
    + Math.sin(frame * 0.011 + 2.1) * height * 0.08;

  // Beam width varies with energy: tight when quiet, wide when loud
  const beamRadius = interpolate(energy, [0.05, 0.35], [40, 120], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Beam color: warm white/amber
  const warmth = interpolate(energy, [0.05, 0.3], [45, 35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const beamColor = `hsla(${warmth}, 80%, 85%, 0.35)`;
  const poolColor = `hsla(${warmth}, 75%, 90%, 0.25)`;

  // Calculate beam cone points
  const dx = targetX - originX;
  const dy = targetY - originY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / dist; // normal vector
  const ny = dx / dist;

  // Cone sides at the target
  const leftConeX = targetX + nx * beamRadius;
  const leftConeY = targetY + ny * beamRadius;
  const rightConeX = targetX - nx * beamRadius;
  const rightConeY = targetY - ny * beamRadius;

  // Flicker
  const flicker = 0.85 + Math.sin(frame * 0.12 + 0.7) * 0.1 + Math.sin(frame * 0.23 + 2.3) * 0.05;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity * flicker }}>
        <defs>
          <radialGradient id="spot-pool" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`hsla(${warmth}, 80%, 95%, 0.4)`} />
            <stop offset="50%" stopColor={`hsla(${warmth}, 75%, 85%, 0.15)`} />
            <stop offset="100%" stopColor={`hsla(${warmth}, 70%, 80%, 0)`} />
          </radialGradient>
          <linearGradient id="spot-beam" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={`hsla(${warmth}, 80%, 90%, 0.5)`} />
            <stop offset="100%" stopColor={`hsla(${warmth}, 75%, 85%, 0.05)`} />
          </linearGradient>
        </defs>

        {/* Beam cone */}
        <polygon
          points={`${originX},${originY} ${leftConeX},${leftConeY} ${rightConeX},${rightConeY}`}
          fill={beamColor}
          style={{ mixBlendMode: "screen", filter: `blur(8px)` }}
        />

        {/* Pool of light at target */}
        <ellipse
          cx={targetX}
          cy={targetY}
          rx={beamRadius * 1.3}
          ry={beamRadius * 0.8}
          fill={poolColor}
          style={{ mixBlendMode: "screen", filter: `blur(15px)` }}
        />

        {/* Bright center spot */}
        <circle
          cx={targetX}
          cy={targetY}
          r={beamRadius * 0.3}
          fill={`hsla(${warmth}, 85%, 95%, 0.2)`}
          style={{ mixBlendMode: "screen", filter: `blur(6px)` }}
        />

        {/* Source glow */}
        <circle
          cx={originX}
          cy={originY + 15}
          r={12}
          fill={`hsla(${warmth}, 80%, 90%, 0.7)`}
          style={{ filter: `blur(5px)` }}
        />
      </svg>
    </div>
  );
};
