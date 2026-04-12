/**
 * GratefulMandala — A+++ overlay: a LARGE detailed mandala (60% of smaller
 * frame dimension) with rotating concentric rings, sacred geometry, and
 * Dead-themed elements (skulls, roses, lightning bolts, terrapins). Center
 * mandala dominates the frame with a cosmic backdrop.
 *
 * Audio reactivity:
 *   slowEnergy → mandala glow + cosmic warmth
 *   energy     → ring brightness + flower petal scale
 *   bass       → outer ring throb
 *   beatDecay  → ring counter-rotation pulse
 *   onsetEnvelope → center burst flash
 *   chromaHue  → mandala palette tint
 *   tempoFactor → rotation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const STAR_COUNT = 120;
const DUST_COUNT = 60;

interface Star { x: number; y: number; r: number; phase: number; speed: number; }
interface Dust { ang: number; rad: number; speed: number; size: number; phase: number; }

function buildStars(): Star[] {
  const rng = seeded(81_447_209);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.4 + rng() * 1.6,
    phase: rng() * Math.PI * 2,
    speed: 0.005 + rng() * 0.03,
  }));
}

function buildDust(): Dust[] {
  const rng = seeded(33_882_174);
  return Array.from({ length: DUST_COUNT }, () => ({
    ang: rng() * Math.PI * 2,
    rad: 0.05 + rng() * 0.40,
    speed: 0.001 + rng() * 0.005,
    size: 0.7 + rng() * 2.0,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const GratefulMandala: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const stars = React.useMemo(buildStars, []);
  const dust = React.useMemo(buildDust, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives
  const cosmicGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ringBright = interpolate(snap.energy, [0.02, 0.30], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lowThrob = interpolate(snap.bass, [0.0, 0.65], [0.30, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ringPulse = 1 + snap.beatDecay * 0.18;
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;

  // Mandala palette
  const baseHue = 290;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.50) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 78%, ${64 + ringBright * 14}%)`;
  const tintCore = `hsl(${tintHue}, 92%, ${82 + ringBright * 10}%)`;
  const compHue = (tintHue + 180) % 360;
  const compColor = `hsl(${compHue}, 75%, 60%)`;
  const accentHue = (tintHue + 60) % 360;
  const accentColor = `hsl(${accentHue}, 80%, 64%)`;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 50%, 6%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 35%, 11%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 35%, 16%)`;

  // ─── HERO GEOMETRY ─────────────────────────────────────────────────
  const cx = width / 2;
  const cy = height / 2;
  const mandalaR = Math.min(width, height) * 0.32;   // 32% of min dim radius (64% diameter)

  const baseRotation = (frame * 0.10 * tempoFactor) % 360;
  const counterRotation = -(frame * 0.07 * tempoFactor) % 360;
  const ring1R = mandalaR * 0.95;
  const ring2R = mandalaR * 0.78;
  const ring3R = mandalaR * 0.62;
  const ring4R = mandalaR * 0.46;
  const ring5R = mandalaR * 0.30;
  const ring6R = mandalaR * 0.16;

  // Star nodes
  const starNodes = stars.map((s, i) => {
    const flicker = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`st-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + flicker * 0.6)}
        fill="#f8f0ff" opacity={0.30 + flicker * 0.45} />
    );
  });

  // Dust orbiting
  const dustNodes = dust.map((d, i) => {
    const t = frame * d.speed + d.phase;
    const ang = d.ang + t;
    const rad = mandalaR * (1.0 + d.rad);
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad * 0.95;
    const flick = 0.5 + Math.sin(t * 2.1) * 0.4;
    return (
      <circle key={`dust-${i}`} cx={x} cy={y} r={d.size * (0.7 + ringBright * 0.6)}
        fill={tintCore} opacity={0.40 * flick * ringBright} />
    );
  });

  // ── RING 1 — Outer skull symbols, 12-fold ──
  const ring1Nodes: React.ReactNode[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * ring1R;
    const y = Math.sin(a) * ring1R;
    const sR = mandalaR * 0.07 * (0.95 + Math.sin(frame * 0.04 + i) * 0.05);
    ring1Nodes.push(
      <g key={`r1-${i}`} transform={`translate(${x}, ${y})`}>
        {/* Mini skull circle */}
        <circle cx={0} cy={0} r={sR} fill={tintColor} opacity={0.45} stroke={tintCore} strokeWidth={1.4} />
        <circle cx={0} cy={0} r={sR * 0.78} fill="rgba(0,0,0,0.55)" />
        {/* Eye dots */}
        <circle cx={-sR * 0.35} cy={-sR * 0.15} r={sR * 0.16} fill={tintCore} opacity={0.85} />
        <circle cx={sR * 0.35} cy={-sR * 0.15} r={sR * 0.16} fill={tintCore} opacity={0.85} />
        {/* Horizontal divider */}
        <line x1={-sR * 0.7} y1={0} x2={sR * 0.7} y2={0}
          stroke={tintCore} strokeWidth={1} opacity={0.7} />
        {/* Mini bolt */}
        <path d={`M ${-sR * 0.12} ${-sR * 0.5} L ${sR * 0.10} ${-sR * 0.05} L ${-sR * 0.05} ${-sR * 0.05} L ${sR * 0.18} ${sR * 0.55} L ${0} ${sR * 0.05} L ${-sR * 0.10} ${sR * 0.05} L ${sR * 0.05} ${-sR * 0.5} Z`}
          fill="#ffd040" opacity={0.92} />
      </g>,
    );
  }

  // ── RING 2 — Roses & bolts alternating, 16-fold ──
  const ring2Nodes: React.ReactNode[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.cos(a) * ring2R;
    const y = Math.sin(a) * ring2R;
    const isRose = i % 2 === 0;
    if (isRose) {
      const rR = mandalaR * 0.06;
      ring2Nodes.push(
        <g key={`r2-${i}`} transform={`translate(${x}, ${y}) rotate(${i * 22})`}>
          {/* Rose petals — concentric */}
          <circle cx={0} cy={0} r={rR} fill={compColor} opacity={0.55} />
          <circle cx={0} cy={0} r={rR * 0.75} fill={compColor} opacity={0.65} />
          <circle cx={0} cy={0} r={rR * 0.50} fill={`hsl(${compHue}, 90%, 75%)`} opacity={0.85} />
          <circle cx={0} cy={0} r={rR * 0.20} fill="#fff8d0" opacity={0.95} />
          {/* Petal accents */}
          {[0, 1, 2, 3, 4].map((k) => {
            const pa = (k / 5) * Math.PI * 2;
            return (
              <ellipse key={`p-${k}`} cx={Math.cos(pa) * rR * 0.45} cy={Math.sin(pa) * rR * 0.45}
                rx={rR * 0.32} ry={rR * 0.20}
                fill={compColor} opacity={0.65} transform={`rotate(${k * 72})`} />
            );
          })}
        </g>,
      );
    } else {
      const bR = mandalaR * 0.05;
      ring2Nodes.push(
        <g key={`r2-${i}`} transform={`translate(${x}, ${y}) rotate(${a * 180 / Math.PI + 90})`}>
          <path d={`M ${-bR * 0.3} ${-bR * 1.0} L ${bR * 0.2} ${-bR * 0.2} L ${-bR * 0.1} ${-bR * 0.2} L ${bR * 0.4} ${bR * 1.0} L ${bR * 0.05} ${bR * 0.1} L ${-bR * 0.2} ${bR * 0.1} L ${bR * 0.1} ${-bR * 1.0} Z`}
            fill="#ffd040" stroke="#ff8000" strokeWidth={0.8} opacity={0.95} />
        </g>,
      );
    }
  }

  // ── RING 3 — Petal flower, 24-fold ──
  const ring3Nodes: React.ReactNode[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a) * ring3R;
    const y = Math.sin(a) * ring3R;
    ring3Nodes.push(
      <g key={`r3-${i}`} transform={`translate(${x}, ${y}) rotate(${a * 180 / Math.PI})`}>
        <ellipse cx={0} cy={0} rx={mandalaR * 0.05} ry={mandalaR * 0.018}
          fill={accentColor} opacity={0.55} />
        <ellipse cx={0} cy={0} rx={mandalaR * 0.035} ry={mandalaR * 0.012}
          fill={tintCore} opacity={0.8} />
      </g>,
    );
  }

  // ── RING 4 — 8-pointed star ──
  const star8Points: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? ring4R : ring4R * 0.5;
    star8Points.push(`${Math.cos(a) * r},${Math.sin(a) * r}`);
  }

  // ── RING 5 — inner petals, 12-fold ──
  const ring5Nodes: React.ReactNode[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * ring5R;
    const y = Math.sin(a) * ring5R;
    ring5Nodes.push(
      <circle key={`r5-${i}`} cx={x} cy={y} r={mandalaR * 0.025}
        fill={tintCore} opacity={0.85} />
    );
  }

  // ── RING 6 — innermost dot ring ──
  const ring6Nodes: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * ring6R;
    const y = Math.sin(a) * ring6R;
    ring6Nodes.push(
      <circle key={`r6-${i}`} cx={x} cy={y} r={mandalaR * 0.018} fill={accentColor} opacity={0.95} />
    );
  }

  // ── Background distant petals (40-fold ornamental) ──
  const ornamentNodes: React.ReactNode[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = mandalaR * 1.05;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    ornamentNodes.push(
      <line key={`orn-${i}`} x1={Math.cos(a) * mandalaR * 0.99} y1={Math.sin(a) * mandalaR * 0.99}
        x2={x} y2={y} stroke={tintColor} strokeWidth={1.4} opacity={0.45 + ringBright * 0.3} />
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="gm-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <radialGradient id="gm-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.55} />
            <stop offset="50%" stopColor={tintColor} stopOpacity={0.20} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="gm-center">
            <stop offset="0%" stopColor="#fff8d0" stopOpacity={1} />
            <stop offset="40%" stopColor={tintCore} stopOpacity={0.85} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="gm-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="gm-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Cosmic backdrop */}
        <rect width={width} height={height} fill="url(#gm-sky)" />
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Halo */}
        <circle cx={cx} cy={cy} r={mandalaR * 1.55}
          fill="url(#gm-halo)" style={{ mixBlendMode: "screen" }}
          opacity={cosmicGlow} />

        {/* Orbiting dust */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* ── MANDALA HERO ── */}
        {/* Outer ornament — rotates clockwise */}
        <g transform={`translate(${cx}, ${cy}) rotate(${baseRotation}) scale(${ringPulse * (0.95 + lowThrob * 0.05)})`}>
          {ornamentNodes}
          {/* Outermost ring stroke */}
          <circle cx={0} cy={0} r={mandalaR} fill="none" stroke={tintColor} strokeWidth={3} opacity={0.85} />
          <circle cx={0} cy={0} r={mandalaR * 0.99} fill="none" stroke={tintCore} strokeWidth={1} opacity={0.55} />
          {ring1Nodes}
        </g>

        {/* Ring 2 — counter-rotates */}
        <g transform={`translate(${cx}, ${cy}) rotate(${counterRotation}) scale(${ringPulse})`}>
          <circle cx={0} cy={0} r={ring2R + mandalaR * 0.08} fill="none" stroke={tintColor} strokeWidth={1.6} opacity={0.6} strokeDasharray="6 4" />
          <circle cx={0} cy={0} r={ring2R - mandalaR * 0.08} fill="none" stroke={tintColor} strokeWidth={1.2} opacity={0.45} />
          {ring2Nodes}
        </g>

        {/* Ring 3 — rotates clockwise */}
        <g transform={`translate(${cx}, ${cy}) rotate(${baseRotation * 1.4})`}>
          <circle cx={0} cy={0} r={ring3R + mandalaR * 0.04} fill="none" stroke={accentColor} strokeWidth={1.2} opacity={0.5} />
          {ring3Nodes}
          <circle cx={0} cy={0} r={ring3R - mandalaR * 0.04} fill="none" stroke={accentColor} strokeWidth={1} opacity={0.4} />
        </g>

        {/* Ring 4 — 8-pointed star, counter-rotates */}
        <g transform={`translate(${cx}, ${cy}) rotate(${counterRotation * 1.6})`}>
          <polygon points={star8Points.join(" ")}
            fill="none" stroke={tintCore} strokeWidth={2.2} opacity={0.85} />
          <polygon points={star8Points.join(" ")}
            fill={tintColor} opacity={0.18} />
        </g>

        {/* Ring 5 — petal dots */}
        <g transform={`translate(${cx}, ${cy}) rotate(${baseRotation * 2})`}>
          <circle cx={0} cy={0} r={ring5R + mandalaR * 0.02} fill="none" stroke={tintCore} strokeWidth={1} opacity={0.5} />
          {ring5Nodes}
        </g>

        {/* Ring 6 — innermost */}
        <g transform={`translate(${cx}, ${cy}) rotate(${counterRotation * 2.5})`}>
          {ring6Nodes}
          <circle cx={0} cy={0} r={ring6R} fill="none" stroke={accentColor} strokeWidth={1} opacity={0.6} />
        </g>

        {/* Center bright burst */}
        <circle cx={cx} cy={cy} r={mandalaR * 0.10 * (1 + flash * 0.5)}
          fill="url(#gm-center)" style={{ mixBlendMode: "screen" }} />

        {/* Center cross */}
        <g transform={`translate(${cx}, ${cy})`}>
          <line x1={-mandalaR * 0.08} y1={0} x2={mandalaR * 0.08} y2={0}
            stroke={tintCore} strokeWidth={2} opacity={0.95} />
          <line x1={0} y1={-mandalaR * 0.08} x2={0} y2={mandalaR * 0.08}
            stroke={tintCore} strokeWidth={2} opacity={0.95} />
          <circle cx={0} cy={0} r={mandalaR * 0.025} fill="#fff8d0" opacity={1} />
        </g>

        {/* Onset flash */}
        {flash > 0.05 && (
          <circle cx={cx} cy={cy} r={mandalaR * (1.0 + flash * 0.5)}
            fill={`rgba(255, 250, 230, ${flash * 0.16})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#gm-vig)" />
      </svg>
    </div>
  );
};
