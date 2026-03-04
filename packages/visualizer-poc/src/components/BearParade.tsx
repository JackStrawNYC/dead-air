/**
 * BearParade — rainbow dancing bears marching across the bottom.
 * 6 bears in classic GD colors, bobbing to audio energy.
 * March direction alternates per window. Energy drives bob height + speed.
 * Music-driven: marches start on beat frames during high-energy passages.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import {
  useAudioSnapshot,
  precomputeMarchWindows,
  findActiveMarch,
  type MarchConfig,
} from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const BEAR_COLORS = [
  "#FF1744", // red
  "#FF9100", // orange
  "#FFD600", // yellow
  "#00E676", // green
  "#2979FF", // blue
  "#D500F9", // purple
];

const NUM_BEARS = 5;
const BEAR_SPACING = 200;    // px between bears
const BEAR_SIZE = 140;

const MARCH_CONFIG: MarchConfig = {
  enterThreshold: 0.06,    // low threshold — bears should appear often
  exitThreshold: 0.03,     // don't cut short on small energy dips
  sustainFrames: 15,       // quick trigger
  cooldownFrames: 300,     // 10 seconds between marches
  marchDuration: 600,      // 20 seconds — full leisurely crossing
};

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
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;

  const marchWindows = React.useMemo(
    () => precomputeMarchWindows(frames, MARCH_CONFIG),
    [frames],
  );

  const activeMarch = findActiveMarch(marchWindows, frame);
  if (!activeMarch) return null;

  const marchFrame = frame - activeMarch.startFrame;
  const marchDuration = activeMarch.endFrame - activeMarch.startFrame;
  const progress = marchFrame / marchDuration;
  const goingRight = activeMarch.direction === 1;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(fadeIn, fadeOut);

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

        // Bob: each bear offset in phase, amplitude from energy + beatDecay, speed scaled by tempo
        const bobSpeed = (8 + energy * 6) * tempoFactor;
        const bobAmp = 8 + energy * 20 + snap.beatDecay * 10;
        const bob = Math.sin((frame * bobSpeed * 0.01) + i * 1.2) * bobAmp;

        // Slight tilt — tempo-scaled
        const tilt = Math.sin((frame * 0.08 * tempoFactor) + i * 0.9) * 8;

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
