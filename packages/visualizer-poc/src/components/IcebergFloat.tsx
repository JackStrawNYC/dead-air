/**
 * IcebergFloat — 2-4 iceberg shapes floating in water at bottom of screen.
 * Each iceberg is an irregular polygon above a water line with a larger underwater
 * portion (faint, below waterline). Icebergs bob gently up/down. Ice blue/white/cyan
 * palette. Water line with subtle wave. Icebergs drift slowly sideways. Energy drives
 * bob amplitude. Cycle: 70s, 20s visible.
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

const NUM_BERGS = 3;
const VISIBLE_DURATION = 600; // 20s at 30fps
const CYCLE_GAP = 1500; // 50s gap (70s total - 20s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;

interface IcebergShape {
  /** Above-water polygon points (relative to center, y negative = up) */
  abovePoints: { x: number; y: number }[];
  /** Below-water polygon points (y positive = down, larger) */
  belowPoints: { x: number; y: number }[];
  /** Scale factor */
  scale: number;
  /** X position 0-1 */
  xBase: number;
  /** Drift speed */
  driftSpeed: number;
  /** Bob phase offset */
  bobPhase: number;
  /** Color tint index */
  tintIdx: number;
}

function generateBergs(seed: number): IcebergShape[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_BERGS }, (_, i) => {
    // Generate irregular above-water shape (5-7 vertices)
    const numAbove = 5 + Math.floor(rng() * 3);
    const abovePoints: { x: number; y: number }[] = [];
    for (let v = 0; v < numAbove; v++) {
      const angle = (v / numAbove) * Math.PI * 2 - Math.PI / 2;
      const r = 15 + rng() * 20;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r * 0.7;
      // Keep above-water points above the waterline
      abovePoints.push({ x, y: Math.min(y, 2) });
    }

    // Generate below-water shape (larger, 6-8 vertices)
    const numBelow = 6 + Math.floor(rng() * 3);
    const belowPoints: { x: number; y: number }[] = [];
    for (let v = 0; v < numBelow; v++) {
      const angle = (v / numBelow) * Math.PI - Math.PI / 2;
      const r = 25 + rng() * 35;
      const x = Math.cos(angle) * r * 1.2;
      const y = Math.abs(Math.sin(angle)) * r + 5;
      belowPoints.push({ x, y });
    }

    return {
      abovePoints,
      belowPoints,
      scale: 1.5 + rng() * 1.5,
      xBase: 0.15 + (i / NUM_BERGS) * 0.6 + (rng() - 0.5) * 0.1,
      driftSpeed: 0.08 + rng() * 0.15,
      bobPhase: rng() * Math.PI * 2,
      tintIdx: Math.floor(rng() * 3),
    };
  });
}

const TINTS = [
  { above: "#D0EEFF", below: "#6BA8CC", highlight: "#F0F8FF" },
  { above: "#C8E8F8", below: "#5E9BB5", highlight: "#E8F6FF" },
  { above: "#B8E0F0", below: "#4F8DA8", highlight: "#DCEEFF" },
];

interface Props {
  frames: EnhancedFrameData[];
}

export const IcebergFloat: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const bergs = React.useMemo(() => generateBergs(50877019), []);

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
  const masterOpacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0, 0.2], [0.45, 0.75], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Water line position
  const waterY = height * 0.78;
  const numWavePoints = 80;
  const waveStepX = width / (numWavePoints - 1);

  // Build wave path
  let wavePath = `M 0 ${waterY}`;
  for (let wp = 0; wp < numWavePoints; wp++) {
    const wx = wp * waveStepX;
    const waveOff =
      Math.sin(wx * 0.01 + frame * 0.03) * 3 +
      Math.sin(wx * 0.025 + frame * 0.05) * 1.5;
    wavePath += ` L ${wx} ${waterY + waveOff}`;
  }
  wavePath += ` L ${width} ${height} L 0 ${height} Z`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <clipPath id="above-water">
            <rect x={0} y={0} width={width} height={waterY} />
          </clipPath>
          <clipPath id="below-water">
            <rect x={0} y={waterY} width={width} height={height - waterY} />
          </clipPath>
        </defs>

        {/* Water fill */}
        <path d={wavePath} fill="rgba(20,60,100,0.25)" />

        {/* Wave line */}
        {(() => {
          let waveLinePath = "";
          for (let wp = 0; wp < numWavePoints; wp++) {
            const wx = wp * waveStepX;
            const waveOff =
              Math.sin(wx * 0.01 + frame * 0.03) * 3 +
              Math.sin(wx * 0.025 + frame * 0.05) * 1.5;
            waveLinePath += wp === 0 ? `M ${wx} ${waterY + waveOff}` : ` L ${wx} ${waterY + waveOff}`;
          }
          return (
            <path
              d={waveLinePath}
              stroke="rgba(120,180,220,0.5)"
              strokeWidth={1.5}
              fill="none"
            />
          );
        })()}

        {/* Icebergs */}
        {bergs.map((berg, bi) => {
          const tint = TINTS[berg.tintIdx % TINTS.length];

          // Bob
          const bobAmp = 3 + energy * 10;
          const bobY = Math.sin(frame * 0.025 + berg.bobPhase) * bobAmp;

          // Drift
          const drift = Math.sin(frame * berg.driftSpeed * 0.01 + bi * 3) * 30;
          const cx = berg.xBase * width + drift;
          const cy = waterY + bobY;

          const s = berg.scale;

          // Above-water polygon
          const abovePoly = berg.abovePoints
            .map((p) => `${cx + p.x * s},${cy + p.y * s}`)
            .join(" ");

          // Below-water polygon
          const belowPoly = berg.belowPoints
            .map((p) => `${cx + p.x * s},${cy + p.y * s}`)
            .join(" ");

          return (
            <g key={bi}>
              {/* Below-water portion (clipped, faint) */}
              <g clipPath="url(#below-water)">
                <polygon
                  points={belowPoly}
                  fill={tint.below}
                  opacity={0.25}
                  stroke={tint.below}
                  strokeWidth={0.5}
                />
              </g>
              {/* Above-water portion */}
              <g clipPath="url(#above-water)">
                <polygon
                  points={abovePoly}
                  fill={tint.above}
                  opacity={0.8}
                  stroke={tint.highlight}
                  strokeWidth={1}
                />
                {/* Highlight facet */}
                <polygon
                  points={abovePoly}
                  fill={tint.highlight}
                  opacity={0.15}
                />
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
