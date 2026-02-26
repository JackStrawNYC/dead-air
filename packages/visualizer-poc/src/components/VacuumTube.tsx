/**
 * VacuumTube — Glowing vacuum tube amplifier elements.
 * 5 tubes arranged in a row, each with glass envelope, internal plate
 * structure, and heated filament. Filament brightness and plate glow
 * track energy. Warm orange/amber color scheme like real tube amps.
 * Appears every 60s for 16s.
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

const CYCLE = 1800; // 60s at 30fps
const DURATION = 480; // 16s
const NUM_TUBES = 5;

interface TubeData {
  xOffset: number; // 0-1 horizontal position
  height: number; // tube height scale
  filamentWobble: number; // flicker frequency
  platePhase: number;
  type: "triode" | "pentode";
}

function generateTubes(seed: number): TubeData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_TUBES }, (_, i) => ({
    xOffset: 0.2 + (i / (NUM_TUBES - 1)) * 0.6,
    height: 0.85 + rng() * 0.3,
    filamentWobble: 0.08 + rng() * 0.12,
    platePhase: rng() * Math.PI * 2,
    type: rng() > 0.4 ? ("triode" as const) : ("pentode" as const),
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const VacuumTube: React.FC<Props> = ({ frames }) => {
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

  const currentFrame = frames[idx];
  const subBass = currentFrame?.sub ?? 0;
  const midEnergy = currentFrame?.mid ?? 0;

  const tubes = React.useMemo(() => generateTubes(33333), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const envelope = Math.min(fadeIn, fadeOut) * (0.5 + energy * 0.4);

  const tubeW = 60;
  const tubeH = 120;
  const baseY = height * 0.75;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: envelope }}>
        <defs>
          <filter id="tube-filament-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="tube-plate-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="tube-glass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(180, 200, 220, 0.08)" />
            <stop offset="30%" stopColor="rgba(200, 220, 240, 0.12)" />
            <stop offset="70%" stopColor="rgba(200, 220, 240, 0.12)" />
            <stop offset="100%" stopColor="rgba(180, 200, 220, 0.06)" />
          </linearGradient>
        </defs>

        {tubes.map((tube, ti) => {
          const cx = tube.xOffset * width;
          const scaledH = tubeH * tube.height;
          const topY = baseY - scaledH;

          // Per-tube flicker from seeded PRNG
          const rng = seeded(frame * 5 + ti * 191);
          const flicker = 0.85 + rng() * 0.15;

          // Filament glow intensity
          const filamentBase = 0.3 + energy * 0.7;
          const filamentWobbleVal = Math.sin(frame * tube.filamentWobble + tube.platePhase) * 0.1;
          const filamentGlow = Math.min(1, (filamentBase + filamentWobbleVal + subBass * 0.3) * flicker);

          // Plate glow tracks mid energy
          const plateGlow = 0.15 + midEnergy * 0.6 + Math.sin(frame * 0.03 + tube.platePhase) * 0.05;

          // Filament color: orange → bright white at high energy
          const filR = 255;
          const filG = Math.floor(120 + filamentGlow * 100);
          const filB = Math.floor(filamentGlow * 80);

          return (
            <g key={`tube${ti}`}>
              {/* Glass envelope */}
              <rect
                x={cx - tubeW / 2}
                y={topY}
                width={tubeW}
                height={scaledH}
                rx={tubeW / 2}
                ry={20}
                fill="url(#tube-glass)"
                stroke="rgba(160, 180, 200, 0.15)"
                strokeWidth={1}
              />

              {/* Internal plate structure */}
              {tube.type === "pentode" && (
                <>
                  <rect
                    x={cx - 14}
                    y={topY + scaledH * 0.2}
                    width={28}
                    height={scaledH * 0.55}
                    rx={2}
                    fill="none"
                    stroke={`rgba(255, 140, 50, ${plateGlow * 0.5})`}
                    strokeWidth={1.2}
                  />
                  <rect
                    x={cx - 10}
                    y={topY + scaledH * 0.25}
                    width={20}
                    height={scaledH * 0.45}
                    rx={1}
                    fill="none"
                    stroke={`rgba(255, 120, 30, ${plateGlow * 0.3})`}
                    strokeWidth={0.8}
                    strokeDasharray="2 3"
                  />
                </>
              )}
              {tube.type === "triode" && (
                <rect
                  x={cx - 12}
                  y={topY + scaledH * 0.22}
                  width={24}
                  height={scaledH * 0.5}
                  rx={3}
                  fill="none"
                  stroke={`rgba(255, 140, 50, ${plateGlow * 0.5})`}
                  strokeWidth={1.5}
                />
              )}

              {/* Grid wires */}
              {[0.35, 0.45, 0.55, 0.65].map((frac, gi) => (
                <line
                  key={`grid${gi}`}
                  x1={cx - 8}
                  y1={topY + scaledH * frac}
                  x2={cx + 8}
                  y2={topY + scaledH * frac}
                  stroke={`rgba(200, 180, 160, ${0.2 + plateGlow * 0.2})`}
                  strokeWidth={0.5}
                />
              ))}

              {/* Filament (heated cathode) — the glowing element */}
              <g filter="url(#tube-filament-glow)">
                <path
                  d={`M ${cx - 3} ${topY + scaledH * 0.75} Q ${cx} ${topY + scaledH * 0.35} ${cx + 3} ${topY + scaledH * 0.75}`}
                  stroke={`rgb(${filR}, ${filG}, ${filB})`}
                  strokeWidth={2}
                  fill="none"
                  opacity={filamentGlow}
                />
              </g>

              {/* Warm glow emanating from filament */}
              <ellipse
                cx={cx}
                cy={topY + scaledH * 0.55}
                rx={tubeW * 0.35}
                ry={scaledH * 0.35}
                fill={`rgba(255, 140, 40, ${filamentGlow * 0.12})`}
                filter="url(#tube-plate-glow)"
              />

              {/* Base/socket */}
              <rect
                x={cx - tubeW / 2 + 2}
                y={baseY - 6}
                width={tubeW - 4}
                height={14}
                rx={3}
                fill="rgba(60, 50, 40, 0.7)"
                stroke="rgba(120, 100, 80, 0.3)"
                strokeWidth={1}
              />

              {/* Pin contacts */}
              {[-12, -6, 0, 6, 12].map((px, pi) => (
                <circle
                  key={`pin${pi}`}
                  cx={cx + px}
                  cy={baseY + 6}
                  r={1.5}
                  fill="rgba(180, 160, 120, 0.5)"
                />
              ))}
            </g>
          );
        })}

        {/* Label */}
        <text
          x={width * 0.5}
          y={baseY + 30}
          fill="rgba(255, 180, 80, 0.3)"
          fontSize={10}
          fontFamily="monospace"
          textAnchor="middle"
        >
          TUBE AMP — CLASS A
        </text>
      </svg>
    </div>
  );
};
