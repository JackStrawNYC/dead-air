/**
 * RuneCircle — Rotating circle of 12-16 glowing runes/symbols arranged in a ring.
 * The ring slowly rotates. Individual runes pulse brighter on beat detection.
 * Ancient/mystical aesthetic -- golden/amber glow on dark. A second inner ring
 * rotates opposite direction. Energy drives glow intensity and rotation speed.
 * Cycle: 50s, 15s visible.
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

const CYCLE = 1500; // 50s at 30fps
const DURATION = 450; // 15s visible
const OUTER_RUNE_COUNT = 16;
const INNER_RUNE_COUNT = 8;

// Rune-like SVG path data (simple mystical glyphs)
const RUNE_PATHS: string[] = [
  // Fehu: vertical + two right arms
  "M 0 -8 L 0 8 M 0 -8 L 6 -3 M 0 -2 L 6 3",
  // Uruz: down-right-down
  "M -3 -8 L -3 2 L 3 -2 L 3 8",
  // Thurisaz: vertical + thorn
  "M 0 -8 L 0 8 M 0 -4 L 5 0 L 0 4",
  // Ansuz: vertical + two left slashes
  "M 0 -8 L 0 8 M 0 -6 L -5 -1 M 0 -1 L -5 4",
  // Raidho: vertical + > shape
  "M -2 -8 L -2 8 M -2 -8 L 5 0 L -2 0",
  // Kenaz: < shape
  "M 4 -8 L -4 0 L 4 8",
  // Gebo: X cross
  "M -6 -6 L 6 6 M 6 -6 L -6 6",
  // Wunjo: vertical + flag
  "M 0 -8 L 0 8 M 0 -8 L 5 -4 L 0 0",
  // Hagalaz: H shape
  "M -4 -8 L -4 8 M 4 -8 L 4 8 M -4 0 L 4 0",
  // Nauthiz: X with vertical
  "M 0 -8 L 0 8 M -5 -4 L 5 4",
  // Isa: vertical line
  "M 0 -8 L 0 8",
  // Jera: two interlocking angles
  "M -2 -6 L 4 0 L -2 0 M 2 6 L -4 0 L 2 0",
  // Eihwaz: zigzag vertical
  "M 0 -8 L 4 -3 L -4 3 L 0 8",
  // Pertho: cup shape
  "M -3 -8 L -3 8 M -3 -4 L 3 -2 L 3 2 L -3 4",
  // Algiz: Y shape
  "M 0 8 L 0 -2 M 0 -2 L -5 -8 M 0 -2 L 5 -8",
  // Sowilo: S-lightning
  "M -4 -8 L 4 -3 L -4 3 L 4 8",
];

interface RuneData {
  pathIdx: number;
  pulsePhase: number;
  pulseFreq: number;
  scale: number;
}

interface RuneCircleData {
  outer: RuneData[];
  inner: RuneData[];
}

function generateRunes(seed: number): RuneCircleData {
  const rng = seeded(seed);

  const outer: RuneData[] = Array.from({ length: OUTER_RUNE_COUNT }, () => ({
    pathIdx: Math.floor(rng() * RUNE_PATHS.length),
    pulsePhase: rng() * Math.PI * 2,
    pulseFreq: 0.03 + rng() * 0.05,
    scale: 0.9 + rng() * 0.3,
  }));

  const inner: RuneData[] = Array.from({ length: INNER_RUNE_COUNT }, () => ({
    pathIdx: Math.floor(rng() * RUNE_PATHS.length),
    pulsePhase: rng() * Math.PI * 2,
    pulseFreq: 0.04 + rng() * 0.04,
    scale: 0.7 + rng() * 0.3,
  }));

  return { outer, inner };
}

interface Props {
  frames: EnhancedFrameData[];
}

export const RuneCircle: React.FC<Props> = ({ frames }) => {
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

  const runeData = React.useMemo(() => generateRunes(33333333), []);

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
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.4 + energy * 0.4);

  if (masterOpacity < 0.01) return null;

  const beat = frames[idx].beat;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const outerRadius = Math.min(width, height) * 0.3;
  const innerRadius = outerRadius * 0.55;

  // Rotation speeds driven by energy
  const rotSpeed = 0.15 + energy * 0.3;
  const outerRotation = frame * rotSpeed;
  const innerRotation = -frame * rotSpeed * 0.7;

  // Glow colors
  const baseHue = 38; // amber/golden
  const glowColor = `hsla(${baseHue}, 85%, 55%, 0.6)`;
  const brightGlow = `hsla(${baseHue}, 90%, 70%, 0.8)`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 8px ${glowColor}) drop-shadow(0 0 16px rgba(218, 165, 32, 0.3))`,
        }}
      >
        <defs>
          <filter id="rune-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer ring circle (decorative) */}
        <circle
          cx={cx}
          cy={cy}
          r={outerRadius + 10}
          stroke={`hsla(${baseHue}, 70%, 45%, 0.2)`}
          strokeWidth={1}
          fill="none"
        />
        <circle
          cx={cx}
          cy={cy}
          r={outerRadius - 10}
          stroke={`hsla(${baseHue}, 70%, 45%, 0.15)`}
          strokeWidth={0.5}
          fill="none"
        />

        {/* Inner decorative ring */}
        <circle
          cx={cx}
          cy={cy}
          r={innerRadius + 8}
          stroke={`hsla(${baseHue}, 70%, 45%, 0.15)`}
          strokeWidth={0.5}
          fill="none"
        />
        <circle
          cx={cx}
          cy={cy}
          r={innerRadius - 8}
          stroke={`hsla(${baseHue}, 70%, 45%, 0.1)`}
          strokeWidth={0.5}
          fill="none"
        />

        {/* Outer rune ring */}
        <g transform={`translate(${cx}, ${cy}) rotate(${outerRotation})`}>
          {runeData.outer.map((rune, ri) => {
            const angle = (ri / OUTER_RUNE_COUNT) * Math.PI * 2;
            const rx = Math.cos(angle) * outerRadius;
            const ry = Math.sin(angle) * outerRadius;

            const pulse = (Math.sin(frame * rune.pulseFreq + rune.pulsePhase) + 1) * 0.5;
            const beatBoost = beat ? 1.5 : 1;
            const runeOpacity = (0.4 + pulse * 0.4 + energy * 0.3) * beatBoost;
            const runeScale = rune.scale * (0.9 + energy * 0.2 + (beat ? 0.3 : 0));

            const runeColor = beat
              ? brightGlow
              : `hsla(${baseHue}, 80%, ${50 + pulse * 20}%, ${runeOpacity})`;

            // Rotate rune to face outward
            const facingAngle = (angle * 180) / Math.PI + 90;

            return (
              <g
                key={`outer-${ri}`}
                transform={`translate(${rx}, ${ry}) rotate(${facingAngle}) scale(${runeScale})`}
              >
                <path
                  d={RUNE_PATHS[rune.pathIdx]}
                  stroke={runeColor}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  fill="none"
                  filter="url(#rune-glow)"
                />
              </g>
            );
          })}
        </g>

        {/* Inner rune ring (rotates opposite) */}
        <g transform={`translate(${cx}, ${cy}) rotate(${innerRotation})`}>
          {runeData.inner.map((rune, ri) => {
            const angle = (ri / INNER_RUNE_COUNT) * Math.PI * 2;
            const rx = Math.cos(angle) * innerRadius;
            const ry = Math.sin(angle) * innerRadius;

            const pulse = (Math.sin(frame * rune.pulseFreq + rune.pulsePhase) + 1) * 0.5;
            const beatBoost = beat ? 1.3 : 1;
            const runeOpacity = (0.35 + pulse * 0.35 + energy * 0.25) * beatBoost;
            const runeScale = rune.scale * (0.85 + energy * 0.15);

            const runeColor = `hsla(${baseHue + 15}, 75%, ${45 + pulse * 15}%, ${runeOpacity})`;
            const facingAngle = (angle * 180) / Math.PI + 90;

            return (
              <g
                key={`inner-${ri}`}
                transform={`translate(${rx}, ${ry}) rotate(${facingAngle}) scale(${runeScale})`}
              >
                <path
                  d={RUNE_PATHS[rune.pathIdx]}
                  stroke={runeColor}
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  fill="none"
                  filter="url(#rune-glow)"
                />
              </g>
            );
          })}
        </g>

        {/* Center point */}
        <circle
          cx={cx}
          cy={cy}
          r={3 + energy * 5}
          fill={`hsla(${baseHue}, 90%, 65%, ${0.5 + energy * 0.3})`}
          filter="url(#rune-glow)"
        />
      </svg>
    </div>
  );
};
