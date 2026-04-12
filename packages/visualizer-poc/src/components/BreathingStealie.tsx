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
import { PsychedelicDefs, FILTER_IDS, PATTERN_IDS, NoiseLayer } from "./psychedelic-filters";
import { ProjectorEffect } from "./ProjectorEffect";

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

  // Audio drives — WIDENED dynamic range for dramatic quiet/loud contrast
  const haloDrive = interpolate(snap.slowEnergy, [0.02, 0.32], [0.30, 1.40], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const eyeFire = interpolate(snap.energy, [0.02, 0.30], [0.15, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lowThrob = interpolate(snap.bass, [0.0, 0.65], [0.15, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Breathing: wider ±10% scale instead of ±4%, plus stronger beat response
  const breath = 1 + Math.sin(frame * 0.018) * 0.10 + snap.beatDecay * 0.12;
  // Bolt pulse: wider range, more explosive on beat
  const boltPulse = 1 + snap.beatDecay * 0.65;
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;
  // Skull warp: bass-driven geometric distortion (ripple the skull outline)
  const skullWarp = snap.bass * 0.06;
  // Jaw tremble on drum onset
  const jawShake = snap.onsetEnvelope * 2.5;

  // Cosmic palette modulated by chromaHue
  const baseHue = 270;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.45) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 60%, ${50 + eyeFire * 14}%)`;
  const tintCore = `hsl(${tintHue}, 80%, ${70 + eyeFire * 10}%)`;
  // Near-black cosmic void — the Stealie floats in deep space
  const skyTop = `hsl(${(tintHue + 220) % 360}, 30%, 2%)`;
  const skyMid = `hsl(${(tintHue + 230) % 360}, 25%, 4%)`;
  const skyHorizon = `hsl(${(tintHue + 20) % 360}, 20%, 6%)`;
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

  // Dust orbiting Stealie — energy-driven orbit speed + size + chaotic wobble
  const dustNodes = dust.map((d, i) => {
    const energySpeed = 1 + snap.energy * 3.0; // 1x quiet, 4x loud
    const t = frame * d.speed * energySpeed + d.phase;
    const ang = d.ang + t;
    // Bass-driven radial breathing: dust pulses outward on bass hits
    const radialPulse = 1.0 + snap.bass * 0.15 + snap.beatDecay * 0.08;
    const rad = stealieR * (1.05 + d.rad) * radialPulse;
    // Chaotic wobble at high energy
    const wobbleX = snap.energy > 0.15 ? Math.sin(t * 3.7 + i) * snap.energy * 8 : 0;
    const wobbleY = snap.energy > 0.15 ? Math.cos(t * 2.9 + i * 1.3) * snap.energy * 6 : 0;
    const x = cx + Math.cos(ang) * rad + wobbleX;
    const y = cy + Math.sin(ang) * rad * 0.95 + wobbleY;
    const flick = 0.5 + Math.sin(t * 2.1) * 0.4;
    return (
      <circle key={`dust-${i}`} cx={x} cy={y} r={d.size * (0.5 + eyeFire * 1.2)}
        fill={tintCore} opacity={0.45 * flick * Math.max(0.15, eyeFire)} />
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
    const len = stealieR * (1.1 + eyeFire * 1.0 + Math.sin(frame * 0.04 + r) * 0.15);
    const x2 = Math.cos(a) * len;
    const y2 = Math.sin(a) * len;
    const w0 = 8 + eyeFire * 38;
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

  // Skull half fills — deep, rich, like the actual Steal Your Face album cover
  // Deeper red and blue than before — these should feel iconic, not pastel
  const redHue = 355 + eyeFire * 6;
  const blueHue = 220 - eyeFire * 5;
  const redFill = `hsl(${redHue}, 85%, ${32 + lowThrob * 8}%)`;
  const blueFill = `hsl(${blueHue}, 78%, ${30 + lowThrob * 8}%)`;
  // Ring: aged gold/brass, not bright white
  const ringStroke = `hsl(42, 55%, ${68 + eyeFire * 8}%)`;

  return (
    <ProjectorEffect width={width} height={height} frame={frame} intensity={0.55}>
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <PsychedelicDefs
            prefix="bs"
            frame={frame}
            energy={eyeFire}
            bass={lowThrob}
            beatDecay={snap.beatDecay}
            turbulenceFreq={0.008}
            include={["inkWash", "organicDistort", "glowBleed", "filmGrain", "posterize", "liquidDistort"]}
          />
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
          {/* Eye socket depth gradients — dark rim, lighter tinted center */}
          <radialGradient id="bs-socket-depth">
            <stop offset="0%" stopColor={tintColor} stopOpacity={0.18} />
            <stop offset="45%" stopColor="rgba(10,5,15,0.05)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.6)" />
          </radialGradient>
          {/* Jaw shadow gradient */}
          <linearGradient id="bs-jaw-shadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,0,0,0.30)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
          {/* Lightning bolt — rich gold, like actual Stealie artwork */}
          <linearGradient id="bs-bolt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe88a" />
            <stop offset="35%" stopColor="#e8b820" />
            <stop offset="70%" stopColor="#cc8800" />
            <stop offset="100%" stopColor="#a06000" />
          </linearGradient>
          <linearGradient id="bs-redhalf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${redHue}, 88%, 42%)`} />
            <stop offset="100%" stopColor={`hsl(${redHue}, 82%, 20%)`} />
          </linearGradient>
          <linearGradient id="bs-bluehalf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${blueHue}, 80%, 40%)`} />
            <stop offset="100%" stopColor={`hsl(${blueHue}, 75%, 18%)`} />
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

        {/* Cosmic backdrop — ink wash texture for analog feel */}
        <g filter={`url(#${FILTER_IDS.inkWash("bs")})`}>
          <rect width={width} height={height} fill="url(#bs-sky)" />
        </g>
        {/* Nebulae — liquid distortion for organic cloud shapes */}
        <g filter={`url(#${FILTER_IDS.liquidDistort("bs")})`}>
          {nebulaNodes}
        </g>
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Halo glow — with bleed for photographic bloom */}
        <g filter={`url(#${FILTER_IDS.glowBleed("bs")})`}>
          <circle cx={cx} cy={cy} r={stealieR * (1.6 + haloDrive * 0.4)}
            fill="url(#bs-halo)" style={{ mixBlendMode: "screen" }} />
        </g>

        {/* Halo rays — organic distortion for flickering flame look */}
        <g transform={`translate(${cx}, ${cy})`} style={{ mixBlendMode: "screen" }}
          filter={`url(#${FILTER_IDS.organicDistort("bs")})`}>
          {rayNodes}
        </g>

        {/* Orbiting dust */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* ── STEALIE HERO — posterize filter for psychedelic poster art ── */}
        <g filter={`url(#${FILTER_IDS.posterize("bs")})`}>
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

          {/* ── Skull suture lines — bone texture across cranium ── */}
          {/* Coronal suture — arcs across top of skull */}
          <path d={`M ${sx(-0.42)} ${sy(-0.48)} Q ${sx(-0.20)} ${sy(-0.58)} ${sx(0.02)} ${sy(-0.54)} Q ${sx(0.22)} ${sy(-0.50)} ${sx(0.40)} ${sy(-0.52)}`}
            stroke={ringStroke} strokeWidth={0.8} fill="none" opacity={0.13} strokeLinecap="round" />
          {/* Sagittal suture — runs down the midline */}
          <path d={`M ${sx(0.01)} ${sy(-0.78)} Q ${sx(-0.02)} ${sy(-0.60)} ${sx(0.01)} ${sy(-0.42)} Q ${sx(0.03)} ${sy(-0.28)} ${sx(0.00)} ${sy(-0.14)}`}
            stroke={ringStroke} strokeWidth={0.7} fill="none" opacity={0.10} strokeLinecap="round" />
          {/* Left temporal suture */}
          <path d={`M ${sx(-0.52)} ${sy(-0.18)} Q ${sx(-0.44)} ${sy(-0.34)} ${sx(-0.32)} ${sy(-0.44)} Q ${sx(-0.22)} ${sy(-0.52)} ${sx(-0.10)} ${sy(-0.56)}`}
            stroke={ringStroke} strokeWidth={0.7} fill="none" opacity={0.12} strokeLinecap="round" />
          {/* Right temporal suture */}
          <path d={`M ${sx(0.52)} ${sy(-0.18)} Q ${sx(0.44)} ${sy(-0.34)} ${sx(0.32)} ${sy(-0.44)} Q ${sx(0.22)} ${sy(-0.52)} ${sx(0.10)} ${sy(-0.56)}`}
            stroke={ringStroke} strokeWidth={0.7} fill="none" opacity={0.12} strokeLinecap="round" />
          {/* Lambdoid suture — rear of skull, subtle curve */}
          <path d={`M ${sx(-0.36)} ${sy(-0.62)} Q ${sx(-0.14)} ${sy(-0.72)} ${sx(0.00)} ${sy(-0.74)} Q ${sx(0.14)} ${sy(-0.72)} ${sx(0.36)} ${sy(-0.62)}`}
            stroke={ringStroke} strokeWidth={0.6} fill="none" opacity={0.10} strokeLinecap="round" />
        </g>

        {/* Outer ring strokes */}
        <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={ringStroke} strokeWidth={Math.max(3, stealieR * 0.035)} />
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={ringStroke} strokeWidth={Math.max(1, stealieR * 0.012)} opacity={0.55} />

        {/* Ring weathering — aged metal scratches across the outer ring */}
        {[
          { a1: -35, a2: -15 },
          { a1: 50, a2: 72 },
          { a1: 145, a2: 168 },
          { a1: -120, a2: -98 },
        ].map((scratch, i) => {
          const r1 = (scratch.a1 * Math.PI) / 180;
          const r2 = (scratch.a2 * Math.PI) / 180;
          const midR = (ringR + innerR) / 2;
          return (
            <line key={`scratch-${i}`}
              x1={cx + Math.cos(r1) * midR} y1={cy + Math.sin(r1) * midR}
              x2={cx + Math.cos(r2) * midR} y2={cy + Math.sin(r2) * midR}
              stroke="rgba(200,190,170,0.14)" strokeWidth={0.7 + i * 0.15}
              strokeLinecap="round" />
          );
        })}

        {/* Horizontal divider */}
        <line x1={cx - stealieR * 0.96} y1={cy} x2={cx + stealieR * 0.96} y2={cy}
          stroke={ringStroke} strokeWidth={Math.max(2, stealieR * 0.022)} />

        {/* Cranium curve */}
        <path d={`M ${sx(-0.66)} ${sy(0)}
          Q ${sx(-0.66)} ${sy(-0.78)} ${sx(0)} ${sy(-0.84)}
          Q ${sx(0.66)} ${sy(-0.78)} ${sx(0.66)} ${sy(0)}`}
          stroke={ringStroke} strokeWidth={Math.max(1.6, stealieR * 0.017)} fill="none" opacity={0.7} />

        {/* Eye sockets — with depth gradient instead of flat black */}
        <ellipse cx={sx(-0.34)} cy={sy(-0.30)} rx={stealieR * 0.18} ry={stealieR * 0.16}
          stroke={ringStroke} strokeWidth={Math.max(2, stealieR * 0.022)} fill="url(#bs-socket-depth)" />
        <ellipse cx={sx(0.34)} cy={sy(-0.30)} rx={stealieR * 0.18} ry={stealieR * 0.16}
          stroke={ringStroke} strokeWidth={Math.max(2, stealieR * 0.022)} fill="url(#bs-socket-depth)" />
        {/* Eye socket highlight arcs — upper rim catch light */}
        <path d={`M ${sx(-0.34 - 0.15)} ${sy(-0.30 - 0.08)}
          A ${stealieR * 0.17} ${stealieR * 0.14} 0 0 1 ${sx(-0.34 + 0.15)} ${sy(-0.30 - 0.08)}`}
          stroke="rgba(255,245,220,0.22)" strokeWidth={Math.max(1, stealieR * 0.010)} fill="none" strokeLinecap="round" />
        <path d={`M ${sx(0.34 - 0.15)} ${sy(-0.30 - 0.08)}
          A ${stealieR * 0.17} ${stealieR * 0.14} 0 0 1 ${sx(0.34 + 0.15)} ${sy(-0.30 - 0.08)}`}
          stroke="rgba(255,245,220,0.22)" strokeWidth={Math.max(1, stealieR * 0.010)} fill="none" strokeLinecap="round" />

        {/* Eye glow — pulsating with wider range + bass-driven warp */}
        <ellipse cx={sx(-0.34 - skullWarp * 0.5)} cy={sy(-0.30 + skullWarp * 0.3)}
          rx={stealieR * 0.14 * (0.60 + eyeFire * 0.55)}
          ry={stealieR * 0.12 * (0.60 + eyeFire * 0.55)}
          fill="url(#bs-eye)" style={{ mixBlendMode: "screen" }} />
        <ellipse cx={sx(0.34 + skullWarp * 0.5)} cy={sy(-0.30 + skullWarp * 0.3)}
          rx={stealieR * 0.14 * (0.60 + eyeFire * 0.55)}
          ry={stealieR * 0.12 * (0.60 + eyeFire * 0.55)}
          fill="url(#bs-eye)" style={{ mixBlendMode: "screen" }} />

        {/* Pupils */}
        <circle cx={sx(-0.34)} cy={sy(-0.30)} r={stealieR * 0.04} fill="rgba(20,10,30,0.95)" />
        <circle cx={sx(0.34)} cy={sy(-0.30)} r={stealieR * 0.04} fill="rgba(20,10,30,0.95)" />

        {/* Nose */}
        <path d={`M ${sx(0)} ${sy(-0.10)} L ${sx(-0.08)} ${sy(0.06)} L ${sx(0.08)} ${sy(0.06)} Z`}
          stroke={ringStroke} strokeWidth={Math.max(1.4, stealieR * 0.015)} fill="rgba(0,0,0,0.5)" />

        {/* Jaw — trembles on drum onset, drops slightly on bass */}
        <path d={`M ${sx(-0.58)} ${sy(0.04 + lowThrob * 0.03)}
          Q ${sx(-0.45 + jawShake * 0.003)} ${sy(0.62 + lowThrob * 0.05)} ${sx(0)} ${sy(0.70 + lowThrob * 0.06)}
          Q ${sx(0.45 - jawShake * 0.003)} ${sy(0.62 + lowThrob * 0.05)} ${sx(0.58)} ${sy(0.04 + lowThrob * 0.03)}`}
          stroke={ringStroke} strokeWidth={Math.max(1.6, stealieR * 0.018)} fill="none" opacity={0.6} />

        {/* Jawline shadow — soft depth below the jaw curve */}
        <ellipse cx={cx} cy={sy(0.72 + lowThrob * 0.06)}
          rx={stealieR * 0.50} ry={stealieR * 0.10}
          fill="url(#bs-jaw-shadow)" opacity={0.55} />

        {/* Teeth — individual tooth shapes across the jaw */}
        {[
          { xOff: -0.20, w: 0.050, h: 0.065 },
          { xOff: -0.12, w: 0.055, h: 0.072 },
          { xOff: -0.04, w: 0.048, h: 0.060 },
          { xOff:  0.04, w: 0.048, h: 0.060 },
          { xOff:  0.12, w: 0.055, h: 0.072 },
          { xOff:  0.20, w: 0.050, h: 0.065 },
        ].map((tooth, i) => {
          const tw = stealieR * tooth.w;
          const th = stealieR * tooth.h;
          const tRound = tw * 0.35;
          return (
            <rect key={`tooth-${i}`}
              x={sx(tooth.xOff) - tw / 2}
              y={sy(0.06)}
              width={tw} height={th}
              rx={tRound} ry={tRound}
              stroke={ringStroke} strokeWidth={Math.max(0.8, stealieR * 0.008)}
              fill="rgba(0,0,0,0.35)" opacity={0.50} />
          );
        })}

        {/* ── LIGHTNING BOLT — three layers (glow / main / core) + edge highlights ── */}
        <g transform={`scale(${boltPulse}) translate(${cx * (1 - 1 / boltPulse)}, ${cy * (1 - 1 / boltPulse)})`}>
          <g filter="url(#bs-glow)">
            <path d={boltPath} fill="#ffe060" opacity={0.6 + flash * 0.35} />
          </g>
          <path d={boltPath} fill="url(#bs-bolt)" opacity={0.95} />
          <path d={boltPath} fill="rgba(255, 250, 220, 0.85)" opacity={0.4 + flash * 0.55}
            transform={`scale(0.92) translate(${cx * 0.08}, ${cy * 0.08})`} />
          {/* Bolt edge highlights — left edge (inward offset ~1-2px) */}
          <path d={`
            M ${sx(0.04) + 1.5} ${sy(-0.92) + 2}
            L ${sx(-0.18) + 1.5} ${sy(-0.18) + 1}
            L ${sx(0.04) + 1.5} ${sy(-0.18) + 1}
            L ${sx(-0.20) + 1.5} ${sy(0.18) + 1}
            L ${sx(-0.04) + 1.5} ${sy(0.18) + 1}
            L ${sx(-0.22) + 1.5} ${sy(0.92) - 2}
          `} stroke="rgba(255,255,240,0.15)" strokeWidth={1.0} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* Bolt edge highlights — right edge (inward offset ~1-2px) */}
          <path d={`
            M ${sx(0.16) - 1.5} ${sy(-0.92) + 2}
            L ${sx(0.04) - 1.5} ${sy(-0.30) + 1}
            L ${sx(0.22) - 1.5} ${sy(-0.30) + 1}
            L ${sx(-0.04) - 1.5} ${sy(0.10) + 1}
            L ${sx(0.18) - 1.5} ${sy(0.10) + 1}
          `} stroke="rgba(255,255,240,0.13)" strokeWidth={0.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        </g>{/* end posterize group */}

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

        {/* Film grain overlay — analog texture */}
        <NoiseLayer width={width} height={height}
          filterId={PATTERN_IDS.noiseTexture("bs")}
          opacity={0.04 + snap.beatDecay * 0.04}
          blendMode="overlay" />

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#bs-vig)" />
      </svg>
    </div>
    </ProjectorEffect>
  );
};
