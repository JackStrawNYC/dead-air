/**
 * SpaceTimeLattice — A+++ overlay.
 * A 3D wireframe lattice/grid with gravitational distortion (warped wells
 * where mass dimples the grid). Like a relativity diagram. Glowing grid
 * lines in cyan/purple. Nebula behind. Lattice fills the frame with perspective.
 *
 * Audio reactivity:
 *   slowEnergy → nebula bloom
 *   energy     → grid brightness
 *   bass       → gravity well depth
 *   beatDecay  → ripple amplitude
 *   onsetEnvelope → ripple burst
 *   chromaHue  → grid line tint
 *   tempoFactor → ripple speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const GRID_ROWS = 12;
const GRID_COLS = 16;
const NEBULA_COUNT = 4;
const STAR_COUNT = 80;

interface BgStar {
  x: number;
  y: number;
  r: number;
  twinkleSpeed: number;
  phase: number;
}
interface Nebula {
  x: number;
  y: number;
  rx: number;
  ry: number;
  hueOffset: number;
}
interface MassPoint {
  x: number; // 0..1
  y: number; // 0..1
  strength: number;
}

function buildBgStars(): BgStar[] {
  const rng = seeded(33_661_117);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.4 + rng() * 1.4,
    twinkleSpeed: 0.02 + rng() * 0.05,
    phase: rng() * Math.PI * 2,
  }));
}

function buildNebulae(): Nebula[] {
  const rng = seeded(81_447_882);
  return Array.from({ length: NEBULA_COUNT }, () => ({
    x: rng(),
    y: rng(),
    rx: 0.18 + rng() * 0.20,
    ry: 0.10 + rng() * 0.16,
    hueOffset: -90 + rng() * 180,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SpaceTimeLattice: React.FC<Props> = ({ frames }) => {
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
  const bgGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const gridBright = interpolate(snap.energy, [0.02, 0.32], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const gravityDepth = 0.4 + snap.bass * 0.8;
  const rippleAmp = 1 + snap.beatDecay * 0.6;
  const burstFlare = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Palette
  const baseHue = 195;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.40) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 80%, 65%)`;
  const tintCore = `hsl(${tintHue}, 95%, 88%)`;
  const tintAlt = `hsl(${(tintHue + 60) % 360}, 80%, 70%)`;
  const skyTop = `hsl(${(tintHue + 220) % 360}, 60%, 4%)`;
  const skyMid = `hsl(${(tintHue + 240) % 360}, 60%, 8%)`;
  const skyBot = `hsl(${(tintHue + 200) % 360}, 50%, 14%)`;

  // Mass points (gravity wells) — slowly drift
  const massPoints: MassPoint[] = [
    { x: 0.30 + Math.sin(frame * 0.005) * 0.05, y: 0.40 + Math.cos(frame * 0.004) * 0.05, strength: 0.12 * gravityDepth },
    { x: 0.70 + Math.cos(frame * 0.006) * 0.05, y: 0.55 + Math.sin(frame * 0.005) * 0.05, strength: 0.18 * gravityDepth },
    { x: 0.50 + Math.sin(frame * 0.007) * 0.06, y: 0.30 + Math.cos(frame * 0.006) * 0.06, strength: 0.10 * gravityDepth },
  ];

  function warpPoint(nx: number, ny: number): { x: number; y: number; depth: number } {
    let dx = nx;
    let dy = ny;
    let depth = 0;
    for (const m of massPoints) {
      const ddx = nx - m.x;
      const ddy = ny - m.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      const falloff = m.strength / (dist * dist + 0.01);
      dy += falloff * 0.2; // sink down (visual gravitational dip)
      depth += falloff * 0.5;
    }
    // Add ripple
    const rippleDist = Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2);
    const rippleWave = Math.sin(rippleDist * 28 - frame * 0.08 * tempoFactor) * 0.012 * rippleAmp;
    dy += rippleWave;
    return { x: dx * width, y: dy * height, depth };
  }

  // Compute warped grid points
  const gridPoints: { x: number; y: number; depth: number }[][] = [];
  for (let r = 0; r <= GRID_ROWS; r++) {
    const row: { x: number; y: number; depth: number }[] = [];
    for (let c = 0; c <= GRID_COLS; c++) {
      const nx = c / GRID_COLS;
      const ny = r / GRID_ROWS;
      row.push(warpPoint(nx, ny));
    }
    gridPoints.push(row);
  }

  // Draw lattice lines
  const lineNodes: React.ReactNode[] = [];
  for (let r = 0; r <= GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const a = gridPoints[r][c];
      const b = gridPoints[r][c + 1];
      const mid = (a.depth + b.depth) / 2;
      const op = (0.18 + mid * 0.6) * gridBright;
      lineNodes.push(
        <line key={`hl-${r}-${c}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke={tintColor} strokeWidth={1.0 + mid * 1.4} opacity={op} />
      );
    }
  }
  for (let c = 0; c <= GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const a = gridPoints[r][c];
      const b = gridPoints[r + 1][c];
      const mid = (a.depth + b.depth) / 2;
      const op = (0.18 + mid * 0.6) * gridBright;
      lineNodes.push(
        <line key={`vl-${r}-${c}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke={tintColor} strokeWidth={1.0 + mid * 1.4} opacity={op} />
      );
    }
  }

  // Intersections
  const intersectionNodes: React.ReactNode[] = [];
  for (let r = 0; r <= GRID_ROWS; r++) {
    for (let c = 0; c <= GRID_COLS; c++) {
      const p = gridPoints[r][c];
      const r0 = 1.5 + p.depth * 3;
      intersectionNodes.push(
        <circle key={`int-${r}-${c}`} cx={p.x} cy={p.y} r={r0}
          fill={tintCore} opacity={(0.55 + p.depth * 0.4) * gridBright} />
      );
    }
  }

  // Background stars
  const starNodes = bgStars.map((s, i) => {
    const t = frame * s.twinkleSpeed + s.phase;
    const tw = 0.55 + Math.sin(t) * 0.4;
    return (
      <circle key={`bs-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.85 + tw * 0.3)}
        fill={tintCore} opacity={0.65 * tw} />
    );
  });

  // Nebulae
  const nebulaNodes = nebulae.map((n, i) => {
    const nx = n.x * width;
    const ny = n.y * height;
    const nHue = (tintHue + n.hueOffset + 360) % 360;
    return (
      <g key={`neb-${i}`}>
        <ellipse cx={nx} cy={ny} rx={n.rx * width * 1.4} ry={n.ry * height * 1.4}
          fill={`hsl(${nHue}, 70%, 50%)`} opacity={0.05 * bgGlow} />
        <ellipse cx={nx} cy={ny} rx={n.rx * width * 0.85} ry={n.ry * height * 0.85}
          fill={`hsl(${nHue}, 80%, 60%)`} opacity={0.08 * bgGlow} />
        <ellipse cx={nx} cy={ny} rx={n.rx * width * 0.40} ry={n.ry * height * 0.40}
          fill={`hsl(${nHue}, 90%, 75%)`} opacity={0.12 * bgGlow} />
      </g>
    );
  });

  // Mass point glows
  const massGlows = massPoints.map((m, i) => (
    <g key={`mg-${i}`}>
      <circle cx={m.x * width} cy={m.y * height} r={60 + m.strength * 200}
        fill={tintAlt} opacity={0.10 * gridBright} />
      <circle cx={m.x * width} cy={m.y * height} r={28 + m.strength * 120}
        fill={tintCore} opacity={0.18 * gridBright} />
      <circle cx={m.x * width} cy={m.y * height} r={8 + m.strength * 30}
        fill="rgba(255, 255, 255, 0.85)" />
    </g>
  ));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="stl-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <filter id="stl-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={width} height={height} fill="url(#stl-sky)" />

        <g filter="url(#stl-blur)">{nebulaNodes}</g>

        {starNodes}

        <g style={{ mixBlendMode: "screen" }}>{massGlows}</g>

        {/* Lattice lines */}
        {lineNodes}
        {/* Intersections */}
        {intersectionNodes}

        {/* Burst flare */}
        {burstFlare > 0.1 && (
          <rect x={0} y={0} width={width} height={height}
            fill={tintCore} opacity={burstFlare * 0.10} style={{ mixBlendMode: "screen" }} />
        )}
      </svg>
    </div>
  );
};
