/**
 * SkullRoses — A+++ overlay: THE iconic Stanley Mouse Grateful Dead image.
 * A grinning skull at LARGE scale (~50% of frame) with detailed roses
 * growing from the eye sockets and across the crown. Rose vines wrap
 * around. Background is a moody Victorian rose garden at dusk.
 *
 * Audio reactivity:
 *   slowEnergy → atmosphere warmth + halo
 *   energy     → rose petal bloom + shimmer
 *   bass       → low-end skull throb
 *   beatDecay  → bloom pulse
 *   onsetEnvelope → rose burst flash
 *   chromaHue  → rose color tint shift
 *   tempoFactor → vine sway rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const PETAL_COUNT = 80;
const VINE_COUNT = 18;
const STAR_COUNT = 70;
const DUST_COUNT = 50;

interface Petal { ang: number; rad: number; size: number; speed: number; phase: number; hue: number; }
interface Vine { x0: number; y0: number; len: number; sway: number; phase: number; thorns: number; }
interface Star { x: number; y: number; r: number; phase: number; speed: number; }
interface Dust { ang: number; rad: number; speed: number; size: number; phase: number; }

function buildPetals(): Petal[] {
  const rng = seeded(91_223_447);
  return Array.from({ length: PETAL_COUNT }, () => ({
    ang: rng() * Math.PI * 2,
    rad: 0.10 + rng() * 0.45,
    size: 4 + rng() * 12,
    speed: 0.001 + rng() * 0.005,
    phase: rng() * Math.PI * 2,
    hue: rng() * 30 - 10,
  }));
}

function buildVines(): Vine[] {
  const rng = seeded(45_881_993);
  return Array.from({ length: VINE_COUNT }, () => ({
    x0: rng(),
    y0: 0.7 + rng() * 0.3,
    len: 80 + rng() * 200,
    sway: 0.003 + rng() * 0.012,
    phase: rng() * Math.PI * 2,
    thorns: 3 + Math.floor(rng() * 5),
  }));
}

function buildStars(): Star[] {
  const rng = seeded(73_991_412);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.5,
    r: 0.4 + rng() * 1.4,
    phase: rng() * Math.PI * 2,
    speed: 0.005 + rng() * 0.025,
  }));
}

function buildDust(): Dust[] {
  const rng = seeded(38_226_991);
  return Array.from({ length: DUST_COUNT }, () => ({
    ang: rng() * Math.PI * 2,
    rad: 0.10 + rng() * 0.40,
    speed: 0.0008 + rng() * 0.004,
    size: 0.6 + rng() * 2.0,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

// ── Detailed rose builder ──
function buildRose(cx: number, cy: number, size: number, color: string, coreColor: string, deepColor: string, rotate: number): React.ReactNode {
  const r = size;
  return (
    <g transform={`translate(${cx}, ${cy}) rotate(${rotate})`}>
      {/* Outer petals */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <ellipse key={`op-${i}`}
            cx={Math.cos(a) * r * 0.55} cy={Math.sin(a) * r * 0.55}
            rx={r * 0.42} ry={r * 0.32}
            fill={deepColor} opacity={0.85}
            transform={`rotate(${i * 45})`} />
        );
      })}
      {/* Mid petals */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        return (
          <ellipse key={`mp-${i}`}
            cx={Math.cos(a) * r * 0.30} cy={Math.sin(a) * r * 0.30}
            rx={r * 0.34} ry={r * 0.24}
            fill={color} opacity={0.92}
            transform={`rotate(${i * 60 + 18})`} />
        );
      })}
      {/* Inner petals */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <ellipse key={`ip-${i}`}
            cx={Math.cos(a) * r * 0.14} cy={Math.sin(a) * r * 0.14}
            rx={r * 0.22} ry={r * 0.16}
            fill={coreColor} opacity={0.95}
            transform={`rotate(${i * 72})`} />
        );
      })}
      {/* Bud center */}
      <circle cx={0} cy={0} r={r * 0.10} fill={`hsl(50, 90%, 80%)`} opacity={0.9} />
      <circle cx={0} cy={0} r={r * 0.05} fill="#fff8c0" opacity={1} />
    </g>
  );
}

// ── Leaf builder ──
function buildLeaf(cx: number, cy: number, size: number, rot: number): React.ReactNode {
  return (
    <g transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
      <path d={`M 0 0 Q ${size * 0.5} ${-size * 0.4} ${size} 0 Q ${size * 0.5} ${size * 0.4} 0 0 Z`}
        fill="rgba(40, 80, 30, 0.85)" stroke="rgba(20, 50, 15, 0.95)" strokeWidth={1.2} />
      <line x1={0} y1={0} x2={size} y2={0} stroke="rgba(20, 50, 15, 0.7)" strokeWidth={0.8} />
    </g>
  );
}

export const SkullRoses: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const petals = React.useMemo(buildPetals, []);
  const vines = React.useMemo(buildVines, []);
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
  const warmth = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bloom = interpolate(snap.energy, [0.02, 0.30], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lowThrob = interpolate(snap.bass, [0.0, 0.65], [0.30, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bloomPulse = 1 + snap.beatDecay * 0.07;
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;

  // Rose palette
  const baseHue = 350;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const roseColor = `hsl(${tintHue}, 78%, ${52 + bloom * 14}%)`;
  const roseCore = `hsl(${tintHue}, 92%, ${72 + bloom * 14}%)`;
  const roseDeep = `hsl(${tintHue}, 80%, ${30 + lowThrob * 8}%)`;
  const skullCol = `hsl(45, 35%, ${82 + bloom * 8}%)`;
  const skullDeep = `hsl(35, 20%, ${56 + lowThrob * 8}%)`;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 30%, 8%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 25%, 14%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 30%, 22%)`;

  // ─── HERO LAYOUT ───────────────────────────────────────────────────
  const cx = width / 2;
  const cy = height / 2 + height * 0.05;
  const skullW = width * 0.42;
  const skullH = height * 0.46;
  const sx = (u: number) => cx + u * skullW * 0.5;
  const sy = (v: number) => cy + v * skullH * 0.5;

  // Star nodes
  const starNodes = stars.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`st-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + flick * 0.6)}
        fill="#ffd0a0" opacity={0.30 + flick * 0.45} />
    );
  });

  // Dust orbiting
  const dustNodes = dust.map((d, i) => {
    const t = frame * d.speed + d.phase;
    const ang = d.ang + t;
    const rad = skullW * (0.55 + d.rad);
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad * 0.95;
    const flick = 0.5 + Math.sin(t * 2.1) * 0.4;
    return (
      <circle key={`dust-${i}`} cx={x} cy={y} r={d.size * (0.7 + bloom * 0.6)}
        fill={roseCore} opacity={0.40 * flick * bloom} />
    );
  });

  // Background petals drifting
  const petalNodes = petals.map((p, i) => {
    const t = frame * p.speed + p.phase;
    const ang = p.ang + t * 0.5;
    const rad = skullW * (0.7 + p.rad);
    const drift = Math.sin(t * 1.5) * 20;
    const x = cx + Math.cos(ang) * rad + drift;
    const y = cy + Math.sin(ang) * rad + Math.cos(t * 1.2) * 15;
    const rot = (t * 30) % 360;
    return (
      <ellipse key={`pet-${i}`} cx={x} cy={y} rx={p.size} ry={p.size * 0.6}
        fill={`hsl(${(tintHue + p.hue) % 360}, 78%, 60%)`}
        opacity={0.55 + bloom * 0.25} transform={`rotate(${rot} ${x} ${y})`} />
    );
  });

  // Background vines
  const vineNodes = vines.map((v, i) => {
    const sway = Math.sin(frame * v.sway + v.phase) * 12;
    const x0 = v.x0 * width;
    const y0 = v.y0 * height;
    const xMid = x0 + sway;
    const yMid = y0 - v.len * 0.5;
    const xTop = x0 + sway * 1.6;
    const yTop = y0 - v.len;
    return (
      <g key={`vine-${i}`}>
        <path d={`M ${x0} ${y0} Q ${xMid} ${yMid} ${xTop} ${yTop}`}
          stroke="rgba(40, 80, 30, 0.75)" strokeWidth={2.2} fill="none" />
        {/* Thorns */}
        {Array.from({ length: v.thorns }, (_, k) => {
          const t = (k + 1) / (v.thorns + 1);
          const tx = x0 + (xTop - x0) * t + sway * t * 0.6;
          const ty = y0 + (yTop - y0) * t;
          return (
            <line key={`th-${k}`} x1={tx} y1={ty} x2={tx + (k % 2 ? 4 : -4)} y2={ty - 5}
              stroke="rgba(20, 50, 15, 0.85)" strokeWidth={1.2} />
          );
        })}
        {/* Leaves */}
        {buildLeaf(x0 + sway * 0.5, y0 - v.len * 0.4, 14, sway > 0 ? 30 : -30)}
      </g>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="sr-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="sr-skullGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skullCol} />
            <stop offset="60%" stopColor={`hsl(40, 25%, 70%)`} />
            <stop offset="100%" stopColor={skullDeep} />
          </linearGradient>
          <radialGradient id="sr-halo">
            <stop offset="0%" stopColor={roseCore} stopOpacity={0.55} />
            <stop offset="50%" stopColor={roseColor} stopOpacity={0.20} />
            <stop offset="100%" stopColor={roseColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="sr-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="sr-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#sr-sky)" />

        {/* Stars */}
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Distant garden silhouette */}
        <ellipse cx={width * 0.5} cy={height * 0.78} rx={width * 0.7} ry={height * 0.18}
          fill="rgba(20, 12, 24, 0.85)" filter="url(#sr-blur)" />

        {/* Background vines */}
        <g>{vineNodes}</g>

        {/* Background drifting petals */}
        <g>{petalNodes}</g>

        {/* Halo behind skull */}
        <ellipse cx={cx} cy={cy} rx={skullW * 0.85} ry={skullH * 0.9}
          fill="url(#sr-halo)" style={{ mixBlendMode: "screen" }} opacity={warmth} />

        {/* Orbiting dust */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* ── HERO SKULL ── */}
        {/* Skull cranium */}
        <path d={`
          M ${cx} ${cy - skullH * 0.50}
          C ${cx + skullW * 0.40} ${cy - skullH * 0.50} ${cx + skullW * 0.50} ${cy - skullH * 0.20} ${cx + skullW * 0.50} ${cy + skullH * 0.05}
          C ${cx + skullW * 0.50} ${cy + skullH * 0.20} ${cx + skullW * 0.42} ${cy + skullH * 0.30} ${cx + skullW * 0.36} ${cy + skullH * 0.32}
          L ${cx + skullW * 0.36} ${cy + skullH * 0.46}
          L ${cx + skullW * 0.18} ${cy + skullH * 0.52}
          L ${cx - skullW * 0.18} ${cy + skullH * 0.52}
          L ${cx - skullW * 0.36} ${cy + skullH * 0.46}
          L ${cx - skullW * 0.36} ${cy + skullH * 0.32}
          C ${cx - skullW * 0.42} ${cy + skullH * 0.30} ${cx - skullW * 0.50} ${cy + skullH * 0.20} ${cx - skullW * 0.50} ${cy + skullH * 0.05}
          C ${cx - skullW * 0.50} ${cy - skullH * 0.20} ${cx - skullW * 0.40} ${cy - skullH * 0.50} ${cx} ${cy - skullH * 0.50}
          Z
        `} fill="url(#sr-skullGrad)" stroke="rgba(40, 30, 20, 0.85)" strokeWidth={3} />

        {/* Cranium suture lines */}
        <line x1={cx} y1={cy - skullH * 0.50} x2={cx} y2={cy - skullH * 0.05}
          stroke="rgba(40, 30, 20, 0.55)" strokeWidth={1.4} />
        <path d={`M ${sx(-0.3)} ${sy(-0.35)} Q ${sx(0)} ${sy(-0.40)} ${sx(0.3)} ${sy(-0.35)}`}
          stroke="rgba(40, 30, 20, 0.45)" strokeWidth={1} fill="none" />

        {/* Eye sockets — large, deep */}
        <ellipse cx={sx(-0.40)} cy={sy(-0.10)} rx={skullW * 0.13} ry={skullH * 0.15}
          fill="rgba(10, 5, 3, 0.95)" stroke="rgba(40, 30, 20, 0.85)" strokeWidth={2.4} />
        <ellipse cx={sx(0.40)} cy={sy(-0.10)} rx={skullW * 0.13} ry={skullH * 0.15}
          fill="rgba(10, 5, 3, 0.95)" stroke="rgba(40, 30, 20, 0.85)" strokeWidth={2.4} />

        {/* Nose cavity (heart shaped) */}
        <path d={`M ${sx(0)} ${sy(0.05)}
          Q ${sx(-0.10)} ${sy(0.20)} ${sx(-0.06)} ${sy(0.30)}
          L ${sx(0)} ${sy(0.25)}
          L ${sx(0.06)} ${sy(0.30)}
          Q ${sx(0.10)} ${sy(0.20)} ${sx(0)} ${sy(0.05)} Z`}
          fill="rgba(10, 5, 3, 0.95)" stroke="rgba(40, 30, 20, 0.85)" strokeWidth={2} />

        {/* Cheekbones */}
        <path d={`M ${sx(-0.45)} ${sy(0.20)} Q ${sx(-0.30)} ${sy(0.30)} ${sx(-0.18)} ${sy(0.28)}`}
          stroke="rgba(40, 30, 20, 0.55)" strokeWidth={1.6} fill="none" />
        <path d={`M ${sx(0.18)} ${sy(0.28)} Q ${sx(0.30)} ${sy(0.30)} ${sx(0.45)} ${sy(0.20)}`}
          stroke="rgba(40, 30, 20, 0.55)" strokeWidth={1.6} fill="none" />

        {/* Teeth row */}
        {[-0.30, -0.20, -0.10, 0.0, 0.10, 0.20, 0.30].map((tx, i) => (
          <rect key={`t-${i}`} x={sx(tx) - 6} y={sy(0.36)} width={12} height={18}
            fill={skullCol} stroke="rgba(40, 30, 20, 0.85)" strokeWidth={1.2} rx={2} />
        ))}
        <line x1={sx(-0.36)} y1={sy(0.36)} x2={sx(0.36)} y2={sy(0.36)}
          stroke="rgba(40, 30, 20, 0.85)" strokeWidth={1.6} />
        <line x1={sx(-0.36)} y1={sy(0.46)} x2={sx(0.36)} y2={sy(0.46)}
          stroke="rgba(40, 30, 20, 0.85)" strokeWidth={1.6} />

        {/* ── ROSES (large detailed) ── */}
        {/* Crown rose (top) */}
        {buildRose(cx, cy - skullH * 0.55, skullW * 0.16 * bloomPulse, roseColor, roseCore, roseDeep, frame * 0.3)}
        {/* Left eye rose */}
        {buildRose(sx(-0.40), sy(-0.10), skullW * 0.14 * bloomPulse, roseColor, roseCore, roseDeep, frame * 0.4)}
        {/* Right eye rose */}
        {buildRose(sx(0.40), sy(-0.10), skullW * 0.14 * bloomPulse, roseColor, roseCore, roseDeep, -frame * 0.35)}
        {/* Side roses */}
        {buildRose(cx - skullW * 0.55, cy - skullH * 0.20, skullW * 0.11 * bloomPulse, roseColor, roseCore, roseDeep, frame * 0.25)}
        {buildRose(cx + skullW * 0.55, cy - skullH * 0.20, skullW * 0.11 * bloomPulse, roseColor, roseCore, roseDeep, -frame * 0.25)}
        {/* Lower roses */}
        {buildRose(cx - skullW * 0.42, cy + skullH * 0.45, skullW * 0.10 * bloomPulse, roseColor, roseCore, roseDeep, frame * 0.2)}
        {buildRose(cx + skullW * 0.42, cy + skullH * 0.45, skullW * 0.10 * bloomPulse, roseColor, roseCore, roseDeep, -frame * 0.2)}

        {/* Wreath leaves around roses */}
        {[-0.6, -0.3, 0, 0.3, 0.6].map((lx, i) => buildLeaf(cx + lx * skullW, cy - skullH * 0.55, 18, lx * 30 + Math.sin(frame * 0.02 + i) * 8))}

        {/* Onset flash */}
        {flash > 0.05 && (
          <circle cx={cx} cy={cy} r={skullW * (1.0 + flash * 0.4)}
            fill={`rgba(255, 200, 220, ${flash * 0.16})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#sr-vig)" />
      </svg>
    </div>
  );
};
