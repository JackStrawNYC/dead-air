/**
 * DarkStarAscent — A+++ overlay.
 * A dark star (huge black sphere with corona) ascending from the bottom.
 * Solar prominences, gravitational lensing rings, accretion disk.
 * Cosmic dust spiraling in. Ominous and majestic.
 *
 * Audio reactivity:
 *   slowEnergy → corona bloom + ambient warmth
 *   energy     → prominence brightness
 *   bass       → low-end gravity well pulse
 *   beatDecay  → accretion disk acceleration
 *   onsetEnvelope → flare bursts
 *   chromaHue  → corona color tint
 *   tempoFactor → orbital speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const PROMINENCE_COUNT = 14;
const DUST_COUNT = 80;
const RING_COUNT = 6;
const STAR_COUNT = 90;
const ACCRETION_PARTICLES = 60;

interface Prominence {
  angle: number;
  baseLen: number;
  curl: number;
  speed: number;
  phase: number;
}
interface DustParticle {
  baseAngle: number;
  baseRadius: number;
  speed: number;
  size: number;
  phase: number;
}
interface BgStar {
  x: number;
  y: number;
  r: number;
  twinkleSpeed: number;
  phase: number;
}
interface AccretionParticle {
  baseAngle: number;
  radius: number;
  speed: number;
  size: number;
  thickness: number;
}

function buildProminences(): Prominence[] {
  const rng = seeded(78_443_119);
  return Array.from({ length: PROMINENCE_COUNT }, (_, i) => ({
    angle: (i / PROMINENCE_COUNT) * Math.PI * 2 + rng() * 0.2,
    baseLen: 80 + rng() * 120,
    curl: -0.4 + rng() * 0.8,
    speed: 0.005 + rng() * 0.015,
    phase: rng() * Math.PI * 2,
  }));
}

function buildDust(): DustParticle[] {
  const rng = seeded(56_119_872);
  return Array.from({ length: DUST_COUNT }, () => ({
    baseAngle: rng() * Math.PI * 2,
    baseRadius: 200 + rng() * 400,
    speed: 0.0035 + rng() * 0.012,
    size: 0.6 + rng() * 1.8,
    phase: rng() * Math.PI * 2,
  }));
}

function buildBgStars(): BgStar[] {
  const rng = seeded(11_553_287);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.4 + rng() * 1.4,
    twinkleSpeed: 0.02 + rng() * 0.05,
    phase: rng() * Math.PI * 2,
  }));
}

function buildAccretion(): AccretionParticle[] {
  const rng = seeded(82_551_904);
  return Array.from({ length: ACCRETION_PARTICLES }, () => ({
    baseAngle: rng() * Math.PI * 2,
    radius: 0.85 + rng() * 0.55,
    speed: 0.012 + rng() * 0.018,
    size: 1.2 + rng() * 2.4,
    thickness: 0.2 + rng() * 0.8,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const DarkStarAscent: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const prominences = React.useMemo(buildProminences, []);
  const dust = React.useMemo(buildDust, []);
  const bgStars = React.useMemo(buildBgStars, []);
  const accretion = React.useMemo(buildAccretion, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const coronaGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const promBright = interpolate(snap.energy, [0.02, 0.32], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const gravityPulse = 1 + snap.bass * 0.40;
  const accelMul = 1 + snap.beatDecay * 0.6;
  const flareBurst = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.8) : 0;

  // Palette — purple-blue base
  const baseHue = 268;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.40) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 75%, 60%)`;
  const tintCore = `hsl(${tintHue}, 95%, 80%)`;
  const tintDeep = `hsl(${(tintHue + 8) % 360}, 60%, 25%)`;
  const skyTop = `hsl(${(tintHue + 240) % 360}, 50%, 3%)`;
  const skyMid = `hsl(${(tintHue + 250) % 360}, 50%, 7%)`;
  const skyBot = `hsl(${(tintHue + 220) % 360}, 60%, 12%)`;

  // Ascent — star rises from below
  const ascentT = interpolate(progress, [0, 0.4, 1], [1.15, 0.55, 0.50], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cx = width / 2;
  const cy = height * ascentT;
  const starR = Math.min(width, height) * 0.26 * gravityPulse;

  // Background stars
  const starNodes = bgStars.map((s, i) => {
    const t = frame * s.twinkleSpeed + s.phase;
    const tw = 0.55 + Math.sin(t) * 0.4;
    const sx = s.x * width;
    const sy = s.y * height;
    const r = s.r * (0.85 + tw * 0.3);
    // Lensing distortion near star
    const dx = sx - cx;
    const dy = sy - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const lensFactor = Math.max(0, 1 - starR * 1.4 / Math.max(dist, 1));
    const finalR = r * (1 + lensFactor * 0.8);
    return (
      <circle key={`bs-${i}`} cx={sx} cy={sy} r={finalR}
        fill={tintCore} opacity={0.85 * tw} />
    );
  });

  // Lensing rings around star
  const lensRings: React.ReactNode[] = [];
  for (let r = 0; r < RING_COUNT; r++) {
    const ringR = starR * (1.15 + r * 0.18);
    const op = (1 - r / RING_COUNT) * 0.18 * coronaGlow;
    lensRings.push(
      <circle key={`lr-${r}`} cx={cx} cy={cy} r={ringR}
        fill="none" stroke={tintColor} strokeWidth={1.4}
        opacity={op} />
    );
  }

  // Prominences (solar arcs)
  const promNodes = prominences.map((p, i) => {
    const t = frame * p.speed + p.phase;
    const a0 = p.angle + frame * 0.002 * tempoFactor;
    const len = p.baseLen * (1 + Math.sin(t) * 0.25 + flareBurst * 0.4) * promBright;
    const x0 = cx + Math.cos(a0) * starR * 0.95;
    const y0 = cy + Math.sin(a0) * starR * 0.95;
    const a1 = a0 + p.curl + Math.sin(t * 1.3) * 0.2;
    const x1 = cx + Math.cos(a1) * (starR + len);
    const y1 = cy + Math.sin(a1) * (starR + len);
    const xMid = (x0 + x1) / 2 + Math.cos(a0 + Math.PI / 2) * len * 0.4;
    const yMid = (y0 + y1) / 2 + Math.sin(a0 + Math.PI / 2) * len * 0.4;
    return (
      <g key={`prom-${i}`}>
        <path d={`M ${x0} ${y0} Q ${xMid} ${yMid} ${x1} ${y1}`}
          stroke={tintColor} strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.18 * promBright} />
        <path d={`M ${x0} ${y0} Q ${xMid} ${yMid} ${x1} ${y1}`}
          stroke={tintColor} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.45 * promBright} />
        <path d={`M ${x0} ${y0} Q ${xMid} ${yMid} ${x1} ${y1}`}
          stroke={tintCore} strokeWidth={1.2} fill="none" strokeLinecap="round" opacity={0.85 * promBright} />
      </g>
    );
  });

  // Accretion disk
  const accNodes = accretion.map((p, i) => {
    const a = p.baseAngle + frame * p.speed * accelMul * tempoFactor;
    const r = starR * p.radius;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r * 0.18; // flat disk
    return (
      <circle key={`acc-${i}`} cx={px} cy={py} r={p.size * (0.85 + flareBurst * 0.5)}
        fill={tintCore} opacity={0.75 * promBright * p.thickness} />
    );
  });

  // Cosmic dust spiraling inward
  const dustNodes = dust.map((d, i) => {
    const t = frame * d.speed + d.phase;
    const a = d.baseAngle + t * 0.5;
    // Spiral inward
    const r = d.baseRadius * (1 - (t * 0.05) % 1);
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    return (
      <circle key={`dust-${i}`} cx={px} cy={py} r={d.size * (0.7 + promBright * 0.5)}
        fill={tintCore} opacity={0.50 * promBright} />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="dsa-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <radialGradient id="dsa-corona">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.0} />
            <stop offset="40%" stopColor={tintColor} stopOpacity={0.30} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="dsa-star">
            <stop offset="0%" stopColor="#000" />
            <stop offset="80%" stopColor="#0a0612" />
            <stop offset="100%" stopColor={tintDeep} />
          </radialGradient>
          <radialGradient id="dsa-rim">
            <stop offset="80%" stopColor="rgba(0,0,0,0)" />
            <stop offset="92%" stopColor={tintColor} stopOpacity={0.6} />
            <stop offset="100%" stopColor={tintCore} stopOpacity={0.95} />
          </radialGradient>
          <filter id="dsa-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        <rect width={width} height={height} fill="url(#dsa-sky)" />
        {starNodes}

        {/* Outer corona bloom */}
        <circle cx={cx} cy={cy} r={starR * 4 * coronaGlow}
          fill="url(#dsa-corona)" style={{ mixBlendMode: "screen" }} />
        <circle cx={cx} cy={cy} r={starR * 2.4 * coronaGlow}
          fill="url(#dsa-corona)" style={{ mixBlendMode: "screen" }} opacity={0.7} />

        {/* Lensing rings */}
        {lensRings}

        {/* Cosmic dust spiral */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* Prominences */}
        <g style={{ mixBlendMode: "screen" }}>{promNodes}</g>

        {/* Accretion disk (in front of star) */}
        <g style={{ mixBlendMode: "screen" }}>{accNodes}</g>

        {/* Star — black sphere with bright rim */}
        <circle cx={cx} cy={cy} r={starR} fill="url(#dsa-star)" />
        <circle cx={cx} cy={cy} r={starR} fill="url(#dsa-rim)" />
        <circle cx={cx} cy={cy} r={starR + 4} fill="none"
          stroke={tintCore} strokeWidth={1.4} opacity={0.85 * promBright} />

        {/* Inner void hint */}
        <circle cx={cx} cy={cy} r={starR * 0.55} fill="rgba(0,0,0,0.95)" />

        {/* Flare burst */}
        {flareBurst > 0.1 && (
          <>
            <circle cx={cx} cy={cy} r={starR * (1.4 + flareBurst * 0.8)}
              fill="none" stroke={tintCore} strokeWidth={3} opacity={flareBurst * 0.9} />
            <circle cx={cx} cy={cy} r={starR * (1.7 + flareBurst * 1.0)}
              fill="none" stroke={tintColor} strokeWidth={1.6} opacity={flareBurst * 0.6} />
          </>
        )}
      </svg>
    </div>
  );
};
