/**
 * WaveOfLight — Light itself as a phenomenon: a flowing wave of luminance
 * sweeping across the frame. Three-layer sine ribbon (atmospheric glow,
 * spectral body, white crest) + secondary harmonic, caustic light patterns,
 * prismatic scatter fragments, and bloom at peaks.
 *
 * Audio: bass→amplitude, mids→frequency, energy→brightness/bloom,
 *        chromaHue→spectral gradient, beatDecay→crest pulse,
 *        highs→scatter, onsetEnvelope→caustic distortion.
 * Layer 3 Reactive, Tier A+++.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ── Utilities ───────────────────────────────────────────────────── */

const hsl = (h: number, s: number, l: number, a = 1): string =>
  `hsla(${((h % 360) + 360) % 360},${Math.round(s * 100)}%,${Math.round(l * 100)}%,${a})`;

const spectralColor = (t: number, chromaHue: number, lightness = 0.55, alpha = 1): string =>
  hsl((t * 300 + chromaHue) % 360, 0.85, lightness, alpha);

const clampOpts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/* ── Wave geometry ───────────────────────────────────────────────── */

interface WavePoint { x: number; y: number; t: number }

function computeWavePoints(
  w: number, cy: number, amp: number, freq: number, phase: number, steps: number,
): WavePoint[] {
  const pts: WavePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wave = Math.sin(t * Math.PI * 2 * freq + phase)
      + 0.15 * Math.sin(t * Math.PI * 2 * freq * 3 + phase * 1.7);
    pts.push({ x: t * w, y: cy + wave * amp, t });
  }
  return pts;
}

function pointsToPath(pts: WavePoint[]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i];
    const p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const T = 0.35;
    d += ` C${(p1.x + (p2.x - p0.x) * T).toFixed(1)} ${(p1.y + (p2.y - p0.y) * T).toFixed(1)},`
      + `${(p2.x - (p3.x - p1.x) * T).toFixed(1)} ${(p2.y - (p3.y - p1.y) * T).toFixed(1)},`
      + `${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/* ── Caustic cells ───────────────────────────────────────────────── */

interface CausticCell { cx: number; cy: number; rx: number; ry: number; rot: number; op: number }

function computeCaustics(
  w: number, baseY: number, frame: number, tempo: number, energy: number, onset: number,
): CausticCell[] {
  const cells: CausticCell[] = [];
  const t = frame * 0.008 * tempo;
  for (let i = 0; i < 14; i++) {
    const s = i * 137.508;
    const cx = ((s * 0.618 + t * 0.3) % 1) * w + Math.sin(t + s) * 40 + Math.cos(t * 0.7 + s * 1.3) * 25;
    const cy = baseY + 30 + Math.sin(t * 0.5 + s * 0.8) * 20 + i * 8;
    const d = 1 + onset * 0.5;
    const rx = (18 + Math.sin(t * 1.2 + s) * 8) * d;
    const ry = (10 + Math.cos(t * 0.9 + s * 1.5) * 5) * d;
    const op = Math.max(0, (0.04 + energy * 0.06) * (0.5 + 0.5 * Math.sin(t * 1.5 + s)));
    cells.push({ cx, cy, rx, ry, rot: (t * 30 + s * 50) % 360, op });
  }
  return cells;
}

/* ── Scatter fragments ───────────────────────────────────────────── */

interface ScatterFrag { x: number; y: number; sz: number; hue: number; op: number; rot: number }

function computeScatter(
  wave: WavePoint[], frame: number, tempo: number, hi: number, beat: number, chroma: number,
): ScatterFrag[] {
  const frags: ScatterFrag[] = [];
  const t = frame * 0.012 * tempo;
  for (let i = 0; i < 18; i++) {
    const s = i * 97.531;
    const wi = Math.floor(((s * 0.618 + t * 0.05) % 1) * (wave.length - 1));
    const wp = wave[Math.min(wi, wave.length - 1)];
    const ang = (s * 2.39996 + t) % (Math.PI * 2);
    const dist = 8 + hi * 25 + Math.sin(t + s) * 10;
    frags.push({
      x: wp.x + Math.cos(ang) * dist,
      y: wp.y + Math.sin(ang) * dist * 0.6 - 10,
      sz: Math.max(1, 2 + hi * 4 + beat * 2),
      hue: (wp.t * 300 + chroma + i * 40) % 360,
      op: Math.max(0, Math.min(0.5, hi * 0.35 * (0.3 + 0.7 * Math.sin(t * 2 + s)))),
      rot: (t * 60 + s * 45) % 360,
    });
  }
  return frags;
}

/* ── Main component ──────────────────────────────────────────────── */

interface Props { frames: EnhancedFrameData[] }

export const WaveOfLight: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const { energy, bass, mids, highs, beatDecay, onsetEnvelope, chromaHue } = snap;

  const baseAmp = interpolate(bass, [0.05, 0.5], [30, 100], clampOpts);
  const waveFreq = interpolate(mids, [0.05, 0.5], [1.2, 3.0], clampOpts);
  const bright = interpolate(energy, [0.02, 0.4], [0.3, 1.0], clampOpts);
  const crestBright = interpolate(beatDecay, [0, 1], [0.6, 1.0], clampOpts);
  const overlayOp = interpolate(energy, [0.02, 0.3], [0.25, 0.6], clampOpts);

  const phase = frame * 0.025 * tempoFactor;
  const cy = height * 0.5;
  const STEPS = 120;

  const primary = useMemo(
    () => computeWavePoints(width, cy, baseAmp, waveFreq, phase, STEPS),
    [width, cy, baseAmp, waveFreq, phase],
  );
  const secondary = useMemo(
    () => computeWavePoints(width, cy, baseAmp * 0.45, waveFreq * 2, phase * 1.6 + 1.2, STEPS),
    [width, cy, baseAmp, waveFreq, phase],
  );

  const priPath = useMemo(() => pointsToPath(primary), [primary]);
  const secPath = useMemo(() => pointsToPath(secondary), [secondary]);

  const caustics = useMemo(
    () => computeCaustics(width, cy + baseAmp * 0.6, frame, tempoFactor, energy, onsetEnvelope),
    [width, cy, baseAmp, frame, tempoFactor, energy, onsetEnvelope],
  );
  const scatter = useMemo(
    () => computeScatter(primary, frame, tempoFactor, highs, beatDecay, chromaHue),
    [primary, frame, tempoFactor, highs, beatDecay, chromaHue],
  );

  // Bloom at wave peaks (local maxima)
  const blooms = useMemo(() => {
    const b: { x: number; y: number; i: number }[] = [];
    for (let i = 1; i < primary.length - 1; i++) {
      if (primary[i].y < primary[i - 1].y && primary[i].y < primary[i + 1].y) {
        const str = (cy - primary[i].y) / baseAmp;
        if (str > 0.3) b.push({ x: primary[i].x, y: primary[i].y, i: str });
      }
    }
    return b;
  }, [primary, cy, baseAmp]);

  // Spectral gradient stops
  const gradStops = useMemo(() => {
    const stops: { off: string; col: string }[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      stops.push({
        off: `${(t * 100).toFixed(0)}%`,
        col: spectralColor(t, chromaHue, 0.5 + bright * 0.15, bright * 0.85),
      });
    }
    return stops;
  }, [chromaHue, bright]);

  const crestCol = hsl(0, 0, 0.95, crestBright * 0.9);
  const id = useMemo(() => `wol-${Math.floor(Math.random() * 9999)}`, []);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none"
        style={{ opacity: overlayOp, willChange: "opacity" }}>
        <defs>
          {/* Spectral gradient along wave */}
          <linearGradient id={`${id}-sp`} x1="0%" y1="0%" x2="100%" y2="0%">
            {gradStops.map((s, i) => <stop key={i} offset={s.off} stopColor={s.col} />)}
          </linearGradient>
          {/* Atmospheric glow gradient */}
          <linearGradient id={`${id}-gl`} x1="0%" y1="0%" x2="100%" y2="0%">
            {gradStops.map((s, i) => (
              <stop key={i} offset={s.off}
                stopColor={spectralColor(i / 12, chromaHue, 0.6, 0.12 * bright)} />
            ))}
          </linearGradient>
          {/* Radial bloom */}
          <radialGradient id={`${id}-bl`}>
            <stop offset="0%" stopColor={hsl(0, 0, 1, 0.7)} />
            <stop offset="30%" stopColor={hsl(chromaHue, 0.4, 0.8, 0.3)} />
            <stop offset="100%" stopColor={hsl(chromaHue, 0.3, 0.6, 0)} />
          </radialGradient>
          {/* Caustic cell */}
          <radialGradient id={`${id}-ca`}>
            <stop offset="0%" stopColor={hsl(chromaHue + 50, 0.3, 0.75, 0.25)} />
            <stop offset="60%" stopColor={hsl(chromaHue + 50, 0.2, 0.65, 0.08)} />
            <stop offset="100%" stopColor={hsl(chromaHue + 50, 0.1, 0.5, 0)} />
          </radialGradient>
          {/* Filters */}
          <filter id={`${id}-f1`}><feGaussianBlur stdDeviation={8 + energy * 6} /></filter>
          <filter id={`${id}-f2`}><feGaussianBlur stdDeviation={1.5} /></filter>
          <filter id={`${id}-f3`}><feGaussianBlur stdDeviation={12 + energy * 10} /></filter>
          <filter id={`${id}-f4`}><feGaussianBlur stdDeviation={5 + onsetEnvelope * 3} /></filter>
        </defs>

        {/* ── L1: Caustic light patterns (underwater feel) ── */}
        <g filter={`url(#${id}-f4)`}>
          {caustics.map((c, i) => (
            <ellipse key={`c${i}`} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry}
              fill={`url(#${id}-ca)`} opacity={c.op}
              transform={`rotate(${c.rot} ${c.cx} ${c.cy})`} />
          ))}
          {caustics.slice(0, 7).map((c, i) => (
            <ellipse key={`s${i}`} cx={c.cx + 15} cy={c.cy + 10}
              rx={c.rx * 1.8} ry={c.ry * 0.4}
              fill={hsl(chromaHue + i * 25, 0.25, 0.7, c.op * 0.6)}
              transform={`rotate(${c.rot + 30} ${c.cx + 15} ${c.cy + 10})`} />
          ))}
        </g>

        {/* ── L2: Outer atmospheric glow (widest, softest) ── */}
        <path d={priPath} stroke={`url(#${id}-gl)`} strokeWidth={50 + bass * 30}
          strokeLinecap="round" strokeLinejoin="round" fill="none"
          filter={`url(#${id}-f1)`} opacity={0.35 * bright} />
        <path d={secPath} stroke={`url(#${id}-gl)`} strokeWidth={25 + bass * 15}
          strokeLinecap="round" strokeLinejoin="round" fill="none"
          filter={`url(#${id}-f1)`} opacity={0.18 * bright} />

        {/* ── L3: Main spectral body (vivid gradient band) ── */}
        <path d={priPath} stroke={`url(#${id}-sp)`} strokeWidth={12 + bass * 8}
          strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.7 * bright} />
        <path d={secPath} stroke={`url(#${id}-sp)`} strokeWidth={6 + bass * 4}
          strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.35 * bright} />

        {/* ── L4: Inner white crest (thin, bright, pulsing) ── */}
        <path d={priPath} stroke={crestCol} strokeWidth={3 + beatDecay * 3}
          strokeLinecap="round" strokeLinejoin="round" fill="none"
          filter={`url(#${id}-f2)`} opacity={crestBright * 0.85} />
        <path d={secPath} stroke={hsl(0, 0, 0.9, crestBright * 0.5)}
          strokeWidth={1.5 + beatDecay * 1.5} strokeLinecap="round" strokeLinejoin="round"
          fill="none" filter={`url(#${id}-f2)`} opacity={crestBright * 0.4} />

        {/* ── L5: Bloom at wave peaks ── */}
        {blooms.map((bp, i) => {
          const r = (20 + energy * 35) * bp.i;
          return (
            <g key={`b${i}`}>
              {/* Core bloom */}
              <circle cx={bp.x} cy={bp.y} r={r}
                fill={`url(#${id}-bl)`} filter={`url(#${id}-f3)`}
                opacity={0.3 + energy * 0.3 * bp.i} />
              {/* Light rays emanating from bloom (4 rays per peak) */}
              {[0, 1, 2, 3].map((ri) => {
                const ang = (ri * Math.PI / 2) + frame * 0.003 * tempoFactor + i;
                const rayLen = r * (1.5 + energy * 1.5);
                const x2 = bp.x + Math.cos(ang) * rayLen;
                const y2 = bp.y + Math.sin(ang) * rayLen;
                return (
                  <line key={`r${ri}`} x1={bp.x} y1={bp.y} x2={x2} y2={y2}
                    stroke={hsl(chromaHue + ri * 90, 0.5, 0.85, 0.15 * bp.i)}
                    strokeWidth={2 + beatDecay * 2} strokeLinecap="round" />
                );
              })}
            </g>
          );
        })}

        {/* ── L6: Prismatic scatter fragments ── */}
        {scatter.map((f, i) => {
          const dx = f.sz * 0.6, dy = f.sz;
          return (
            <g key={`f${i}`} opacity={f.op}
              transform={`translate(${f.x.toFixed(1)},${f.y.toFixed(1)}) rotate(${f.rot})`}>
              <polygon points={`0,${-dy} ${dx},0 0,${dy} ${-dx},0`}
                fill={hsl(f.hue, 0.9, 0.6, 0.7)} />
              <circle cx={0} cy={0} r={f.sz * 1.5} fill={hsl(f.hue, 0.7, 0.7, 0.15)} />
            </g>
          );
        })}

        {/* ── L7: Spectral ribbon fill (between wave bounds) ── */}
        {/* Filled area between primary wave and a mirrored offset creates a ribbon of light */}
        {(() => {
          // Build a closed path: primary wave forward, then offset wave backward
          const offsetAmt = 12 + bass * 10;
          let ribbon = `M${primary[0].x.toFixed(1)} ${(primary[0].y - offsetAmt / 2).toFixed(1)}`;
          for (let i = 1; i < primary.length; i++) {
            ribbon += ` L${primary[i].x.toFixed(1)} ${(primary[i].y - offsetAmt / 2).toFixed(1)}`;
          }
          for (let i = primary.length - 1; i >= 0; i--) {
            ribbon += ` L${primary[i].x.toFixed(1)} ${(primary[i].y + offsetAmt / 2).toFixed(1)}`;
          }
          ribbon += " Z";
          return (
            <path d={ribbon} fill={`url(#${id}-sp)`} opacity={0.08 * bright}
              filter={`url(#${id}-f2)`} />
          );
        })()}

        {/* ── L8: Ambient light wash ── */}
        <rect x={0} y={cy - baseAmp * 1.5} width={width} height={baseAmp * 0.8}
          fill={hsl(chromaHue + 15, 0.3, 0.7, 0.03 * bright)} filter={`url(#${id}-f1)`} />
        <rect x={0} y={cy + baseAmp * 0.5} width={width} height={baseAmp * 1.2}
          fill={hsl(chromaHue + 180, 0.2, 0.6, 0.025 * bright)} filter={`url(#${id}-f1)`} />

        {/* ── L9: Horizon light line ── */}
        {/* Faint horizontal line at center — the "surface" the wave travels along */}
        <line x1={0} y1={cy} x2={width} y2={cy}
          stroke={hsl(chromaHue, 0.2, 0.7, 0.04 * bright)} strokeWidth={1}
          strokeDasharray={`${6 + mids * 4} ${12 + mids * 8}`} />

        {/* ── L10: Wave interaction highlights ── */}
        {primary.filter((_, i) => i % 8 === 0).map((pp, i) => {
          const sp = secondary[Math.min(i * 8, secondary.length - 1)];
          const dist = Math.abs(pp.y - sp.y);
          if (dist > 25) return null;
          const s = 1 - dist / 25;
          return (
            <circle key={`i${i}`} cx={(pp.x + sp.x) / 2} cy={(pp.y + sp.y) / 2}
              r={4 + s * 8} fill={hsl(chromaHue + pp.t * 300, 0.6, 0.8, s * 0.2 * energy)}
              filter={`url(#${id}-f2)`} />
          );
        })}
      </svg>
    </div>
  );
};
