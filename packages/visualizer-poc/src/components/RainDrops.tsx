/**
 * RainDrops — Layer 1 (Atmospheric)
 * A+++ rain system: 96 elongated teardrop shapes across 3 depth layers (far/mid/close)
 * with ghost trails, specular highlights, splash impacts (3 concentric ripple rings +
 * upward spray particles), puddle reflection gradient at bottom 5%, diagonal rain sheet
 * curtain, and depth-of-field blur on far layer.
 *
 * Audio: slowEnergy→density (inverse), bass→splash, chromaHue→tint, tempoFactor→speed,
 *        melodicDirection→wind, highs→highlight glint, beatDecay→puddle shimmer pulse.
 * Tier A+++ | Tags: organic, contemplative | dutyCycle: 100 | energyBand: low
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

const NUM_DROPS = 96;
const MAX_SPLASHES = 22;
const RIPPLE_RINGS = 3;
const PUDDLE_FRAC = 0.05;

interface DepthLayer {
  tier: 0 | 1 | 2; w: [number, number]; spd: [number, number];
  op: [number, number]; len: [number, number]; par: number;
}
const LAYERS: DepthLayer[] = [
  { tier: 0, w: [0.4, 0.8], spd: [3, 6],   op: [0.04, 0.10], len: [10, 18], par: 0.55 },
  { tier: 1, w: [0.9, 1.6], spd: [7, 12],  op: [0.10, 0.20], len: [16, 28], par: 1.0  },
  { tier: 2, w: [1.6, 2.6], spd: [12, 19], op: [0.18, 0.32], len: [26, 44], par: 1.5  },
];

interface Drop {
  x: number; speed: number; phase: number; length: number; opacity: number;
  width: number; layer: DepthLayer; wobPh: number; wobAmp: number;
  trailA: number; hlOff: number;
}
interface Spray { angle: number; vel: number; size: number; }

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t);
}

/* Color: blue-white base, 30% chromaHue blend */
function rc(hue: number, a: number, litBoost = 0): string {
  const h = 210 + (hue - 210) * 0.3;
  const s = 22 + (Math.abs(hue - 210) / 180) * 18;
  return `hsla(${h | 0},${s | 0}%,${Math.min(95, 70 + litBoost) | 0}%,${a.toFixed(4)})`;
}

/* Teardrop SVG path: narrow tip → bulging body via two-segment cubic bezier */
function tdPath(x: number, y: number, len: number, w: number, deg: number): string {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad), dy = Math.cos(rad), px = dy, py = -dx;
  const m1x = x + dx * len * 0.35, m1y = y + dy * len * 0.35;
  const m2x = x + dx * len * 0.65, m2y = y + dy * len * 0.65;
  const bx = x + dx * len, by = y + dy * len;
  const hw = w * 0.5, f = (n: number) => n.toFixed(1);
  return [
    `M ${f(x)} ${f(y)}`,
    `C ${f(x + px * hw * 0.15)} ${f(y + py * hw * 0.15)},`,
    `  ${f(m1x + px * hw * 0.8)} ${f(m1y + py * hw * 0.8)},`,
    `  ${f(m2x + px * hw)} ${f(m2y + py * hw)}`,
    `C ${f(m2x + px * hw * 0.9)} ${f(m2y + py * hw * 0.9)},`,
    `  ${f(bx + px * hw * 0.3)} ${f(by + py * hw * 0.3)},`,
    `  ${f(bx)} ${f(by)}`,
    `C ${f(bx - px * hw * 0.3)} ${f(by - py * hw * 0.3)},`,
    `  ${f(m2x - px * hw * 0.9)} ${f(m2y - py * hw * 0.9)},`,
    `  ${f(m2x - px * hw)} ${f(m2y - py * hw)}`,
    `C ${f(m1x - px * hw * 0.8)} ${f(m1y - py * hw * 0.8)},`,
    `  ${f(x - px * hw * 0.15)} ${f(y - py * hw * 0.15)},`,
    `  ${f(x)} ${f(y)} Z`,
  ].join(" ");
}

function genDrops(seed: number): Drop[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_DROPS }, () => {
    const roll = rng();
    const L = roll < 0.35 ? LAYERS[0] : roll < 0.70 ? LAYERS[1] : LAYERS[2];
    return {
      x: rng(), speed: lerp(L.spd[0], L.spd[1], rng()), phase: rng() * 800,
      length: lerp(L.len[0], L.len[1], rng()), opacity: lerp(L.op[0], L.op[1], rng()),
      width: lerp(L.w[0], L.w[1], rng()), layer: L, wobPh: rng() * Math.PI * 2,
      wobAmp: 1.5 + rng() * 2.5, trailA: 0.12 + rng() * 0.18, hlOff: 0.08 + rng() * 0.15,
    };
  });
}

function genSprays(seed: number): Spray[][] {
  const rng = seeded(seed + 7777);
  return Array.from({ length: MAX_SPLASHES }, () =>
    Array.from({ length: 5 + Math.floor(rng() * 3) }, () => ({
      angle: -Math.PI / 2 + (rng() - 0.5) * Math.PI * 0.65,
      vel: 0.35 + rng() * 0.65, size: 0.8 + rng() * 1.8,
    })),
  );
}

/* ─── Component ─── */
interface Props { frames: EnhancedFrameData[]; }

export const RainDrops: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();
  const audio = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const showSeed = ctx?.showSeed ?? 19770508;

  const drops = React.useMemo(() => genDrops(showSeed + 300), [showSeed]);
  const sprays = React.useMemo(() => genSprays(showSeed + 301), [showSeed]);
  const did = React.useMemo(() => `rain-${showSeed}`, [showSeed]);

  /* Audio mapping */
  const ec = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const quietness = 1 - interpolate(audio.slowEnergy, [0.02, 0.3], [0, 1], ec);
  const bassInt = interpolate(audio.bass, [0.04, 0.5], [0.25, 1.0], ec);
  const hiGlint = interpolate(audio.highs, [0.02, 0.3], [0, 1], ec);
  const beatPulse = interpolate(audio.beatDecay, [0, 1], [0, 0.5], ec);
  const speedMul = 0.65 + tempoFactor * 0.55;
  const hue = audio.chromaHue;
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const melodicDir = frames[idx].melodicDirection ?? 0;
  const windAng = melodicDir * 12 + Math.sin(frame * 0.002) * 4 + Math.sin(frame * 0.0007 + 1.9) * 2;
  const windRad = (windAng * Math.PI) / 180;

  /* Master fade-in */
  const masterFade = interpolate(frame, [50, 200], [0, 1], {
    ...ec, easing: Easing.out(Easing.cubic),
  });
  const masterOp = interpolate(quietness, [0, 1], [0.03, 0.45]) * masterFade;
  if (masterOp < 0.008) return null;

  const activeCt = Math.floor(interpolate(quietness, [0, 1], [12, NUM_DROPS], ec));
  const cycleH = height + 140;
  const impactZ = height * (1 - PUDDLE_FRAC);
  const splashes: { x: number; int: number; tier: 0 | 1 | 2; age: number }[] = [];
  const farEls: React.ReactNode[] = [];
  const midEls: React.ReactNode[] = [];
  const nearEls: React.ReactNode[] = [];

  /* ─── Build drops ─── */
  for (let i = 0; i < activeCt; i++) {
    const d = drops[i];
    const spd = d.speed * speedMul;
    const rawY = ((frame + d.phase) * spd) % cycleH - 70;
    if (rawY < -80 || rawY > height + 80) continue;

    const windD = Math.sin(windRad) * rawY * 0.045 * d.layer.par;
    const wobX = Math.sin(frame * 0.012 + d.wobPh) * d.wobAmp * d.layer.par;
    const fx = d.x * width + wobX + windD;
    const bucket = d.layer.tier === 0 ? farEls : d.layer.tier === 1 ? midEls : nearEls;

    // Ghost trail
    const tLen = d.length * 0.7;
    const tY = rawY - tLen * 1.1;
    const tA = d.opacity * d.trailA * 0.45;
    if (tY > -80 && tY < height + 80 && tA > 0.003) {
      bucket.push(
        <line key={`t${i}`} x1={fx} y1={tY}
          x2={fx + Math.sin(windRad) * tLen * 0.25} y2={tY + tLen}
          stroke={rc(hue, tA)} strokeWidth={d.width * 0.35}
          strokeLinecap="round" opacity={0.55} />,
      );
    }

    // Teardrop body
    bucket.push(
      <path key={`b${i}`} d={tdPath(fx, rawY, d.length, d.width * 2.4, windAng)}
        fill={rc(hue, d.opacity * 0.55)} />,
    );

    // Specular highlight streak (highs-driven)
    const hlLen = d.length * 0.65;
    const hlA = Math.min(d.opacity * 1.2, 0.45) * (0.4 + hiGlint * 0.6);
    if (hlA > 0.005) {
      const hlY = rawY + d.length * d.hlOff;
      bucket.push(
        <line key={`h${i}`} x1={fx} y1={hlY}
          x2={fx + Math.sin(windRad) * hlLen * 0.12} y2={hlY + hlLen}
          stroke={rc(hue, hlA, 18)} strokeWidth={d.width * 0.4} strokeLinecap="round" />,
      );
    }

    // Splash detect
    const dist = rawY - impactZ + 70;
    if (dist >= 0 && dist < 90 && splashes.length < MAX_SPLASHES) {
      splashes.push({ x: d.x * width + windD, int: d.opacity * bassInt * d.layer.par,
        tier: d.layer.tier, age: clamp01(dist / 90) });
    }
  }

  /* ─── Splashes: ripple rings + spray crowns ─── */
  const splashEls: React.ReactNode[] = [];
  const impactY = height * (1 - PUDDLE_FRAC * 0.5);

  for (let s = 0; s < splashes.length; s++) {
    const sp = splashes[s];
    if (sp.age >= 1) continue;
    const fade = 1 - sp.age;
    const bA = sp.int * fade;

    // 3 concentric ripple rings — perspective-squashed ellipses
    for (let r = 0; r < RIPPLE_RINGS; r++) {
      const rAge = Math.max(0, sp.age - r * 0.12);
      if (rAge <= 0) continue;
      const maxR = (28 + sp.tier * 12) * (1 + bassInt * 0.6);
      const rad = rAge * maxR;
      const rA = bA * smoothstep(1, 0.3, rAge) * 0.35;
      if (rA > 0.004) {
        splashEls.push(
          <ellipse key={`r${s}_${r}`} cx={sp.x} cy={impactY} rx={rad} ry={rad * 0.3}
            fill="none" stroke={rc(hue, rA, r === 0 ? 5 : 0)}
            strokeWidth={Math.max(0.3, (0.7 + sp.tier * 0.25) * (1 - rAge * 0.5))} />,
        );
      }
    }

    // Spray crown — upward particles with gravity
    if (sp.age < 0.55) {
      const parts = sprays[s % sprays.length];
      const prog = sp.age / 0.55;
      const sFade = Math.max(0, 1 - prog * prog);
      const maxD = (14 + sp.tier * 7) * sp.int * 2.2;
      for (let p = 0; p < parts.length; p++) {
        const pt = parts[p];
        const dist = pt.vel * maxD * prog;
        const grav = prog * prog * maxD * 0.75;
        const sA = bA * sFade * 0.55;
        if (sA > 0.004) {
          splashEls.push(
            <circle key={`s${s}_${p}`}
              cx={sp.x + Math.cos(pt.angle) * dist}
              cy={impactY + Math.sin(pt.angle) * dist + grav}
              r={pt.size * (0.4 + sp.tier * 0.3) * sFade} fill={rc(hue, sA, 10)} />,
          );
        }
      }
    }
  }

  /* ─── Puddle + rain sheet ─── */
  const puddleY = impactZ;
  const puddleH = height - puddleY;
  const pBaseA = interpolate(quietness, [0, 1], [0.008, 0.09]) * masterFade;
  const shimmer = 1 + Math.sin(frame * 0.035) * 0.12 + Math.sin(frame * 0.065 + 1.3) * 0.08
    + beatPulse * 0.25;
  const pA = pBaseA * shimmer;
  const sheetAng = windAng * 1.5 + Math.sin(frame * 0.004) * 6;
  const sheetA = interpolate(quietness, [0, 1], [0.003, 0.04]) * masterFade;

  /* Puddle shimmer data */
  const shimmers = React.useMemo(() => {
    const rng = seeded(showSeed + 555);
    return Array.from({ length: 10 }, () => ({
      xf: rng(), wb: 30 + rng() * 70, pA: rng() * Math.PI * 2,
      pB: rng() * Math.PI * 2, fA: 0.02 + rng() * 0.025,
      fB: 0.035 + rng() * 0.03, yf: 0.2 + rng() * 0.6,
    }));
  }, [showSeed]);

  /* Rain sheet band stops (animated opacity wave) */
  const sheetStops = [0, 1, 2, 3].map((i) => {
    const wave = Math.sin(frame * 0.003 + i * 1.7) * 0.5 + 0.5;
    const edge = i === 0 || i === 3;
    return { off: (i / 3) * 100, a: edge ? 0 : sheetA * wave };
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        style={{ opacity: masterOp }}>
        <defs>
          <linearGradient id={`${did}-p`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={rc(hue, 0)} />
            <stop offset="25%" stopColor={rc(hue, pA * 0.3, 3)} />
            <stop offset="60%" stopColor={rc(hue, pA * 0.7, 6)} />
            <stop offset="100%" stopColor={rc(hue, pA, 10)} />
          </linearGradient>
          <linearGradient id={`${did}-s`}
            gradientTransform={`rotate(${sheetAng.toFixed(1)})`}>
            {sheetStops.map((b, i) => (
              <stop key={i} offset={`${b.off}%`} stopColor={rc(hue, b.a)} />
            ))}
          </linearGradient>
          <filter id={`${did}-g`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={`${did}-f`}><feGaussianBlur stdDeviation="1.2" /></filter>
        </defs>

        {/* Rain sheet — faint diagonal curtain */}
        <rect x={-width * 0.25} y={0} width={width * 1.5} height={height}
          fill={`url(#${did}-s)`} opacity={0.65} />

        {/* Far drops (depth-of-field blur) */}
        <g filter={`url(#${did}-f)`}>{farEls}</g>
        {/* Mid drops */}
        <g>{midEls}</g>
        {/* Close drops */}
        <g>{nearEls}</g>

        {/* Splashes: ripple rings + spray (with glow) */}
        <g filter={`url(#${did}-g)`}>{splashEls}</g>

        {/* Puddle reflection gradient */}
        <rect x={0} y={puddleY} width={width} height={puddleH}
          fill={`url(#${did}-p)`} />

        {/* Puddle shimmer highlights — beat-synced */}
        {shimmers.map((sh, i) => {
          const sw = sh.wb * (1 + beatPulse * 0.3);
          const wave = Math.sin(frame * sh.fA + sh.pA) * 0.5
            + Math.sin(frame * sh.fB + sh.pB) * 0.3 + 0.2;
          const sa = Math.max(0, wave) * pA * 0.75;
          if (sa < 0.003) return null;
          return (
            <ellipse key={`m${i}`} cx={sh.xf * width} cy={puddleY + puddleH * sh.yf}
              rx={sw} ry={2.5 + beatPulse * 1.5} fill={rc(hue, sa, 14)} opacity={0.65} />
          );
        })}
      </svg>
    </div>
  );
};
