/**
 * Slinky — Slinky walking down invisible steps.
 * Coil shape rendered as a series of connected ellipses.
 * Front end flips over to next step while back end follows.
 * Classic rainbow colors cycling through coils. Step positions descend diagonally.
 * Walk speed driven by energy. Metallic sheen on coils.
 * Cycle: 50s (1500 frames), 14s (420 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE_TOTAL = 1500; // 50s
const VISIBLE_DURATION = 420; // 14s
const NUM_COILS = 18;
const NUM_STEPS = 8;

const RAINBOW = [
  "#FF1744", "#FF9100", "#FFD600", "#00E676",
  "#00B0FF", "#651FFF", "#D500F9",
];

interface Props {
  frames: EnhancedFrameData[];
}

export const Slinky: React.FC<Props> = ({ frames }) => {
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

  // Pre-compute step positions (descending diagonal, left to right)
  const steps = React.useMemo(() => {
    const rng = seeded(77889900);
    const stepWidth = 110;
    const stepDropY = 70;
    const startX = 200;
    const startY = 180;
    return Array.from({ length: NUM_STEPS }, (_, si) => ({
      x: startX + si * stepWidth + (rng() - 0.5) * 20,
      y: startY + si * stepDropY + (rng() - 0.5) * 10,
    }));
  }, []);

  const cycleFrame = frame % CYCLE_TOTAL;

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.8;

  if (opacity < 0.01) return null;

  // Slinky walks between steps. Energy determines speed.
  const speedMult = 0.6 + energy * 1.5;
  const totalStepTransitions = NUM_STEPS - 1;
  // The slinky moves through all steps over the visible duration
  const stepProgress = progress * totalStepTransitions * speedMult;
  const currentStepIdx = Math.min(
    Math.floor(stepProgress),
    totalStepTransitions - 1
  );
  const withinStep = stepProgress - currentStepIdx; // 0-1 within this step transition
  const clampedWithin = Math.min(Math.max(withinStep, 0), 1);

  const fromStep = steps[Math.min(currentStepIdx, steps.length - 1)];
  const toStep = steps[Math.min(currentStepIdx + 1, steps.length - 1)];

  // The slinky "flips": front arcs over to next step, back follows
  // Front anchor moves from fromStep to toStep in an arc
  // Back anchor stays at fromStep then snaps to toStep
  const flipProgress = clampedWithin;

  // Front position: arcs over
  const arcHeight = 120 + energy * 60;
  const frontX = fromStep.x + (toStep.x - fromStep.x) * flipProgress;
  const frontArcY = -arcHeight * Math.sin(flipProgress * Math.PI);
  const frontY =
    fromStep.y + (toStep.y - fromStep.y) * flipProgress + frontArcY;

  // Back position: follows behind
  const backLag = Math.max(0, flipProgress - 0.35);
  const backProgress = interpolate(backLag, [0, 0.65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });
  const backX = fromStep.x + (toStep.x - fromStep.x) * backProgress;
  const backY = fromStep.y + (toStep.y - fromStep.y) * backProgress;

  // Draw coils between back and front
  const coilRx = 35;
  const coilRy = 12 + energy * 6;

  return (
    <div
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          <filter id="slinky-sheen">
            <feSpecularLighting
              surfaceScale="2"
              specularConstant="0.8"
              specularExponent="20"
              result="spec"
            >
              <fePointLight x={width / 2} y={0} z={200} />
            </feSpecularLighting>
            <feComposite in="SourceGraphic" in2="spec" operator="arithmetic" k1="0" k2="1" k3="0.3" k4="0" />
          </filter>
          <filter id="slinky-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Draw step edges (invisible steps, just subtle lines) */}
        {steps.map((step, si) => (
          <line
            key={si}
            x1={step.x - 50}
            y1={step.y}
            x2={step.x + 50}
            y2={step.y}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        ))}

        {/* Coils */}
        <g filter="url(#slinky-glow)">
          {Array.from({ length: NUM_COILS }).map((_, ci) => {
            const t = ci / (NUM_COILS - 1); // 0 = back, 1 = front
            const cx = backX + (frontX - backX) * t;
            const cy = backY + (frontY - backY) * t;
            // Add a sine wave offset for the coil spring shape
            const coilOffset =
              Math.sin(t * Math.PI * 3 + frame * 0.08 * speedMult) * 8;

            const color = RAINBOW[ci % RAINBOW.length];

            // Coil compression: coils bunch together in the middle
            const compression = 1 - 0.3 * Math.sin(t * Math.PI);
            const rx = coilRx * compression;

            return (
              <ellipse
                key={ci}
                cx={cx + coilOffset}
                cy={cy}
                rx={rx}
                ry={coilRy}
                fill="none"
                stroke={color}
                strokeWidth={3}
                opacity={0.7 + energy * 0.3}
              />
            );
          })}
        </g>

        {/* Metallic highlight streak on coils */}
        {Array.from({ length: NUM_COILS }).map((_, ci) => {
          const t = ci / (NUM_COILS - 1);
          const cx = backX + (frontX - backX) * t;
          const cy = backY + (frontY - backY) * t;
          const coilOffset =
            Math.sin(t * Math.PI * 3 + frame * 0.08 * speedMult) * 8;
          const compression = 1 - 0.3 * Math.sin(t * Math.PI);
          const rx = coilRx * compression;

          return (
            <ellipse
              key={`h${ci}`}
              cx={cx + coilOffset}
              cy={cy - coilRy * 0.3}
              rx={rx * 0.6}
              ry={coilRy * 0.25}
              fill="none"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={1.5}
            />
          );
        })}
      </svg>
    </div>
  );
};
