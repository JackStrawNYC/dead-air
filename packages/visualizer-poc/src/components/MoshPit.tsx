/**
 * MoshPit — Abstract crowd movement visualization in the lower portion of frame.
 * A field of circles (abstract heads) that jostle and collide. At low energy,
 * they drift gently. At high energy, displacement increases dramatically —
 * circles move faster, overlap, and bounce. Some circles briefly fly upward
 * (crowd surfers). Color: dark silhouettes with neon edge highlights.
 * Appears every 40s (1200 frames) for 16s (480 frames) when energy > 0.12.
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

interface MoshFigure {
  baseX: number;
  baseY: number;
  radius: number;
  moveFreqX: number;
  moveFreqY: number;
  movePhaseX: number;
  movePhaseY: number;
  glowHue: number;
  surferThreshold: number;
  surferFreq: number;
  surferPhase: number;
}

const NUM_FIGURES = 30;

function generateFigures(seed: number): MoshFigure[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_FIGURES }, () => ({
    baseX: 0.03 + rng() * 0.94,
    baseY: 0.72 + rng() * 0.25,
    radius: 6 + rng() * 6,
    moveFreqX: 0.03 + rng() * 0.06,
    moveFreqY: 0.025 + rng() * 0.05,
    movePhaseX: rng() * Math.PI * 2,
    movePhaseY: rng() * Math.PI * 2,
    glowHue: rng() * 360,
    surferThreshold: 0.85 + rng() * 0.15, // only top figures "surf"
    surferFreq: 0.015 + rng() * 0.02,
    surferPhase: rng() * Math.PI * 2,
  }));
}

// Timing: appears every 40s (1200 frames) for 16s (480 frames)
const CYCLE_PERIOD = 1200;
const SHOW_DURATION = 480;
const FADE_FRAMES = 40;

interface Props {
  frames: EnhancedFrameData[];
}

export const MoshPit: React.FC<Props> = ({ frames }) => {
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

  const figures = React.useMemo(() => generateFigures(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Cycle timing
  const cyclePos = frame % CYCLE_PERIOD;
  const inShowWindow = cyclePos < SHOW_DURATION;

  // Energy gate
  const energyGate = energy > 0.12 ? 1 : 0;

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

  // Chaos level: energy drives displacement magnitude
  const chaosLevel = interpolate(energy, [0.12, 0.45], [1, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Speed multiplier for movement
  const speedMult = interpolate(energy, [0.12, 0.4], [0.5, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow intensity
  const glowIntensity = interpolate(energy, [0.12, 0.4], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Surfer threshold: high energy = more surfers
  const surferActivation = interpolate(energy, [0.2, 0.4], [1.0, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity * 0.75 }}>
        {figures.map((fig, i) => {
          // Displacement from energy-scaled movement
          const dx = Math.sin(frame * fig.moveFreqX * speedMult + fig.movePhaseX) * chaosLevel * 5
            + Math.sin(frame * fig.moveFreqX * speedMult * 1.7 + fig.movePhaseX * 0.6) * chaosLevel * 3;
          const dy = Math.sin(frame * fig.moveFreqY * speedMult + fig.movePhaseY) * chaosLevel * 3
            + Math.sin(frame * fig.moveFreqY * speedMult * 2.1 + fig.movePhaseY * 1.3) * chaosLevel * 2;

          // Surfer lift (some figures pop up during high energy)
          const isSurfer = fig.surferThreshold < surferActivation ? 0 : 1;
          const surferLift = isSurfer
            ? Math.max(0, Math.sin(frame * fig.surferFreq + fig.surferPhase)) * chaosLevel * 12
            : 0;

          const px = fig.baseX * width + dx;
          const py = fig.baseY * height + dy - surferLift;

          const glowColor = `hsla(${fig.glowHue}, 80%, 60%, 0.5)`;

          return (
            <g key={i}>
              {/* Head */}
              <circle
                cx={px}
                cy={py}
                r={fig.radius}
                fill="rgba(10, 10, 15, 0.8)"
                stroke={glowColor}
                strokeWidth={1}
                style={{ filter: `drop-shadow(0 0 ${glowIntensity}px ${glowColor})` }}
              />
              {/* Body (small trapezoid below head) */}
              <path
                d={`M ${px - fig.radius * 0.8} ${py + fig.radius}
                    L ${px + fig.radius * 0.8} ${py + fig.radius}
                    L ${px + fig.radius * 1.1} ${py + fig.radius * 3}
                    L ${px - fig.radius * 1.1} ${py + fig.radius * 3} Z`}
                fill="rgba(10, 10, 15, 0.7)"
                stroke={glowColor}
                strokeWidth={0.5}
              />
              {/* Raised arms for surfers */}
              {isSurfer > 0 && surferLift > 5 && (
                <>
                  <line
                    x1={px - fig.radius * 0.5}
                    y1={py - fig.radius * 0.5}
                    x2={px - fig.radius * 1.8}
                    y2={py - fig.radius * 2.5}
                    stroke={glowColor}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                  <line
                    x1={px + fig.radius * 0.5}
                    y1={py - fig.radius * 0.5}
                    x2={px + fig.radius * 1.8}
                    y2={py - fig.radius * 2.5}
                    stroke={glowColor}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
