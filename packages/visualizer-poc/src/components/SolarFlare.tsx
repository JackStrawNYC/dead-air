/**
 * SolarFlare — Sun with animated corona.
 * Central bright circle with radial gradient (white->yellow->orange->red).
 * 8-12 corona tendrils as bezier curves extending outward, animated with sine waves.
 * Flare brightness scales with energy. Coronal mass ejection bursts on high energy peaks.
 * Positioned upper area. Appears every 80s for 12s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2400;     // 80 seconds at 30fps
const DURATION = 360;   // 12 seconds
const NUM_TENDRILS = 10;

interface TendrilData {
  baseAngle: number;
  length: number;
  width: number;
  curvature: number;
  speed: number;
  phaseOffset: number;
  colorShift: number;
}

function generateTendrils(seed: number): TendrilData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_TENDRILS }, () => ({
    baseAngle: rng() * Math.PI * 2,
    length: 0.6 + rng() * 0.8,
    width: 2 + rng() * 4,
    curvature: 0.3 + rng() * 0.7,
    speed: 0.02 + rng() * 0.04,
    phaseOffset: rng() * Math.PI * 2,
    colorShift: rng() * 30,
  }));
}

const TENDRIL_COLORS = [
  "#FFFF00", "#FFD700", "#FFA500", "#FF6600",
  "#FF4400", "#FFEE44", "#FFCC00", "#FF8800",
];

interface Props {
  frames: EnhancedFrameData[];
}

export const SolarFlare: React.FC<Props> = ({ frames }) => {
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

  const tendrils = React.useMemo(() => generateTendrils(5555), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

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
  const opacity = Math.min(fadeIn, fadeOut) * (0.5 + energy * 0.4);

  // Positioned upper-center
  const cx = width * 0.5;
  const cy = height * 0.25;
  const sunRadius = Math.min(width, height) * 0.06 * (1 + energy * 0.3);

  // CME burst on high energy
  const isCME = energy > 0.25;
  const cmeScale = isCME ? interpolate(energy, [0.25, 0.4], [1, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) : 1;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <radialGradient id="sun-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="30%" stopColor="#FFFFCC" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#FFD700" stopOpacity="0.8" />
            <stop offset="75%" stopColor="#FF8C00" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#FF4500" stopOpacity="0.2" />
          </radialGradient>
          <filter id="solar-glow">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="solar-bloom">
            <feGaussianBlur stdDeviation="15" result="bloom" />
            <feMerge>
              <feMergeNode in="bloom" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Corona tendrils */}
        {tendrils.map((t, i) => {
          const angleWobble = Math.sin(frame * t.speed + t.phaseOffset) * 0.3;
          const angle = t.baseAngle + angleWobble;
          const tendrilLength = sunRadius * t.length * (1.5 + energy * 2) * cmeScale;

          // Bezier control points for curved tendril
          const cp1Dist = tendrilLength * 0.4;
          const cp2Dist = tendrilLength * 0.7;
          const endDist = tendrilLength;

          const curvatureAngle = angle + t.curvature * Math.sin(frame * t.speed * 1.5 + t.phaseOffset);

          const sx = cx + Math.cos(angle) * sunRadius;
          const sy = cy + Math.sin(angle) * sunRadius;
          const cp1x = cx + Math.cos(angle) * cp1Dist;
          const cp1y = cy + Math.sin(angle) * cp1Dist;
          const cp2x = cx + Math.cos(curvatureAngle) * cp2Dist;
          const cp2y = cy + Math.sin(curvatureAngle) * cp2Dist;
          const ex = cx + Math.cos(curvatureAngle) * endDist;
          const ey = cy + Math.sin(curvatureAngle) * endDist;

          const color = TENDRIL_COLORS[i % TENDRIL_COLORS.length];

          return (
            <path
              key={i}
              d={`M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`}
              fill="none"
              stroke={color}
              strokeWidth={t.width * (1 + energy * 1.5)}
              strokeLinecap="round"
              opacity={0.5 + energy * 0.3}
              filter="url(#solar-glow)"
            />
          );
        })}

        {/* Outer glow halo */}
        <circle
          cx={cx}
          cy={cy}
          r={sunRadius * 2.2}
          fill="none"
          stroke="#FFD700"
          strokeWidth={2}
          opacity={0.15 + energy * 0.15}
          filter="url(#solar-bloom)"
        />

        {/* Sun core */}
        <circle
          cx={cx}
          cy={cy}
          r={sunRadius}
          fill="url(#sun-core)"
          filter="url(#solar-bloom)"
        />

        {/* Bright center */}
        <circle
          cx={cx}
          cy={cy}
          r={sunRadius * 0.4}
          fill="#FFFFFF"
          opacity={0.7 + energy * 0.3}
        />

        {/* CME burst rays */}
        {isCME && Array.from({ length: 6 }, (_, i) => {
          const burstAngle = (i / 6) * Math.PI * 2 + frame * 0.05;
          const burstLen = sunRadius * 3 * cmeScale;
          const x2 = cx + Math.cos(burstAngle) * burstLen;
          const y2 = cy + Math.sin(burstAngle) * burstLen;
          return (
            <line
              key={`cme${i}`}
              x1={cx + Math.cos(burstAngle) * sunRadius}
              y1={cy + Math.sin(burstAngle) * sunRadius}
              x2={x2}
              y2={y2}
              stroke="#FFEE88"
              strokeWidth={1.5}
              opacity={0.3}
              filter="url(#solar-glow)"
            />
          );
        })}
      </svg>
    </div>
  );
};
