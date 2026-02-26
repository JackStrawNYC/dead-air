/**
 * FlightInstruments — Artificial horizon (attitude indicator) paired with
 * airspeed indicator. Pitch driven by low/sub balance, roll by left/right
 * spectral balance (mid vs high). Airspeed needle maps to overall energy.
 * Sky/ground split in the horizon. Neon cyan/orange colors.
 * Positioned upper-left. Appears every 65s for 15s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1950; // 65 seconds at 30fps
const DURATION = 450; // 15 seconds visible

interface Props {
  frames: EnhancedFrameData[];
}

export const FlightInstruments: React.FC<Props> = ({ frames }) => {
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
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.2, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const fd = frames[idx];
  const gaugeR = Math.min(width, height) * 0.12;

  // Attitude indicator position
  const ahCx = width * 0.18;
  const ahCy = height * 0.22;

  // Airspeed indicator position
  const asCx = width * 0.18;
  const asCy = height * 0.22 + gaugeR * 2.7;

  // Pitch: sub/low balance -> -30 to +30 degrees
  const pitch = interpolate(fd.sub - fd.mid, [-1, 1], [-30, 30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Roll: mid vs high -> -45 to +45 degrees
  const roll = interpolate(fd.mid - fd.high, [-1, 1], [-45, 45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Airspeed: 0-250 kts mapped from energy
  const airspeed = energy * 250;
  const asNeedleAngle = interpolate(airspeed, [0, 250], [-135, 135], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cyan = "#00E5FF";
  const orange = "#FF8800";
  const skyBlue = "rgba(0, 120, 255, 0.3)";
  const groundBrown = "rgba(140, 80, 20, 0.3)";
  const pale = "#E0F8FF";

  const glowSize = interpolate(energy, [0.02, 0.3], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pitch offset in pixels for horizon line
  const pitchPx = (pitch / 90) * gaugeR * 2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${cyan}) drop-shadow(0 0 ${glowSize * 1.5}px ${orange})`,
          willChange: "opacity",
        }}
      >
        <defs>
          <clipPath id="ah-clip">
            <circle cx={ahCx} cy={ahCy} r={gaugeR * 0.92} />
          </clipPath>
        </defs>

        {/* === ATTITUDE INDICATOR === */}
        <circle cx={ahCx} cy={ahCy} r={gaugeR * 1.06} fill="none" stroke={cyan} strokeWidth={2} opacity={0.3} />
        <circle cx={ahCx} cy={ahCy} r={gaugeR} fill="none" stroke={cyan} strokeWidth={2.5} opacity={0.6} />

        {/* Sky/Ground with roll and pitch */}
        <g clipPath="url(#ah-clip)">
          <g transform={`translate(${ahCx}, ${ahCy}) rotate(${roll})`}>
            {/* Sky */}
            <rect x={-gaugeR * 2} y={-gaugeR * 2 + pitchPx} width={gaugeR * 4} height={gaugeR * 2} fill={skyBlue} />
            {/* Ground */}
            <rect x={-gaugeR * 2} y={pitchPx} width={gaugeR * 4} height={gaugeR * 2} fill={groundBrown} />
            {/* Horizon line */}
            <line x1={-gaugeR * 2} y1={pitchPx} x2={gaugeR * 2} y2={pitchPx} stroke={pale} strokeWidth={1.5} opacity={0.8} />

            {/* Pitch ladder lines */}
            {[-20, -10, 10, 20].map((deg) => {
              const py = pitchPx - (deg / 90) * gaugeR * 2;
              const halfW = gaugeR * (Math.abs(deg) === 10 ? 0.25 : 0.35);
              return (
                <g key={`pitch-${deg}`}>
                  <line x1={-halfW} y1={py} x2={halfW} y2={py} stroke={pale} strokeWidth={1} opacity={0.5} />
                  <text x={halfW + 5} y={py} fill={pale} fontSize={8} fontFamily="monospace" dominantBaseline="central" opacity={0.4}>
                    {Math.abs(deg)}
                  </text>
                </g>
              );
            })}
          </g>
        </g>

        {/* Fixed aircraft symbol (wings + center dot) */}
        <line x1={ahCx - gaugeR * 0.4} y1={ahCy} x2={ahCx - gaugeR * 0.12} y2={ahCy} stroke={orange} strokeWidth={3} strokeLinecap="round" opacity={0.9} />
        <line x1={ahCx + gaugeR * 0.12} y1={ahCy} x2={ahCx + gaugeR * 0.4} y2={ahCy} stroke={orange} strokeWidth={3} strokeLinecap="round" opacity={0.9} />
        <circle cx={ahCx} cy={ahCy} r={3} fill={orange} opacity={0.9} />

        {/* Roll arc at top */}
        {[-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const inner = gaugeR * 0.92;
          const outer = gaugeR * (deg % 30 === 0 ? 1.0 : 0.96);
          return (
            <line
              key={`roll-${deg}`}
              x1={ahCx + Math.cos(rad) * inner}
              y1={ahCy + Math.sin(rad) * inner}
              x2={ahCx + Math.cos(rad) * outer}
              y2={ahCy + Math.sin(rad) * outer}
              stroke={cyan}
              strokeWidth={deg === 0 ? 2 : 1}
              opacity={deg === 0 ? 0.8 : 0.4}
            />
          );
        })}

        {/* === AIRSPEED INDICATOR === */}
        <circle cx={asCx} cy={asCy} r={gaugeR * 1.06} fill="none" stroke={cyan} strokeWidth={2} opacity={0.3} />
        <circle cx={asCx} cy={asCy} r={gaugeR} fill="none" stroke={cyan} strokeWidth={2.5} opacity={0.6} />

        {/* Speed markings: 0-250 in increments of 50 */}
        {Array.from({ length: 6 }, (_, i) => {
          const spd = i * 50;
          const ang = interpolate(spd, [0, 250], [-135, 135], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const rad = ((ang - 90) * Math.PI) / 180;
          const inner = gaugeR * 0.82;
          const outer = gaugeR * 0.94;
          const textR = gaugeR * 0.7;
          return (
            <g key={`spd-${i}`}>
              <line
                x1={asCx + Math.cos(rad) * inner}
                y1={asCy + Math.sin(rad) * inner}
                x2={asCx + Math.cos(rad) * outer}
                y2={asCy + Math.sin(rad) * outer}
                stroke={cyan}
                strokeWidth={2}
                opacity={0.6}
              />
              <text
                x={asCx + Math.cos(rad) * textR}
                y={asCy + Math.sin(rad) * textR}
                textAnchor="middle"
                dominantBaseline="central"
                fill={pale}
                fontSize={gaugeR * 0.11}
                fontFamily="monospace"
                opacity={0.7}
              >
                {spd}
              </text>
            </g>
          );
        })}

        {/* Airspeed needle */}
        <g transform={`translate(${asCx}, ${asCy}) rotate(${asNeedleAngle})`}>
          <line x1={0} y1={0} x2={0} y2={-gaugeR * 0.82} stroke={orange} strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />
        </g>
        <circle cx={asCx} cy={asCy} r={4} fill={orange} opacity={0.85} />

        {/* Label */}
        <text
          x={asCx}
          y={asCy + gaugeR * 0.3}
          textAnchor="middle"
          dominantBaseline="central"
          fill={cyan}
          fontSize={gaugeR * 0.08}
          fontFamily="monospace"
          letterSpacing={1}
          opacity={0.5}
        >
          AIRSPEED KTS
        </text>
      </svg>
    </div>
  );
};
