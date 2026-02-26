/**
 * CompassRose — Ornate compass rose with 8 directional points (N/NE/E/SE/S/SW/W/NW).
 * The entire rose slowly rotates. Needle spins and wobbles, settling direction based
 * on dominant frequency band. Decorative filigree details. Neon colors.
 * Appears every 70s for 12s. Positioned center.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2100; // 70 seconds at 30fps
const DURATION = 360; // 12 seconds visible

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

interface Props {
  frames: EnhancedFrameData[];
}

export const CompassRose: React.FC<Props> = ({ frames }) => {
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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const roseRadius = Math.min(width, height) * 0.2;

  const fd = frames[idx];

  // Dominant band determines needle target direction
  const bands = [fd.sub, fd.low, fd.mid, fd.high];
  let maxBand = 0;
  let maxVal = bands[0];
  for (let b = 1; b < bands.length; b++) {
    if (bands[b] > maxVal) {
      maxVal = bands[b];
      maxBand = b;
    }
  }
  // Map band index to angle: sub=N(0), low=E(90), mid=S(180), high=W(270)
  const targetAngle = maxBand * 90;

  // Needle with wobble: oscillate around target, damping over time
  const wobble = Math.sin(frame * 0.15) * (20 * (1 - energy)) + Math.sin(frame * 0.07) * 10;
  const needleAngle = targetAngle + wobble;

  // Slow overall rotation
  const roseRotation = frame * 0.15;

  // Neon color scheme
  const primaryColor = "#00FFFF";
  const secondaryColor = "#FF00FF";
  const accentColor = "#FFFF00";
  const warmColor = "#FF8844";

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
          filter: `drop-shadow(0 0 ${glowSize}px ${primaryColor}) drop-shadow(0 0 ${glowSize * 1.5}px ${secondaryColor})`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy}) rotate(${roseRotation})`}>
          {/* Outer decorative circles */}
          <circle cx={0} cy={0} r={roseRadius * 1.1} fill="none" stroke={primaryColor} strokeWidth={1} opacity={0.2} />
          <circle cx={0} cy={0} r={roseRadius * 1.05} fill="none" stroke={secondaryColor} strokeWidth={0.8} opacity={0.15} />
          <circle cx={0} cy={0} r={roseRadius} fill="none" stroke={primaryColor} strokeWidth={2} opacity={0.5} />

          {/* 8 directional points (star shape) */}
          {DIRECTIONS.map((dir, di) => {
            const angle = (di * 45 * Math.PI) / 180;
            const isCardinal = di % 2 === 0;
            const pointLen = isCardinal ? roseRadius * 0.9 : roseRadius * 0.6;
            const baseLen = roseRadius * 0.15;
            const spreadAngle = isCardinal ? 0.18 : 0.25;

            // Diamond/kite shape for each point
            const tipX = Math.cos(angle) * pointLen;
            const tipY = Math.sin(angle) * pointLen;
            const leftAngle = angle - spreadAngle;
            const rightAngle = angle + spreadAngle;
            const leftX = Math.cos(leftAngle) * baseLen;
            const leftY = Math.sin(leftAngle) * baseLen;
            const rightX = Math.cos(rightAngle) * baseLen;
            const rightY = Math.sin(rightAngle) * baseLen;

            const pointColor = isCardinal ? primaryColor : accentColor;
            const textR = roseRadius * (isCardinal ? 1.18 : 1.12);
            const textX = Math.cos(angle) * textR;
            const textY = Math.sin(angle) * textR;

            return (
              <g key={`dir-${di}`}>
                {/* Point shape */}
                <polygon
                  points={`${tipX},${tipY} ${leftX},${leftY} 0,0 ${rightX},${rightY}`}
                  fill={pointColor}
                  opacity={isCardinal ? 0.4 : 0.2}
                  stroke={pointColor}
                  strokeWidth={1}
                />
                {/* Direction label */}
                <text
                  x={textX}
                  y={textY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={pointColor}
                  fontSize={isCardinal ? 14 : 10}
                  fontFamily="serif"
                  fontWeight={isCardinal ? "bold" : "normal"}
                  opacity={0.7}
                  transform={`rotate(${-roseRotation}, ${textX}, ${textY})`}
                >
                  {dir}
                </text>
              </g>
            );
          })}

          {/* Decorative filigree: small arcs between cardinal points */}
          {[0, 1, 2, 3].map((q) => {
            const startDeg = q * 90 + 15;
            const endDeg = q * 90 + 75;
            const r = roseRadius * 0.45;
            const x1 = Math.cos((startDeg * Math.PI) / 180) * r;
            const y1 = Math.sin((startDeg * Math.PI) / 180) * r;
            const x2 = Math.cos((endDeg * Math.PI) / 180) * r;
            const y2 = Math.sin((endDeg * Math.PI) / 180) * r;
            return (
              <path
                key={`filigree-${q}`}
                d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                fill="none"
                stroke={secondaryColor}
                strokeWidth={0.8}
                opacity={0.2}
              />
            );
          })}

          {/* Inner decorative ring */}
          <circle cx={0} cy={0} r={roseRadius * 0.3} fill="none" stroke={primaryColor} strokeWidth={1} opacity={0.3} />

          {/* Needle (rotates independently within the rose) */}
          <g transform={`rotate(${needleAngle - roseRotation})`}>
            {/* North (red) half of needle */}
            <polygon
              points={`0,${-roseRadius * 0.75} ${-4},0 0,${roseRadius * 0.12} ${4},0`}
              fill={warmColor}
              opacity={0.8}
              stroke={warmColor}
              strokeWidth={0.5}
            />
            {/* South (cyan) half of needle */}
            <polygon
              points={`0,${roseRadius * 0.75} ${-4},0 0,${-roseRadius * 0.12} ${4},0`}
              fill={primaryColor}
              opacity={0.5}
              stroke={primaryColor}
              strokeWidth={0.5}
            />
          </g>

          {/* Center pin */}
          <circle cx={0} cy={0} r={5} fill={primaryColor} opacity={0.8} />
          <circle cx={0} cy={0} r={2.5} fill="white" opacity={0.5} />
        </g>
      </svg>
    </div>
  );
};
