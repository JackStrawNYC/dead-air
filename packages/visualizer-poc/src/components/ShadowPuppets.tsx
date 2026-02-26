/**
 * ShadowPuppets -- Dancing shadow figure silhouettes.
 * 3-4 humanoid figures in solid black, positioned at bottom of screen.
 * Articulated limbs (upper/lower arms and legs) move rhythmically with energy.
 * Joint angles driven by sine functions at different frequencies.
 * Warm golden backlight glow behind figures.
 * Cycle: 55s (1650 frames), 16s (480 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FigureData {
  x: number; // fraction of width
  scale: number;
  // frequency and phase for each joint
  leftShoulderFreq: number;
  leftShoulderPhase: number;
  leftElbowFreq: number;
  leftElbowPhase: number;
  rightShoulderFreq: number;
  rightShoulderPhase: number;
  rightElbowFreq: number;
  rightElbowPhase: number;
  leftHipFreq: number;
  leftHipPhase: number;
  leftKneeFreq: number;
  leftKneePhase: number;
  rightHipFreq: number;
  rightHipPhase: number;
  rightKneeFreq: number;
  rightKneePhase: number;
  bodySwayFreq: number;
  bodySwayPhase: number;
}

function generateFigures(seed: number): FigureData[] {
  const rng = seeded(seed);
  const count = 4;
  const figures: FigureData[] = [];
  for (let i = 0; i < count; i++) {
    figures.push({
      x: 0.15 + (i / (count - 1)) * 0.7,
      scale: 0.85 + rng() * 0.3,
      leftShoulderFreq: 0.03 + rng() * 0.04,
      leftShoulderPhase: rng() * Math.PI * 2,
      leftElbowFreq: 0.05 + rng() * 0.04,
      leftElbowPhase: rng() * Math.PI * 2,
      rightShoulderFreq: 0.03 + rng() * 0.04,
      rightShoulderPhase: rng() * Math.PI * 2,
      rightElbowFreq: 0.05 + rng() * 0.04,
      rightElbowPhase: rng() * Math.PI * 2,
      leftHipFreq: 0.025 + rng() * 0.03,
      leftHipPhase: rng() * Math.PI * 2,
      leftKneeFreq: 0.04 + rng() * 0.04,
      leftKneePhase: rng() * Math.PI * 2,
      rightHipFreq: 0.025 + rng() * 0.03,
      rightHipPhase: rng() * Math.PI * 2,
      rightKneeFreq: 0.04 + rng() * 0.04,
      rightKneePhase: rng() * Math.PI * 2,
      bodySwayFreq: 0.02 + rng() * 0.02,
      bodySwayPhase: rng() * Math.PI * 2,
    });
  }
  return figures;
}

const CYCLE = 1650; // 55s at 30fps
const VISIBLE_DURATION = 480; // 16s

interface Props {
  frames: EnhancedFrameData[];
}

export const ShadowPuppets: React.FC<Props> = ({ frames }) => {
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

  const figures = React.useMemo(() => generateFigures(55197708), []);

  const cycleFrame = frame % CYCLE;
  const isVisible = cycleFrame < VISIBLE_DURATION;

  const fadeIn = isVisible
    ? interpolate(cycleFrame, [0, 60], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  const fadeOut = isVisible
    ? interpolate(cycleFrame, [VISIBLE_DURATION - 60, VISIBLE_DURATION], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const masterOpacity = Math.min(fadeIn, fadeOut);

  if (!isVisible || masterOpacity < 0.01) return null;

  const limbAmplitude = interpolate(energy, [0.03, 0.35], [0.3, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowIntensity = interpolate(energy, [0.05, 0.3], [15, 40], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Limb dimensions
  const UPPER_ARM = 35;
  const LOWER_ARM = 30;
  const UPPER_LEG = 40;
  const LOWER_LEG = 35;
  const TORSO_HEIGHT = 60;
  const HEAD_RADIUS = 14;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <radialGradient id="shadow-backlight" cx="50%" cy="100%">
            <stop offset="0%" stopColor="rgba(255, 200, 80, 0.35)" />
            <stop offset="50%" stopColor="rgba(255, 160, 40, 0.15)" />
            <stop offset="100%" stopColor="rgba(255, 120, 20, 0)" />
          </radialGradient>
        </defs>

        {/* Warm golden backlight glow */}
        <ellipse
          cx={width / 2}
          cy={height}
          rx={width * 0.6}
          ry={height * 0.35}
          fill="url(#shadow-backlight)"
          style={{ filter: `blur(${glowIntensity}px)` }}
        />

        {figures.map((fig, fi) => {
          const baseX = fig.x * width;
          const baseY = height - 20;
          const s = fig.scale;

          // Body sway
          const sway = Math.sin(frame * fig.bodySwayFreq + fig.bodySwayPhase) * 8 * limbAmplitude;

          // Joint angles in degrees
          const leftShoulderAngle = Math.sin(frame * fig.leftShoulderFreq + fig.leftShoulderPhase) * 70 * limbAmplitude - 30;
          const leftElbowAngle = (Math.sin(frame * fig.leftElbowFreq + fig.leftElbowPhase) * 0.5 + 0.5) * 90 * limbAmplitude;
          const rightShoulderAngle = Math.sin(frame * fig.rightShoulderFreq + fig.rightShoulderPhase) * 70 * limbAmplitude + 30;
          const rightElbowAngle = (Math.sin(frame * fig.rightElbowFreq + fig.rightElbowPhase) * 0.5 + 0.5) * 90 * limbAmplitude;

          const leftHipAngle = Math.sin(frame * fig.leftHipFreq + fig.leftHipPhase) * 25 * limbAmplitude;
          const leftKneeAngle = (Math.sin(frame * fig.leftKneeFreq + fig.leftKneePhase) * 0.5 + 0.5) * 40 * limbAmplitude;
          const rightHipAngle = Math.sin(frame * fig.rightHipFreq + fig.rightHipPhase) * 25 * limbAmplitude;
          const rightKneeAngle = (Math.sin(frame * fig.rightKneeFreq + fig.rightKneePhase) * 0.5 + 0.5) * 40 * limbAmplitude;

          // Positions
          const hipX = baseX + sway;
          const hipY = baseY;
          const shoulderX = hipX;
          const shoulderY = hipY - TORSO_HEIGHT * s;
          const headY = shoulderY - HEAD_RADIUS * s - 4;

          // Helper to compute endpoint given origin, angle (deg from vertical), length
          const limbEnd = (ox: number, oy: number, angleDeg: number, len: number): [number, number] => {
            const rad = (angleDeg * Math.PI) / 180;
            return [ox + Math.sin(rad) * len * s, oy + Math.cos(rad) * len * s];
          };

          // Arms
          const [lElbowX, lElbowY] = limbEnd(shoulderX, shoulderY, leftShoulderAngle - 90, UPPER_ARM);
          const [lHandX, lHandY] = limbEnd(lElbowX, lElbowY, leftShoulderAngle - 90 + leftElbowAngle, LOWER_ARM);
          const [rElbowX, rElbowY] = limbEnd(shoulderX, shoulderY, rightShoulderAngle + 90, UPPER_ARM);
          const [rHandX, rHandY] = limbEnd(rElbowX, rElbowY, rightShoulderAngle + 90 - rightElbowAngle, LOWER_ARM);

          // Legs
          const [lKneeX, lKneeY] = limbEnd(hipX - 8 * s, hipY, leftHipAngle, UPPER_LEG);
          const [lFootX, lFootY] = limbEnd(lKneeX, lKneeY, leftHipAngle + leftKneeAngle, LOWER_LEG);
          const [rKneeX, rKneeY] = limbEnd(hipX + 8 * s, hipY, rightHipAngle, UPPER_LEG);
          const [rFootX, rFootY] = limbEnd(rKneeX, rKneeY, rightHipAngle + rightKneeAngle, LOWER_LEG);

          return (
            <g key={fi}>
              {/* Backlight halo per figure */}
              <ellipse
                cx={shoulderX}
                cy={shoulderY}
                rx={50 * s}
                ry={70 * s}
                fill="none"
                stroke="rgba(255, 180, 50, 0.2)"
                strokeWidth={3}
                style={{ filter: `blur(${glowIntensity * 0.5}px)` }}
              />

              {/* Torso */}
              <line
                x1={shoulderX} y1={shoulderY}
                x2={hipX} y2={hipY}
                stroke="rgba(5, 5, 10, 0.95)"
                strokeWidth={8 * s}
                strokeLinecap="round"
              />

              {/* Left arm */}
              <line x1={shoulderX} y1={shoulderY} x2={lElbowX} y2={lElbowY}
                stroke="rgba(5, 5, 10, 0.95)" strokeWidth={6 * s} strokeLinecap="round" />
              <line x1={lElbowX} y1={lElbowY} x2={lHandX} y2={lHandY}
                stroke="rgba(5, 5, 10, 0.95)" strokeWidth={5 * s} strokeLinecap="round" />

              {/* Right arm */}
              <line x1={shoulderX} y1={shoulderY} x2={rElbowX} y2={rElbowY}
                stroke="rgba(5, 5, 10, 0.95)" strokeWidth={6 * s} strokeLinecap="round" />
              <line x1={rElbowX} y1={rElbowY} x2={rHandX} y2={rHandY}
                stroke="rgba(5, 5, 10, 0.95)" strokeWidth={5 * s} strokeLinecap="round" />

              {/* Left leg */}
              <line x1={hipX - 8 * s} y1={hipY} x2={lKneeX} y2={lKneeY}
                stroke="rgba(5, 5, 10, 0.95)" strokeWidth={7 * s} strokeLinecap="round" />
              <line x1={lKneeX} y1={lKneeY} x2={lFootX} y2={lFootY}
                stroke="rgba(5, 5, 10, 0.95)" strokeWidth={6 * s} strokeLinecap="round" />

              {/* Right leg */}
              <line x1={hipX + 8 * s} y1={hipY} x2={rKneeX} y2={rKneeY}
                stroke="rgba(5, 5, 10, 0.95)" strokeWidth={7 * s} strokeLinecap="round" />
              <line x1={rKneeX} y1={rKneeY} x2={rFootX} y2={rFootY}
                stroke="rgba(5, 5, 10, 0.95)" strokeWidth={6 * s} strokeLinecap="round" />

              {/* Head */}
              <circle
                cx={shoulderX + sway * 0.3}
                cy={headY}
                r={HEAD_RADIUS * s}
                fill="rgba(5, 5, 10, 0.95)"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
