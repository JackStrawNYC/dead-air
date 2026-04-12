/**
 * StealYourFaceKaleidoscope — A+++ overlay: multiple Steal Your Face skulls
 * arranged in a 6-fold kaleidoscope, slowly rotating, each with proper
 * red/blue halves and lightning bolt. Cosmic backdrop with starfield and
 * nebulae. Center is dominated by a hero Stealie.
 *
 * Audio reactivity:
 *   slowEnergy → halo + cosmic warmth
 *   energy     → bolt brightness + ring shimmer
 *   bass       → low-end pulse
 *   beatDecay  → ring rotation pulse
 *   onsetEnvelope → bolt flash trigger
 *   chromaHue  → cosmic palette tint
 *   tempoFactor → rotation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const STAR_COUNT = 130;
const DUST_COUNT = 70;
const NEBULA_COUNT = 6;

interface Star { x: number; y: number; r: number; phase: number; speed: number; }
interface Dust { ang: number; rad: number; speed: number; size: number; phase: number; }
interface Nebula { cx: number; cy: number; rx: number; ry: number; rot: number; shade: number; }

function buildStars(): Star[] {
  const rng = seeded(81_223_775);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.4 + rng() * 1.6,
    phase: rng() * Math.PI * 2,
    speed: 0.005 + rng() * 0.03,
  }));
}

function buildDust(): Dust[] {
  const rng = seeded(45_991_882);
  return Array.from({ length: DUST_COUNT }, () => ({
    ang: rng() * Math.PI * 2,
    rad: 0.15 + rng() * 0.40,
    speed: 0.001 + rng() * 0.005,
    size: 0.7 + rng() * 2.2,
    phase: rng() * Math.PI * 2,
  }));
}

function buildNebulae(): Nebula[] {
  const rng = seeded(19_447_338);
  return Array.from({ length: NEBULA_COUNT }, () => ({
    cx: rng(),
    cy: rng(),
    rx: 0.18 + rng() * 0.20,
    ry: 0.10 + rng() * 0.16,
    rot: rng() * 360,
    shade: rng(),
  }));
}

interface Props { frames: EnhancedFrameData[]; }

// Mini stealie used in the kaleidoscope ring
function buildMiniStealie(scale: number, ringStroke: string, redCol: string, blueCol: string, boltCol: string, eyeGlow: string): React.ReactNode {
  const r = scale;
  return (
    <g>
      {/* Outer ring shadow */}
      <circle cx={0} cy={0} r={r + 1.5} fill="rgba(0,0,0,0.6)" />
      {/* Halves clipped */}
      <defs>
        <clipPath id={`mini-clip-${Math.floor(scale * 1000)}`}>
          <circle cx={0} cy={0} r={r * 0.95} />
        </clipPath>
      </defs>
      <g clipPath={`url(#mini-clip-${Math.floor(scale * 1000)})`}>
        <rect x={-r} y={-r} width={r} height={r * 2} fill={redCol} />
        <rect x={0} y={-r} width={r} height={r * 2} fill={blueCol} />
      </g>
      {/* Outer ring */}
      <circle cx={0} cy={0} r={r} fill="none" stroke={ringStroke} strokeWidth={r * 0.06} />
      {/* Horizontal divider */}
      <line x1={-r * 0.95} y1={0} x2={r * 0.95} y2={0} stroke={ringStroke} strokeWidth={r * 0.05} />
      {/* Eyes */}
      <circle cx={-r * 0.36} cy={-r * 0.18} r={r * 0.16} fill="rgba(0,0,0,0.85)" stroke={ringStroke} strokeWidth={r * 0.04} />
      <circle cx={r * 0.36} cy={-r * 0.18} r={r * 0.16} fill="rgba(0,0,0,0.85)" stroke={ringStroke} strokeWidth={r * 0.04} />
      <circle cx={-r * 0.36} cy={-r * 0.18} r={r * 0.10} fill={eyeGlow} opacity={0.85} />
      <circle cx={r * 0.36} cy={-r * 0.18} r={r * 0.10} fill={eyeGlow} opacity={0.85} />
      {/* Bolt */}
      <path d={`M ${r * 0.04} ${-r * 0.85}
        L ${-r * 0.18} ${-r * 0.10}
        L ${r * 0.04} ${-r * 0.10}
        L ${-r * 0.20} ${r * 0.18}
        L ${-r * 0.04} ${r * 0.18}
        L ${-r * 0.22} ${r * 0.85}
        L ${r * 0.18} ${r * 0.10}
        L ${-r * 0.04} ${r * 0.10}
        L ${r * 0.22} ${-r * 0.30}
        L ${r * 0.04} ${-r * 0.30}
        L ${r * 0.16} ${-r * 0.85} Z`}
        fill={boltCol} opacity={0.95} />
    </g>
  );
}

export const StealYourFaceKaleidoscope: React.FC<Props> = ({ frames }) => {
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
  const halo = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shimmer = interpolate(snap.energy, [0.02, 0.30], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lowThrob = interpolate(snap.bass, [0.0, 0.65], [0.30, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ringPulse = 1 + snap.beatDecay * 0.08;
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;

  // Cosmic palette
  const baseHue = 280;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.50) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 78%, ${64 + shimmer * 14}%)`;
  const tintCore = `hsl(${tintHue}, 92%, ${82 + shimmer * 10}%)`;
  const ringStroke = `hsl(45, 35%, ${82 + shimmer * 8}%)`;
  const redCol = `hsl(358, 78%, ${42 + lowThrob * 10}%)`;
  const blueCol = `hsl(215, 70%, ${40 + lowThrob * 10}%)`;
  const boltCol = "#ffd040";
  const skyTop = `hsl(${(tintHue + 200) % 360}, 50%, 6%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 35%, 11%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 35%, 16%)`;

  // ─── HERO LAYOUT ───────────────────────────────────────────────────
  const cx = width / 2;
  const cy = height / 2;
  const heroR = Math.min(width, height) * 0.20;
  const ring1R = Math.min(width, height) * 0.36;
  const ring2R = Math.min(width, height) * 0.50;

  const baseRot = (frame * 0.10 * tempoFactor) % 360;
  const counterRot = -(frame * 0.07 * tempoFactor) % 360;

  // Star nodes
  const starNodes = stars.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`st-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + flick * 0.6)}
        fill="#f8f0ff" opacity={0.30 + flick * 0.45} />
    );
  });

  // Nebulae
  const nebulaNodes = nebulae.map((n, i) => {
    const drift = Math.sin(frame * 0.003 + i * 0.5) * 30;
    return (
      <ellipse key={`neb-${i}`} cx={n.cx * width + drift} cy={n.cy * height}
        rx={n.rx * width} ry={n.ry * height}
        fill={`hsla(${(tintHue + n.shade * 60) % 360}, 60%, ${30 + n.shade * 20}%, ${0.20 + n.shade * 0.10})`}
        transform={`rotate(${n.rot + frame * 0.04} ${n.cx * width} ${n.cy * height})`}
        filter="url(#sk2-blur)" />
    );
  });

  // Dust
  const dustNodes = dust.map((d, i) => {
    const t = frame * d.speed + d.phase;
    const ang = d.ang + t;
    const rad = heroR * (1.5 + d.rad);
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad * 0.95;
    const flick = 0.5 + Math.sin(t * 2.1) * 0.4;
    return (
      <circle key={`dust-${i}`} cx={x} cy={y} r={d.size * (0.7 + shimmer * 0.6)}
        fill={tintCore} opacity={0.40 * flick * shimmer} />
    );
  });

  // Inner ring — 6 stealies (6-fold symmetry)
  const ring1Nodes: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * ring1R;
    const y = Math.sin(a) * ring1R;
    const sR = heroR * 0.38;
    ring1Nodes.push(
      <g key={`r1-${i}`} transform={`translate(${x}, ${y}) rotate(${a * 180 / Math.PI + 90})`}>
        {buildMiniStealie(sR, ringStroke, redCol, blueCol, boltCol, tintCore)}
      </g>,
    );
  }

  // Outer ring — 12 small stealies
  const ring2Nodes: React.ReactNode[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * ring2R;
    const y = Math.sin(a) * ring2R;
    const sR = heroR * 0.22;
    ring2Nodes.push(
      <g key={`r2-${i}`} transform={`translate(${x}, ${y}) rotate(${a * 180 / Math.PI + 90})`}>
        {buildMiniStealie(sR, ringStroke, redCol, blueCol, boltCol, tintCore)}
      </g>,
    );
  }

  // Connective rays
  const rayNodes: React.ReactNode[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x1 = Math.cos(a) * heroR * 1.10;
    const y1 = Math.sin(a) * heroR * 1.10;
    const x2 = Math.cos(a) * ring2R * 1.08;
    const y2 = Math.sin(a) * ring2R * 1.08;
    rayNodes.push(
      <line key={`ray-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={tintColor} strokeWidth={1.2} opacity={0.30 + shimmer * 0.30} />
    );
  }

  // Hero stealie sx/sy
  const sx = (u: number) => u * heroR;
  const sy = (v: number) => v * heroR;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="sk2-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <radialGradient id="sk2-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.55} />
            <stop offset="50%" stopColor={tintColor} stopOpacity={0.20} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="sk2-eye">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.95} />
            <stop offset="50%" stopColor={tintColor} stopOpacity={0.55} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="sk2-bolt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff8c0" />
            <stop offset="50%" stopColor="#ffd040" />
            <stop offset="100%" stopColor="#ff8000" />
          </linearGradient>
          <radialGradient id="sk2-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="sk2-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="sk2-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <clipPath id="sk2-heroclip">
            <circle cx={cx} cy={cy} r={heroR * 0.95} />
          </clipPath>
        </defs>

        {/* Cosmic backdrop */}
        <rect width={width} height={height} fill="url(#sk2-sky)" />
        {nebulaNodes}
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Halo */}
        <circle cx={cx} cy={cy} r={heroR * 3.0}
          fill="url(#sk2-halo)" style={{ mixBlendMode: "screen" }} opacity={halo} />

        {/* Outer kaleidoscope ring */}
        <g transform={`translate(${cx}, ${cy}) rotate(${counterRot}) scale(${ringPulse})`}>
          {ring2Nodes}
        </g>

        {/* Connective rays */}
        <g transform={`translate(${cx}, ${cy})`} style={{ mixBlendMode: "screen" }}>
          {rayNodes}
        </g>

        {/* Inner kaleidoscope ring */}
        <g transform={`translate(${cx}, ${cy}) rotate(${baseRot}) scale(${ringPulse})`}>
          {ring1Nodes}
        </g>

        {/* Orbiting dust */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* ── HERO STEALIE CENTER ── */}
        <g transform={`translate(${cx}, ${cy})`}>
          <circle cx={0} cy={0} r={heroR + 4} fill="rgba(0,0,0,0.55)" />
          <g clipPath="url(#sk2-heroclip)">
            <rect x={-heroR} y={-heroR} width={heroR} height={heroR * 2} fill={redCol} />
            <rect x={0} y={-heroR} width={heroR} height={heroR * 2} fill={blueCol} />
            <ellipse cx={0} cy={-heroR * 0.4} rx={heroR * 0.85} ry={heroR * 0.30}
              fill="rgba(255, 240, 220, 0.12)" />
          </g>
          <circle cx={0} cy={0} r={heroR} fill="none" stroke={ringStroke} strokeWidth={Math.max(3, heroR * 0.035)} />
          <circle cx={0} cy={0} r={heroR * 0.94} fill="none" stroke={ringStroke} strokeWidth={Math.max(1, heroR * 0.012)} opacity={0.55} />

          {/* Horizontal divider */}
          <line x1={-heroR * 0.96} y1={0} x2={heroR * 0.96} y2={0}
            stroke={ringStroke} strokeWidth={Math.max(2, heroR * 0.022)} />

          {/* Cranium */}
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
            ry={heroR * 0.12 * (0.85 + shimmer * 0.25)} fill="url(#sk2-eye)" style={{ mixBlendMode: "screen" }} />
          <ellipse cx={sx(0.34)} cy={sy(-0.30)} rx={heroR * 0.14 * (0.85 + shimmer * 0.25)}
            ry={heroR * 0.12 * (0.85 + shimmer * 0.25)} fill="url(#sk2-eye)" style={{ mixBlendMode: "screen" }} />

          {/* Nose */}
          <path d={`M ${sx(0)} ${sy(-0.10)} L ${sx(-0.08)} ${sy(0.06)} L ${sx(0.08)} ${sy(0.06)} Z`}
            stroke={ringStroke} strokeWidth={Math.max(1.4, heroR * 0.015)} fill="rgba(0,0,0,0.5)" />

          {/* Jaw */}
          <path d={`M ${sx(-0.58)} ${sy(0.04)}
            Q ${sx(-0.45)} ${sy(0.62)} ${sx(0)} ${sy(0.70)}
            Q ${sx(0.45)} ${sy(0.62)} ${sx(0.58)} ${sy(0.04)}`}
            stroke={ringStroke} strokeWidth={Math.max(1.6, heroR * 0.018)} fill="none" opacity={0.6} />

          {/* Bolt — multilayer */}
          <g filter="url(#sk2-glow)">
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
            fill="url(#sk2-bolt)" opacity={0.95} />
        </g>

        {/* Onset flash */}
        {flash > 0.05 && (
          <circle cx={cx} cy={cy} r={Math.min(width, height) * (0.6 + flash * 0.3)}
            fill={`rgba(255, 250, 230, ${flash * 0.16})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#sk2-vig)" />
      </svg>
    </div>
  );
};
