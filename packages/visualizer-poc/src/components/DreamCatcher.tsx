/**
 * DreamCatcher -- Circular dreamcatcher frame with internal web pattern
 * (concentric polygon with radial threads). Feathers hanging from bottom
 * (3-5 elongated teardrop shapes). Beads at thread intersections. Web threads
 * shimmer with energy. Feathers sway gently. Earth tones with turquoise/coral
 * accents. Cycle: 75s, 22s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2250;   // 75 seconds at 30fps
const DURATION = 660;  // 22 seconds visible

const COLORS = {
  frame: "#8B6914",      // dark gold / leather brown
  web: "#D2B48C",        // tan
  turquoise: "#40E0D0",
  coral: "#FF6F61",
  bead: "#40E0D0",
  featherBase: "#8B7355",
  featherTip: "#D2B48C",
  featherAccent: "#FF6F61",
};

interface FeatherDef {
  angle: number;     // radians from bottom center
  length: number;    // fraction of radius
  sway: number;      // sway phase offset
  colorIdx: number;  // 0=base, 1=accent
}

function generateFeathers(seed: number): FeatherDef[] {
  const rng = seeded(seed);
  const count = 4;
  const feathers: FeatherDef[] = [];
  for (let i = 0; i < count; i++) {
    feathers.push({
      angle: Math.PI / 2 + (i - (count - 1) / 2) * 0.25 + (rng() - 0.5) * 0.08,
      length: 0.5 + rng() * 0.3,
      sway: rng() * Math.PI * 2,
      colorIdx: i % 2,
    });
  }
  return feathers;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const DreamCatcher: React.FC<Props> = ({ frames }) => {
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

  const feathers = React.useMemo(() => generateFeathers(75422), []);

  // Bead positions on web intersections (deterministic)
  const beadPositions = React.useMemo(() => {
    const rng = seeded(98765);
    const beads: Array<{ ring: number; spoke: number }> = [];
    const rings = 5;
    const spokes = 12;
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < spokes; s++) {
        if (rng() > 0.7) {
          beads.push({ ring: r, spoke: s });
        }
      }
    }
    return beads;
  }, []);

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
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.03, 0.25], [0.2, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.4;
  const radius = Math.min(width, height) * 0.22;

  // Web shimmer driven by energy
  const shimmer = interpolate(energy, [0.03, 0.3], [0.3, 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Feather sway driven by energy
  const swayAmp = interpolate(energy, [0.02, 0.25], [2, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Web parameters
  const NUM_SPOKES = 12;
  const NUM_RINGS = 5;

  // Gentle rotation
  const webRotation = Math.sin(frame * 0.005) * 3;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 4px ${COLORS.turquoise}44)`,
        }}
      >
        <defs>
          <filter id="dc-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${cx}, ${cy}) rotate(${webRotation})`}>
          {/* Outer frame ring -- double ring */}
          <circle cx={0} cy={0} r={radius} fill="none" stroke={COLORS.frame} strokeWidth={4} opacity={0.7} />
          <circle cx={0} cy={0} r={radius - 3} fill="none" stroke={COLORS.frame} strokeWidth={1} opacity={0.4} />

          {/* Radial spokes */}
          {Array.from({ length: NUM_SPOKES }).map((_, si) => {
            const angle = (si / NUM_SPOKES) * Math.PI * 2;
            const x2 = Math.cos(angle) * (radius - 5);
            const y2 = Math.sin(angle) * (radius - 5);
            return (
              <line
                key={`spoke-${si}`}
                x1={0}
                y1={0}
                x2={x2}
                y2={y2}
                stroke={COLORS.web}
                strokeWidth={0.8}
                opacity={0.4 + shimmer * 0.3}
              />
            );
          })}

          {/* Concentric web rings (slightly irregular -- not perfect circles but polygons) */}
          {Array.from({ length: NUM_RINGS }).map((_, ri) => {
            const ringRadius = ((ri + 1) / (NUM_RINGS + 1)) * (radius - 8);
            const points = Array.from({ length: NUM_SPOKES }, (__, si) => {
              const angle = (si / NUM_SPOKES) * Math.PI * 2;
              // Slight inward pull (web sag)
              const sag = 1 - Math.sin(frame * 0.02 + ri * 0.5 + si * 0.3) * 0.04 * energy;
              const r = ringRadius * sag;
              return `${Math.cos(angle) * r},${Math.sin(angle) * r}`;
            }).join(" ");

            const shimmerOp = 0.3 + shimmer * 0.4 + Math.sin(frame * 0.05 + ri) * 0.1;

            return (
              <polygon
                key={`ring-${ri}`}
                points={points}
                fill="none"
                stroke={ri % 2 === 0 ? COLORS.web : COLORS.turquoise}
                strokeWidth={0.6}
                opacity={shimmerOp}
              />
            );
          })}

          {/* Beads at intersections */}
          {beadPositions.map((bead, bi) => {
            const ringRadius = ((bead.ring + 1) / (NUM_RINGS + 1)) * (radius - 8);
            const angle = (bead.spoke / NUM_SPOKES) * Math.PI * 2;
            const bx = Math.cos(angle) * ringRadius;
            const by = Math.sin(angle) * ringRadius;
            const beadColor = bi % 3 === 0 ? COLORS.coral : COLORS.turquoise;
            const pulse = 1 + Math.sin(frame * 0.08 + bi) * 0.2 * energy;

            return (
              <circle
                key={`bead-${bi}`}
                cx={bx}
                cy={by}
                r={2.5 * pulse}
                fill={beadColor}
                opacity={0.6}
              />
            );
          })}

          {/* Center spiral / void */}
          <circle cx={0} cy={0} r={8} fill="none" stroke={COLORS.turquoise} strokeWidth={1} opacity={0.4 + energy * 0.3} />
          <circle cx={0} cy={0} r={3} fill={COLORS.coral} opacity={0.3 + energy * 0.3} />
        </g>

        {/* Feathers hanging from bottom */}
        {feathers.map((feather, fi) => {
          const attachAngle = feather.angle;
          const attachX = cx + Math.cos(attachAngle) * radius;
          const attachY = cy + Math.sin(attachAngle) * radius;

          // Pendulum sway
          const sway = Math.sin(frame * 0.03 + feather.sway) * swayAmp;
          const swayRad = (sway * Math.PI) / 180;

          const featherLen = radius * feather.length;
          const tipX = attachX + Math.sin(swayRad) * featherLen;
          const tipY = attachY + Math.cos(swayRad) * featherLen;

          const midX = (attachX + tipX) / 2 + Math.sin(swayRad) * featherLen * 0.15;
          const midY = (attachY + tipY) / 2;

          const featherColor = feather.colorIdx === 0 ? COLORS.featherBase : COLORS.featherAccent;

          // Feather as elongated teardrop (quadratic bezier path)
          const bulge = 8 + energy * 4;
          const perpAngle = Math.atan2(tipY - attachY, tipX - attachX) + Math.PI / 2;
          const bx1 = midX + Math.cos(perpAngle) * bulge;
          const by1 = midY + Math.sin(perpAngle) * bulge;
          const bx2 = midX - Math.cos(perpAngle) * bulge;
          const by2 = midY - Math.sin(perpAngle) * bulge;

          const d = `M ${attachX} ${attachY} Q ${bx1} ${by1} ${tipX} ${tipY} Q ${bx2} ${by2} ${attachX} ${attachY}`;

          return (
            <g key={`feather-${fi}`}>
              {/* String from frame to feather */}
              <line
                x1={attachX}
                y1={attachY}
                x2={attachX}
                y2={attachY + 5}
                stroke={COLORS.web}
                strokeWidth={0.8}
                opacity={0.4}
              />
              {/* Feather body */}
              <path
                d={d}
                fill={featherColor}
                fillOpacity={0.25}
                stroke={featherColor}
                strokeWidth={1}
                opacity={0.6}
              />
              {/* Central quill */}
              <line
                x1={attachX}
                y1={attachY}
                x2={tipX}
                y2={tipY}
                stroke={COLORS.featherTip}
                strokeWidth={0.8}
                opacity={0.5}
              />
              {/* Small bead at attachment */}
              <circle cx={attachX} cy={attachY + 3} r={2} fill={COLORS.turquoise} opacity={0.5} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
