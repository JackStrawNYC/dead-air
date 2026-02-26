/**
 * FogLaser — Laser beams cutting through atmospheric fog/haze.
 * Multiple thin beams from a central source fan across the frame horizontally.
 * Beams are rendered as lines with a glow halo simulating fog scatter.
 * Beam count scales with energy (2 at low, up to 10 at high). Colors are
 * green, blue, violet (classic laser palette). Beams sweep with slow sine
 * oscillation. Fog haze layer dims with distance from source.
 * Appears every 60s (1800 frames) for 22s (660 frames) when energy > 0.10.
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

interface BeamData {
  baseAngle: number;
  sweepFreq: number;
  sweepAmp: number;
  sweepPhase: number;
  colorH: number;
  colorS: number;
  colorL: number;
  strokeWidth: number;
  fogScatter: number;
}

const NUM_BEAMS = 10;

const LASER_HUES = [120, 130, 200, 220, 270, 280, 160, 190, 250, 140]; // green/blue/violet spectrum

function generateBeams(seed: number): BeamData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_BEAMS }, (_, i) => ({
    baseAngle: -0.6 + (i / (NUM_BEAMS - 1)) * 1.2,
    sweepFreq: 0.012 + rng() * 0.025,
    sweepAmp: 0.1 + rng() * 0.25,
    sweepPhase: rng() * Math.PI * 2,
    colorH: LASER_HUES[i % LASER_HUES.length] + rng() * 20 - 10,
    colorS: 90 + rng() * 10,
    colorL: 55 + rng() * 15,
    strokeWidth: 1.0 + rng() * 1.2,
    fogScatter: 8 + rng() * 12,
  }));
}

// Timing: appears every 60s (1800 frames) for 22s (660 frames)
const CYCLE_PERIOD = 1800;
const SHOW_DURATION = 660;
const FADE_FRAMES = 50;

interface Props {
  frames: EnhancedFrameData[];
}

export const FogLaser: React.FC<Props> = ({ frames }) => {
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

  const beams = React.useMemo(() => generateBeams((ctx?.showSeed ?? 19770508)), [ctx?.showSeed]);

  // Cycle timing
  const cyclePos = frame % CYCLE_PERIOD;
  const inShowWindow = cyclePos < SHOW_DURATION;

  // Energy gate
  const energyGate = energy > 0.10 ? 1 : 0;

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

  // Visible beam count scales with energy
  const visibleCount = Math.max(
    2,
    Math.round(interpolate(energy, [0.10, 0.35], [2, NUM_BEAMS], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })),
  );

  // Sweep speed from energy
  const sweepMult = interpolate(energy, [0.10, 0.4], [0.5, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Source position: center of frame, mid-height
  const sourceX = width / 2;
  const sourceY = height * 0.45;

  // Beam length
  const beamLen = Math.max(width, height) * 0.9;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {/* Fog haze base layer */}
        <defs>
          <radialGradient id="fog-haze" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="rgba(180, 200, 220, 0.08)" />
            <stop offset="60%" stopColor="rgba(150, 170, 200, 0.04)" />
            <stop offset="100%" stopColor="rgba(100, 120, 150, 0)" />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={width} height={height} fill="url(#fog-haze)" />

        {beams.slice(0, visibleCount).map((beam, i) => {
          const angle = beam.baseAngle
            + Math.sin(frame * beam.sweepFreq * sweepMult + beam.sweepPhase) * beam.sweepAmp;

          const endX = sourceX + Math.cos(angle) * beamLen;
          const endY = sourceY + Math.sin(angle) * beamLen;

          // Flicker
          const flicker = 0.7 + Math.sin(frame * 0.18 + i * 1.9) * 0.3;
          const alpha = flicker;

          const beamColor = `hsla(${beam.colorH}, ${beam.colorS}%, ${beam.colorL}%, ${alpha * 0.8})`;
          const fogColor = `hsla(${beam.colorH}, ${beam.colorS - 20}%, ${beam.colorL + 10}%, ${alpha * 0.25})`;

          return (
            <g key={i}>
              {/* Fog scatter (wide glow around beam) */}
              <line
                x1={sourceX}
                y1={sourceY}
                x2={endX}
                y2={endY}
                stroke={fogColor}
                strokeWidth={beam.fogScatter}
                strokeLinecap="round"
                style={{ filter: `blur(${beam.fogScatter * 0.5}px)` }}
              />
              {/* Core beam */}
              <line
                x1={sourceX}
                y1={sourceY}
                x2={endX}
                y2={endY}
                stroke={beamColor}
                strokeWidth={beam.strokeWidth}
                strokeLinecap="round"
                style={{
                  filter: `drop-shadow(0 0 4px ${beamColor}) drop-shadow(0 0 8px ${fogColor})`,
                }}
              />
            </g>
          );
        })}

        {/* Source glow */}
        <circle
          cx={sourceX}
          cy={sourceY}
          r={6}
          fill={`hsla(180, 90%, 80%, 0.7)`}
          style={{ filter: `blur(4px)` }}
        />
      </svg>
    </div>
  );
};
