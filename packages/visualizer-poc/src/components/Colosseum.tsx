/**
 * Colosseum — Roman Colosseum arches framing the edges of the screen. Two tiers
 * of arches on left and right sides (like looking through a colosseum archway).
 * Pillars pulse outward with bass energy. Warm sandstone colors with torch-like
 * glow in arch openings. Upper tier has smaller arches than lower.
 * Cycle: 80s on / off, 20s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2400; // 80s at 30fps
const DURATION = 600; // 20s visible

const SANDSTONE = "#C4A87C";
const SANDSTONE_DARK = "#9E8560";
const SANDSTONE_SHADOW = "#786645";
const TORCH_ORANGE = "#FF8F00";
const TORCH_YELLOW = "#FFD54F";
const PILLAR_COLOR = "#B89A6E";

interface ArchDef {
  x: number;
  y: number;
  w: number;
  h: number;
  side: "left" | "right";
}

const LOWER_ARCHES_LEFT: ArchDef[] = [
  { x: 0.0, y: 0.45, w: 0.08, h: 0.35, side: "left" },
  { x: 0.08, y: 0.45, w: 0.08, h: 0.35, side: "left" },
  { x: 0.16, y: 0.45, w: 0.07, h: 0.32, side: "left" },
];
const LOWER_ARCHES_RIGHT: ArchDef[] = [
  { x: 0.92, y: 0.45, w: 0.08, h: 0.35, side: "right" },
  { x: 0.84, y: 0.45, w: 0.08, h: 0.35, side: "right" },
  { x: 0.77, y: 0.45, w: 0.07, h: 0.32, side: "right" },
];
const UPPER_ARCHES_LEFT: ArchDef[] = [
  { x: 0.0, y: 0.15, w: 0.07, h: 0.25, side: "left" },
  { x: 0.07, y: 0.15, w: 0.07, h: 0.25, side: "left" },
  { x: 0.14, y: 0.17, w: 0.06, h: 0.22, side: "left" },
];
const UPPER_ARCHES_RIGHT: ArchDef[] = [
  { x: 0.93, y: 0.15, w: 0.07, h: 0.25, side: "right" },
  { x: 0.86, y: 0.15, w: 0.07, h: 0.25, side: "right" },
  { x: 0.8, y: 0.17, w: 0.06, h: 0.22, side: "right" },
];

const ALL_ARCHES = [
  ...LOWER_ARCHES_LEFT,
  ...LOWER_ARCHES_RIGHT,
  ...UPPER_ARCHES_LEFT,
  ...UPPER_ARCHES_RIGHT,
];

interface Props {
  frames: EnhancedFrameData[];
}

export const Colosseum: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-generate torch flicker phases
  const torchPhases = React.useMemo(() => {
    const rng = seeded(55_207_831);
    return ALL_ARCHES.map(() => ({
      phase: rng() * Math.PI * 2,
      speed: 0.08 + rng() * 0.1,
    }));
  }, []);

  // Rolling energy (151-frame window)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Bass energy for pillar pulsing
  const bass = frames[idx].sub;

  // Cycle gating
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
  const baseOpacity = interpolate(energy, [0.02, 0.25], [0.2, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;
  if (masterOpacity < 0.01) return null;

  // Bass-driven pillar scale
  const pillarPulse = 1 + bass * 0.04;

  const glowSize = interpolate(energy, [0.02, 0.3], [2, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const renderArch = (arch: ArchDef, ai: number) => {
    const ax = arch.x * width;
    const ay = arch.y * height;
    const aw = arch.w * width;
    const ah = arch.h * height;
    const archRadius = aw / 2;

    const tp = torchPhases[ai];
    const flicker = 0.5 + 0.5 * Math.sin(frame * tp.speed + tp.phase);
    const torchGlow = 0.2 + flicker * energy * 0.6;

    // Pillar positions
    const pillarW = 8 * pillarPulse;
    const leftPillarX = ax;
    const rightPillarX = ax + aw;

    return (
      <g key={`arch-${ai}`}>
        {/* Arch opening (dark) */}
        <path
          d={`M ${leftPillarX} ${ay + ah} L ${leftPillarX} ${ay + archRadius} A ${archRadius} ${archRadius} 0 0 1 ${rightPillarX} ${ay + archRadius} L ${rightPillarX} ${ay + ah} Z`}
          fill="#0A0806"
          opacity={0.4}
        />

        {/* Torch glow inside arch */}
        <ellipse
          cx={ax + aw / 2}
          cy={ay + ah * 0.3}
          rx={aw * 0.3}
          ry={ah * 0.25}
          fill={TORCH_ORANGE}
          opacity={torchGlow * 0.3}
          style={{ filter: `blur(8px)` }}
        />
        <ellipse
          cx={ax + aw / 2}
          cy={ay + ah * 0.3}
          rx={aw * 0.15}
          ry={ah * 0.12}
          fill={TORCH_YELLOW}
          opacity={torchGlow * 0.4}
          style={{ filter: `blur(3px)` }}
        />

        {/* Arch frame (stone border) */}
        <path
          d={`M ${leftPillarX} ${ay + ah} L ${leftPillarX} ${ay + archRadius} A ${archRadius} ${archRadius} 0 0 1 ${rightPillarX} ${ay + archRadius} L ${rightPillarX} ${ay + ah}`}
          fill="none"
          stroke={SANDSTONE}
          strokeWidth={5}
          opacity={0.6}
        />

        {/* Keystone */}
        <rect
          x={ax + aw / 2 - 6}
          y={ay}
          width={12}
          height={10}
          fill={SANDSTONE_DARK}
          opacity={0.5}
          rx={1}
        />

        {/* Left pillar */}
        <rect
          x={leftPillarX - pillarW / 2}
          y={ay + archRadius}
          width={pillarW}
          height={ah - archRadius}
          fill={PILLAR_COLOR}
          opacity={0.65}
        />

        {/* Right pillar */}
        <rect
          x={rightPillarX - pillarW / 2}
          y={ay + archRadius}
          width={pillarW}
          height={ah - archRadius}
          fill={PILLAR_COLOR}
          opacity={0.65}
        />
      </g>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${SANDSTONE_DARK})`,
          willChange: "opacity",
        }}
      >
        {/* Horizontal entablature bands */}
        <rect x={0} y={height * 0.42} width={width * 0.24} height={8} fill={SANDSTONE_DARK} opacity={0.4} rx={1} />
        <rect x={width * 0.76} y={height * 0.42} width={width * 0.24} height={8} fill={SANDSTONE_DARK} opacity={0.4} rx={1} />
        <rect x={0} y={height * 0.13} width={width * 0.22} height={6} fill={SANDSTONE_SHADOW} opacity={0.35} rx={1} />
        <rect x={width * 0.78} y={height * 0.13} width={width * 0.22} height={6} fill={SANDSTONE_SHADOW} opacity={0.35} rx={1} />

        {/* Bottom wall beneath lower arches */}
        <rect x={0} y={height * 0.8} width={width * 0.24} height={height * 0.2} fill={SANDSTONE_SHADOW} opacity={0.25} rx={0} />
        <rect x={width * 0.76} y={height * 0.8} width={width * 0.24} height={height * 0.2} fill={SANDSTONE_SHADOW} opacity={0.25} rx={0} />

        {/* All arches */}
        {ALL_ARCHES.map((arch, ai) => renderArch(arch, ai))}
      </svg>
    </div>
  );
};
