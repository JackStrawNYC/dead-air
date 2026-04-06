/**
 * GoldenRoad — "Golden Road to Unlimited Devotion"
 * Layer 5, tier B, tags: dead-culture, organic.
 *
 * Perspective highway stretching to a radiant vanishing point — the road to
 * infinity. Road surface with realistic gradient (lighter at horizon, darker
 * near camera), double yellow center line (dashed, parallax), white edge lines,
 * gravel shoulders, rolling hills with bezier silhouettes, grass/vegetation
 * texture, crepuscular rays, starfield above, and a pulsing golden vanishing-
 * point glow. Energy drives glow intensity + ray brightness, tempoFactor drives
 * road line movement speed, chromaHue tints the golden light, beatDecay pulses
 * the vanishing point.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const CL = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/** Clamped interpolate shorthand */
const lerp = (
  v: number,
  inp: [number, number] | [number, number, number],
  out: [number, number] | [number, number, number],
) => interpolate(v, inp as number[], out as number[], CL);

/** HSL (0-1 hue) to hex string */
function hsl(h: number, s: number, l: number): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const sec = Math.floor(hue * 6);
  if (sec === 0) { r = c; g = x; } else if (sec === 1) { r = x; g = c; }
  else if (sec === 2) { g = c; b = x; } else if (sec === 3) { g = x; b = c; }
  else if (sec === 4) { r = x; b = c; } else { r = c; b = x; }
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Deterministic pseudo-random from integer seed */
function seed(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------ */
/*  Road geometry constants                                            */
/* ------------------------------------------------------------------ */

const VX = 150;   // vanishing point X
const VY = 48;    // vanishing point Y
const BOT = 250;  // road bottom edge
const RL = 32;    // road left at bottom
const RR = 268;   // road right at bottom
const SL = 22;    // shoulder left at bottom
const SR = 278;   // shoulder right at bottom

/** Y coordinate at depth t (0=bottom, 1=vanishing point) */
const rY = (t: number) => BOT - t * (BOT - VY);
/** X coordinate for road edge at depth t */
const rX = (t: number, left: boolean) => VX + ((left ? RL : RR) - VX) * (1 - t);
/** X coordinate for shoulder edge at depth t */
const sX = (t: number, left: boolean) => VX + ((left ? SL : SR) - VX) * (1 - t);

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const GoldenRoad: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const { energy, slowEnergy, beatDecay, highs, onsetEnvelope } = snap;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  /* --- opacity (tier B: 0.12-0.30) --- */
  const opacity = lerp(energy, [0.02, 0.3], [0.12, 0.3]);

  /* --- palette: golden warmth tinted by chromaHue --- */
  const gH = 0.12 + chromaHue * 0.06;
  const gold = hsl(gH, 0.85, 0.6);
  const warmG = hsl(gH, 0.9, 0.72);
  const paleG = hsl(gH, 0.7, 0.82);
  const amberDk = hsl(0.07 + chromaHue * 0.04, 0.5, 0.18);
  const roadDk = hsl(0.08, 0.15, 0.12);
  const roadMd = hsl(0.08, 0.12, 0.22);
  const grassC = hsl(0.28 + chromaHue * 0.04, 0.55, 0.3);
  const grassD = hsl(0.25, 0.4, 0.15);
  const skyTop = hsl(0.62, 0.25, 0.06);
  const skyHz = hsl(gH, 0.6, 0.25 + energy * 0.1);

  /* --- glow size + filter strength driven by energy --- */
  const glowR = lerp(energy, [0.05, 0.5], [20, 50]);
  const glowI = lerp(energy, [0.05, 0.5], [0.15, 0.45]);
  const pathGlow = lerp(energy, [0.05, 0.4], [4, 18]);

  /* --- crepuscular rays (7 rays from vanishing point) --- */
  const rays: React.ReactNode[] = [];
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI - Math.PI / 2
      + Math.sin(frame * 0.015 * tempoFactor + i * 2.3) * 0.06;
    const rLen = lerp(energy, [0.05, 0.5], [50, 130]);
    const rOp = lerp(energy, [0.05, 0.4], [0.02, 0.12])
      * (0.7 + beatDecay * 0.3) * (0.6 + seed(i) * 0.4);
    const rW = lerp(energy, [0.05, 0.4], [2, 6]) * (0.5 + seed(i + 20) * 0.8);
    rays.push(
      <line key={`ray${i}`} x1={VX} y1={VY}
        x2={VX + Math.cos(ang) * rLen} y2={VY + Math.sin(ang) * rLen}
        stroke={paleG} strokeWidth={rW} opacity={rOp} strokeLinecap="round" />,
    );
  }

  /* --- double yellow center line (dashed, parallax toward viewer) --- */
  const dashes: React.ReactNode[] = [];
  const scroll = ((frame * 0.9 * tempoFactor) % 30) / 30;
  for (let i = 0; i < 14; i++) {
    const ts = (i / 14 + scroll / 14) * 0.88;
    const te = ts + 0.025;
    if (ts > 0.88 || te > 0.92) continue;
    const y1 = rY(ts), y2 = rY(te);
    const gap = lerp(ts, [0, 0.88], [2.2, 0.3]);
    const op = lerp(ts, [0, 0.4, 0.88], [0.8, 0.55, 0.08]) * (0.6 + energy * 0.4);
    const sw = lerp(ts, [0, 0.88], [1.8, 0.3]);
    // Two parallel yellow lines
    dashes.push(
      <line key={`cl${i}`} x1={VX - gap} y1={y2} x2={VX - gap} y2={y1}
        stroke="#e8c840" strokeWidth={sw} opacity={op} strokeLinecap="round" />,
      <line key={`cr${i}`} x1={VX + gap} y1={y2} x2={VX + gap} y2={y1}
        stroke="#e8c840" strokeWidth={sw} opacity={op} strokeLinecap="round" />,
    );
  }

  /* --- white edge lines (solid, converging to VP) --- */
  const edges: React.ReactNode[] = [];
  for (let i = 0; i < 20; i++) {
    const t1 = i / 20, t2 = (i + 1) / 20;
    if (t2 > 0.92) continue;
    const op = lerp(t1, [0, 0.5, 0.92], [0.5, 0.35, 0.05]);
    const sw = lerp(t1, [0, 0.92], [1.2, 0.2]);
    const y1 = rY(t1), y2 = rY(t2);
    edges.push(
      <line key={`el${i}`} x1={rX(t1, true)} y1={y1} x2={rX(t2, true)} y2={y2}
        stroke="#e0ddd0" strokeWidth={sw} opacity={op} />,
      <line key={`er${i}`} x1={rX(t1, false)} y1={y1} x2={rX(t2, false)} y2={y2}
        stroke="#e0ddd0" strokeWidth={sw} opacity={op} />,
    );
  }

  /* --- shoulder gravel detail (dots along shoulder strips) --- */
  const gravel: React.ReactNode[] = [];
  for (let i = 0; i < 15; i++) {
    const t = i / 15;
    if (t > 0.9) continue;
    const y = rY(t);
    const op = lerp(t, [0, 0.5, 0.9], [0.2, 0.12, 0.02]);
    const r = lerp(t, [0, 0.9], [0.9, 0.15]);
    for (let j = 0; j < 3; j++) {
      const f = (j + 0.3) / 3;
      const dop = op * (0.4 + seed(i * 3 + j) * 0.6);
      const lx = sX(t, true) + (rX(t, true) - sX(t, true)) * f;
      const rx = rX(t, false) + (sX(t, false) - rX(t, false)) * f;
      const dy = seed(i * 3 + j + 50) * 2 - 1;
      gravel.push(
        <circle key={`sl${i}${j}`} cx={lx} cy={y + dy} r={r} fill="#8a7e6a" opacity={dop} />,
        <circle key={`sr${i}${j}`} cx={rx} cy={y + dy} r={r} fill="#8a7e6a" opacity={dop} />,
      );
    }
  }

  /* --- rolling hills (bezier silhouettes both sides) --- */
  const hs = Math.sin(frame * 0.005 * tempoFactor) * 2;
  const hillL = `M0,${VY + 10 + hs} Q30,${VY - 8 + hs * 0.5} ${SL},${VY + 6}
    L${SL},${BOT} L0,${BOT}Z`;
  const hillR = `M300,${VY + 8 - hs * 0.7} Q270,${VY - 10 - hs * 0.3} ${SR},${VY + 6}
    L${SR},${BOT} L300,${BOT}Z`;
  // Distant range with multiple peaks
  const distL = `M0,${VY + 4} Q20,${VY - 14 + hs * 0.3} 50,${VY - 4}
    Q75,${VY - 18} 100,${VY - 2} Q120,${VY + 2} ${VX - 5},${VY}
    L${VX - 5},${VY + 12} L0,${VY + 12}Z`;
  const distR = `M300,${VY + 2} Q280,${VY - 12 - hs * 0.2} 250,${VY - 6}
    Q220,${VY - 16} 200,${VY - 2} Q180,${VY + 3} ${VX + 5},${VY}
    L${VX + 5},${VY + 12} L300,${VY + 12}Z`;

  /* --- grass blades along road shoulders --- */
  const grass: React.ReactNode[] = [];
  for (let i = 0; i < 18; i++) {
    const t = i / 18;
    if (t > 0.85) continue;
    const y = rY(t);
    const le = sX(t, true), re = sX(t, false);
    const gl = lerp(t, [0, 0.85], [7, 1.5]);
    const gop = lerp(t, [0, 0.45, 0.85], [0.45, 0.25, 0.03]);
    const sw = lerp(t, [0, 0.85], [1.2, 0.3]);
    const sway = Math.sin(frame * 0.06 * tempoFactor + i * 1.7) * 2.5
      * (1 + beatDecay * 0.4);
    // 3 blades per station (varied angle + thickness)
    for (let b = 0; b < 3; b++) {
      const off = (b - 1) * gl * 0.3;
      const ba = (seed(i * 3 + b) - 0.5) * 0.6 + sway * 0.1;
      const bsw = sw * (0.5 + seed(i * 3 + b + 10) * 0.5);
      const bop = gop * (0.6 + seed(i * 3 + b + 30) * 0.4);
      const col = b === 1 ? grassD : grassC;
      grass.push(
        <line key={`gl${i}${b}`} x1={le + off} y1={y}
          x2={le + off - gl * Math.cos(ba) + sway} y2={y - gl * 0.8}
          stroke={col} strokeWidth={bsw} strokeLinecap="round" opacity={bop} />,
        <line key={`gr${i}${b}`} x1={re + off} y1={y}
          x2={re + off + gl * Math.cos(ba) + sway} y2={y - gl * 0.8}
          stroke={col} strokeWidth={bsw} strokeLinecap="round" opacity={bop} />,
      );
    }
  }

  /* --- stars (upper sky, twinkle driven by highs) --- */
  const stars: React.ReactNode[] = [];
  for (let i = 0; i < 28; i++) {
    const sx = seed(i * 7 + 1) * 300;
    const sy = seed(i * 7 + 2) * (VY - 5);
    const sr = 0.3 + seed(i * 7 + 3) * 0.8;
    const twinkle = 0.2
      + 0.3 * Math.sin(frame * 0.03 * tempoFactor + seed(i * 7 + 4) * 20)
      + highs * 0.3;
    stars.push(
      <circle key={`s${i}`} cx={sx} cy={sy} r={sr} fill="#fffde8"
        opacity={Math.min(twinkle, 0.7) * (1 - energy * 0.3)} />,
    );
  }

  /* --- road shimmer particles (golden motes drifting toward camera) --- */
  const particles: React.ReactNode[] = [];
  for (let i = 0; i < 14; i++) {
    const t = ((i / 14 + (frame * 0.25 * tempoFactor + i * 9) / 350) % 1);
    if (t > 0.9) continue;
    const y = rY(t);
    const roadW = (RR - RL) * (1 - t);
    const px = VX + Math.sin(frame * 0.035 * tempoFactor + i * 2.7) * roadW * 0.35;
    const ps = lerp(t, [0, 0.88], [2.2, 0.4]);
    const pop = lerp(t, [0, 0.25, 0.88], [0.2, 0.5, 0.05]) * (0.4 + energy * 0.6);
    particles.push(
      <circle key={`p${i}`} cx={px} cy={y} r={ps} fill={warmG} opacity={pop} />,
    );
  }

  /* --- breathe scale with slow energy --- */
  const breathe = lerp(slowEnergy, [0.02, 0.25], [0.97, 1.03]);

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div style={{
        transform: `scale(${breathe})`, opacity,
        filter: `drop-shadow(0 0 ${pathGlow}px ${gold})`,
        willChange: "transform, opacity, filter", width: "100%", height: "80%",
      }}>
        <svg width="100%" height="100%" viewBox="0 0 300 250" fill="none"
          preserveAspectRatio="xMidYMax meet">
          <defs>
            {/* Sky: dark top to golden horizon */}
            <linearGradient id="gr-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={skyTop} />
              <stop offset="70%" stopColor={skyHz} />
              <stop offset="100%" stopColor={warmG} stopOpacity="0.25" />
            </linearGradient>
            {/* Road: lighter at horizon, darker near camera */}
            <linearGradient id="gr-road" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={roadMd} />
              <stop offset="40%" stopColor={roadDk} stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0a0a08" />
            </linearGradient>
            {/* Vanishing point radial glow */}
            <radialGradient id="gr-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={warmG} stopOpacity="0.9" />
              <stop offset="30%" stopColor={gold} stopOpacity="0.5" />
              <stop offset="70%" stopColor={amberDk} stopOpacity="0.15" />
              <stop offset="100%" stopColor={amberDk} stopOpacity="0" />
            </radialGradient>
            {/* Gaussian blur for soft glow */}
            <filter id="f-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
            </filter>
          </defs>

          {/* Sky background */}
          <rect x="0" y="0" width="300" height={VY + 12} fill="url(#gr-sky)" />

          {/* Starfield */}
          {stars}

          {/* Distant hill silhouettes */}
          <path d={distL} fill="#1a2a12" opacity={0.35 + slowEnergy * 0.1} />
          <path d={distR} fill="#1a2a12" opacity={0.3 + slowEnergy * 0.1} />

          {/* Near rolling hills */}
          <path d={hillL} fill="#142210" opacity={0.5 + slowEnergy * 0.08} />
          <path d={hillR} fill="#142210" opacity={0.45 + slowEnergy * 0.08} />

          {/* Road shoulder */}
          <polygon
            points={`${SL},${BOT} ${SR},${BOT} ${VX + 5},${VY} ${VX - 5},${VY}`}
            fill="#3a3528" opacity={0.15 + energy * 0.05}
          />

          {/* Road surface */}
          <polygon
            points={`${RL},${BOT} ${RR},${BOT} ${VX + 3},${VY} ${VX - 3},${VY}`}
            fill="url(#gr-road)" opacity={0.3 + energy * 0.08}
          />

          {/* Detail layers */}
          {gravel}
          {edges}
          {dashes}
          {grass}

          {/* Crepuscular rays */}
          {rays}

          {/* Golden vanishing point: soft glow */}
          <circle cx={VX} cy={VY} r={glowR + beatDecay * 12}
            fill="url(#gr-glow)" opacity={glowI + beatDecay * 0.12}
            filter="url(#f-glow)" />

          {/* Bright inner core */}
          <circle cx={VX} cy={VY} r={6 + energy * 8 + beatDecay * 4}
            fill={warmG} opacity={0.15 + energy * 0.2 + beatDecay * 0.1} />

          {/* Hot white center point */}
          <circle cx={VX} cy={VY} r={1.5 + onsetEnvelope * 3 + beatDecay * 1.5}
            fill="#fffef0" opacity={0.4 + onsetEnvelope * 0.35 + beatDecay * 0.15} />

          {/* Road shimmer particles */}
          {particles}
        </svg>
      </div>
    </div>
  );
};
