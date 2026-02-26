/**
 * Lighthouse — Lighthouse silhouette on right side of screen with a sweeping
 * beam of light. Beam rotation speed follows tempo/energy. Lighthouse body is
 * a tapered tower with a lantern room at top emitting the beam. Beam fans out
 * in a narrow cone, fading to transparent. Foggy atmosphere halo around light.
 * Cycle: 55s on / off, 16s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1650; // 55s at 30fps
const DURATION = 480; // 16s visible

const TOWER_COLOR = "#3A3632";
const LANTERN_COLOR = "#FFE8A0";
const BEAM_COLOR = "#FFFDE0";
const STONE_COLOR = "#4A4640";
const WINDOW_COLOR = "#FFD54F";

interface Props {
  frames: EnhancedFrameData[];
}

export const Lighthouse: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Rolling energy (151-frame window)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

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
  const baseOpacity = interpolate(energy, [0.02, 0.25], [0.25, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;
  if (masterOpacity < 0.01) return null;

  // Lighthouse position
  const towerBaseX = width * 0.88;
  const towerBaseY = height * 0.95;
  const towerTopY = height * 0.25;
  const towerBottomWidth = 55;
  const towerTopWidth = 32;
  const lanternR = 18;

  // Beam rotation speed driven by energy (faster with more energy)
  const rotSpeed = 0.8 + energy * 2.5;
  const beamAngle = (frame * rotSpeed) % 360;
  const beamAngleRad = (beamAngle * Math.PI) / 180;

  // Beam length and width
  const beamLength = Math.min(width, height) * (0.6 + energy * 0.4);
  const beamSpread = 12 + energy * 8; // degrees half-angle
  const spreadRad = (beamSpread * Math.PI) / 180;

  const lanternCx = towerBaseX;
  const lanternCy = towerTopY - 10;

  // Beam cone points
  const bx1 = lanternCx + Math.cos(beamAngleRad - spreadRad) * beamLength;
  const by1 = lanternCy + Math.sin(beamAngleRad - spreadRad) * beamLength;
  const bx2 = lanternCx + Math.cos(beamAngleRad + spreadRad) * beamLength;
  const by2 = lanternCy + Math.sin(beamAngleRad + spreadRad) * beamLength;

  const beamIntensity = interpolate(energy, [0.02, 0.3], [0.15, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowSize = interpolate(energy, [0.02, 0.3], [5, 25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Tower stone bands
  const bands = [0.2, 0.4, 0.55, 0.7, 0.85];

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          willChange: "opacity",
        }}
      >
        <defs>
          <linearGradient id="lighthouse-beam-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={BEAM_COLOR} stopOpacity={beamIntensity} />
            <stop offset="100%" stopColor={BEAM_COLOR} stopOpacity={0} />
          </linearGradient>
          <radialGradient id="lighthouse-halo">
            <stop offset="0%" stopColor={LANTERN_COLOR} stopOpacity={0.6} />
            <stop offset="40%" stopColor={LANTERN_COLOR} stopOpacity={0.15} />
            <stop offset="100%" stopColor={LANTERN_COLOR} stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Beam of light */}
        <polygon
          points={`${lanternCx},${lanternCy} ${bx1},${by1} ${bx2},${by2}`}
          fill={BEAM_COLOR}
          opacity={beamIntensity * 0.6}
          style={{ filter: `blur(4px)` }}
        />

        {/* Tower body (tapered trapezoid) */}
        <polygon
          points={`${towerBaseX - towerBottomWidth / 2},${towerBaseY} ${towerBaseX + towerBottomWidth / 2},${towerBaseY} ${towerBaseX + towerTopWidth / 2},${towerTopY + 25} ${towerBaseX - towerTopWidth / 2},${towerTopY + 25}`}
          fill={TOWER_COLOR}
          opacity={0.85}
        />

        {/* Stone bands */}
        {bands.map((t, bi) => {
          const by = towerTopY + 25 + (towerBaseY - towerTopY - 25) * t;
          const w = towerTopWidth + (towerBottomWidth - towerTopWidth) * t;
          return (
            <line
              key={`band-${bi}`}
              x1={towerBaseX - w / 2}
              y1={by}
              x2={towerBaseX + w / 2}
              y2={by}
              stroke={STONE_COLOR}
              strokeWidth={1.5}
              opacity={0.4}
            />
          );
        })}

        {/* Windows on tower */}
        {[0.35, 0.6].map((t, wi) => {
          const wy = towerTopY + 25 + (towerBaseY - towerTopY - 25) * t;
          const windowGlow = 0.3 + energy * 0.4;
          return (
            <ellipse
              key={`win-${wi}`}
              cx={towerBaseX}
              cy={wy}
              rx={5}
              ry={8}
              fill={WINDOW_COLOR}
              opacity={windowGlow}
            />
          );
        })}

        {/* Lantern room */}
        <rect
          x={towerBaseX - towerTopWidth / 2 - 4}
          y={towerTopY}
          width={towerTopWidth + 8}
          height={25}
          fill={TOWER_COLOR}
          opacity={0.8}
          rx={2}
        />

        {/* Lantern glass */}
        <rect
          x={towerBaseX - towerTopWidth / 2 + 2}
          y={towerTopY + 3}
          width={towerTopWidth - 4}
          height={19}
          fill={LANTERN_COLOR}
          opacity={0.5 + energy * 0.3}
          rx={1}
        />

        {/* Lantern roof (dome) */}
        <path
          d={`M ${towerBaseX - towerTopWidth / 2 - 2} ${towerTopY} Q ${towerBaseX} ${towerTopY - 18} ${towerBaseX + towerTopWidth / 2 + 2} ${towerTopY}`}
          fill={TOWER_COLOR}
          opacity={0.85}
        />

        {/* Halo glow around lantern */}
        <circle
          cx={lanternCx}
          cy={lanternCy}
          r={40 + energy * 30}
          fill="url(#lighthouse-halo)"
          style={{ filter: `drop-shadow(0 0 ${glowSize}px ${LANTERN_COLOR})` }}
        />

        {/* Base rocks */}
        <ellipse
          cx={towerBaseX}
          cy={towerBaseY + 5}
          rx={towerBottomWidth * 0.8}
          ry={12}
          fill="#2A2825"
          opacity={0.5}
        />
      </svg>
    </div>
  );
};
