/**
 * GearWorks — 5-7 interlocking rotating gears of different sizes.
 * Each gear is an SVG circle with teeth (small rectangles around perimeter).
 * Adjacent gears rotate in opposite directions. Rotation speed scales with energy.
 * Neon color per gear. Gear teeth count proportional to radius.
 * Positioned center-right area. Appears every 60s for 14s. Mechanical aesthetic.
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

const CYCLE = 1800; // 60 seconds at 30fps
const DURATION = 420; // 14 seconds visible

const NEON_COLORS = [
  "#FF00FF", "#00FFFF", "#FFFF00", "#FF4488",
  "#00FF88", "#FF8800", "#8844FF",
];

interface GearConfig {
  cx: number;
  cy: number;
  radius: number;
  teeth: number;
  direction: number; // 1 or -1
  color: string;
  speedMult: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const GearWorks: React.FC<Props> = ({ frames }) => {
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

  // Generate gear layout (deterministic, seeded)
  const gears = React.useMemo(() => {
    const rng = seeded(42);
    const result: GearConfig[] = [];
    const gearCount = 6;

    // Center-right positioning
    const baseCx = width * 0.62;
    const baseCy = height * 0.45;

    // First gear: large, center
    const r0 = 80;
    result.push({
      cx: baseCx,
      cy: baseCy,
      radius: r0,
      teeth: 20,
      direction: 1,
      color: NEON_COLORS[0],
      speedMult: 1.0,
    });

    // Place subsequent gears meshing with previous ones
    const radii = [55, 65, 40, 50, 35];
    const angles = [0.4, -0.7, 2.2, 3.5, 5.0]; // radians around first gear

    for (let g = 0; g < gearCount - 1; g++) {
      const parentIdx = g === 0 ? 0 : Math.max(0, g - 1);
      const parent = result[parentIdx];
      const r = radii[g] + rng() * 10;
      const teeth = Math.max(8, Math.round(r / 4));
      const angle = angles[g];
      const dist = parent.radius + r + 4; // small gap for teeth mesh
      const gx = parent.cx + Math.cos(angle) * dist;
      const gy = parent.cy + Math.sin(angle) * dist;

      // Adjacent gears rotate opposite direction
      const dir = parent.direction * -1;
      // Speed inversely proportional to radius (gear ratio)
      const speedMult = parent.radius / r * parent.speedMult;

      result.push({
        cx: gx,
        cy: gy,
        radius: r,
        teeth,
        direction: dir,
        color: NEON_COLORS[(g + 1) % NEON_COLORS.length],
        speedMult,
      });
    }

    return result;
  }, [width, height]);

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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Rotation speed driven by energy
  const rotSpeed = 0.5 + energy * 2.5;

  const glowSize = interpolate(energy, [0.03, 0.3], [4, 14], {
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
          willChange: "opacity",
        }}
      >
        <defs>
          <filter id="gear-glow">
            <feGaussianBlur stdDeviation={glowSize} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {gears.map((gear, gi) => {
          const angle = frame * rotSpeed * gear.direction * gear.speedMult * 0.02;
          const toothWidth = (2 * Math.PI * gear.radius) / (gear.teeth * 3);
          const toothHeight = 8 + gear.radius * 0.12;

          return (
            <g
              key={gi}
              transform={`translate(${gear.cx}, ${gear.cy}) rotate(${(angle * 180) / Math.PI})`}
              filter="url(#gear-glow)"
            >
              {/* Gear body (ring) */}
              <circle
                cx={0}
                cy={0}
                r={gear.radius}
                fill="none"
                stroke={gear.color}
                strokeWidth={2}
                opacity={0.7}
              />
              {/* Inner ring */}
              <circle
                cx={0}
                cy={0}
                r={gear.radius * 0.6}
                fill="none"
                stroke={gear.color}
                strokeWidth={1.2}
                opacity={0.4}
              />
              {/* Hub */}
              <circle
                cx={0}
                cy={0}
                r={gear.radius * 0.15}
                fill={gear.color}
                opacity={0.5}
              />
              {/* Spokes */}
              {[0, 1, 2, 3].map((s) => {
                const sa = (s / 4) * Math.PI * 2;
                return (
                  <line
                    key={`spoke-${s}`}
                    x1={Math.cos(sa) * gear.radius * 0.15}
                    y1={Math.sin(sa) * gear.radius * 0.15}
                    x2={Math.cos(sa) * gear.radius * 0.6}
                    y2={Math.sin(sa) * gear.radius * 0.6}
                    stroke={gear.color}
                    strokeWidth={1.5}
                    opacity={0.4}
                  />
                );
              })}
              {/* Teeth */}
              {Array.from({ length: gear.teeth }).map((_, ti) => {
                const ta = (ti / gear.teeth) * Math.PI * 2;
                const tx = Math.cos(ta) * gear.radius;
                const ty = Math.sin(ta) * gear.radius;
                const rotDeg = (ta * 180) / Math.PI;
                return (
                  <rect
                    key={`tooth-${ti}`}
                    x={tx - toothWidth / 2}
                    y={ty - toothHeight / 2}
                    width={toothWidth}
                    height={toothHeight}
                    transform={`rotate(${rotDeg}, ${tx}, ${ty})`}
                    fill={gear.color}
                    opacity={0.6}
                    rx={1}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
