/**
 * FerrisWheel — A large ferris wheel outline at one side of screen.
 * Wheel slowly rotates. 8 gondola circles at evenly spaced points on the rim.
 * Gondolas have tiny lights. Structural spokes from center hub.
 * Neon outline aesthetic -- bright colors on dark.
 * Cycle: 70s, 20s visible.
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

const NUM_GONDOLAS = 8;
const CYCLE_FRAMES = 70 * 30; // 70s
const VISIBLE_FRAMES = 20 * 30; // 20s
const FADE_FRAMES = 60;

interface Props {
  frames: EnhancedFrameData[];
}

export const FerrisWheel: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Gondola light flicker data (useMemo before conditional returns)
  const gondolaData = React.useMemo(() => {
    const rng = seeded(70197708);
    return Array.from({ length: NUM_GONDOLAS }, () => ({
      flickerFreq: 0.05 + rng() * 0.1,
      flickerPhase: rng() * Math.PI * 2,
      lightHue: Math.floor(rng() * 360),
    }));
  }, []);

  // Cycle timing
  const cyclePos = frame % CYCLE_FRAMES;
  const inShowWindow = cyclePos < VISIBLE_FRAMES;

  if (!inShowWindow) return null;

  // Fade envelope
  const fadeIn = interpolate(cyclePos, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cyclePos, [VISIBLE_FRAMES - FADE_FRAMES, VISIBLE_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.55;

  if (masterOpacity < 0.01) return null;

  // Wheel position: right side of screen
  const wheelCx = width * 0.78;
  const wheelCy = height * 0.45;
  const wheelRadius = Math.min(width, height) * 0.25;

  // Rotation speed driven by energy (slow rotation)
  const rotSpeed = interpolate(energy, [0.03, 0.3], [0.15, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rotAngle = frame * rotSpeed; // degrees

  // Neon color: cycles through hues slowly
  const neonHue = (frame * 0.5) % 360;
  const neonColor = `hsla(${neonHue}, 100%, 65%, 0.8)`;
  const neonGlow = `hsla(${neonHue}, 100%, 70%, 0.4)`;
  const neonDim = `hsla(${neonHue}, 80%, 55%, 0.4)`;

  // Support structure: A-frame legs
  const legLeftX = wheelCx - wheelRadius * 0.4;
  const legRightX = wheelCx + wheelRadius * 0.4;
  const legBottomY = wheelCy + wheelRadius + wheelRadius * 0.5;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 6px ${neonGlow}) drop-shadow(0 0 20px ${neonGlow})`,
        }}
      >
        {/* Support structure: A-frame */}
        <line
          x1={wheelCx}
          y1={wheelCy}
          x2={legLeftX}
          y2={legBottomY}
          stroke={neonDim}
          strokeWidth={2.5}
        />
        <line
          x1={wheelCx}
          y1={wheelCy}
          x2={legRightX}
          y2={legBottomY}
          stroke={neonDim}
          strokeWidth={2.5}
        />
        {/* Cross brace */}
        <line
          x1={legLeftX + (wheelCx - legLeftX) * 0.5}
          y1={(wheelCy + legBottomY) * 0.55}
          x2={legRightX - (legRightX - wheelCx) * 0.5}
          y2={(wheelCy + legBottomY) * 0.55}
          stroke={neonDim}
          strokeWidth={1.5}
        />

        {/* Main wheel rim */}
        <circle
          cx={wheelCx}
          cy={wheelCy}
          r={wheelRadius}
          fill="none"
          stroke={neonColor}
          strokeWidth={2}
        />
        {/* Inner structural ring */}
        <circle
          cx={wheelCx}
          cy={wheelCy}
          r={wheelRadius * 0.7}
          fill="none"
          stroke={neonDim}
          strokeWidth={1}
        />

        {/* Hub */}
        <circle
          cx={wheelCx}
          cy={wheelCy}
          r={8}
          fill={neonDim}
          stroke={neonColor}
          strokeWidth={2}
        />

        {/* Spokes and gondolas */}
        {Array.from({ length: NUM_GONDOLAS }, (_, gi) => {
          const angleOffset = (gi / NUM_GONDOLAS) * 360;
          const angleRad = ((rotAngle + angleOffset) * Math.PI) / 180;

          // Gondola position on rim
          const gx = wheelCx + Math.cos(angleRad) * wheelRadius;
          const gy = wheelCy + Math.sin(angleRad) * wheelRadius;

          // Spoke to gondola
          const spokeColor = `hsla(${neonHue}, 70%, 55%, 0.35)`;

          // Gondola light flicker
          const gd = gondolaData[gi];
          const flicker =
            0.6 +
            Math.sin(frame * gd.flickerFreq + gd.flickerPhase) * 0.3 +
            Math.sin(frame * gd.flickerFreq * 2.1 + gd.flickerPhase * 0.6) * 0.1;

          const gondolaHue = gd.lightHue;
          const gondolaSize = 10;

          return (
            <g key={gi}>
              {/* Spoke from hub to rim */}
              <line
                x1={wheelCx}
                y1={wheelCy}
                x2={gx}
                y2={gy}
                stroke={spokeColor}
                strokeWidth={1}
              />
              {/* Cross-spoke (structural) */}
              <line
                x1={wheelCx + Math.cos(angleRad) * wheelRadius * 0.7}
                y1={wheelCy + Math.sin(angleRad) * wheelRadius * 0.7}
                x2={wheelCx + Math.cos(angleRad + Math.PI / NUM_GONDOLAS) * wheelRadius * 0.7}
                y2={wheelCy + Math.sin(angleRad + Math.PI / NUM_GONDOLAS) * wheelRadius * 0.7}
                stroke={spokeColor}
                strokeWidth={0.5}
              />
              {/* Gondola hanger */}
              <line
                x1={gx}
                y1={gy}
                x2={gx}
                y2={gy + 12}
                stroke={neonDim}
                strokeWidth={1}
              />
              {/* Gondola body (small rounded rect shape via circle) */}
              <circle
                cx={gx}
                cy={gy + 12 + gondolaSize / 2}
                r={gondolaSize}
                fill={`hsla(${gondolaHue}, 60%, 20%, 0.3)`}
                stroke={`hsla(${gondolaHue}, 80%, 65%, ${0.5 * flicker})`}
                strokeWidth={1.2}
              />
              {/* Gondola light (tiny bright dot) */}
              <circle
                cx={gx}
                cy={gy + 12 + gondolaSize / 2}
                r={3}
                fill={`hsla(${gondolaHue}, 100%, 80%, ${0.7 * flicker})`}
              />
            </g>
          );
        })}

        {/* Rim lights: tiny dots at regular intervals */}
        {Array.from({ length: NUM_GONDOLAS * 3 }, (_, li) => {
          const lightAngle = ((rotAngle + (li / (NUM_GONDOLAS * 3)) * 360) * Math.PI) / 180;
          const lx = wheelCx + Math.cos(lightAngle) * wheelRadius;
          const ly = wheelCy + Math.sin(lightAngle) * wheelRadius;
          const lightFlicker = 0.4 + Math.sin(frame * 0.08 + li * 1.3) * 0.3;

          return (
            <circle
              key={`rl-${li}`}
              cx={lx}
              cy={ly}
              r={1.5}
              fill={`hsla(${(neonHue + li * 15) % 360}, 100%, 80%, ${lightFlicker})`}
            />
          );
        })}
      </svg>
    </div>
  );
};
