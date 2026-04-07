/**
 * ThirteenPointBolt — A+++ overlay: the 13-point lightning bolt symbol from
 * the Steal Your Face logo at LARGE scale (~50% of frame width). Each point
 * clearly defined with sharp corners. Yellow/electric color with multiple
 * glow layers, animated electric crackle, and branching mini-bolts. Stormy
 * sky backdrop with rolling clouds and ground silhouette.
 *
 * Audio reactivity:
 *   slowEnergy → atmospheric warmth + storm intensity
 *   energy     → bolt brightness + branch density
 *   bass       → low-end thunder rumble
 *   beatDecay  → bolt pulse
 *   onsetEnvelope → strike flash trigger
 *   chromaHue  → bolt tint shift (gold ↔ blue ↔ violet)
 *   tempoFactor → crackle animation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const CLOUD_COUNT = 9;
const SPARK_COUNT = 80;
const BRANCH_COUNT = 6;
const STAR_COUNT = 60;

interface Cloud { cx: number; cy: number; rx: number; ry: number; drift: number; shade: number; }
interface Spark { x: number; y: number; r: number; speed: number; phase: number; }
interface Branch { startT: number; angle: number; len: number; phase: number; }
interface Star { x: number; y: number; r: number; phase: number; speed: number; }

function buildClouds(): Cloud[] {
  const rng = seeded(48_771_226);
  return Array.from({ length: CLOUD_COUNT }, () => ({
    cx: rng(),
    cy: 0.05 + rng() * 0.32,
    rx: 0.18 + rng() * 0.22,
    ry: 0.05 + rng() * 0.07,
    drift: 0.0001 + rng() * 0.00035,
    shade: 0.18 + rng() * 0.34,
  }));
}

function buildSparks(): Spark[] {
  const rng = seeded(91_338_447);
  return Array.from({ length: SPARK_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.6 + rng() * 2.4,
    speed: 0.01 + rng() * 0.06,
    phase: rng() * Math.PI * 2,
  }));
}

function buildBranches(): Branch[] {
  const rng = seeded(28_991_447);
  return Array.from({ length: BRANCH_COUNT }, () => ({
    startT: 0.15 + rng() * 0.7,
    angle: (rng() - 0.5) * Math.PI * 0.6,
    len: 30 + rng() * 80,
    phase: rng() * Math.PI * 2,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(72_991_338);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.5,
    r: 0.4 + rng() * 1.4,
    phase: rng() * Math.PI * 2,
    speed: 0.005 + rng() * 0.025,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const ThirteenPointBolt: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const clouds = React.useMemo(buildClouds, []);
  const sparks = React.useMemo(buildSparks, []);
  const branches = React.useMemo(buildBranches, []);
  const stars = React.useMemo(buildStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives
  const warmth = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const boltBright = interpolate(snap.energy, [0.02, 0.30], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stormDrive = interpolate(snap.bass, [0.0, 0.65], [0.30, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const boltPulse = 1 + snap.beatDecay * 0.06;
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;

  // Bolt palette modulated by chromaHue
  const baseHue = 50;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const boltColor = `hsl(${tintHue}, 92%, ${60 + boltBright * 14}%)`;
  const boltCore = `hsl(${tintHue}, 100%, ${82 + boltBright * 12}%)`;
  const boltDeep = `hsl(${(tintHue - 20 + 360) % 360}, 90%, ${42 + boltBright * 10}%)`;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 30%, 6%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 24%, 12%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 38%, 18%)`;

  // ─── HERO LAYOUT ───────────────────────────────────────────────────
  const cx = width / 2;
  const cy = height / 2;
  const boltW = width * 0.25;       // bolt width 25% of frame width
  const boltH = height * 0.78;      // bolt height 78% of frame height (LARGE)

  // The 13-point bolt is the iconic Stealie shape — sharp Z-zig-zag with 13 corners
  // Express in (-1..1) units around (cx, cy), scale by boltW × 0.5 horizontally, boltH × 0.5 vertically
  const bx = (u: number) => cx + u * boltW * 0.5;
  const by = (v: number) => cy + v * boltH * 0.5;

  // 13 vertices of the classic bolt shape:
  const boltPoints = [
    [0.05, -1.00],  // 1: top-right tip
    [-0.50, -0.20], // 2: upper-left zig
    [0.05, -0.20],  // 3: upper-right zig
    [-0.55, 0.20],  // 4: middle-left zig
    [-0.10, 0.20],  // 5: middle-right zig
    [-0.60, 1.00],  // 6: bottom-left tip
    [0.50, 0.10],   // 7: lower-right zig
    [-0.10, 0.10],  // 8: lower-left zig
    [0.60, -0.30],  // 9: middle-right top
    [0.05, -0.30],  // 10: middle-left top
    [0.45, -1.00],  // 11: top-right (start of upper-right segment)
    [0.40, -1.00],  // 12: top tweak
    [0.05, -1.00],  // 13: close to start
  ];
  const boltPath = boltPoints
    .map(([u, v], i) => `${i === 0 ? "M" : "L"} ${bx(u)} ${by(v)}`)
    .join(" ") + " Z";

  // Star nodes
  const starNodes = stars.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`st-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + flick * 0.6)}
        fill="#fff5d0" opacity={0.30 + flick * 0.45} />
    );
  });

  // Storm clouds
  const cloudNodes = clouds.map((c, i) => {
    const cxN = ((c.cx + frame * c.drift * (1 + stormDrive * 0.6)) % 1.2) - 0.1;
    const churn = 1 + stormDrive * 0.18 + Math.sin(frame * 0.012 + i) * 0.04;
    return (
      <ellipse key={`cl-${i}`} cx={cxN * width} cy={c.cy * height}
        rx={c.rx * width * churn} ry={c.ry * height * churn}
        fill={`rgba(${20 + c.shade * 10}, ${22 + c.shade * 10}, ${30 + c.shade * 12}, ${0.55 + stormDrive * 0.22})`}
        filter="url(#tpb-blur)" />
    );
  });

  // Sparks
  const sparkNodes = sparks.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`spk-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + boltBright * 0.6)}
        fill={boltCore} opacity={0.40 * flick * boltBright} />
    );
  });

  // Branches — mini bolts shooting off the main bolt
  const branchNodes = branches.map((b, i) => {
    // Sample point along main bolt path (linear interp between two adjacent vertices)
    const segmentIdx = Math.floor(b.startT * (boltPoints.length - 1));
    const segT = b.startT * (boltPoints.length - 1) - segmentIdx;
    const p1 = boltPoints[segmentIdx];
    const p2 = boltPoints[Math.min(segmentIdx + 1, boltPoints.length - 1)];
    const sx0 = bx(p1[0] + (p2[0] - p1[0]) * segT);
    const sy0 = by(p1[1] + (p2[1] - p1[1]) * segT);
    const wig = Math.sin(frame * 0.10 * tempoFactor + b.phase) * 0.3;
    const a = b.angle + wig;
    const len = b.len * (0.85 + boltBright * 0.30);
    const ex = sx0 + Math.cos(a) * len;
    const ey = sy0 + Math.sin(a) * len;
    const mx = sx0 + Math.cos(a) * len * 0.5 + Math.sin(a) * 8;
    const my = sy0 + Math.sin(a) * len * 0.5 - Math.cos(a) * 8;
    return (
      <g key={`br-${i}`}>
        <path d={`M ${sx0} ${sy0} L ${mx} ${my} L ${ex} ${ey}`}
          stroke={boltCore} strokeWidth={3} fill="none"
          strokeLinecap="round" strokeLinejoin="round" opacity={0.85 + flash * 0.15} />
        <path d={`M ${sx0} ${sy0} L ${mx} ${my} L ${ex} ${ey}`}
          stroke="rgba(255, 250, 220, 0.95)" strokeWidth={1.4} fill="none"
          strokeLinecap="round" strokeLinejoin="round" opacity={0.6 + flash * 0.4} />
      </g>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="tpb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="tpb-bolt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={boltCore} />
            <stop offset="50%" stopColor={boltColor} />
            <stop offset="100%" stopColor={boltDeep} />
          </linearGradient>
          <radialGradient id="tpb-glow">
            <stop offset="0%" stopColor={boltCore} stopOpacity={0.65} />
            <stop offset="100%" stopColor={boltColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="tpb-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="tpb-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="tpb-glow-flt" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="tpb-corona" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#tpb-sky)" />

        {/* Stars */}
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Storm clouds */}
        <g>{cloudNodes}</g>

        {/* Distant horizon silhouette */}
        <path d={`M 0 ${height * 0.78} L ${width * 0.18} ${height * 0.74} L ${width * 0.32} ${height * 0.76} L ${width * 0.5} ${height * 0.72} L ${width * 0.68} ${height * 0.75} L ${width * 0.85} ${height * 0.71} L ${width} ${height * 0.78} L ${width} ${height * 0.82} L 0 ${height * 0.82} Z`}
          fill="rgba(8, 4, 12, 0.92)" />

        {/* Big halo behind bolt */}
        <ellipse cx={cx} cy={cy} rx={boltW * 1.2} ry={boltH * 0.7}
          fill="url(#tpb-glow)" style={{ mixBlendMode: "screen" }} opacity={warmth} />

        {/* ── BRANCHES (drawn behind main bolt) ── */}
        <g style={{ mixBlendMode: "screen" }}>{branchNodes}</g>

        {/* ── BOLT — 3 layers (atmospheric/main/core) ── */}
        {/* Outermost soft glow */}
        <g filter="url(#tpb-glow-flt)" style={{ mixBlendMode: "screen" }}>
          <path d={boltPath} fill={boltCore} opacity={0.55 + flash * 0.30} />
        </g>
        {/* Mid glow */}
        <g filter="url(#tpb-corona)" style={{ mixBlendMode: "screen" }}>
          <path d={boltPath} fill={boltColor} opacity={0.75 + flash * 0.25} />
        </g>
        {/* Core */}
        <g transform={`scale(${boltPulse}) translate(${cx * (1 - 1 / boltPulse)}, ${cy * (1 - 1 / boltPulse)})`}>
          <path d={boltPath} fill="url(#tpb-bolt)" stroke={boltCore} strokeWidth={3} strokeLinejoin="miter" />
          {/* Inner highlight */}
          <path d={boltPath} fill="rgba(255, 255, 240, 0.65)" opacity={0.4 + flash * 0.5}
            transform={`scale(0.92) translate(${cx * 0.08}, ${cy * 0.08})`} />
        </g>

        {/* Vertex sparkles at all 13 corners */}
        {boltPoints.slice(0, 11).map(([u, v], i) => {
          const x = bx(u);
          const y = by(v);
          const flick = 0.6 + Math.sin(frame * 0.4 + i) * 0.4;
          return (
            <g key={`vtx-${i}`}>
              <circle cx={x} cy={y} r={6 + flash * 8}
                fill={boltCore} opacity={0.75 * flick} style={{ mixBlendMode: "screen" }} />
              <circle cx={x} cy={y} r={2.5}
                fill="rgba(255, 250, 240, 1)" opacity={0.95 * flick} />
            </g>
          );
        })}

        {/* Sparks on top */}
        <g style={{ mixBlendMode: "screen" }}>{sparkNodes}</g>

        {/* Onset white flash */}
        {flash > 0.05 && (
          <rect width={width} height={height}
            fill={`rgba(255, 250, 220, ${flash * 0.18})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#tpb-vig)" />
      </svg>
    </div>
  );
};
