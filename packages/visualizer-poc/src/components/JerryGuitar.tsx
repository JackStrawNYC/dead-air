/**
 * JerryGuitar — A+++ overlay: Jerry Garcia's "Tiger" Doug Irwin guitar.
 * Hero object on a velvet stage with cinematic spotlight reverence. The Tiger
 * is the centerpiece — taking up ~55% of the frame width and ~70% of the frame
 * height — with brass binding, carved tiger inlay, double-cutaway body, three
 * pickups, brass knobs, ornate Doug Irwin headstock, vibrating strings, and
 * rich woodgrain. Velvet stage curtain backdrop with folds, spotlight cone
 * from above, dust motes catching light, brass plaque below.
 *
 * Audio reactivity:
 *   slowEnergy → spotlight warmth + drape glow
 *   energy → brass shimmer + inlay flash
 *   bass → low-end string sustain
 *   beatDecay → string vibration amplitude
 *   onsetEnvelope → brass inlay flash burst
 *   chromaHue → warm amber/red palette tint
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
const DUST_COUNT = 90;
const DRAPE_FOLDS = 18;
const TIGER_STRIPE_COUNT = 14;

interface DustMote { x: number; y: number; r: number; speed: number; phase: number; }
interface TigerStripe { y: number; amp: number; phase: number; width: number; }

function buildDust(): DustMote[] {
  const rng = seeded(22_741_809);
  return Array.from({ length: DUST_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.92,
    r: 0.6 + rng() * 1.9,
    speed: 0.0006 + rng() * 0.0022,
    phase: rng() * Math.PI * 2,
  }));
}

function buildTigerStripes(): TigerStripe[] {
  const rng = seeded(31_882_447);
  return Array.from({ length: TIGER_STRIPE_COUNT }, (_, i) => ({
    y: -0.42 + (i / (TIGER_STRIPE_COUNT - 1)) * 0.84,
    amp: 0.04 + rng() * 0.05,
    phase: rng() * Math.PI * 2,
    width: 1.0 + rng() * 1.6,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const JerryGuitar: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const dust = React.useMemo(buildDust, []);
  const tigerStripes = React.useMemo(buildTigerStripes, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives
  const spotWarmth = interpolate(snap.slowEnergy, [0.02, 0.32], [0.20, 1.50], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const brassShimmer = interpolate(snap.energy, [0.02, 0.30], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sustain = interpolate(snap.bass, [0.0, 0.7], [0.30, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stringPulse = 1 + snap.beatDecay * 0.5;
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Warm amber palette modulated by chromaHue
  const baseHue = 32;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const tintLight = 62 + spotWarmth * 16;
  const tintColor = `hsl(${tintHue}, 76%, ${tintLight}%)`;
  const tintCore = `hsl(${tintHue}, 92%, ${Math.min(96, tintLight + 22)}%)`;
  const brassColor = `hsl(${(tintHue + 4) % 360}, 80%, ${66 + brassShimmer * 14}%)`;
  const brassDeep = `hsl(${(tintHue + 8) % 360}, 70%, 38%)`;
  const brassBright = `hsl(${(tintHue + 6) % 360}, 95%, ${78 + brassShimmer * 12}%)`;

  // ─── HERO GEOMETRY ─────────────────────────────────────────────────
  // The Tiger guitar is the visual centerpiece. Vertical orientation.
  // Body fills ~55% width × ~50% height; entire instrument (including
  // headstock + neck) reaches ~85% of frame height.
  const cx = width * 0.5;
  const cy = height * 0.50;

  const bodyW = width * 0.42;          // body width = 42% of frame width
  const bodyH = height * 0.46;         // body height = 46% of frame height
  const bodyCX = cx;
  const bodyCY = cy + height * 0.10;   // slightly below center to leave room for headstock

  const neckW = bodyW * 0.13;          // neck width
  const neckLen = height * 0.34;       // neck length
  const neckTopY = bodyCY - bodyH * 0.50 - neckLen;
  const headstockH = height * 0.12;
  const headstockTopY = neckTopY - headstockH;

  // String vibration
  const stringVib = (s: number) => Math.sin(frame * 0.55 * tempoFactor + s * 1.1) * (1.5 + snap.beatDecay * 3 + sustain * 1);

  // Velvet drape folds (background)
  const drapeFolds = Array.from({ length: DRAPE_FOLDS }, (_, i) => {
    const fx = (i / (DRAPE_FOLDS - 1)) * width;
    const wave = Math.sin(frame * 0.005 + i * 0.7) * 6;
    const foldW = width / DRAPE_FOLDS * 0.6;
    return (
      <path key={`fold-${i}`}
        d={`M ${fx + wave - foldW * 0.5} 0
            Q ${fx + wave} ${height * 0.50} ${fx + wave - foldW * 0.3} ${height}
            L ${fx + wave + foldW * 0.5} ${height}
            Q ${fx + wave + foldW * 0.7} ${height * 0.50} ${fx + wave + foldW * 0.5} 0 Z`}
        fill={`rgba(60, 12, 6, ${0.18 + (i % 2) * 0.10})`} />
    );
  });

  // Stage floor planks (suggesting audience/stage at bottom)
  const stagePlanks = Array.from({ length: 7 }, (_, i) => {
    const py = height * 0.93 + i * 4;
    return (
      <line key={`plank-${i}`} x1={0} y1={py} x2={width} y2={py}
        stroke={`rgba(20, 6, 2, ${0.6 - i * 0.06})`} strokeWidth={0.8} />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="jg-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a0604" />
            <stop offset="50%" stopColor="#2c0a06" />
            <stop offset="100%" stopColor="#100302" />
          </linearGradient>
          <linearGradient id="jg-velvet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a0a06" />
            <stop offset="50%" stopColor="#1c0402" />
            <stop offset="100%" stopColor="#0a0201" />
          </linearGradient>
          <linearGradient id="jg-spot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.55} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </linearGradient>
          <radialGradient id="jg-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.85} />
            <stop offset="50%" stopColor={tintColor} stopOpacity={0.20} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="jg-tigerWood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3a1606" />
            <stop offset="22%" stopColor="#7a3a0e" />
            <stop offset="48%" stopColor="#a05818" />
            <stop offset="55%" stopColor="#c46c1a" />
            <stop offset="62%" stopColor="#9a4e14" />
            <stop offset="82%" stopColor="#5a2808" />
            <stop offset="100%" stopColor="#260c02" />
          </linearGradient>
          <radialGradient id="jg-bodyGloss" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="rgba(255, 220, 160, 0.45)" />
            <stop offset="40%" stopColor="rgba(255, 200, 120, 0.18)" />
            <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
          </radialGradient>
          <linearGradient id="jg-brass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={brassBright} />
            <stop offset="50%" stopColor={brassColor} />
            <stop offset="100%" stopColor={brassDeep} />
          </linearGradient>
          <linearGradient id="jg-fretboard" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a0a02" />
            <stop offset="50%" stopColor="#0e0501" />
            <stop offset="100%" stopColor="#080301" />
          </linearGradient>
          <linearGradient id="jg-neck" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2a1206" />
            <stop offset="50%" stopColor="#5a2c0c" />
            <stop offset="100%" stopColor="#1c0a02" />
          </linearGradient>
          <radialGradient id="jg-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="jg-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id="jg-softBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        {/* ── BACKDROP LAYER ── */}
        <rect width={width} height={height} fill="url(#jg-bg)" />
        <rect width={width} height={height} fill="url(#jg-velvet)" />
        {drapeFolds}

        {/* ── SPOTLIGHT CONE FROM ABOVE ── */}
        <path d={`M ${cx - 60} 0 L ${cx + 60} 0 L ${cx + width * 0.35} ${height} L ${cx - width * 0.35} ${height} Z`}
          fill="url(#jg-spot)" style={{ mixBlendMode: "screen" }} />
        <path d={`M ${cx - 24} 0 L ${cx + 24} 0 L ${cx + width * 0.18} ${height} L ${cx - width * 0.18} ${height} Z`}
          fill={tintCore} opacity={0.16 * spotWarmth} style={{ mixBlendMode: "screen" }} />
        {/* Spotlight core glow at top */}
        <ellipse cx={cx} cy={0} rx={width * 0.10} ry={height * 0.04}
          fill={tintCore} opacity={0.55 * spotWarmth} filter="url(#jg-softBlur)" style={{ mixBlendMode: "screen" }} />

        {/* ── HALO BEHIND GUITAR ── */}
        <ellipse cx={bodyCX} cy={bodyCY - height * 0.06}
          rx={width * 0.40 * (0.9 + spotWarmth * 0.20) * stringPulse}
          ry={height * 0.50 * (0.9 + spotWarmth * 0.18) * stringPulse}
          fill="url(#jg-halo)" style={{ mixBlendMode: "screen" }} />

        {/* ── STAGE FLOOR / AUDIENCE EDGE ── */}
        <rect x={0} y={height * 0.94} width={width} height={height * 0.06} fill="rgba(0, 0, 0, 0.92)" />
        {stagePlanks}
        {/* Audience silhouette suggestion (heads at the bottom edge) */}
        {Array.from({ length: 16 }).map((_, i) => {
          const ax = (i + 0.5) * (width / 16);
          const ay = height * 0.97 + Math.sin(i * 1.7) * 2;
          return (
            <ellipse key={`aud-${i}`} cx={ax} cy={ay} rx={14 + (i % 3) * 4} ry={6 + (i % 2) * 2}
              fill="rgba(0, 0, 0, 0.95)" />
          );
        })}
        {/* Stage floor reflection of guitar (mirror hint) */}
        <ellipse cx={cx} cy={height * 0.94} rx={bodyW * 0.45} ry={6}
          fill={tintColor} opacity={0.18 * spotWarmth} filter="url(#jg-blur)" style={{ mixBlendMode: "screen" }} />

        {/* ── BRASS PLAQUE BELOW THE GUITAR ── */}
        <g transform={`translate(${cx} ${height * 0.91})`}>
          <rect x={-130} y={-10} width={260} height={26} rx={3} fill="url(#jg-brass)"
            stroke="rgba(40, 20, 4, 0.85)" strokeWidth={1.4} />
          <rect x={-126} y={-7} width={252} height={20} rx={2} fill="none"
            stroke={brassDeep} strokeWidth={0.7} opacity={0.65} />
          {/* Engraved divider lines */}
          <line x1={-110} y1={3} x2={110} y2={3} stroke="rgba(40, 20, 4, 0.65)" strokeWidth={0.6} />
          {/* Decorative scrollwork left */}
          <path d="M -100 3 Q -94 -3 -88 3 Q -82 9 -76 3" stroke={brassDeep} strokeWidth={0.8} fill="none" />
          {/* Decorative scrollwork right */}
          <path d="M 100 3 Q 94 -3 88 3 Q 82 9 76 3" stroke={brassDeep} strokeWidth={0.8} fill="none" />
          {/* "TIGER" engraving */}
          <text x={0} y={8} textAnchor="middle" fontSize={11} fontFamily="Georgia, serif"
            fontWeight={900} fill="rgba(40, 20, 4, 0.92)" letterSpacing={4}>TIGER</text>
          {/* Plaque screws */}
          <circle cx={-122} cy={3} r={1.8} fill="rgba(40, 20, 4, 0.95)" />
          <circle cx={122} cy={3} r={1.8} fill="rgba(40, 20, 4, 0.95)" />
          <circle cx={-122} cy={3} r={0.6} fill={brassBright} />
          <circle cx={122} cy={3} r={0.6} fill={brassBright} />
        </g>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ── THE TIGER GUITAR — HERO CENTERPIECE ── */}
        {/* ─────────────────────────────────────────────────────────── */}
        <g transform={`translate(${bodyCX} ${bodyCY})`}>

          {/* Body cast shadow */}
          <ellipse cx={8} cy={12} rx={bodyW * 0.50 + 8} ry={bodyH * 0.48 + 8}
            fill="rgba(0, 0, 0, 0.60)" filter="url(#jg-blur)" />

          {/* ── BODY: Tiger's distinctive double-cutaway shape ── */}
          {/* Smooth flowing curves for the iconic Doug Irwin silhouette */}
          <path d={`
            M ${-bodyW * 0.18} ${-bodyH * 0.46}
            C ${-bodyW * 0.34} ${-bodyH * 0.50}, ${-bodyW * 0.46} ${-bodyH * 0.42}, ${-bodyW * 0.50} ${-bodyH * 0.30}
            C ${-bodyW * 0.56} ${-bodyH * 0.18}, ${-bodyW * 0.58} ${-bodyH * 0.04}, ${-bodyW * 0.54} ${ bodyH * 0.10}
            C ${-bodyW * 0.50} ${ bodyH * 0.26}, ${-bodyW * 0.40} ${ bodyH * 0.40}, ${-bodyW * 0.26} ${ bodyH * 0.48}
            C ${-bodyW * 0.12} ${ bodyH * 0.52}, ${ bodyW * 0.12} ${ bodyH * 0.52}, ${ bodyW * 0.26} ${ bodyH * 0.48}
            C ${ bodyW * 0.40} ${ bodyH * 0.40}, ${ bodyW * 0.50} ${ bodyH * 0.26}, ${ bodyW * 0.54} ${ bodyH * 0.10}
            C ${ bodyW * 0.58} ${-bodyH * 0.04}, ${ bodyW * 0.56} ${-bodyH * 0.18}, ${ bodyW * 0.50} ${-bodyH * 0.30}
            C ${ bodyW * 0.46} ${-bodyH * 0.42}, ${ bodyW * 0.34} ${-bodyH * 0.50}, ${ bodyW * 0.18} ${-bodyH * 0.46}
            C ${ bodyW * 0.10} ${-bodyH * 0.42}, ${ bodyW * 0.06} ${-bodyH * 0.36}, 0 ${-bodyH * 0.36}
            C ${-bodyW * 0.06} ${-bodyH * 0.36}, ${-bodyW * 0.10} ${-bodyH * 0.42}, ${-bodyW * 0.18} ${-bodyH * 0.46}
            Z
          `} fill="url(#jg-tigerWood)" stroke="rgba(0, 0, 0, 0.95)" strokeWidth={3} />

          {/* Body gloss highlight (rounded carve depth) */}
          <ellipse cx={-bodyW * 0.06} cy={-bodyH * 0.10} rx={bodyW * 0.42} ry={bodyH * 0.36}
            fill="url(#jg-bodyGloss)" />

          {/* ── BRASS BINDING (outer + inner doubled lines) ── */}
          <path d={`
            M ${-bodyW * 0.18} ${-bodyH * 0.46}
            C ${-bodyW * 0.34} ${-bodyH * 0.50}, ${-bodyW * 0.46} ${-bodyH * 0.42}, ${-bodyW * 0.50} ${-bodyH * 0.30}
            C ${-bodyW * 0.56} ${-bodyH * 0.18}, ${-bodyW * 0.58} ${-bodyH * 0.04}, ${-bodyW * 0.54} ${ bodyH * 0.10}
            C ${-bodyW * 0.50} ${ bodyH * 0.26}, ${-bodyW * 0.40} ${ bodyH * 0.40}, ${-bodyW * 0.26} ${ bodyH * 0.48}
            C ${-bodyW * 0.12} ${ bodyH * 0.52}, ${ bodyW * 0.12} ${ bodyH * 0.52}, ${ bodyW * 0.26} ${ bodyH * 0.48}
            C ${ bodyW * 0.40} ${ bodyH * 0.40}, ${ bodyW * 0.50} ${ bodyH * 0.26}, ${ bodyW * 0.54} ${ bodyH * 0.10}
            C ${ bodyW * 0.58} ${-bodyH * 0.04}, ${ bodyW * 0.56} ${-bodyH * 0.18}, ${ bodyW * 0.50} ${-bodyH * 0.30}
            C ${ bodyW * 0.46} ${-bodyH * 0.42}, ${ bodyW * 0.34} ${-bodyH * 0.50}, ${ bodyW * 0.18} ${-bodyH * 0.46}
            C ${ bodyW * 0.10} ${-bodyH * 0.42}, ${ bodyW * 0.06} ${-bodyH * 0.36}, 0 ${-bodyH * 0.36}
            C ${-bodyW * 0.06} ${-bodyH * 0.36}, ${-bodyW * 0.10} ${-bodyH * 0.42}, ${-bodyW * 0.18} ${-bodyH * 0.46}
            Z
          `} fill="none" stroke={brassColor} strokeWidth={4} opacity={0.92} />
          <path d={`
            M ${-bodyW * 0.18} ${-bodyH * 0.46}
            C ${-bodyW * 0.34} ${-bodyH * 0.50}, ${-bodyW * 0.46} ${-bodyH * 0.42}, ${-bodyW * 0.50} ${-bodyH * 0.30}
            C ${-bodyW * 0.56} ${-bodyH * 0.18}, ${-bodyW * 0.58} ${-bodyH * 0.04}, ${-bodyW * 0.54} ${ bodyH * 0.10}
            C ${-bodyW * 0.50} ${ bodyH * 0.26}, ${-bodyW * 0.40} ${ bodyH * 0.40}, ${-bodyW * 0.26} ${ bodyH * 0.48}
            C ${-bodyW * 0.12} ${ bodyH * 0.52}, ${ bodyW * 0.12} ${ bodyH * 0.52}, ${ bodyW * 0.26} ${ bodyH * 0.48}
            C ${ bodyW * 0.40} ${ bodyH * 0.40}, ${ bodyW * 0.50} ${ bodyH * 0.26}, ${ bodyW * 0.54} ${ bodyH * 0.10}
            C ${ bodyW * 0.58} ${-bodyH * 0.04}, ${ bodyW * 0.56} ${-bodyH * 0.18}, ${ bodyW * 0.50} ${-bodyH * 0.30}
            C ${ bodyW * 0.46} ${-bodyH * 0.42}, ${ bodyW * 0.34} ${-bodyH * 0.50}, ${ bodyW * 0.18} ${-bodyH * 0.46}
            C ${ bodyW * 0.10} ${-bodyH * 0.42}, ${ bodyW * 0.06} ${-bodyH * 0.36}, 0 ${-bodyH * 0.36}
            C ${-bodyW * 0.06} ${-bodyH * 0.36}, ${-bodyW * 0.10} ${-bodyH * 0.42}, ${-bodyW * 0.18} ${-bodyH * 0.46}
            Z
          `} fill="none" stroke={brassBright} strokeWidth={1.4} opacity={0.85} />

          {/* ── TIGER STRIPE INLAY (carved orange/black tiger pattern) ── */}
          {tigerStripes.map((s, i) => {
            const sy = s.y * bodyH;
            const ampPx = s.amp * bodyH;
            const reach = bodyW * 0.42;
            return (
              <g key={`stripe-${i}`}>
                {/* Black stripe — carved channel */}
                <path d={`M ${-reach} ${sy}
                          Q ${-reach * 0.5} ${sy + ampPx} 0 ${sy - ampPx * 0.6}
                          Q ${reach * 0.5} ${sy + ampPx * 0.8} ${reach} ${sy - ampPx * 0.4}`}
                  stroke="rgba(20, 8, 2, 0.78)" strokeWidth={s.width * 2.2} fill="none" strokeLinecap="round" />
                {/* Orange highlight on top of stripe */}
                <path d={`M ${-reach} ${sy}
                          Q ${-reach * 0.5} ${sy + ampPx} 0 ${sy - ampPx * 0.6}
                          Q ${reach * 0.5} ${sy + ampPx * 0.8} ${reach} ${sy - ampPx * 0.4}`}
                  stroke={`hsl(${tintHue}, 95%, 60%)`} strokeWidth={s.width * 0.7} fill="none"
                  strokeLinecap="round" opacity={0.65} />
              </g>
            );
          })}

          {/* ── CENTER MEDALLION (eagle/tiger crest inlay) ── */}
          <g transform={`translate(0 ${-bodyH * 0.06})`}>
            {/* Outer brass shield */}
            <path d={`M -42 -34 Q -50 0 -34 32 L 0 44 L 34 32 Q 50 0 42 -34 L 0 -42 Z`}
              fill="rgba(220, 180, 100, 0.22)" stroke={brassColor} strokeWidth={2.6} />
            {/* Inner shield */}
            <path d={`M -34 -28 Q -40 0 -28 26 L 0 36 L 28 26 Q 40 0 34 -28 L 0 -34 Z`}
              fill="none" stroke={brassBright} strokeWidth={1.0} opacity={0.85} />
            {/* Eagle wings spread */}
            <path d="M -34 -10 Q -22 -22 -10 -10 L -4 -2 L 0 -8 L 4 -2 L 10 -10 Q 22 -22 34 -10"
              stroke={brassColor} strokeWidth={2.2} fill="none" strokeLinecap="round" />
            <path d="M -28 -6 Q -18 -14 -8 -6" stroke={brassBright} strokeWidth={1} fill="none" />
            <path d="M 28 -6 Q 18 -14 8 -6" stroke={brassBright} strokeWidth={1} fill="none" />
            {/* Eagle body */}
            <ellipse cx={0} cy={2} rx={7} ry={13} fill={brassColor} opacity={0.92} />
            <ellipse cx={0} cy={2} rx={4} ry={9} fill={brassBright} opacity={0.6} />
            {/* Eagle head */}
            <circle cx={0} cy={-12} r={3.5} fill={brassColor} />
            {/* Eyes — flash on onset */}
            <circle cx={-1.4} cy={-13} r={0.8} fill="rgba(20, 8, 2, 0.95)" />
            <circle cx={1.4} cy={-13} r={0.8} fill="rgba(20, 8, 2, 0.95)" />
            {/* Tail feathers spread */}
            <line x1={0} y1={14} x2={-9} y2={28} stroke={brassColor} strokeWidth={1.6} strokeLinecap="round" />
            <line x1={0} y1={14} x2={-4} y2={30} stroke={brassColor} strokeWidth={1.4} strokeLinecap="round" />
            <line x1={0} y1={14} x2={0} y2={32} stroke={brassColor} strokeWidth={1.6} strokeLinecap="round" />
            <line x1={0} y1={14} x2={4} y2={30} stroke={brassColor} strokeWidth={1.4} strokeLinecap="round" />
            <line x1={0} y1={14} x2={9} y2={28} stroke={brassColor} strokeWidth={1.6} strokeLinecap="round" />
            {/* Star above */}
            <path d="M 0 -28 L 1.6 -24 L 5.6 -24 L 2.4 -21.5 L 3.6 -17.5 L 0 -20 L -3.6 -17.5 L -2.4 -21.5 L -5.6 -24 L -1.6 -24 Z"
              fill={brassBright} />
          </g>

          {/* ── PICKUPS (3 humbuckers) ── */}
          {[bodyH * 0.10, bodyH * 0.22, bodyH * 0.34].map((py, i) => (
            <g key={`pu-${i}`}>
              {/* Pickup ring */}
              <rect x={-bodyW * 0.22} y={py - 8} width={bodyW * 0.44} height={18} rx={2}
                fill="rgba(20, 14, 8, 0.95)" stroke={brassColor} strokeWidth={1.2} />
              {/* Pickup body */}
              <rect x={-bodyW * 0.20} y={py - 6} width={bodyW * 0.40} height={14} rx={1}
                fill="rgba(40, 24, 12, 0.92)" />
              {/* Brass cover plate */}
              <rect x={-bodyW * 0.19} y={py - 5} width={bodyW * 0.38} height={12} rx={0.5}
                fill="url(#jg-brass)" opacity={0.55} />
              {/* Pole pieces (6) */}
              {Array.from({ length: 6 }).map((_, j) => (
                <g key={`pole-${i}-${j}`}>
                  <circle cx={-bodyW * 0.16 + j * (bodyW * 0.064)} cy={py + 1} r={2.4}
                    fill="rgba(15, 10, 5, 0.95)" />
                  <circle cx={-bodyW * 0.16 + j * (bodyW * 0.064)} cy={py + 1} r={1.8}
                    fill={brassBright} opacity={0.92} />
                  <circle cx={-bodyW * 0.16 + j * (bodyW * 0.064) - 0.4} cy={py + 0.4} r={0.6}
                    fill="rgba(255, 240, 200, 0.85)" />
                </g>
              ))}
              {/* Pickup mounting screws */}
              <circle cx={-bodyW * 0.21} cy={py + 1} r={1.2} fill={brassColor} />
              <circle cx={bodyW * 0.21} cy={py + 1} r={1.2} fill={brassColor} />
            </g>
          ))}

          {/* ── BRIDGE + TAILPIECE ── */}
          <rect x={-bodyW * 0.16} y={bodyH * 0.42} width={bodyW * 0.32} height={10} rx={1.5}
            fill="rgba(20, 14, 8, 0.95)" stroke={brassColor} strokeWidth={0.8} />
          <rect x={-bodyW * 0.15} y={bodyH * 0.422} width={bodyW * 0.30} height={8} rx={1}
            fill="url(#jg-brass)" opacity={0.85} />
          {/* Saddles */}
          {Array.from({ length: 6 }).map((_, i) => (
            <g key={`saddle-${i}`}>
              <rect x={-bodyW * 0.13 + i * (bodyW * 0.052)} y={bodyH * 0.43} width={4.5} height={6}
                fill={brassBright} stroke="rgba(40, 20, 4, 0.85)" strokeWidth={0.4} />
              <line x1={-bodyW * 0.128 + i * (bodyW * 0.052) + 2.25} y1={bodyH * 0.432}
                x2={-bodyW * 0.128 + i * (bodyW * 0.052) + 2.25} y2={bodyH * 0.448}
                stroke="rgba(40, 20, 4, 0.65)" strokeWidth={0.4} />
            </g>
          ))}
          {/* Tailpiece */}
          <rect x={-bodyW * 0.18} y={bodyH * 0.455} width={bodyW * 0.36} height={7} rx={1}
            fill="url(#jg-brass)" stroke="rgba(40, 20, 4, 0.85)" strokeWidth={0.6} />
          {/* String anchor holes */}
          {Array.from({ length: 6 }).map((_, i) => (
            <circle key={`anchor-${i}`} cx={-bodyW * 0.12 + i * (bodyW * 0.048)} cy={bodyH * 0.4585}
              r={1} fill="rgba(20, 8, 2, 0.95)" />
          ))}

          {/* ── KNOBS (5: master volume + 2 tone + 2 mid) ── */}
          {[
            [bodyW * 0.26, bodyH * 0.20, "VOL"],
            [bodyW * 0.32, bodyH * 0.30, "TONE"],
            [bodyW * 0.30, bodyH * 0.40, "MID"],
            [-bodyW * 0.30, bodyH * 0.32, ""],
            [-bodyW * 0.32, bodyH * 0.42, ""],
          ].map((pos, i) => {
            const px = pos[0] as number;
            const py = pos[1] as number;
            return (
              <g key={`knob-${i}`}>
                {/* Outer ring */}
                <circle cx={px} cy={py} r={9} fill="rgba(20, 14, 8, 0.95)"
                  stroke={brassColor} strokeWidth={1.3} />
                {/* Knob body — chrome dial */}
                <circle cx={px} cy={py} r={7} fill="url(#jg-brass)" opacity={0.95} />
                <circle cx={px} cy={py} r={7} fill="none" stroke={brassDeep} strokeWidth={0.5} />
                {/* Center cap */}
                <circle cx={px} cy={py} r={2.5} fill="rgba(40, 20, 4, 0.85)" />
                {/* Indicator line */}
                <line x1={px} y1={py - 1} x2={px} y2={py - 6} stroke="rgba(40, 20, 4, 0.95)" strokeWidth={1.3} />
                {/* Tick marks around knob */}
                {Array.from({ length: 11 }).map((_, k) => {
                  const a = -Math.PI * 0.75 + (k / 10) * Math.PI * 1.5;
                  const x1 = px + Math.cos(a) * 9;
                  const y1 = py + Math.sin(a) * 9;
                  const x2 = px + Math.cos(a) * 11;
                  const y2 = py + Math.sin(a) * 11;
                  return <line key={`tick-${i}-${k}`} x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={brassColor} strokeWidth={0.5} />;
                })}
              </g>
            );
          })}

          {/* ── PICKUP SELECTOR TOGGLE ── */}
          <g transform={`translate(${bodyW * 0.18} ${-bodyH * 0.16})`}>
            <circle cx={0} cy={0} r={5} fill="rgba(20, 14, 8, 0.95)" stroke={brassColor} strokeWidth={0.9} />
            <circle cx={0} cy={0} r={3.5} fill="url(#jg-brass)" />
            <line x1={0} y1={0} x2={2.4} y2={-2.4} stroke="rgba(40, 20, 4, 0.95)" strokeWidth={1.6}
              strokeLinecap="round" />
            <circle cx={2.4} cy={-2.4} r={1.2} fill={brassBright} />
          </g>

          {/* ── INPUT JACK ── */}
          <g transform={`translate(${bodyW * 0.42} ${bodyH * 0.20})`}>
            <rect x={-4} y={-4} width={8} height={8} rx={1} fill="url(#jg-brass)" stroke={brassDeep} strokeWidth={0.6} />
            <circle cx={0} cy={0} r={2} fill="rgba(20, 8, 2, 0.95)" />
            <circle cx={0} cy={0} r={1} fill="rgba(60, 30, 8, 0.95)" />
          </g>

          {/* ── NECK JOINT (heel) ── */}
          <rect x={-neckW * 0.7} y={-bodyH * 0.46} width={neckW * 1.4} height={14}
            fill="url(#jg-neck)" stroke="rgba(0, 0, 0, 0.95)" strokeWidth={1.4} />
          <line x1={-neckW * 0.7} y1={-bodyH * 0.46 + 4} x2={neckW * 0.7} y2={-bodyH * 0.46 + 4}
            stroke={brassColor} strokeWidth={0.6} opacity={0.65} />

        </g>

        {/* ─── NECK + FRETBOARD + HEADSTOCK (positioned in absolute frame coords) ─── */}
        <g>
          {/* Neck back */}
          <rect x={cx - neckW / 2 - 1} y={neckTopY} width={neckW + 2} height={neckLen + 14}
            fill="url(#jg-neck)" stroke="rgba(0, 0, 0, 0.98)" strokeWidth={1.6} />
          {/* Subtle highlight stripe on neck */}
          <rect x={cx - neckW / 2 + 2} y={neckTopY + 2} width={2} height={neckLen + 10}
            fill={`rgba(255, 220, 160, ${0.25 + spotWarmth * 0.15})`} />

          {/* Fretboard */}
          <rect x={cx - neckW * 0.42} y={neckTopY + 4} width={neckW * 0.84} height={neckLen + 6}
            fill="url(#jg-fretboard)" stroke="rgba(0, 0, 0, 0.85)" strokeWidth={0.8} />

          {/* Frets (22) */}
          {Array.from({ length: 22 }).map((_, i) => {
            const fy = neckTopY + 4 + (i + 1) * (neckLen / 22);
            return (
              <g key={`fret-${i}`}>
                <line x1={cx - neckW * 0.42} y1={fy} x2={cx + neckW * 0.42} y2={fy}
                  stroke={brassBright} strokeWidth={1.4} />
                <line x1={cx - neckW * 0.42} y1={fy + 0.6} x2={cx + neckW * 0.42} y2={fy + 0.6}
                  stroke={brassDeep} strokeWidth={0.4} />
              </g>
            );
          })}

          {/* Inlays — pearl block markers at frets 3, 5, 7, 9, 12 (double), 15, 17 */}
          {[3, 5, 7, 9, 12, 12, 15, 17, 19].map((fretNum, i) => {
            const fretSpacing = neckLen / 22;
            const fy = neckTopY + 4 + (fretNum - 0.5) * fretSpacing;
            const isDouble12First = fretNum === 12 && i === 4;
            const isDouble12Second = fretNum === 12 && i === 5;
            const offset = isDouble12First ? -neckW * 0.18 : isDouble12Second ? neckW * 0.18 : 0;
            return (
              <rect key={`inlay-${i}`} x={cx - neckW * 0.10 + offset} y={fy - 4}
                width={neckW * 0.20} height={6} rx={0.8}
                fill="rgba(240, 230, 200, 0.92)" stroke="rgba(80, 60, 30, 0.6)" strokeWidth={0.4} />
            );
          })}

          {/* ── STRINGS (6) — vibrating ── */}
          {Array.from({ length: 6 }).map((_, i) => {
            const xBase = cx - neckW * 0.30 + i * (neckW * 0.12);
            const vib = stringVib(i);
            return (
              <g key={`str-${i}`}>
                {/* String shadow */}
                <line x1={xBase + 0.6} y1={neckTopY + 4} x2={xBase + 0.6}
                  y2={bodyCY + bodyH * 0.46} stroke="rgba(0, 0, 0, 0.7)" strokeWidth={0.8 + i * 0.15} />
                {/* String — vibrating */}
                <line x1={xBase + vib * 0.4} y1={neckTopY + 4} x2={xBase}
                  y2={bodyCY + bodyH * 0.46}
                  stroke="rgba(220, 200, 150, 0.92)" strokeWidth={0.7 + i * 0.18} />
                {/* String highlight */}
                <line x1={xBase + vib * 0.4} y1={neckTopY + 4} x2={xBase}
                  y2={bodyCY + bodyH * 0.46}
                  stroke={tintCore} strokeWidth={0.3} opacity={0.5 + 0.4 * snap.beatDecay} />
              </g>
            );
          })}

          {/* ── HEADSTOCK — Doug Irwin distinctive shape ── */}
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
          `} fill="url(#jg-neck)" stroke="rgba(0, 0, 0, 0.98)" strokeWidth={2} />

          {/* Headstock face highlight */}
          <path d={`
            M ${cx - neckW * 0.40} ${neckTopY + 4}
            Q ${cx - neckW * 0.95} ${neckTopY - headstockH * 0.30} ${cx - neckW * 0.75} ${headstockTopY + headstockH * 0.32}
            Q ${cx - neckW * 0.36} ${headstockTopY} ${cx} ${headstockTopY + 12}
          `} fill="none" stroke={`rgba(255, 220, 160, ${0.45 + spotWarmth * 0.20})`} strokeWidth={1.2} />

          {/* Brass logo plate "TIGER / DOUG IRWIN" */}
          <rect x={cx - neckW * 0.55} y={headstockTopY + headstockH * 0.45}
            width={neckW * 1.10} height={14} rx={1.5}
            fill="url(#jg-brass)" stroke="rgba(40, 20, 4, 0.85)" strokeWidth={0.8} />
          <text x={cx} y={headstockTopY + headstockH * 0.45 + 10}
            textAnchor="middle" fontSize={9} fontFamily="Georgia, serif" fontWeight={900}
            fill="rgba(40, 20, 4, 0.95)" letterSpacing={1.4}>D.IRWIN</text>

          {/* Truss rod cover */}
          <rect x={cx - neckW * 0.20} y={neckTopY - 4} width={neckW * 0.40} height={10} rx={1}
            fill="url(#jg-brass)" stroke="rgba(40, 20, 4, 0.85)" strokeWidth={0.5} />
          <circle cx={cx - neckW * 0.14} cy={neckTopY + 1} r={0.8} fill="rgba(40, 20, 4, 0.95)" />
          <circle cx={cx + neckW * 0.14} cy={neckTopY + 1} r={0.8} fill="rgba(40, 20, 4, 0.95)" />

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
                  fill="rgba(15, 10, 5, 0.98)" stroke={brassColor} strokeWidth={0.8} />
                <circle cx={cx + side * neckW * 0.40} cy={py} r={1.8}
                  fill={brassBright} />
                {/* String winding */}
                <circle cx={cx + side * neckW * 0.40} cy={py} r={1.0}
                  fill="rgba(220, 200, 150, 0.85)" />
                {/* Tuner button (off the side) */}
                <ellipse cx={px} cy={py} rx={6} ry={3.5}
                  fill="url(#jg-brass)" stroke="rgba(40, 20, 4, 0.85)" strokeWidth={0.6} />
                <ellipse cx={px} cy={py} rx={3} ry={1.6}
                  fill={brassDeep} opacity={0.7} />
                {/* Connecting shaft */}
                <line x1={cx + side * neckW * 0.45} y1={py} x2={px - side * 5} y2={py}
                  stroke={brassDeep} strokeWidth={1} />
              </g>
            );
          })}

          {/* Decorative scroll at the top of the headstock */}
          <path d={`M ${cx - neckW * 0.20} ${headstockTopY + 6}
            Q ${cx} ${headstockTopY - 2} ${cx + neckW * 0.20} ${headstockTopY + 6}`}
            stroke={brassColor} strokeWidth={1.4} fill="none" />
          <circle cx={cx} cy={headstockTopY + 4} r={1.8} fill={brassBright} />
        </g>

        {/* ── ONSET FLASH ON CENTER MEDALLION ── */}
        {flash > 0 && (
          <ellipse cx={cx} cy={bodyCY - bodyH * 0.06}
            rx={56 + flash * 30} ry={56 + flash * 30}
            fill={tintCore} opacity={flash * 0.55} style={{ mixBlendMode: "screen" }} />
        )}

        {/* ── DUST MOTES IN SPOTLIGHT ── */}
        <g style={{ mixBlendMode: "screen" }}>
          {dust.map((d, i) => {
            const t = frame * d.speed * tempoFactor + d.phase;
            const px = (d.x + Math.sin(t * 1.2) * 0.04) * width;
            const py = (d.y + Math.sin(t * 0.6) * 0.02) * height;
            const flicker = 0.5 + Math.sin(t * 2.4) * 0.4;
            // Dust brighter near the spotlight cone (center)
            const distFromCenter = Math.abs(px - cx) / (width * 0.5);
            const spotlightBoost = Math.max(0, 1 - distFromCenter * 1.4);
            return (
              <circle key={`dust-${i}`} cx={px} cy={py} r={d.r * (0.8 + spotWarmth * 0.5)}
                fill={tintCore} opacity={(0.30 + spotlightBoost * 0.45) * flicker * spotWarmth} />
            );
          })}
        </g>

        {/* ── VIGNETTE ── */}
        <rect width={width} height={height} fill="url(#jg-vig)" />
      </svg>
    </div>
  );
};
