/**
 * BearParade — A+++ overlay: a line of 7 dancing bears parading across the
 * frame. Each bear distinct (color and size from depth perspective), rainbow
 * tie-dye trails, joyful walking animation. Bears are the central row across
 * the frame. Sky/horizon backdrop with concert silhouettes and twinkling
 * stage lights.
 *
 * Audio reactivity:
 *   slowEnergy → spotlight warmth + trail glow
 *   energy     → bear bounce intensity
 *   bass       → low-end paw stomp depth
 *   beatDecay  → synced hop on every beat
 *   onsetEnvelope → confetti burst
 *   chromaHue  → rainbow trail tint shift
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
const BEAR_COUNT = 7;
const CONFETTI_COUNT = 80;
const STAR_COUNT = 70;

interface BearSpec { idx: number; depth: number; phase: number; hue: number; speed: number; xOffset: number; }
interface Spark { x: number; y: number; r: number; speed: number; phase: number; hue: number; }

function buildBears(): BearSpec[] {
  const hues = [0, 30, 55, 120, 180, 250, 305];
  const rng = seeded(11_447_338);
  return Array.from({ length: BEAR_COUNT }, (_, i) => ({
    idx: i,
    depth: 0.6 + rng() * 0.45,
    phase: rng() * Math.PI * 2,
    hue: hues[i],
    speed: 0.95 + rng() * 0.15,
    xOffset: i * (1.0 / BEAR_COUNT) + rng() * 0.04 - 0.02,
  }));
}

function buildConfetti(): Spark[] {
  const rng = seeded(76_991_204);
  return Array.from({ length: CONFETTI_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.85,
    r: 0.7 + rng() * 2.4,
    speed: 0.005 + rng() * 0.04,
    phase: rng() * Math.PI * 2,
    hue: rng() * 360,
  }));
}

function buildStars(): Spark[] {
  const rng = seeded(48_338_771);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.45,
    r: 0.5 + rng() * 1.5,
    speed: 0.005 + rng() * 0.03,
    phase: rng() * Math.PI * 2,
    hue: 0,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const BearParade: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const bears = React.useMemo(buildBears, []);
  const confetti = React.useMemo(buildConfetti, []);
  const stars = React.useMemo(buildStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives — widened for dramatic quiet/loud contrast
  const warmth = interpolate(snap.slowEnergy, [0.02, 0.32], [0.20, 1.50], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bounce = interpolate(snap.energy, [0.02, 0.30], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stomp = interpolate(snap.bass, [0.0, 0.65], [0.15, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Rainbow palette modulated by chromaHue
  const tintShift = snap.chromaHue - 180;
  const baseHue = 30;
  const tintHue = ((baseHue + tintShift * 0.65) % 360 + 360) % 360;
  const tintCore = `hsl(${tintHue}, 92%, 82%)`;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 50%, 12%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 35%, 18%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 45%, 28%)`;

  // ─── HERO LAYOUT ───────────────────────────────────────────────────
  const groundY = height * 0.78;
  const baseBearH = height * 0.42;

  // Star nodes
  const starNodes = stars.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`st-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + flick * 0.6)}
        fill="#fff5d0" opacity={0.45 + flick * 0.45} />
    );
  });

  // Confetti sparkles
  const confettiNodes = confetti.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    const yDrift = (s.y + frame * 0.0008) % 1;
    return (
      <circle key={`con-${i}`} cx={s.x * width} cy={yDrift * height}
        r={s.r * (0.7 + bounce * 0.6)}
        fill={`hsl(${(s.hue + tintShift) % 360}, 90%, 70%)`} opacity={0.40 * flick * bounce} />
    );
  });

  // ── BEAR BUILDER ──
  function buildBear(spec: BearSpec): React.ReactNode {
    const scale = spec.depth;
    const bH = baseBearH * scale;
    const bW = bH * 0.95;
    const slowDrift = (frame * 0.00012 * spec.speed * tempoFactor) % 1;
    const xPos = ((spec.xOffset + slowDrift) % 1.10) - 0.05;
    const cxBear = xPos * width;
    const bobPhase = frame * 0.10 * tempoFactor + spec.phase;
    const bob = Math.sin(bobPhase) * (2 + bounce * 10 + snap.beatDecay * 12) * scale;
    // Bass stomp: pushes bear down on bass hits (paw slam effect)
    const stompPush = stomp * snap.beatDecay * 6 * scale;
    const cyBear = groundY - bH * 0.50 + bob + stompPush;

    const fillCol = `hsl(${(spec.hue + tintShift) % 360}, 80%, 55%)`;
    const fillCore = `hsl(${(spec.hue + tintShift) % 360}, 95%, 70%)`;
    const fillDeep = `hsl(${(spec.hue + tintShift) % 360}, 80%, 38%)`;
    const stroke = "rgba(20, 8, 2, 0.85)";

    const bx = cxBear;
    const by = cyBear;
    const legA = Math.sin(bobPhase) * 8 * scale;
    const legB = -legA;
    const armA = Math.sin(bobPhase * 1.2 + 0.6) * 6 * scale;
    const armB = -armA;

    return (
      <g key={`bear-${spec.idx}`}>
        {/* Trail behind */}
        {Array.from({ length: 5 }).map((_, k) => {
          const tailX = bx - bW * 0.5 - k * (bW * 0.16);
          const tailHue = (spec.hue + tintShift + k * 40) % 360;
          return (
            <ellipse key={`trail-${k}`} cx={tailX} cy={by + bH * 0.22}
              rx={bW * 0.22 * (1 - k * 0.12)} ry={bH * 0.10 * (1 - k * 0.10)}
              fill={`hsl(${tailHue}, 85%, 60%)`} opacity={(0.42 - k * 0.07) * warmth} />
          );
        })}

        {/* Belly shadow */}
        <ellipse cx={bx} cy={groundY + 4} rx={bW * 0.50} ry={5 * scale} fill="rgba(0,0,0,0.50)" />

        {/* Hind leg */}
        <rect x={bx + bW * 0.10} y={by + bH * 0.10 + legB} width={bW * 0.13} height={bH * 0.36}
          fill={fillDeep} stroke={stroke} strokeWidth={1.4} rx={bW * 0.05} />
        <ellipse cx={bx + bW * 0.165} cy={by + bH * 0.48 + legB} rx={bW * 0.10} ry={bH * 0.045}
          fill={fillDeep} stroke={stroke} strokeWidth={1.2} />
        <circle cx={bx + bW * 0.13} cy={by + bH * 0.48 + legB} r={bW * 0.018} fill="rgba(0,0,0,0.65)" />
        <circle cx={bx + bW * 0.165} cy={by + bH * 0.49 + legB} r={bW * 0.018} fill="rgba(0,0,0,0.65)" />
        <circle cx={bx + bW * 0.20} cy={by + bH * 0.48 + legB} r={bW * 0.018} fill="rgba(0,0,0,0.65)" />

        {/* Body */}
        <ellipse cx={bx} cy={by + bH * 0.05} rx={bW * 0.42} ry={bH * 0.32}
          fill={fillCol} stroke={stroke} strokeWidth={2} />
        <ellipse cx={bx - bW * 0.05} cy={by + bH * 0.10} rx={bW * 0.24} ry={bH * 0.20}
          fill={fillCore} opacity={0.55} />

        {/* Front leg */}
        <rect x={bx - bW * 0.25} y={by + bH * 0.10 + legA} width={bW * 0.13} height={bH * 0.36}
          fill={fillDeep} stroke={stroke} strokeWidth={1.4} rx={bW * 0.05} />
        <ellipse cx={bx - bW * 0.185} cy={by + bH * 0.48 + legA} rx={bW * 0.10} ry={bH * 0.045}
          fill={fillDeep} stroke={stroke} strokeWidth={1.2} />
        <circle cx={bx - bW * 0.22} cy={by + bH * 0.48 + legA} r={bW * 0.018} fill="rgba(0,0,0,0.65)" />
        <circle cx={bx - bW * 0.185} cy={by + bH * 0.49 + legA} r={bW * 0.018} fill="rgba(0,0,0,0.65)" />
        <circle cx={bx - bW * 0.15} cy={by + bH * 0.48 + legA} r={bW * 0.018} fill="rgba(0,0,0,0.65)" />

        {/* Arm raised */}
        <rect x={bx - bW * 0.35} y={by - bH * 0.20 + armA} width={bW * 0.10} height={bH * 0.22}
          fill={fillDeep} stroke={stroke} strokeWidth={1.4} rx={bW * 0.04} transform={`rotate(${-15 + armA * 0.8} ${bx - bW * 0.30} ${by - bH * 0.10})`} />

        {/* Arm down */}
        <rect x={bx + bW * 0.25} y={by - bH * 0.10 + armB} width={bW * 0.10} height={bH * 0.22}
          fill={fillDeep} stroke={stroke} strokeWidth={1.4} rx={bW * 0.04} transform={`rotate(${10 + armB * 0.5} ${bx + bW * 0.30} ${by})`} />

        {/* Head */}
        <circle cx={bx - bW * 0.32} cy={by - bH * 0.20} r={bH * 0.20}
          fill={fillCol} stroke={stroke} strokeWidth={2} />
        {/* Ears */}
        <circle cx={bx - bW * 0.45} cy={by - bH * 0.34} r={bH * 0.06}
          fill={fillCol} stroke={stroke} strokeWidth={1.6} />
        <circle cx={bx - bW * 0.45} cy={by - bH * 0.34} r={bH * 0.025} fill={fillDeep} />
        <circle cx={bx - bW * 0.20} cy={by - bH * 0.34} r={bH * 0.06}
          fill={fillCol} stroke={stroke} strokeWidth={1.6} />
        <circle cx={bx - bW * 0.20} cy={by - bH * 0.34} r={bH * 0.025} fill={fillDeep} />
        {/* Snout */}
        <ellipse cx={bx - bW * 0.32} cy={by - bH * 0.10} rx={bH * 0.10} ry={bH * 0.07}
          fill={fillCore} stroke={stroke} strokeWidth={1.4} />
        {/* Nose */}
        <ellipse cx={bx - bW * 0.32} cy={by - bH * 0.13} rx={bH * 0.025} ry={bH * 0.018}
          fill="rgba(20, 8, 2, 0.95)" />
        {/* Eyes */}
        <circle cx={bx - bW * 0.40} cy={by - bH * 0.23} r={bH * 0.022} fill="rgba(20, 8, 2, 0.95)" />
        <circle cx={bx - bW * 0.24} cy={by - bH * 0.23} r={bH * 0.022} fill="rgba(20, 8, 2, 0.95)" />
        <circle cx={bx - bW * 0.398} cy={by - bH * 0.232} r={bH * 0.008} fill="white" opacity={0.85} />
        <circle cx={bx - bW * 0.238} cy={by - bH * 0.232} r={bH * 0.008} fill="white" opacity={0.85} />
        {/* Mouth */}
        <path d={`M ${bx - bW * 0.36} ${by - bH * 0.07} Q ${bx - bW * 0.32} ${by - bH * 0.04} ${bx - bW * 0.28} ${by - bH * 0.07}`}
          stroke={stroke} strokeWidth={1.4} fill="none" strokeLinecap="round" />

        {/* Tail */}
        <circle cx={bx + bW * 0.38} cy={by - bH * 0.05} r={bH * 0.04}
          fill={fillCol} stroke={stroke} strokeWidth={1.4} />

        {/* Tie-dye spots */}
        <circle cx={bx - bW * 0.10} cy={by + bH * 0.0} r={bH * 0.05} fill={fillCore} opacity={0.85} />
        <circle cx={bx + bW * 0.12} cy={by + bH * 0.05} r={bH * 0.04} fill={fillCore} opacity={0.85} />
        <circle cx={bx - bW * 0.05} cy={by + bH * 0.18} r={bH * 0.035} fill={fillCore} opacity={0.85} />
      </g>
    );
  }

  // Sort by depth (back to front)
  const sortedBears = [...bears].sort((a, b) => a.depth - b.depth);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="bp-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="bp-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(40, 24, 8, 0.95)" />
            <stop offset="100%" stopColor="rgba(15, 8, 2, 1)" />
          </linearGradient>
          <radialGradient id="bp-spot">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.40} />
            <stop offset="100%" stopColor={tintCore} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="bp-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#bp-sky)" />

        {/* Stars */}
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Distant horizon mountains */}
        <path d={`M 0 ${height * 0.70} L ${width * 0.18} ${height * 0.62} L ${width * 0.32} ${height * 0.66} L ${width * 0.5} ${height * 0.58} L ${width * 0.68} ${height * 0.65} L ${width * 0.85} ${height * 0.60} L ${width} ${height * 0.68} L ${width} ${height * 0.78} L 0 ${height * 0.78} Z`}
          fill="rgba(20, 12, 30, 0.85)" />

        {/* Crowd silhouettes */}
        {Array.from({ length: 30 }, (_, i) => (
          <ellipse key={`crowd-${i}`} cx={(i / 30) * width + 8} cy={height * 0.74}
            rx={6 + (i % 3) * 2} ry={4 + (i % 4)} fill="rgba(8, 4, 12, 0.85)" />
        ))}

        {/* Spotlight */}
        <ellipse cx={width / 2} cy={groundY - baseBearH * 0.4} rx={width * 0.65} ry={baseBearH * 0.7}
          fill="url(#bp-spot)" style={{ mixBlendMode: "screen" }} opacity={warmth} />

        {/* Stage floor */}
        <rect x={0} y={groundY} width={width} height={height - groundY} fill="url(#bp-ground)" />
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`plank-${i}`} x1={0} y1={groundY + i * 14} x2={width} y2={groundY + i * 14}
            stroke="rgba(70, 40, 14, 0.35)" strokeWidth={0.8} />
        ))}

        {/* Bears (sorted by depth, back to front) */}
        {sortedBears.map(buildBear)}

        {/* Confetti sparkles */}
        <g style={{ mixBlendMode: "screen" }}>{confettiNodes}</g>

        {/* Onset flash */}
        {flash > 0.05 && (
          <rect width={width} height={height}
            fill={`rgba(255, 245, 220, ${flash * 0.10})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#bp-vig)" />
      </svg>
    </div>
  );
};
