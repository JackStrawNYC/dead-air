/**
 * WeatherVane — Ornamental weather vane that spins direction with spectral
 * centroid. Classic arrow + rooster silhouette shape. Cardinal direction
 * letters at the crossbar ends. Rotation speed surges on beats.
 * Mounting pole with decorative scrollwork. Neon copper/teal colors.
 * Positioned upper-right. Appears every 70s for 11s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2100; // 70 seconds at 30fps
const DURATION = 330; // 11 seconds visible

interface Props {
  frames: EnhancedFrameData[];
}

export const WeatherVane: React.FC<Props> = ({ frames }) => {
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
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.2, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const fd = frames[idx];

  const cx = width * 0.82;
  const cy = height * 0.2;
  const armLen = Math.min(width, height) * 0.12;

  // Vane direction driven by spectral centroid (0-1 -> 0-360 degrees)
  // Add slow drift + beat kicks
  const baseDirection = fd.centroid * 360;
  const beatKick = fd.beat ? fd.onset * 60 : 0;
  const drift = Math.sin(frame * 0.03) * 20;
  const vaneAngle = baseDirection + drift + beatKick;

  const copper = "#DD8844";
  const teal = "#44DDBB";
  const dark = "#AA6633";
  const pale = "#FFE4CC";

  const glowSize = interpolate(energy, [0.02, 0.3], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pole length below the vane
  const poleLen = armLen * 1.6;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${copper}) drop-shadow(0 0 ${glowSize * 1.5}px ${teal})`,
          willChange: "opacity",
        }}
      >
        {/* Mounting pole */}
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy + poleLen}
          stroke={dark}
          strokeWidth={3}
          opacity={0.5}
          strokeLinecap="round"
        />

        {/* Decorative scrollwork on pole */}
        <path
          d={`M ${cx - 12} ${cy + poleLen * 0.5} Q ${cx - 20} ${cy + poleLen * 0.35} ${cx} ${cy + poleLen * 0.3}`}
          fill="none"
          stroke={copper}
          strokeWidth={1.2}
          opacity={0.3}
        />
        <path
          d={`M ${cx + 12} ${cy + poleLen * 0.5} Q ${cx + 20} ${cy + poleLen * 0.35} ${cx} ${cy + poleLen * 0.3}`}
          fill="none"
          stroke={copper}
          strokeWidth={1.2}
          opacity={0.3}
        />

        {/* Ball ornament at top of pole */}
        <circle cx={cx} cy={cy} r={5} fill={copper} opacity={0.6} />

        {/* Fixed cardinal crossbar */}
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Crossbar arms (N-S, E-W) */}
          <line x1={0} y1={-armLen * 0.55} x2={0} y2={armLen * 0.55} stroke={dark} strokeWidth={1.5} opacity={0.35} />
          <line x1={-armLen * 0.55} y1={0} x2={armLen * 0.55} y2={0} stroke={dark} strokeWidth={1.5} opacity={0.35} />

          {/* Cardinal letters (fixed, don't rotate) */}
          <text x={0} y={-armLen * 0.65} textAnchor="middle" dominantBaseline="central" fill={teal} fontSize={13} fontFamily="serif" fontWeight="bold" opacity={0.7}>
            N
          </text>
          <text x={armLen * 0.65} y={0} textAnchor="middle" dominantBaseline="central" fill={teal} fontSize={12} fontFamily="serif" opacity={0.6}>
            E
          </text>
          <text x={0} y={armLen * 0.65} textAnchor="middle" dominantBaseline="central" fill={teal} fontSize={12} fontFamily="serif" opacity={0.6}>
            S
          </text>
          <text x={-armLen * 0.65} y={0} textAnchor="middle" dominantBaseline="central" fill={teal} fontSize={12} fontFamily="serif" opacity={0.6}>
            W
          </text>
        </g>

        {/* Rotating vane */}
        <g transform={`translate(${cx}, ${cy}) rotate(${vaneAngle})`}>
          {/* Arrow shaft */}
          <line
            x1={-armLen * 0.85}
            y1={0}
            x2={armLen * 0.5}
            y2={0}
            stroke={copper}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.8}
          />

          {/* Arrowhead (pointing right/east when angle=0) */}
          <polygon
            points={`${armLen * 0.85},0 ${armLen * 0.55},-8 ${armLen * 0.55},8`}
            fill={copper}
            opacity={0.8}
          />

          {/* Tail fin (rooster-inspired decorative shape) */}
          <path
            d={`M ${-armLen * 0.85} 0
                L ${-armLen * 0.7} -14
                Q ${-armLen * 0.55} -18 ${-armLen * 0.5} -10
                L ${-armLen * 0.45} 0`}
            fill={copper}
            opacity={0.5}
            stroke={copper}
            strokeWidth={0.8}
          />
          <path
            d={`M ${-armLen * 0.85} 0
                L ${-armLen * 0.7} 10
                Q ${-armLen * 0.55} 14 ${-armLen * 0.5} 6
                L ${-armLen * 0.45} 0`}
            fill={dark}
            opacity={0.35}
            stroke={copper}
            strokeWidth={0.5}
          />
        </g>

        {/* Center pivot */}
        <circle cx={cx} cy={cy} r={3} fill={pale} opacity={0.7} />
      </svg>
    </div>
  );
};
