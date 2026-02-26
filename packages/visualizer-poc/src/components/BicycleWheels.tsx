/**
 * BicycleWheels -- 4-6 bicycle wheel outlines spinning across screen.
 * Each wheel is a circle with hub, spokes (12-16 lines from center), and tire.
 * Wheels roll along curved paths. Spoke rotation tied to travel distance.
 * Neon colored rims (pink, cyan, lime, gold). Energy drives roll speed.
 * Cycle: 40s, 12s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WHEEL_COLORS = [
  "#FF4081", // pink
  "#00E5FF", // cyan
  "#76FF03", // lime
  "#FFD600", // gold
  "#E040FB", // purple
  "#FF6E40", // deep orange
];

const NUM_WHEELS = 5;
const VISIBLE_DURATION = 360; // 12s at 30fps
const CYCLE_GAP = 840;        // 28s gap (40s total - 12s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;

interface WheelDef {
  color: string;
  radius: number;
  numSpokes: number;
  yBase: number;     // 0-1 fraction of height
  yCurveAmp: number; // vertical curve amplitude
  yCurveFreq: number;
  direction: number; // 1 or -1
  stagger: number;   // time stagger
}

function generateWheels(seed: number): WheelDef[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_WHEELS }, (_, i) => ({
    color: WHEEL_COLORS[i % WHEEL_COLORS.length],
    radius: 25 + rng() * 20,
    numSpokes: 12 + Math.floor(rng() * 5), // 12-16
    yBase: 0.3 + rng() * 0.4,
    yCurveAmp: 30 + rng() * 60,
    yCurveFreq: 0.5 + rng() * 1.5,
    direction: rng() > 0.5 ? 1 : -1,
    stagger: i * 0.06,
  }));
}

/** Single bicycle wheel SVG */
const Wheel: React.FC<{
  radius: number;
  numSpokes: number;
  color: string;
  rotation: number;
}> = ({ radius, numSpokes, color, rotation }) => {
  const d = radius * 2 + 8;
  const cx = d / 2;
  const cy = d / 2;

  return (
    <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} fill="none">
      <g transform={`rotate(${rotation} ${cx} ${cy})`}>
        {/* Outer tire */}
        <circle cx={cx} cy={cy} r={radius} stroke={color} strokeWidth="3" opacity="0.9" />
        {/* Inner rim */}
        <circle cx={cx} cy={cy} r={radius - 4} stroke={color} strokeWidth="1" opacity="0.4" />
        {/* Spokes */}
        {Array.from({ length: numSpokes }, (_, si) => {
          const angle = (si / numSpokes) * Math.PI * 2;
          const innerR = 4;
          const outerR = radius - 5;
          return (
            <line
              key={si}
              x1={cx + Math.cos(angle) * innerR}
              y1={cy + Math.sin(angle) * innerR}
              x2={cx + Math.cos(angle) * outerR}
              y2={cy + Math.sin(angle) * outerR}
              stroke={color}
              strokeWidth="0.8"
              opacity="0.6"
            />
          );
        })}
        {/* Hub */}
        <circle cx={cx} cy={cy} r={4} stroke={color} strokeWidth="1.5" opacity="0.8" />
        <circle cx={cx} cy={cy} r={1.5} fill={color} opacity="0.7" />
      </g>
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const BicycleWheels: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const wheels = React.useMemo(() => generateWheels(18170601), []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleFrame = frame % CYCLE_TOTAL;

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.8;

  if (masterOpacity < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {wheels.map((w, wi) => {
        const wheelProgress = Math.max(0, Math.min(1, progress - w.stagger));

        // Horizontal position across screen
        const speed = 1 + energy * 0.8;
        const startX = w.direction > 0 ? -w.radius * 2 - 20 : width + w.radius * 2 + 20;
        const endX = w.direction > 0 ? width + w.radius * 2 + 20 : -w.radius * 2 - 20;
        const x = interpolate(wheelProgress * speed, [0, 1], [startX, endX], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        // Curved vertical path
        const yOffset = Math.sin(wheelProgress * Math.PI * w.yCurveFreq) * w.yCurveAmp;
        const y = w.yBase * height + yOffset;

        // Rotation based on distance traveled
        const distanceTraveled = Math.abs(x - startX);
        const circumference = Math.PI * w.radius * 2;
        const rotation = (distanceTraveled / circumference) * 360 * w.direction;

        // Neon glow
        const glow = `drop-shadow(0 0 6px ${w.color}) drop-shadow(0 0 15px ${w.color}88)`;

        return (
          <div
            key={wi}
            style={{
              position: "absolute",
              left: x - w.radius - 4,
              top: y - w.radius - 4,
              opacity: masterOpacity,
              filter: glow,
              willChange: "transform, opacity",
            }}
          >
            <Wheel
              radius={w.radius}
              numSpokes={w.numSpokes}
              color={w.color}
              rotation={rotation}
            />
          </div>
        );
      })}
    </div>
  );
};
