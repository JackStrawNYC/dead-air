/**
 * SkullKaleidoscope — A+++ overlay: 8-fold symmetric skull mandala with a
 * detailed central skull and rotating rings of skulls around it. Each skull
 * has a lightning bolt, eye sockets, and jaw. Tie-dye palette tinting.
 * Center skull is large enough to fill ~50% of the smaller frame dimension.
 *
 * Audio reactivity:
 *   slowEnergy → halo glow + breathing scale
 *   energy     → bolt brightness + ring shimmer
 *   bass       → low-end skull throb
 *   beatDecay  → ring pulse
 *   onsetEnvelope → bolt flash trigger
 *   chromaHue  → palette tint shift
 *   tempoFactor → kaleidoscope rotation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const STAR_COUNT = 100;
const DUST_COUNT = 60;

interface Star { x: number; y: number; r: number; phase: number; speed: number; }
interface Dust { ang: number; rad: number; speed: number; size: number; phase: number; }

function buildStars(): Star[] {
  const rng = seeded(57_338_991);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.4 + rng() * 1.6,
    phase: rng() * Math.PI * 2,
    speed: 0.005 + rng() * 0.03,
  }));
}

function buildDust(): Dust[] {
  const rng = seeded(91_447_338);
  return Array.from({ length: DUST_COUNT }, () => ({
    ang: rng() * Math.PI * 2,
    rad: 0.1 + rng() * 0.40,
    speed: 0.001 + rng() * 0.005,
    size: 0.7 + rng() * 2.2,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

// ── Mini skull SVG (used in rings) ──
function buildMiniSkull(scale: number, color: string, boltColor: string, eyeGlow: string): React.ReactNode {
  const r = scale;
  return (
    <g>
      <circle cx={0} cy={0} r={r} fill="rgba(0,0,0,0.55)" stroke={color} strokeWidth={r * 0.06} />
      <line x1={-r * 0.85} y1={0} x2={r * 0.85} y2={0} stroke={color} strokeWidth={r * 0.05} />
      {/* Eyes */}
      <circle cx={-r * 0.36} cy={-r * 0.18} r={r * 0.16} fill="rgba(0,0,0,0.85)" stroke={color} strokeWidth={r * 0.04} />
      <circle cx={r * 0.36} cy={-r * 0.18} r={r * 0.16} fill="rgba(0,0,0,0.85)" stroke={color} strokeWidth={r * 0.04} />
      <circle cx={-r * 0.36} cy={-r * 0.18} r={r * 0.10} fill={eyeGlow} opacity={0.85} />
      <circle cx={r * 0.36} cy={-r * 0.18} r={r * 0.10} fill={eyeGlow} opacity={0.85} />
      {/* Nose */}
      <path d={`M 0 ${-r * 0.04} L ${-r * 0.07} ${r * 0.10} L ${r * 0.07} ${r * 0.10} Z`}
        stroke={color} strokeWidth={r * 0.03} fill="rgba(0,0,0,0.5)" />
      {/* Lightning bolt */}
      <path d={`M ${-r * 0.10} ${-r * 0.85}
        L ${r * 0.08} ${-r * 0.10}
        L ${-r * 0.05} ${-r * 0.10}
        L ${r * 0.15} ${r * 0.85}
        L ${-r * 0.02} ${r * 0.05}
        L ${-r * 0.10} ${r * 0.05}
        L ${r * 0.10} ${-r * 0.85} Z`}
        fill={boltColor} opacity={0.95} />
      {/* Jaw */}
      <path d={`M ${-r * 0.55} ${r * 0.05}
        Q ${-r * 0.40} ${r * 0.55} ${0} ${r * 0.62}
        Q ${r * 0.40} ${r * 0.55} ${r * 0.55} ${r * 0.05}`}
        stroke={color} strokeWidth={r * 0.04} fill="none" opacity={0.65} />
    </g>
  );
}

export const SkullKaleidoscope: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const stars = React.useMemo(buildStars, []);
  const dust = React.useMemo(buildDust, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives
  const halo = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shimmer = interpolate(snap.energy, [0.02, 0.30], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lowThrob = interpolate(snap.bass, [0.0, 0.65], [0.30, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const breathScale = 1 + Math.sin(frame * 0.018) * 0.04 + snap.beatDecay * 0.18;
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;

  // Tie-dye palette
  const baseHue = 285;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.50) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 78%, ${64 + shimmer * 14}%)`;
  const tintCore = `hsl(${tintHue}, 92%, ${82 + shimmer * 10}%)`;
  const compHue = (tintHue + 180) % 360;
  const compColor = `hsl(${compHue}, 75%, 60%)`;
  const ringStroke = `hsl(45, 35%, ${82 + shimmer * 8}%)`;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 50%, 6%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 35%, 11%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 35%, 16%)`;

  // ─── HERO LAYOUT ───────────────────────────────────────────────────
  const cx = width / 2;
  const cy = height / 2;
  const heroR = Math.min(width, height) * 0.27 * breathScale;   // central skull radius
  const ring1R = Math.min(width, height) * 0.40;                // first ring distance
  const ring2R = Math.min(width, height) * 0.56;                // second ring distance

  const baseRot = (frame * 0.15 * tempoFactor) % 360;
  const counterRot = -(frame * 0.10 * tempoFactor) % 360;

  // Star nodes
  const starNodes = stars.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`st-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + flick * 0.6)}
        fill="#f8f0ff" opacity={0.30 + flick * 0.45} />
    );
  });

  // Dust orbiting
  const dustNodes = dust.map((d, i) => {
    const t = frame * d.speed + d.phase;
    const ang = d.ang + t;
    const rad = heroR * (1.05 + d.rad);
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad * 0.95;
    const flick = 0.5 + Math.sin(t * 2.1) * 0.4;
    return (
      <circle key={`dust-${i}`} cx={x} cy={y} r={d.size * (0.7 + shimmer * 0.6)}
        fill={tintCore} opacity={0.40 * flick * shimmer} />
    );
  });

  // Inner ring — 8 skulls
  const ring1Nodes: React.ReactNode[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * ring1R;
    const y = Math.sin(a) * ring1R;
    const sR = heroR * 0.30;
    ring1Nodes.push(
      <g key={`r1-${i}`} transform={`translate(${x}, ${y}) rotate(${a * 180 / Math.PI + 90})`}>
        {buildMiniSkull(sR, tintColor, "#ffd040", tintCore)}
      </g>,
    );
  }
  // Outer ring — 16 small skulls
  const ring2Nodes: React.ReactNode[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.cos(a) * ring2R;
    const y = Math.sin(a) * ring2R;
    const sR = heroR * 0.18;
    ring2Nodes.push(
      <g key={`r2-${i}`} transform={`translate(${x}, ${y}) rotate(${a * 180 / Math.PI + 90})`}>
        {buildMiniSkull(sR, compColor, "#ff8000", tintCore)}
      </g>,
    );
  }

  // Connective rays from center
  const rayNodes: React.ReactNode[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x1 = Math.cos(a) * heroR * 1.05;
    const y1 = Math.sin(a) * heroR * 1.05;
    const x2 = Math.cos(a) * ring2R * 1.10;
    const y2 = Math.sin(a) * ring2R * 1.10;
    rayNodes.push(
      <line key={`ray-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={tintColor} strokeWidth={1.4} opacity={0.30 + shimmer * 0.30} />
    );
  }

  // Hero skull local coords (around center)
  const sx = (u: number) => u * heroR;
  const sy = (v: number) => v * heroR;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="sk-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <radialGradient id="sk-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.55} />
            <stop offset="50%" stopColor={tintColor} stopOpacity={0.20} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="sk-eye">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.95} />
            <stop offset="50%" stopColor={tintColor} stopOpacity={0.55} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="sk-bolt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff8c0" />
            <stop offset="50%" stopColor="#ffd040" />
            <stop offset="100%" stopColor="#ff8000" />
          </linearGradient>
          <radialGradient id="sk-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="sk-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Cosmic backdrop */}
        <rect width={width} height={height} fill="url(#sk-sky)" />
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Halo */}
        <circle cx={cx} cy={cy} r={heroR * 2.2}
          fill="url(#sk-halo)" style={{ mixBlendMode: "screen" }} opacity={halo} />

        {/* Orbiting dust */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* ── KALEIDOSCOPE RINGS ── */}
        {/* Outer ring */}
        <g transform={`translate(${cx}, ${cy}) rotate(${counterRot})`}>
          {ring2Nodes}
        </g>

        {/* Connective rays */}
        <g transform={`translate(${cx}, ${cy})`} style={{ mixBlendMode: "screen" }}>
          {rayNodes}
        </g>

        {/* Inner ring */}
        <g transform={`translate(${cx}, ${cy}) rotate(${baseRot})`}>
          {ring1Nodes}
        </g>

        {/* ── HERO CENTER SKULL ── */}
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Outer ring */}
          <circle cx={0} cy={0} r={heroR + 4} fill="rgba(0,0,0,0.55)" />
          <circle cx={0} cy={0} r={heroR} fill="rgba(0,0,0,0.7)" stroke={ringStroke} strokeWidth={Math.max(3, heroR * 0.035)} />
          <circle cx={0} cy={0} r={heroR * 0.94} fill="none" stroke={ringStroke} strokeWidth={Math.max(1, heroR * 0.012)} opacity={0.55} />

          {/* Horizontal divider */}
          <line x1={-heroR * 0.96} y1={0} x2={heroR * 0.96} y2={0}
            stroke={ringStroke} strokeWidth={Math.max(2, heroR * 0.022)} />

          {/* Cranium curve */}
          <path d={`M ${sx(-0.66)} ${sy(0)}
            Q ${sx(-0.66)} ${sy(-0.78)} ${sx(0)} ${sy(-0.84)}
            Q ${sx(0.66)} ${sy(-0.78)} ${sx(0.66)} ${sy(0)}`}
            stroke={ringStroke} strokeWidth={Math.max(1.6, heroR * 0.017)} fill="none" opacity={0.7} />

          {/* Eye sockets */}
          <ellipse cx={sx(-0.34)} cy={sy(-0.30)} rx={heroR * 0.18} ry={heroR * 0.16}
            stroke={ringStroke} strokeWidth={Math.max(2, heroR * 0.022)} fill="rgba(0,0,0,0.7)" />
          <ellipse cx={sx(0.34)} cy={sy(-0.30)} rx={heroR * 0.18} ry={heroR * 0.16}
            stroke={ringStroke} strokeWidth={Math.max(2, heroR * 0.022)} fill="rgba(0,0,0,0.7)" />
          <ellipse cx={sx(-0.34)} cy={sy(-0.30)} rx={heroR * 0.14 * (0.85 + shimmer * 0.25)}
            ry={heroR * 0.12 * (0.85 + shimmer * 0.25)} fill="url(#sk-eye)" style={{ mixBlendMode: "screen" }} />
          <ellipse cx={sx(0.34)} cy={sy(-0.30)} rx={heroR * 0.14 * (0.85 + shimmer * 0.25)}
            ry={heroR * 0.12 * (0.85 + shimmer * 0.25)} fill="url(#sk-eye)" style={{ mixBlendMode: "screen" }} />

          {/* Nose */}
          <path d={`M ${sx(0)} ${sy(-0.10)} L ${sx(-0.08)} ${sy(0.06)} L ${sx(0.08)} ${sy(0.06)} Z`}
            stroke={ringStroke} strokeWidth={Math.max(1.4, heroR * 0.015)} fill="rgba(0,0,0,0.5)" />

          {/* Jaw */}
          <path d={`M ${sx(-0.58)} ${sy(0.04)}
            Q ${sx(-0.45)} ${sy(0.62)} ${sx(0)} ${sy(0.70)}
            Q ${sx(0.45)} ${sy(0.62)} ${sx(0.58)} ${sy(0.04)}`}
            stroke={ringStroke} strokeWidth={Math.max(1.6, heroR * 0.018)} fill="none" opacity={0.6} />

          {/* Teeth */}
          <line x1={sx(-0.18)} y1={sy(0.10)} x2={sx(-0.06)} y2={sy(0.10)}
            stroke={ringStroke} strokeWidth={1.4} opacity={0.5} />
          <line x1={sx(0.06)} y1={sy(0.10)} x2={sx(0.18)} y2={sy(0.10)}
            stroke={ringStroke} strokeWidth={1.4} opacity={0.5} />

          {/* Lightning bolt */}
          <g filter="url(#sk-glow)">
            <path d={`M ${sx(0.04)} ${sy(-0.92)}
              L ${sx(-0.18)} ${sy(-0.18)}
              L ${sx(0.04)} ${sy(-0.18)}
              L ${sx(-0.20)} ${sy(0.18)}
              L ${sx(-0.04)} ${sy(0.18)}
              L ${sx(-0.22)} ${sy(0.92)}
              L ${sx(0.18)} ${sy(0.10)}
              L ${sx(-0.04)} ${sy(0.10)}
              L ${sx(0.22)} ${sy(-0.30)}
              L ${sx(0.04)} ${sy(-0.30)}
              L ${sx(0.16)} ${sy(-0.92)} Z`}
              fill="#ffe060" opacity={0.6 + flash * 0.35} />
          </g>
          <path d={`M ${sx(0.04)} ${sy(-0.92)}
            L ${sx(-0.18)} ${sy(-0.18)}
            L ${sx(0.04)} ${sy(-0.18)}
            L ${sx(-0.20)} ${sy(0.18)}
            L ${sx(-0.04)} ${sy(0.18)}
            L ${sx(-0.22)} ${sy(0.92)}
            L ${sx(0.18)} ${sy(0.10)}
            L ${sx(-0.04)} ${sy(0.10)}
            L ${sx(0.22)} ${sy(-0.30)}
            L ${sx(0.04)} ${sy(-0.30)}
            L ${sx(0.16)} ${sy(-0.92)} Z`}
            fill="url(#sk-bolt)" opacity={0.95} />
        </g>

        {/* Onset flash */}
        {flash > 0.05 && (
          <circle cx={cx} cy={cy} r={Math.min(width, height) * (0.6 + flash * 0.3)}
            fill={`rgba(255, 250, 230, ${flash * 0.16})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#sk-vig)" />
      </svg>
    </div>
  );
};
