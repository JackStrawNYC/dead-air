/**
 * FogBank -- Layer 1 (Atmospheric)
 * A+++ volumetric fog: parallax depth layers, wispy tendrils,
 * chromaHue-tinted light shafts, and churning ground fog.
 *
 * Audio: slowEnergy -> fog density, bass -> ground fog churn,
 *        chromaHue -> light shaft tint, energy -> visibility
 *
 * Tier A+++ | Tags: organic, contemplative, atmospheric | dutyCycle: 100 | energyBand: low
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

interface FogLayer {
  y: number; rx: number; ry: number; driftSpeed: number;
  undulateFreq: number; undulateAmp: number; phase: number;
  opacity: number; depth: number; blur: number;
}
interface WispyTendril {
  startY: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number;
  endY: number; driftSpeed: number; morphFreq: number; morphAmp: number;
  phase: number; opacity: number; strokeWidth: number; blur: number;
}
interface LightShaft {
  x: number; angle: number; shaftWidth: number; rotSpeed: number;
  phase: number; opacity: number; blur: number; warmCoolBias: number;
}

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const CLAMP_EASE = { ...CLAMP, easing: Easing.out(Easing.cubic) };
const STAGGER = 90;

/* -- Generators ---------------------------------------------------- */

function genFogLayers(seed: number): FogLayer[] {
  const rng = seeded(seed);
  return Array.from({ length: 7 }, (_, i) => {
    const d = i / 6; // depth 0=far, 1=near
    return {
      y: 0.2 + rng() * 0.6, rx: 0.6 + (1 - d) * 0.8 + rng() * 0.3,
      ry: 0.06 + (1 - d) * 0.1 + rng() * 0.06, driftSpeed: 0.08 + d * 0.4 + rng() * 0.15,
      undulateFreq: 0.003 + rng() * 0.004, undulateAmp: 0.01 + rng() * 0.02,
      phase: rng() * Math.PI * 2, opacity: 0.04 + d * 0.08 + rng() * 0.04,
      depth: i, blur: 30 + (1 - d) * 40 + rng() * 15,
    };
  });
}

function genTendrils(seed: number): WispyTendril[] {
  const rng = seeded(seed);
  return Array.from({ length: 6 }, () => ({
    startY: 0.2 + rng() * 0.6, cp1x: 0.15 + rng() * 0.25, cp1y: -0.05 + rng() * 0.1,
    cp2x: 0.55 + rng() * 0.25, cp2y: -0.05 + rng() * 0.1, endY: 0.2 + rng() * 0.6,
    driftSpeed: 0.1 + rng() * 0.2, morphFreq: 0.006 + rng() * 0.008,
    morphAmp: 15 + rng() * 30, phase: rng() * Math.PI * 2,
    opacity: 0.05 + rng() * 0.05, strokeWidth: 2 + rng() * 5, blur: 8 + rng() * 12,
  }));
}

function genShafts(seed: number): LightShaft[] {
  const rng = seeded(seed);
  return Array.from({ length: 3 }, (_, i) => ({
    x: 0.15 + (i / 2) * 0.7 + (rng() - 0.5) * 0.15, angle: -25 + rng() * 50,
    shaftWidth: 60 + rng() * 100, rotSpeed: 0.003 + rng() * 0.005,
    phase: rng() * Math.PI * 2, opacity: 0.06 + rng() * 0.06,
    blur: 25 + rng() * 20, warmCoolBias: rng(),
  }));
}

/** ChromaHue-derived shaft tint (returns partial hsla string, caller appends alpha + ')') */
function shaftColor(hue: number, warmCool: number, e: number): string {
  const h = (40 + hue % 30) * (1 - warmCool) + (200 + hue % 40) * warmCool;
  return `hsla(${h}, ${30 + e * 30}%, ${70 + e * 15}%,`;
}

/* -- Component ----------------------------------------------------- */

interface Props { frames: EnhancedFrameData[] }

export const FogBank: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const seed = ctx?.showSeed ?? 19770508;

  const fogLayers = React.useMemo(() => genFogLayers(seed + 400), [seed]);
  const tendrils = React.useMemo(() => genTendrils(seed + 401), [seed]);
  const shafts = React.useMemo(() => genShafts(seed + 402), [seed]);

  const { slowEnergy, energy, bass, chromaHue } = snap;
  const t = frame * tempoFactor;

  const quietness = 1 - interpolate(energy, [0.03, 0.25], [0, 1], CLAMP);
  const fogDensity = interpolate(slowEnergy, [0.03, 0.20], [0.7, 0.25], CLAMP);
  const masterFade = interpolate(frame, [STAGGER, STAGGER + 150], [0, 1], CLAMP_EASE);
  const masterOp = fogDensity * masterFade;
  if (masterOp < 0.01) return null;

  /* -- 1. Fog Layers (7 parallax ellipses) ------------------------- */

  const fogEls = fogLayers.map((L, i) => {
    const delay = STAGGER + i * 18;
    const fade = interpolate(frame, [delay, delay + 100], [0, 1], CLAMP_EASE);
    if (fade < 0.01) return null;

    const driftX =
      Math.sin((t + L.phase) * 0.002 * L.driftSpeed) * width * 0.12 +
      Math.sin((t + L.phase * 1.3) * 0.0008 * L.driftSpeed) * width * 0.06;
    const undY =
      Math.sin(t * L.undulateFreq + L.phase) * height * L.undulateAmp +
      Math.sin(t * L.undulateFreq * 0.6 + L.phase * 2.1) * height * L.undulateAmp * 0.5;

    const cx = width * 0.5 + driftX;
    const cy = L.y * height + undY;
    const rx = L.rx * width * 0.5 * (1 + quietness * 0.15);
    const ry = L.ry * height * (1 + quietness * 0.3);
    const op = L.opacity * (0.6 + quietness * 0.4) * masterOp * fade;
    const gid = `fg-${i}`;

    return (
      <g key={gid} style={{ filter: `blur(${L.blur}px)` }}>
        <defs>
          <radialGradient id={gid} cx="50%" cy="50%" rx="50%" ry="50%">
            <stop offset="0%" stopColor={`hsla(210,15%,85%,${op})`} />
            <stop offset="35%" stopColor={`hsla(215,12%,82%,${op * 0.7})`} />
            <stop offset="65%" stopColor={`hsla(220,10%,78%,${op * 0.3})`} />
            <stop offset="100%" stopColor="hsla(220,10%,78%,0)" />
          </radialGradient>
        </defs>
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${gid})`} />
      </g>
    );
  });

  /* -- 2. Wispy Tendrils (6 blurred bezier wisps) ------------------ */

  const tendrilEls = tendrils.map((T, i) => {
    const delay = STAGGER + 7 * 18 + i * 25;
    const fade = interpolate(frame, [delay, delay + 120], [0, 1], CLAMP_EASE);
    if (fade < 0.01) return null;

    const driftX = Math.sin((t + T.phase) * 0.0015 * T.driftSpeed) * width * 0.08;
    const mt = t * T.morphFreq;
    const m1y = Math.sin(mt + T.phase) * T.morphAmp;
    const m2y = Math.sin(mt * 0.7 + T.phase * 1.6) * T.morphAmp;
    const m1x = Math.cos(mt * 0.5 + T.phase * 0.8) * T.morphAmp * 0.6;
    const m2x = Math.cos(mt * 0.4 + T.phase * 1.2) * T.morphAmp * 0.6;

    const sx = driftX - width * 0.1, sy = T.startY * height;
    const c1x = T.cp1x * width + driftX + m1x, c1y = sy + T.cp1y * height + m1y;
    const c2x = T.cp2x * width + driftX + m2x, c2y = T.endY * height + T.cp2y * height + m2y;
    const ex = width * 1.1 + driftX, ey = T.endY * height;

    const op = T.opacity * masterOp * fade * (0.5 + quietness * 0.5);

    return (
      <path
        key={`t-${i}`}
        d={`M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`}
        fill="none" stroke={`hsla(215,15%,85%,${op})`}
        strokeWidth={T.strokeWidth * (1 + quietness * 0.5)} strokeLinecap="round"
        style={{ filter: `blur(${T.blur}px)` }}
      />
    );
  });

  /* -- 3. Light Shafts (3 rotating beams, chromaHue-tinted) -------- */

  const shaftEls = shafts.map((S, i) => {
    const delay = STAGGER + 200 + i * 40;
    const fade = interpolate(frame, [delay, delay + 180], [0, 1], CLAMP_EASE);
    if (fade < 0.01) return null;

    const ang = S.angle + Math.sin(t * S.rotSpeed + S.phase) * 8;
    const shiftX = Math.sin(t * 0.001 + S.phase * 2.3) * width * 0.03;
    const cx = S.x * width + shiftX;
    const hw = S.shaftWidth * 0.5 * (0.8 + energy * 0.4);
    const sLen = height * 1.6;
    const col = shaftColor(chromaHue, S.warmCoolBias, energy);
    const op = S.opacity * masterOp * fade * (0.4 + energy * 0.6);
    const gid = `sh-${i}`;

    return (
      <g key={gid} style={{
        transform: `rotate(${ang}deg)`, transformOrigin: `${cx}px ${height * 0.5}px`,
        filter: `blur(${S.blur}px)`,
      }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={`${col} 0)`} />
            <stop offset="30%" stopColor={`${col} ${op * 0.6})`} />
            <stop offset="50%" stopColor={`${col} ${op})`} />
            <stop offset="70%" stopColor={`${col} ${op * 0.6})`} />
            <stop offset="100%" stopColor={`${col} 0)`} />
          </linearGradient>
        </defs>
        <rect x={cx - hw} y={-sLen * 0.3} width={hw * 2} height={sLen} fill={`url(#${gid})`} />
      </g>
    );
  });

  /* -- 4. Ground Fog (bottom 20%, bass-driven churn) --------------- */

  const bassChurn = interpolate(bass, [0.02, 0.3], [0.3, 1.5], CLAMP);
  const gfDelay = STAGGER + 60;
  const gfFade = interpolate(frame, [gfDelay, gfDelay + 120], [0, 1], CLAMP_EASE);
  const gH = height * (0.18 + quietness * 0.08);
  const gTop = height - gH;
  const gOp = masterOp * gfFade * (0.5 + quietness * 0.4);

  const groundSubs = Array.from({ length: 4 }, (_, gi) => {
    const ph = gi * 1.7;
    const dx = Math.sin(t * 0.002 * bassChurn + ph) * width * 0.06 +
      Math.cos(t * 0.001 * bassChurn + ph * 2.3) * width * 0.03;
    const uy = Math.sin(t * 0.003 * bassChurn + ph * 0.8) * gH * 0.08;
    const op = gOp * (0.6 + (gi / 4) * 0.4);
    const cy = gTop + gi * (gH / 4) * 0.3 + uy;
    const rx = width * (0.7 + gi * 0.08);
    const ry = gH * (0.5 + gi * 0.15);
    const bl = 25 + gi * 10;
    const gid = `gf-${gi}`;
    return (
      <g key={gid} style={{ filter: `blur(${bl}px)` }}>
        <defs>
          <radialGradient id={gid} cx="50%" cy="30%" rx="50%" ry="50%">
            <stop offset="0%" stopColor={`hsla(210,10%,88%,${op * 0.9})`} />
            <stop offset="50%" stopColor={`hsla(215,8%,82%,${op * 0.5})`} />
            <stop offset="100%" stopColor="hsla(220,8%,80%,0)" />
          </radialGradient>
        </defs>
        <ellipse cx={width * 0.5 + dx} cy={cy} rx={rx} ry={ry} fill={`url(#${gid})`} />
      </g>
    );
  });

  /* -- Render ------------------------------------------------------ */

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        style={{ mixBlendMode: "screen" }}>
        {fogEls}
        {tendrilEls}
        {shaftEls}
        <defs>
          <linearGradient id="gf-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsla(215,10%,85%,0)" />
            <stop offset="30%" stopColor={`hsla(215,10%,85%,${gOp * 0.2})`} />
            <stop offset="70%" stopColor={`hsla(210,12%,88%,${gOp * 0.5})`} />
            <stop offset="100%" stopColor={`hsla(210,12%,90%,${gOp * 0.7})`} />
          </linearGradient>
        </defs>
        <rect x={0} y={gTop} width={width} height={gH}
          fill="url(#gf-base)" style={{ filter: "blur(15px)" }} />
        {groundSubs}
      </svg>
    </div>
  );
};
