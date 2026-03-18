/**
 * TidalPool — Layer 5 (Nature)
 * Animated tidal pool with silhouette sea creatures.
 * Water surface reflections shimmer.
 * Tier B | Tags: organic, aquatic | dutyCycle: 50 | energyBand: mid
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

const CYCLE_FRAMES = 600;
const ON_FRAMES = 300;
const FADE_FRAMES = 45;
const STAGGER_START = 180;

const NUM_CREATURES = 6;

interface CreatureData {
  x: number;
  y: number;
  size: number;
  speed: number;
  phase: number;
  type: number; // 0=starfish, 1=jellyfish, 2=seahorse
}

function generateCreatures(seed: number): CreatureData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_CREATURES }, () => ({
    x: 0.1 + rng() * 0.8,
    y: 0.5 + rng() * 0.4,
    size: 20 + rng() * 30,
    speed: 0.3 + rng() * 0.7,
    phase: rng() * 1000,
    type: Math.floor(rng() * 3),
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const TidalPool: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const energy = frames[idx].rms;
  const sub = frames[idx].sub;

  const creatures = React.useMemo(() => generateCreatures((ctx?.showSeed ?? 19770508) + 500), [ctx?.showSeed]);

  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Duty cycle: 50%
  const delayedFrame = frame - STAGGER_START;
  if (delayedFrame < 0) return null;
  const cycleFrame = delayedFrame % CYCLE_FRAMES;
  if (cycleFrame >= ON_FRAMES) return null;

  const fadeIn = interpolate(cycleFrame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cycleFrame, [ON_FRAMES - FADE_FRAMES, ON_FRAMES], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic),
  });

  const masterOpacity = 0.12 * masterFade * Math.min(fadeIn, fadeOut);
  if (masterOpacity < 0.005) return null;

  // Water shimmer
  const shimmerPhase = Math.sin(frame * 0.04) * 0.3 + Math.sin(frame * 0.07) * 0.2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, mixBlendMode: "screen" }}>
        {/* Water caustic lines */}
        {Array.from({ length: 8 }, (_, i) => {
          const y = height * (0.4 + i * 0.07);
          const waveX = Math.sin(frame * 0.02 + i * 0.5 + shimmerPhase) * 30;
          return (
            <path
              key={`w${i}`}
              d={`M ${-20 + waveX} ${y} Q ${width * 0.25 + waveX * 1.5} ${y + Math.sin(frame * 0.03 + i) * 8} ${width * 0.5 + waveX} ${y} T ${width + 20 + waveX} ${y}`}
              fill="none"
              stroke={`hsla(190, 60%, 70%, ${0.3 - i * 0.03})`}
              strokeWidth={0.5}
            />
          );
        })}
        {/* Sea creatures as simple silhouettes */}
        {creatures.map((c, i) => {
          const cx = c.x * width + Math.sin((frame + c.phase) * 0.01 * c.speed) * 40;
          const cy = c.y * height + Math.cos((frame + c.phase) * 0.008 * c.speed) * 15;
          const pulse = 1 + Math.sin(frame * 0.05 + c.phase) * 0.1 * sub;
          const s = c.size * pulse;

          if (c.type === 0) {
            // Starfish — 5 arms
            const points = Array.from({ length: 10 }, (_, j) => {
              const angle = (j * Math.PI * 2) / 10 - Math.PI / 2;
              const r = j % 2 === 0 ? s : s * 0.4;
              return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
            }).join(" ");
            return <polygon key={i} points={points} fill="hsla(30, 50%, 60%, 0.5)" />;
          }
          if (c.type === 1) {
            // Jellyfish — dome + tendrils
            return (
              <g key={i}>
                <ellipse cx={cx} cy={cy} rx={s * 0.6} ry={s * 0.4} fill="hsla(280, 40%, 70%, 0.4)" />
                {[0.3, 0.5, 0.7].map((offset, j) => (
                  <line
                    key={j}
                    x1={cx - s * 0.4 + offset * s * 0.8}
                    y1={cy + s * 0.3}
                    x2={cx - s * 0.4 + offset * s * 0.8 + Math.sin(frame * 0.05 + j) * 5}
                    y2={cy + s * 0.8}
                    stroke="hsla(280, 40%, 70%, 0.3)"
                    strokeWidth={1}
                  />
                ))}
              </g>
            );
          }
          // Seahorse — simplified curve
          return (
            <ellipse key={i} cx={cx} cy={cy} rx={s * 0.3} ry={s * 0.5} fill="hsla(150, 40%, 60%, 0.4)"
              transform={`rotate(${Math.sin(frame * 0.02 + c.phase) * 15}, ${cx}, ${cy})`}
            />
          );
        })}
      </svg>
    </div>
  );
};
