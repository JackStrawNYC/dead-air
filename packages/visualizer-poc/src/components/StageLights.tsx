/**
 * StageLights — Par can stage lights mounted on a rig across the top of frame.
 * 6-10 par cans in a row, each casting a cone of colored light downward.
 * Colors shift with chroma data (pitch class distribution). Intensity scales
 * with energy. Beams have soft gaussian edges and overlap to create color mixing.
 * Appears every 55s for 20s when energy > 0.08.
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

interface ParCanData {
  /** x position as fraction of width */
  x: number;
  /** Base hue offset (0-360) */
  baseHue: number;
  /** Cone spread angle (degrees) */
  coneSpread: number;
  /** Flicker frequency */
  flickerFreq: number;
  /** Flicker phase */
  flickerPhase: number;
  /** Intensity multiplier */
  intensityMult: number;
  /** Chroma index (0-11) this par responds to most */
  chromaIdx: number;
}

const NUM_PARS = 8;

function generatePars(seed: number): ParCanData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_PARS }, (_, i) => ({
    x: 0.08 + (i / (NUM_PARS - 1)) * 0.84,
    baseHue: rng() * 360,
    coneSpread: 18 + rng() * 14,
    flickerFreq: 0.03 + rng() * 0.05,
    flickerPhase: rng() * Math.PI * 2,
    intensityMult: 0.7 + rng() * 0.3,
    chromaIdx: Math.floor(rng() * 12),
  }));
}

// Timing: appears every 55s (1650 frames @30fps) for 20s (600 frames)
const CYCLE_PERIOD = 1650;
const SHOW_DURATION = 600;
const FADE_FRAMES = 50;

interface Props {
  frames: EnhancedFrameData[];
}

export const StageLights: React.FC<Props> = ({ frames }) => {
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

  const pars = React.useMemo(() => generatePars(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Cycle timing
  const cyclePos = frame % CYCLE_PERIOD;
  const inShowWindow = cyclePos < SHOW_DURATION;

  // Energy gate
  const energyGate = energy > 0.08 ? 1 : 0;

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

  // Current chroma data
  const chroma = frames[idx]?.chroma ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  // Beam intensity from energy
  const beamIntensity = interpolate(energy, [0.08, 0.4], [0.25, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Rig Y position (top of frame)
  const rigY = 25;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          {pars.map((par, i) => {
            // Hue shifts with the chroma channel this par responds to
            const chromaInfluence = chroma[par.chromaIdx] * 60;
            const hue = (par.baseHue + chromaInfluence + frame * 0.3) % 360;
            return (
              <radialGradient
                key={`par-grad-${i}`}
                id={`par-grad-${i}`}
                cx="50%"
                cy="0%"
                r="100%"
                gradientUnits="objectBoundingBox"
              >
                <stop offset="0%" stopColor={`hsla(${hue}, 90%, 70%, 0.6)`} />
                <stop offset="40%" stopColor={`hsla(${hue}, 85%, 55%, 0.25)`} />
                <stop offset="100%" stopColor={`hsla(${hue}, 80%, 40%, 0)`} />
              </radialGradient>
            );
          })}
        </defs>
        {/* Rig bar */}
        <rect x={0} y={rigY - 4} width={width} height={8} fill="rgba(20, 20, 25, 0.6)" rx={2} />
        {pars.map((par, i) => {
          const px = par.x * width;
          const flicker = 0.75 + Math.sin(frame * par.flickerFreq + par.flickerPhase) * 0.25;
          const alpha = beamIntensity * par.intensityMult * flicker;

          // Cone geometry
          const coneHalfAngle = (par.coneSpread * Math.PI) / 180;
          const coneBottomWidth = Math.tan(coneHalfAngle) * (height - rigY) * 2;
          const leftX = px - coneBottomWidth / 2;
          const rightX = px + coneBottomWidth / 2;

          // Par can housing (small circle)
          const chromaInfluence = chroma[par.chromaIdx] * 60;
          const hue = (par.baseHue + chromaInfluence + frame * 0.3) % 360;

          return (
            <g key={i} opacity={alpha}>
              {/* Light cone */}
              <polygon
                points={`${px - 6},${rigY + 8} ${px + 6},${rigY + 8} ${rightX},${height} ${leftX},${height}`}
                fill={`url(#par-grad-${i})`}
                style={{ mixBlendMode: "screen" }}
              />
              {/* Par can housing */}
              <circle
                cx={px}
                cy={rigY}
                r={10}
                fill="rgba(30, 30, 35, 0.9)"
                stroke={`hsla(${hue}, 90%, 70%, 0.8)`}
                strokeWidth={2}
              />
              {/* Lens glow */}
              <circle
                cx={px}
                cy={rigY + 6}
                r={5}
                fill={`hsla(${hue}, 90%, 80%, ${alpha * 0.9})`}
                style={{ filter: `blur(3px)` }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
