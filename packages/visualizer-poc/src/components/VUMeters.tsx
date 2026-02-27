/**
 * VUMeters — Classic analog VU meters. 7 meters in a row (one per contrast
 * frequency band: sub, low, low-mid, mid, high-mid, high, air). Each meter is
 * a semi-circular arc with a needle. Needle angle maps to band energy
 * (0deg = silence, 90deg = peak). Red zone marking past 75%. Retro cream/brown
 * face with black markings. Warm amber backlight glow. Positioned along top edge.
 * Always visible at 25-40% opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useShowContext } from "../data/ShowContext";

const BAND_LABELS = ["SUB", "LOW", "L-MID", "MID", "H-MID", "HIGH", "AIR"];
const CREAM = "#F5E6C8";
const BROWN = "#5C3D2E";
const RED_ZONE = "#CC2222";
const AMBER = "#FF9500";
const NEEDLE_COLOR = "#1A1A1A";

interface MeterProps {
  value: number; // 0-1
  label: string;
  size: number;
  flicker: number;
}

const VUMeter: React.FC<MeterProps> = ({ value, label, size, flicker }) => {
  const cx = size / 2;
  const cy = size * 0.8;
  const radius = size * 0.38;

  // Needle angle: -90deg (left, silence) to 0deg (right, peak)
  // Map value 0-1 to angle -90 to +45 degrees
  const needleAngle = interpolate(value, [0, 1], [-90, 45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Convert to radians for endpoint calculation
  const angleRad = (needleAngle * Math.PI) / 180;
  const needleLen = radius * 0.95;
  const needleEndX = cx + Math.cos(angleRad - Math.PI / 2) * needleLen;
  const needleEndY = cy + Math.sin(angleRad - Math.PI / 2) * needleLen;

  // Arc path for the meter scale
  const arcStartAngle = -Math.PI; // -180 deg
  const arcEndAngle = -Math.PI / 4; // -45 deg (slightly past vertical)
  const arcPoints: string[] = [];
  const numTicks = 20;
  for (let i = 0; i <= numTicks; i++) {
    const t = i / numTicks;
    const a = arcStartAngle + t * (arcEndAngle - arcStartAngle);
    const px = cx + Math.cos(a) * radius;
    const py = cy + Math.sin(a) * radius;
    if (i === 0) {
      arcPoints.push(`M ${px} ${py}`);
    } else {
      arcPoints.push(`L ${px} ${py}`);
    }
  }

  // Tick marks
  const ticks: Array<{ x1: number; y1: number; x2: number; y2: number; isRed: boolean }> = [];
  const numScaleTicks = 10;
  for (let i = 0; i <= numScaleTicks; i++) {
    const t = i / numScaleTicks;
    const a = arcStartAngle + t * (arcEndAngle - arcStartAngle);
    const innerR = radius * 0.85;
    const outerR = radius * (i % 5 === 0 ? 1.08 : 1.02);
    ticks.push({
      x1: cx + Math.cos(a) * innerR,
      y1: cy + Math.sin(a) * innerR,
      x2: cx + Math.cos(a) * outerR,
      y2: cy + Math.sin(a) * outerR,
      isRed: t > 0.75,
    });
  }

  const glowIntensity = 0.3 + value * 0.7 + flicker * 0.1;

  return (
    <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
      {/* Meter face background */}
      <rect
        x={2}
        y={2}
        width={size - 4}
        height={size * 0.65 - 4}
        rx={4}
        fill={CREAM}
        opacity={0.85}
        stroke={BROWN}
        strokeWidth={1.5}
      />

      {/* Amber backlight glow */}
      <ellipse
        cx={cx}
        cy={cy * 0.7}
        rx={radius * 0.8}
        ry={radius * 0.5}
        fill={AMBER}
        opacity={0.06 * glowIntensity}
      />

      {/* Scale arc */}
      <path
        d={arcPoints.join(" ")}
        fill="none"
        stroke={BROWN}
        strokeWidth={1}
        opacity={0.5}
      />

      {/* Red zone arc (last 25%) */}
      {(() => {
        const redStart = arcStartAngle + 0.75 * (arcEndAngle - arcStartAngle);
        const redPoints: string[] = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          const a = redStart + t * (arcEndAngle - redStart);
          const px = cx + Math.cos(a) * radius;
          const py = cy + Math.sin(a) * radius;
          if (i === 0) redPoints.push(`M ${px} ${py}`);
          else redPoints.push(`L ${px} ${py}`);
        }
        return (
          <path
            d={redPoints.join(" ")}
            fill="none"
            stroke={RED_ZONE}
            strokeWidth={2.5}
            opacity={0.7}
          />
        );
      })()}

      {/* Tick marks */}
      {ticks.map((tick, i) => (
        <line
          key={i}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke={tick.isRed ? RED_ZONE : BROWN}
          strokeWidth={tick.isRed ? 1.2 : 0.8}
          opacity={0.7}
        />
      ))}

      {/* Needle */}
      <line
        x1={cx}
        y1={cy}
        x2={needleEndX}
        y2={needleEndY}
        stroke={NEEDLE_COLOR}
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* Needle pivot */}
      <circle cx={cx} cy={cy} r={3} fill={NEEDLE_COLOR} />

      {/* Label */}
      <text
        x={cx}
        y={size * 0.6}
        textAnchor="middle"
        fill={BROWN}
        fontSize={size * 0.08}
        fontFamily="monospace"
        fontWeight={600}
        opacity={0.7}
      >
        {label}
      </text>

      {/* VU text */}
      <text
        x={cx}
        y={cy * 0.55}
        textAnchor="middle"
        fill={BROWN}
        fontSize={size * 0.06}
        fontFamily="serif"
        fontWeight={700}
        opacity={0.4}
      >
        VU
      </text>
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const VUMeters: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const fd = frames[idx];
  const contrast = fd.contrast;

  // Always visible at 25-40% opacity
  const opacity = interpolate(energy, [0.02, 0.25], [0.25, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Per-meter flicker from seeded PRNG
  const rng = seeded(frame * 13 + (ctx?.showSeed ?? 19770508));
  const flickers = BAND_LABELS.map(() => rng() * 0.3);

  // Smooth the needle values with previous frames (3-frame average)
  const smoothedContrast = contrast.map((val, bandIdx) => {
    let sum = val;
    let count = 1;
    for (let d = 1; d <= 3; d++) {
      const prevIdx = Math.max(0, idx - d);
      sum += frames[prevIdx].contrast[bandIdx];
      count++;
    }
    return sum / count;
  });

  const meterSize = Math.min(width / 8, 100);
  const totalWidth = meterSize * 7 + 6 * 4; // 4px gaps
  const startX = (width - totalWidth) / 2;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 12,
          left: startX,
          display: "flex",
          gap: 4,
          opacity,
          filter: `drop-shadow(0 0 6px rgba(255, 149, 0, 0.3))`,
        }}
      >
        {BAND_LABELS.map((label, i) => (
          <VUMeter
            key={label}
            value={smoothedContrast[i]}
            label={label}
            size={meterSize}
            flicker={flickers[i]}
          />
        ))}
      </div>
    </div>
  );
};
