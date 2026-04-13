/**
 * BreathingStealie -- A+++ procedural overlay: the iconic Steal Your Face skull.
 *
 * Entirely math-driven. The skull is a continuous bezier silhouette with
 * anatomical proportions. The lightning bolt is regenerated every frame with
 * jitter and forks on onset hits. Shape-level deformation (not CSS scale)
 * drives organic breathing. Electric tendrils extend from the skull at peaks.
 *
 * Audio reactivity:
 *   slowEnergy  -> cranium expansion / jaw contraction (shape deformation)
 *   energy      -> glow intensity, tendril count, eye fire
 *   bass        -> jawline drop, low-freq throb
 *   beatDecay   -> bolt pulse ripple, tendril snap
 *   onsetEnvelope -> bolt forking (1-4 branches), white flash
 *   chromaHue   -> red/blue half tint, bolt gold shift
 *   tempoFactor -> halo ray rotation speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

/* ------------------------------------------------------------------ */
/*  Seeded PRNG helpers                                                */
/* ------------------------------------------------------------------ */

/** Deterministic jitter per frame for bolt vertices. */
function frameSeed(frame: number, salt: number): () => number {
  return seeded(frame * 7919 + salt);
}

/* ------------------------------------------------------------------ */
/*  Skull bezier path builder                                          */
/* ------------------------------------------------------------------ */

interface Vec2 { x: number; y: number; }

/**
 * Build the skull outline as one continuous bezier path.
 * All coordinates in normalized -1..1 space, later scaled by stealieR.
 * `breathAmt` deforms the cranium outward and jaw inward (shape breathing).
 * `bassAmt` drops the jaw further.
 */
function buildSkullPath(breathAmt: number, bassAmt: number): Vec2[] {
  // Cranium dome control points -- expand with breath
  const crExp = 1 + breathAmt * 0.08; // cranium expands
  const jawContract = 1 - breathAmt * 0.04 + bassAmt * 0.03; // jaw contracts/drops

  // The skull as a series of cubic bezier segments (start, cp1, cp2, end per segment)
  // We trace clockwise from top-center
  return [
    // Top of cranium (slight asymmetry -- left side 2% wider)
    { x: 0.00, y: -0.82 * crExp },
    // Right cranium dome
    { x: 0.38 * crExp, y: -0.84 * crExp },
    { x: 0.68 * crExp, y: -0.72 * crExp },
    { x: 0.72 * crExp, y: -0.48 * crExp },
    // Right temple ridge
    { x: 0.74 * crExp, y: -0.30 * crExp },
    { x: 0.71, y: -0.12 },
    { x: 0.66, y: 0.00 },
    // Right cheekbone
    { x: 0.63, y: 0.10 },
    { x: 0.58, y: 0.22 },
    { x: 0.48, y: 0.32 * jawContract },
    // Right jaw
    { x: 0.38, y: 0.42 * jawContract },
    { x: 0.22, y: 0.56 * jawContract },
    { x: 0.00, y: 0.62 * jawContract + bassAmt * 0.04 },
    // Left jaw (mirrored with slight asymmetry)
    { x: -0.23, y: 0.55 * jawContract },
    { x: -0.39, y: 0.41 * jawContract },
    { x: -0.49, y: 0.31 * jawContract },
    // Left cheekbone
    { x: -0.59, y: 0.21 },
    { x: -0.64, y: 0.09 },
    { x: -0.67, y: -0.01 },
    // Left temple ridge
    { x: -0.72, y: -0.13 },
    { x: -0.75 * crExp, y: -0.31 * crExp },
    { x: -0.73 * crExp, y: -0.49 * crExp },
    // Left cranium dome
    { x: -0.69 * crExp, y: -0.73 * crExp },
    { x: -0.39 * crExp, y: -0.85 * crExp },
    { x: 0.00, y: -0.82 * crExp },
  ];
}

/** Convert skull points array to SVG cubic bezier path string. */
function skullToSvgPath(
  pts: Vec2[],
  cx: number,
  cy: number,
  r: number,
): string {
  const s = (p: Vec2) => `${cx + p.x * r} ${cy + p.y * r}`;
  // Move to start
  let d = `M ${s(pts[0])}`;
  // Every 3 points = one cubic bezier segment (cp1, cp2, end)
  for (let i = 1; i < pts.length - 1; i += 3) {
    const cp1 = pts[i];
    const cp2 = pts[i + 1];
    const end = pts[i + 2];
    if (cp1 && cp2 && end) {
      d += ` C ${s(cp1)} ${s(cp2)} ${s(end)}`;
    }
  }
  d += " Z";
  return d;
}

/* ------------------------------------------------------------------ */
/*  Eye socket paths (organic, not ellipses)                           */
/* ------------------------------------------------------------------ */

function buildEyeSocket(
  centerX: number,
  centerY: number,
  cx: number,
  cy: number,
  r: number,
  mirror: boolean,
): string {
  const m = mirror ? -1 : 1;
  const ex = cx + centerX * r;
  const ey = cy + centerY * r;
  const w = r * 0.17;
  const h = r * 0.14;
  // Organic eye shape: wider at top, narrower at bottom, slight tilt
  return [
    `M ${ex - w * 0.3 * m} ${ey - h * 0.95}`,
    `C ${ex + w * 0.6 * m} ${ey - h * 1.1} ${ex + w * 1.05 * m} ${ey - h * 0.5} ${ex + w * 0.9 * m} ${ey + h * 0.1}`,
    `C ${ex + w * 0.75 * m} ${ey + h * 0.7} ${ex + w * 0.3 * m} ${ey + h * 1.0} ${ex - w * 0.1 * m} ${ey + h * 0.85}`,
    `C ${ex - w * 0.6 * m} ${ey + h * 0.65} ${ex - w * 1.0 * m} ${ey + h * 0.1} ${ex - w * 0.95 * m} ${ey - h * 0.4}`,
    `C ${ex - w * 0.85 * m} ${ey - h * 0.85} ${ex - w * 0.6 * m} ${ey - h * 1.0} ${ex - w * 0.3 * m} ${ey - h * 0.95}`,
    "Z",
  ].join(" ");
}

/* ------------------------------------------------------------------ */
/*  Lightning bolt generator                                           */
/* ------------------------------------------------------------------ */

interface BoltSegment { x1: number; y1: number; x2: number; y2: number; }

function generateBolt(
  frame: number,
  cx: number,
  cy: number,
  r: number,
  onsetIntensity: number,
): { main: BoltSegment[]; forks: BoltSegment[][] } {
  const rng = frameSeed(frame, 42_137);

  // Main bolt vertices -- 13 points zigzagging top to bottom
  const jitter = 0.012 + onsetIntensity * 0.008;
  const basePoints: Vec2[] = [
    { x: 0.04, y: -0.88 },
    { x: -0.16, y: -0.18 },
    { x: 0.05, y: -0.18 },
    { x: -0.19, y: 0.18 },
    { x: -0.03, y: 0.18 },
    { x: -0.21, y: 0.88 },
    // Return path (right side)
    { x: 0.17, y: 0.10 },
    { x: -0.03, y: 0.10 },
    { x: 0.21, y: -0.30 },
    { x: 0.05, y: -0.30 },
    { x: 0.15, y: -0.88 },
  ];

  // Apply per-frame jitter to each vertex
  const jittered = basePoints.map((p) => ({
    x: p.x + (rng() - 0.5) * jitter * 2,
    y: p.y + (rng() - 0.5) * jitter * 1.5,
  }));

  // Convert to screen-space segments
  const main: BoltSegment[] = [];
  for (let i = 0; i < jittered.length - 1; i++) {
    main.push({
      x1: cx + jittered[i].x * r,
      y1: cy + jittered[i].y * r,
      x2: cx + jittered[i + 1].x * r,
      y2: cy + jittered[i + 1].y * r,
    });
  }

  // Forks on onset hits
  const forks: BoltSegment[][] = [];
  if (onsetIntensity > 0.5) {
    const forkCount = Math.min(4, Math.floor(1 + (onsetIntensity - 0.5) * 6));
    const forkRng = frameSeed(frame, 88_741);

    for (let f = 0; f < forkCount; f++) {
      // Pick a random point along the main bolt to fork from
      const srcIdx = Math.floor(forkRng() * (jittered.length - 2)) + 1;
      const src = jittered[srcIdx];
      const fork: BoltSegment[] = [];
      let px = cx + src.x * r;
      let py = cy + src.y * r;

      // Each fork has 2-4 segments
      const segCount = 2 + Math.floor(forkRng() * 3);
      const baseAngle = (forkRng() - 0.5) * Math.PI * 0.8;
      for (let s = 0; s < segCount; s++) {
        const angle = baseAngle + (forkRng() - 0.5) * 0.6;
        const len = r * (0.06 + forkRng() * 0.10) * (1 - s * 0.2);
        const nx = px + Math.cos(angle) * len;
        const ny = py + Math.sin(angle) * len * 0.7;
        fork.push({ x1: px, y1: py, x2: nx, y2: ny });
        px = nx;
        py = ny;
      }
      forks.push(fork);
    }
  }

  return { main, forks };
}

/** Convert bolt segments to SVG path for the filled bolt shape. */
function boltToFillPath(
  frame: number,
  cx: number,
  cy: number,
  r: number,
  jitterAmt: number,
): string {
  const rng = frameSeed(frame, 42_137);
  const j = jitterAmt;
  // Same base shape as the segment version, but as a closed polygon
  const pts: Vec2[] = [
    { x: 0.04, y: -0.88 },
    { x: -0.16, y: -0.18 },
    { x: 0.05, y: -0.18 },
    { x: -0.19, y: 0.18 },
    { x: -0.03, y: 0.18 },
    { x: -0.21, y: 0.88 },
    { x: 0.17, y: 0.10 },
    { x: -0.03, y: 0.10 },
    { x: 0.21, y: -0.30 },
    { x: 0.05, y: -0.30 },
    { x: 0.15, y: -0.88 },
  ];
  const jittered = pts.map((p) => ({
    x: cx + (p.x + (rng() - 0.5) * j * 2) * r,
    y: cy + (p.y + (rng() - 0.5) * j * 1.5) * r,
  }));
  return "M " + jittered.map((p) => `${p.x} ${p.y}`).join(" L ") + " Z";
}

/* ------------------------------------------------------------------ */
/*  Energy tendril generator                                           */
/* ------------------------------------------------------------------ */

interface Tendril { segments: Vec2[]; }

function generateTendrils(
  frame: number,
  cx: number,
  cy: number,
  r: number,
  energy: number,
  beatDecay: number,
): Tendril[] {
  if (energy < 0.6) return [];

  const count = Math.floor(interpolate(energy, [0.6, 1.0], [2, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  // Snap to new positions on beats (use quantized frame)
  const beatFrame = beatDecay > 0.5 ? Math.floor(frame / 4) * 4 : Math.floor(frame / 8) * 8;
  const rng = frameSeed(beatFrame, 55_321);

  const tendrils: Tendril[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const startR = r * 0.78;
    const segments: Vec2[] = [
      { x: cx + Math.cos(angle) * startR, y: cy + Math.sin(angle) * startR },
    ];

    let a = angle;
    let rad = startR;
    const segCount = 3 + Math.floor(rng() * 3);
    for (let s = 0; s < segCount; s++) {
      a += (rng() - 0.5) * 0.8;
      rad += r * (0.05 + rng() * 0.08);
      segments.push({
        x: cx + Math.cos(a) * rad,
        y: cy + Math.sin(a) * rad,
      });
    }
    tendrils.push({ segments });
  }
  return tendrils;
}

/* ------------------------------------------------------------------ */
/*  Halo ray data (pre-computed once)                                  */
/* ------------------------------------------------------------------ */

const RAY_COUNT = 16;

interface RayData { angle: number; widthMul: number; lengthMul: number; flickerPhase: number; }

function buildRays(): RayData[] {
  const rng = seeded(91_443_271);
  return Array.from({ length: RAY_COUNT }, (_, i) => ({
    angle: (i / RAY_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.12,
    widthMul: 0.7 + rng() * 0.6,
    lengthMul: 0.8 + rng() * 0.4,
    flickerPhase: rng() * Math.PI * 2,
  }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props { frames: EnhancedFrameData[]; }

export const BreathingStealie: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const rays = React.useMemo(buildRays, []);

  /* ── Cycle / visibility ── */
  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  /* ── Audio drives ── */
  const energy = interpolate(snap.energy, [0.02, 0.30], [0.15, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const slowE = interpolate(snap.slowEnergy, [0.02, 0.32], [0.30, 1.40], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bass = interpolate(snap.bass, [0.0, 0.65], [0.15, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const onset = snap.onsetEnvelope;
  const beat = snap.beatDecay;

  // Breathing amount: sinusoidal base + slow energy modulation
  const breathAmt = Math.sin(frame * 0.018) * 0.5 + slowE * 0.5;
  // Bolt pulse ripple from beat
  const boltPulse = 1 + beat * 0.08;
  // Flash on onset
  const flash = onset > 0.5 ? Math.min(1, (onset - 0.4) * 1.7) : 0;

  /* ── Color palette ── */
  const hueShift = (snap.chromaHue - 180) * 0.3;
  const redHue = 355 + energy * 6 + hueShift * 0.4;
  const blueHue = 220 - energy * 5 + hueShift * 0.6;
  const boltGoldHue = 42 + hueShift * 0.2;
  const ringHue = 42 + hueShift * 0.15;

  /* ── Geometry ── */
  const cx = width / 2;
  const cy = height / 2;
  const baseR = Math.min(width, height) * 0.28;
  const stealieR = baseR * (1 + breathAmt * 0.06);
  const ringStroke = `hsl(${ringHue}, 55%, ${68 + energy * 8}%)`;

  /* ── Build skull path ── */
  const skullPts = buildSkullPath(breathAmt, bass);
  const skullPath = skullToSvgPath(skullPts, cx, cy, stealieR * 0.88);

  /* ── Build eye sockets ── */
  const leftEyePath = buildEyeSocket(-0.34, -0.28, cx, cy, stealieR * 0.88, false);
  const rightEyePath = buildEyeSocket(0.34, -0.28, cx, cy, stealieR * 0.88, true);

  /* ── Build lightning bolt ── */
  const jitterAmt = 0.012 + onset * 0.008;
  const boltFillPath = boltToFillPath(frame, cx, cy, stealieR * 0.88, jitterAmt);
  const boltData = generateBolt(frame, cx, cy, stealieR * 0.88, onset);

  /* ── Build tendrils ── */
  const tendrils = generateTendrils(frame, cx, cy, stealieR, energy, beat);

  /* ── Halo rotation ── */
  const fieldRotation = (frame * 0.05 * tempoFactor) % 360;

  /* ── Unique IDs for this instance ── */
  const uid = "bs";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          {/* Blurs */}
          <filter id={`${uid}-blur-lg`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id={`${uid}-blur-md`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id={`${uid}-blur-sm`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id={`${uid}-blur-tendril`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" />
          </filter>

          {/* Radial glow from skull center */}
          <radialGradient id={`${uid}-center-glow`}>
            <stop offset="0%" stopColor={`hsla(${boltGoldHue}, 70%, 80%, ${0.35 * slowE})`} />
            <stop offset="35%" stopColor={`hsla(${boltGoldHue}, 60%, 60%, ${0.15 * slowE})`} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>

          {/* Halo gradient */}
          <radialGradient id={`${uid}-halo`}>
            <stop offset="0%" stopColor={`hsla(${boltGoldHue}, 50%, 75%, 0.4)`} />
            <stop offset="50%" stopColor={`hsla(${boltGoldHue + 20}, 40%, 50%, 0.12)`} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>

          {/* Eye socket depth gradient */}
          <radialGradient id={`${uid}-socket-depth`}>
            <stop offset="0%" stopColor={`hsla(${boltGoldHue}, 30%, 20%, 0.15)`} />
            <stop offset="50%" stopColor="rgba(5,2,10,0.1)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>

          {/* Eye fire gradient */}
          <radialGradient id={`${uid}-eye-fire`}>
            <stop offset="0%" stopColor={`hsla(${boltGoldHue - 5}, 80%, 85%, ${0.7 + energy * 0.3})`} />
            <stop offset="50%" stopColor={`hsla(${redHue}, 70%, 50%, ${0.3 + energy * 0.2})`} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>

          {/* Bolt gradient -- rich gold with depth */}
          <linearGradient id={`${uid}-bolt-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe88a" />
            <stop offset="30%" stopColor="#e8b820" />
            <stop offset="65%" stopColor="#cc8800" />
            <stop offset="100%" stopColor="#a06000" />
          </linearGradient>

          {/* Red half gradient */}
          <linearGradient id={`${uid}-red-half`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${redHue}, 88%, 42%)`} />
            <stop offset="100%" stopColor={`hsl(${redHue}, 82%, 18%)`} />
          </linearGradient>

          {/* Blue half gradient */}
          <linearGradient id={`${uid}-blue-half`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${blueHue}, 80%, 40%)`} />
            <stop offset="100%" stopColor={`hsl(${blueHue}, 75%, 16%)`} />
          </linearGradient>

          {/* Vignette */}
          <radialGradient id={`${uid}-vig`}>
            <stop offset="50%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.6)" />
          </radialGradient>

          {/* Clip paths -- skull shape for red/blue halves */}
          <clipPath id={`${uid}-skull-clip`}>
            <path d={skullPath} />
          </clipPath>
          <clipPath id={`${uid}-left-clip`}>
            <rect x={cx - stealieR} y={cy - stealieR} width={stealieR} height={stealieR * 2.5} />
          </clipPath>
          <clipPath id={`${uid}-right-clip`}>
            <rect x={cx} y={cy - stealieR} width={stealieR} height={stealieR * 2.5} />
          </clipPath>
        </defs>

        {/* ── RADIAL GLOW from center ── */}
        <circle
          cx={cx} cy={cy}
          r={stealieR * (1.8 + slowE * 0.3)}
          fill={`url(#${uid}-center-glow)`}
          style={{ mixBlendMode: "screen" }}
        />

        {/* ── HALO RAYS -- flickering, organic ── */}
        <g
          transform={`translate(${cx}, ${cy}) rotate(${fieldRotation})`}
          style={{ mixBlendMode: "screen" }}
          filter={`url(#${uid}-blur-md)`}
        >
          {rays.map((r, i) => {
            const flicker = 0.5 + Math.sin(frame * 0.06 + r.flickerPhase) * 0.3
              + Math.sin(frame * 0.11 + r.flickerPhase * 2.3) * 0.2;
            const len = stealieR * (1.1 + energy * 0.8) * r.lengthMul * flicker;
            const w = (6 + energy * 28) * r.widthMul;
            const a = r.angle;
            const x2 = Math.cos(a) * len;
            const y2 = Math.sin(a) * len;
            return (
              <path
                key={`ray-${i}`}
                d={`M 0 0 L ${x2 - Math.sin(a) * w * 0.5} ${y2 + Math.cos(a) * w * 0.5} L ${x2 + Math.sin(a) * w * 0.5} ${y2 - Math.cos(a) * w * 0.5} Z`}
                fill={`hsla(${boltGoldHue}, 50%, 70%, ${0.08 * energy * slowE * flicker})`}
              />
            );
          })}
        </g>

        {/* ── OUTER RING -- aged brass ── */}
        <circle
          cx={cx} cy={cy} r={stealieR * 0.92}
          fill="none" stroke={ringStroke}
          strokeWidth={Math.max(3.5, stealieR * 0.038)}
          opacity={0.85}
        />
        <circle
          cx={cx} cy={cy} r={stealieR * 0.87}
          fill="none" stroke={ringStroke}
          strokeWidth={Math.max(1.2, stealieR * 0.013)}
          opacity={0.45}
        />

        {/* ── SKULL HALVES -- red left, blue right, clipped to skull shape ── */}
        <g clipPath={`url(#${uid}-skull-clip)`}>
          {/* Red half (left) */}
          <g clipPath={`url(#${uid}-left-clip)`}>
            <rect
              x={cx - stealieR} y={cy - stealieR}
              width={stealieR} height={stealieR * 2.5}
              fill={`url(#${uid}-red-half)`}
            />
          </g>
          {/* Blue half (right) */}
          <g clipPath={`url(#${uid}-right-clip)`}>
            <rect
              x={cx} y={cy - stealieR}
              width={stealieR} height={stealieR * 2.5}
              fill={`url(#${uid}-blue-half)`}
            />
          </g>

          {/* Cranium highlight -- subtle top shading */}
          <ellipse
            cx={cx} cy={cy - stealieR * 0.45}
            rx={stealieR * 0.55} ry={stealieR * 0.22}
            fill="rgba(255, 240, 220, 0.09)"
          />
          {/* Jaw shadow */}
          <ellipse
            cx={cx} cy={cy + stealieR * 0.40}
            rx={stealieR * 0.48} ry={stealieR * 0.18}
            fill="rgba(0, 0, 0, 0.22)"
          />
        </g>

        {/* ── SKULL OUTLINE -- the bezier silhouette ── */}
        <path
          d={skullPath}
          fill="none" stroke={ringStroke}
          strokeWidth={Math.max(2, stealieR * 0.022)}
          strokeLinejoin="round"
          opacity={0.7}
        />

        {/* ── HORIZONTAL DIVIDER ── */}
        <line
          x1={cx - stealieR * 0.82} y1={cy}
          x2={cx + stealieR * 0.82} y2={cy}
          stroke={ringStroke}
          strokeWidth={Math.max(2, stealieR * 0.022)}
          opacity={0.8}
        />

        {/* ── EYE SOCKETS -- organic bezier shapes with depth ── */}
        <path d={leftEyePath} fill={`url(#${uid}-socket-depth)`} stroke={ringStroke} strokeWidth={Math.max(1.5, stealieR * 0.018)} />
        <path d={rightEyePath} fill={`url(#${uid}-socket-depth)`} stroke={ringStroke} strokeWidth={Math.max(1.5, stealieR * 0.018)} />

        {/* Eye fire glow -- pulsating with energy */}
        <g filter={`url(#${uid}-blur-sm)`} style={{ mixBlendMode: "screen" }}>
          <ellipse
            cx={cx - 0.34 * stealieR * 0.88} cy={cy - 0.28 * stealieR * 0.88}
            rx={stealieR * 0.10 * (0.5 + energy * 0.6)}
            ry={stealieR * 0.08 * (0.5 + energy * 0.6)}
            fill={`url(#${uid}-eye-fire)`}
          />
          <ellipse
            cx={cx + 0.34 * stealieR * 0.88} cy={cy - 0.28 * stealieR * 0.88}
            rx={stealieR * 0.10 * (0.5 + energy * 0.6)}
            ry={stealieR * 0.08 * (0.5 + energy * 0.6)}
            fill={`url(#${uid}-eye-fire)`}
          />
        </g>

        {/* ── NOSE -- triangular cavity ── */}
        <path
          d={`M ${cx} ${cy - stealieR * 0.88 * 0.08} L ${cx - stealieR * 0.06} ${cy + stealieR * 0.88 * 0.06} L ${cx + stealieR * 0.06} ${cy + stealieR * 0.88 * 0.06} Z`}
          fill="rgba(0,0,0,0.45)" stroke={ringStroke}
          strokeWidth={Math.max(1, stealieR * 0.012)}
          opacity={0.6}
        />

        {/* ── LIGHTNING BOLT -- three layers: outer glow, main body, inner core ── */}
        <g style={{ transform: `scale(${boltPulse})`, transformOrigin: `${cx}px ${cy}px` }}>
          {/* Layer 1: outer glow (wide blur) */}
          <g filter={`url(#${uid}-blur-lg)`} style={{ mixBlendMode: "screen" }}>
            <path
              d={boltFillPath}
              fill={`hsla(${boltGoldHue}, 90%, 65%, ${0.5 + flash * 0.4})`}
            />
          </g>

          {/* Layer 2: main body (gradient fill) */}
          <path
            d={boltFillPath}
            fill={`url(#${uid}-bolt-grad)`}
            opacity={0.95}
          />

          {/* Layer 3: inner core (near-white, slightly smaller via stroke trick) */}
          <path
            d={boltFillPath}
            fill={`rgba(255, 252, 230, ${0.35 + flash * 0.5})`}
            style={{ mixBlendMode: "screen" }}
            transform={`translate(${cx * 0.005}, ${cy * 0.003}) scale(0.94)`}
          />

          {/* Bolt edge shimmer */}
          {boltData.main.map((seg, i) => (
            <line
              key={`bolt-edge-${i}`}
              x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
              stroke={`rgba(255, 255, 240, ${0.08 + flash * 0.12})`}
              strokeWidth={1.2}
              strokeLinecap="round"
            />
          ))}

          {/* Bolt forks on onset */}
          {boltData.forks.map((fork, fi) => (
            <g key={`fork-${fi}`}>
              {/* Fork glow */}
              <g filter={`url(#${uid}-blur-sm)`} style={{ mixBlendMode: "screen" }}>
                {fork.map((seg, si) => (
                  <line
                    key={`fg-${fi}-${si}`}
                    x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                    stroke={`hsla(${boltGoldHue}, 80%, 70%, ${0.5 * (1 - si / fork.length)})`}
                    strokeWidth={3 - si * 0.5}
                    strokeLinecap="round"
                  />
                ))}
              </g>
              {/* Fork core */}
              {fork.map((seg, si) => (
                <line
                  key={`fc-${fi}-${si}`}
                  x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                  stroke={`rgba(255, 250, 210, ${0.7 * (1 - si / fork.length)})`}
                  strokeWidth={1.5 - si * 0.3}
                  strokeLinecap="round"
                />
              ))}
            </g>
          ))}
        </g>

        {/* ── ENERGY TENDRILS -- electric jagged lines from skull perimeter ── */}
        {tendrils.length > 0 && (
          <g style={{ mixBlendMode: "screen" }}>
            {tendrils.map((t, ti) => {
              const pathD = t.segments.map((s, si) =>
                si === 0 ? `M ${s.x} ${s.y}` : `L ${s.x} ${s.y}`,
              ).join(" ");
              const tendrilOpacity = interpolate(energy, [0.6, 1.0], [0.3, 0.8], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <g key={`tendril-${ti}`}>
                  {/* Tendril glow */}
                  <path
                    d={pathD} fill="none"
                    stroke={`hsla(${boltGoldHue + 10}, 70%, 65%, ${tendrilOpacity * 0.5})`}
                    strokeWidth={3}
                    strokeLinecap="round" strokeLinejoin="round"
                    filter={`url(#${uid}-blur-tendril)`}
                  />
                  {/* Tendril core */}
                  <path
                    d={pathD} fill="none"
                    stroke={`rgba(255, 250, 220, ${tendrilOpacity})`}
                    strokeWidth={1.2}
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                </g>
              );
            })}
          </g>
        )}

        {/* ── ONSET WHITE FLASH ── */}
        {flash > 0.05 && (
          <circle
            cx={cx} cy={cy}
            r={stealieR * (1.0 + flash * 0.4)}
            fill={`rgba(255, 255, 240, ${flash * 0.15})`}
            style={{ mixBlendMode: "screen" }}
          />
        )}

        {/* ── BEAT PULSE RING -- ripples outward from bolt ── */}
        {beat > 0.1 && (
          <circle
            cx={cx} cy={cy}
            r={stealieR * (0.9 + (1 - beat) * 0.3)}
            fill="none"
            stroke={`hsla(${boltGoldHue}, 60%, 75%, ${beat * 0.25})`}
            strokeWidth={1.5 + beat * 2}
            style={{ mixBlendMode: "screen" }}
          />
        )}

        {/* ── VIGNETTE ── */}
        <rect width={width} height={height} fill={`url(#${uid}-vig)`} />
      </svg>
    </div>
  );
};
