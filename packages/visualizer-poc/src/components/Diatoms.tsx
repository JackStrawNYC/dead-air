/**
 * Diatoms — 4-6 microscopic diatom organisms -- radially symmetric circular/oval shapes
 * with intricate geometric internal patterns. Each diatom slowly rotates and drifts.
 * Patterns built from concentric circles, radial lines, and petal-like segments.
 * Bioluminescent greens, blues, golds. Scientific beauty.
 * Energy drives pattern complexity and glow.
 * Cycle: 70s, 22s visible.
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

const CYCLE = 2100;    // 70 seconds at 30fps
const DURATION = 660;  // 22 seconds
const NUM_DIATOMS = 5;

const DIATOM_PALETTES = [
  { primary: "#00E676", secondary: "#69F0AE", accent: "#B9F6CA", glow: "#00C853" },  // bioluminescent green
  { primary: "#40C4FF", secondary: "#80D8FF", accent: "#B3E5FC", glow: "#0091EA" },  // ocean blue
  { primary: "#FFD740", secondary: "#FFE57F", accent: "#FFF9C4", glow: "#FFB300" },  // golden
  { primary: "#00BFA5", secondary: "#64FFDA", accent: "#A7FFEB", glow: "#00897B" },  // teal
  { primary: "#7C4DFF", secondary: "#B388FF", accent: "#D1C4E9", glow: "#651FFF" },  // deep violet
];

interface DiatomData {
  x: number;             // 0-1 position
  y: number;
  radius: number;        // 40-90 outer radius
  paletteIdx: number;
  rotSpeed: number;       // rotation speed
  rotPhase: number;
  driftXSpeed: number;
  driftYSpeed: number;
  driftXPhase: number;
  driftYPhase: number;
  symmetry: number;       // 6, 8, or 12 fold symmetry
  ringCount: number;      // 3-5 concentric rings
  petalCount: number;     // number of petals in inner pattern
  isOval: boolean;        // oval or circular
  ovalRatio: number;      // 0.6-0.85 for ovals
}

function generateDiatoms(seed: number): DiatomData[] {
  const rng = seeded(seed);
  const symmetries = [6, 8, 12];
  return Array.from({ length: NUM_DIATOMS }, () => ({
    x: 0.12 + rng() * 0.76,
    y: 0.12 + rng() * 0.76,
    radius: 45 + rng() * 50,
    paletteIdx: Math.floor(rng() * DIATOM_PALETTES.length),
    rotSpeed: 0.1 + rng() * 0.2,
    rotPhase: rng() * 360,
    driftXSpeed: 0.005 + rng() * 0.01,
    driftYSpeed: 0.003 + rng() * 0.008,
    driftXPhase: rng() * Math.PI * 2,
    driftYPhase: rng() * Math.PI * 2,
    symmetry: symmetries[Math.floor(rng() * symmetries.length)],
    ringCount: 3 + Math.floor(rng() * 3),
    petalCount: 5 + Math.floor(rng() * 8),
    isOval: rng() > 0.5,
    ovalRatio: 0.6 + rng() * 0.25,
  }));
}

/** Build an SVG group for one diatom's internal pattern */
function DiatomPattern({
  diatom,
  cx,
  cy,
  rotation,
  energy,
  palette,
}: {
  diatom: DiatomData;
  cx: number;
  cy: number;
  rotation: number;
  energy: number;
  palette: typeof DIATOM_PALETTES[0];
}): React.ReactElement {
  const r = diatom.radius;
  const scaleY = diatom.isOval ? diatom.ovalRatio : 1;

  // Energy-driven complexity: more details at higher energy
  const detailLevel = 0.5 + energy * 1.5;

  return (
    <g transform={`translate(${cx}, ${cy}) rotate(${rotation}) scale(1, ${scaleY})`}>
      {/* Outer membrane */}
      <circle
        cx={0}
        cy={0}
        r={r}
        fill="none"
        stroke={palette.primary}
        strokeWidth={2}
        opacity={0.6}
      />
      <circle
        cx={0}
        cy={0}
        r={r - 3}
        fill="none"
        stroke={palette.secondary}
        strokeWidth={0.8}
        opacity={0.35}
      />

      {/* Concentric rings */}
      {Array.from({ length: diatom.ringCount }, (_, ri) => {
        const ringR = r * ((ri + 1) / (diatom.ringCount + 1));
        return (
          <circle
            key={`ring-${ri}`}
            cx={0}
            cy={0}
            r={ringR}
            fill="none"
            stroke={palette.secondary}
            strokeWidth={0.6}
            opacity={0.3 + ri * 0.05}
            strokeDasharray={ri % 2 === 0 ? "none" : `${3} ${3}`}
          />
        );
      })}

      {/* Radial lines (symmetry-fold) */}
      {Array.from({ length: diatom.symmetry }, (_, si) => {
        const angle = (si / diatom.symmetry) * 360;
        const rad = angle * Math.PI / 180;
        return (
          <line
            key={`rad-${si}`}
            x1={0}
            y1={0}
            x2={Math.cos(rad) * r * 0.9}
            y2={Math.sin(rad) * r * 0.9}
            stroke={palette.accent}
            strokeWidth={0.5}
            opacity={0.25}
          />
        );
      })}

      {/* Petal-like segments (inner pattern) */}
      {Array.from({ length: diatom.petalCount }, (_, pi) => {
        const angle = (pi / diatom.petalCount) * 360;
        const rad = angle * Math.PI / 180;
        const petalR = r * 0.4 * detailLevel;
        const petalW = r * 0.12;
        // Each petal is an ellipse rotated and placed
        const px = Math.cos(rad) * r * 0.3;
        const py = Math.sin(rad) * r * 0.3;
        return (
          <ellipse
            key={`petal-${pi}`}
            cx={px}
            cy={py}
            rx={petalR}
            ry={petalW}
            fill={palette.primary}
            opacity={0.15 + energy * 0.1}
            transform={`rotate(${angle} ${px} ${py})`}
          />
        );
      })}

      {/* Center hub */}
      <circle
        cx={0}
        cy={0}
        r={r * 0.12}
        fill={palette.primary}
        opacity={0.4 + energy * 0.2}
      />
      <circle
        cx={0}
        cy={0}
        r={r * 0.06}
        fill={palette.accent}
        opacity={0.6}
      />

      {/* Outer dots at symmetry points */}
      {detailLevel > 0.8 && Array.from({ length: diatom.symmetry }, (_, si) => {
        const angle = ((si + 0.5) / diatom.symmetry) * 360;
        const rad = angle * Math.PI / 180;
        return (
          <circle
            key={`dot-${si}`}
            cx={Math.cos(rad) * r * 0.85}
            cy={Math.sin(rad) * r * 0.85}
            r={2}
            fill={palette.accent}
            opacity={0.4}
          />
        );
      })}

      {/* Secondary ring of dots between main rings */}
      {detailLevel > 1.0 && Array.from({ length: diatom.symmetry * 2 }, (_, si) => {
        const angle = (si / (diatom.symmetry * 2)) * 360;
        const rad = angle * Math.PI / 180;
        return (
          <circle
            key={`dot2-${si}`}
            cx={Math.cos(rad) * r * 0.55}
            cy={Math.sin(rad) * r * 0.55}
            r={1.2}
            fill={palette.secondary}
            opacity={0.3}
          />
        );
      })}
    </g>
  );
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Diatoms: React.FC<Props> = ({ frames }) => {
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

  const diatoms = React.useMemo(() => generateDiatoms(6543_1977), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const globalOpacity = Math.min(fadeIn, fadeOut) * 0.6;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: globalOpacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="diatom-glow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {diatoms.map((diatom, i) => {
          const palette = DIATOM_PALETTES[diatom.paletteIdx];

          // Drift
          const dx = Math.sin(frame * diatom.driftXSpeed + diatom.driftXPhase) * 40;
          const dy = Math.sin(frame * diatom.driftYSpeed + diatom.driftYPhase) * 30;
          const dcx = diatom.x * width + dx;
          const dcy = diatom.y * height + dy;

          // Rotation
          const rot = diatom.rotPhase + frame * diatom.rotSpeed;

          // Per-diatom glow intensity
          const glowIntensity = 0.1 + energy * 0.15;

          return (
            <g key={i} filter="url(#diatom-glow)">
              {/* Outer bioluminescent glow */}
              <circle
                cx={dcx}
                cy={dcy}
                r={diatom.radius * (diatom.isOval ? 1.1 : 1.2)}
                fill={palette.glow}
                opacity={glowIntensity}
              />
              {/* Pattern */}
              <DiatomPattern
                diatom={diatom}
                cx={dcx}
                cy={dcy}
                rotation={rot}
                energy={energy}
                palette={palette}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
