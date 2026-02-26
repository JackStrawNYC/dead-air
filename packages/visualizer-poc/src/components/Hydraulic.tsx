/**
 * Hydraulic — Hydraulic press arm that compresses on beat hits.
 * Top plate descends toward bottom anvil plate on beats, then retracts.
 * Two vertical cylinders on the sides with hydraulic fluid lines.
 * Compression squashes a glowing energy disc between the plates.
 * Heavy industrial steel with red accent hydraulic lines.
 * Positioned center-left. Cycle: 35s on, 30s off (65s = 1950f).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 1950; // 65s at 30fps
const DURATION = 1050; // 35s visible

interface Props {
  frames: EnhancedFrameData[];
}

export const Hydraulic: React.FC<Props> = ({ frames }) => {
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

  // Pre-compute spark positions for impact
  const impactSparks = React.useMemo(() => {
    const rng = seeded(33721);
    return Array.from({ length: 20 }, () => ({
      angle: rng() * Math.PI * 2,
      speed: 2 + rng() * 6,
      size: 1 + rng() * 2.5,
      decay: 0.6 + rng() * 0.3,
    }));
  }, []);

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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.2, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Press geometry
  const pressCx = width * 0.28;
  const pressTopY = height * 0.32;
  const pressBottomY = height * 0.62;
  const plateW = 120;
  const plateH = 14;
  const cylinderW = 22;
  const gap = pressBottomY - pressTopY;

  // Beat detection — use onset for compression trigger
  const currentOnset = frames[idx]?.onset ?? 0;
  const currentBeat = frames[idx]?.beat ?? false;

  // Press compression: uses a sawtooth driven by beats
  // When beat hits, press compresses quickly then retracts slowly
  const compressCycle = 20; // frames for a full compress-retract
  const beatIntensity = currentBeat ? 1.0 : currentOnset > 0.3 ? 0.6 : 0;
  const pressPhase = (frame % compressCycle) / compressCycle;

  // Compression amount: 0 = fully open, 1 = fully compressed
  const baseCompress = interpolate(energy, [0.05, 0.35], [0.05, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const beatCompress = beatIntensity * 0.5 * Math.max(0, 1 - pressPhase * 3);
  const compression = Math.min(0.85, baseCompress + beatCompress);

  // Top plate Y position
  const topPlateY = pressTopY + compression * gap * 0.6;
  const squeeze = compression * gap * 0.6;

  // Piston rod extension
  const rodExtension = topPlateY - pressTopY;

  // Impact flash when highly compressed
  const impactFlash = compression > 0.5 ? (compression - 0.5) * 2 : 0;

  // Hydraulic fluid level in cylinders (visual only)
  const fluidLevel = interpolate(compression, [0, 0.85], [0.3, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity, willChange: "opacity" }}>
        <defs>
          <filter id="hydraulic-glow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="steel-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#90A4AE" />
            <stop offset="50%" stopColor="#607D8B" />
            <stop offset="100%" stopColor="#455A64" />
          </linearGradient>
        </defs>

        {/* Frame/housing top beam */}
        <rect
          x={pressCx - plateW * 0.7}
          y={pressTopY - 20}
          width={plateW * 1.4}
          height={16}
          rx={3}
          fill="url(#steel-grad)"
          opacity={0.6}
        />

        {/* Frame/housing bottom beam */}
        <rect
          x={pressCx - plateW * 0.7}
          y={pressBottomY + plateH + 4}
          width={plateW * 1.4}
          height={16}
          rx={3}
          fill="url(#steel-grad)"
          opacity={0.6}
        />

        {/* Left vertical column */}
        <rect
          x={pressCx - plateW * 0.65}
          y={pressTopY - 20}
          width={12}
          height={pressBottomY - pressTopY + plateH + 40}
          fill="#546E7A"
          opacity={0.5}
        />

        {/* Right vertical column */}
        <rect
          x={pressCx + plateW * 0.65 - 12}
          y={pressTopY - 20}
          width={12}
          height={pressBottomY - pressTopY + plateH + 40}
          fill="#546E7A"
          opacity={0.5}
        />

        {/* Left hydraulic cylinder */}
        <rect
          x={pressCx - plateW * 0.5 - cylinderW / 2}
          y={pressTopY - 10}
          width={cylinderW}
          height={rodExtension + 30}
          rx={cylinderW / 2}
          fill="#37474F"
          stroke="#E53935"
          strokeWidth={1.5}
          opacity={0.5}
        />

        {/* Left cylinder fluid */}
        <rect
          x={pressCx - plateW * 0.5 - cylinderW / 2 + 3}
          y={pressTopY - 7 + (1 - fluidLevel) * (rodExtension + 24)}
          width={cylinderW - 6}
          height={fluidLevel * (rodExtension + 24)}
          rx={(cylinderW - 6) / 2}
          fill="#E53935"
          opacity={0.3}
        />

        {/* Right hydraulic cylinder */}
        <rect
          x={pressCx + plateW * 0.5 - cylinderW / 2}
          y={pressTopY - 10}
          width={cylinderW}
          height={rodExtension + 30}
          rx={cylinderW / 2}
          fill="#37474F"
          stroke="#E53935"
          strokeWidth={1.5}
          opacity={0.5}
        />

        {/* Right cylinder fluid */}
        <rect
          x={pressCx + plateW * 0.5 - cylinderW / 2 + 3}
          y={pressTopY - 7 + (1 - fluidLevel) * (rodExtension + 24)}
          width={cylinderW - 6}
          height={fluidLevel * (rodExtension + 24)}
          rx={(cylinderW - 6) / 2}
          fill="#E53935"
          opacity={0.3}
        />

        {/* Hydraulic lines (decorative tubing) */}
        <path
          d={`M ${pressCx - plateW * 0.5 - cylinderW / 2 - 5} ${pressTopY + 20} Q ${pressCx - plateW * 0.7 - 15} ${pressTopY + 50} ${pressCx - plateW * 0.5 - cylinderW / 2 - 5} ${pressTopY + 80}`}
          fill="none"
          stroke="#E53935"
          strokeWidth={3}
          opacity={0.35}
        />
        <path
          d={`M ${pressCx + plateW * 0.5 + cylinderW / 2 + 5} ${pressTopY + 20} Q ${pressCx + plateW * 0.7 + 15} ${pressTopY + 50} ${pressCx + plateW * 0.5 + cylinderW / 2 + 5} ${pressTopY + 80}`}
          fill="none"
          stroke="#E53935"
          strokeWidth={3}
          opacity={0.35}
        />

        {/* Moving top plate */}
        <rect
          x={pressCx - plateW / 2}
          y={topPlateY}
          width={plateW}
          height={plateH}
          rx={2}
          fill="url(#steel-grad)"
          opacity={0.8}
        />
        {/* Plate surface detail */}
        <line
          x1={pressCx - plateW / 2 + 5}
          y1={topPlateY + plateH / 2}
          x2={pressCx + plateW / 2 - 5}
          y2={topPlateY + plateH / 2}
          stroke="#78909C"
          strokeWidth={1}
          opacity={0.4}
        />

        {/* Bottom plate (anvil) */}
        <rect
          x={pressCx - plateW / 2}
          y={pressBottomY}
          width={plateW}
          height={plateH}
          rx={2}
          fill="url(#steel-grad)"
          opacity={0.8}
        />

        {/* Energy disc being compressed */}
        {compression > 0.02 && (
          <ellipse
            cx={pressCx}
            cy={(topPlateY + plateH + pressBottomY) / 2}
            rx={plateW * 0.3 + squeeze * 0.3}
            ry={Math.max(4, (pressBottomY - topPlateY - plateH) * 0.4)}
            fill="#FF6D00"
            opacity={0.15 + compression * 0.3}
            filter="url(#hydraulic-glow)"
          />
        )}

        {/* Impact sparks when heavily compressed */}
        {impactFlash > 0.1 && impactSparks.map((spark, si) => {
          const sparkLife = (frame % 8) / 8;
          const sx = pressCx + Math.cos(spark.angle) * spark.speed * sparkLife * 15;
          const sy = (topPlateY + plateH + pressBottomY) / 2 + Math.sin(spark.angle) * spark.speed * sparkLife * 10;
          const sparkOpacity = impactFlash * (1 - sparkLife) * spark.decay;
          if (sparkOpacity < 0.02) return null;
          return (
            <circle
              key={`spark-${si}`}
              cx={sx}
              cy={sy}
              r={spark.size * (1 - sparkLife * 0.5)}
              fill="#FFAB00"
              opacity={sparkOpacity}
            />
          );
        })}

        {/* Pressure gauge (small circle) */}
        <circle
          cx={pressCx + plateW * 0.7 + 20}
          cy={pressTopY + 30}
          r={14}
          fill="#263238"
          stroke="#78909C"
          strokeWidth={2}
          opacity={0.5}
        />
        {/* Gauge needle */}
        <line
          x1={pressCx + plateW * 0.7 + 20}
          y1={pressTopY + 30}
          x2={pressCx + plateW * 0.7 + 20 + Math.cos(-Math.PI / 2 + compression * Math.PI) * 10}
          y2={pressTopY + 30 + Math.sin(-Math.PI / 2 + compression * Math.PI) * 10}
          stroke="#E53935"
          strokeWidth={1.5}
          opacity={0.7}
          strokeLinecap="round"
        />
        <circle
          cx={pressCx + plateW * 0.7 + 20}
          cy={pressTopY + 30}
          r={2}
          fill="#E53935"
          opacity={0.6}
        />
      </svg>
    </div>
  );
};
