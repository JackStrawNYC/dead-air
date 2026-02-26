/**
 * DiceRoll — 3-5 dice tumbling across screen.
 * Each die is a rounded rectangle with pip dots. Dice rotate (simulated by cycling
 * through face values). Dice follow bouncing trajectories.
 * White dice with black pips, or colorful casino dice (red, green, blue).
 * Energy drives tumble speed and bounce height.
 * Cycle: 40s, 10s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1200; // 40 seconds at 30fps
const DURATION = 300; // 10 seconds visible

const NUM_DICE = 5;
const DIE_SIZE = 52;

// Dice colors
const DICE_COLORS = ["#FFFFFF", "#FF2244", "#22CC44", "#3366FF", "#FFCC00"];
const PIP_COLORS = ["#111111", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#111111"];

// Pip positions for each face value (1-6), in a -1..1 coordinate system
const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.5, -0.5], [0.5, 0.5]],
  3: [[-0.5, -0.5], [0, 0], [0.5, 0.5]],
  4: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
  5: [[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]],
  6: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0], [0.5, 0], [-0.5, 0.5], [0.5, 0.5]],
};

interface Props {
  frames: EnhancedFrameData[];
}

export const DiceRoll: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-generate dice properties
  const diceProps = React.useMemo(() => {
    const r = seeded(6617);
    return Array.from({ length: NUM_DICE }).map((_, i) => ({
      startX: r() * 0.3 + 0.1,
      endX: r() * 0.3 + 0.6,
      baseY: 0.5 + (r() - 0.5) * 0.3,
      bounceFreq: 2 + r() * 3,
      bouncePhase: r() * Math.PI * 2,
      rotSpeed: (r() - 0.5) * 12,
      faceChangeSpeed: 4 + r() * 8,
      colorIdx: i % DICE_COLORS.length,
    }));
  }, []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.3, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Tumble speed and bounce height driven by energy
  const tumbleSpeed = 0.5 + energy * 3.0;
  const bounceHeight = 30 + energy * 80;

  const glowSize = interpolate(energy, [0.02, 0.25], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          willChange: "opacity",
        }}
      >
        {diceProps.map((dp, di) => {
          // Horizontal travel
          const dieX = interpolate(progress, [0, 1], [dp.startX * width, dp.endX * width], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          // Bouncing vertical motion
          const bouncePhase = cycleFrame * tumbleSpeed * 0.04 * dp.bounceFreq + dp.bouncePhase;
          const bounce = Math.abs(Math.sin(bouncePhase)) * bounceHeight;
          const dieY = dp.baseY * height - bounce;

          // Rotation
          const rotation = cycleFrame * tumbleSpeed * dp.rotSpeed;

          // Face value cycles with speed
          const facePhase = Math.floor(cycleFrame * tumbleSpeed * dp.faceChangeSpeed * 0.01);
          const faceValue = (facePhase % 6) + 1;
          const pips = PIP_LAYOUTS[faceValue];

          const dieColor = DICE_COLORS[dp.colorIdx];
          const pipColor = PIP_COLORS[dp.colorIdx];
          const halfSize = DIE_SIZE / 2;
          const pipRadius = DIE_SIZE * 0.08;

          return (
            <g
              key={`die-${di}`}
              transform={`translate(${dieX}, ${dieY}) rotate(${rotation})`}
              style={{
                filter: `drop-shadow(0 0 ${glowSize}px ${dieColor})`,
              }}
            >
              {/* Die body */}
              <rect
                x={-halfSize}
                y={-halfSize}
                width={DIE_SIZE}
                height={DIE_SIZE}
                fill={dieColor}
                opacity={0.75}
                rx={8}
                ry={8}
                stroke={dieColor}
                strokeWidth={1.5}
              />

              {/* Pips */}
              {pips.map((pip, pi) => (
                <circle
                  key={`pip-${di}-${pi}`}
                  cx={pip[0] * halfSize * 0.65}
                  cy={pip[1] * halfSize * 0.65}
                  r={pipRadius}
                  fill={pipColor}
                  opacity={0.85}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
