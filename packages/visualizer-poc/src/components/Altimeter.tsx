/**
 * Altimeter — Vintage altimeter gauge that climbs with energy.
 * Circular dial with altitude markings (0-10k). Main needle rises with
 * rolling energy, bounces on beats. Small inner dial (100s digit) rotates
 * faster. Kollsman window shows barometric pressure (centroid-mapped).
 * Neon amber/green colors. Positioned lower-right. Appears every 60s for 13s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1800; // 60 seconds at 30fps
const DURATION = 390; // 13 seconds visible

interface Props {
  frames: EnhancedFrameData[];
}

export const Altimeter: React.FC<Props> = ({ frames }) => {
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
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.2, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const fd = frames[idx];
  const cx = width * 0.78;
  const cy = height * 0.72;
  const radius = Math.min(width, height) * 0.16;

  // Altitude = energy mapped to 0-10000 ft, with beat bounce
  const altitudeBase = energy * 10000;
  const beatBounce = fd.beat ? fd.onset * 800 : 0;
  const altitude = Math.min(10000, altitudeBase + beatBounce);

  // Main needle: 0-10000 ft = 0-360 degrees (one revolution per 10k)
  const mainNeedleAngle = (altitude / 10000) * 360;

  // Hundreds needle (inner dial): rotates 10x faster
  const hundredsAngle = ((altitude % 1000) / 1000) * 360;

  // Kollsman window: barometric pressure from spectral centroid
  const baroPressure = interpolate(fd.centroid, [0, 1], [28.5, 31.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const amber = "#FFAA00";
  const green = "#44FF88";
  const pale = "#FFF4CC";

  const glowSize = interpolate(energy, [0.02, 0.3], [2, 10], {
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
          filter: `drop-shadow(0 0 ${glowSize}px ${amber}) drop-shadow(0 0 ${glowSize * 1.5}px ${green})`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Outer bezel */}
          <circle cx={0} cy={0} r={radius * 1.08} fill="none" stroke={amber} strokeWidth={2} opacity={0.3} />
          <circle cx={0} cy={0} r={radius} fill="none" stroke={amber} strokeWidth={2.5} opacity={0.6} />

          {/* Altitude markings: 0-9 around the dial */}
          {Array.from({ length: 10 }, (_, i) => {
            const deg = i * 36 - 90; // 0 at top
            const rad = (deg * Math.PI) / 180;
            const textR = radius * 0.78;
            const tickInner = radius * 0.88;
            const tickOuter = radius * 0.96;
            return (
              <g key={`alt-${i}`}>
                <line
                  x1={Math.cos(rad) * tickInner}
                  y1={Math.sin(rad) * tickInner}
                  x2={Math.cos(rad) * tickOuter}
                  y2={Math.sin(rad) * tickOuter}
                  stroke={amber}
                  strokeWidth={2}
                  opacity={0.7}
                />
                <text
                  x={Math.cos(rad) * textR}
                  y={Math.sin(rad) * textR}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={pale}
                  fontSize={radius * 0.13}
                  fontFamily="monospace"
                  opacity={0.8}
                >
                  {i}
                </text>
              </g>
            );
          })}

          {/* Minor ticks (every 500 ft = every 18 degrees) */}
          {Array.from({ length: 20 }, (_, i) => {
            if (i % 2 === 0) return null; // skip major marks
            const deg = i * 18 - 90;
            const rad = (deg * Math.PI) / 180;
            return (
              <line
                key={`minor-${i}`}
                x1={Math.cos(rad) * radius * 0.92}
                y1={Math.sin(rad) * radius * 0.92}
                x2={Math.cos(rad) * radius * 0.96}
                y2={Math.sin(rad) * radius * 0.96}
                stroke={amber}
                strokeWidth={1}
                opacity={0.35}
              />
            );
          })}

          {/* Kollsman window (barometric pressure) */}
          <rect
            x={radius * 0.15}
            y={-radius * 0.09}
            width={radius * 0.38}
            height={radius * 0.18}
            rx={3}
            fill="none"
            stroke={green}
            strokeWidth={1}
            opacity={0.5}
          />
          <text
            x={radius * 0.34}
            y={0}
            textAnchor="middle"
            dominantBaseline="central"
            fill={green}
            fontSize={radius * 0.09}
            fontFamily="monospace"
            opacity={0.7}
          >
            {baroPressure.toFixed(2)}
          </text>

          {/* Inner hundreds dial */}
          <circle cx={0} cy={radius * 0.25} r={radius * 0.2} fill="none" stroke={green} strokeWidth={1} opacity={0.3} />
          <g transform={`translate(0, ${radius * 0.25}) rotate(${hundredsAngle})`}>
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={-radius * 0.16}
              stroke={green}
              strokeWidth={1.5}
              strokeLinecap="round"
              opacity={0.7}
            />
          </g>
          <circle cx={0} cy={radius * 0.25} r={2} fill={green} opacity={0.7} />

          {/* Main needle */}
          <g transform={`rotate(${mainNeedleAngle})`}>
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={-radius * 0.85}
              stroke={pale}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.9}
            />
            {/* Counterweight */}
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={radius * 0.15}
              stroke={pale}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.6}
            />
          </g>

          {/* Center hub */}
          <circle cx={0} cy={0} r={5} fill={amber} opacity={0.9} />
          <circle cx={0} cy={0} r={2.5} fill={pale} opacity={0.6} />

          {/* Label */}
          <text
            x={0}
            y={-radius * 0.35}
            textAnchor="middle"
            dominantBaseline="central"
            fill={amber}
            fontSize={radius * 0.07}
            fontFamily="monospace"
            letterSpacing={2}
            opacity={0.5}
          >
            ALT FT
          </text>
        </g>
      </svg>
    </div>
  );
};
