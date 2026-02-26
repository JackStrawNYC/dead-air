/**
 * MushroomBloom — 3-5 psychedelic mushrooms growing from bottom of screen
 * during peak moments. Each mushroom has a stem and cap built from ellipses/paths.
 * Caps have spots/patterns. Colors: purple, red, gold, cyan -- very psychedelic.
 * Mushrooms grow (scale up from 0), caps expand and release "spore" particles upward.
 * Cycle: 40s, 12s visible, energy threshold > 0.2.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1200; // 40s at 30fps
const DURATION = 360; // 12s visible
const NUM_MUSHROOMS = 5;
const NUM_SPORES_PER_MUSHROOM = 8;

const PSYCHEDELIC_COLORS = [
  { cap: "#9B30FF", stem: "#7B2FBE", spots: "#FF00FF" }, // purple
  { cap: "#FF2400", stem: "#CC1D00", spots: "#FFD700" },  // red
  { cap: "#FFD700", stem: "#DAA520", spots: "#FF4500" },  // gold
  { cap: "#00E5FF", stem: "#00B8D4", spots: "#E040FB" },  // cyan
  { cap: "#FF1493", stem: "#C71585", spots: "#00FF7F" },  // hot pink
];

interface MushroomData {
  x: number;
  height: number;
  capWidth: number;
  capHeight: number;
  stemWidth: number;
  stemCurve: number;
  colorIdx: number;
  spotCount: number;
  spots: Array<{ angle: number; dist: number; radius: number }>;
  growDelay: number; // 0-1 stagger
}

interface SporeData {
  offsetX: number;
  driftX: number;
  speed: number;
  size: number;
  phase: number;
  hue: number;
}

interface MushroomGroup {
  mushrooms: MushroomData[];
  spores: SporeData[][];
}

function generateMushrooms(seed: number): MushroomGroup {
  const rng = seeded(seed);

  const mushrooms: MushroomData[] = Array.from({ length: NUM_MUSHROOMS }, (_, i) => {
    const spotCount = 3 + Math.floor(rng() * 5);
    const spots = Array.from({ length: spotCount }, () => ({
      angle: rng() * Math.PI * 2,
      dist: 0.2 + rng() * 0.5,
      radius: 2 + rng() * 5,
    }));

    return {
      x: 0.1 + (i / (NUM_MUSHROOMS - 1)) * 0.8 + (rng() - 0.5) * 0.06,
      height: 80 + rng() * 80,
      capWidth: 35 + rng() * 30,
      capHeight: 20 + rng() * 18,
      stemWidth: 8 + rng() * 8,
      stemCurve: (rng() - 0.5) * 20,
      colorIdx: Math.floor(rng() * PSYCHEDELIC_COLORS.length),
      spotCount,
      spots,
      growDelay: i * 0.12,
    };
  });

  const spores: SporeData[][] = mushrooms.map(() =>
    Array.from({ length: NUM_SPORES_PER_MUSHROOM }, () => ({
      offsetX: (rng() - 0.5) * 40,
      driftX: (rng() - 0.5) * 0.8,
      speed: 0.4 + rng() * 0.8,
      size: 1 + rng() * 2.5,
      phase: rng() * Math.PI * 2,
      hue: rng() * 360,
    })),
  );

  return { mushrooms, spores };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const MushroomBloom: React.FC<Props> = ({ frames }) => {
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

  const cycleIdx = Math.floor(frame / CYCLE);
  const group = React.useMemo(() => generateMushrooms(cycleIdx * 31 + 7777), [cycleIdx]);

  const cycleFrame = frame % CYCLE;

  // Energy gate: only visible when energy > 0.2
  if (cycleFrame >= DURATION) return null;
  if (energy < 0.1) return null; // soft gate below threshold

  const energyGate = interpolate(energy, [0.1, 0.2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * energyGate * 0.75;

  if (masterOpacity < 0.01) return null;

  const baseY = height - 10;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 8px rgba(155, 48, 255, 0.5)) drop-shadow(0 0 16px rgba(255, 0, 255, 0.3))`,
        }}
      >
        {group.mushrooms.map((m, mi) => {
          const delayedProgress = Math.max(0, progress - m.growDelay) / (1 - m.growDelay);
          const growScale = interpolate(delayedProgress, [0, 0.4], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.elastic(1)),
          });

          if (growScale < 0.01) return null;

          const colors = PSYCHEDELIC_COLORS[m.colorIdx];
          const x = m.x * width;
          const sway = Math.sin(frame * 0.015 + mi * 2.1) * 5 * growScale;

          // Cap expansion: starts growing after stem is halfway
          const capExpand = interpolate(delayedProgress, [0.2, 0.6], [0.3, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });

          // Stem height grows
          const stemH = m.height * growScale;
          const capW = m.capWidth * capExpand * growScale;
          const capH = m.capHeight * capExpand * growScale;

          // Color pulsing with energy
          const pulse = (Math.sin(frame * 0.04 + mi * 1.5) + 1) * 0.5;
          const glowIntensity = 0.6 + energy * 0.4 + pulse * 0.2;

          return (
            <g key={mi}>
              {/* Stem: curved path */}
              <path
                d={`M ${x + sway} ${baseY} Q ${x + m.stemCurve * growScale + sway} ${baseY - stemH * 0.5}, ${x + sway} ${baseY - stemH}`}
                stroke={colors.stem}
                strokeWidth={m.stemWidth * growScale}
                strokeLinecap="round"
                fill="none"
                opacity={glowIntensity}
              />

              {/* Cap: main ellipse */}
              <ellipse
                cx={x + sway}
                cy={baseY - stemH}
                rx={capW}
                ry={capH}
                fill={colors.cap}
                opacity={glowIntensity * 0.85}
              />

              {/* Cap underside (darker arc) */}
              <ellipse
                cx={x + sway}
                cy={baseY - stemH + capH * 0.3}
                rx={capW * 0.9}
                ry={capH * 0.3}
                fill={colors.stem}
                opacity={0.5 * growScale}
              />

              {/* Cap spots */}
              {m.spots.map((spot, si) => {
                const spotX = x + sway + Math.cos(spot.angle) * spot.dist * capW;
                const spotY = baseY - stemH + Math.sin(spot.angle) * spot.dist * capH * 0.6;
                return (
                  <circle
                    key={si}
                    cx={spotX}
                    cy={spotY}
                    r={spot.radius * capExpand * growScale}
                    fill={colors.spots}
                    opacity={0.6 + pulse * 0.3}
                  />
                );
              })}

              {/* Ring around stem */}
              <ellipse
                cx={x + sway}
                cy={baseY - stemH * 0.65}
                rx={m.stemWidth * 1.2 * growScale}
                ry={3 * growScale}
                fill={colors.cap}
                opacity={0.5}
              />

              {/* Glow under cap */}
              <ellipse
                cx={x + sway}
                cy={baseY - stemH}
                rx={capW * 1.3}
                ry={capH * 1.3}
                fill={colors.spots}
                opacity={0.1 + energy * 0.1}
                style={{ filter: "blur(8px)" }}
              />

              {/* Spores: float upward after cap expands */}
              {delayedProgress > 0.5 &&
                group.spores[mi].map((spore, si) => {
                  const sporeProgress = (delayedProgress - 0.5) * 2;
                  const sporeY = baseY - stemH - sporeProgress * 120 * spore.speed;
                  const sporeX =
                    x + sway + spore.offsetX + Math.sin(frame * 0.03 + spore.phase) * 15 * spore.driftX;
                  const sporeOpacity = interpolate(
                    sporeProgress,
                    [0, 0.1, 0.7, 1],
                    [0, 0.6, 0.4, 0],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                  );

                  if (sporeOpacity < 0.01) return null;

                  const sporeColor = `hsla(${spore.hue}, 80%, 70%, ${sporeOpacity})`;

                  return (
                    <circle
                      key={`spore-${si}`}
                      cx={sporeX}
                      cy={sporeY}
                      r={spore.size}
                      fill={sporeColor}
                      style={{ filter: "blur(1px)" }}
                    />
                  );
                })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
