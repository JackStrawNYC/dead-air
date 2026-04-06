/**
 * StageLights — Par can stage lights mounted on a rig across the top of frame.
 * 8 par cans in a row, each casting a cone of colored light downward.
 * Colors shift with chromaHue. Intensity scales with energy. Beat decay drives
 * flicker. Beams have soft gaussian edges and overlap to create color mixing.
 * Renders continuously when energy > 0.08 (rotation engine handles fades).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

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

interface Props {
  frames: EnhancedFrameData[];
}

export const StageLights: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, chromaHue, beatDecay, bass, highs } = snap;

  const pars = React.useMemo(() => generatePars(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Energy gate — below threshold, don't render
  if (energy <= 0.08) return null;

  // Beam intensity from energy
  const beamIntensity = interpolate(energy, [0.08, 0.4], [0.25, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Rig Y position (top of frame)
  const rigY = 25;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}>
        <defs>
          {pars.map((par, i) => {
            // Each par can offsets from the shared chromaHue by its baseHue
            const hue = (chromaHue + par.baseHue + frame * 0.3 * tempoFactor) % 360;
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
          // beatDecay drives flicker intensity — pars pulse on beats
          const flicker = 0.65 + beatDecay * 0.35 + Math.sin(frame * par.flickerFreq * tempoFactor + par.flickerPhase) * 0.15;
          const alpha = beamIntensity * par.intensityMult * flicker;

          // Cone geometry
          const coneHalfAngle = (par.coneSpread * Math.PI) / 180;
          const coneBottomWidth = Math.tan(coneHalfAngle) * (height - rigY) * 2;
          const leftX = px - coneBottomWidth / 2;
          const rightX = px + coneBottomWidth / 2;

          // Par can hue from shared chromaHue
          const hue = (chromaHue + par.baseHue + frame * 0.3 * tempoFactor) % 360;

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
