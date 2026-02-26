/**
 * PsychedelicBorder — art nouveau / 60s Fillmore poster style ornate frame.
 * Flowing organic curves with color-cycling neon edges.
 * Breathes with energy — thicker/brighter during peaks.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

interface Props {
  frames: EnhancedFrameData[];
}

export const PsychedelicBorder: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 60); i <= Math.min(frames.length - 1, idx + 60); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Color cycling
  const hue1 = (frame * 0.8) % 360;
  const hue2 = (hue1 + 120) % 360;
  const hue3 = (hue1 + 240) % 360;

  const color1 = `hsl(${hue1}, 100%, 60%)`;
  const color2 = `hsl(${hue2}, 100%, 60%)`;
  const color3 = `hsl(${hue3}, 100%, 60%)`;

  // Border thickness breathes with energy
  const borderWidth = interpolate(energy, [0.03, 0.3], [3, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = interpolate(energy, [0.02, 0.25], [0.2, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowRadius = interpolate(energy, [0.05, 0.3], [5, 20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const margin = 12;
  const cornerR = 30;
  const w = width - margin * 2;
  const h = height - margin * 2;

  // Art nouveau corner flourishes — organic curves at each corner
  const flourishSize = 60 + energy * 40;
  const wave = Math.sin(frame * 0.05) * 8;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${color1}) drop-shadow(0 0 ${glowRadius * 1.5}px ${color2})`,
        }}
      >
        <defs>
          <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color1} />
            <stop offset="33%" stopColor={color2} />
            <stop offset="66%" stopColor={color3} />
            <stop offset="100%" stopColor={color1} />
          </linearGradient>
        </defs>

        {/* Main border rectangle with rounded corners */}
        <rect
          x={margin}
          y={margin}
          width={w}
          height={h}
          rx={cornerR}
          ry={cornerR}
          stroke="url(#borderGrad)"
          strokeWidth={borderWidth}
        />

        {/* Inner border (thinner, offset) */}
        <rect
          x={margin + 10}
          y={margin + 10}
          width={w - 20}
          height={h - 20}
          rx={cornerR - 5}
          ry={cornerR - 5}
          stroke="url(#borderGrad)"
          strokeWidth={borderWidth * 0.4}
          opacity="0.5"
        />

        {/* Top-left corner flourish */}
        <path
          d={`M ${margin + cornerR} ${margin}
            Q ${margin + cornerR - wave} ${margin - flourishSize * 0.3}
              ${margin - flourishSize * 0.2} ${margin + cornerR - wave}
            M ${margin} ${margin + cornerR}
            Q ${margin - flourishSize * 0.3} ${margin + cornerR - wave}
              ${margin + cornerR - wave} ${margin - flourishSize * 0.2}`}
          stroke={color1}
          strokeWidth={borderWidth * 0.6}
          strokeLinecap="round"
        />

        {/* Top-right corner flourish */}
        <path
          d={`M ${width - margin - cornerR} ${margin}
            Q ${width - margin - cornerR + wave} ${margin - flourishSize * 0.3}
              ${width - margin + flourishSize * 0.2} ${margin + cornerR + wave}
            M ${width - margin} ${margin + cornerR}
            Q ${width - margin + flourishSize * 0.3} ${margin + cornerR + wave}
              ${width - margin - cornerR + wave} ${margin - flourishSize * 0.2}`}
          stroke={color2}
          strokeWidth={borderWidth * 0.6}
          strokeLinecap="round"
        />

        {/* Bottom-left corner flourish */}
        <path
          d={`M ${margin + cornerR} ${height - margin}
            Q ${margin + cornerR - wave} ${height - margin + flourishSize * 0.3}
              ${margin - flourishSize * 0.2} ${height - margin - cornerR + wave}`}
          stroke={color3}
          strokeWidth={borderWidth * 0.6}
          strokeLinecap="round"
        />

        {/* Bottom-right corner flourish */}
        <path
          d={`M ${width - margin - cornerR} ${height - margin}
            Q ${width - margin - cornerR + wave} ${height - margin + flourishSize * 0.3}
              ${width - margin + flourishSize * 0.2} ${height - margin - cornerR - wave}`}
          stroke={color1}
          strokeWidth={borderWidth * 0.6}
          strokeLinecap="round"
        />

        {/* Top center ornament — small diamond/star */}
        <g transform={`translate(${width / 2}, ${margin}) rotate(${frame * 0.5})`}>
          <polygon points="0,-12 4,0 0,12 -4,0" fill={color2} opacity="0.7" />
          <polygon points="-12,0 0,4 12,0 0,-4" fill={color2} opacity="0.7" />
        </g>

        {/* Bottom center ornament */}
        <g transform={`translate(${width / 2}, ${height - margin}) rotate(${-frame * 0.5})`}>
          <polygon points="0,-12 4,0 0,12 -4,0" fill={color3} opacity="0.7" />
          <polygon points="-12,0 0,4 12,0 0,-4" fill={color3} opacity="0.7" />
        </g>
      </svg>
    </div>
  );
};
