/**
 * BreathingStealie — A+++ overlay: the iconic Steal Your Face skull at LARGE
 * scale with cosmic backdrop, halo, and breathing pulse. The Stealie occupies
 * roughly 50% of the frame width and is the dominant visual anchor.
 *
 * Audio reactivity:
 *   slowEnergy → halo radius + breathing scale
 *   energy     → glow intensity + eye fire
 *   bass       → low-end skull throb
 *   beatDecay  → bolt pulse + cosmic ripple
 *   onsetEnvelope → bolt flash trigger
 *   chromaHue  → cosmic backdrop tint
 *   tempoFactor → starfield rotation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const STAR_COUNT = 140;
const DUST_COUNT = 70;
const RAY_COUNT = 18;
const NEBULA_COUNT = 7;

interface Star { x: number; y: number; r: number; phase: number; speed: number; }
interface Dust { ang: number; rad: number; speed: number; size: number; phase: number; }
interface Nebula { cx: number; cy: number; rx: number; ry: number; rot: number; shade: number; }

function buildStars(): Star[] {
  const rng = seeded(73_991_412);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.4 + rng() * 1.7,
    phase: rng() * Math.PI * 2,
    speed: 0.01 + rng() * 0.04,
  }));
}

function buildDust(): Dust[] {
  const rng = seeded(48_226_891);
  return Array.from({ length: DUST_COUNT }, () => ({
    ang: rng() * Math.PI * 2,
    rad: 0.18 + rng() * 0.30,
    speed: 0.0008 + rng() * 0.004,
    size: 0.6 + rng() * 2.2,
    phase: rng() * Math.PI * 2,
  }));
}

function buildNebulae(): Nebula[] {
  const rng = seeded(19_447_338);
  return Array.from({ length: NEBULA_COUNT }, () => ({
    cx: rng(),
    cy: rng(),
    rx: 0.18 + rng() * 0.22,
    ry: 0.10 + rng() * 0.16,
    rot: rng() * 360,
    shade: rng(),
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const BreathingStealie: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const stars = React.useMemo(buildStars, []);
  const dust = React.useMemo(buildDust, []);
  const nebulae = React.useMemo(buildNebulae, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives
  const haloDrive = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const eyeFire = interpolate(snap.energy, [0.02, 0.30], [0.40, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lowThrob = interpolate(snap.bass, [0.0, 0.65], [0.30, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const breath = 1 + Math.sin(frame * 0.018) * 0.04 + snap.beatDecay * 0.07;
  const boltPulse = 1 + snap.beatDecay * 0.45;
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;

  // Cosmic palette modulated by chromaHue
  const baseHue = 270;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.45) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 70%, ${64 + eyeFire * 14}%)`;
  const tintCore = `hsl(${tintHue}, 92%, ${82 + eyeFire * 10}%)`;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 38%, 6%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 30%, 11%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 30%, 14%)`;
  const fieldRotation = (frame * 0.06 * tempoFactor) % 360;

  // ─── HERO GEOMETRY ─────────────────────────────────────────────────
  // Stealie centered, ~50% of smaller frame dimension
  const cx = width / 2;
  const cy = height / 2;
  const stealieR = Math.min(width, height) * 0.30 * breath;   // radius ~30% of min dim
  const stealieDiameter = stealieR * 2;
  const ringR = stealieR;
  const innerR = stealieR * 0.94;
  const skullR = stealieR * 0.84;

  // SVG-space helper: convert local stealie coordinates (-1..1) to screen
  const sx = (u: number) => cx + u * stealieR;
  const sy = (v: number) => cy + v * stealieR;

  // Star nodes — twinkling
  const starNodes = stars.map((s, i) => {
    const flicker = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    const xN = (s.x + frame * 0.00005) % 1;
    return (
      <circle key={`st-${i}`} cx={xN * width} cy={s.y * height}
        r={s.r * (0.7 + flicker * 0.7)}
        fill="#f8f0ff" opacity={0.35 + flicker * 0.5} />
    );
  });

  // Dust orbiting Stealie
  const dustNodes = dust.map((d, i) => {
    const t = frame * d.speed + d.phase;
    const ang = d.ang + t;
    const rad = stealieR * (1.05 + d.rad);
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad * 0.95;
    const flick = 0.5 + Math.sin(t * 2.1) * 0.4;
    return (
      <circle key={`dust-${i}`} cx={x} cy={y} r={d.size * (0.7 + eyeFire * 0.8)}
        fill={tintCore} opacity={0.45 * flick * eyeFire} />
    );
  });

  // Nebula clouds
  const nebulaNodes = nebulae.map((n, i) => {
    const drift = Math.sin(frame * 0.003 + i * 0.5) * 30;
    return (
      <ellipse key={`neb-${i}`} cx={n.cx * width + drift} cy={n.cy * height}
        rx={n.rx * width} ry={n.ry * height}
        fill={`hsla(${(tintHue + n.shade * 60) % 360}, 60%, ${30 + n.shade * 20}%, ${0.18 + n.shade * 0.12})`}
        transform={`rotate(${n.rot + frame * 0.04} ${n.cx * width} ${n.cy * height})`}
        filter="url(#bs-blur)" />
    );
  });

  // Halo rays
  const rayNodes: React.ReactNode[] = [];
  for (let r = 0; r < RAY_COUNT; r++) {
    const a = (r / RAY_COUNT) * Math.PI * 2 + (fieldRotation * Math.PI) / 180;
    const len = stealieR * (1.4 + eyeFire * 0.6 + Math.sin(frame * 0.04 + r) * 0.1);
    const x2 = Math.cos(a) * len;
    const y2 = Math.sin(a) * len;
    const w0 = 18 + eyeFire * 22;
    rayNodes.push(
      <g key={`ray-${r}`}>
        <path d={`M 0 0 L ${x2 - w0 * 0.6} ${y2} L ${x2 + w0 * 0.6} ${y2} Z`} fill={tintColor} opacity={0.10 * eyeFire * haloDrive} />
        <path d={`M 0 0 L ${x2 - w0 * 0.32} ${y2} L ${x2 + w0 * 0.32} ${y2} Z`} fill={tintColor} opacity={0.20 * eyeFire * haloDrive} />
        <path d={`M 0 0 L ${x2 - w0 * 0.12} ${y2} L ${x2 + w0 * 0.12} ${y2} Z`} fill={tintCore} opacity={0.36 * eyeFire * haloDrive} />
      </g>,
    );
  }

  // Stealie geometry — local coordinate is in stealieR units (-1..1)
  // Lightning bolt (13-point bolt approximation)
  const boltPath = `
    M ${sx(0.04)} ${sy(-0.92)}
    L ${sx(-0.18)} ${sy(-0.18)}
    L ${sx(0.04)} ${sy(-0.18)}
    L ${sx(-0.20)} ${sy(0.18)}
    L ${sx(-0.04)} ${sy(0.18)}
    L ${sx(-0.22)} ${sy(0.92)}
    L ${sx(0.18)} ${sy(0.10)}
    L ${sx(-0.04)} ${sy(0.10)}
    L ${sx(0.22)} ${sy(-0.30)}
    L ${sx(0.04)} ${sy(-0.30)}
    L ${sx(0.16)} ${sy(-0.92)}
    Z
  `;

  // Skull half fills (red left, blue right)
  const redHue = 358 + eyeFire * 8;
  const blueHue = 215 - eyeFire * 6;
  const redFill = `hsl(${redHue}, 78%, ${42 + lowThrob * 8}%)`;
  const blueFill = `hsl(${blueHue}, 70%, ${40 + lowThrob * 8}%)`;
  const ringStroke = `hsl(45, 35%, ${82 + eyeFire * 8}%)`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="bs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <radialGradient id="bs-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.60} />
            <stop offset="40%" stopColor={tintColor} stopOpacity={0.22} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="bs-eye">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.95} />
            <stop offset="50%" stopColor={tintColor} stopOpacity={0.55} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="bs-bolt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff8c0" />
            <stop offset="50%" stopColor="#ffd040" />
            <stop offset="100%" stopColor="#ff8000" />
          </linearGradient>
          <linearGradient id="bs-redhalf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${redHue}, 80%, 56%)`} />
            <stop offset="100%" stopColor={`hsl(${redHue}, 78%, 30%)`} />
          </linearGradient>
          <linearGradient id="bs-bluehalf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${blueHue}, 72%, 54%)`} />
            <stop offset="100%" stopColor={`hsl(${blueHue}, 70%, 28%)`} />
          </linearGradient>
          <radialGradient id="bs-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="bs-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="bs-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <clipPath id="bs-leftclip">
            <rect x={cx - stealieR} y={cy - stealieR} width={stealieR} height={stealieDiameter} />
          </clipPath>
          <clipPath id="bs-rightclip">
            <rect x={cx} y={cy - stealieR} width={stealieR} height={stealieDiameter} />
          </clipPath>
          <clipPath id="bs-skullclip">
            <circle cx={cx} cy={cy} r={skullR} />
          </clipPath>
        </defs>

        {/* Cosmic backdrop */}
        <rect width={width} height={height} fill="url(#bs-sky)" />
        {nebulaNodes}
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Halo glow */}
        <circle cx={cx} cy={cy} r={stealieR * (1.6 + haloDrive * 0.4)}
          fill="url(#bs-halo)" style={{ mixBlendMode: "screen" }} />

        {/* Halo rays */}
        <g transform={`translate(${cx}, ${cy})`} style={{ mixBlendMode: "screen" }}>
          {rayNodes}
        </g>

        {/* Orbiting dust */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* ── STEALIE HERO ──────────────────────────────────── */}
        {/* Outer ring shadow */}
        <circle cx={cx} cy={cy} r={ringR + 4} fill="rgba(0,0,0,0.55)" />
        {/* Skull halves clipped to inner circle */}
        <g clipPath="url(#bs-skullclip)">
          <rect x={cx - stealieR} y={cy - stealieR} width={stealieR} height={stealieDiameter}
            fill="url(#bs-redhalf)" />
          <rect x={cx} y={cy - stealieR} width={stealieR} height={stealieDiameter}
            fill="url(#bs-bluehalf)" />
          {/* Skull dome shading */}
          <ellipse cx={cx} cy={cy - stealieR * 0.4} rx={stealieR * 0.85} ry={stealieR * 0.30}
            fill="rgba(255, 240, 220, 0.12)" />
          {/* Lower jaw shadow */}
          <ellipse cx={cx} cy={cy + stealieR * 0.55} rx={stealieR * 0.78} ry={stealieR * 0.25}
            fill="rgba(0, 0, 0, 0.25)" />
        </g>

        {/* Outer ring strokes */}
        <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={ringStroke} strokeWidth={Math.max(3, stealieR * 0.035)} />
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={ringStroke} strokeWidth={Math.max(1, stealieR * 0.012)} opacity={0.55} />

        {/* Horizontal divider */}
        <line x1={cx - stealieR * 0.96} y1={cy} x2={cx + stealieR * 0.96} y2={cy}
          stroke={ringStroke} strokeWidth={Math.max(2, stealieR * 0.022)} />

        {/* Cranium curve */}
        <path d={`M ${sx(-0.66)} ${sy(0)}
          Q ${sx(-0.66)} ${sy(-0.78)} ${sx(0)} ${sy(-0.84)}
          Q ${sx(0.66)} ${sy(-0.78)} ${sx(0.66)} ${sy(0)}`}
          stroke={ringStroke} strokeWidth={Math.max(1.6, stealieR * 0.017)} fill="none" opacity={0.7} />

        {/* Eye sockets — outer */}
        <ellipse cx={sx(-0.34)} cy={sy(-0.30)} rx={stealieR * 0.18} ry={stealieR * 0.16}
          stroke={ringStroke} strokeWidth={Math.max(2, stealieR * 0.022)} fill="rgba(0,0,0,0.7)" />
        <ellipse cx={sx(0.34)} cy={sy(-0.30)} rx={stealieR * 0.18} ry={stealieR * 0.16}
          stroke={ringStroke} strokeWidth={Math.max(2, stealieR * 0.022)} fill="rgba(0,0,0,0.7)" />

        {/* Eye glow — pulsating */}
        <ellipse cx={sx(-0.34)} cy={sy(-0.30)} rx={stealieR * 0.14 * (0.85 + eyeFire * 0.25)}
          ry={stealieR * 0.12 * (0.85 + eyeFire * 0.25)}
          fill="url(#bs-eye)" style={{ mixBlendMode: "screen" }} />
        <ellipse cx={sx(0.34)} cy={sy(-0.30)} rx={stealieR * 0.14 * (0.85 + eyeFire * 0.25)}
          ry={stealieR * 0.12 * (0.85 + eyeFire * 0.25)}
          fill="url(#bs-eye)" style={{ mixBlendMode: "screen" }} />

        {/* Pupils */}
        <circle cx={sx(-0.34)} cy={sy(-0.30)} r={stealieR * 0.04} fill="rgba(20,10,30,0.95)" />
        <circle cx={sx(0.34)} cy={sy(-0.30)} r={stealieR * 0.04} fill="rgba(20,10,30,0.95)" />

        {/* Nose */}
        <path d={`M ${sx(0)} ${sy(-0.10)} L ${sx(-0.08)} ${sy(0.06)} L ${sx(0.08)} ${sy(0.06)} Z`}
          stroke={ringStroke} strokeWidth={Math.max(1.4, stealieR * 0.015)} fill="rgba(0,0,0,0.5)" />

        {/* Jaw */}
        <path d={`M ${sx(-0.58)} ${sy(0.04)}
          Q ${sx(-0.45)} ${sy(0.62)} ${sx(0)} ${sy(0.70)}
          Q ${sx(0.45)} ${sy(0.62)} ${sx(0.58)} ${sy(0.04)}`}
          stroke={ringStroke} strokeWidth={Math.max(1.6, stealieR * 0.018)} fill="none" opacity={0.6} />

        {/* Teeth hint */}
        <line x1={sx(-0.18)} y1={sy(0.10)} x2={sx(-0.06)} y2={sy(0.10)}
          stroke={ringStroke} strokeWidth={1.2} opacity={0.45} />
        <line x1={sx(0.06)} y1={sy(0.10)} x2={sx(0.18)} y2={sy(0.10)}
          stroke={ringStroke} strokeWidth={1.2} opacity={0.45} />

        {/* ── LIGHTNING BOLT — three layers (glow / main / core) ── */}
        <g transform={`scale(${boltPulse}) translate(${cx * (1 - 1 / boltPulse)}, ${cy * (1 - 1 / boltPulse)})`}>
          <g filter="url(#bs-glow)">
            <path d={boltPath} fill="#ffe060" opacity={0.6 + flash * 0.35} />
          </g>
          <path d={boltPath} fill="url(#bs-bolt)" opacity={0.95} />
          <path d={boltPath} fill="rgba(255, 250, 220, 0.85)" opacity={0.4 + flash * 0.55}
            transform={`scale(0.92) translate(${cx * 0.08}, ${cy * 0.08})`} />
        </g>

        {/* Onset white flash */}
        {flash > 0.05 && (
          <circle cx={cx} cy={cy} r={stealieR * (1.0 + flash * 0.4)}
            fill={`rgba(255, 255, 240, ${flash * 0.18})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Tight halo pulse */}
        <circle cx={cx} cy={cy} r={stealieR * 1.05 * boltPulse}
          fill="none" stroke={tintCore} strokeWidth={2.4} opacity={0.30 * haloDrive}
          style={{ mixBlendMode: "screen" }} />

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#bs-vig)" />
      </svg>
    </div>
  );
};
