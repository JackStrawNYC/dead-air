/**
 * WolfGuitar — A+++ overlay: Bob Weir's "Wolf" Doug Irwin guitar
 * (originally Jerry's, then Bob's). Hero centerpiece with the iconic
 * inlaid wolf head on the body, lightning bolt inlay, single-cutaway
 * silhouette, three pickups, brass binding, ornate Doug Irwin headstock.
 *
 * The Wolf fills ~50%+ of the frame width and height, vertical orientation.
 * Cool silver/blue palette to differentiate from Tiger's amber warmth.
 * Moonlight cone from above, misty atmosphere swirling, stage floor
 * reflection, subtle silver glow halo. NOT a starfield — this is a SCENE.
 *
 * Audio reactivity:
 *   slowEnergy → moonlight intensity
 *   energy → wolf eyes glow + silver shimmer
 *   bass → low-end string sustain
 *   beatDecay → string vibration amplitude
 *   onsetEnvelope → wolf eye flash burst
 *   chromaHue → cool moonlight tint
 *   tempoFactor → string oscillation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const MIST_COUNT = 80;
const MOON_RAY_COUNT = 14;
const CLOUD_COUNT = 8;

interface MistMote { x: number; y: number; r: number; speed: number; phase: number; }
interface MistCloud { x: number; y: number; rx: number; ry: number; drift: number; alpha: number; }

function buildMist(): MistMote[] {
  const rng = seeded(85_443_902);
  return Array.from({ length: MIST_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.92,
    r: 0.7 + rng() * 2.0,
    speed: 0.0006 + rng() * 0.0020,
    phase: rng() * Math.PI * 2,
  }));
}

function buildClouds(): MistCloud[] {
  const rng = seeded(67_441_223);
  return Array.from({ length: CLOUD_COUNT }, () => ({
    x: rng(),
    y: 0.05 + rng() * 0.85,
    rx: 0.16 + rng() * 0.20,
    ry: 0.04 + rng() * 0.05,
    drift: 0.00008 + rng() * 0.00025,
    alpha: 0.10 + rng() * 0.18,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const WolfGuitar: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const mist = React.useMemo(buildMist, []);
  const clouds = React.useMemo(buildClouds, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives
  const moonlight = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const eyeGlow = interpolate(snap.energy, [0.02, 0.30], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sustain = interpolate(snap.bass, [0.0, 0.7], [0.30, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stringPulse = 1 + snap.beatDecay * 0.5;
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Cool moonlight palette modulated by chromaHue
  const baseHue = 210;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const tintLight = 60 + moonlight * 16;
  const tintColor = `hsl(${tintHue}, 60%, ${tintLight}%)`;
  const tintCore = `hsl(${(tintHue + 8) % 360}, 78%, ${Math.min(96, tintLight + 24)}%)`;
  const silverColor = `hsl(${(tintHue + 4) % 360}, 30%, ${72 + eyeGlow * 12}%)`;
  const silverDeep = `hsl(${(tintHue + 6) % 360}, 24%, 38%)`;
  const silverBright = `hsl(${(tintHue + 8) % 360}, 38%, ${85 + eyeGlow * 10}%)`;

  // ─── HERO GEOMETRY ─────────────────────────────────────────────────
  // Wolf is the centerpiece. Vertical orientation. Slightly smaller body
  // than Tiger (single-cutaway = narrower upper bout).
  const cx = width * 0.5;
  const cy = height * 0.50;

  const bodyW = width * 0.40;
  const bodyH = height * 0.46;
  const bodyCX = cx;
  const bodyCY = cy + height * 0.10;

  const neckW = bodyW * 0.13;
  const neckLen = height * 0.34;
  const neckTopY = bodyCY - bodyH * 0.50 - neckLen;
  const headstockH = height * 0.12;
  const headstockTopY = neckTopY - headstockH;

  // String vibration
  const stringVib = (s: number) => Math.sin(frame * 0.55 * tempoFactor + s * 1.1) * (1.5 + snap.beatDecay * 3 + sustain * 1);

  // Moonlight cone rays from above
  const rays: React.ReactNode[] = [];
  for (let r = 0; r < MOON_RAY_COUNT; r++) {
    const a = -Math.PI / 2 + ((r / MOON_RAY_COUNT) - 0.5) * 0.8;
    const len = height * 1.2;
    const x2 = Math.cos(a) * len;
    const y2 = Math.sin(a) * len;
    const w0 = 26 + eyeGlow * 18;
    rays.push(
      <g key={`ray-${r}`}>
        <path d={`M 0 0 L ${x2 - w0 * 0.6} ${y2} L ${x2 + w0 * 0.6} ${y2} Z`}
          fill={tintColor} opacity={0.10 * eyeGlow * moonlight} />
        <path d={`M 0 0 L ${x2 - w0 * 0.30} ${y2} L ${x2 + w0 * 0.30} ${y2} Z`}
          fill={tintColor} opacity={0.20 * eyeGlow * moonlight} />
        <path d={`M 0 0 L ${x2 - w0 * 0.10} ${y2} L ${x2 + w0 * 0.10} ${y2} Z`}
          fill={tintCore} opacity={0.36 * eyeGlow * moonlight} />
      </g>,
    );
  }

  // Mist clouds drifting through the scene
  const cloudNodes = clouds.map((c, i) => {
    const cxN = ((c.x + frame * c.drift) % 1.2) - 0.1;
    return (
      <ellipse key={`cloud-${i}`} cx={cxN * width} cy={c.y * height}
        rx={c.rx * width} ry={c.ry * height}
        fill={`rgba(120, 140, 180, ${c.alpha * moonlight})`} />
    );
  });

  // Stage floor (suggesting performance space at the bottom)
  const stagePlanks = Array.from({ length: 7 }, (_, i) => {
    const py = height * 0.93 + i * 4;
    return (
      <line key={`plank-${i}`} x1={0} y1={py} x2={width} y2={py}
        stroke={`rgba(8, 12, 22, ${0.6 - i * 0.06})`} strokeWidth={0.8} />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="wg-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#020610" />
            <stop offset="50%" stopColor="#040818" />
            <stop offset="100%" stopColor="#01030a" />
          </linearGradient>
          <linearGradient id="wg-stage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#040816" />
            <stop offset="100%" stopColor="#01020a" />
          </linearGradient>
          <radialGradient id="wg-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.85} />
            <stop offset="50%" stopColor={tintColor} stopOpacity={0.20} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="wg-wood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0a0c18" />
            <stop offset="35%" stopColor="#1c2236" />
            <stop offset="55%" stopColor="#2a3046" />
            <stop offset="75%" stopColor="#1a1e30" />
            <stop offset="100%" stopColor="#06080e" />
          </linearGradient>
          <radialGradient id="wg-bodyGloss" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="rgba(180, 210, 250, 0.40)" />
            <stop offset="40%" stopColor="rgba(140, 170, 210, 0.18)" />
            <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
          </radialGradient>
          <linearGradient id="wg-silver" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={silverBright} />
            <stop offset="50%" stopColor={silverColor} />
            <stop offset="100%" stopColor={silverDeep} />
          </linearGradient>
          <linearGradient id="wg-fretboard" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0a14" />
            <stop offset="50%" stopColor="#050510" />
            <stop offset="100%" stopColor="#020208" />
          </linearGradient>
          <linearGradient id="wg-neck" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1c1c28" />
            <stop offset="50%" stopColor="#3a3a4c" />
            <stop offset="100%" stopColor="#0e0e16" />
          </linearGradient>
          <radialGradient id="wg-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <radialGradient id="wg-eyeGlow">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.95} />
            <stop offset="100%" stopColor={tintCore} stopOpacity={0} />
          </radialGradient>
          <filter id="wg-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id="wg-softBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        {/* ── BACKDROP LAYER ── */}
        <rect width={width} height={height} fill="url(#wg-bg)" />
        <rect width={width} height={height} fill="url(#wg-stage)" />

        {/* ── MIST CLOUDS DRIFTING ── */}
        <g filter="url(#wg-softBlur)">{cloudNodes}</g>

        {/* ── MOONLIGHT CONE FROM ABOVE ── */}
        <g transform={`translate(${cx} ${-30})`} style={{ mixBlendMode: "screen" }}>
          {rays}
        </g>
        {/* Moon at top */}
        <circle cx={cx} cy={-10} r={50}
          fill={tintCore} opacity={0.65 * moonlight} filter="url(#wg-softBlur)" />
        <circle cx={cx} cy={0} r={26}
          fill={tintCore} opacity={0.80 * moonlight} />
        <circle cx={cx - 6} cy={-2} r={3} fill="rgba(80, 100, 140, 0.55)" />
        <circle cx={cx + 8} cy={4} r={2.2} fill="rgba(80, 100, 140, 0.55)" />

        {/* ── HALO BEHIND GUITAR ── */}
        <ellipse cx={bodyCX} cy={bodyCY - height * 0.06}
          rx={width * 0.40 * (0.9 + moonlight * 0.20) * stringPulse}
          ry={height * 0.50 * (0.9 + moonlight * 0.18) * stringPulse}
          fill="url(#wg-halo)" style={{ mixBlendMode: "screen" }} />

        {/* ── STAGE FLOOR / REFLECTION ── */}
        <rect x={0} y={height * 0.94} width={width} height={height * 0.06} fill="rgba(0, 1, 6, 0.92)" />
        {stagePlanks}
        {/* Audience silhouette suggestion */}
        {Array.from({ length: 16 }).map((_, i) => {
          const ax = (i + 0.5) * (width / 16);
          const ay = height * 0.97 + Math.sin(i * 1.7) * 2;
          return (
            <ellipse key={`aud-${i}`} cx={ax} cy={ay} rx={14 + (i % 3) * 4} ry={6 + (i % 2) * 2}
              fill="rgba(0, 1, 6, 0.95)" />
          );
        })}
        {/* Stage floor reflection of guitar */}
        <ellipse cx={cx} cy={height * 0.94} rx={bodyW * 0.45} ry={6}
          fill={tintColor} opacity={0.18 * moonlight} filter="url(#wg-blur)" style={{ mixBlendMode: "screen" }} />

        {/* ── SILVER PLAQUE BELOW THE GUITAR ── */}
        <g transform={`translate(${cx} ${height * 0.91})`}>
          <rect x={-130} y={-10} width={260} height={26} rx={3} fill="url(#wg-silver)"
            stroke="rgba(20, 30, 50, 0.85)" strokeWidth={1.4} />
          <rect x={-126} y={-7} width={252} height={20} rx={2} fill="none"
            stroke={silverDeep} strokeWidth={0.7} opacity={0.65} />
          <line x1={-110} y1={3} x2={110} y2={3} stroke="rgba(20, 30, 50, 0.65)" strokeWidth={0.6} />
          <path d="M -100 3 Q -94 -3 -88 3 Q -82 9 -76 3" stroke={silverDeep} strokeWidth={0.8} fill="none" />
          <path d="M 100 3 Q 94 -3 88 3 Q 82 9 76 3" stroke={silverDeep} strokeWidth={0.8} fill="none" />
          <text x={0} y={8} textAnchor="middle" fontSize={11} fontFamily="Georgia, serif"
            fontWeight={900} fill="rgba(20, 30, 50, 0.92)" letterSpacing={4}>WOLF</text>
          <circle cx={-122} cy={3} r={1.8} fill="rgba(20, 30, 50, 0.95)" />
          <circle cx={122} cy={3} r={1.8} fill="rgba(20, 30, 50, 0.95)" />
          <circle cx={-122} cy={3} r={0.6} fill={silverBright} />
          <circle cx={122} cy={3} r={0.6} fill={silverBright} />
        </g>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ── THE WOLF GUITAR — HERO CENTERPIECE ── */}
        {/* ─────────────────────────────────────────────────────────── */}
        <g transform={`translate(${bodyCX} ${bodyCY})`}>

          {/* Body cast shadow */}
          <ellipse cx={8} cy={12} rx={bodyW * 0.50 + 8} ry={bodyH * 0.48 + 8}
            fill="rgba(0, 0, 0, 0.62)" filter="url(#wg-blur)" />

          {/* ── BODY: single-cutaway shape (cutaway on UPPER-RIGHT only) ── */}
          {/* Asymmetric Doug Irwin Wolf silhouette */}
          <path d={`
            M ${-bodyW * 0.18} ${-bodyH * 0.46}
            C ${-bodyW * 0.34} ${-bodyH * 0.50}, ${-bodyW * 0.46} ${-bodyH * 0.42}, ${-bodyW * 0.50} ${-bodyH * 0.30}
            C ${-bodyW * 0.56} ${-bodyH * 0.14}, ${-bodyW * 0.58} ${ bodyH * 0.04}, ${-bodyW * 0.54} ${ bodyH * 0.18}
            C ${-bodyW * 0.50} ${ bodyH * 0.32}, ${-bodyW * 0.40} ${ bodyH * 0.44}, ${-bodyW * 0.26} ${ bodyH * 0.50}
            C ${-bodyW * 0.12} ${ bodyH * 0.54}, ${ bodyW * 0.12} ${ bodyH * 0.54}, ${ bodyW * 0.26} ${ bodyH * 0.50}
            C ${ bodyW * 0.40} ${ bodyH * 0.44}, ${ bodyW * 0.50} ${ bodyH * 0.32}, ${ bodyW * 0.54} ${ bodyH * 0.18}
            C ${ bodyW * 0.58} ${ bodyH * 0.04}, ${ bodyW * 0.56} ${-bodyH * 0.14}, ${ bodyW * 0.50} ${-bodyH * 0.30}
            C ${ bodyW * 0.46} ${-bodyH * 0.40}, ${ bodyW * 0.36} ${-bodyH * 0.44}, ${ bodyW * 0.24} ${-bodyH * 0.36}
            C ${ bodyW * 0.16} ${-bodyH * 0.30}, ${ bodyW * 0.10} ${-bodyH * 0.36}, 0 ${-bodyH * 0.34}
            C ${-bodyW * 0.10} ${-bodyH * 0.32}, ${-bodyW * 0.14} ${-bodyH * 0.42}, ${-bodyW * 0.18} ${-bodyH * 0.46}
            Z
          `} fill="url(#wg-wood)" stroke="rgba(0, 0, 0, 0.95)" strokeWidth={3} />

          {/* Body gloss highlight */}
          <ellipse cx={-bodyW * 0.06} cy={-bodyH * 0.10} rx={bodyW * 0.42} ry={bodyH * 0.36}
            fill="url(#wg-bodyGloss)" />

          {/* ── BRASS BINDING (outer + inner) ── */}
          <path d={`
            M ${-bodyW * 0.18} ${-bodyH * 0.46}
            C ${-bodyW * 0.34} ${-bodyH * 0.50}, ${-bodyW * 0.46} ${-bodyH * 0.42}, ${-bodyW * 0.50} ${-bodyH * 0.30}
            C ${-bodyW * 0.56} ${-bodyH * 0.14}, ${-bodyW * 0.58} ${ bodyH * 0.04}, ${-bodyW * 0.54} ${ bodyH * 0.18}
            C ${-bodyW * 0.50} ${ bodyH * 0.32}, ${-bodyW * 0.40} ${ bodyH * 0.44}, ${-bodyW * 0.26} ${ bodyH * 0.50}
            C ${-bodyW * 0.12} ${ bodyH * 0.54}, ${ bodyW * 0.12} ${ bodyH * 0.54}, ${ bodyW * 0.26} ${ bodyH * 0.50}
            C ${ bodyW * 0.40} ${ bodyH * 0.44}, ${ bodyW * 0.50} ${ bodyH * 0.32}, ${ bodyW * 0.54} ${ bodyH * 0.18}
            C ${ bodyW * 0.58} ${ bodyH * 0.04}, ${ bodyW * 0.56} ${-bodyH * 0.14}, ${ bodyW * 0.50} ${-bodyH * 0.30}
            C ${ bodyW * 0.46} ${-bodyH * 0.40}, ${ bodyW * 0.36} ${-bodyH * 0.44}, ${ bodyW * 0.24} ${-bodyH * 0.36}
            C ${ bodyW * 0.16} ${-bodyH * 0.30}, ${ bodyW * 0.10} ${-bodyH * 0.36}, 0 ${-bodyH * 0.34}
            C ${-bodyW * 0.10} ${-bodyH * 0.32}, ${-bodyW * 0.14} ${-bodyH * 0.42}, ${-bodyW * 0.18} ${-bodyH * 0.46}
            Z
          `} fill="none" stroke={silverColor} strokeWidth={4} opacity={0.92} />
          <path d={`
            M ${-bodyW * 0.18} ${-bodyH * 0.46}
            C ${-bodyW * 0.34} ${-bodyH * 0.50}, ${-bodyW * 0.46} ${-bodyH * 0.42}, ${-bodyW * 0.50} ${-bodyH * 0.30}
            C ${-bodyW * 0.56} ${-bodyH * 0.14}, ${-bodyW * 0.58} ${ bodyH * 0.04}, ${-bodyW * 0.54} ${ bodyH * 0.18}
            C ${-bodyW * 0.50} ${ bodyH * 0.32}, ${-bodyW * 0.40} ${ bodyH * 0.44}, ${-bodyW * 0.26} ${ bodyH * 0.50}
            C ${-bodyW * 0.12} ${ bodyH * 0.54}, ${ bodyW * 0.12} ${ bodyH * 0.54}, ${ bodyW * 0.26} ${ bodyH * 0.50}
            C ${ bodyW * 0.40} ${ bodyH * 0.44}, ${ bodyW * 0.50} ${ bodyH * 0.32}, ${ bodyW * 0.54} ${ bodyH * 0.18}
            C ${ bodyW * 0.58} ${ bodyH * 0.04}, ${ bodyW * 0.56} ${-bodyH * 0.14}, ${ bodyW * 0.50} ${-bodyH * 0.30}
            C ${ bodyW * 0.46} ${-bodyH * 0.40}, ${ bodyW * 0.36} ${-bodyH * 0.44}, ${ bodyW * 0.24} ${-bodyH * 0.36}
            C ${ bodyW * 0.16} ${-bodyH * 0.30}, ${ bodyW * 0.10} ${-bodyH * 0.36}, 0 ${-bodyH * 0.34}
            C ${-bodyW * 0.10} ${-bodyH * 0.32}, ${-bodyW * 0.14} ${-bodyH * 0.42}, ${-bodyW * 0.18} ${-bodyH * 0.46}
            Z
          `} fill="none" stroke={silverBright} strokeWidth={1.4} opacity={0.85} />

          {/* ── WOOD GRAIN HORIZONTAL (subtle maple striations) ── */}
          {Array.from({ length: 16 }).map((_, i) => {
            const y = -bodyH * 0.40 + i * (bodyH * 0.054);
            return (
              <line key={`grain-${i}`} x1={-bodyW * 0.46} y1={y} x2={bodyW * 0.46}
                y2={y + (i % 2 === 0 ? 1.5 : -1.5)}
                stroke={`rgba(120, 150, 200, ${0.10 + (i % 3) * 0.05})`} strokeWidth={0.5} />
            );
          })}

          {/* ── WOLF HEAD INLAY — large, center of upper bout ── */}
          <g transform={`translate(${bodyW * 0.04} ${-bodyH * 0.16}) scale(2.2)`}>
            {/* Inlay backing plate (mother of pearl base) */}
            <ellipse cx={0} cy={0} rx={26} ry={28}
              fill="rgba(220, 230, 250, 0.20)" stroke={silverColor} strokeWidth={0.8} />
            {/* Wolf head outline — squared muzzle, pointed ears */}
            <path d="M 0 -22 Q -16 -22 -20 -10 Q -24 4 -18 18 Q -10 26 0 26 Q 10 26 18 18 Q 24 4 20 -10 Q 16 -22 0 -22 Z"
              fill="rgba(220, 230, 250, 0.75)" stroke={silverDeep} strokeWidth={1.0} />
            {/* Inner head shading */}
            <path d="M 0 -18 Q -12 -18 -16 -8 Q -18 4 -14 14 Q -8 22 0 22"
              fill="none" stroke={silverDeep} strokeWidth={0.6} opacity={0.7} />
            {/* Ear left (pricked, triangular) */}
            <path d="M -14 -16 L -22 -28 L -10 -18 Z"
              fill={silverBright} stroke={silverDeep} strokeWidth={0.6} />
            <path d="M -14 -18 L -18 -24 L -12 -20 Z" fill={silverDeep} opacity={0.6} />
            {/* Ear right */}
            <path d="M 14 -16 L 22 -28 L 10 -18 Z"
              fill={silverBright} stroke={silverDeep} strokeWidth={0.6} />
            <path d="M 14 -18 L 18 -24 L 12 -20 Z" fill={silverDeep} opacity={0.6} />
            {/* Forehead highlight */}
            <path d="M -6 -14 Q 0 -18 6 -14" stroke={silverBright} strokeWidth={0.8} fill="none" opacity={0.85} />
            {/* Snout — protruding muzzle */}
            <path d="M -7 8 Q -8 14 -5 18 L 5 18 Q 8 14 7 8 L 4 6 L -4 6 Z"
              fill="rgba(200, 215, 240, 0.92)" stroke={silverDeep} strokeWidth={0.6} />
            {/* Nose */}
            <ellipse cx={0} cy={10} rx={2.0} ry={1.4} fill="rgba(20, 30, 50, 0.95)" />
            <circle cx={-0.5} cy={9.5} r={0.5} fill="rgba(200, 220, 250, 0.85)" />
            {/* Mouth line */}
            <line x1={0} y1={12} x2={0} y2={17} stroke="rgba(20, 30, 50, 0.85)" strokeWidth={0.5} />
            <path d="M 0 17 Q -3 18 -5 17" stroke="rgba(20, 30, 50, 0.85)" strokeWidth={0.5} fill="none" />
            <path d="M 0 17 Q 3 18 5 17" stroke="rgba(20, 30, 50, 0.85)" strokeWidth={0.5} fill="none" />
            {/* Fang hints */}
            <path d="M -2 18 L -1.6 20 L -1.2 18 Z" fill="rgba(220, 230, 250, 0.95)" />
            <path d="M 2 18 L 1.6 20 L 1.2 18 Z" fill="rgba(220, 230, 250, 0.95)" />
            {/* Eyes — almond-shaped, glowing */}
            <ellipse cx={-7} cy={-2} rx={3.4} ry={2.0} fill="rgba(20, 30, 50, 0.95)"
              transform="rotate(-15 -7 -2)" />
            <ellipse cx={7} cy={-2} rx={3.4} ry={2.0} fill="rgba(20, 30, 50, 0.95)"
              transform="rotate(15 7 -2)" />
            {/* Eye glow — energy-driven */}
            <circle cx={-7} cy={-2} r={1.6} fill={tintCore} opacity={0.8 + eyeGlow * 0.2} />
            <circle cx={7} cy={-2} r={1.6} fill={tintCore} opacity={0.8 + eyeGlow * 0.2} />
            <circle cx={-6.5} cy={-2.5} r={0.5} fill="rgba(255, 255, 255, 0.95)" />
            <circle cx={7.5} cy={-2.5} r={0.5} fill="rgba(255, 255, 255, 0.95)" />
            {/* Onset eye flash */}
            {flash > 0 && (
              <>
                <circle cx={-7} cy={-2} r={5 + flash * 5} fill={tintCore} opacity={flash * 0.65} />
                <circle cx={7} cy={-2} r={5 + flash * 5} fill={tintCore} opacity={flash * 0.65} />
              </>
            )}
            {/* Whiskers */}
            <line x1={-5} y1={11} x2={-14} y2={12} stroke={silverColor} strokeWidth={0.4} />
            <line x1={-5} y1={13} x2={-14} y2={15} stroke={silverColor} strokeWidth={0.4} />
            <line x1={-5} y1={15} x2={-13} y2={17} stroke={silverColor} strokeWidth={0.4} />
            <line x1={5} y1={11} x2={14} y2={12} stroke={silverColor} strokeWidth={0.4} />
            <line x1={5} y1={13} x2={14} y2={15} stroke={silverColor} strokeWidth={0.4} />
            <line x1={5} y1={15} x2={13} y2={17} stroke={silverColor} strokeWidth={0.4} />
            {/* Fur tufts on the sides */}
            <path d="M -18 -2 Q -22 0 -20 4" stroke={silverColor} strokeWidth={0.5} fill="none" />
            <path d="M -18 4 Q -22 6 -20 10" stroke={silverColor} strokeWidth={0.5} fill="none" />
            <path d="M 18 -2 Q 22 0 20 4" stroke={silverColor} strokeWidth={0.5} fill="none" />
            <path d="M 18 4 Q 22 6 20 10" stroke={silverColor} strokeWidth={0.5} fill="none" />
          </g>

          {/* ── LIGHTNING BOLT INLAY — lower bout, diagonal ── */}
          <g transform={`translate(${-bodyW * 0.22} ${bodyH * 0.16})`}>
            {/* Lightning bolt path */}
            <path d="M 0 -18 L 8 -4 L 2 -4 L 10 14 L 0 2 L 6 2 Z"
              fill={silverBright} stroke={silverDeep} strokeWidth={0.8} />
            <path d="M 0 -18 L 8 -4 L 2 -4 L 10 14 L 0 2 L 6 2 Z"
              fill="none" stroke={tintCore} strokeWidth={0.4} opacity={0.8} />
            {/* Glow around bolt */}
            <path d="M 0 -18 L 8 -4 L 2 -4 L 10 14 L 0 2 L 6 2 Z"
              fill="none" stroke={tintCore} strokeWidth={2} opacity={0.25 * eyeGlow} />
          </g>

          {/* ── PICKUPS (3 humbuckers) ── */}
          {[bodyH * 0.10, bodyH * 0.22, bodyH * 0.34].map((py, i) => (
            <g key={`pu-${i}`}>
              {/* Pickup ring */}
              <rect x={-bodyW * 0.22} y={py - 8} width={bodyW * 0.44} height={18} rx={2}
                fill="rgba(15, 18, 28, 0.95)" stroke={silverColor} strokeWidth={1.2} />
              {/* Pickup body */}
              <rect x={-bodyW * 0.20} y={py - 6} width={bodyW * 0.40} height={14} rx={1}
                fill="rgba(25, 30, 44, 0.92)" />
              {/* Silver cover plate */}
              <rect x={-bodyW * 0.19} y={py - 5} width={bodyW * 0.38} height={12} rx={0.5}
                fill="url(#wg-silver)" opacity={0.55} />
              {/* Pole pieces (6 pairs for humbucker) */}
              {Array.from({ length: 6 }).map((_, j) => (
                <g key={`pole-${i}-${j}`}>
                  <circle cx={-bodyW * 0.16 + j * (bodyW * 0.064)} cy={py - 1.5} r={1.6}
                    fill="rgba(15, 18, 28, 0.95)" />
                  <circle cx={-bodyW * 0.16 + j * (bodyW * 0.064)} cy={py - 1.5} r={1.1}
                    fill={silverBright} opacity={0.92} />
                  <circle cx={-bodyW * 0.16 + j * (bodyW * 0.064)} cy={py + 2.5} r={1.6}
                    fill="rgba(15, 18, 28, 0.95)" />
                  <circle cx={-bodyW * 0.16 + j * (bodyW * 0.064)} cy={py + 2.5} r={1.1}
                    fill={silverBright} opacity={0.92} />
                </g>
              ))}
              {/* Mounting screws */}
              <circle cx={-bodyW * 0.21} cy={py + 1} r={1.2} fill={silverColor} />
              <circle cx={bodyW * 0.21} cy={py + 1} r={1.2} fill={silverColor} />
            </g>
          ))}

          {/* ── BRIDGE + TAILPIECE ── */}
          <rect x={-bodyW * 0.16} y={bodyH * 0.42} width={bodyW * 0.32} height={10} rx={1.5}
            fill="rgba(15, 18, 28, 0.95)" stroke={silverColor} strokeWidth={0.8} />
          <rect x={-bodyW * 0.15} y={bodyH * 0.422} width={bodyW * 0.30} height={8} rx={1}
            fill="url(#wg-silver)" opacity={0.85} />
          {/* Saddles */}
          {Array.from({ length: 6 }).map((_, i) => (
            <g key={`saddle-${i}`}>
              <rect x={-bodyW * 0.13 + i * (bodyW * 0.052)} y={bodyH * 0.43} width={4.5} height={6}
                fill={silverBright} stroke="rgba(20, 30, 50, 0.85)" strokeWidth={0.4} />
              <line x1={-bodyW * 0.128 + i * (bodyW * 0.052) + 2.25} y1={bodyH * 0.432}
                x2={-bodyW * 0.128 + i * (bodyW * 0.052) + 2.25} y2={bodyH * 0.448}
                stroke="rgba(20, 30, 50, 0.65)" strokeWidth={0.4} />
            </g>
          ))}
          {/* Tailpiece */}
          <rect x={-bodyW * 0.18} y={bodyH * 0.455} width={bodyW * 0.36} height={7} rx={1}
            fill="url(#wg-silver)" stroke="rgba(20, 30, 50, 0.85)" strokeWidth={0.6} />
          {Array.from({ length: 6 }).map((_, i) => (
            <circle key={`anchor-${i}`} cx={-bodyW * 0.12 + i * (bodyW * 0.048)} cy={bodyH * 0.4585}
              r={1} fill="rgba(20, 30, 50, 0.95)" />
          ))}

          {/* ── KNOBS (5: master + tone + mid + 2 aux) ── */}
          {[
            [bodyW * 0.26, bodyH * 0.18],
            [bodyW * 0.32, bodyH * 0.28],
            [bodyW * 0.30, bodyH * 0.38],
            [-bodyW * 0.30, bodyH * 0.30],
            [-bodyW * 0.32, bodyH * 0.40],
          ].map((pos, i) => {
            const px = pos[0];
            const py = pos[1];
            return (
              <g key={`knob-${i}`}>
                <circle cx={px} cy={py} r={9} fill="rgba(15, 18, 28, 0.95)"
                  stroke={silverColor} strokeWidth={1.3} />
                <circle cx={px} cy={py} r={7} fill="url(#wg-silver)" opacity={0.95} />
                <circle cx={px} cy={py} r={7} fill="none" stroke={silverDeep} strokeWidth={0.5} />
                <circle cx={px} cy={py} r={2.5} fill="rgba(20, 30, 50, 0.85)" />
                <line x1={px} y1={py - 1} x2={px} y2={py - 6} stroke="rgba(20, 30, 50, 0.95)" strokeWidth={1.3} />
                {Array.from({ length: 11 }).map((_, k) => {
                  const a = -Math.PI * 0.75 + (k / 10) * Math.PI * 1.5;
                  const x1 = px + Math.cos(a) * 9;
                  const y1 = py + Math.sin(a) * 9;
                  const x2 = px + Math.cos(a) * 11;
                  const y2 = py + Math.sin(a) * 11;
                  return <line key={`tick-${i}-${k}`} x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={silverColor} strokeWidth={0.5} />;
                })}
              </g>
            );
          })}

          {/* ── PICKUP SELECTOR TOGGLE ── */}
          <g transform={`translate(${bodyW * 0.18} ${-bodyH * 0.06})`}>
            <circle cx={0} cy={0} r={5} fill="rgba(15, 18, 28, 0.95)" stroke={silverColor} strokeWidth={0.9} />
            <circle cx={0} cy={0} r={3.5} fill="url(#wg-silver)" />
            <line x1={0} y1={0} x2={2.4} y2={-2.4} stroke="rgba(20, 30, 50, 0.95)" strokeWidth={1.6}
              strokeLinecap="round" />
            <circle cx={2.4} cy={-2.4} r={1.2} fill={silverBright} />
          </g>

          {/* ── INPUT JACK ── */}
          <g transform={`translate(${bodyW * 0.42} ${bodyH * 0.20})`}>
            <rect x={-4} y={-4} width={8} height={8} rx={1} fill="url(#wg-silver)" stroke={silverDeep} strokeWidth={0.6} />
            <circle cx={0} cy={0} r={2} fill="rgba(15, 18, 28, 0.95)" />
            <circle cx={0} cy={0} r={1} fill="rgba(40, 50, 70, 0.95)" />
          </g>

          {/* ── NECK JOINT (heel) ── */}
          <rect x={-neckW * 0.7} y={-bodyH * 0.46} width={neckW * 1.4} height={14}
            fill="url(#wg-neck)" stroke="rgba(0, 0, 0, 0.95)" strokeWidth={1.4} />
          <line x1={-neckW * 0.7} y1={-bodyH * 0.46 + 4} x2={neckW * 0.7} y2={-bodyH * 0.46 + 4}
            stroke={silverColor} strokeWidth={0.6} opacity={0.65} />

        </g>

        {/* ─── NECK + FRETBOARD + HEADSTOCK (absolute frame coords) ─── */}
        <g>
          {/* Neck back */}
          <rect x={cx - neckW / 2 - 1} y={neckTopY} width={neckW + 2} height={neckLen + 14}
            fill="url(#wg-neck)" stroke="rgba(0, 0, 0, 0.98)" strokeWidth={1.6} />
          {/* Subtle highlight stripe on neck */}
          <rect x={cx - neckW / 2 + 2} y={neckTopY + 2} width={2} height={neckLen + 10}
            fill={`rgba(180, 200, 240, ${0.25 + moonlight * 0.15})`} />

          {/* Fretboard */}
          <rect x={cx - neckW * 0.42} y={neckTopY + 4} width={neckW * 0.84} height={neckLen + 6}
            fill="url(#wg-fretboard)" stroke="rgba(0, 0, 0, 0.85)" strokeWidth={0.8} />

          {/* Frets (22) */}
          {Array.from({ length: 22 }).map((_, i) => {
            const fy = neckTopY + 4 + (i + 1) * (neckLen / 22);
            return (
              <g key={`fret-${i}`}>
                <line x1={cx - neckW * 0.42} y1={fy} x2={cx + neckW * 0.42} y2={fy}
                  stroke={silverBright} strokeWidth={1.4} />
                <line x1={cx - neckW * 0.42} y1={fy + 0.6} x2={cx + neckW * 0.42} y2={fy + 0.6}
                  stroke={silverDeep} strokeWidth={0.4} />
              </g>
            );
          })}

          {/* Inlays — pearl dots at frets 3, 5, 7, 9, 12 (double), 15, 17, 19 */}
          {[3, 5, 7, 9, 12, 12, 15, 17, 19].map((fretNum, i) => {
            const fretSpacing = neckLen / 22;
            const fy = neckTopY + 4 + (fretNum - 0.5) * fretSpacing;
            const isDouble12First = fretNum === 12 && i === 4;
            const isDouble12Second = fretNum === 12 && i === 5;
            const offset = isDouble12First ? -neckW * 0.18 : isDouble12Second ? neckW * 0.18 : 0;
            return (
              <g key={`inlay-${i}`}>
                <circle cx={cx + offset} cy={fy - 1} r={3.2}
                  fill="rgba(240, 245, 255, 0.92)"
                  stroke="rgba(80, 100, 140, 0.6)" strokeWidth={0.4} />
                <circle cx={cx + offset - 0.6} cy={fy - 1.6} r={1.0}
                  fill="rgba(255, 255, 255, 0.95)" />
              </g>
            );
          })}

          {/* ── STRINGS (6) — vibrating ── */}
          {Array.from({ length: 6 }).map((_, i) => {
            const xBase = cx - neckW * 0.30 + i * (neckW * 0.12);
            const vib = stringVib(i);
            return (
              <g key={`str-${i}`}>
                <line x1={xBase + 0.6} y1={neckTopY + 4} x2={xBase + 0.6}
                  y2={bodyCY + bodyH * 0.46} stroke="rgba(0, 0, 0, 0.7)" strokeWidth={0.8 + i * 0.15} />
                <line x1={xBase + vib * 0.4} y1={neckTopY + 4} x2={xBase}
                  y2={bodyCY + bodyH * 0.46}
                  stroke="rgba(220, 230, 250, 0.92)" strokeWidth={0.7 + i * 0.18} />
                <line x1={xBase + vib * 0.4} y1={neckTopY + 4} x2={xBase}
                  y2={bodyCY + bodyH * 0.46}
                  stroke={tintCore} strokeWidth={0.3} opacity={0.5 + 0.4 * snap.beatDecay} />
              </g>
            );
          })}

          {/* ── HEADSTOCK — Doug Irwin shape ── */}
          {/* Headstock shadow */}
          <path d={`
            M ${cx - neckW * 0.50} ${neckTopY + 6}
            Q ${cx - neckW * 1.10} ${neckTopY - headstockH * 0.35} ${cx - neckW * 0.85} ${headstockTopY + headstockH * 0.30}
            Q ${cx - neckW * 0.40} ${headstockTopY - 4} 0 ${headstockTopY + 8}
            L ${cx} ${headstockTopY + 8}
            Q ${cx + neckW * 0.40} ${headstockTopY - 4} ${cx + neckW * 0.85} ${headstockTopY + headstockH * 0.30}
            Q ${cx + neckW * 1.10} ${neckTopY - headstockH * 0.35} ${cx + neckW * 0.50} ${neckTopY + 6}
            Z
          `} fill="rgba(0, 0, 0, 0.55)" transform={`translate(4 4)`} />

          {/* Headstock body */}
          <path d={`
            M ${cx - neckW * 0.50} ${neckTopY + 6}
            Q ${cx - neckW * 1.10} ${neckTopY - headstockH * 0.35} ${cx - neckW * 0.85} ${headstockTopY + headstockH * 0.30}
            Q ${cx - neckW * 0.40} ${headstockTopY - 4} ${cx} ${headstockTopY + 8}
            Q ${cx + neckW * 0.40} ${headstockTopY - 4} ${cx + neckW * 0.85} ${headstockTopY + headstockH * 0.30}
            Q ${cx + neckW * 1.10} ${neckTopY - headstockH * 0.35} ${cx + neckW * 0.50} ${neckTopY + 6}
            Z
          `} fill="url(#wg-neck)" stroke="rgba(0, 0, 0, 0.98)" strokeWidth={2} />

          {/* Headstock face highlight */}
          <path d={`
            M ${cx - neckW * 0.40} ${neckTopY + 4}
            Q ${cx - neckW * 0.95} ${neckTopY - headstockH * 0.30} ${cx - neckW * 0.75} ${headstockTopY + headstockH * 0.32}
            Q ${cx - neckW * 0.36} ${headstockTopY} ${cx} ${headstockTopY + 12}
          `} fill="none" stroke={`rgba(180, 210, 250, ${0.40 + moonlight * 0.20})`} strokeWidth={1.2} />

          {/* Silver logo plate "WOLF / DOUG IRWIN" */}
          <rect x={cx - neckW * 0.55} y={headstockTopY + headstockH * 0.45}
            width={neckW * 1.10} height={14} rx={1.5}
            fill="url(#wg-silver)" stroke="rgba(20, 30, 50, 0.85)" strokeWidth={0.8} />
          <text x={cx} y={headstockTopY + headstockH * 0.45 + 10}
            textAnchor="middle" fontSize={9} fontFamily="Georgia, serif" fontWeight={900}
            fill="rgba(20, 30, 50, 0.95)" letterSpacing={1.4}>D.IRWIN</text>

          {/* Truss rod cover */}
          <rect x={cx - neckW * 0.20} y={neckTopY - 4} width={neckW * 0.40} height={10} rx={1}
            fill="url(#wg-silver)" stroke="rgba(20, 30, 50, 0.85)" strokeWidth={0.5} />
          <circle cx={cx - neckW * 0.14} cy={neckTopY + 1} r={0.8} fill="rgba(20, 30, 50, 0.95)" />
          <circle cx={cx + neckW * 0.14} cy={neckTopY + 1} r={0.8} fill="rgba(20, 30, 50, 0.95)" />

          {/* Tuning pegs (3 per side) */}
          {Array.from({ length: 6 }).map((_, i) => {
            const side = i < 3 ? -1 : 1;
            const idx = i % 3;
            const px = cx + side * neckW * 0.95;
            const py = headstockTopY + headstockH * 0.18 + idx * (headstockH * 0.18);
            return (
              <g key={`tuner-${i}`}>
                {/* Post on the headstock face */}
                <circle cx={cx + side * neckW * 0.40} cy={py} r={3.5}
                  fill="rgba(10, 14, 22, 0.98)" stroke={silverColor} strokeWidth={0.8} />
                <circle cx={cx + side * neckW * 0.40} cy={py} r={1.8}
                  fill={silverBright} />
                <circle cx={cx + side * neckW * 0.40} cy={py} r={1.0}
                  fill="rgba(220, 230, 250, 0.85)" />
                {/* Tuner button */}
                <ellipse cx={px} cy={py} rx={6} ry={3.5}
                  fill="url(#wg-silver)" stroke="rgba(20, 30, 50, 0.85)" strokeWidth={0.6} />
                <ellipse cx={px} cy={py} rx={3} ry={1.6}
                  fill={silverDeep} opacity={0.7} />
                <line x1={cx + side * neckW * 0.45} y1={py} x2={px - side * 5} y2={py}
                  stroke={silverDeep} strokeWidth={1} />
              </g>
            );
          })}

          {/* Decorative scroll at the top */}
          <path d={`M ${cx - neckW * 0.20} ${headstockTopY + 6}
            Q ${cx} ${headstockTopY - 2} ${cx + neckW * 0.20} ${headstockTopY + 6}`}
            stroke={silverColor} strokeWidth={1.4} fill="none" />
          <circle cx={cx} cy={headstockTopY + 4} r={1.8} fill={silverBright} />
        </g>

        {/* ── ONSET FLASH ON WOLF EYES (silhouette) ── */}
        {flash > 0 && (
          <ellipse cx={cx + bodyW * 0.04} cy={bodyCY - bodyH * 0.16}
            rx={48 + flash * 26} ry={48 + flash * 26}
            fill={tintCore} opacity={flash * 0.50} style={{ mixBlendMode: "screen" }} />
        )}

        {/* ── MIST MOTES IN MOONLIGHT ── */}
        <g style={{ mixBlendMode: "screen" }}>
          {mist.map((d, i) => {
            const t = frame * d.speed * tempoFactor + d.phase;
            const px = (d.x + Math.sin(t * 1.2) * 0.04) * width;
            const py = (d.y + Math.sin(t * 0.6) * 0.02) * height;
            const flicker = 0.5 + Math.sin(t * 2.4) * 0.4;
            const distFromCenter = Math.abs(px - cx) / (width * 0.5);
            const moonlightBoost = Math.max(0, 1 - distFromCenter * 1.4);
            return (
              <circle key={`mist-${i}`} cx={px} cy={py} r={d.r * (0.8 + moonlight * 0.5)}
                fill={tintCore} opacity={(0.30 + moonlightBoost * 0.45) * flicker * moonlight} />
            );
          })}
        </g>

        {/* ── VIGNETTE ── */}
        <rect width={width} height={height} fill="url(#wg-vig)" />
      </svg>
    </div>
  );
};
