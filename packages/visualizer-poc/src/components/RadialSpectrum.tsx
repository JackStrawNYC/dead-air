/**
 * RadialSpectrum — Circular MilkDrop-style display: 12 bars radiating from
 * center circle, one per chroma pitch class. Central circle pulses on beats.
 */
import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useSongPalette } from "../data/SongPaletteContext";

const BAR_COUNT = 12;
const INNER_RADIUS = 30;
const MAX_BAR_LENGTH = 120;
const BAR_WIDTH_BASE = 8;
const CENTER_RADIUS = 22;
const BEAT_SCALE = 1.15;

export const RadialSpectrum: React.FC<{ frames: EnhancedFrameData[] }> = ({
  frames,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const palette = useSongPalette();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const fd = frames[idx];

  // Rolling energy (75-frame window)
  let eSum = 0;
  let eCount = 0;
  for (
    let i = Math.max(0, idx - 75);
    i <= Math.min(frames.length - 1, idx + 75);
    i++
  ) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const opacity = interpolate(energy, [0.02, 0.25], [0.15, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const palettePrimary = palette.primary;
  const paletteSaturation = palette.saturation ?? 1;

  // Smoothed chroma (3-frame average)
  const chroma = useMemo(() => {
    const result = new Array(12).fill(0);
    const windowSize = 3;
    const start = Math.max(0, idx - Math.floor(windowSize / 2));
    const end = Math.min(frames.length - 1, idx + Math.floor(windowSize / 2));
    const count = end - start + 1;
    for (let f = start; f <= end; f++) {
      for (let c = 0; c < 12; c++) {
        result[c] += frames[f].chroma[c];
      }
    }
    for (let c = 0; c < 12; c++) {
      result[c] /= count;
    }
    return result;
  }, [frames, idx]);

  // Find dominant pitch class
  let maxChroma = 0;
  let dominantPitch = 0;
  for (let i = 0; i < 12; i++) {
    if (chroma[i] > maxChroma) {
      maxChroma = chroma[i];
      dominantPitch = i;
    }
  }

  // Harmonic tension affects bar width
  const tension = fd.harmonicTension ?? 0;
  const barWidth = BAR_WIDTH_BASE + tension * 6;

  // Beat pulse for center circle
  const isBeat = fd.beat;
  let beatPulse = 1.0;
  if (isBeat) {
    beatPulse = BEAT_SCALE;
  } else {
    // Decay from recent beat
    for (let b = 1; b <= 6; b++) {
      const bi = idx - b;
      if (bi >= 0 && frames[bi].beat) {
        beatPulse = 1.0 + (BEAT_SCALE - 1.0) * Math.max(0, 1 - b / 6);
        break;
      }
    }
  }

  const cx = width / 2;
  const cy = height / 2;

  const bars = useMemo(() => {
    const elements: React.ReactElement[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
      const value = chroma[i];
      const barLength = value * MAX_BAR_LENGTH;

      const x1 = Math.cos(angle) * INNER_RADIUS;
      const y1 = Math.sin(angle) * INNER_RADIUS;
      const x2 = Math.cos(angle) * (INNER_RADIUS + barLength);
      const y2 = Math.sin(angle) * (INNER_RADIUS + barLength);

      const hue = (palettePrimary + (i / 12) * 360) % 360;
      const sat = paletteSaturation * 100;
      const isDominant = i === dominantPitch;
      const lightness = isDominant ? 70 : 55;
      const glowSize = isDominant ? 12 : 6;
      const color = `hsl(${hue}, ${sat}%, ${lightness}%)`;

      elements.push(
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth={barWidth}
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 ${glowSize}px ${color})`,
          }}
        />,
      );
    }
    return elements;
  }, [chroma, palettePrimary, paletteSaturation, dominantPitch, barWidth]);

  const centerGlow = interpolate(fd.rms, [0, 0.4], [4, 16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const centerColor = `hsl(${palettePrimary}, ${paletteSaturation * 100}%, 60%)`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        pointerEvents: "none",
        mixBlendMode: "screen",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {bars}
          {/* Center circle */}
          <circle
            cx={0}
            cy={0}
            r={CENTER_RADIUS * beatPulse}
            fill="none"
            stroke={centerColor}
            strokeWidth={2.5}
            style={{
              filter: `drop-shadow(0 0 ${centerGlow}px ${centerColor})`,
            }}
          />
          <circle
            cx={0}
            cy={0}
            r={CENTER_RADIUS * beatPulse * 0.5}
            fill={centerColor}
            opacity={0.3 + fd.rms * 0.4}
          />
        </g>
      </svg>
    </div>
  );
};
