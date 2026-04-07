/**
 * Constellation — A+++ overlay.
 * A large recognizable constellation pattern (Big Dipper, Orion, Scorpio)
 * connected with luminous lines, stars varying in brightness, surrounding
 * star field, mythological figure outline traced very faintly behind the
 * constellation. Center of frame, ~70% of dimensions.
 *
 * Audio reactivity:
 *   slowEnergy → cosmic warmth + figure trace
 *   energy     → star halo brightness
 *   bass       → main star pulse
 *   beatDecay  → line shimmer
 *   onsetEnvelope → flash bursts
 *   chromaHue  → palette tint
 *   tempoFactor → twinkle rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const BG_STAR_COUNT = 180;
const NEBULA_COUNT = 5;

interface BgStar {
  x: number;
  y: number;
  r: number;
  twinkleSpeed: number;
  phase: number;
  hueOffset: number;
}
interface Nebula {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation: number;
  hueOffset: number;
}

// Orion constellation (normalized 0-1, centered)
// 8 main stars + figure trace
interface ConStar { x: number; y: number; size: number; name?: string; }
interface ConFigure { points: [number, number][]; }

const ORION_STARS: ConStar[] = [
  { x: 0.32, y: 0.18, size: 4.0, name: "Betelgeuse" },
  { x: 0.68, y: 0.20, size: 3.6, name: "Bellatrix" },
  { x: 0.45, y: 0.42, size: 2.6, name: "Mintaka" },
  { x: 0.50, y: 0.45, size: 2.8, name: "Alnilam" },
  { x: 0.55, y: 0.48, size: 2.6, name: "Alnitak" },
  { x: 0.30, y: 0.78, size: 4.4, name: "Saiph" },
  { x: 0.72, y: 0.80, size: 4.6, name: "Rigel" },
  { x: 0.50, y: 0.30, size: 2.0 },
  { x: 0.40, y: 0.55, size: 1.8 },
  { x: 0.60, y: 0.55, size: 1.8 },
  { x: 0.25, y: 0.05, size: 2.4 },
  { x: 0.75, y: 0.07, size: 2.2 },
];
const ORION_LINES: [number, number][] = [
  [0, 7], [7, 1],   // shoulders + head
  [0, 2], [2, 3], [3, 4], [4, 1],   // belt
  [2, 5], [4, 6],   // legs
  [0, 10], [1, 11], // arms
  [8, 5], [9, 6],   // knees
];
// Faint figure trace — hunter outline
const ORION_FIGURE: ConFigure = {
  points: [
    [0.32, 0.05], [0.30, 0.18], [0.20, 0.30], [0.30, 0.42], [0.30, 0.78], [0.25, 0.95],
    [0.50, 0.85], [0.75, 0.95], [0.70, 0.78], [0.70, 0.42], [0.80, 0.30], [0.70, 0.18],
    [0.68, 0.05], [0.50, 0.10], [0.32, 0.05],
  ],
};

function buildBgStars(): BgStar[] {
  const rng = seeded(83_881_117);
  return Array.from({ length: BG_STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.4 + rng() * 1.6,
    twinkleSpeed: 0.02 + rng() * 0.05,
    phase: rng() * Math.PI * 2,
    hueOffset: -30 + rng() * 60,
  }));
}

function buildNebulae(): Nebula[] {
  const rng = seeded(12_557_991);
  return Array.from({ length: NEBULA_COUNT }, () => ({
    x: rng(),
    y: rng(),
    rx: 0.18 + rng() * 0.22,
    ry: 0.10 + rng() * 0.16,
    rotation: rng() * 360,
    hueOffset: -90 + rng() * 180,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Constellation: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const bgStars = React.useMemo(buildBgStars, []);
  const nebulae = React.useMemo(buildNebulae, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const cosmicGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const haloBright = interpolate(snap.energy, [0.02, 0.32], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const starPulse = 1 + snap.bass * 0.40;
  const lineShimmer = 0.7 + snap.beatDecay * 0.30;
  const flashBurst = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Palette
  const baseHue = 210;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 70%, 65%)`;
  const tintCore = `hsl(${tintHue}, 90%, 85%)`;
  const skyTop = `hsl(${(tintHue + 220) % 360}, 50%, 4%)`;
  const skyMid = `hsl(${(tintHue + 230) % 360}, 50%, 8%)`;
  const skyBot = `hsl(${(tintHue + 200) % 360}, 50%, 12%)`;

  // Constellation centered at frame center, fills 70%
  const conCx = width / 2;
  const conCy = height / 2;
  const conW = width * 0.55;
  const conH = height * 0.65;
  const cLeft = conCx - conW / 2;
  const cTop = conCy - conH / 2;

  function px(x: number): number { return cLeft + x * conW; }
  function py(y: number): number { return cTop + y * conH; }

  // Background stars
  const bgStarNodes = bgStars.map((s, i) => {
    const t = frame * s.twinkleSpeed * tempoFactor + s.phase;
    const tw = 0.55 + Math.sin(t) * 0.4;
    const sx = s.x * width;
    const sy = s.y * height;
    const r = s.r * (0.85 + tw * 0.3);
    const sHue = (tintHue + s.hueOffset + 360) % 360;
    return (
      <g key={`bs-${i}`}>
        <circle cx={sx} cy={sy} r={r * 3} fill={`hsl(${sHue}, 70%, 75%)`} opacity={0.15 * tw * haloBright} />
        <circle cx={sx} cy={sy} r={r} fill={`hsl(${sHue}, 80%, 88%)`} opacity={0.85 * tw} />
      </g>
    );
  });

  // Nebula clouds in background
  const nebulaNodes = nebulae.map((n, i) => {
    const nx = n.x * width;
    const ny = n.y * height;
    const nHue = (tintHue + n.hueOffset + 360) % 360;
    return (
      <g key={`neb-${i}`} transform={`translate(${nx}, ${ny}) rotate(${n.rotation + frame * 0.01})`}>
        <ellipse rx={n.rx * width * 1.2} ry={n.ry * height * 1.2} fill={`hsl(${nHue}, 60%, 50%)`} opacity={0.05 * cosmicGlow} />
        <ellipse rx={n.rx * width * 0.7} ry={n.ry * height * 0.7} fill={`hsl(${nHue}, 75%, 60%)`} opacity={0.10 * cosmicGlow} />
        <ellipse rx={n.rx * width * 0.30} ry={n.ry * height * 0.30} fill={`hsl(${nHue}, 90%, 75%)`} opacity={0.14 * cosmicGlow} />
      </g>
    );
  });

  // Constellation lines
  const lineNodes = ORION_LINES.map(([a, b], i) => {
    const sa = ORION_STARS[a];
    const sb = ORION_STARS[b];
    const t = frame * 0.04 + i;
    const shim = lineShimmer + Math.sin(t) * 0.10;
    return (
      <g key={`ln-${i}`}>
        <line x1={px(sa.x)} y1={py(sa.y)} x2={px(sb.x)} y2={py(sb.y)}
          stroke={tintColor} strokeWidth={2.2} opacity={0.20 * shim * cosmicGlow} />
        <line x1={px(sa.x)} y1={py(sa.y)} x2={px(sb.x)} y2={py(sb.y)}
          stroke={tintCore} strokeWidth={1} opacity={0.55 * shim * cosmicGlow} />
      </g>
    );
  });

  // Constellation main stars
  const starNodes = ORION_STARS.map((s, i) => {
    const t = frame * 0.04 + i;
    const tw = 0.7 + Math.sin(t) * 0.25;
    const r = s.size * starPulse * (0.9 + tw * 0.3);
    const flare = i < 7 ? flareStrength(s, flashBurst) : 0;
    return (
      <g key={`cs-${i}`}>
        <circle cx={px(s.x)} cy={py(s.y)} r={r * 8} fill={tintColor} opacity={0.05 * tw * haloBright} />
        <circle cx={px(s.x)} cy={py(s.y)} r={r * 4} fill={tintColor} opacity={0.15 * tw * haloBright} />
        <circle cx={px(s.x)} cy={py(s.y)} r={r * 2} fill={tintCore} opacity={0.35 * tw * haloBright} />
        <circle cx={px(s.x)} cy={py(s.y)} r={r} fill="rgba(255, 255, 255, 0.95)" opacity={0.95 * tw + flare} />
        {i < 7 && flashBurst > 0.2 && (
          <>
            <line x1={px(s.x) - r * 7} y1={py(s.y)} x2={px(s.x) + r * 7} y2={py(s.y)}
              stroke="rgba(255, 255, 255, 0.95)" strokeWidth={0.6} opacity={flare} />
            <line x1={px(s.x)} y1={py(s.y) - r * 7} x2={px(s.x)} y2={py(s.y) + r * 7}
              stroke="rgba(255, 255, 255, 0.95)" strokeWidth={0.6} opacity={flare} />
          </>
        )}
        {s.name && (
          <text x={px(s.x) + r * 2 + 4} y={py(s.y) + 3}
            fontSize={9} fill={tintCore} opacity={0.5 * cosmicGlow}
            fontFamily="Georgia, serif">
            {s.name}
          </text>
        )}
      </g>
    );
  });

  // Faint hunter figure trace
  const figurePath = ORION_FIGURE.points.map((p, i) =>
    `${i === 0 ? "M" : "L"} ${px(p[0])} ${py(p[1])}`).join(" ") + " Z";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="con-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <radialGradient id="con-deep">
            <stop offset="0%" stopColor={`hsl(${tintHue}, 60%, 18%)`} stopOpacity={0.5} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <filter id="con-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={width} height={height} fill="url(#con-sky)" />
        <ellipse cx={width * 0.5} cy={height * 0.5} rx={width * 0.55} ry={height * 0.55}
          fill="url(#con-deep)" />

        <g filter="url(#con-blur)">{nebulaNodes}</g>
        {bgStarNodes}

        {/* Faint figure trace */}
        <path d={figurePath} fill="none" stroke={tintColor} strokeWidth={2}
          strokeDasharray="6 8" opacity={0.18 * cosmicGlow} />
        <path d={figurePath} fill={tintColor} opacity={0.04 * cosmicGlow} />

        {/* Lines */}
        {lineNodes}

        {/* Stars (front) */}
        {starNodes}
      </svg>
    </div>
  );
};

function flareStrength(_s: ConStar, flash: number): number {
  return flash * 0.6;
}
