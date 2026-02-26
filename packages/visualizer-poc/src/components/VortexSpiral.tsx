/**
 * VortexSpiral — Rotating whirlpool/vortex.
 * Archimedean spiral rendered as SVG path with 6-8 spiral arms.
 * Rotation speed scales with energy. Arms get thicker toward center.
 * Neon color cycling per arm. Appears every 55s for 14s.
 * Energy > 0.1 to show. Spiral tightness driven by mid-frequency energy.
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

const NUM_ARMS = 7;
const CYCLE = 1650;     // 55 seconds at 30fps
const DURATION = 420;   // 14 seconds
const ARM_COLORS = [
  "#FF00FF", "#00FFFF", "#FF4444", "#44FF44",
  "#FFAA00", "#AA44FF", "#FF1493",
];

interface ArmData {
  colorIdx: number;
  widthScale: number;
  lengthScale: number;
}

function generateArms(seed: number): ArmData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_ARMS }, () => ({
    colorIdx: Math.floor(rng() * ARM_COLORS.length),
    widthScale: 0.7 + rng() * 0.6,
    lengthScale: 0.8 + rng() * 0.4,
  }));
}

function buildSpiralPath(
  cx: number, cy: number,
  armAngleOffset: number,
  rotation: number,
  tightness: number,
  maxRadius: number,
  lengthScale: number,
): string {
  const steps = 80;
  const points: string[] = [];
  const totalAngle = 4 * Math.PI * lengthScale;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const angle = t * totalAngle + armAngleOffset + rotation;
    const r = t * maxRadius * (0.6 + tightness * 0.4);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    points.push(s === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }

  return points.join(" ");
}

interface Props {
  frames: EnhancedFrameData[];
}

export const VortexSpiral: React.FC<Props> = ({ frames }) => {
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

  const arms = React.useMemo(() => generateArms(3141), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;
  if (energy < 0.1) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.65;

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.4;

  // Rotation speed scales with energy
  const rotationSpeed = 0.02 + energy * 0.06;
  const rotation = frame * rotationSpeed;

  // Mid-frequency drives spiral tightness
  const midEnergy = frames[idx].mid;
  const tightness = interpolate(midEnergy, [0, 0.5, 1], [0.3, 0.7, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="vortex-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {arms.map((arm, i) => {
          const armAngle = (i / NUM_ARMS) * Math.PI * 2;
          const color = ARM_COLORS[(arm.colorIdx + Math.floor(frame * 0.01)) % ARM_COLORS.length];
          const path = buildSpiralPath(cx, cy, armAngle, rotation, tightness, maxRadius, arm.lengthScale);

          // Arms thicker toward center — use stroke-dasharray trick or just thick stroke
          const baseWidth = 2 + energy * 4;
          const strokeW = baseWidth * arm.widthScale;

          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
              strokeLinecap="round"
              opacity={0.7}
              filter="url(#vortex-glow)"
            />
          );
        })}
        {/* Center glow */}
        <circle
          cx={cx}
          cy={cy}
          r={8 + energy * 15}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2}
          opacity={0.4 + energy * 0.3}
          filter="url(#vortex-glow)"
        />
      </svg>
    </div>
  );
};
