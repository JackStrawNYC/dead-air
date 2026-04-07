/**
 * DancingTerrapinOverlay — A+++ Stanley Mouse-style Terrapin Station tribute.
 *
 * 5 stylized dancing terrapins in profile across a stage, with realistic
 * carapace patterns (proper hexagonal scutes, growth ridges, leathery skin),
 * holding instruments. NOT child-cartoon turtles — these have angular
 * Stanley Mouse-esque silhouettes, deep shell rings, weathered texture, no
 * smiles or googly eyes.
 *
 * Hero scale: each turtle is ~30-40% of frame height. They take up the
 * lower-center of the frame against a Terrapin Station starscape backdrop
 * with crescent moon and distant mountains.
 *
 * Audio reactivity:
 *   slowEnergy → spotlight warmth
 *   energy     → bounce + glow
 *   bass       → stomp depth
 *   beatDecay  → shell pulse + step
 *   onsetEnvelope → sparkle burst
 *   chromaHue  → palette shift
 *   tempoFactor → walk speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const TURTLE_COUNT = 5;
const STAR_COUNT = 90;
const SPARK_COUNT = 50;

type Instrument = "banjo" | "tambourine" | "fiddle" | "drum" | "horn";

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
  return [
    { idx: 0, xFrac: 0.10, depth: 0.78, hue: 110, instrument: "banjo",       phase: 0.0 },
    { idx: 1, xFrac: 0.28, depth: 0.92, hue: 150, instrument: "tambourine",  phase: 1.2 },
    { idx: 2, xFrac: 0.50, depth: 1.05, hue: 88,  instrument: "fiddle",      phase: 2.4 },
    { idx: 3, xFrac: 0.72, depth: 0.92, hue: 28,  instrument: "drum",        phase: 0.7 },
    { idx: 4, xFrac: 0.90, depth: 0.78, hue: 200, instrument: "horn",        phase: 1.9 },
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

const hsl = (h: number, s = 80, l = 55) => `hsl(${((h % 360) + 360) % 360}, ${s}%, ${l}%)`;

interface Props { frames: EnhancedFrameData[]; }

export const DancingTerrapinOverlay: React.FC<Props> = ({ frames }) => {
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

  const warmth = interpolate(snap.slowEnergy, [0.0, 0.32], [0.55, 1.10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bounce = interpolate(snap.energy, [0.0, 0.30], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  const tintShift = snap.chromaHue - 180;
  const baseHue = 130;
  const tintHue = ((baseHue + tintShift * 0.30) % 360 + 360) % 360;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 50%, 8%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 38%, 14%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 45%, 24%)`;

  const groundY = height * 0.78;
  const baseTurtleH = height * 0.40;

  /** Hex point list helper */
  const hexPts = (cx: number, cy: number, r: number) => {
    let s = "";
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k - Math.PI / 2;
      s += `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)} `;
    }
    return s.trim();
  };

  // ─── TURTLE BUILDER ──
  function buildTurtle(spec: TurtleSpec): React.ReactNode {
    const scale = spec.depth;
    const tH = baseTurtleH * scale;
    const tW = tH * 1.20;
    const cx = spec.xFrac * width;
    const bobPhase = frame * 0.10 * tempoFactor + spec.phase;
    const bob = Math.sin(bobPhase) * (4 + bounce * 6 + snap.beatDecay * 8) * scale;
    const cyT = groundY - tH * 0.45 + bob;

    const shellHue = (spec.hue + tintShift * 0.5) % 360;
    const shellMain = hsl(shellHue, 65, 42);
    const shellLight = hsl(shellHue, 75, 60);
    const shellDeep = hsl(shellHue, 75, 22);
    const shellRim = hsl(shellHue, 80, 14);
    const skinCol = hsl(shellHue + 30, 50, 42);
    const skinDeep = hsl(shellHue + 30, 60, 26);
    const skinLeath = hsl(shellHue + 20, 35, 32);
    const accent = hsl(shellHue, 100, 70);
    const stroke = "rgba(15, 8, 2, 0.92)";

    const tx = cx;
    const ty = cyT;
    const legA = Math.sin(bobPhase) * 6 * scale;
    const legB = Math.sin(bobPhase + Math.PI) * 6 * scale;
    const legC = Math.sin(bobPhase + Math.PI / 2) * 6 * scale;
    const legD = Math.sin(bobPhase + Math.PI * 1.5) * 6 * scale;

    // Central scute relative positions
    const scutes: [number, number, number][] = [
      [0, -0.04, 0.13],   // center
      [0, -0.18, 0.10],
      [-0.13, -0.10, 0.10],
      [0.13, -0.10, 0.10],
      [0, 0.06, 0.10],
      [-0.12, 0.04, 0.09],
      [0.12, 0.04, 0.09],
    ];

    return (
      <g key={`t-${spec.idx}`}>
        {/* Ground shadow */}
        <ellipse cx={tx} cy={groundY + 4} rx={tW * 0.55} ry={6 * scale}
          fill="rgba(0, 0, 0, 0.55)" />

        {/* ── Hind legs (leathery skin) ── */}
        <g transform={`translate(0 ${legB})`}>
          <ellipse cx={tx + tW * 0.32} cy={ty + tH * 0.28}
            rx={tW * 0.085} ry={tH * 0.12}
            fill={skinDeep} stroke={stroke} strokeWidth={2.0} />
          {/* Skin ridges */}
          <line x1={tx + tW * 0.27} y1={ty + tH * 0.24} x2={tx + tW * 0.37} y2={ty + tH * 0.24}
            stroke={skinLeath} strokeWidth={0.8} opacity={0.7} />
          <line x1={tx + tW * 0.27} y1={ty + tH * 0.30} x2={tx + tW * 0.37} y2={ty + tH * 0.30}
            stroke={skinLeath} strokeWidth={0.8} opacity={0.7} />
          {/* Foot */}
          <ellipse cx={tx + tW * 0.34} cy={ty + tH * 0.40}
            rx={tW * 0.10} ry={tH * 0.04}
            fill={skinDeep} stroke={stroke} strokeWidth={1.6} />
          {/* Claws */}
          {[0, 1, 2].map((c) => (
            <path key={`c1-${c}`}
              d={`M ${tx + tW * (0.32 + c * 0.025)} ${ty + tH * 0.42}
                  L ${tx + tW * (0.33 + c * 0.025)} ${ty + tH * 0.46}`}
              stroke="rgba(15, 8, 2, 0.95)" strokeWidth={1.6} strokeLinecap="round" />
          ))}
        </g>
        <g transform={`translate(0 ${legD})`}>
          <ellipse cx={tx - tW * 0.32} cy={ty + tH * 0.28}
            rx={tW * 0.085} ry={tH * 0.12}
            fill={skinDeep} stroke={stroke} strokeWidth={2.0} />
          <line x1={tx - tW * 0.27} y1={ty + tH * 0.24} x2={tx - tW * 0.37} y2={ty + tH * 0.24}
            stroke={skinLeath} strokeWidth={0.8} opacity={0.7} />
          <line x1={tx - tW * 0.27} y1={ty + tH * 0.30} x2={tx - tW * 0.37} y2={ty + tH * 0.30}
            stroke={skinLeath} strokeWidth={0.8} opacity={0.7} />
          <ellipse cx={tx - tW * 0.34} cy={ty + tH * 0.40}
            rx={tW * 0.10} ry={tH * 0.04}
            fill={skinDeep} stroke={stroke} strokeWidth={1.6} />
          {[0, 1, 2].map((c) => (
            <path key={`c2-${c}`}
              d={`M ${tx - tW * (0.32 + c * 0.025)} ${ty + tH * 0.42}
                  L ${tx - tW * (0.33 + c * 0.025)} ${ty + tH * 0.46}`}
              stroke="rgba(15, 8, 2, 0.95)" strokeWidth={1.6} strokeLinecap="round" />
          ))}
        </g>

        {/* ── Tail (segmented) ── */}
        <path d={`M ${tx + tW * 0.42} ${ty + tH * 0.05}
          Q ${tx + tW * 0.52} ${ty + tH * 0.10}
            ${tx + tW * 0.55} ${ty + tH * 0.18}`}
          stroke={skinDeep} strokeWidth={6 * scale} fill="none" strokeLinecap="round" />
        {/* Tail scales */}
        {[0.46, 0.50, 0.54].map((tt, ti) => (
          <line key={`tl-${ti}`}
            x1={tx + tW * tt} y1={ty + tH * (0.07 + ti * 0.02)}
            x2={tx + tW * (tt + 0.02)} y2={ty + tH * (0.10 + ti * 0.02)}
            stroke={shellDeep} strokeWidth={1.0} opacity={0.7} />
        ))}

        {/* ── Plastron (belly) ── */}
        <ellipse cx={tx} cy={ty + tH * 0.18} rx={tW * 0.34} ry={tH * 0.07}
          fill={skinLeath} opacity={0.55} stroke={stroke} strokeWidth={1.4} />
        {/* Belly scute lines */}
        <line x1={tx - tW * 0.30} y1={ty + tH * 0.18} x2={tx + tW * 0.30} y2={ty + tH * 0.18}
          stroke={skinDeep} strokeWidth={0.8} opacity={0.7} />
        <line x1={tx - tW * 0.20} y1={ty + tH * 0.14} x2={tx - tW * 0.20} y2={ty + tH * 0.22}
          stroke={skinDeep} strokeWidth={0.6} opacity={0.6} />
        <line x1={tx + tW * 0.20} y1={ty + tH * 0.14} x2={tx + tW * 0.20} y2={ty + tH * 0.22}
          stroke={skinDeep} strokeWidth={0.6} opacity={0.6} />

        {/* ── Shell dome with radial gradient ── */}
        <defs>
          <radialGradient id={`dt-shell-${spec.idx}`} cx="40%" cy="32%" r="65%">
            <stop offset="0%" stopColor={shellLight} />
            <stop offset="50%" stopColor={shellMain} />
            <stop offset="100%" stopColor={shellRim} />
          </radialGradient>
        </defs>
        <ellipse cx={tx} cy={ty} rx={tW * 0.45} ry={tH * 0.34}
          fill={`url(#dt-shell-${spec.idx})`} stroke={stroke} strokeWidth={3} />

        {/* Shell bottom rim shadow */}
        <ellipse cx={tx} cy={ty + tH * 0.10} rx={tW * 0.42} ry={tH * 0.06}
          fill={shellDeep} opacity={0.55} />

        {/* ── 14 marginal scutes around the rim ── */}
        {Array.from({ length: 14 }).map((_, k) => {
          const a = (k / 14) * Math.PI - Math.PI;
          const mx = tx + Math.cos(a) * tW * 0.42;
          const my = ty + Math.sin(a) * tH * 0.28 + tH * 0.05;
          return (
            <g key={`mg-${k}`}>
              <ellipse cx={mx} cy={my} rx={tW * 0.05} ry={tH * 0.04}
                fill={shellMain} stroke={shellRim} strokeWidth={1.0} opacity={0.85} />
              {/* Inner growth ring */}
              <ellipse cx={mx} cy={my} rx={tW * 0.03} ry={tH * 0.025}
                fill="none" stroke={shellRim} strokeWidth={0.5} opacity={0.7} />
            </g>
          );
        })}

        {/* ── 7 central hexagonal scutes with growth rings ── */}
        {scutes.map(([sx, sy, sr], si) => {
          const px = tx + sx * tW;
          const py = ty + sy * tH;
          return (
            <g key={`sc-${si}`}>
              <polygon points={hexPts(px, py, sr * tH)}
                fill={shellMain} stroke={shellRim} strokeWidth={1.6} opacity={0.92} />
              <polygon points={hexPts(px, py, sr * tH * 0.65)}
                fill="none" stroke={shellRim} strokeWidth={0.8} opacity={0.85} />
              <polygon points={hexPts(px, py, sr * tH * 0.40)}
                fill="none" stroke={shellRim} strokeWidth={0.5} opacity={0.7} />
              {/* Cross hatch growth */}
              <line x1={px - sr * tH * 0.5} y1={py} x2={px + sr * tH * 0.5} y2={py}
                stroke={shellRim} strokeWidth={0.4} opacity={0.5} />
            </g>
          );
        })}

        {/* Shell sheen overlay */}
        <ellipse cx={tx - tW * 0.12} cy={ty - tH * 0.18}
          rx={tW * 0.18} ry={tH * 0.10}
          fill="rgba(255, 255, 255, 0.22)" />
        {/* Specular crescent */}
        <path d={`M ${tx - tW * 0.20} ${ty - tH * 0.22}
          Q ${tx} ${ty - tH * 0.32} ${tx + tW * 0.20} ${ty - tH * 0.22}`}
          stroke="rgba(255, 255, 255, 0.22)" strokeWidth={2}
          fill="none" strokeLinecap="round" />

        {/* ── Front legs / flippers ── */}
        <g transform={`translate(0 ${legA})`}>
          <ellipse cx={tx - tW * 0.20} cy={ty + tH * 0.22}
            rx={tW * 0.10} ry={tH * 0.06}
            fill={skinDeep} stroke={stroke} strokeWidth={1.6}
            transform={`rotate(${-15} ${tx - tW * 0.20} ${ty + tH * 0.22})`} />
          {/* Skin scales */}
          <line x1={tx - tW * 0.27} y1={ty + tH * 0.20} x2={tx - tW * 0.13} y2={ty + tH * 0.22}
            stroke={skinLeath} strokeWidth={0.6} opacity={0.7} />
          {/* Claws */}
          {[0, 1, 2].map((c) => (
            <path key={`fc1-${c}`}
              d={`M ${tx - tW * (0.30 + c * 0.018)} ${ty + tH * 0.24}
                  L ${tx - tW * (0.31 + c * 0.018)} ${ty + tH * 0.27}`}
              stroke="rgba(15, 8, 2, 0.95)" strokeWidth={1.4} strokeLinecap="round" />
          ))}
        </g>
        <g transform={`translate(0 ${legC})`}>
          <ellipse cx={tx + tW * 0.20} cy={ty + tH * 0.22}
            rx={tW * 0.10} ry={tH * 0.06}
            fill={skinDeep} stroke={stroke} strokeWidth={1.6}
            transform={`rotate(${15} ${tx + tW * 0.20} ${ty + tH * 0.22})`} />
          <line x1={tx + tW * 0.13} y1={ty + tH * 0.22} x2={tx + tW * 0.27} y2={ty + tH * 0.20}
            stroke={skinLeath} strokeWidth={0.6} opacity={0.7} />
          {[0, 1, 2].map((c) => (
            <path key={`fc2-${c}`}
              d={`M ${tx + tW * (0.30 + c * 0.018)} ${ty + tH * 0.24}
                  L ${tx + tW * (0.31 + c * 0.018)} ${ty + tH * 0.27}`}
              stroke="rgba(15, 8, 2, 0.95)" strokeWidth={1.4} strokeLinecap="round" />
          ))}
        </g>

        {/* ── Neck bridge with leathery scales ── */}
        <path d={`M ${tx - tW * 0.52} ${ty - tH * 0.10}
          L ${tx - tW * 0.42} ${ty - tH * 0.10}
          L ${tx - tW * 0.40} ${ty + tH * 0.04}
          L ${tx - tW * 0.50} ${ty + tH * 0.04} Z`}
          fill={skinCol} stroke={stroke} strokeWidth={1.6} />
        {[0, 1, 2].map((n) => (
          <path key={`ns-${n}`}
            d={`M ${tx - tW * 0.50 + n * tW * 0.025} ${ty - tH * 0.06 + n * tH * 0.025}
                Q ${tx - tW * 0.475 + n * tW * 0.025} ${ty - tH * 0.07 + n * tH * 0.025}
                  ${tx - tW * 0.45 + n * tW * 0.025} ${ty - tH * 0.06 + n * tH * 0.025}`}
            stroke={skinDeep} strokeWidth={0.9} fill="none" opacity={0.8} />
        ))}

        {/* ── Angular Stanley Mouse-style head ── */}
        <path d={`M ${tx - tW * 0.52} ${ty - tH * 0.10}
          L ${tx - tW * 0.62} ${ty - tH * 0.08}
          L ${tx - tW * 0.68} ${ty - tH * 0.04}
          L ${tx - tW * 0.66} ${ty + tH * 0.02}
          L ${tx - tW * 0.58} ${ty + tH * 0.06}
          L ${tx - tW * 0.50} ${ty + tH * 0.04}
          L ${tx - tW * 0.48} ${ty - tH * 0.05} Z`}
          fill={skinCol} stroke={stroke} strokeWidth={2.0} />

        {/* Brow ridge */}
        <path d={`M ${tx - tW * 0.62} ${ty - tH * 0.06}
          Q ${tx - tW * 0.59} ${ty - tH * 0.09}
            ${tx - tW * 0.55} ${ty - tH * 0.07}`}
          stroke={skinDeep} strokeWidth={1.4} fill="none" opacity={0.85} />
        {/* Cheek scale lines */}
        <line x1={tx - tW * 0.58} y1={ty + tH * 0.00} x2={tx - tW * 0.55} y2={ty + tH * 0.02}
          stroke={skinDeep} strokeWidth={0.6} opacity={0.6} />
        <line x1={tx - tW * 0.55} y1={ty + tH * 0.02} x2={tx - tW * 0.52} y2={ty + tH * 0.04}
          stroke={skinDeep} strokeWidth={0.6} opacity={0.6} />

        {/* Eye — small, focused, no smile */}
        <ellipse cx={tx - tW * 0.59} cy={ty - tH * 0.04}
          rx={tH * 0.025} ry={tH * 0.020}
          fill="rgba(15, 8, 2, 0.85)" />
        <circle cx={tx - tW * 0.59} cy={ty - tH * 0.04}
          r={tH * 0.014}
          fill={hsl(shellHue + 60, 80, 38)} />
        <circle cx={tx - tW * 0.59} cy={ty - tH * 0.04}
          r={tH * 0.007} fill="black" />
        <circle cx={tx - tW * 0.592} cy={ty - tH * 0.043}
          r={tH * 0.003} fill="white" />

        {/* Beak */}
        <path d={`M ${tx - tW * 0.68} ${ty - tH * 0.02}
          L ${tx - tW * 0.71} ${ty}
          L ${tx - tW * 0.68} ${ty + tH * 0.02}`}
          stroke={stroke} strokeWidth={1.4} fill={skinDeep} />
        {/* Nostril */}
        <circle cx={tx - tW * 0.68} cy={ty - tH * 0.02} r={0.7} fill="black" opacity={0.7} />

        {/* ── Instrument ── */}
        {(() => {
          const ix = tx + tW * 0.08;
          const iy = ty - tH * 0.32;
          const is = tH * 0.18;
          switch (spec.instrument) {
            case "banjo":
              return (
                <g key={`ins-${spec.idx}`}>
                  <circle cx={ix} cy={iy} r={is * 0.55} fill="#d4a060" stroke={stroke} strokeWidth={2} />
                  <circle cx={ix} cy={iy} r={is * 0.42} fill="#e8c080" stroke={stroke} strokeWidth={1} />
                  <rect x={ix - is * 0.04} y={iy + is * 0.30} width={is * 0.08} height={is * 1.10}
                    fill="#5a3812" stroke={stroke} strokeWidth={1.4} />
                  {[0, 1, 2, 3].map((sn) => (
                    <line key={`bs-${sn}`}
                      x1={ix - is * 0.025 + sn * is * 0.018} y1={iy + is * 0.40}
                      x2={ix - is * 0.025 + sn * is * 0.018} y2={iy + is * 1.30}
                      stroke="rgba(255,255,255,0.85)" strokeWidth={0.6} />
                  ))}
                </g>
              );
            case "tambourine":
              return (
                <g key={`ins-${spec.idx}`}>
                  <circle cx={ix} cy={iy} r={is * 0.55} fill="#c4a060" stroke={stroke} strokeWidth={2.4} />
                  <circle cx={ix} cy={iy} r={is * 0.42} fill="rgba(40, 24, 8, 0.5)" stroke={stroke} strokeWidth={0.8} />
                  {Array.from({ length: 8 }).map((_, k) => {
                    const a = (k / 8) * Math.PI * 2;
                    return (
                      <circle key={`tj-${k}`}
                        cx={ix + Math.cos(a) * is * 0.55}
                        cy={iy + Math.sin(a) * is * 0.55}
                        r={is * 0.08} fill="#e8c080" stroke={stroke} strokeWidth={0.8} />
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
                  <circle cx={ix - is * 0.4} cy={iy} r={is * 0.10}
                    fill="#a08040" stroke={stroke} strokeWidth={1.4} />
                </g>
              );
          }
        })()}

        {/* Glow halo */}
        <ellipse cx={tx} cy={ty} rx={tW * 0.65} ry={tH * 0.5}
          fill={accent} opacity={0.20 * bounce} filter="url(#dt-blur)" />
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
        fill={hsl(tintHue, 95, 75)} opacity={0.40 * flick * bounce} />
    );
  });

  // Sort by depth
  const sorted = [...turtles].sort((a, b) => a.depth - b.depth);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="dt-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="dt-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(40, 24, 8, 0.95)" />
            <stop offset="100%" stopColor="rgba(15, 8, 2, 1)" />
          </linearGradient>
          <radialGradient id="dt-spot">
            <stop offset="0%" stopColor={hsl(tintHue, 90, 80)} stopOpacity={0.40} />
            <stop offset="100%" stopColor={hsl(tintHue, 90, 80)} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="dt-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="dt-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#dt-sky)" />

        {/* Stars */}
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Distant horizon */}
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

        {/* Crescent moon */}
        <circle cx={width * 0.85} cy={height * 0.18} r={26} fill="rgba(255, 240, 200, 0.85)" />
        <circle cx={width * 0.85 + 6} cy={height * 0.18 - 4} r={26} fill="rgba(15, 8, 22, 0.95)" />

        {/* Spotlight */}
        <ellipse cx={width / 2} cy={groundY - baseTurtleH * 0.4}
          rx={width * 0.65} ry={baseTurtleH * 0.85}
          fill="url(#dt-spot)" style={{ mixBlendMode: "screen" }} opacity={warmth} />

        {/* Stage floor */}
        <rect x={0} y={groundY} width={width} height={height - groundY} fill="url(#dt-ground)" />
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`plank-${i}`} x1={0} y1={groundY + i * 14} x2={width} y2={groundY + i * 14}
            stroke="rgba(70, 40, 14, 0.35)" strokeWidth={0.8} />
        ))}

        {/* Turtles */}
        {sorted.map(buildTurtle)}

        {/* Sparks */}
        <g style={{ mixBlendMode: "screen" }}>{sparkNodes}</g>

        {/* Onset flash */}
        {flash > 0.05 && (
          <rect width={width} height={height}
            fill={`rgba(255, 245, 220, ${flash * 0.10})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#dt-vig)" />
      </svg>
    </div>
  );
};
