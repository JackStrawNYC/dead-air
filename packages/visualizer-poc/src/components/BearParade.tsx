/**
 * BearParade — rainbow dancing bears grooving across the bottom.
 * 6 bears in classic GD colors, beat-synced movement with energy-driven intensity.
 * No march window gating — always renders when overlay engine activates it.
 * Low energy: gentle sway. Mid: bouncy walk. High: full groove with arm swing.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const BEAR_COLORS = [
  "#FF1744", // red
  "#FF9100", // orange
  "#FFD600", // yellow
  "#00E676", // green
  "#2979FF", // blue
  "#D500F9", // purple
];

const NUM_BEARS = 6;
const BEAR_SPACING_BASE = 180;
const BEAR_SIZE_BASE = 130;

/**
 * Single dancing bear SVG with animated limbs.
 * armSwing: -1 to 1 controls arm position
 * legPhase: 0-1 controls leg stride
 * headBob: px offset for head
 */
const Bear: React.FC<{
  size: number;
  color: string;
  armSwing: number;
  legPhase: number;
  headBob: number;
}> = ({ size, color, armSwing, legPhase, headBob }) => {
  // Arm endpoints swing based on armSwing (-1 to 1)
  const leftArmX = 8 + armSwing * 10;
  const leftArmY = 25 - Math.abs(armSwing) * 12;
  const rightArmX = 72 - armSwing * 10;
  const rightArmY = 35 + armSwing * 8;

  // Leg endpoints swing based on legPhase
  const legOffset = Math.sin(legPhase * Math.PI * 2);
  const leftLegX = 22 + legOffset * 10;
  const leftLegY = 98 - Math.abs(legOffset) * 4;
  const rightLegX = 62 - legOffset * 10;
  const rightLegY = 92 + Math.abs(legOffset) * 4;

  return (
    <svg width={size} height={size} viewBox="0 0 80 100" fill="none">
      {/* Body */}
      <ellipse cx="40" cy="55" rx="20" ry="25" fill={color} />
      {/* Head — bobs independently */}
      <g transform={`translate(0, ${headBob})`}>
        <circle cx="40" cy="22" r="14" fill={color} />
        {/* Ears */}
        <circle cx="28" cy="12" r="6" fill={color} />
        <circle cx="52" cy="12" r="6" fill={color} />
        {/* Snout */}
        <ellipse cx="40" cy="26" rx="6" ry="4" fill={color} opacity="0.6" />
        {/* Eyes */}
        <circle cx="35" cy="19" r="2" fill="black" opacity="0.6" />
        <circle cx="45" cy="19" r="2" fill="black" opacity="0.6" />
      </g>
      {/* Left arm */}
      <line
        x1="25" y1="42"
        x2={leftArmX} y2={leftArmY}
        stroke={color} strokeWidth="7" strokeLinecap="round"
      />
      {/* Right arm */}
      <line
        x1="55" y1="42"
        x2={rightArmX} y2={rightArmY}
        stroke={color} strokeWidth="7" strokeLinecap="round"
      />
      {/* Left leg */}
      <line
        x1="32" y1="75"
        x2={leftLegX} y2={leftLegY}
        stroke={color} strokeWidth="7" strokeLinecap="round"
      />
      {/* Right leg */}
      <line
        x1="48" y1="75"
        x2={rightLegX} y2={rightLegY}
        stroke={color} strokeWidth="7" strokeLinecap="round"
      />
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const BearParade: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const beatDecay = snap.beatDecay;
  const musicalTime = snap.musicalTime;

  // Scale bears proportionally with resolution (designed at 1080p)
  const resScale = height / 1080;
  const BEAR_SIZE = Math.round(BEAR_SIZE_BASE * resScale);
  const BEAR_SPACING = Math.round(BEAR_SPACING_BASE * resScale);

  // Energy tiers determine animation intensity
  const isLow = energy < 0.08;
  const isHigh = energy > 0.2;

  // Opacity: always visible when overlay engine activates, dim during quiet
  const opacity = interpolate(energy, [0.02, 0.1, 0.25], [0.25, 0.55, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Beat-synced step: use musicalTime so bears step ON the beat
  // fractional part gives position within beat cycle
  const beatFrac = musicalTime % 1;
  // Step curve: sharp down on beat, smooth return (like a foot hitting ground)
  const stepCurve = Math.pow(1 - beatFrac, 2);

  // Horizontal drift speed — bears slowly traverse, tempo-scaled
  const driftSpeed = interpolate(energy, [0.02, 0.15, 0.35], [0.15, 0.4, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * tempoFactor;

  const totalWidth = NUM_BEARS * BEAR_SPACING;
  const yBase = height - BEAR_SIZE - Math.round(20 * resScale);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {BEAR_COLORS.map((color, i) => {
        // Each bear has a unique phase offset for organic feel
        const phaseOffset = i * 0.38;

        // Horizontal position: continuous drift with wrap-around
        const rawX = (frame * driftSpeed + i * BEAR_SPACING) % (totalWidth + width);
        const x = rawX - BEAR_SIZE;

        // Beat-synced vertical bob — bears dip DOWN on beat, spring back up
        const bearBeatFrac = (musicalTime + phaseOffset * 0.5) % 1;
        const bearStepCurve = Math.pow(1 - bearBeatFrac, 2);

        let bobAmp: number;
        let bob: number;
        if (isLow) {
          // Low energy: gentle sine sway, barely responsive to beat
          bobAmp = 3 + beatDecay * 4;
          bob = Math.sin((frame * 0.03 * tempoFactor) + phaseOffset) * bobAmp;
        } else if (isHigh) {
          // High energy: exaggerated beat-synced bounce
          bobAmp = 12 + beatDecay * 18;
          bob = -bearStepCurve * bobAmp;
        } else {
          // Mid energy: bouncy walk synced to beat
          bobAmp = 6 + beatDecay * 10;
          bob = -bearStepCurve * bobAmp;
        }

        // Arm swing — driven by beat cycle, intensity scales with energy
        let armSwing: number;
        if (isLow) {
          // Gentle sway
          armSwing = Math.sin((frame * 0.04 * tempoFactor) + phaseOffset) * 0.3;
        } else if (isHigh) {
          // Full groove — arms really going
          armSwing = Math.sin((bearBeatFrac + phaseOffset * 0.3) * Math.PI * 2) * 1.0;
        } else {
          // Moderate swing
          armSwing = Math.sin((bearBeatFrac + phaseOffset * 0.3) * Math.PI * 2) * 0.6;
        }

        // Leg phase — half-beat offset from arms for natural walk
        const legPhase = isLow
          ? (frame * 0.02 * tempoFactor + phaseOffset) * 0.3
          : bearBeatFrac + 0.25 + phaseOffset * 0.1;

        // Head bob — offset from body, synced to beat at higher energies
        let headBob: number;
        if (isLow) {
          headBob = Math.sin((frame * 0.05 * tempoFactor) + phaseOffset + 0.5) * 1.5;
        } else {
          // Head bobs slightly after body (delayed reaction)
          const headBeatFrac = (musicalTime + phaseOffset * 0.5 + 0.1) % 1;
          const headPulse = Math.pow(1 - headBeatFrac, 3);
          headBob = -headPulse * (isHigh ? 6 : 3);
        }

        // Slight body tilt — more pronounced at high energy
        const tiltRange = isLow ? 3 : isHigh ? 12 : 6;
        const tilt = Math.sin((bearBeatFrac + phaseOffset * 0.2) * Math.PI * 2) * tiltRange;

        // Neon glow — brighter on beats
        const glowBase = 8 + beatDecay * 16;
        const glow = `drop-shadow(0 0 ${glowBase}px ${color}) drop-shadow(0 0 ${glowBase * 2.5}px ${color})`;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: yBase + bob,
              transform: `rotate(${tilt}deg)`,
              opacity,
              filter: glow,
              willChange: "transform, opacity",
            }}
          >
            <Bear
              size={BEAR_SIZE}
              color={color}
              armSwing={armSwing}
              legPhase={legPhase}
              headBob={headBob}
            />
          </div>
        );
      })}
    </div>
  );
};
