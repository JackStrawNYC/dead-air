/**
 * CrowdDance — Dancing silhouettes along the bottom of the screen.
 * 8-12 simplified human silhouettes in bottom 15% of screen. Arms up,
 * varying heights, bobbing to the beat. Vertical bounce driven by beat
 * events (sharp up on beat, gradual settle). Arms animate between up/down
 * positions based on energy. Dark silhouettes (near-black) against the
 * shader — NOT bright. Visibility gated on HIGH energy (rms > 0.25).
 * Slight horizontal swaying per figure.
 * Layer 1, high energy.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

interface FigureData {
  /** X position as fraction of width */
  x: number;
  /** Height scale (0.7-1.3) — taller/shorter people */
  heightScale: number;
  /** Sway frequency */
  swayFreq: number;
  /** Sway phase */
  swayPhase: number;
  /** Sway amplitude (px) */
  swayAmp: number;
  /** Bounce phase offset (so figures don't all bounce in sync) */
  bouncePhase: number;
  /** Arm raise tendency (0-1): how easily arms go up */
  armExcitability: number;
  /** Body width scale (0.8-1.2) */
  widthScale: number;
  /** Darkness variation (0.02-0.12) */
  darkness: number;
}

const NUM_FIGURES = 10;
const STAGGER_START = 60; // 2 seconds fade in

function generateFigures(seed: number): FigureData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_FIGURES }, () => ({
    x: 0.05 + rng() * 0.90,
    heightScale: 0.7 + rng() * 0.6,
    swayFreq: 0.01 + rng() * 0.025,
    swayPhase: rng() * Math.PI * 2,
    swayAmp: 2 + rng() * 5,
    bouncePhase: rng() * Math.PI * 2,
    armExcitability: 0.3 + rng() * 0.7,
    widthScale: 0.8 + rng() * 0.4,
    darkness: 0.02 + rng() * 0.10,
  }));
}

/** Generate a simplified human silhouette SVG path.
 *  armRaise: 0 = arms at sides, 1 = arms fully up.
 *  bounceY: vertical offset in px (negative = up).
 *  Returns path string centered at (0, 0) with base at (0, baseH). */
function silhouettePath(
  baseW: number,
  baseH: number,
  armRaise: number,
  widthScale: number,
): string {
  const w = baseW * widthScale;
  const headR = w * 0.35;
  const shoulderW = w * 0.55;
  const torsoH = baseH * 0.35;
  const legH = baseH * 0.35;
  const headY = 0;
  const shoulderY = headY + headR * 2 + baseH * 0.05;
  const hipY = shoulderY + torsoH;
  const footY = hipY + legH;

  // Arm angle: from ~20deg down to ~160deg up
  const armAngle = interpolate(armRaise, [0, 1], [-20, -150], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const armLen = baseH * 0.30;
  const armRad = (armAngle * Math.PI) / 180;
  const armEndX = shoulderW + Math.cos(armRad) * armLen;
  const armEndY = shoulderY + Math.sin(armRad) * armLen;
  const armEndXL = -armEndX;

  // Build path: head circle approximation + body + legs
  // Using simplified blob shape
  return [
    // Head (circle approx via arcs)
    `M ${-headR} ${headY}`,
    `A ${headR} ${headR} 0 1 1 ${headR} ${headY}`,
    `A ${headR} ${headR} 0 1 1 ${-headR} ${headY}`,
    `Z`,
    // Neck to shoulders to torso
    `M ${-w * 0.12} ${headY + headR * 2}`,
    `L ${-shoulderW} ${shoulderY}`,
    // Left arm
    `L ${armEndXL} ${armEndY}`,
    `L ${-shoulderW} ${shoulderY}`,
    // Torso left side
    `L ${-w * 0.35} ${hipY}`,
    // Left leg
    `L ${-w * 0.30} ${footY}`,
    `L ${-w * 0.10} ${footY}`,
    `L ${-w * 0.10} ${hipY}`,
    // Crotch
    `L ${w * 0.10} ${hipY}`,
    // Right leg
    `L ${w * 0.10} ${footY}`,
    `L ${w * 0.30} ${footY}`,
    `L ${w * 0.35} ${hipY}`,
    // Torso right side
    `L ${shoulderW} ${shoulderY}`,
    // Right arm
    `L ${armEndX} ${armEndY}`,
    `L ${shoulderW} ${shoulderY}`,
    // Back to neck
    `L ${w * 0.12} ${headY + headR * 2}`,
    `Z`,
  ].join(" ");
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CrowdDance: React.FC<Props> = ({ frames }) => {
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

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // HIGH energy gating: visible only when rms > 0.25, full at 0.35
  const energyGate = interpolate(energy, [0.20, 0.30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = energyGate * masterFade;

  if (masterOpacity < 0.01) return null;

  // Beat detection: find the most recent beat within last 10 frames
  let framesSinceBeat = 999;
  for (let i = idx; i >= Math.max(0, idx - 10); i--) {
    if (frames[i].beat) {
      framesSinceBeat = idx - i;
      break;
    }
  }

  // Bounce: sharp up on beat, gradual settle (exponential decay)
  const bounceIntensity = interpolate(energy, [0.20, 0.40], [4, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const beatBounce =
    framesSinceBeat < 10
      ? bounceIntensity * Math.exp(-framesSinceBeat * 0.35)
      : 0;

  // Arm raise driven by energy level
  const armRaise = interpolate(energy, [0.20, 0.45], [0.1, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Figure dimensions
  const baseW = 22;
  const baseH = height * 0.12; // fits within bottom 15%

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity: masterOpacity, mixBlendMode: "screen" }}
      >
        {figures.map((fig, i) => {
          const px = fig.x * width;
          // Figures sit in bottom 15% of screen
          const baseY = height * 0.88;
          const figH = baseH * fig.heightScale;

          // Per-figure horizontal sway
          const swayX = Math.sin(frame * fig.swayFreq + fig.swayPhase) * fig.swayAmp;

          // Per-figure bounce (offset by phase)
          const phasedBounce = beatBounce * (0.6 + 0.4 * Math.sin(fig.bouncePhase));

          // Per-figure arm raise (some more excitable than others)
          const figArmRaise = Math.min(
            1,
            armRaise * fig.armExcitability +
              (framesSinceBeat < 8 ? 0.3 * Math.exp(-framesSinceBeat * 0.3) : 0),
          );

          const path = silhouettePath(baseW, figH, figArmRaise, fig.widthScale);

          // Dark silhouettes — near-black, subtle
          const fillColor = `rgba(${fig.darkness * 255}, ${fig.darkness * 200}, ${fig.darkness * 250}, 0.65)`;

          return (
            <g
              key={i}
              transform={`translate(${px + swayX}, ${baseY - phasedBounce})`}
            >
              <path d={path} fill={fillColor} />
              {/* Subtle rim light from stage (very faint) */}
              <path
                d={path}
                fill="none"
                stroke={`rgba(255, 200, 120, ${0.08 + energy * 0.1})`}
                strokeWidth={0.5}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
