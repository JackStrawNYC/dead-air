/**
 * Compass — Animated compass needle that swings with beat energy.
 * Cardinal directions (N/S/E/W) rotate slowly around the dial.
 * Needle swings toward dominant frequency band, oscillating on beats.
 * Degree markings around the bezel. Neon teal/magenta colors.
 * Positioned center-left. Appears every 55s for 14s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1650; // 55 seconds at 30fps
const DURATION = 420; // 14 seconds visible

interface Props {
  frames: EnhancedFrameData[];
}

export const Compass: React.FC<Props> = ({ frames }) => {
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

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.2, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width * 0.35;
  const cy = height * 0.5;
  const radius = Math.min(width, height) * 0.17;

  const fd = frames[idx];

  // Dominant band drives needle target: sub=N(0), low=E(90), mid=S(180), high=W(270)
  const bands = [fd.sub, fd.low, fd.mid, fd.high];
  let maxBandIdx = 0;
  for (let b = 1; b < bands.length; b++) {
    if (bands[b] > bands[maxBandIdx]) maxBandIdx = b;
  }
  const targetDeg = maxBandIdx * 90;

  // Beat-driven wobble
  const beatKick = fd.beat ? 30 * fd.onset : 0;
  const wobble = Math.sin(frame * 0.12) * (15 * (1 - energy)) + beatKick * Math.sin(frame * 0.3);
  const needleAngle = targetDeg + wobble;

  // Slow cardinal rotation
  const cardinalRotation = frame * 0.08;

  const teal = "#00E5FF";
  const magenta = "#FF00DD";
  const pale = "#CCF0FF";

  const glowSize = interpolate(energy, [0.02, 0.3], [2, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const CARDINALS = ["N", "E", "S", "W"];

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${teal}) drop-shadow(0 0 ${glowSize * 1.5}px ${magenta})`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Outer bezel */}
          <circle cx={0} cy={0} r={radius * 1.08} fill="none" stroke={teal} strokeWidth={2} opacity={0.35} />
          <circle cx={0} cy={0} r={radius} fill="none" stroke={teal} strokeWidth={2.5} opacity={0.6} />

          {/* Degree markings (every 10 degrees) */}
          {Array.from({ length: 36 }, (_, di) => {
            const deg = di * 10;
            const rad = ((deg - 90) * Math.PI) / 180;
            const isMajor = deg % 90 === 0;
            const isMinor = deg % 30 === 0 && !isMajor;
            const inner = radius * (isMajor ? 0.85 : isMinor ? 0.9 : 0.93);
            const outer = radius * 0.97;
            return (
              <line
                key={`deg-${di}`}
                x1={Math.cos(rad) * inner}
                y1={Math.sin(rad) * inner}
                x2={Math.cos(rad) * outer}
                y2={Math.sin(rad) * outer}
                stroke={isMajor ? teal : magenta}
                strokeWidth={isMajor ? 2 : isMinor ? 1 : 0.5}
                opacity={isMajor ? 0.7 : isMinor ? 0.4 : 0.2}
              />
            );
          })}

          {/* Rotating cardinal letters */}
          <g transform={`rotate(${cardinalRotation})`}>
            {CARDINALS.map((dir, di) => {
              const ang = ((di * 90 - 90) * Math.PI) / 180;
              const tr = radius * 0.75;
              const tx = Math.cos(ang) * tr;
              const ty = Math.sin(ang) * tr;
              return (
                <text
                  key={`card-${di}`}
                  x={tx}
                  y={ty}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={teal}
                  fontSize={16}
                  fontFamily="serif"
                  fontWeight="bold"
                  opacity={0.8}
                  transform={`rotate(${-cardinalRotation}, ${tx}, ${ty})`}
                >
                  {dir}
                </text>
              );
            })}
          </g>

          {/* Inner ring */}
          <circle cx={0} cy={0} r={radius * 0.55} fill="none" stroke={magenta} strokeWidth={0.8} opacity={0.2} />

          {/* Needle */}
          <g transform={`rotate(${needleAngle})`}>
            {/* North pointer (warm) */}
            <polygon
              points={`0,${-radius * 0.8} -5,0 0,${radius * 0.1} 5,0`}
              fill={magenta}
              opacity={0.75}
              stroke={magenta}
              strokeWidth={0.5}
            />
            {/* South pointer (cool) */}
            <polygon
              points={`0,${radius * 0.6} -4,0 0,${-radius * 0.08} 4,0`}
              fill={teal}
              opacity={0.4}
              stroke={teal}
              strokeWidth={0.5}
            />
          </g>

          {/* Center pin */}
          <circle cx={0} cy={0} r={5} fill={teal} opacity={0.9} />
          <circle cx={0} cy={0} r={2.5} fill={pale} opacity={0.6} />
        </g>
      </svg>
    </div>
  );
};
