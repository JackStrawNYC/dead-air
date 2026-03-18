/**
 * RainDrops — Layer 1 (Atmospheric)
 * Falling raindrops with expanding ripple circles on impact.
 * Drop density inversely scales with energy. Rain angle shifts with uMelodicDirection.
 * Tier B | Tags: organic, contemplative | dutyCycle: 100 | energyBand: low
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

const NUM_DROPS = 60;
const STAGGER_START = 90;

interface DropData {
  x: number;
  speed: number;
  phase: number;
  length: number;
  opacity: number;
}

function generateDrops(seed: number): DropData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_DROPS }, () => ({
    x: rng(),
    speed: 8 + rng() * 12,
    phase: rng() * 500,
    length: 15 + rng() * 25,
    opacity: 0.15 + rng() * 0.25,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const RainDrops: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const f = frames[idx];
  const energy = f.rms;

  const drops = React.useMemo(() => generateDrops((ctx?.showSeed ?? 19770508) + 300), [ctx?.showSeed]);

  // More drops in quiet passages
  const quietness = 1 - interpolate(energy, [0.03, 0.25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const masterOpacity = interpolate(quietness, [0, 1], [0.05, 0.35]) * masterFade;
  if (masterOpacity < 0.01) return null;

  // Rain angle from melodic direction
  const melodicDir = f.melodicDirection ?? 0;
  const windAngle = melodicDir * 8; // degrees

  const activeCount = Math.floor(interpolate(quietness, [0, 1], [10, NUM_DROPS], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {drops.slice(0, activeCount).map((drop, i) => {
          const x = drop.x * width;
          const rawY = ((frame + drop.phase) * drop.speed) % (height + 100) - 50;
          const dx = Math.tan((windAngle * Math.PI) / 180) * drop.length;

          return (
            <line
              key={i}
              x1={x}
              y1={rawY}
              x2={x + dx}
              y2={rawY + drop.length}
              stroke={`hsla(210, 30%, 70%, ${drop.opacity})`}
              strokeWidth={1}
              strokeLinecap="round"
            />
          );
        })}
        {/* Ripple circles at bottom */}
        {drops.slice(0, Math.floor(activeCount * 0.3)).map((drop, i) => {
          const cycle = (frame + drop.phase) * drop.speed;
          const impactProgress = (cycle % (height + 100)) / (height + 100);
          if (impactProgress < 0.85) return null;
          const rippleAge = (impactProgress - 0.85) / 0.15;
          const rippleR = rippleAge * 20;
          const rippleOp = (1 - rippleAge) * 0.3;
          return (
            <circle
              key={`r${i}`}
              cx={drop.x * width}
              cy={height - 20}
              r={rippleR}
              fill="none"
              stroke={`hsla(210, 30%, 70%, ${rippleOp})`}
              strokeWidth={0.5}
            />
          );
        })}
      </svg>
    </div>
  );
};
