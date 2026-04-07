/**
 * SpinningYinYang — A+++ overlay.
 * A large yin-yang symbol (~50% of frame), slowly rotating. Detailed with
 * ornamental border, Chinese-style cloud patterns inside the curves, suggested
 * dragon/koi swirls. Background: misty cosmic field. Spiritual.
 *
 * Audio reactivity:
 *   slowEnergy → cloud bloom + ambient
 *   energy     → rim glow
 *   bass       → halo pulse
 *   beatDecay  → rotation acceleration
 *   onsetEnvelope → ring flash
 *   chromaHue  → rim tint
 *   tempoFactor → spin rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const CLOUD_COUNT = 12;
const ORNAMENT_COUNT = 24;
const STAR_COUNT = 80;

interface Cloud {
  x: number;
  y: number;
  rx: number;
  ry: number;
  drift: number;
}
interface Star {
  x: number;
  y: number;
  r: number;
  twinkleSpeed: number;
  phase: number;
}

function buildClouds(): Cloud[] {
  const rng = seeded(72_991_117);
  return Array.from({ length: CLOUD_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.95,
    rx: 0.10 + rng() * 0.18,
    ry: 0.04 + rng() * 0.06,
    drift: 0.0001 + rng() * 0.0003,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(82_447_553);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.5 + rng() * 1.6,
    twinkleSpeed: 0.02 + rng() * 0.05,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SpinningYinYang: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const clouds = React.useMemo(buildClouds, []);
  const stars = React.useMemo(buildStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const cloudGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rimBright = interpolate(snap.energy, [0.02, 0.32], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const haloPulse = 1 + snap.bass * 0.30;
  const spinAccel = 1 + snap.beatDecay * 0.4;
  const ringFlash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Palette - red/gold base modulated by chromaHue
  const baseHue = 8;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const rimColor = `hsl(${tintHue}, 80%, 55%)`;
  const rimBrightColor = `hsl(${tintHue}, 90%, 75%)`;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 30%, 6%)`;
  const skyMid = `hsl(${(tintHue + 220) % 360}, 28%, 12%)`;
  const skyBot = `hsl(${(tintHue + 180) % 360}, 32%, 16%)`;

  // Hero geometry
  const cx = width / 2;
  const cy = height / 2;
  const yyR = Math.min(width, height) * 0.27;
  const spinAngle = (frame * 0.3 * tempoFactor * spinAccel) % 360;

  // Stars
  const starNodes = stars.map((s, i) => {
    const t = frame * s.twinkleSpeed + s.phase;
    const tw = 0.55 + Math.sin(t) * 0.4;
    return (
      <circle key={`star-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.85 + tw * 0.3)}
        fill={rimBrightColor} opacity={0.7 * tw} />
    );
  });

  // Misty clouds
  const cloudNodes = clouds.map((c, i) => {
    const drift = (c.x + frame * c.drift * tempoFactor) % 1;
    const cx2 = drift * width;
    const cy2 = c.y * height;
    return (
      <ellipse key={`cl-${i}`} cx={cx2} cy={cy2} rx={c.rx * width} ry={c.ry * height}
        fill={`hsla(${tintHue}, 30%, 50%, ${0.16 * cloudGlow})`} />
    );
  });

  // Ornament dots around border (auspicious markings)
  const ornamentNodes: React.ReactNode[] = [];
  for (let o = 0; o < ORNAMENT_COUNT; o++) {
    const a = (o / ORNAMENT_COUNT) * Math.PI * 2 + (spinAngle * Math.PI) / 180;
    const r = yyR * 1.2;
    const ox = cx + Math.cos(a) * r;
    const oy = cy + Math.sin(a) * r;
    const isMain = o % 4 === 0;
    ornamentNodes.push(
      <g key={`orn-${o}`}>
        <circle cx={ox} cy={oy} r={isMain ? 6 : 3.4}
          fill={rimBrightColor} opacity={0.85 * rimBright} />
        <circle cx={ox} cy={oy} r={isMain ? 3 : 1.6} fill="rgba(255, 245, 220, 0.95)" />
      </g>
    );
  }

  // Yin-yang teardrop path - using arcs
  // The classic shape: outer circle, S-curve dividing dark/light, two small dots
  // We'll build it programmatically
  const yyPath = `
    M 0 ${-yyR}
    A ${yyR} ${yyR} 0 0 1 0 ${yyR}
    A ${yyR / 2} ${yyR / 2} 0 0 1 0 0
    A ${yyR / 2} ${yyR / 2} 0 0 0 0 ${-yyR}
    Z
  `;

  // Cloud patterns inside the curves (Chinese cloud)
  function buildCloudPattern(side: -1 | 1, color: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    const baseY = side * yyR * 0.5;
    parts.push(
      <g key={`cp-${side}`}>
        {[-1, 0, 1].map((j) => (
          <path key={`cw-${j}`} d={`M ${-yyR * 0.18 + j * 14} ${baseY - 6}
            Q ${-yyR * 0.10 + j * 14} ${baseY - 14} ${-yyR * 0.04 + j * 14} ${baseY - 6}
            Q ${-yyR * 0.04 + j * 14 + 8} ${baseY - 12} ${j * 14 + 14} ${baseY - 6}`}
            stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" />
        ))}
      </g>
    );
    return parts;
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="yy-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <radialGradient id="yy-halo">
            <stop offset="0%" stopColor={rimBrightColor} stopOpacity={0.4} />
            <stop offset="60%" stopColor={rimColor} stopOpacity={0.18} />
            <stop offset="100%" stopColor={rimColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="yy-light-grad">
            <stop offset="0%" stopColor="#fefef8" />
            <stop offset="100%" stopColor="#d4cfb0" />
          </radialGradient>
          <radialGradient id="yy-dark-grad">
            <stop offset="0%" stopColor="#1a1408" />
            <stop offset="100%" stopColor="#040200" />
          </radialGradient>
          <filter id="yy-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={width} height={height} fill="url(#yy-sky)" />

        {/* Distant stars */}
        {starNodes}

        {/* Misty clouds */}
        <g filter="url(#yy-blur)">{cloudNodes}</g>

        {/* Halo behind */}
        <circle cx={cx} cy={cy} r={yyR * 1.8 * haloPulse}
          fill="url(#yy-halo)" style={{ mixBlendMode: "screen" }} />

        {/* Ornament dots */}
        {ornamentNodes}

        {/* Outer ornamental border ring */}
        <circle cx={cx} cy={cy} r={yyR + 18} fill="none"
          stroke={rimColor} strokeWidth={6} opacity={0.7} />
        <circle cx={cx} cy={cy} r={yyR + 18} fill="none"
          stroke={rimBrightColor} strokeWidth={2} opacity={0.9} strokeDasharray="6 4" />
        <circle cx={cx} cy={cy} r={yyR + 32} fill="none"
          stroke={rimColor} strokeWidth={1.4} opacity={0.5} strokeDasharray="2 6" />
        <circle cx={cx} cy={cy} r={yyR + 12} fill="none"
          stroke={rimBrightColor} strokeWidth={1} opacity={0.6} />

        {/* Spinning yin-yang */}
        <g transform={`translate(${cx}, ${cy}) rotate(${spinAngle})`}>
          {/* Light half (right) — full circle then we draw dark half over it */}
          <circle r={yyR} fill="url(#yy-light-grad)" stroke="#86713a" strokeWidth={2} />

          {/* Dark teardrop */}
          <path d={yyPath} fill="url(#yy-dark-grad)" stroke="#1a1408" strokeWidth={1.6} />

          {/* Light dot in dark half */}
          <circle cx={0} cy={-yyR / 2} r={yyR * 0.16} fill="url(#yy-light-grad)" stroke="#86713a" strokeWidth={1.4} />
          {/* Dark dot in light half */}
          <circle cx={0} cy={yyR / 2} r={yyR * 0.16} fill="url(#yy-dark-grad)" stroke="#1a1408" strokeWidth={1.4} />

          {/* Cloud patterns inside (subtle) */}
          {buildCloudPattern(-1, "rgba(180, 150, 80, 0.45)")}
          {buildCloudPattern(1, "rgba(200, 180, 140, 0.55)")}

          {/* Tiny "dragon" suggestion — curving line traced through dark side */}
          <path d={`M 0 ${-yyR * 0.85} Q ${yyR * 0.18} ${-yyR * 0.4} 0 ${-yyR * 0.16}`}
            stroke={rimBrightColor} strokeWidth={1.0} fill="none" opacity={0.45} />
          {/* Tiny "koi" suggestion — curving line through light side */}
          <path d={`M 0 ${yyR * 0.85} Q ${-yyR * 0.18} ${yyR * 0.4} 0 ${yyR * 0.16}`}
            stroke="rgba(60, 40, 16, 0.5)" strokeWidth={1.0} fill="none" />
        </g>

        {/* Central rim glow */}
        <circle cx={cx} cy={cy} r={yyR + 6}
          fill="none" stroke={rimBrightColor} strokeWidth={2}
          opacity={0.6 * rimBright} />

        {/* Ring flash */}
        {ringFlash > 0.1 && (
          <>
            <circle cx={cx} cy={cy} r={yyR * (1.4 + ringFlash * 0.6)}
              fill="none" stroke={rimBrightColor} strokeWidth={3} opacity={ringFlash * 0.9} />
            <circle cx={cx} cy={cy} r={yyR * (1.7 + ringFlash * 0.8)}
              fill="none" stroke={rimColor} strokeWidth={1.6} opacity={ringFlash * 0.6} />
          </>
        )}
      </svg>
    </div>
  );
};
