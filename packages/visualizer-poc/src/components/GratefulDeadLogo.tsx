/**
 * GratefulDeadLogo — A+++ overlay: the classic "GRATEFUL DEAD" wordmark in
 * Rick Griffin / Owsley Stanley psychedelic poster style. Letterforms are
 * hand-drawn SVG paths with thick strokes, drop shadows, and a tiny lightning
 * bolt accent between the words. Wordmark fills ~70% of width. Backdrop is a
 * swirling psychedelic field with lava lamp blobs.
 *
 * Audio reactivity:
 *   slowEnergy → backdrop warmth + glow
 *   energy     → letter shimmer + outline brightness
 *   bass       → drop shadow weight
 *   beatDecay  → letter pulse
 *   onsetEnvelope → rimlight flash
 *   chromaHue  → backdrop palette tint
 *   tempoFactor → swirl rotation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const BLOB_COUNT = 14;
const SWIRL_COUNT = 8;
const SPARK_COUNT = 60;
const STAR_COUNT = 80;

interface Blob { cx: number; cy: number; rx: number; ry: number; drift: number; phase: number; shade: number; }
interface Spark { x: number; y: number; r: number; speed: number; phase: number; }

function buildBlobs(): Blob[] {
  const rng = seeded(38_771_204);
  return Array.from({ length: BLOB_COUNT }, () => ({
    cx: rng(),
    cy: rng(),
    rx: 0.12 + rng() * 0.20,
    ry: 0.08 + rng() * 0.16,
    drift: 0.0006 + rng() * 0.003,
    phase: rng() * Math.PI * 2,
    shade: rng(),
  }));
}

function buildSparks(): Spark[] {
  const rng = seeded(27_338_991);
  return Array.from({ length: SPARK_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.6 + rng() * 2.4,
    speed: 0.01 + rng() * 0.06,
    phase: rng() * Math.PI * 2,
  }));
}

function buildStars(): Spark[] {
  const rng = seeded(56_211_874);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.4 + rng() * 1.2,
    speed: 0.005 + rng() * 0.025,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

// ─── Letter renderer (block letters with thick stroke) ─────────────
function buildLetterPath(ch: string, lx: number, ly: number, lW: number, lH: number): string {
  const x0 = lx - lW * 0.40;
  const x1 = lx + lW * 0.40;
  const y0 = ly - lH * 0.45;
  const y1 = ly + lH * 0.45;
  const ym = ly;
  switch (ch) {
    case "G":
      return `M ${x1} ${y0 + lH * 0.15}
        Q ${x0} ${y0 - lH * 0.05} ${x0} ${ym}
        Q ${x0} ${y1 + lH * 0.05} ${x1} ${y1 - lH * 0.10}
        L ${x1} ${ym + lH * 0.05}
        L ${lx + lW * 0.05} ${ym + lH * 0.05}`;
    case "R":
      return `M ${x0} ${y1} L ${x0} ${y0}
        L ${x1 - lW * 0.05} ${y0}
        Q ${x1 + lW * 0.10} ${y0 + lH * 0.22} ${x1 - lW * 0.05} ${ym}
        L ${x0 + lW * 0.05} ${ym}
        L ${x1} ${y1}`;
    case "A":
      return `M ${x0} ${y1} L ${lx} ${y0} L ${x1} ${y1} M ${x0 + lW * 0.16} ${ym + lH * 0.10} L ${x1 - lW * 0.16} ${ym + lH * 0.10}`;
    case "T":
      return `M ${x0} ${y0} L ${x1} ${y0} M ${lx} ${y0} L ${lx} ${y1}`;
    case "E":
      return `M ${x1} ${y0} L ${x0} ${y0} L ${x0} ${y1} L ${x1} ${y1} M ${x0} ${ym} L ${x1 - lW * 0.10} ${ym}`;
    case "F":
      return `M ${x0} ${y1} L ${x0} ${y0} L ${x1} ${y0} M ${x0} ${ym} L ${x1 - lW * 0.18} ${ym}`;
    case "U":
      return `M ${x0} ${y0}
        L ${x0} ${y1 - lH * 0.18}
        Q ${x0} ${y1 + lH * 0.06} ${lx} ${y1 + lH * 0.06}
        Q ${x1} ${y1 + lH * 0.06} ${x1} ${y1 - lH * 0.18}
        L ${x1} ${y0}`;
    case "L":
      return `M ${x0} ${y0} L ${x0} ${y1} L ${x1} ${y1}`;
    case "D":
      return `M ${x0} ${y0} L ${x0} ${y1}
        L ${x1 - lW * 0.10} ${y1}
        Q ${x1 + lW * 0.18} ${ym} ${x1 - lW * 0.10} ${y0} Z`;
    default:
      return "";
  }
}

export const GratefulDeadLogo: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const blobs = React.useMemo(buildBlobs, []);
  const sparks = React.useMemo(buildSparks, []);
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
  const shimmer = interpolate(snap.energy, [0.02, 0.30], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dropWeight = interpolate(snap.bass, [0.0, 0.65], [0.35, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const letterPulse = 1 + snap.beatDecay * 0.06;
  const flash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Psychedelic palette
  const baseHue = 14;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.40) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 78%, ${60 + shimmer * 14}%)`;
  const tintCore = `hsl(${tintHue}, 92%, ${78 + shimmer * 12}%)`;
  const compHue = (tintHue + 180) % 360;
  const compColor = `hsl(${compHue}, 70%, 60%)`;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 50%, 8%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 35%, 14%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 45%, 22%)`;
  const swirlRotation = (frame * 0.10 * tempoFactor) % 360;

  // ─── HERO LAYOUT ───────────────────────────────────────────────────
  const cx = width / 2;
  const cy = height / 2;
  const wordmarkW = width * 0.72;
  const letterH = height * 0.18;
  const grateY = cy - letterH * 0.65;
  const deadY = cy + letterH * 0.65;
  const lW = wordmarkW / 9;
  const stroke = Math.max(4, lW * 0.15);

  // Blob nodes
  const blobNodes = blobs.map((b, i) => {
    const wob = 1 + Math.sin(frame * 0.012 + b.phase) * 0.10;
    const xN = (b.cx + frame * b.drift) % 1.2 - 0.1;
    return (
      <ellipse key={`blob-${i}`} cx={xN * width} cy={b.cy * height}
        rx={b.rx * width * wob} ry={b.ry * height * wob}
        fill={`hsla(${(tintHue + b.shade * 80 - 40) % 360}, 75%, ${40 + b.shade * 20}%, ${0.22 + warmth * 0.15})`}
        filter="url(#gd-blur)" />
    );
  });

  // Spark sparkles
  const sparkNodes = sparks.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`spk-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.7 + shimmer * 0.6)}
        fill={tintCore} opacity={0.40 * flick * shimmer} />
    );
  });

  // Background distant stars
  const starNodes = stars.map((s, i) => {
    const flick = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle key={`star-${i}`} cx={s.x * width} cy={s.y * height} r={s.r}
        fill="#f0e8ff" opacity={0.30 + flick * 0.45} />
    );
  });

  // Concentric swirl rings
  const swirlNodes: React.ReactNode[] = [];
  for (let r = 0; r < SWIRL_COUNT; r++) {
    const radius = (r + 1) * (Math.min(width, height) * 0.08);
    swirlNodes.push(
      <circle key={`swirl-${r}`} cx={cx} cy={cy} r={radius}
        stroke={tintColor} strokeWidth={1.4} strokeDasharray={`${4 + r} ${10 + r * 2}`}
        fill="none" opacity={0.10 + warmth * 0.10}
        transform={`rotate(${swirlRotation + r * 12} ${cx} ${cy})`} />,
    );
  }

  // GRATEFUL — 8 letters
  const grateLetters = "GRATEFUL".split("");
  const grateNodes = grateLetters.map((ch, i) => {
    const lx = cx - wordmarkW * 0.50 + (i + 0.5) * (wordmarkW / grateLetters.length);
    const d = buildLetterPath(ch, lx, grateY, lW, letterH);
    return <path key={`gL-${i}`} d={d} stroke={tintColor} strokeWidth={stroke}
      fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  });
  // DEAD — 4 letters (slightly bigger spacing)
  const deadLetters = "DEAD".split("");
  const deadNodes = deadLetters.map((ch, i) => {
    const lx = cx - wordmarkW * 0.30 + (i + 0.5) * (wordmarkW * 0.6 / deadLetters.length);
    const d = buildLetterPath(ch, lx, deadY, lW * 1.05, letterH);
    return <path key={`dL-${i}`} d={d} stroke={tintColor} strokeWidth={stroke}
      fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  });

  // Shadow letters (offset behind)
  const grateShadow = grateLetters.map((ch, i) => {
    const lx = cx - wordmarkW * 0.50 + (i + 0.5) * (wordmarkW / grateLetters.length);
    const d = buildLetterPath(ch, lx, grateY, lW, letterH);
    return <path key={`gS-${i}`} d={d} stroke="rgba(15, 4, 2, 0.85)" strokeWidth={stroke}
      fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  });
  const deadShadow = deadLetters.map((ch, i) => {
    const lx = cx - wordmarkW * 0.30 + (i + 0.5) * (wordmarkW * 0.6 / deadLetters.length);
    const d = buildLetterPath(ch, lx, deadY, lW * 1.05, letterH);
    return <path key={`dS-${i}`} d={d} stroke="rgba(15, 4, 2, 0.85)" strokeWidth={stroke}
      fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="gd-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <radialGradient id="gd-glow">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.55} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="gd-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="gd-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
          <filter id="gd-soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#gd-sky)" />

        {/* Lava-lamp blobs */}
        <g>{blobNodes}</g>

        {/* Concentric swirl rings */}
        <g>{swirlNodes}</g>

        {/* Background stars */}
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Big halo behind wordmark */}
        <ellipse cx={cx} cy={cy} rx={wordmarkW * 0.6} ry={letterH * 1.6}
          fill="url(#gd-glow)" style={{ mixBlendMode: "screen" }} />

        {/* WORDMARK shadow layer (offset behind) */}
        <g transform={`translate(${4 + dropWeight * 6}, ${5 + dropWeight * 7})`} opacity={0.55 * dropWeight}>
          {grateShadow}
          {deadShadow}
        </g>

        {/* WORDMARK soft glow layer */}
        <g filter="url(#gd-soft)" style={{ mixBlendMode: "screen" }} opacity={0.85 * shimmer}>
          {grateNodes}
          {deadNodes}
        </g>

        {/* WORDMARK main strokes */}
        <g transform={`translate(${cx}, ${cy}) scale(${letterPulse}) translate(${-cx}, ${-cy})`}>
          {grateNodes}
          {deadNodes}
        </g>

        {/* Tiny lightning bolt accent between words */}
        <g transform={`translate(${cx}, ${cy}) scale(${0.9 + flash * 0.3})`}>
          <path d={`M -8 -22 L -2 -4 L -10 -4 L 4 22 L -2 6 L 6 6 L -2 -22 Z`}
            fill={compColor} opacity={0.85 + flash * 0.15} />
          <path d={`M -8 -22 L -2 -4 L -10 -4 L 4 22 L -2 6 L 6 6 L -2 -22 Z`}
            fill="rgba(255, 250, 220, 0.75)" opacity={0.4 + flash * 0.5} />
        </g>

        {/* Sparkle field on top */}
        <g style={{ mixBlendMode: "screen" }}>{sparkNodes}</g>

        {/* Onset rim flash */}
        {flash > 0.05 && (
          <rect width={width} height={height}
            fill={`rgba(255, 245, 220, ${flash * 0.10})`}
            style={{ mixBlendMode: "screen" }} />
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#gd-vig)" />
      </svg>
    </div>
  );
};
