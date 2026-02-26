/**
 * BearParade — rainbow dancing bears marching across the bottom.
 * 6 bears in classic GD colors, bobbing to audio energy.
 * March direction alternates per cycle. Energy drives bob height + speed.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const BEAR_COLORS = [
  "#FF1744", // red
  "#FF9100", // orange
  "#FFD600", // yellow
  "#00E676", // green
  "#2979FF", // blue
  "#D500F9", // purple
];

const NUM_BEARS = 6;
const PARADE_DURATION = 450; // 15 seconds to cross
const PARADE_GAP = 300;      // 10 second gap between parades
const PARADE_CYCLE = PARADE_DURATION + PARADE_GAP;
const BEAR_SPACING = 120;    // px between bears
const BEAR_SIZE = 90;

/** Single dancing bear SVG */
const Bear: React.FC<{ size: number; color: string; bobOffset: number }> = ({ size, color, bobOffset }) => (
  <svg width={size} height={size} viewBox="0 0 80 100" fill="none">
    <g transform={`translate(0, ${bobOffset})`}>
      {/* Body */}
      <ellipse cx="40" cy="55" rx="20" ry="25" fill={color} />
      {/* Head */}
      <circle cx="40" cy="22" r="14" fill={color} />
      {/* Ears */}
      <circle cx="28" cy="12" r="6" fill={color} />
      <circle cx="52" cy="12" r="6" fill={color} />
      {/* Snout */}
      <ellipse cx="40" cy="26" rx="6" ry="4" fill={color} opacity="0.6" />
      {/* Eyes */}
      <circle cx="35" cy="19" r="2" fill="black" opacity="0.6" />
      <circle cx="45" cy="19" r="2" fill="black" opacity="0.6" />
      {/* Left arm raised */}
      <line x1="25" y1="42" x2="8" y2="25" stroke={color} strokeWidth="7" strokeLinecap="round" />
      {/* Right arm out */}
      <line x1="55" y1="42" x2="72" y2="35" stroke={color} strokeWidth="7" strokeLinecap="round" />
      {/* Left leg */}
      <line x1="32" y1="75" x2="22" y2="98" stroke={color} strokeWidth="7" strokeLinecap="round" />
      {/* Right leg kicking */}
      <line x1="48" y1="75" x2="62" y2="92" stroke={color} strokeWidth="7" strokeLinecap="round" />
    </g>
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const BearParade: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Energy for bob intensity
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 50); i <= Math.min(frames.length - 1, idx + 50); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleIndex = Math.floor(frame / PARADE_CYCLE);
  const cycleFrame = frame % PARADE_CYCLE;
  const goingRight = cycleIndex % 2 === 0;

  // Only render during parade portion (not gap)
  if (cycleFrame >= PARADE_DURATION) return null;

  const progress = cycleFrame / PARADE_DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(fadeIn, fadeOut) * 0.85;

  const totalWidth = NUM_BEARS * BEAR_SPACING;
  const yBase = height - BEAR_SIZE - 20; // bottom of screen

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {BEAR_COLORS.map((color, i) => {
        // Stagger each bear
        const bearProgress = progress - (i * 0.03);

        // Position
        let x: number;
        if (goingRight) {
          x = interpolate(bearProgress, [0, 1], [-totalWidth, width + BEAR_SPACING], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) + i * BEAR_SPACING;
        } else {
          x = interpolate(bearProgress, [0, 1], [width + BEAR_SPACING, -totalWidth], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) - i * BEAR_SPACING + totalWidth;
        }

        // Bob: each bear offset in phase, amplitude from energy
        const bobSpeed = 8 + energy * 6;
        const bobAmp = 8 + energy * 20;
        const bob = Math.sin((frame * bobSpeed * 0.01) + i * 1.2) * bobAmp;

        // Slight tilt
        const tilt = Math.sin((frame * 0.08) + i * 0.9) * 8;

        // Neon glow
        const glow = `drop-shadow(0 0 8px ${color}) drop-shadow(0 0 20px ${color})`;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: yBase + bob,
              transform: `rotate(${tilt}deg) scaleX(${goingRight ? 1 : -1})`,
              opacity,
              filter: glow,
              willChange: "transform, opacity",
            }}
          >
            <Bear size={BEAR_SIZE} color={color} bobOffset={0} />
          </div>
        );
      })}
    </div>
  );
};
