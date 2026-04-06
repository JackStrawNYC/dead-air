/**
 * HeatShimmer — A+++ atmospheric heat distortion for Veneta 8/27/72.
 *
 * Veneta was 100°F+. The crowd melted. The asphalt rippled. Heat rose off
 * everything in wavering bands of broken air. This overlay captures that
 * feverish, mirage-haunted atmosphere — the wavering, unstable summer where
 * the world refused to stay still during jam sections.
 *
 * Layered system:
 *   1. Hot amber wash gradient covering the full frame
 *   2. 8-12 horizontal heat shimmer bands at varied heights, rising slowly
 *      and recycling at the top (each band uses feTurbulence + feDisplacementMap
 *      for true SVG distortion)
 *   3. Wider mirage zone in lower 30% — denser displacement, suggesting heat
 *      off pavement / dry grass
 *   4. 4-6 thin steam wisps rising from the bottom on cubic bezier curves
 *      that morph slowly over time, very low opacity, gaussian blurred
 *   5. 20-30 dust motes drifting upward in the updrafts, only visible inside
 *      the diagonal light shafts
 *   6. 3 diagonal warm light shafts cutting across the frame, soft feathered
 *      edges, beat-pulsing intensity
 *
 * Audio reactivity:
 *   - slowEnergy → shimmer intensity (more shimmer in contemplative jams)
 *   - energy     → mote density + steam vigor
 *   - bass       → updraft strength (faster mote rise, steam morph)
 *   - chromaHue  → warm tint shifts amber ↔ gold ↔ rust
 *   - beatDecay  → light shaft pulse
 *   - tempoFactor → shimmer scroll speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SHIMMER_BAND_COUNT = 10;
const STEAM_WISP_COUNT = 5;
const MOTE_COUNT = 26;
const LIGHT_SHAFT_COUNT = 3;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ShimmerBand {
  /** Initial vertical position 0-1 (recycles) */
  yStart: number;
  /** Half-height of the band as a fraction of frame height */
  thickness: number;
  /** Rise speed in fraction-of-frame per frame */
  rise: number;
  /** feTurbulence base frequency X (low = wide warps) */
  freqX: number;
  /** feTurbulence base frequency Y */
  freqY: number;
  /** Octaves of noise */
  octaves: number;
  /** Random seed for the turbulence */
  seed: number;
  /** Displacement scale (px) */
  scale: number;
  /** Phase offset for wave */
  phase: number;
  /** Amber tint hue shift (degrees) */
  hueOffset: number;
}

interface SteamWisp {
  xFrac: number;
  /** Amplitude of horizontal sway */
  sway: number;
  /** Length of the wisp as a fraction of frame height */
  length: number;
  /** Phase for morph */
  phase: number;
  /** Morph rate */
  morph: number;
  /** Width */
  width: number;
}

interface DustMote {
  xFrac: number;
  yFrac: number;
  rise: number;
  drift: number;
  phase: number;
  size: number;
  /** Which light shaft (0..LIGHT_SHAFT_COUNT-1) it is visible inside */
  shaftIdx: number;
}

interface LightShaft {
  /** X anchor at top of frame, as fraction */
  topX: number;
  /** Angle in degrees from vertical (positive = leans right) */
  angle: number;
  /** Width at the widest point (px) */
  width: number;
  /** Base intensity 0-1 */
  intensity: number;
  /** Phase for slow drift */
  phase: number;
}

/* ------------------------------------------------------------------ */
/*  Deterministic data generators                                      */
/* ------------------------------------------------------------------ */

function generateBands(seed: number): ShimmerBand[] {
  const rng = seeded(seed);
  return Array.from({ length: SHIMMER_BAND_COUNT }, (_, i) => {
    // Distribute across full height with jitter
    const stride = 1 / SHIMMER_BAND_COUNT;
    return {
      yStart: i * stride + rng() * stride,
      thickness: 0.04 + rng() * 0.06,
      rise: 0.0009 + rng() * 0.0014,
      freqX: 0.009 + rng() * 0.018,
      freqY: 0.012 + rng() * 0.022,
      octaves: 2 + Math.floor(rng() * 3),
      seed: Math.floor(rng() * 9999),
      scale: 4 + rng() * 9,
      phase: rng() * 100,
      hueOffset: -8 + rng() * 16,
    };
  });
}

function generateWisps(seed: number): SteamWisp[] {
  const rng = seeded(seed * 7 + 13);
  return Array.from({ length: STEAM_WISP_COUNT }, (_, i) => ({
    xFrac: 0.08 + (i / STEAM_WISP_COUNT) * 0.84 + (rng() - 0.5) * 0.06,
    sway: 18 + rng() * 28,
    length: 0.42 + rng() * 0.32,
    phase: rng() * Math.PI * 2,
    morph: 0.006 + rng() * 0.012,
    width: 14 + rng() * 16,
  }));
}

function generateMotes(seed: number): DustMote[] {
  const rng = seeded(seed * 11 + 29);
  return Array.from({ length: MOTE_COUNT }, () => ({
    xFrac: rng(),
    yFrac: rng(),
    rise: 0.0011 + rng() * 0.0022,
    drift: 0.4 + rng() * 1.6,
    phase: rng() * Math.PI * 2,
    size: 1.1 + rng() * 1.9,
    shaftIdx: Math.floor(rng() * LIGHT_SHAFT_COUNT),
  }));
}

function generateShafts(seed: number): LightShaft[] {
  const rng = seeded(seed * 17 + 41);
  return Array.from({ length: LIGHT_SHAFT_COUNT }, (_, i) => ({
    topX: 0.18 + (i / LIGHT_SHAFT_COUNT) * 0.66 + (rng() - 0.5) * 0.08,
    angle: -22 + rng() * 18 + i * 4,
    width: 220 + rng() * 160,
    intensity: 0.55 + rng() * 0.35,
    phase: rng() * Math.PI * 2,
  }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const HeatShimmer: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const bands = React.useMemo(() => generateBands(8271972), []);
  const wisps = React.useMemo(() => generateWisps(8271972), []);
  const motes = React.useMemo(() => generateMotes(8271972), []);
  const shafts = React.useMemo(() => generateShafts(8271972), []);

  /* Audio drives ---------------------------------------------------- */
  const shimmerIntensity = interpolate(snap.slowEnergy, [0.02, 0.28], [0.55, 1.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const moteDensity = interpolate(snap.energy, [0.02, 0.32], [0.4, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const updraftPush = interpolate(snap.bass, [0, 0.6], [1.0, 2.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shaftPulse = 0.74 + snap.beatDecay * 0.34;

  // chromaHue (0..1) → amber/gold tint shift in degrees
  const hueShift = interpolate(snap.chromaHue, [0, 1], [-14, 18]);
  const baseHue = 36 + hueShift; // amber base
  const warmA = `hsla(${baseHue}, 88%, 64%, 1)`;
  const warmB = `hsla(${baseHue + 8}, 82%, 56%, 1)`;
  const warmRust = `hsla(${baseHue - 12}, 78%, 48%, 1)`;

  /* Time scrub ------------------------------------------------------ */
  const tShim = frame * tempoFactor;

  /* ----------------------------------------------------------------- */
  /*  Master amber wash opacity                                         */
  /* ----------------------------------------------------------------- */
  const washOpacity = 0.06 + shimmerIntensity * 0.06;
  const masterOpacity = 0.32 + shimmerIntensity * 0.22;

  /* ----------------------------------------------------------------- */
  /*  Helpers                                                           */
  /* ----------------------------------------------------------------- */

  /** Wrap a value into [0, 1) for recycling bands */
  const wrap = (v: number) => v - Math.floor(v);

  /* ----------------------------------------------------------------- */
  /*  Render                                                            */
  /* ----------------------------------------------------------------- */
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        opacity: masterOpacity,
        mixBlendMode: "screen",
      }}
    >
      <svg width={width} height={height}>
        <defs>
          {/* Master amber wash */}
          <linearGradient id="hs-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={warmA} stopOpacity="0.04" />
            <stop offset="0.4" stopColor={warmB} stopOpacity="0.08" />
            <stop offset="1" stopColor={warmRust} stopOpacity="0.18" />
          </linearGradient>

          {/* Mirage zone gradient (lower 30%) */}
          <linearGradient id="hs-mirage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={warmB} stopOpacity="0" />
            <stop offset="0.45" stopColor={warmA} stopOpacity="0.22" />
            <stop offset="1" stopColor={warmRust} stopOpacity="0.42" />
          </linearGradient>

          {/* Soft glow blur for motes */}
          <filter id="hs-mote-glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>

          {/* Wisp blur */}
          <filter id="hs-wisp-blur" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3.6" />
          </filter>

          {/* Shaft soft edge */}
          <filter id="hs-shaft-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="22" />
          </filter>

          {/* Mirage zone displacement filter — wider, slower warp */}
          <filter id="hs-mirage-disp" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.028"
              numOctaves={3}
              seed={4242}
            >
              <animate
                attributeName="baseFrequency"
                dur="9s"
                values="0.012 0.028; 0.018 0.036; 0.012 0.028"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale={14 * shimmerIntensity} />
          </filter>

          {/* Per-band displacement filters (one filter per band) */}
          {bands.map((b, i) => (
            <filter
              key={`hs-bf-${i}`}
              id={`hs-band-disp-${i}`}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency={`${b.freqX} ${b.freqY}`}
                numOctaves={b.octaves}
                seed={b.seed}
              >
                <animate
                  attributeName="baseFrequency"
                  dur={`${5 + (i % 4)}s`}
                  values={`${b.freqX} ${b.freqY}; ${b.freqX * 1.45} ${b.freqY * 1.3}; ${b.freqX} ${b.freqY}`}
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" scale={b.scale * shimmerIntensity} />
            </filter>
          ))}

          {/* Light shaft gradients (radial fade for soft cone edges) */}
          {shafts.map((s, i) => (
            <linearGradient
              key={`hs-sg-${i}`}
              id={`hs-shaft-grad-${i}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0" stopColor={warmA} stopOpacity="0" />
              <stop offset="0.18" stopColor={warmA} stopOpacity={0.18 * s.intensity} />
              <stop offset="0.55" stopColor={warmB} stopOpacity={0.32 * s.intensity} />
              <stop offset="1" stopColor={warmRust} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* ── Layer 1: Master amber wash over the full frame ─────── */}
        <rect x={0} y={0} width={width} height={height} fill="url(#hs-wash)" opacity={washOpacity} />

        {/* ── Layer 2: Diagonal warm light shafts ────────────────── */}
        {shafts.map((s, i) => {
          const driftX = Math.sin(tShim * 0.004 + s.phase) * 22;
          const cx = s.topX * width + driftX;
          // Build a long parallelogram tilted by s.angle
          const angRad = (s.angle * Math.PI) / 180;
          const dx = Math.sin(angRad) * height * 1.4;
          const halfW = s.width * 0.5;
          const x1 = cx - halfW;
          const x2 = cx + halfW;
          const x3 = cx + halfW + dx;
          const x4 = cx - halfW + dx;
          const path = `M ${x1} ${-50} L ${x2} ${-50} L ${x3} ${height + 50} L ${x4} ${height + 50} Z`;
          const op = shaftPulse * (0.55 + Math.sin(tShim * 0.018 + s.phase) * 0.15);
          return (
            <g key={`hs-shaft-${i}`}>
              <path
                d={path}
                fill={`url(#hs-shaft-grad-${i})`}
                opacity={op}
                filter="url(#hs-shaft-blur)"
              />
              {/* Inner brighter core */}
              <path
                d={path}
                fill={warmA}
                opacity={op * 0.18}
                filter="url(#hs-shaft-blur)"
              />
            </g>
          );
        })}

        {/* ── Layer 3: Horizontal heat shimmer bands ─────────────── */}
        {bands.map((b, i) => {
          const yNow = wrap(b.yStart - tShim * b.rise * updraftPush) * height;
          const bandH = b.thickness * height;
          // Fade as band approaches the top (death) and entering from bottom (birth)
          const lifeFade =
            yNow > height * 0.85
              ? interpolate(yNow, [height * 0.85, height], [1, 0.15], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })
              : yNow < height * 0.15
                ? interpolate(yNow, [0, height * 0.15], [0.25, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                : 1;
          const tint = `hsla(${baseHue + b.hueOffset}, 80%, 62%, 0.55)`;
          const tint2 = `hsla(${baseHue + b.hueOffset - 6}, 78%, 54%, 0.32)`;
          return (
            <g
              key={`hs-band-${i}`}
              filter={`url(#hs-band-disp-${i})`}
              opacity={0.6 * lifeFade}
            >
              {/* Primary band as a thin gradient stripe */}
              <rect
                x={-30}
                y={yNow - bandH * 0.5}
                width={width + 60}
                height={bandH}
                fill={tint}
              />
              {/* Brighter highlight line in the middle */}
              <rect
                x={-30}
                y={yNow - 1.4}
                width={width + 60}
                height={2.8}
                fill={tint2}
              />
            </g>
          );
        })}

        {/* ── Layer 4: Mirage zone (lower 30%) ───────────────────── */}
        <g filter="url(#hs-mirage-disp)" opacity={0.55 + shimmerIntensity * 0.25}>
          <rect
            x={0}
            y={height * 0.7}
            width={width}
            height={height * 0.3}
            fill="url(#hs-mirage)"
          />
          {/* Extra ripple stripes inside the mirage zone */}
          {Array.from({ length: 6 }).map((_, i) => {
            const yFrac = 0.72 + i * 0.045;
            const y = height * yFrac;
            const op = 0.18 + (1 - i / 6) * 0.22;
            const sway =
              Math.sin(tShim * 0.025 + i * 0.7) * 6 * shimmerIntensity;
            return (
              <line
                key={`hs-mline-${i}`}
                x1={-20}
                y1={y + sway}
                x2={width + 20}
                y2={y - sway}
                stroke={warmA}
                strokeWidth={1.4}
                opacity={op}
              />
            );
          })}
        </g>

        {/* ── Layer 5: Steam wisps rising from bottom ───────────── */}
        {wisps.map((w, i) => {
          const baseX = w.xFrac * width;
          const startY = height + 8;
          const endY = height * (1 - w.length);
          const morphT = tShim * w.morph + w.phase;
          // Wavering bezier control points
          const c1x = baseX + Math.sin(morphT) * w.sway * updraftPush;
          const c1y = startY - (startY - endY) * 0.35;
          const c2x = baseX + Math.sin(morphT * 1.4 + 1.7) * w.sway * 1.3;
          const c2y = startY - (startY - endY) * 0.7;
          const tipX = baseX + Math.sin(morphT * 0.8 + 3.1) * w.sway * 0.6;
          const tipY = endY + Math.sin(morphT * 0.5) * 14;
          const d = `M ${baseX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tipX} ${tipY}`;
          const op = 0.18 + Math.sin(morphT * 0.6 + i) * 0.06;
          return (
            <g key={`hs-wisp-${i}`} filter="url(#hs-wisp-blur)" opacity={op}>
              <path
                d={d}
                stroke={warmA}
                strokeWidth={w.width}
                strokeLinecap="round"
                fill="none"
                opacity={0.42}
              />
              <path
                d={d}
                stroke="rgba(255,245,220,1)"
                strokeWidth={w.width * 0.4}
                strokeLinecap="round"
                fill="none"
                opacity={0.55}
              />
            </g>
          );
        })}

        {/* ── Layer 6: Dust motes drifting in updrafts ───────────── */}
        {motes.map((m, i) => {
          // Recycling vertical position — slower than bands, faster with bass
          const yNorm = wrap(
            m.yFrac - tShim * m.rise * updraftPush + m.phase * 0.05,
          );
          const y = yNorm * height;
          // Sinusoidal drift
          const x =
            m.xFrac * width +
            Math.sin(tShim * 0.012 + m.phase) * 22 * m.drift;

          // Visibility: only inside the assigned light shaft
          const shaft = shafts[m.shaftIdx];
          const shaftDriftX = Math.sin(tShim * 0.004 + shaft.phase) * 22;
          const shaftCx = shaft.topX * width + shaftDriftX;
          const angRad = (shaft.angle * Math.PI) / 180;
          // Distance from mote to shaft centerline (parameterized line equation)
          const cxAtY = shaftCx + Math.sin(angRad) * y;
          const distFromCenter = Math.abs(x - cxAtY);
          const halfW = shaft.width * 0.55;
          const visibility = Math.max(0, 1 - distFromCenter / halfW);
          if (visibility < 0.05) return null;

          // Density gating
          if (i / MOTE_COUNT > moteDensity) return null;

          const r = m.size * (0.7 + Math.sin(tShim * 0.05 + m.phase) * 0.3);
          const op =
            visibility *
            (0.6 + Math.sin(tShim * 0.03 + m.phase * 1.7) * 0.3) *
            shaftPulse;
          return (
            <g key={`hs-mote-${i}`}>
              <circle
                cx={x}
                cy={y}
                r={r * 2.6}
                fill={warmA}
                opacity={op * 0.32}
                filter="url(#hs-mote-glow)"
              />
              <circle
                cx={x}
                cy={y}
                r={r}
                fill="rgba(255,250,225,1)"
                opacity={op}
              />
            </g>
          );
        })}

        {/* ── Layer 7: Subtle horizon shimmer line at the very bottom ── */}
        <line
          x1={0}
          y1={height - 2}
          x2={width}
          y2={height - 2}
          stroke={warmA}
          strokeWidth={1.2}
          opacity={0.4 * shimmerIntensity}
        />
      </svg>
    </div>
  );
};
