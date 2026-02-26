/**
 * LaserShow — Scanning laser beams from bottom center (stage position).
 * 6-8 thin bright lines fanning outward at different angles. Beam angles sweep
 * back and forth with sine waves at different speeds. Colors: green, red, blue,
 * violet (classic laser colors). Beam brightness and count scale with energy.
 * High energy = rapid scanning. Appears every 40s for 12s when energy > 0.15.
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
  /** Base angle offset from center (radians) */
  baseAngle: number;
  /** Sweep frequency */
  sweepFreq: number;
  /** Sweep amplitude (radians) */
  sweepAmp: number;
  /** Sweep phase offset */
  sweepPhase: number;
  /** Color: classic laser colors */
  color: string;
  /** Glow color for filter */
  glowColor: string;
  /** Beam width (stroke) */
  strokeWidth: number;
  /** Brightness base */
  brightness: number;
}

const NUM_BEAMS = 8;

const LASER_COLORS: Array<{ color: string; glow: string }> = [
  { color: "rgba(0, 255, 60, 0.9)", glow: "rgba(0, 255, 60, 0.7)" },    // green
  { color: "rgba(255, 20, 20, 0.85)", glow: "rgba(255, 20, 20, 0.6)" },  // red
  { color: "rgba(60, 120, 255, 0.85)", glow: "rgba(60, 120, 255, 0.6)" }, // blue
  { color: "rgba(180, 50, 255, 0.85)", glow: "rgba(180, 50, 255, 0.6)" }, // violet
];

function generateBeams(seed: number): BeamData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_BEAMS }, (_, i) => {
    const colorIdx = i % LASER_COLORS.length;
    return {
      baseAngle: -0.8 + (i / (NUM_BEAMS - 1)) * 1.6, // fan from -0.8 to +0.8 radians
      sweepFreq: 0.02 + rng() * 0.04,
      sweepAmp: 0.15 + rng() * 0.35,
      sweepPhase: rng() * Math.PI * 2,
      color: LASER_COLORS[colorIdx].color,
      glowColor: LASER_COLORS[colorIdx].glow,
      strokeWidth: 1.2 + rng() * 1.5,
      brightness: 0.6 + rng() * 0.4,
    };
  });
}

// Timing: appears every 40s (1200 frames) for 12s (360 frames)
const CYCLE_PERIOD = 1200;
const SHOW_DURATION = 360;
const FADE_FRAMES = 45;

interface Props {
  frames: EnhancedFrameData[];
}

export const LaserShow: React.FC<Props> = ({ frames }) => {
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

  const beams = React.useMemo(() => generateBeams(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  // Cycle timing: which cycle are we in, and how far through the show window?
  const cyclePos = frame % CYCLE_PERIOD;
  const inShowWindow = cyclePos < SHOW_DURATION;

  // Energy gate: only show when energy > 0.15
  const energyGate = energy > 0.10 ? 1 : 0;

  // Fade envelope within show window
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

  // Sweep speed multiplier from energy
  const sweepSpeedMult = interpolate(energy, [0.1, 0.4], [0.6, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // How many beams visible: scales with energy
  const visibleBeamCount = Math.max(
    3,
    Math.round(interpolate(energy, [0.1, 0.35], [3, NUM_BEAMS], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })),
  );

  // Origin: bottom center (stage)
  const originX = width / 2;
  const originY = height + 5;

  // Beam length (reaches to top of frame with margin)
  const beamLength = height * 1.3;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {beams.slice(0, visibleBeamCount).map((beam, i) => {
          // Sweep the angle
          const angle = beam.baseAngle
            + Math.sin(frame * beam.sweepFreq * sweepSpeedMult + beam.sweepPhase) * beam.sweepAmp;

          // Convert angle to endpoint
          // Angle 0 = straight up, negative = left, positive = right
          const endX = originX + Math.sin(angle) * beamLength;
          const endY = originY - Math.cos(angle) * beamLength;

          // Flicker
          const flicker = 0.7 + Math.sin(frame * 0.15 + i * 2.1) * 0.3;
          const alpha = beam.brightness * flicker;

          return (
            <line
              key={i}
              x1={originX}
              y1={originY}
              x2={endX}
              y2={endY}
              stroke={beam.color}
              strokeWidth={beam.strokeWidth}
              opacity={alpha}
              style={{
                filter: `drop-shadow(0 0 6px ${beam.glowColor}) drop-shadow(0 0 15px ${beam.glowColor})`,
              }}
            />
          );
        })}
      </svg>
    </div>
  );
};
