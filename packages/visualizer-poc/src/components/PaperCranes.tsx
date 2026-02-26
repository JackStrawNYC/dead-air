/**
 * PaperCranes — 8-12 origami crane silhouettes flying across screen in gentle arcs.
 * Each crane is a simplified bird shape (triangle body, angled wings, small tail).
 * Wings flap slowly (scaleY oscillation). Cranes enter from one side and exit the other.
 * White/cream paper color with subtle fold-line details.
 * Energy drives flight speed. Cycle: 55s, 16s visible.
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

const CYCLE = 1650;    // 55 seconds at 30fps
const DURATION = 480;  // 16 seconds
const NUM_CRANES = 10;

const CRANE_COLORS = [
  "#F5F0E8", // warm cream
  "#FFFFFF", // white
  "#E8E0D5", // parchment
  "#F0EDE6", // off-white
  "#FAF7F0", // ivory
];

interface CraneData {
  yBase: number;        // 0-1 vertical position
  size: number;         // 20-50 base size
  colorIdx: number;
  flapSpeed: number;    // wing flap speed
  flapPhase: number;    // phase offset
  arcAmp: number;       // vertical arc amplitude
  arcPhase: number;     // arc phase offset
  speedMult: number;    // individual speed multiplier
  delay: number;        // stagger entry 0-0.15
}

function generateCranes(seed: number): CraneData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_CRANES }, () => ({
    yBase: 0.1 + rng() * 0.7,
    size: 25 + rng() * 30,
    colorIdx: Math.floor(rng() * CRANE_COLORS.length),
    flapSpeed: 0.06 + rng() * 0.04,
    flapPhase: rng() * Math.PI * 2,
    arcAmp: 30 + rng() * 60,
    arcPhase: rng() * Math.PI * 2,
    speedMult: 0.8 + rng() * 0.4,
    delay: rng() * 0.15,
  }));
}

/** Single origami crane SVG -- triangle body, angled wings, tail */
const Crane: React.FC<{
  size: number;
  color: string;
  wingFlap: number;
}> = ({ size, color, wingFlap }) => {
  const w = size;
  const h = size * 0.6;
  // Wing flap is scaleY on wings
  const wingY = Math.abs(wingFlap);
  return (
    <svg width={w * 2} height={h * 2} viewBox="-50 -30 100 60" fill="none">
      {/* Body - elongated diamond */}
      <polygon
        points="-20,0 0,-5 25,0 0,5"
        fill={color}
        opacity={0.85}
      />
      {/* Left wing */}
      <polygon
        points="-10,-2 -25,-20 0,-3"
        fill={color}
        opacity={0.75}
        transform={`scale(1, ${0.4 + wingY * 0.6})`}
      />
      {/* Right wing */}
      <polygon
        points="-10,2 -25,20 0,3"
        fill={color}
        opacity={0.75}
        transform={`scale(1, ${0.4 + wingY * 0.6})`}
      />
      {/* Tail */}
      <polygon
        points="-20,0 -30,-4 -28,0 -30,4"
        fill={color}
        opacity={0.6}
      />
      {/* Head/beak */}
      <polygon
        points="25,0 35,-1 35,1"
        fill={color}
        opacity={0.9}
      />
      {/* Fold lines */}
      <line x1="-15" y1="0" x2="20" y2="0" stroke={color} strokeWidth={0.5} opacity={0.3} />
      <line x1="-8" y1="-1" x2="-20" y2={`${-10 * (0.4 + wingY * 0.6)}`} stroke={color} strokeWidth={0.4} opacity={0.2} />
      <line x1="-8" y1="1" x2="-20" y2={`${10 * (0.4 + wingY * 0.6)}`} stroke={color} strokeWidth={0.4} opacity={0.2} />
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const PaperCranes: React.FC<Props> = ({ frames }) => {
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

  const cranes = React.useMemo(() => generateCranes(19770508), []);

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
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.75;

  const cycleIndex = Math.floor(frame / CYCLE);
  const goingRight = cycleIndex % 2 === 0;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {cranes.map((crane, i) => {
        const craneProgress = Math.max(0, progress - crane.delay) / (1 - crane.delay);
        if (craneProgress <= 0 || craneProgress >= 1) return null;

        // Horizontal position -- energy drives speed
        const speedFactor = 0.8 + energy * 0.5;
        const effectiveProgress = Math.min(1, craneProgress * speedFactor * crane.speedMult);

        let x: number;
        if (goingRight) {
          x = interpolate(effectiveProgress, [0, 1], [-80, width + 80], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
        } else {
          x = interpolate(effectiveProgress, [0, 1], [width + 80, -80], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
        }

        // Vertical arc
        const yArc = Math.sin(craneProgress * Math.PI + crane.arcPhase) * crane.arcAmp;
        const y = crane.yBase * height + yArc;

        // Wing flap
        const wingFlap = Math.sin(frame * crane.flapSpeed + crane.flapPhase);

        // Slight rotation following arc
        const tilt = Math.cos(craneProgress * Math.PI + crane.arcPhase) * 8;

        const color = CRANE_COLORS[crane.colorIdx];
        const glow = `drop-shadow(0 0 4px rgba(255,255,240,0.3)) drop-shadow(0 0 12px rgba(255,255,240,0.15))`;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - crane.size,
              top: y - crane.size * 0.3,
              transform: `rotate(${tilt}deg) scaleX(${goingRight ? 1 : -1})`,
              opacity,
              filter: glow,
              willChange: "transform, opacity",
            }}
          >
            <Crane size={crane.size} color={color} wingFlap={wingFlap} />
          </div>
        );
      })}
    </div>
  );
};
