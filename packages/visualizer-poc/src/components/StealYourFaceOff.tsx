/**
 * StealYourFaceOff — A+++ overlay: a LARGE single Steal Your Face skull
 * (60% of frame width), highly detailed: helmet shape, lightning bolt,
 * red/blue split colors with gradient depth, glow halo, and a cosmic
 * concert backdrop with audience silhouette and stage lights.
 *
 * Audio reactivity:
 *   slowEnergy → halo + atmospheric warmth
 *   energy     → bolt brightness + eye glow
 *   bass       → low-end skull throb
 *   beatDecay  → stealie pulse
 *   onsetEnvelope → bolt flash trigger
 *   chromaHue  → halo palette tint
 *   tempoFactor → beam rotation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const STAR_COUNT = 110;
const SPARK_COUNT = 60;
const BEAM_COUNT = 16;
const CROWD_COUNT = 50;

interface Star { x: number; y: number; r: number; phase: number; speed: number; }
interface Spark { ang: number; rad: number; speed: number; size: number; phase: number; }
interface Crowd { x: number; w: number; h: number; }

function buildStars(): Star[] {
  const rng = seeded(72_881_447);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.7,
    r: 0.5 + rng() * 1.6,
    phase: rng() * Math.PI * 2,
    speed: 0.005 + rng() * 0.03,
  }));
}

function buildSparks(): Spark[] {
  const rng = seeded(38_991_226);
  return Array.from({ length: SPARK_COUNT }, () => ({
    ang: rng() * Math.PI * 2,
    rad: 0.10 + rng() * 0.40,
    speed: 0.001 + rng() * 0.005,
    size: 0.7 + rng() * 2.2,
    phase: rng() * Math.PI * 2,
  }));
}

function buildCrowd(): Crowd[] {
  const rng = seeded(48_211_993);
  return Array.from({ length: CROWD_COUNT }, () => ({
    x: rng(),
    w: 0.012 + rng() * 0.020,
    h: 0.020 + rng() * 0.030,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const StealYourFaceOff: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const stars = React.useMemo(buildStars, []);
  const sparks = React.useMemo(buildSparks, []);
  const crowd = React.useMemo(buildCrowd, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives — widened for dramatic quiet/loud contrast
  const halo = interpolate(snap.slowEnergy, [0.02, 0.32], [0.20, 1.50], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const eyeFire = interpolate(snap.energy, [0.02, 0.30], [0.10, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lowThrob = interpolate(snap.bass, [0.0, 0.65], [0.15, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Widened stealie pulse: 5% → 20% (visible throb on every beat)
  const stealiePulse = 1 + snap.beatDecay * 0.20;
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;

  // Cosmic palette modulated by chromaHue
  const baseHue = 290;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.45) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 78%, ${64 + eyeFire * 14}%)`;
  const tintCore = `hsl(${tintHue}, 92%, ${82 + eyeFire * 10}%)`;
  const ringStroke = `hsl(45, 35%, ${82 + eyeFire * 8}%)`;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 50%, 6%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 35%, 11%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 35%, 18%)`;

  // ─── HERO LAYOUT ───────────────────────────────────────────────────
  const cx = width / 2;
  const cy = height / 2 - height * 0.04;
  const stealieR = Math.min(width, height) * 0.30 * stealiePulse;
  const sx = (u: number) => cx + u * stealieR;
  const sy = (v: number) => cy + v * stealieR;
  const beamRotation = (frame * 0.20 * tempoFactor) % 360;

  // Star nodes
  const starNodes = stars.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`st-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + flick * 0.6)}
        fill="#fff5d0" opacity={0.40 + flick * 0.45} />
    );
  });

  // Spark dust orbiting
  const sparkNodes = sparks.map((s, i) => {
    const t = frame * s.speed + s.phase;
    const ang = s.ang + t;
    const rad = stealieR * (1.05 + s.rad);
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad * 0.95;
    const flick = 0.5 + Math.sin(t * 2.1) * 0.4;
    return (
      <circle key={`spk-${i}`} cx={x} cy={y} r={s.size * (0.7 + eyeFire * 0.6)}
        fill={tintCore} opacity={0.40 * flick * eyeFire} />
    );
  });

  // Stage beams
  const beamNodes: React.ReactNode[] = [];
  for (let r = 0; r < BEAM_COUNT; r++) {
    const a = (r / BEAM_COUNT) * Math.PI * 2 + (beamRotation * Math.PI) / 180;
    const len = stealieR * (1.6 + eyeFire * 0.6);
    const x2 = Math.cos(a) * len;
    const y2 = Math.sin(a) * len;
    const w0 = 18 + eyeFire * 22;
    beamNodes.push(
      <g key={`beam-${r}`}>
        <path d={`M 0 0 L ${x2 - w0 * 0.6} ${y2} L ${x2 + w0 * 0.6} ${y2} Z`}
          fill={tintColor} opacity={0.10 * eyeFire * halo} />
        <path d={`M 0 0 L ${x2 - w0 * 0.32} ${y2} L ${x2 + w0 * 0.32} ${y2} Z`}
          fill={tintColor} opacity={0.20 * eyeFire * halo} />
      </g>,
    );
  }

  // Crowd silhouettes at bottom
  const crowdNodes = crowd.map((c, i) => {
    const cy0 = height * 0.86;
    return (
      <ellipse key={`crowd-${i}`} cx={c.x * width} cy={cy0}
        rx={c.w * width} ry={c.h * height}
        fill="rgba(8, 4, 12, 0.95)" />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="sof-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <radialGradient id="sof-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.65} />
            <stop offset="45%" stopColor={tintColor} stopOpacity={0.25} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="sof-eye">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.95} />
            <stop offset="50%" stopColor={tintColor} stopOpacity={0.55} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="sof-redhalf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(358, 80%, 60%)`} />
            <stop offset="50%" stopColor={`hsl(358, 80%, 45%)`} />
            <stop offset="100%" stopColor={`hsl(358, 80%, 28%)`} />
          </linearGradient>
          <linearGradient id="sof-bluehalf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(215, 72%, 56%)`} />
            <stop offset="50%" stopColor={`hsl(215, 72%, 42%)`} />
            <stop offset="100%" stopColor={`hsl(215, 72%, 26%)`} />
          </linearGradient>
          <linearGradient id="sof-bolt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff8c0" />
            <stop offset="50%" stopColor="#ffd040" />
            <stop offset="100%" stopColor="#ff8000" />
          </linearGradient>
          <radialGradient id="sof-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="sof-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <clipPath id="sof-skullclip">
            <circle cx={cx} cy={cy} r={stealieR * 0.94} />
          </clipPath>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#sof-sky)" />

        {/* Stars */}
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Stage beams */}
        <g transform={`translate(${cx}, ${cy})`} style={{ mixBlendMode: "screen" }}>
          {beamNodes}
        </g>

        {/* Halo */}
        <circle cx={cx} cy={cy} r={stealieR * 1.7}
          fill="url(#sof-halo)" style={{ mixBlendMode: "screen" }} opacity={halo} />

        {/* Sparks */}
        <g style={{ mixBlendMode: "screen" }}>{sparkNodes}</g>

        {/* Distant horizon line */}
        <rect x={0} y={height * 0.82} width={width} height={2} fill="rgba(60, 30, 90, 0.5)" />

        {/* ── HERO STEALIE ── */}
        {/* Outer ring shadow */}
        <circle cx={cx} cy={cy} r={stealieR + 5} fill="rgba(0,0,0,0.65)" />

        {/* Halves clipped */}
        <g clipPath="url(#sof-skullclip)">
          <rect x={cx - stealieR} y={cy - stealieR} width={stealieR} height={stealieR * 2}
            fill="url(#sof-redhalf)" />
          <rect x={cx} y={cy - stealieR} width={stealieR} height={stealieR * 2}
            fill="url(#sof-bluehalf)" />
          {/* Highlight on top of dome */}
          <ellipse cx={cx} cy={cy - stealieR * 0.4} rx={stealieR * 0.85} ry={stealieR * 0.30}
            fill="rgba(255, 240, 220, 0.16)" />
          {/* Lower jaw shading */}
          <ellipse cx={cx} cy={cy + stealieR * 0.55} rx={stealieR * 0.78} ry={stealieR * 0.25}
            fill="rgba(0, 0, 0, 0.30)" />
        </g>

        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={stealieR} fill="none" stroke={ringStroke} strokeWidth={Math.max(4, stealieR * 0.040)} />
        <circle cx={cx} cy={cy} r={stealieR * 0.94} fill="none" stroke={ringStroke} strokeWidth={Math.max(1, stealieR * 0.012)} opacity={0.55} />
        <circle cx={cx} cy={cy} r={stealieR * 1.04} fill="none" stroke={ringStroke} strokeWidth={2.5} opacity={0.35} />

        {/* Horizontal divider */}
        <line x1={cx - stealieR * 0.96} y1={cy} x2={cx + stealieR * 0.96} y2={cy}
          stroke={ringStroke} strokeWidth={Math.max(3, stealieR * 0.025)} />
        {/* Highlight on divider */}
        <line x1={cx - stealieR * 0.94} y1={cy - 2} x2={cx + stealieR * 0.94} y2={cy - 2}
          stroke="rgba(255, 240, 200, 0.5)" strokeWidth={1} />

        {/* Cranium curve */}
        <path d={`M ${sx(-0.66)} ${sy(0)}
          Q ${sx(-0.66)} ${sy(-0.78)} ${sx(0)} ${sy(-0.84)}
          Q ${sx(0.66)} ${sy(-0.78)} ${sx(0.66)} ${sy(0)}`}
          stroke={ringStroke} strokeWidth={Math.max(2, stealieR * 0.020)} fill="none" opacity={0.7} />

        {/* Inner cranium detail */}
        <path d={`M ${sx(-0.55)} ${sy(0)}
          Q ${sx(-0.55)} ${sy(-0.65)} ${sx(0)} ${sy(-0.72)}
          Q ${sx(0.55)} ${sy(-0.65)} ${sx(0.55)} ${sy(0)}`}
          stroke={ringStroke} strokeWidth={1} fill="none" opacity={0.35} />

        {/* Eye sockets */}
        <ellipse cx={sx(-0.34)} cy={sy(-0.30)} rx={stealieR * 0.18} ry={stealieR * 0.16}
          stroke={ringStroke} strokeWidth={Math.max(2, stealieR * 0.025)} fill="rgba(0,0,0,0.75)" />
        <ellipse cx={sx(0.34)} cy={sy(-0.30)} rx={stealieR * 0.18} ry={stealieR * 0.16}
          stroke={ringStroke} strokeWidth={Math.max(2, stealieR * 0.025)} fill="rgba(0,0,0,0.75)" />

        {/* Eye glow */}
        <ellipse cx={sx(-0.34)} cy={sy(-0.30)} rx={stealieR * 0.14 * (0.85 + eyeFire * 0.30)}
          ry={stealieR * 0.12 * (0.85 + eyeFire * 0.30)}
          fill="url(#sof-eye)" style={{ mixBlendMode: "screen" }} />
        <ellipse cx={sx(0.34)} cy={sy(-0.30)} rx={stealieR * 0.14 * (0.85 + eyeFire * 0.30)}
          ry={stealieR * 0.12 * (0.85 + eyeFire * 0.30)}
          fill="url(#sof-eye)" style={{ mixBlendMode: "screen" }} />

        {/* Pupils */}
        <circle cx={sx(-0.34)} cy={sy(-0.30)} r={stealieR * 0.04} fill="rgba(20,10,30,0.95)" />
        <circle cx={sx(0.34)} cy={sy(-0.30)} r={stealieR * 0.04} fill="rgba(20,10,30,0.95)" />

        {/* Nose */}
        <path d={`M ${sx(0)} ${sy(-0.10)} L ${sx(-0.08)} ${sy(0.06)} L ${sx(0.08)} ${sy(0.06)} Z`}
          stroke={ringStroke} strokeWidth={Math.max(1.6, stealieR * 0.018)} fill="rgba(0,0,0,0.6)" />

        {/* Jaw curve */}
        <path d={`M ${sx(-0.58)} ${sy(0.04)}
          Q ${sx(-0.45)} ${sy(0.62)} ${sx(0)} ${sy(0.70)}
          Q ${sx(0.45)} ${sy(0.62)} ${sx(0.58)} ${sy(0.04)}`}
          stroke={ringStroke} strokeWidth={Math.max(1.8, stealieR * 0.020)} fill="none" opacity={0.65} />

        {/* Teeth row */}
        {[-0.18, -0.06, 0.06, 0.18].map((tx, i) => (
          <line key={`t-${i}`} x1={sx(tx)} y1={sy(0.10)} x2={sx(tx)} y2={sy(0.18)}
            stroke={ringStroke} strokeWidth={1.6} opacity={0.55} />
        ))}

        {/* ── LIGHTNING BOLT — three layers (glow / main / core) ── */}
        <g filter="url(#sof-glow)">
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
          fill="url(#sof-bolt)" opacity={0.95} />

        {/* Crowd at bottom */}
        <g>{crowdNodes}</g>

        {/* Onset white flash */}
        {flash > 0.05 && (
          <circle cx={cx} cy={cy} r={stealieR * (1.2 + flash * 0.4)}
            fill={`rgba(255, 255, 240, ${flash * 0.18})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#sof-vig)" />
      </svg>
    </div>
  );
};
