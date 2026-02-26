/**
 * SpectrumAnalyzer — Classic EQ frequency bar visualizer.
 * 7 vertical bars (one per spectral contrast band). Each bar height driven by
 * its contrast band value (smoothed). Rainbow neon coloring left to right.
 * Bar tops have a bright "peak hold" dot that rises fast and falls slowly.
 * Positioned along the bottom. Energy drives overall brightness.
 * Always visible at low opacity during playback.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const BAR_COLORS = [
  "#FF0040",  // Band 0 — hot pink/red
  "#FF6600",  // Band 1 — orange
  "#FFCC00",  // Band 2 — yellow
  "#00FF66",  // Band 3 — green
  "#00CCFF",  // Band 4 — cyan
  "#6644FF",  // Band 5 — purple
  "#FF00FF",  // Band 6 — magenta
];

const GLOW_COLORS = [
  "rgba(255,0,64,0.6)",
  "rgba(255,102,0,0.6)",
  "rgba(255,204,0,0.6)",
  "rgba(0,255,102,0.6)",
  "rgba(0,204,255,0.6)",
  "rgba(102,68,255,0.6)",
  "rgba(255,0,255,0.6)",
];

const NUM_BANDS = 7;
const PEAK_FALL_SPEED = 0.012; // How fast the peak dot falls per frame (normalized)

interface Props {
  frames: EnhancedFrameData[];
}

export const SpectrumAnalyzer: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy window: idx-75 to idx+75
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const fd = frames[idx];

  // Smoothed band values: average over a small lookback window (5 frames)
  const smoothedBands: number[] = [];
  for (let b = 0; b < NUM_BANDS; b++) {
    let sum = 0;
    let cnt = 0;
    for (let j = Math.max(0, idx - 4); j <= idx; j++) {
      sum += frames[j].contrast[b];
      cnt++;
    }
    smoothedBands.push(cnt > 0 ? sum / cnt : 0);
  }

  // Peak hold: compute by scanning backward to find maximum within last ~30 frames,
  // then apply gradual fall from that peak
  const peakValues: number[] = [];
  for (let b = 0; b < NUM_BANDS; b++) {
    let peak = 0;
    for (let j = Math.max(0, idx - 30); j <= idx; j++) {
      const val = frames[j].contrast[b];
      // Apply decay: older values decay
      const age = idx - j;
      const decayed = val - age * PEAK_FALL_SPEED;
      if (decayed > peak) {
        peak = decayed;
      }
    }
    peakValues.push(Math.max(peak, smoothedBands[b]));
  }

  // Layout
  const barAreaWidth = width * 0.6;
  const barAreaLeft = (width - barAreaWidth) / 2;
  const barAreaBottom = height - 30;
  const maxBarHeight = height * 0.35;
  const barSpacing = barAreaWidth / NUM_BANDS;
  const barWidth = barSpacing * 0.65;
  const peakDotHeight = 4;

  // Opacity: always visible, scaled by energy
  const opacity = interpolate(energy, [0.01, 0.2], [0.15, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Glow intensity
  const glowSize = interpolate(energy, [0.03, 0.3], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Brightness modifier from energy
  const brightnessMod = interpolate(energy, [0.05, 0.3], [0.6, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          {BAR_COLORS.map((color, i) => (
            <linearGradient key={`grad-${i}`} id={`barGrad${i}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity={0.3 * brightnessMod} />
              <stop offset="60%" stopColor={color} stopOpacity={0.7 * brightnessMod} />
              <stop offset="100%" stopColor={color} stopOpacity={1.0 * brightnessMod} />
            </linearGradient>
          ))}
        </defs>

        {smoothedBands.map((bandVal, b) => {
          const barH = bandVal * maxBarHeight * (0.7 + energy * 0.6);
          const x = barAreaLeft + b * barSpacing + (barSpacing - barWidth) / 2;
          const y = barAreaBottom - barH;
          const peakH = peakValues[b] * maxBarHeight * (0.7 + energy * 0.6);
          const peakY = barAreaBottom - peakH;

          const color = BAR_COLORS[b];
          const glowColor = GLOW_COLORS[b];

          return (
            <g
              key={b}
              style={{
                filter: `drop-shadow(0 0 ${glowSize}px ${glowColor})`,
              }}
            >
              {/* Bar body */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                fill={`url(#barGrad${b})`}
                rx={2}
                ry={2}
              />

              {/* Bar outline */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                fill="none"
                stroke={color}
                strokeWidth={1}
                opacity={0.4}
                rx={2}
                ry={2}
              />

              {/* Segment lines inside bar for classic EQ look */}
              {Array.from({ length: Math.floor(barH / 8) }, (_, seg) => {
                const segY = barAreaBottom - seg * 8 - 1;
                if (segY < y) return null;
                return (
                  <line
                    key={`seg-${b}-${seg}`}
                    x1={x + 1}
                    y1={segY}
                    x2={x + barWidth - 1}
                    y2={segY}
                    stroke="rgba(0,0,0,0.25)"
                    strokeWidth={1}
                  />
                );
              })}

              {/* Peak hold dot */}
              <rect
                x={x}
                y={peakY - peakDotHeight}
                width={barWidth}
                height={peakDotHeight}
                fill={color}
                opacity={0.9}
                rx={1}
                ry={1}
              />

              {/* Band label */}
              <text
                x={x + barWidth / 2}
                y={barAreaBottom + 16}
                textAnchor="middle"
                fontSize={9}
                fill={color}
                opacity={0.5}
                fontFamily="monospace"
              >
                {["SUB", "LOW", "L-M", "MID", "H-M", "HI", "AIR"][b]}
              </text>
            </g>
          );
        })}

        {/* Horizontal baseline */}
        <line
          x1={barAreaLeft}
          y1={barAreaBottom}
          x2={barAreaLeft + barAreaWidth}
          y2={barAreaBottom}
          stroke={BAR_COLORS[3]}
          strokeWidth={1}
          opacity={0.2}
        />

        {/* RMS meter: small horizontal bar underneath */}
        {(() => {
          const meterW = barAreaWidth * 0.5;
          const meterX = barAreaLeft + (barAreaWidth - meterW) / 2;
          const meterY = barAreaBottom + 24;
          const meterH = 3;
          const rmsW = fd.rms * meterW;

          return (
            <g>
              <rect
                x={meterX}
                y={meterY}
                width={meterW}
                height={meterH}
                fill="rgba(255,255,255,0.08)"
                rx={1}
              />
              <rect
                x={meterX}
                y={meterY}
                width={rmsW}
                height={meterH}
                fill={BAR_COLORS[3]}
                opacity={0.5}
                rx={1}
              />
            </g>
          );
        })()}
      </svg>
    </div>
  );
};
