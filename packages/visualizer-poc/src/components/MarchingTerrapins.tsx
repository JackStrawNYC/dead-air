/**
 * MarchingTerrapins — A+++ parade of 6 terrapins marching across a stage with
 * instruments. Heroes are 30-40% of frame height. Cycle-based visibility (no
 * dependence on march-window detection that may fail with low-energy data).
 *
 * Each terrapin has:
 *   - Domed shell with 7 hex scutes + 14 marginal scutes + radial gradient
 *   - Angular head with eye, beak, neck scales
 *   - 4 walk-cycle legs alternating in stride
 *   - Tail
 *   - Instrument (banjo, fiddle, drum, tambourine, horn, mandolin)
 *   - Ground shadow
 *
 * Audio reactivity:
 *   slowEnergy → spotlight warmth + sky tint
 *   energy     → bounce + glow intensity
 *   bass       → leg stomp depth
 *   beatDecay  → shell pulse + bob
 *   onsetEnvelope → rim flash
 *   chromaHue  → palette shift
 *   tempoFactor → walk cycle rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const NUM_TURTLES = 6;
const STAR_COUNT = 70;
const SPARK_COUNT = 50;

type Instrument = "banjo" | "tambourine" | "fiddle" | "drum" | "horn" | "mandolin";

interface TurtleSpec {
  idx: number;
  xFrac: number;
  depth: number;
  hue: number;
  instrument: Instrument;
  phase: number;
}

interface Star { x: number; y: number; r: number; speed: number; phase: number; }

function buildTurtles(): TurtleSpec[] {
  // Dead-era earthy psychedelic tones: forest green, deep teal, sage, burnt amber, olive, rich brown
  return [
    { idx: 0, xFrac: 0.08, depth: 0.78, hue: 142, instrument: "banjo", phase: 0.0 },    // forest green
    { idx: 1, xFrac: 0.23, depth: 0.92, hue: 178, instrument: "tambourine", phase: 1.2 }, // deep teal
    { idx: 2, xFrac: 0.38, depth: 1.05, hue: 95, instrument: "fiddle", phase: 2.4 },      // sage/olive
    { idx: 3, xFrac: 0.55, depth: 1.00, hue: 28, instrument: "drum", phase: 0.7 },        // burnt amber
    { idx: 4, xFrac: 0.72, depth: 0.92, hue: 165, instrument: "mandolin", phase: 1.9 },   // teal-green
    { idx: 5, xFrac: 0.88, depth: 0.78, hue: 18, instrument: "horn", phase: 0.4 },        // rich brown
  ];
}

function buildStars(): Star[] {
  const rng = seeded(82_447_991);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.55,
    r: 0.5 + rng() * 1.6,
    speed: 0.005 + rng() * 0.025,
    phase: rng() * Math.PI * 2,
  }));
}

function buildSparks(): Star[] {
  const rng = seeded(35_991_447);
  return Array.from({ length: SPARK_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.85,
    r: 0.6 + rng() * 1.8,
    speed: 0.012 + rng() * 0.04,
    phase: rng() * Math.PI * 2,
  }));
}

const hsl = (h: number, s = 65, l = 38) => `hsl(${((h % 360) + 360) % 360}, ${s}%, ${l}%)`;

interface Props { frames: EnhancedFrameData[]; }

export const MarchingTerrapins: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const turtles = React.useMemo(buildTurtles, []);
  const stars = React.useMemo(buildStars, []);
  const sparks = React.useMemo(buildSparks, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Widened dynamic ranges
  const warmth = interpolate(snap.slowEnergy, [0.0, 0.32], [0.20, 1.50], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bounce = interpolate(snap.energy, [0.0, 0.30], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  const tintShift = snap.chromaHue - 180;
  const baseHue = 130;
  const tintHue = ((baseHue + tintShift * 0.55) % 360 + 360) % 360;
  // Deep blue-green atmosphere — moonlit forest / underwater cave vibe
  const skyTop = `hsl(${(tintHue + 210) % 360}, 40%, 4%)`;
  const skyMid = `hsl(${(tintHue + 195) % 360}, 35%, 8%)`;
  const skyHorizon = `hsl(${(tintHue + 175) % 360}, 30%, 14%)`;

  const groundY = height * 0.78;
  const baseTurtleH = height * 0.40;

  // ─── TURTLE BUILDER ──
  function buildTurtle(spec: TurtleSpec): React.ReactNode {
    const scale = spec.depth;
    const tH = baseTurtleH * scale;
    const tW = tH * 1.20;
    const slowDrift = (frame * 0.0001 * tempoFactor);
    const xPos = (spec.xFrac + slowDrift) % 1.10 - 0.05;
    const cxT = xPos * width;
    const bobPhase = frame * 0.10 * tempoFactor + spec.phase;
    // Widened bounce: more dramatic march (was 4+6+8, now 2+10+12)
    const bob = Math.sin(bobPhase) * (2 + bounce * 10 + snap.beatDecay * 12) * scale;
    const cyT = groundY - tH * 0.45 + bob;

    const shellHue = (spec.hue + tintShift * 0.3) % 360;
    const shellMain = hsl(shellHue, 55, 32);
    const shellLight = hsl(shellHue, 50, 48);
    const shellDeep = hsl(shellHue, 60, 16);
    const shellRim = hsl(shellHue, 45, 22);
    const skinCol = hsl(shellHue + 25, 40, 38);
    const skinDeep = hsl(shellHue + 25, 50, 24);
    const accent = hsl(shellHue + 10, 40, 28);
    const scuteHighlight = hsl(shellHue, 35, 44);
    const stroke = "rgba(12, 5, 0, 0.90)";

    const tx = cxT;
    const ty = cyT;
    const legA = Math.sin(bobPhase) * 6 * scale;
    const legB = Math.sin(bobPhase + Math.PI) * 6 * scale;
    const legC = Math.sin(bobPhase + Math.PI / 2) * 6 * scale;
    const legD = Math.sin(bobPhase + Math.PI * 1.5) * 6 * scale;

    // Hex points helper
    const hexPts = (cx: number, cy: number, r: number) => {
      let s = "";
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k - Math.PI / 2;
        s += `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)} `;
      }
      return s.trim();
    };

    // Central scute positions (relative to turtle center, scaled by tW/tH)
    const scutes: [number, number, number][] = [
      [0, -0.05, 0.13],
      [0, -0.18, 0.10],
      [-0.13, -0.10, 0.10],
      [0.13, -0.10, 0.10],
      [0, 0.06, 0.10],
      [-0.12, 0.04, 0.09],
      [0.12, 0.04, 0.09],
    ];

    return (
      <g key={`t-${spec.idx}`}>
        {/* Shadow */}
        <ellipse cx={tx} cy={groundY + 4} rx={tW * 0.55} ry={6 * scale}
          fill="rgba(0,0,0,0.55)" />

        {/* ── Hind legs ── */}
        <g transform={`translate(0 ${legB})`}>
          <ellipse cx={tx + tW * 0.32} cy={ty + tH * 0.28} rx={tW * 0.08} ry={tH * 0.11}
            fill={skinDeep} stroke={stroke} strokeWidth={1.6} />
          <ellipse cx={tx + tW * 0.32} cy={ty + tH * 0.36} rx={tW * 0.06} ry={tH * 0.04}
            fill={skinCol} opacity={0.7} />
          {[0, 1, 2].map((c) => (
            <circle key={`c1-${c}`} cx={tx + tW * 0.36 - c * tW * 0.018} cy={ty + tH * 0.40} r={1.6}
              fill="rgba(20, 8, 2, 0.85)" />
          ))}
        </g>
        <g transform={`translate(0 ${legD})`}>
          <ellipse cx={tx - tW * 0.32} cy={ty + tH * 0.28} rx={tW * 0.08} ry={tH * 0.11}
            fill={skinDeep} stroke={stroke} strokeWidth={1.6} />
          <ellipse cx={tx - tW * 0.32} cy={ty + tH * 0.36} rx={tW * 0.06} ry={tH * 0.04}
            fill={skinCol} opacity={0.7} />
          {[0, 1, 2].map((c) => (
            <circle key={`c2-${c}`} cx={tx - tW * 0.36 + c * tW * 0.018} cy={ty + tH * 0.40} r={1.6}
              fill="rgba(20, 8, 2, 0.85)" />
          ))}
        </g>

        {/* ── Tail ── */}
        <path d={`M ${tx + tW * 0.42} ${ty + tH * 0.05}
          Q ${tx + tW * 0.52} ${ty + tH * 0.10}
            ${tx + tW * 0.55} ${ty + tH * 0.18}`}
          stroke={skinCol} strokeWidth={6 * scale} fill="none" strokeLinecap="round" />
        <path d={`M ${tx + tW * 0.46} ${ty + tH * 0.10}
          Q ${tx + tW * 0.50} ${ty + tH * 0.13}
            ${tx + tW * 0.52} ${ty + tH * 0.16}`}
          stroke={skinDeep} strokeWidth={3 * scale} fill="none" strokeLinecap="round" />

        {/* ── Plastron (belly) shadow ── */}
        <ellipse cx={tx} cy={ty + tH * 0.18} rx={tW * 0.34} ry={tH * 0.06}
          fill={skinCol} opacity={0.30} />

        {/* ── Shell dome with radial gradient ── */}
        <defs>
          <radialGradient id={`shell-${spec.idx}`} cx="40%" cy="32%" r="65%">
            <stop offset="0%" stopColor={shellLight} />
            <stop offset="50%" stopColor={shellMain} />
            <stop offset="100%" stopColor={shellDeep} />
          </radialGradient>
        </defs>
        <ellipse cx={tx} cy={ty} rx={tW * 0.45} ry={tH * 0.34}
          fill={`url(#shell-${spec.idx})`} stroke={stroke} strokeWidth={2.5} />

        {/* ── 14 marginal scutes around the rim ── */}
        {Array.from({ length: 14 }).map((_, k) => {
          const a = (k / 14) * Math.PI - Math.PI;
          const mx = tx + Math.cos(a) * tW * 0.42;
          const my = ty + Math.sin(a) * tH * 0.28 + tH * 0.05;
          return (
            <g key={`mg-${k}`}>
              <ellipse cx={mx} cy={my} rx={tW * 0.05} ry={tH * 0.04}
                fill={shellRim} stroke={shellDeep} strokeWidth={1.0} opacity={0.65} />
              {/* Subtle growth line on marginal */}
              <ellipse cx={mx} cy={my} rx={tW * 0.03} ry={tH * 0.025}
                fill="none" stroke={shellDeep} strokeWidth={0.4} opacity={0.2} />
            </g>
          );
        })}

        {/* ── 7 central hexagonal scutes with domed gradients + growth rings ── */}
        {scutes.map(([sx, sy, sr], si) => {
          const scX = tx + sx * tW;
          const scY = ty + sy * tH;
          const scR = sr * tH;
          const gradId = `scute-grad-${spec.idx}-${si}`;
          return (
            <g key={`sc-${si}`}>
              {/* Per-scute radial gradient: lighter center, darker edge */}
              <defs>
                <radialGradient id={gradId} cx="40%" cy="35%" r="60%">
                  <stop offset="0%" stopColor={scuteHighlight} />
                  <stop offset="55%" stopColor={shellMain} />
                  <stop offset="100%" stopColor={shellDeep} />
                </radialGradient>
              </defs>
              {/* Filled hex scute with dome shading */}
              <polygon points={hexPts(scX, scY, scR)}
                fill={`url(#${gradId})`} stroke={shellRim} strokeWidth={1.8} opacity={0.9} />
              {/* Growth ring 1 — outermost */}
              <polygon points={hexPts(scX + scR * 0.04, scY + scR * 0.03, scR * 0.72)}
                fill="none" stroke={shellDeep} strokeWidth={0.7} opacity={0.15} />
              {/* Growth ring 2 — middle */}
              <polygon points={hexPts(scX - scR * 0.02, scY + scR * 0.02, scR * 0.48)}
                fill="none" stroke={shellDeep} strokeWidth={0.6} opacity={0.15} />
              {/* Growth ring 3 — inner */}
              <polygon points={hexPts(scX + scR * 0.01, scY - scR * 0.01, scR * 0.25)}
                fill="none" stroke={shellDeep} strokeWidth={0.5} opacity={0.12} />
              {/* Organic bezier growth lines inside scute */}
              <path d={`M ${scX - scR * 0.35} ${scY - scR * 0.1}
                Q ${scX - scR * 0.1} ${scY - scR * 0.25} ${scX + scR * 0.3} ${scY - scR * 0.15}`}
                stroke={shellDeep} strokeWidth={0.5} fill="none" opacity={0.13} />
              <path d={`M ${scX - scR * 0.2} ${scY + scR * 0.15}
                Q ${scX + scR * 0.05} ${scY + scR * 0.3} ${scX + scR * 0.35} ${scY + scR * 0.1}`}
                stroke={shellDeep} strokeWidth={0.5} fill="none" opacity={0.13} />
              <path d={`M ${scX - scR * 0.15} ${scY - scR * 0.02}
                Q ${scX + scR * 0.1} ${scY + scR * 0.08} ${scX + scR * 0.28} ${scY - scR * 0.05}`}
                stroke={shellDeep} strokeWidth={0.4} fill="none" opacity={0.10} />
            </g>
          );
        })}

        {/* Shell sheen — subtle, not cartoony */}
        <ellipse cx={tx - tW * 0.10} cy={ty - tH * 0.18} rx={tW * 0.14} ry={tH * 0.08}
          fill="rgba(220, 210, 180, 0.12)" />

        {/* ── Front legs ── */}
        <g transform={`translate(0 ${legA})`}>
          <ellipse cx={tx - tW * 0.20} cy={ty + tH * 0.22} rx={tW * 0.10} ry={tH * 0.06}
            fill={skinDeep} stroke={stroke} strokeWidth={1.4}
            transform={`rotate(${-15} ${tx - tW * 0.20} ${ty + tH * 0.22})`} />
          {[0, 1, 2].map((c) => (
            <circle key={`f1-${c}`} cx={tx - tW * 0.30 - c * tW * 0.02} cy={ty + tH * 0.26} r={1.6}
              fill="rgba(20, 8, 2, 0.85)" />
          ))}
        </g>
        <g transform={`translate(0 ${legC})`}>
          <ellipse cx={tx + tW * 0.20} cy={ty + tH * 0.22} rx={tW * 0.10} ry={tH * 0.06}
            fill={skinDeep} stroke={stroke} strokeWidth={1.4}
            transform={`rotate(${15} ${tx + tW * 0.20} ${ty + tH * 0.22})`} />
          {[0, 1, 2].map((c) => (
            <circle key={`f2-${c}`} cx={tx + tW * 0.30 + c * tW * 0.02} cy={ty + tH * 0.26} r={1.6}
              fill="rgba(20, 8, 2, 0.85)" />
          ))}
        </g>

        {/* ── Neck bridge with scales ── */}
        <rect x={tx - tW * 0.52} y={ty - tH * 0.08} width={tW * 0.18} height={tH * 0.10}
          rx={tH * 0.05} fill={skinCol} stroke={stroke} strokeWidth={1.4} />
        {[0, 1, 2].map((n) => (
          <path key={`nk-${n}`}
            d={`M ${tx - tW * 0.50 + n * tW * 0.05} ${ty - tH * 0.05}
                Q ${tx - tW * 0.475 + n * tW * 0.05} ${ty - tH * 0.07}
                  ${tx - tW * 0.45 + n * tW * 0.05} ${ty - tH * 0.05}`}
            stroke={skinDeep} strokeWidth={0.8} fill="none" opacity={0.7} />
        ))}

        {/* ── Head: angular polygon ── */}
        <path d={`M ${tx - tW * 0.52} ${ty - tH * 0.08}
          L ${tx - tW * 0.62} ${ty - tH * 0.06}
          L ${tx - tW * 0.66} ${ty - tH * 0.02}
          L ${tx - tW * 0.62} ${ty + tH * 0.02}
          L ${tx - tW * 0.55} ${ty + tH * 0.04}
          L ${tx - tW * 0.52} ${ty + tH * 0.0} Z`}
          fill={skinCol} stroke={stroke} strokeWidth={1.6} />
        {/* Brow ridge */}
        <path d={`M ${tx - tW * 0.62} ${ty - tH * 0.05}
          Q ${tx - tW * 0.59} ${ty - tH * 0.07}
            ${tx - tW * 0.55} ${ty - tH * 0.06}`}
          stroke={skinDeep} strokeWidth={1.2} fill="none" opacity={0.85} />
        {/* Eye */}
        <circle cx={tx - tW * 0.58} cy={ty - tH * 0.04} r={tH * 0.022}
          fill="white" />
        <circle cx={tx - tW * 0.58} cy={ty - tH * 0.04} r={tH * 0.014}
          fill={hsl(shellHue + 60, 70, 40)} />
        <circle cx={tx - tW * 0.58} cy={ty - tH * 0.04} r={tH * 0.008}
          fill="black" />
        <circle cx={tx - tW * 0.583} cy={ty - tH * 0.043} r={tH * 0.003}
          fill="white" />
        {/* Beak */}
        <path d={`M ${tx - tW * 0.66} ${ty - tH * 0.01}
          L ${tx - tW * 0.69} ${ty + tH * 0.01}
          L ${tx - tW * 0.66} ${ty + tH * 0.02}`}
          stroke={stroke} strokeWidth={1.2} fill={skinDeep} />
        {/* Nostril */}
        <circle cx={tx - tW * 0.66} cy={ty - tH * 0.01} r={0.6}
          fill="black" opacity={0.6} />

        {/* ── Head/neck skin stipple texture ── */}
        {Array.from({ length: 12 }).map((_, d) => {
          const rng = seeded(spec.idx * 1000 + d * 137);
          const dx = tx - tW * (0.52 + rng() * 0.14);
          const dy = ty - tH * 0.06 + rng() * tH * 0.10;
          return (
            <circle key={`hstip-${d}`} cx={dx} cy={dy} r={0.6 + rng() * 0.8}
              fill={skinDeep} opacity={0.18 + rng() * 0.10} />
          );
        })}
        {/* Head scale lines */}
        {Array.from({ length: 4 }).map((_, d) => {
          const rng = seeded(spec.idx * 2000 + d * 251);
          const sx0 = tx - tW * (0.54 + rng() * 0.10);
          const sy0 = ty - tH * 0.04 + rng() * tH * 0.06;
          return (
            <path key={`hscl-${d}`}
              d={`M ${sx0} ${sy0} Q ${sx0 + rng() * 3} ${sy0 + rng() * 2} ${sx0 + 2 + rng() * 3} ${sy0 + 1 + rng() * 2}`}
              stroke={skinDeep} strokeWidth={0.5} fill="none" opacity={0.15} />
          );
        })}

        {/* ── Leg skin stipple texture ── */}
        {Array.from({ length: 8 }).map((_, d) => {
          const rng = seeded(spec.idx * 3000 + d * 193);
          const side = d < 4 ? -1 : 1;
          const lx = tx + side * tW * (0.18 + rng() * 0.14);
          const ly = ty + tH * (0.20 + rng() * 0.14);
          return (
            <circle key={`lstip-${d}`} cx={lx} cy={ly} r={0.5 + rng() * 0.6}
              fill={skinDeep} opacity={0.16 + rng() * 0.08} />
          );
        })}

        {/* ── Tail skin texture ── */}
        {Array.from({ length: 4 }).map((_, d) => {
          const rng = seeded(spec.idx * 4000 + d * 311);
          const tdx = tx + tW * (0.44 + rng() * 0.10);
          const tdy = ty + tH * (0.06 + rng() * 0.10);
          return (
            <circle key={`tstip-${d}`} cx={tdx} cy={tdy} r={0.4 + rng() * 0.5}
              fill={skinDeep} opacity={0.14 + rng() * 0.08} />
          );
        })}

        {/* ── Instrument ── */}
        {(() => {
          const ix = tx + tW * 0.05;
          const iy = ty - tH * 0.30;
          const is = tH * 0.18;
          switch (spec.instrument) {
            case "banjo":
              return (
                <g key={`ins-${spec.idx}`}>
                  <circle cx={ix} cy={iy} r={is * 0.55} fill="#d4a060" stroke={stroke} strokeWidth={2} />
                  <circle cx={ix} cy={iy} r={is * 0.42} fill="#e8c080" stroke={stroke} strokeWidth={1.0} />
                  <rect x={ix - is * 0.04} y={iy + is * 0.30} width={is * 0.08} height={is * 1.10}
                    fill="#5a3812" stroke={stroke} strokeWidth={1.4} />
                  {[0, 1, 2, 3].map((sn) => (
                    <line key={`bs-${sn}`} x1={ix - is * 0.025 + sn * is * 0.018} y1={iy + is * 0.40}
                      x2={ix - is * 0.025 + sn * is * 0.018} y2={iy + is * 1.30}
                      stroke="rgba(255,255,255,0.85)" strokeWidth={0.6} />
                  ))}
                  <circle cx={ix - is * 0.04} cy={iy + is * 0.34} r={is * 0.04} fill="#3a1808" />
                </g>
              );
            case "tambourine":
              return (
                <g key={`ins-${spec.idx}`}>
                  <circle cx={ix} cy={iy} r={is * 0.55} fill="#c4a060" stroke={stroke} strokeWidth={2.4} />
                  <circle cx={ix} cy={iy} r={is * 0.42} fill="rgba(40, 24, 8, 0.5)" stroke={stroke} strokeWidth={0.8} />
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
                    const a = (k / 8) * Math.PI * 2;
                    return (
                      <circle key={`tj-${k}`} cx={ix + Math.cos(a) * is * 0.55}
                        cy={iy + Math.sin(a) * is * 0.55} r={is * 0.08}
                        fill="#e8c080" stroke={stroke} strokeWidth={0.8} />
                    );
                  })}
                </g>
              );
            case "fiddle":
              return (
                <g key={`ins-${spec.idx}`} transform={`rotate(-25 ${ix} ${iy})`}>
                  <ellipse cx={ix} cy={iy} rx={is * 0.30} ry={is * 0.55}
                    fill="#a04818" stroke={stroke} strokeWidth={2} />
                  <ellipse cx={ix} cy={iy + is * 0.10} rx={is * 0.18} ry={is * 0.25}
                    fill="#7a3008" opacity={0.6} />
                  <rect x={ix - is * 0.04} y={iy - is * 1.0} width={is * 0.08} height={is * 0.45}
                    fill="#3a1808" stroke={stroke} strokeWidth={1} />
                  {[0, 1, 2, 3].map((sn) => (
                    <line key={`fs-${sn}`} x1={ix - is * 0.025 + sn * is * 0.018} y1={iy - is * 0.55}
                      x2={ix - is * 0.025 + sn * is * 0.018} y2={iy + is * 0.45}
                      stroke="rgba(255,255,255,0.7)" strokeWidth={0.5} />
                  ))}
                  {/* Bow */}
                  <line x1={ix - is * 0.10} y1={iy + is * 0.10} x2={ix + is * 0.85} y2={iy - is * 0.40}
                    stroke="rgba(40, 20, 6, 0.95)" strokeWidth={2.2} />
                </g>
              );
            case "drum":
              return (
                <g key={`ins-${spec.idx}`}>
                  <ellipse cx={ix} cy={iy - is * 0.30} rx={is * 0.65} ry={is * 0.18}
                    fill="#a06030" stroke={stroke} strokeWidth={2} />
                  <rect x={ix - is * 0.65} y={iy - is * 0.30} width={is * 1.30} height={is * 0.65}
                    fill="#7a4018" stroke={stroke} strokeWidth={2} />
                  <ellipse cx={ix} cy={iy + is * 0.35} rx={is * 0.65} ry={is * 0.18}
                    fill="#5a2810" stroke={stroke} strokeWidth={1.4} />
                  {/* Drum strap zigzag */}
                  <path d={`M ${ix - is * 0.65} ${iy - is * 0.10}
                    L ${ix - is * 0.50} ${iy + is * 0.20}
                    L ${ix - is * 0.30} ${iy - is * 0.10}
                    L ${ix - is * 0.10} ${iy + is * 0.20}
                    L ${ix + is * 0.10} ${iy - is * 0.10}
                    L ${ix + is * 0.30} ${iy + is * 0.20}
                    L ${ix + is * 0.50} ${iy - is * 0.10}
                    L ${ix + is * 0.65} ${iy + is * 0.20}`}
                    stroke="#e8c080" strokeWidth={1.4} fill="none" />
                </g>
              );
            case "mandolin":
              return (
                <g key={`ins-${spec.idx}`} transform={`rotate(-15 ${ix} ${iy})`}>
                  <ellipse cx={ix} cy={iy} rx={is * 0.40} ry={is * 0.55}
                    fill="#c08040" stroke={stroke} strokeWidth={2} />
                  <circle cx={ix} cy={iy + is * 0.05} r={is * 0.10} fill="#3a1808" stroke={stroke} strokeWidth={1} />
                  <rect x={ix - is * 0.05} y={iy - is * 1.0} width={is * 0.10} height={is * 0.50}
                    fill="#5a3812" stroke={stroke} strokeWidth={1.2} />
                </g>
              );
            case "horn":
              return (
                <g key={`ins-${spec.idx}`} transform={`rotate(-25 ${ix} ${iy})`}>
                  <path d={`M ${ix - is * 0.4} ${iy}
                    L ${ix + is * 0.5} ${iy}
                    L ${ix + is * 0.7} ${iy - is * 0.30}
                    L ${ix + is * 0.7} ${iy + is * 0.30}
                    L ${ix + is * 0.5} ${iy} Z`}
                    fill="#e0c060" stroke={stroke} strokeWidth={2} />
                  <ellipse cx={ix + is * 0.7} cy={iy} rx={is * 0.16} ry={is * 0.30}
                    fill="#f8e090" stroke={stroke} strokeWidth={1.4} />
                  <circle cx={ix - is * 0.4} cy={iy} r={is * 0.10} fill="#a08040" stroke={stroke} strokeWidth={1.4} />
                </g>
              );
          }
        })()}

        {/* ── Glow halo ── */}
        <ellipse cx={tx} cy={ty} rx={tW * 0.65} ry={tH * 0.5}
          fill={hsl(shellHue, 45, 35)} opacity={0.18 * bounce}
          filter="url(#mt-blur)" />
      </g>
    );
  }

  // Star nodes
  const starNodes = stars.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`st-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + flick * 0.5)}
        fill="#c8b88a" opacity={0.25 + flick * 0.30} />
    );
  });

  // Spark nodes
  const sparkNodes = sparks.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`spk-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + bounce * 0.5)}
        fill={hsl(tintHue, 50, 45)} opacity={0.25 * flick * bounce} />
    );
  });

  // Stage lights overhead
  const stageLights = Array.from({ length: 5 }).map((_, i) => {
    const lx = (0.10 + i * 0.20) * width;
    const ly = height * 0.04;
    return (
      <g key={`sl-${i}`}>
        <rect x={lx - 18} y={ly - 8} width={36} height={16} rx={4}
          fill="rgba(25, 22, 30, 0.90)" stroke="rgba(40, 38, 48, 0.85)" strokeWidth={1} />
        <ellipse cx={lx} cy={ly + 8} rx={14} ry={6}
          fill="rgba(180, 155, 100, 0.55)" />
        <path d={`M ${lx - 80} ${ly + 8} L ${lx + 80} ${ly + 8}
          L ${lx + 200} ${groundY} L ${lx - 200} ${groundY} Z`}
          fill="rgba(180, 155, 100, 0.04)" />
      </g>
    );
  });

  // Sort turtles by depth so back ones render first
  const sorted = [...turtles].sort((a, b) => a.depth - b.depth);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="mt-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="mt-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(30, 20, 10, 0.95)" />
            <stop offset="100%" stopColor="rgba(8, 4, 2, 1)" />
          </linearGradient>
          <radialGradient id="mt-spot">
            <stop offset="0%" stopColor={hsl(tintHue, 40, 50)} stopOpacity={0.25} />
            <stop offset="100%" stopColor={hsl(tintHue, 40, 50)} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="mt-vig">
            <stop offset="40%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.78)" />
          </radialGradient>
          <filter id="mt-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#mt-sky)" />

        {/* Stars */}
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Stage truss + lights */}
        <line x1={0} y1={height * 0.06} x2={width} y2={height * 0.06}
          stroke="rgba(30, 28, 35, 0.85)" strokeWidth={3} />
        {stageLights}

        {/* Spotlight */}
        <ellipse cx={width / 2} cy={groundY - baseTurtleH * 0.4} rx={width * 0.65} ry={baseTurtleH * 0.7}
          fill="url(#mt-spot)" style={{ mixBlendMode: "screen" }} opacity={warmth} />

        {/* Distant horizon */}
        <path d={`M 0 ${height * 0.72} L ${width * 0.18} ${height * 0.64} L ${width * 0.32} ${height * 0.68} L ${width * 0.5} ${height * 0.60} L ${width * 0.68} ${height * 0.66} L ${width * 0.85} ${height * 0.62} L ${width} ${height * 0.68} L ${width} ${height * 0.78} L 0 ${height * 0.78} Z`}
          fill="rgba(10, 8, 18, 0.92)" />

        {/* Stage floor */}
        <rect x={0} y={groundY} width={width} height={height - groundY} fill="url(#mt-floor)" />
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`plank-${i}`} x1={0} y1={groundY + i * 14} x2={width} y2={groundY + i * 14}
            stroke="rgba(40, 22, 8, 0.35)" strokeWidth={0.8} />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <line key={`pv-${i}`} x1={(i / 11) * width} y1={groundY} x2={(i / 11) * width} y2={height}
            stroke="rgba(40, 22, 8, 0.22)" strokeWidth={0.6} />
        ))}

        {/* Turtles */}
        {sorted.map(buildTurtle)}

        {/* Sparks */}
        <g style={{ mixBlendMode: "screen" }}>{sparkNodes}</g>

        {/* Onset flash */}
        {flash > 0.05 && (
          <rect width={width} height={height}
            fill={`rgba(180, 150, 100, ${flash * 0.08})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#mt-vig)" />
      </svg>
    </div>
  );
};
