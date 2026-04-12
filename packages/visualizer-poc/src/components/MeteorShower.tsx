/**
 * MeteorShower — A+++ overlay.
 * Multiple meteors streaking across a starry night sky. 8-12 visible meteors,
 * varying sizes, with proper trails (fading tails), explosion bursts.
 * Star field background. Mountain silhouette at bottom horizon.
 *
 * Audio reactivity:
 *   slowEnergy → atmospheric glow
 *   energy     → meteor brightness
 *   bass       → mountain rumble
 *   beatDecay  → trail length
 *   onsetEnvelope → meteor burst spawn
 *   chromaHue  → trail tint
 *   tempoFactor → meteor speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const BG_STAR_COUNT = 200;
const METEOR_POOL = 16;

interface BgStar {
  x: number;
  y: number;
  r: number;
  twinkleSpeed: number;
  phase: number;
}
interface Meteor {
  spawnFrame: number;
  startX: number;
  startY: number;
  angle: number;
  speed: number;
  length: number;
  size: number;
  hueOffset: number;
}

function buildBgStars(): BgStar[] {
  const rng = seeded(72_811_443);
  return Array.from({ length: BG_STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.85,
    r: 0.4 + rng() * 1.6,
    twinkleSpeed: 0.02 + rng() * 0.05,
    phase: rng() * Math.PI * 2,
  }));
}

function buildMeteors(): Meteor[] {
  const rng = seeded(55_119_882);
  return Array.from({ length: METEOR_POOL }, (_, i) => ({
    spawnFrame: i * 50 + Math.floor(rng() * 30),
    startX: 0.5 + rng() * 0.55,
    startY: rng() * 0.35,
    angle: Math.PI * 0.25 + rng() * Math.PI * 0.12,
    speed: 0.012 + rng() * 0.018,
    length: 100 + rng() * 160,
    size: 2.4 + rng() * 2.8,
    hueOffset: rng() > 0.8 ? 30 : -30 + rng() * 20,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const MeteorShower: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const bgStars = React.useMemo(buildBgStars, []);
  const meteors = React.useMemo(buildMeteors, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  // Widened: faint ambient at quiet → vivid shower at loud
  const atmosGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.20, 1.50], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const meteorBright = interpolate(snap.energy, [0.02, 0.32], [0.10, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Widened trail: short at quiet → dramatic streaks at loud
  const trailMul = 1 + snap.beatDecay * 1.0;
  const burstSpawn = snap.onsetEnvelope > 0.6;
  const burst = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Palette
  const baseHue = 210;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 70%, 65%)`;
  const tintCore = `hsl(${tintHue}, 90%, 88%)`;
  const skyTop = `hsl(${(tintHue + 220) % 360}, 50%, 4%)`;
  const skyMid = `hsl(${(tintHue + 230) % 360}, 50%, 8%)`;
  const skyBot = `hsl(${(tintHue + 200) % 360}, 50%, 12%)`;

  // Background stars
  const bgStarNodes = bgStars.map((s, i) => {
    const t = frame * s.twinkleSpeed * tempoFactor + s.phase;
    const tw = 0.55 + Math.sin(t) * 0.4;
    const sx = s.x * width;
    const sy = s.y * height;
    const r = s.r * (0.85 + tw * 0.3);
    return (
      <g key={`bs-${i}`}>
        <circle cx={sx} cy={sy} r={r * 3} fill={tintColor} opacity={0.10 * tw * atmosGlow} />
        <circle cx={sx} cy={sy} r={r} fill={tintCore} opacity={0.90 * tw} />
      </g>
    );
  });

  // Meteors — spawn in cycles, render those currently active
  const meteorNodes: React.ReactNode[] = [];
  meteors.forEach((m, i) => {
    // Spawn cycle: every 90 frames per meteor
    const period = 110;
    const phase = (frame - m.spawnFrame + period * 100) % period;
    if (phase < 0 || phase > 60) return;
    const t = phase / 60; // 0..1 active
    const fade = Math.sin(t * Math.PI);
    const sx0 = m.startX * width;
    const sy0 = m.startY * height;
    const dx = -Math.cos(m.angle) * m.length * (0.6 + t * 1.0) * tempoFactor;
    const dy = Math.sin(m.angle) * m.length * (0.6 + t * 1.0) * tempoFactor;
    const headX = sx0 + dx;
    const headY = sy0 + dy;
    const tailX = sx0 + dx * 0.05;
    const tailY = sy0 + dy * 0.05;
    const trailLen = m.length * trailMul;
    const tailEndX = headX - Math.cos(-m.angle + Math.PI) * trailLen;
    const tailEndY = headY - Math.sin(-m.angle + Math.PI) * trailLen;
    const mHue = (tintHue + m.hueOffset + 360) % 360;
    const mColor = `hsl(${mHue}, 80%, 70%)`;
    const mBright = `hsl(${mHue}, 100%, 92%)`;
    meteorNodes.push(
      <g key={`m-${i}`}>
        {/* Outer glow trail */}
        <line x1={tailEndX} y1={tailEndY} x2={headX} y2={headY}
          stroke={mColor} strokeWidth={m.size * 5} fill="none" strokeLinecap="round"
          opacity={0.10 * fade * meteorBright} />
        {/* Main streak */}
        <line x1={tailX} y1={tailY} x2={headX} y2={headY}
          stroke={mColor} strokeWidth={m.size * 2.4} fill="none" strokeLinecap="round"
          opacity={0.50 * fade * meteorBright} />
        {/* Hot core */}
        <line x1={tailX + (headX - tailX) * 0.5} y1={tailY + (headY - tailY) * 0.5}
          x2={headX} y2={headY}
          stroke={mBright} strokeWidth={m.size * 1.0} fill="none" strokeLinecap="round"
          opacity={0.95 * fade * meteorBright} />
        {/* Head */}
        <circle cx={headX} cy={headY} r={m.size * 4} fill={mColor} opacity={0.18 * fade * meteorBright} />
        <circle cx={headX} cy={headY} r={m.size * 2} fill={mBright} opacity={0.45 * fade * meteorBright} />
        <circle cx={headX} cy={headY} r={m.size * 1} fill="rgba(255, 255, 255, 0.98)" opacity={0.95 * fade} />
        {/* Burst at end of trajectory */}
        {t > 0.85 && (
          <circle cx={headX} cy={headY} r={m.size * (4 + (t - 0.85) * 30)}
            fill="none" stroke={mBright} strokeWidth={1.4} opacity={(1 - (t - 0.85) / 0.15) * 0.8} />
        )}
      </g>
    );
  });

  // Burst meteor (extra on onset)
  let burstNode: React.ReactNode = null;
  if (burstSpawn) {
    const bAng = Math.PI * 0.30;
    const bX0 = width * 0.85;
    const bY0 = height * 0.10;
    const bX1 = bX0 - Math.cos(bAng) * 220;
    const bY1 = bY0 + Math.sin(bAng) * 220;
    burstNode = (
      <g>
        <line x1={bX0} y1={bY0} x2={bX1} y2={bY1}
          stroke="rgba(255, 250, 200, 0.95)" strokeWidth={4} strokeLinecap="round" opacity={burst} />
        <line x1={(bX0 + bX1) / 2} y1={(bY0 + bY1) / 2} x2={bX1} y2={bY1}
          stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={burst} />
        <circle cx={bX1} cy={bY1} r={6} fill="#fff" opacity={burst} />
        <circle cx={bX1} cy={bY1} r={14 + burst * 18} fill="none" stroke="#fff" strokeWidth={2} opacity={burst * 0.6} />
      </g>
    );
  }

  // Mountain silhouette at bottom
  const mountainPath = `M 0 ${height}
    L 0 ${height * 0.78}
    L ${width * 0.10} ${height * 0.72}
    L ${width * 0.18} ${height * 0.78}
    L ${width * 0.27} ${height * 0.66}
    L ${width * 0.36} ${height * 0.74}
    L ${width * 0.46} ${height * 0.60}
    L ${width * 0.55} ${height * 0.70}
    L ${width * 0.62} ${height * 0.64}
    L ${width * 0.72} ${height * 0.74}
    L ${width * 0.82} ${height * 0.68}
    L ${width * 0.92} ${height * 0.78}
    L ${width} ${height * 0.74}
    L ${width} ${height} Z`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="ms-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <linearGradient id="ms-mountain" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(20, 16, 30, 0.96)" />
            <stop offset="100%" stopColor="rgba(8, 6, 16, 1)" />
          </linearGradient>
          <radialGradient id="ms-haze">
            <stop offset="0%" stopColor={tintColor} stopOpacity={0.18 * atmosGlow} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
        </defs>

        <rect width={width} height={height} fill="url(#ms-sky)" />

        {/* Atmospheric haze */}
        <ellipse cx={width * 0.5} cy={height * 0.45} rx={width * 0.6} ry={height * 0.3}
          fill="url(#ms-haze)" />

        {bgStarNodes}

        {/* Meteors (in screen blend mode) */}
        <g style={{ mixBlendMode: "screen" }}>{meteorNodes}</g>
        <g style={{ mixBlendMode: "screen" }}>{burstNode}</g>

        {/* Distant mountain ridge */}
        <path d={mountainPath} fill="url(#ms-mountain)" stroke="rgba(40, 30, 60, 0.7)" strokeWidth={1} />
        {/* Snow caps */}
        <path d={`M ${width * 0.10} ${height * 0.72} L ${width * 0.12} ${height * 0.74} L ${width * 0.14} ${height * 0.73}`}
          stroke="rgba(220, 220, 240, 0.5)" strokeWidth={2} fill="none" />
        <path d={`M ${width * 0.46} ${height * 0.60} L ${width * 0.48} ${height * 0.63} L ${width * 0.50} ${height * 0.61}`}
          stroke="rgba(220, 220, 240, 0.5)" strokeWidth={2} fill="none" />

        {/* Foreground silhouette of trees */}
        {[0.05, 0.12, 0.22, 0.30, 0.42, 0.55, 0.66, 0.75, 0.85, 0.95].map((x, i) => {
          const tx = x * width;
          const tBaseY = height * 0.85;
          const tH = 32 + Math.sin(i * 1.7) * 12;
          return (
            <path key={`tree-${i}`}
              d={`M ${tx} ${tBaseY} L ${tx - 6} ${tBaseY - tH * 0.5} L ${tx} ${tBaseY - tH} L ${tx + 6} ${tBaseY - tH * 0.5} Z`}
              fill="rgba(8, 6, 14, 1)" />
          );
        })}

        {/* Ground rumble (bass-driven horizon line) */}
        <line x1={0} y1={height - 4 + Math.sin(frame * 0.2) * snap.bass * 4}
          x2={width} y2={height - 4 + Math.cos(frame * 0.2) * snap.bass * 4}
          stroke={tintColor} strokeWidth={1.4} opacity={0.4 * atmosGlow} />
      </svg>
    </div>
  );
};
