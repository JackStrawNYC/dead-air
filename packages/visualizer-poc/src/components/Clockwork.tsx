/**
 * Clockwork — Ornate clock face with spinning hands.
 * Roman numeral markers around circle. Hour hand moves slowly, minute hand faster,
 * second hand fastest (driven by energy -- faster energy = faster clock).
 * Pendulum swinging below. Neon gold/amber colors.
 * Positioned upper area. Appears every 75s for 10s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2250; // 75 seconds at 30fps
const DURATION = 300; // 10 seconds visible

const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

interface Props {
  frames: EnhancedFrameData[];
}

export const Clockwork: React.FC<Props> = ({ frames }) => {
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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.3, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Clock positioned upper center
  const cx = width * 0.5;
  const cy = height * 0.28;
  const clockRadius = Math.min(width, height) * 0.16;

  // Speed driven by energy
  const speedMult = 0.5 + energy * 4;

  // Hand angles: accumulate rotation over time
  const secondAngle = frame * speedMult * 2.0; // degrees
  const minuteAngle = frame * speedMult * 0.15;
  const hourAngle = frame * speedMult * 0.012;

  // Pendulum: swings with energy-driven amplitude
  const pendulumLength = clockRadius * 1.4;
  const pendulumAmplitude = 15 + energy * 25; // degrees
  const pendulumFreq = 0.06 + energy * 0.04;
  const pendulumAngle = Math.sin(frame * pendulumFreq) * pendulumAmplitude;

  // Neon gold/amber colors
  const goldColor = "#FFD700";
  const amberColor = "#FFAA00";
  const warmWhite = "#FFF4CC";

  const glowSize = interpolate(energy, [0.03, 0.3], [3, 12], {
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
          filter: `drop-shadow(0 0 ${glowSize}px ${goldColor}) drop-shadow(0 0 ${glowSize * 2}px ${amberColor})`,
          willChange: "opacity",
        }}
      >
        {/* Clock face outline */}
        <circle
          cx={cx}
          cy={cy}
          r={clockRadius}
          fill="none"
          stroke={goldColor}
          strokeWidth={3}
          opacity={0.8}
        />
        {/* Inner decorative ring */}
        <circle
          cx={cx}
          cy={cy}
          r={clockRadius * 0.9}
          fill="none"
          stroke={amberColor}
          strokeWidth={1}
          opacity={0.4}
        />
        {/* Outer decorative ring */}
        <circle
          cx={cx}
          cy={cy}
          r={clockRadius * 1.05}
          fill="none"
          stroke={goldColor}
          strokeWidth={1.5}
          opacity={0.3}
        />

        {/* Roman numeral markers */}
        {ROMAN.map((num, i) => {
          const angle = ((i * 30 - 90) * Math.PI) / 180;
          const textR = clockRadius * 0.75;
          const tx = cx + Math.cos(angle) * textR;
          const ty = cy + Math.sin(angle) * textR;
          const tickInner = clockRadius * 0.88;
          const tickOuter = clockRadius * 0.95;

          return (
            <g key={`numeral-${i}`}>
              {/* Tick mark */}
              <line
                x1={cx + Math.cos(angle) * tickInner}
                y1={cy + Math.sin(angle) * tickInner}
                x2={cx + Math.cos(angle) * tickOuter}
                y2={cy + Math.sin(angle) * tickOuter}
                stroke={goldColor}
                strokeWidth={2}
                opacity={0.7}
              />
              {/* Roman numeral */}
              <text
                x={tx}
                y={ty}
                textAnchor="middle"
                dominantBaseline="central"
                fill={warmWhite}
                fontSize={clockRadius * 0.12}
                fontFamily="serif"
                opacity={0.7}
              >
                {num}
              </text>
            </g>
          );
        })}

        {/* Minute tick marks (60 ticks) */}
        {Array.from({ length: 60 }).map((_, i) => {
          if (i % 5 === 0) return null; // skip hour positions
          const angle = ((i * 6 - 90) * Math.PI) / 180;
          const tickInner = clockRadius * 0.92;
          const tickOuter = clockRadius * 0.95;
          return (
            <line
              key={`tick-${i}`}
              x1={cx + Math.cos(angle) * tickInner}
              y1={cy + Math.sin(angle) * tickInner}
              x2={cx + Math.cos(angle) * tickOuter}
              y2={cy + Math.sin(angle) * tickOuter}
              stroke={amberColor}
              strokeWidth={0.8}
              opacity={0.3}
            />
          );
        })}

        {/* Hour hand */}
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(((hourAngle - 90) * Math.PI) / 180) * clockRadius * 0.5}
          y2={cy + Math.sin(((hourAngle - 90) * Math.PI) / 180) * clockRadius * 0.5}
          stroke={goldColor}
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.9}
        />

        {/* Minute hand */}
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(((minuteAngle - 90) * Math.PI) / 180) * clockRadius * 0.7}
          y2={cy + Math.sin(((minuteAngle - 90) * Math.PI) / 180) * clockRadius * 0.7}
          stroke={amberColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.85}
        />

        {/* Second hand */}
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(((secondAngle - 90) * Math.PI) / 180) * clockRadius * 0.82}
          y2={cy + Math.sin(((secondAngle - 90) * Math.PI) / 180) * clockRadius * 0.82}
          stroke="#FF4444"
          strokeWidth={1.2}
          strokeLinecap="round"
          opacity={0.8}
        />

        {/* Center hub */}
        <circle cx={cx} cy={cy} r={4} fill={goldColor} opacity={0.9} />

        {/* Filigree decorative arcs */}
        {[0, 1, 2, 3].map((q) => {
          const startAngle = q * 90 + 20;
          const endAngle = q * 90 + 70;
          const r = clockRadius * 0.98;
          const x1 = cx + Math.cos((startAngle * Math.PI) / 180) * r;
          const y1 = cy + Math.sin((startAngle * Math.PI) / 180) * r;
          const x2 = cx + Math.cos((endAngle * Math.PI) / 180) * r;
          const y2 = cy + Math.sin((endAngle * Math.PI) / 180) * r;
          return (
            <path
              key={`filigree-${q}`}
              d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
              fill="none"
              stroke={goldColor}
              strokeWidth={0.8}
              opacity={0.2}
            />
          );
        })}

        {/* Pendulum */}
        <g transform={`translate(${cx}, ${cy + clockRadius}) rotate(${pendulumAngle}, 0, 0)`}>
          {/* Pendulum rod */}
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={pendulumLength}
            stroke={goldColor}
            strokeWidth={1.5}
            opacity={0.6}
          />
          {/* Pendulum bob */}
          <circle
            cx={0}
            cy={pendulumLength}
            r={12}
            fill="none"
            stroke={goldColor}
            strokeWidth={2}
            opacity={0.7}
          />
          <circle
            cx={0}
            cy={pendulumLength}
            r={6}
            fill={amberColor}
            opacity={0.5}
          />
        </g>
      </svg>
    </div>
  );
};
