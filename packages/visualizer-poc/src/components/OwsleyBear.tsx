/**
 * OwsleyBear — A+++ iconic Stanley/Owsley dancing bears marching across the
 * frame. NOT cartoony cartoon bears — these are the geometric silhouettes from
 * the inside cover of "History of the Grateful Dead Vol 1: Bear's Choice".
 *
 * Each bear:
 *   - Solid silhouette with curved arched back, small round head, two dot eyes
 *     (no smile, no nose details)
 *   - Two tiny round ears
 *   - Profile pose: one back leg lifted (mid-stride), one forward
 *   - Front paw stepping forward, rear paw stepping back
 *   - Different walk-cycle phase per bear so the line shows the full gait
 *   - Solid tie-dye colors: red, orange, yellow, green, blue, purple, pink
 *
 * Scene:
 *   - Stage horizon backdrop
 *   - Stars / overhead twinkles
 *   - Spotlight wash
 *   - Ground shadow per bear
 *   - 6 bears marching across, taking up ~70% of frame width
 *
 * Audio reactivity:
 *   slowEnergy → spotlight warmth
 *   energy     → bear bounce intensity
 *   bass       → step depth
 *   beatDecay  → per-step hop
 *   onsetEnvelope → sparkle burst
 *   chromaHue  → backdrop tint
 *   tempoFactor → walk cycle rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const BEAR_COUNT = 6;
const STAR_COUNT = 70;
const SPARK_COUNT = 50;

interface BearSpec { xFrac: number; depth: number; hue: number; phase: number; }
interface Star { x: number; y: number; r: number; speed: number; phase: number; }

function buildBears(): BearSpec[] {
  // 6 bears in classic tie-dye palette
  return [
    { xFrac: 0.06, depth: 0.85, hue: 0,   phase: 0.0 },   // red
    { xFrac: 0.20, depth: 1.0,  hue: 28,  phase: 1.0 },   // orange
    { xFrac: 0.36, depth: 1.05, hue: 50,  phase: 2.0 },   // yellow
    { xFrac: 0.52, depth: 1.0,  hue: 130, phase: 3.0 },   // green
    { xFrac: 0.68, depth: 1.05, hue: 220, phase: 4.0 },   // blue
    { xFrac: 0.84, depth: 0.90, hue: 290, phase: 5.0 },   // purple
  ];
}

function buildStars(): Star[] {
  const rng = seeded(72_991_445);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.5,
    r: 0.5 + rng() * 1.4,
    speed: 0.005 + rng() * 0.025,
    phase: rng() * Math.PI * 2,
  }));
}

function buildSparks(): Star[] {
  const rng = seeded(48_226_991);
  return Array.from({ length: SPARK_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.85,
    r: 0.6 + rng() * 1.6,
    speed: 0.012 + rng() * 0.04,
    phase: rng() * Math.PI * 2,
  }));
}

const hsl = (h: number, s = 80, l = 55) => `hsl(${((h % 360) + 360) % 360}, ${s}%, ${l}%)`;

interface Props { frames: EnhancedFrameData[]; }

export const OwsleyBear: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const bears = React.useMemo(buildBears, []);
  const stars = React.useMemo(buildStars, []);
  const sparks = React.useMemo(buildSparks, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const warmth = interpolate(snap.slowEnergy, [0.0, 0.32], [0.55, 1.10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bounce = interpolate(snap.energy, [0.0, 0.30], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  const tintShift = snap.chromaHue - 180;
  const baseHue = 280;
  const tintHue = ((baseHue + tintShift * 0.35) % 360 + 360) % 360;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 50%, 8%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 38%, 14%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 45%, 24%)`;

  const groundY = height * 0.78;
  // Bears 40% of frame height tall — heroes!
  const baseBearH = height * 0.40;

  /**
   * Build a single iconic geometric Owsley dancing bear in profile.
   * The classic shape: arched back, round head, tiny ears, walking pose.
   * Direction: facing right.
   */
  function buildBear(spec: BearSpec, idx: number): React.ReactNode {
    const scale = spec.depth;
    const bH = baseBearH * scale;
    const bW = bH * 0.78;  // narrower than tall (profile)
    const cx = spec.xFrac * width;
    const bobPhase = frame * 0.12 * tempoFactor + spec.phase;
    // Walk cycle hop
    const walk = Math.sin(bobPhase);
    const hop = Math.max(0, walk) * (4 + bounce * 6 + snap.beatDecay * 8) * scale;
    const lean = Math.sin(bobPhase + Math.PI / 4) * 1.5;
    const cy = groundY - bH * 0.5 - hop;

    const bearHue = (spec.hue + tintShift * 0.20 + 360) % 360;
    const fill = hsl(bearHue, 88, 50);
    const fillCore = hsl(bearHue, 95, 62);
    const fillRim = hsl(bearHue, 78, 36);
    const stroke = "rgba(15, 8, 2, 0.92)";

    // Walk leg lifts: front paw (toes pointing right) lifts on phase 0,
    // back paw lifts on phase pi
    const frontLift = Math.max(0, Math.sin(bobPhase)) * bH * 0.06;
    const backLift = Math.max(0, Math.sin(bobPhase + Math.PI)) * bH * 0.06;
    const frontStride = Math.cos(bobPhase) * bH * 0.04;
    const backStride = -Math.cos(bobPhase) * bH * 0.04;

    // Bear silhouette in local coords (origin at bear center).
    // Following the classic Owsley dancing bear profile:
    // - large arched body (rounded teardrop)
    // - small round head at front-top
    // - two tiny ears
    // - back leg + front leg with paws
    //
    // We render two background outline layers (rim + outline) then
    // a clean fill, then features.

    // Body — arched teardrop, narrower at the front (head end)
    // Profile faces RIGHT: head is on right side
    const body = `M ${cx - bW * 0.42} ${cy - bH * 0.05}
      Q ${cx - bW * 0.50} ${cy - bH * 0.32}
        ${cx - bW * 0.20} ${cy - bH * 0.42}
      Q ${cx + bW * 0.00} ${cy - bH * 0.46}
        ${cx + bW * 0.18} ${cy - bH * 0.42}
      Q ${cx + bW * 0.30} ${cy - bH * 0.36}
        ${cx + bW * 0.30} ${cy - bH * 0.18}
      L ${cx + bW * 0.38} ${cy + bH * 0.18}
      Q ${cx + bW * 0.40} ${cy + bH * 0.32}
        ${cx + bW * 0.18} ${cy + bH * 0.36}
      L ${cx - bW * 0.18} ${cy + bH * 0.34}
      Q ${cx - bW * 0.40} ${cy + bH * 0.30}
        ${cx - bW * 0.42} ${cy + bH * 0.10} Z`;

    // Head — round circle on the front (right) side, sitting above the body
    const headR = bH * 0.16;
    const headCx = cx + bW * 0.28;
    const headCy = cy - bH * 0.40;

    // Snout bump
    const snoutX = headCx + headR * 0.85;
    const snoutY = headCy + headR * 0.10;

    // Ears: two small round circles on top of head
    const ear1x = headCx - headR * 0.55;
    const ear1y = headCy - headR * 0.85;
    const ear2x = headCx + headR * 0.25;
    const ear2y = headCy - headR * 0.95;

    // Front leg: sticks down at front-right, with a paw
    const flegX = cx + bW * 0.28;
    const flegY1 = cy + bH * 0.30;
    const flegY2 = cy + bH * 0.46 - frontLift;
    // Back leg: sticks down at back, with paw lifted on opposite phase
    const blegX = cx - bW * 0.28;
    const blegY1 = cy + bH * 0.28;
    const blegY2 = cy + bH * 0.46 - backLift;

    return (
      <g key={`bear-${idx}`} transform={`rotate(${lean} ${cx} ${cy})`}>
        {/* Ground shadow */}
        <ellipse cx={cx} cy={groundY + 3} rx={bW * 0.45} ry={5 * scale}
          fill="rgba(0, 0, 0, 0.55)" opacity={0.85 - hop * 0.04} />

        {/* Outer rim glow */}
        <g filter="url(#ow-glow-blur)" opacity={0.35 + bounce * 0.25}>
          <path d={body} fill={fillCore} />
          <circle cx={headCx} cy={headCy} r={headR * 1.05} fill={fillCore} />
        </g>

        {/* Back leg — wide rectangle behind body */}
        <g transform={`translate(${backStride} 0)`}>
          <path d={`M ${blegX - bW * 0.06} ${blegY1}
            L ${blegX + bW * 0.06} ${blegY1}
            L ${blegX + bW * 0.10} ${blegY2}
            L ${blegX - bW * 0.10} ${blegY2} Z`}
            fill={fillRim} stroke={stroke} strokeWidth={2.4} />
          {/* Back paw */}
          <ellipse cx={blegX} cy={blegY2 + 2}
            rx={bW * 0.13} ry={bW * 0.06}
            fill={fillRim} stroke={stroke} strokeWidth={2.4} />
        </g>

        {/* Body */}
        <path d={body} fill={fill} stroke={stroke} strokeWidth={3} />

        {/* Front leg */}
        <g transform={`translate(${frontStride} 0)`}>
          <path d={`M ${flegX - bW * 0.06} ${flegY1}
            L ${flegX + bW * 0.06} ${flegY1}
            L ${flegX + bW * 0.10} ${flegY2}
            L ${flegX - bW * 0.10} ${flegY2} Z`}
            fill={fillRim} stroke={stroke} strokeWidth={2.4} />
          {/* Front paw */}
          <ellipse cx={flegX + bW * 0.04} cy={flegY2 + 2}
            rx={bW * 0.14} ry={bW * 0.06}
            fill={fillRim} stroke={stroke} strokeWidth={2.4} />
        </g>

        {/* Head — solid round circle */}
        <circle cx={headCx} cy={headCy} r={headR}
          fill={fill} stroke={stroke} strokeWidth={3} />

        {/* Snout bump — small ellipse on the front of head */}
        <ellipse cx={snoutX} cy={snoutY} rx={headR * 0.30} ry={headR * 0.22}
          fill={fill} stroke={stroke} strokeWidth={2.4} />

        {/* Ears — tiny rounded triangles / circles */}
        <circle cx={ear1x} cy={ear1y} r={headR * 0.30}
          fill={fill} stroke={stroke} strokeWidth={2.2} />
        <circle cx={ear2x} cy={ear2y} r={headR * 0.30}
          fill={fill} stroke={stroke} strokeWidth={2.2} />
        {/* Inner ear shadow */}
        <circle cx={ear1x + headR * 0.04} cy={ear1y + headR * 0.05} r={headR * 0.16}
          fill={fillRim} />
        <circle cx={ear2x + headR * 0.04} cy={ear2y + headR * 0.05} r={headR * 0.16}
          fill={fillRim} />

        {/* Eye — single tiny black dot, no smile, no other features */}
        <circle cx={headCx + headR * 0.30} cy={headCy - headR * 0.10}
          r={headR * 0.08} fill="rgba(15, 8, 2, 0.95)" />

        {/* Belly highlight */}
        <ellipse cx={cx + bW * 0.05} cy={cy + bH * 0.10}
          rx={bW * 0.20} ry={bH * 0.15}
          fill={fillCore} opacity={0.30} />

        {/* Body sheen */}
        <path d={`M ${cx - bW * 0.18} ${cy - bH * 0.30}
          Q ${cx + bW * 0.05} ${cy - bH * 0.36}
            ${cx + bW * 0.20} ${cy - bH * 0.30}`}
          stroke={fillCore} strokeWidth={3} fill="none" opacity={0.45} strokeLinecap="round" />
      </g>
    );
  }

  // Star nodes
  const starNodes = stars.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`st-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + flick * 0.6)}
        fill="#fff5d0" opacity={0.40 + flick * 0.45} />
    );
  });

  // Spark nodes
  const sparkNodes = sparks.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`spk-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + bounce * 0.6)}
        fill={hsl(tintHue, 95, 80)} opacity={0.40 * flick * bounce} />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="ow-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="ow-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(40, 24, 8, 0.95)" />
            <stop offset="100%" stopColor="rgba(15, 8, 2, 1)" />
          </linearGradient>
          <radialGradient id="ow-spotlight">
            <stop offset="0%" stopColor={hsl(tintHue, 90, 80)} stopOpacity={0.45} />
            <stop offset="100%" stopColor={hsl(tintHue, 90, 80)} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="ow-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="ow-glow-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#ow-sky)" />

        {/* Stars */}
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Spotlight */}
        <ellipse cx={width / 2} cy={groundY - baseBearH * 0.4} rx={width * 0.65} ry={baseBearH * 0.85}
          fill="url(#ow-spotlight)" style={{ mixBlendMode: "screen" }} opacity={warmth} />

        {/* Distant horizon mountains */}
        <path d={`M 0 ${height * 0.70}
          L ${width * 0.18} ${height * 0.62}
          L ${width * 0.32} ${height * 0.66}
          L ${width * 0.5} ${height * 0.58}
          L ${width * 0.68} ${height * 0.65}
          L ${width * 0.85} ${height * 0.60}
          L ${width} ${height * 0.68}
          L ${width} ${height * 0.78}
          L 0 ${height * 0.78} Z`}
          fill="rgba(20, 12, 30, 0.85)" />

        {/* Stage floor */}
        <rect x={0} y={groundY} width={width} height={height - groundY}
          fill="url(#ow-ground)" />
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`plank-${i}`} x1={0} y1={groundY + i * 14} x2={width} y2={groundY + i * 14}
            stroke="rgba(70, 40, 14, 0.35)" strokeWidth={0.8} />
        ))}

        {/* Bears */}
        {bears.map((b, i) => buildBear(b, i))}

        {/* Sparks */}
        <g style={{ mixBlendMode: "screen" }}>{sparkNodes}</g>

        {/* Onset flash */}
        {flash > 0.05 && (
          <rect width={width} height={height}
            fill={`rgba(255, 245, 220, ${flash * 0.10})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#ow-vig)" />
      </svg>
    </div>
  );
};
