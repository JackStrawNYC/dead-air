/**
 * StealieFade — A+++ overlay: a hand-drawn / sketched-style Stealie skull
 * fading in/out. Different aesthetic from BreathingStealie — this one is
 * rendered in a charcoal/ink poster style with film-grain noise, hatching
 * lines, and a paper-stock backdrop. Centered, ~50% of frame.
 *
 * Audio reactivity:
 *   slowEnergy → atmospheric warmth + paper aging
 *   energy     → hatching density
 *   bass       → low-end glow
 *   beatDecay  → film-grain shimmer
 *   onsetEnvelope → ink burst flash
 *   chromaHue  → ink color tint
 *   tempoFactor → grain animation rate
 *
 * Bug fix: previously used snap.harmonicTension and similar fields with
 * potentially undefined values inside interpolate. All audio reads now use
 * the `?? 0` fallback before being passed to interpolate.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const HATCH_COUNT = 80;
const GRAIN_COUNT = 200;
const SPECKLE_COUNT = 120;

interface Hatch { x1: number; y1: number; x2: number; y2: number; opacity: number; }
interface Grain { x: number; y: number; r: number; phase: number; }

function buildHatches(): Hatch[] {
  const rng = seeded(82_447_991);
  return Array.from({ length: HATCH_COUNT }, () => {
    const x = rng();
    const y = rng();
    const ang = rng() * Math.PI;
    const len = 6 + rng() * 24;
    return {
      x1: x,
      y1: y,
      x2: x + (Math.cos(ang) * len) / 1000,
      y2: y + (Math.sin(ang) * len) / 1000,
      opacity: 0.15 + rng() * 0.4,
    };
  });
}

function buildGrain(): Grain[] {
  const rng = seeded(33_882_174);
  return Array.from({ length: GRAIN_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.5 + rng() * 1.4,
    phase: rng() * Math.PI * 2,
  }));
}

function buildSpeckles(): Grain[] {
  const rng = seeded(51_991_443);
  return Array.from({ length: SPECKLE_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.3 + rng() * 1.2,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const StealieFade: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const hatches = React.useMemo(buildHatches, []);
  const grain = React.useMemo(buildGrain, []);
  const speckles = React.useMemo(buildSpeckles, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives — ALL fields safely defaulted with ?? 0
  const slowE = snap.slowEnergy ?? 0;
  const energy = snap.energy ?? 0;
  const bass = snap.bass ?? 0;
  const beatDecay = snap.beatDecay ?? 0;
  const onset = snap.onsetEnvelope ?? 0;
  const chromaHue = snap.chromaHue ?? 180;

  const warmth = interpolate(slowE, [0.02, 0.32], [0.55, 1.10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hatchDensity = interpolate(energy, [0.02, 0.30], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lowGlow = interpolate(bass, [0.0, 0.65], [0.30, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const grainShimmer = 1 + beatDecay * 0.10;
  const flash = onset > 0.5 ? Math.min(1, (onset - 0.4) * 1.6) : 0;

  // Ink palette modulated by chromaHue
  const baseHue = 28;  // sepia
  const tintHue = ((baseHue + (chromaHue - 180) * 0.15) % 360 + 360) % 360;
  const inkColor = `hsl(${tintHue}, 35%, ${22 + lowGlow * 8}%)`;
  const inkLight = `hsl(${tintHue}, 30%, ${42 + warmth * 14}%)`;
  const paperLight = `hsl(${(tintHue + 5) % 360}, 25%, ${82 + warmth * 6}%)`;
  const paperMid = `hsl(${tintHue}, 30%, ${68 + warmth * 6}%)`;
  const paperDark = `hsl(${tintHue}, 35%, ${45 + warmth * 6}%)`;
  const accentColor = `hsl(${(tintHue + 180) % 360}, 60%, 45%)`;

  // ─── HERO LAYOUT ───────────────────────────────────────────────────
  const cx = width / 2;
  const cy = height / 2;
  const stealieR = Math.min(width, height) * 0.27;
  const sx = (u: number) => cx + u * stealieR;
  const sy = (v: number) => cy + v * stealieR;

  // Grain noise
  const grainNodes = grain.map((g, i) => {
    const flick = 0.5 + Math.sin(frame * 0.4 * tempoFactor + g.phase) * 0.5;
    return (
      <circle key={`grain-${i}`} cx={g.x * width} cy={g.y * height}
        r={g.r * grainShimmer}
        fill={inkColor} opacity={0.10 + flick * 0.10} />
    );
  });

  // Speckle ink splatter
  const speckleNodes = speckles.map((s, i) => {
    return (
      <circle key={`spk-${i}`} cx={s.x * width} cy={s.y * height} r={s.r}
        fill={inkColor} opacity={0.20 + (i % 3) * 0.15} />
    );
  });

  // Hatching lines on paper
  const hatchNodes = hatches.map((h, i) => {
    const x1 = h.x1 * width;
    const y1 = h.y1 * height;
    const x2 = h.x2 * width * 30 + x1;
    const y2 = h.y2 * height * 30 + y1;
    return (
      <line key={`h-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={inkLight} strokeWidth={0.8} opacity={h.opacity * hatchDensity} />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="sf-paper" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={paperLight} />
            <stop offset="60%" stopColor={paperMid} />
            <stop offset="100%" stopColor={paperDark} />
          </linearGradient>
          <radialGradient id="sf-paperVig">
            <stop offset="50%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(20, 12, 4, 0.55)" />
          </radialGradient>
          <radialGradient id="sf-glow">
            <stop offset="0%" stopColor={inkLight} stopOpacity={0.30} />
            <stop offset="100%" stopColor={inkColor} stopOpacity={0} />
          </radialGradient>
          <filter id="sf-rough" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" />
            <feDisplacementMap in="SourceGraphic" scale="1.2" />
          </filter>
          <filter id="sf-grain" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="2.5" numOctaves="2" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.15 0 0 0 0 0.10 0 0 0 0 0.05 0 0 0 0.45 0" />
          </filter>
        </defs>

        {/* Paper backdrop */}
        <rect width={width} height={height} fill="url(#sf-paper)" />

        {/* Paper aging speckles */}
        <g>{speckleNodes}</g>

        {/* Paper vignette */}
        <rect width={width} height={height} fill="url(#sf-paperVig)" />

        {/* Hatching texture */}
        <g>{hatchNodes}</g>

        {/* Ink halo */}
        <circle cx={cx} cy={cy} r={stealieR * 1.6}
          fill="url(#sf-glow)" />

        {/* ── STEALIE — INK SKETCH STYLE ── */}
        {/* Outer ring shadow (offset for ink wash effect) */}
        <circle cx={cx + 2} cy={cy + 3} r={stealieR + 2}
          fill="none" stroke={inkColor} strokeWidth={6} opacity={0.35} />
        <circle cx={cx} cy={cy} r={stealieR}
          fill="none" stroke={inkColor} strokeWidth={Math.max(4, stealieR * 0.038)} />
        <circle cx={cx} cy={cy} r={stealieR * 0.94}
          fill="none" stroke={inkColor} strokeWidth={Math.max(1, stealieR * 0.012)} opacity={0.55}
          strokeDasharray="3 4" />

        {/* Skull dome - rough brushed fill via hatching */}
        {Array.from({ length: 30 }, (_, k) => {
          const a1 = (k / 30) * Math.PI - Math.PI;
          const a2 = a1 + Math.PI / 30;
          const r1 = stealieR * 0.85;
          const r2 = stealieR * (0.30 + (k % 3) * 0.10);
          return (
            <line key={`fill-${k}`}
              x1={cx + Math.cos(a1) * r1} y1={cy + Math.sin(a1) * r1}
              x2={cx + Math.cos(a1) * r2} y2={cy + Math.sin(a1) * r2}
              stroke={inkColor} strokeWidth={1.4} opacity={0.30 + hatchDensity * 0.30} />
          );
        })}

        {/* Horizontal divider — wobbly hand-drawn line */}
        <path d={`M ${cx - stealieR * 0.96} ${cy + 1}
          Q ${cx - stealieR * 0.5} ${cy - 1} ${cx} ${cy}
          Q ${cx + stealieR * 0.5} ${cy + 1} ${cx + stealieR * 0.96} ${cy}`}
          stroke={inkColor} strokeWidth={Math.max(2, stealieR * 0.025)} fill="none" />

        {/* Cranium curve */}
        <path d={`M ${sx(-0.66)} ${sy(0)}
          Q ${sx(-0.66)} ${sy(-0.78)} ${sx(0)} ${sy(-0.84)}
          Q ${sx(0.66)} ${sy(-0.78)} ${sx(0.66)} ${sy(0)}`}
          stroke={inkColor} strokeWidth={Math.max(1.6, stealieR * 0.020)} fill="none" />
        {/* Cranium suture */}
        <line x1={sx(0)} y1={sy(-0.84)} x2={sx(0)} y2={sy(0)}
          stroke={inkColor} strokeWidth={1.2} opacity={0.55} />

        {/* Eye sockets */}
        <ellipse cx={sx(-0.34)} cy={sy(-0.30)} rx={stealieR * 0.18} ry={stealieR * 0.16}
          stroke={inkColor} strokeWidth={Math.max(2, stealieR * 0.025)} fill="rgba(20, 12, 4, 0.85)" />
        <ellipse cx={sx(0.34)} cy={sy(-0.30)} rx={stealieR * 0.18} ry={stealieR * 0.16}
          stroke={inkColor} strokeWidth={Math.max(2, stealieR * 0.025)} fill="rgba(20, 12, 4, 0.85)" />
        {/* Eye crosshatch shading */}
        {Array.from({ length: 6 }, (_, k) => (
          <g key={`eye-h-${k}`}>
            <line x1={sx(-0.50) + k * 4} y1={sy(-0.40)} x2={sx(-0.16) - k * 4} y2={sy(-0.20)}
              stroke={inkColor} strokeWidth={0.8} opacity={0.35} />
            <line x1={sx(0.16) + k * 4} y1={sy(-0.40)} x2={sx(0.50) - k * 4} y2={sy(-0.20)}
              stroke={inkColor} strokeWidth={0.8} opacity={0.35} />
          </g>
        ))}

        {/* Nose */}
        <path d={`M ${sx(0)} ${sy(-0.10)} L ${sx(-0.08)} ${sy(0.06)} L ${sx(0.08)} ${sy(0.06)} Z`}
          stroke={inkColor} strokeWidth={Math.max(1.4, stealieR * 0.018)} fill="rgba(20, 12, 4, 0.5)" />

        {/* Jaw */}
        <path d={`M ${sx(-0.58)} ${sy(0.04)}
          Q ${sx(-0.45)} ${sy(0.62)} ${sx(0)} ${sy(0.70)}
          Q ${sx(0.45)} ${sy(0.62)} ${sx(0.58)} ${sy(0.04)}`}
          stroke={inkColor} strokeWidth={Math.max(1.6, stealieR * 0.020)} fill="none" />

        {/* Teeth */}
        {[-0.20, -0.10, 0, 0.10, 0.20].map((tx, i) => (
          <line key={`t-${i}`} x1={sx(tx)} y1={sy(0.10)} x2={sx(tx)} y2={sy(0.22)}
            stroke={inkColor} strokeWidth={1.4} />
        ))}
        <line x1={sx(-0.25)} y1={sy(0.10)} x2={sx(0.25)} y2={sy(0.10)}
          stroke={inkColor} strokeWidth={1.4} />
        <line x1={sx(-0.25)} y1={sy(0.22)} x2={sx(0.25)} y2={sy(0.22)}
          stroke={inkColor} strokeWidth={1.4} />

        {/* ── LIGHTNING BOLT — INK STROKE STYLE ── */}
        <g>
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
            fill={accentColor} stroke={inkColor} strokeWidth={2.4}
            opacity={0.85 + flash * 0.15} />
          {/* Bolt hatching */}
          {Array.from({ length: 8 }, (_, k) => (
            <line key={`bh-${k}`}
              x1={sx(-0.20)} y1={sy(-0.6 + k * 0.18)}
              x2={sx(0.20)} y2={sy(-0.6 + k * 0.18)}
              stroke={inkColor} strokeWidth={0.6} opacity={0.4} />
          ))}
        </g>

        {/* Onset ink burst */}
        {flash > 0.05 && (
          <circle cx={cx} cy={cy} r={stealieR * (1.0 + flash * 0.4)}
            fill={`rgba(40, 20, 6, ${flash * 0.20})`} />
        )}

        {/* Film grain on top */}
        <g style={{ mixBlendMode: "multiply" }}>{grainNodes}</g>

        {/* Final paper grain */}
        <rect width={width} height={height} fill="transparent" filter="url(#sf-grain)" opacity={0.55} />
      </svg>
    </div>
  );
};
