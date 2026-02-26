/**
 * Fireflies -- 30-50 tiny points of bioluminescent light blinking in and out.
 * Each firefly has its own blink cycle (2-4 seconds on, 1-2 seconds off).
 * Warm yellow-green glow.  Fireflies drift slowly in random directions.
 * During quiet passages, more fireflies appear.  Energy drives blink
 * synchronisation -- at high energy, fireflies start blinking together.
 * Always visible, very subtle.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

const NUM_FIREFLIES = 45;

interface FireflyData {
  x: number;           // start 0-1
  y: number;           // start 0-1
  driftX: number;      // px/frame
  driftY: number;
  sineFreqX: number;
  sineFreqY: number;
  ampX: number;
  ampY: number;
  /** Blink on-duration in frames */
  blinkOn: number;
  /** Blink off-duration in frames */
  blinkOff: number;
  /** Blink phase offset (frames) */
  blinkPhase: number;
  radius: number;
  hue: number;
  brightness: number;
}

function generateFireflies(seed: number): FireflyData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_FIREFLIES }, () => ({
    x: rng(),
    y: rng(),
    driftX: (rng() - 0.5) * 0.15,
    driftY: (rng() - 0.5) * 0.12,
    sineFreqX: 0.004 + rng() * 0.012,
    sineFreqY: 0.003 + rng() * 0.01,
    ampX: 15 + rng() * 50,
    ampY: 12 + rng() * 40,
    blinkOn: 60 + Math.floor(rng() * 60),    // 2-4s
    blinkOff: 30 + Math.floor(rng() * 30),   // 1-2s
    blinkPhase: Math.floor(rng() * 200),
    radius: 2 + rng() * 3,
    hue: 50 + rng() * 55,   // 50-105: warm yellow through yellow-green
    brightness: 0.5 + rng() * 0.5,
  }));
}

const STAGGER_START = 120; // 4s fade in

interface Props {
  frames: EnhancedFrameData[];
}

export const Fireflies: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  /* ----- energy ----- */
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  /* memos BEFORE conditional returns */
  const fireflies = React.useMemo(() => generateFireflies(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  /* inverse energy: more visible during quiet passages */
  const quietness = 1 - interpolate(energy, [0.03, 0.22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* master fade in */
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  /* overall opacity: always somewhat visible, more during quiet */
  const masterOpacity = interpolate(quietness, [0, 1], [0.15, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * masterFade;

  if (masterOpacity < 0.01) return null;

  /* energy-driven synchronisation: at high energy, all fireflies
     converge toward a common blink cycle */
  const syncStrength = interpolate(energy, [0.1, 0.35], [0, 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const globalBlink = (Math.sin(frame * 0.08) + 1) * 0.5; // 0-1 shared blink

  /* quietness drives how many fireflies are active */
  const activeCount = Math.floor(
    interpolate(quietness, [0, 1], [15, NUM_FIREFLIES], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {fireflies.slice(0, activeCount).map((fly, i) => {
          /* staggered entrance */
          const flyFade = interpolate(
            frame,
            [STAGGER_START + i * 6, STAGGER_START + i * 6 + 60],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          );
          if (flyFade < 0.01) return null;

          /* position: gentle drift + sine wander */
          const rawX = fly.x * width + Math.sin(frame * fly.sineFreqX + fly.blinkPhase) * fly.ampX + frame * fly.driftX;
          const rawY = fly.y * height + Math.cos(frame * fly.sineFreqY + fly.blinkPhase * 1.3) * fly.ampY + frame * fly.driftY;
          const wx = ((rawX % width) + width) % width;
          const wy = ((rawY % height) + height) % height;

          /* per-firefly blink cycle */
          const blinkCycle = fly.blinkOn + fly.blinkOff;
          const blinkFrame = ((frame + fly.blinkPhase) % blinkCycle);
          let individualBlink: number;
          if (blinkFrame < fly.blinkOn) {
            /* on phase: smooth in/out */
            const onProgress = blinkFrame / fly.blinkOn;
            individualBlink = Math.sin(onProgress * Math.PI); // 0->1->0
          } else {
            individualBlink = 0;
          }

          /* blend individual and synchronised blink */
          const blinkValue = individualBlink * (1 - syncStrength) + globalBlink * syncStrength;

          const alpha = blinkValue * fly.brightness * flyFade;
          if (alpha < 0.02) return null;

          const r = fly.radius * (0.7 + blinkValue * 0.6);
          const hue = fly.hue;
          const coreColor = `hsla(${hue}, 90%, 75%, ${alpha})`;
          const glowColor = `hsla(${hue}, 100%, 60%, ${alpha * 0.7})`;
          const outerGlow = `hsla(${hue}, 100%, 50%, ${alpha * 0.3})`;

          return (
            <g key={i}>
              <circle cx={wx} cy={wy} r={r * 4} fill={outerGlow} style={{ filter: `blur(${4 + blinkValue * 3}px)` }} />
              <circle cx={wx} cy={wy} r={r * 2} fill={glowColor} style={{ filter: `blur(${2 + blinkValue * 2}px)` }} />
              <circle cx={wx} cy={wy} r={r} fill={coreColor} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
