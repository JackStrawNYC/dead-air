/**
 * Macrame — Knotted rope pattern hanging from top of screen.
 * 6-8 vertical cord strands with decorative knot clusters.
 * Knots form at intervals: square knots (crossing X patterns), spiral knots.
 * Natural hemp/cream color with occasional colored beads (small circles).
 * Strands sway with energy. Boho aesthetic. Cycle: 60s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1800; // 60s at 30fps
const DURATION = 540; // 18s visible
const STRAND_COUNT = 8;
const KNOT_ROWS = 6;

const HEMP_COLORS = [
  "#D4C5A0", // natural hemp
  "#C8B88A", // darker hemp
  "#E8DCC0", // light cream
  "#BFB08A", // warm tan
];

const BEAD_COLORS = [
  "#C07040", // terracotta
  "#4A8C6F", // jade green
  "#6B5B95", // muted purple
  "#D4AA70", // warm amber
  "#8B4513", // saddle brown
  "#5B8FA8", // dusty blue
];

interface StrandData {
  baseX: number;
  colorIdx: number;
  thickness: number;
  swayPhase: number;
  swayAmp: number;
  beadPositions: number[];
  beadColors: number[];
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Macrame: React.FC<Props> = ({ frames }) => {
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

  const strands = React.useMemo(() => {
    const rng = seeded(60_018_005);
    const spacing = 1920 / (STRAND_COUNT + 1);
    return Array.from({ length: STRAND_COUNT }, (_, si): StrandData => {
      const beadCount = 1 + Math.floor(rng() * 3);
      return {
        baseX: spacing * (si + 1),
        colorIdx: Math.floor(rng() * HEMP_COLORS.length),
        thickness: 2.5 + rng() * 2,
        swayPhase: rng() * Math.PI * 2,
        swayAmp: 8 + rng() * 15,
        beadPositions: Array.from({ length: beadCount }, () => 0.3 + rng() * 0.6),
        beadColors: Array.from({ length: beadCount }, () => Math.floor(rng() * BEAD_COLORS.length)),
      };
    });
  }, []);

  const knotSeeds = React.useMemo(() => {
    const rng = seeded(60_018_006);
    return Array.from({ length: KNOT_ROWS * STRAND_COUNT }, () => rng());
  }, []);

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

  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.18, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  // Sway multiplier from energy
  const swayMult = 0.5 + energy * 3.0;

  // Hanging bar at top
  const barY = 30;
  const barElements: React.ReactNode[] = [
    <line
      key="bar"
      x1={width * 0.1}
      y1={barY}
      x2={width * 0.9}
      y2={barY}
      stroke="#8B7D6B"
      strokeWidth={6}
      strokeLinecap="round"
    />,
  ];

  // Build strands + knots
  const strandElements: React.ReactNode[] = [];

  for (let si = 0; si < STRAND_COUNT; si++) {
    const strand = strands[si];
    const color = HEMP_COLORS[strand.colorIdx];

    // Sway offset varies along the strand length (pendulum: more sway at bottom)
    const swayAtY = (y: number): number => {
      const normalizedY = (y - barY) / (height - barY);
      return Math.sin(frame * 0.03 + strand.swayPhase) * strand.swayAmp * swayMult * normalizedY;
    };

    // Build strand path
    const segments = 40;
    let strandPath = "";
    for (let s = 0; s <= segments; s++) {
      const y = barY + (s / segments) * (height * 0.85);
      const x = strand.baseX + swayAtY(y);
      if (s === 0) {
        strandPath = `M ${x} ${y}`;
      } else {
        strandPath += ` L ${x} ${y}`;
      }
    }

    // Main strand rope
    strandElements.push(
      <path
        key={`strand-${si}`}
        d={strandPath}
        fill="none"
        stroke={color}
        strokeWidth={strand.thickness}
        strokeLinecap="round"
        opacity={0.8}
      />
    );

    // Fringe at bottom
    const bottomY = barY + height * 0.85;
    const bottomX = strand.baseX + swayAtY(bottomY);
    const fringeCount = 3;
    for (let f = 0; f < fringeCount; f++) {
      const fAngle = ((f - 1) * 0.15);
      const fLen = 30 + Math.sin(frame * 0.02 + si + f) * 5;
      const fx = bottomX + Math.sin(fAngle) * fLen;
      const fy = bottomY + Math.cos(fAngle) * fLen;
      strandElements.push(
        <line
          key={`fringe-${si}-${f}`}
          x1={bottomX}
          y1={bottomY}
          x2={fx}
          y2={fy}
          stroke={color}
          strokeWidth={strand.thickness * 0.6}
          strokeLinecap="round"
          opacity={0.5}
        />
      );
    }

    // Beads
    for (let bi = 0; bi < strand.beadPositions.length; bi++) {
      const beadY = barY + strand.beadPositions[bi] * (height * 0.85);
      const beadX = strand.baseX + swayAtY(beadY);
      const beadColor = BEAD_COLORS[strand.beadColors[bi]];
      strandElements.push(
        <circle
          key={`bead-${si}-${bi}`}
          cx={beadX}
          cy={beadY}
          r={4 + energy * 2}
          fill={beadColor}
          opacity={0.7}
          stroke="rgba(0,0,0,0.2)"
          strokeWidth={0.5}
        />
      );
    }
  }

  // Knots between adjacent strands
  const knotElements: React.ReactNode[] = [];
  const knotSpacingY = (height * 0.75) / (KNOT_ROWS + 1);

  for (let row = 0; row < KNOT_ROWS; row++) {
    const knotY = barY + knotSpacingY * (row + 1);

    for (let si = 0; si < STRAND_COUNT - 1; si++) {
      const seedVal = knotSeeds[row * STRAND_COUNT + si];
      if (seedVal < 0.5) continue; // not all pairs get knots

      const leftX = strands[si].baseX + Math.sin(frame * 0.03 + strands[si].swayPhase) *
        strands[si].swayAmp * swayMult * ((knotY - barY) / (height - barY));
      const rightX = strands[si + 1].baseX + Math.sin(frame * 0.03 + strands[si + 1].swayPhase) *
        strands[si + 1].swayAmp * swayMult * ((knotY - barY) / (height - barY));
      const midX = (leftX + rightX) / 2;

      if (seedVal > 0.75) {
        // Square knot: crossing X pattern
        const knotSize = 12 + energy * 5;
        knotElements.push(
          <g key={`knot-${row}-${si}`}>
            {/* X crossing */}
            <line
              x1={midX - knotSize}
              y1={knotY - knotSize}
              x2={midX + knotSize}
              y2={knotY + knotSize}
              stroke={HEMP_COLORS[0]}
              strokeWidth={2.5}
              opacity={0.7}
            />
            <line
              x1={midX + knotSize}
              y1={knotY - knotSize}
              x2={midX - knotSize}
              y2={knotY + knotSize}
              stroke={HEMP_COLORS[1]}
              strokeWidth={2.5}
              opacity={0.7}
            />
            {/* Center wrapping */}
            <circle
              cx={midX}
              cy={knotY}
              r={3}
              fill={HEMP_COLORS[2]}
              opacity={0.6}
            />
          </g>
        );
      } else {
        // Spiral knot: small coil
        const coilR = 6 + energy * 3;
        let coilPath = "";
        for (let c = 0; c <= 12; c++) {
          const a = (c / 12) * Math.PI * 3;
          const r = coilR * (c / 12);
          const cx = midX + Math.cos(a) * r;
          const cy = knotY + Math.sin(a) * r;
          if (c === 0) {
            coilPath = `M ${cx} ${cy}`;
          } else {
            coilPath += ` L ${cx} ${cy}`;
          }
        }
        knotElements.push(
          <path
            key={`knot-${row}-${si}`}
            d={coilPath}
            fill="none"
            stroke={HEMP_COLORS[0]}
            strokeWidth={2}
            opacity={0.6}
          />
        );
      }
    }
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 3px rgba(212, 197, 160, 0.3))`,
        }}
      >
        {barElements}
        {strandElements}
        {knotElements}
      </svg>
    </div>
  );
};
