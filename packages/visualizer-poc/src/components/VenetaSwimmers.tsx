/**
 * VenetaSwimmers — A+++ "Sunshine Daydream" river-swimming scene.
 *
 * Veneta '72 was 100°F. Behind the stage at the Springfield Creamery benefit,
 * a river ran past the Old Renaissance Faire grounds. The crowd stripped and
 * swam to escape the heat. This is a pastoral hippie utopia: a sunlit river
 * with 7 swimmers (some floating, some splashing), grassy banks lined with
 * willows and reeds, sun dapples on water, lily pads, distant rolling hills,
 * dragonflies, sun rays through the trees.
 *
 * Audio reactivity:
 *   slowEnergy   → sun warmth
 *   energy       → splash intensity
 *   bass         → ripple amplitude
 *   beatDecay    → sun ray pulse
 *   onsetEnvelope→ splash flash
 *   chromaHue    → palette tint
 *   tempoFactor  → swimmer drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

interface SwimmerSpec {
  bx: number;
  by: number;
  size: number;
  pose: "float" | "splash" | "swim" | "wave";
  hairHue: number;
  phase: number;
}

interface RippleSpec {
  bx: number;
  by: number;
  size: number;
  speed: number;
  phase: number;
}

interface LilyPad {
  bx: number;
  by: number;
  size: number;
  hasFlower: boolean;
}

interface Dragonfly {
  cx: number;
  cy: number;
  r: number;
  speed: number;
  phase: number;
}

interface Reed {
  x: number;
  height: number;
  sway: number;
  phase: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const VenetaSwimmers: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const swimmers = React.useMemo<SwimmerSpec[]>(() => {
    const rng = seeded(82_447_113);
    const poses: ("float" | "splash" | "swim" | "wave")[] = ["float", "splash", "swim", "wave"];
    return [
      { bx: 0.18, by: 0.74, size: 18, pose: "float",  hairHue: 28,  phase: rng() * 6 },
      { bx: 0.30, by: 0.78, size: 16, pose: "swim",   hairHue: 14,  phase: rng() * 6 },
      { bx: 0.44, by: 0.72, size: 18, pose: "splash", hairHue: 38,  phase: rng() * 6 },
      { bx: 0.56, by: 0.78, size: 18, pose: "wave",   hairHue: 22,  phase: rng() * 6 },
      { bx: 0.66, by: 0.74, size: 16, pose: "float",  hairHue: 12,  phase: rng() * 6 },
      { bx: 0.78, by: 0.78, size: 18, pose: "swim",   hairHue: 30,  phase: rng() * 6 },
      { bx: 0.88, by: 0.72, size: 14, pose: "wave",   hairHue: 18,  phase: rng() * 6 },
    ];
  }, []);

  const ripples = React.useMemo<RippleSpec[]>(() => {
    const rng = seeded(11_447_223);
    return Array.from({ length: 22 }, () => ({
      bx: rng(),
      by: 0.65 + rng() * 0.30,
      size: 10 + rng() * 22,
      speed: 0.012 + rng() * 0.018,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const lilyPads = React.useMemo<LilyPad[]>(() => {
    const rng = seeded(33_887_443);
    return Array.from({ length: 14 }, () => ({
      bx: rng(),
      by: 0.66 + rng() * 0.28,
      size: 12 + rng() * 14,
      hasFlower: rng() > 0.55,
    }));
  }, []);

  const dragons = React.useMemo<Dragonfly[]>(() => {
    const rng = seeded(67_887_001);
    return Array.from({ length: 5 }, () => ({
      cx: rng(),
      cy: 0.40 + rng() * 0.30,
      r: 0.04 + rng() * 0.04,
      speed: 0.0015 + rng() * 0.003,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const reeds = React.useMemo<Reed[]>(() => {
    const rng = seeded(99_447_223);
    return Array.from({ length: 32 }, () => ({
      x: rng(),
      height: 28 + rng() * 60,
      sway: 0.003 + rng() * 0.012,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const energy = snap.energy;
  const bass = snap.bass;
  const slowEnergy = snap.slowEnergy;
  const beatDecay = snap.beatDecay;
  const onsetEnv = snap.onsetEnvelope;
  const chromaHue = snap.chromaHue;

  const sunBright = 0.6 + slowEnergy * 0.4;
  const splashIntensity = 0.5 + energy * 0.4 + onsetEnv * 0.5;
  const rippleAmp = 1 + bass * 1.5;
  const rayPulse = 1 + beatDecay * 0.3;

  const baseHue = 90;
  const tintHue = ((baseHue + (chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const skyTop = `hsl(${(tintHue + 130) % 360}, 65%, 60%)`;
  const skyMid = `hsl(${(tintHue + 130) % 360}, 75%, 78%)`;
  const skyHorizon = `hsl(${(tintHue + 60) % 360}, 80%, 88%)`;
  const waterTop = `hsl(${(tintHue + 110) % 360}, 65%, 50%)`;
  const waterBot = `hsl(${(tintHue + 130) % 360}, 70%, 28%)`;

  const horizonY = height * 0.50;
  const sunX = width * 0.72;
  const sunY = horizonY - 20;

  /* === Swimmer renderer === */
  function renderSwimmer(s: SwimmerSpec, idx: number): React.ReactNode {
    const sx = s.bx * width;
    const sy = s.by * height + Math.sin(frame * 0.04 + s.phase) * 2;

    const skinHue = 28;
    const skinColor = `hsl(${skinHue}, 60%, 70%)`;
    const hairColor = `hsl(${s.hairHue}, 70%, 30%)`;

    if (s.pose === "float") {
      // Floating on back, arms out
      return (
        <g key={`sw-${idx}`}>
          {/* Body shadow on water */}
          <ellipse cx={sx} cy={sy + 4} rx={s.size * 1.2} ry={3} fill="rgba(0, 0, 0, 0.3)" />
          {/* Body (visible in water) */}
          <ellipse cx={sx} cy={sy} rx={s.size * 0.8} ry={s.size * 0.3} fill={skinColor} stroke="rgba(40, 20, 8, 0.85)" strokeWidth={0.8} />
          {/* Head */}
          <circle cx={sx + s.size * 0.6} cy={sy} r={s.size * 0.32} fill={skinColor} stroke="rgba(40, 20, 8, 0.85)" strokeWidth={0.8} />
          {/* Hair on top */}
          <path d={`M ${sx + s.size * 0.6 - s.size * 0.32} ${sy} Q ${sx + s.size * 0.6 - s.size * 0.32} ${sy - s.size * 0.4} ${sx + s.size * 0.6 + s.size * 0.32} ${sy - s.size * 0.32}`} fill={hairColor} />
          {/* Arms out */}
          <line x1={sx} y1={sy} x2={sx - s.size * 0.7} y2={sy + s.size * 0.3} stroke={skinColor} strokeWidth={3} strokeLinecap="round" />
          <line x1={sx} y1={sy} x2={sx + s.size * 0.2} y2={sy - s.size * 0.5} stroke={skinColor} strokeWidth={3} strokeLinecap="round" />
          {/* Smile */}
          <path d={`M ${sx + s.size * 0.55} ${sy + 1} Q ${sx + s.size * 0.6} ${sy + 3} ${sx + s.size * 0.65} ${sy + 1}`} stroke="rgba(40, 20, 8, 0.85)" strokeWidth={0.6} fill="none" />
          {/* Closed eye */}
          <circle cx={sx + s.size * 0.66} cy={sy - 1} r={0.6} fill="rgba(40, 20, 8, 0.85)" />
        </g>
      );
    } else if (s.pose === "splash") {
      const splashR = s.size * 1.2 * splashIntensity;
      return (
        <g key={`sw-${idx}`}>
          {/* Splash droplets */}
          {Array.from({ length: 14 }, (_, k) => {
            const a = (k / 14) * Math.PI * 2;
            const r = splashR;
            return (
              <circle
                key={k}
                cx={sx + Math.cos(a) * r}
                cy={sy + Math.sin(a) * r * 0.6 - 8}
                r={1.4 + (k % 3)}
                fill="rgba(255, 255, 250, 0.85)"
              />
            );
          })}
          {/* Splash spray base */}
          <ellipse cx={sx} cy={sy - 4} rx={s.size * 0.9} ry={4} fill="rgba(255, 255, 250, 0.6)" />
          {/* Head */}
          <circle cx={sx} cy={sy} r={s.size * 0.32} fill={skinColor} stroke="rgba(40, 20, 8, 0.85)" strokeWidth={0.8} />
          <path d={`M ${sx - s.size * 0.32} ${sy} Q ${sx} ${sy - s.size * 0.4} ${sx + s.size * 0.32} ${sy}`} fill={hairColor} />
          {/* Arms up */}
          <line x1={sx} y1={sy + 4} x2={sx - s.size * 0.6} y2={sy - s.size * 0.7} stroke={skinColor} strokeWidth={3} strokeLinecap="round" />
          <line x1={sx} y1={sy + 4} x2={sx + s.size * 0.6} y2={sy - s.size * 0.7} stroke={skinColor} strokeWidth={3} strokeLinecap="round" />
          {/* Joyous smile */}
          <path d={`M ${sx - 3} ${sy + 2} Q ${sx} ${sy + 4} ${sx + 3} ${sy + 2}`} stroke="rgba(40, 20, 8, 0.85)" strokeWidth={0.6} fill="none" />
        </g>
      );
    } else if (s.pose === "swim") {
      // Front crawl
      return (
        <g key={`sw-${idx}`}>
          <ellipse cx={sx} cy={sy + 4} rx={s.size * 1.5} ry={3} fill="rgba(0, 0, 0, 0.3)" />
          <ellipse cx={sx} cy={sy} rx={s.size * 1.0} ry={s.size * 0.30} fill={skinColor} stroke="rgba(40, 20, 8, 0.85)" strokeWidth={0.8} />
          <circle cx={sx + s.size * 0.85} cy={sy - 2} r={s.size * 0.30} fill={skinColor} stroke="rgba(40, 20, 8, 0.85)" strokeWidth={0.8} />
          <path d={`M ${sx + s.size * 0.55} ${sy - 2} Q ${sx + s.size * 0.75} ${sy - s.size * 0.5} ${sx + s.size * 1.15} ${sy - s.size * 0.32}`} fill={hairColor} />
          {/* Arm reaching forward */}
          <path d={`M ${sx} ${sy} Q ${sx + s.size * 0.5} ${sy - s.size * 0.6} ${sx + s.size * 1.2} ${sy - s.size * 0.5}`} stroke={skinColor} strokeWidth={3} fill="none" strokeLinecap="round" />
          {/* Arm in water */}
          <line x1={sx} y1={sy + 2} x2={sx - s.size * 0.6} y2={sy + 4} stroke={skinColor} strokeWidth={3} strokeLinecap="round" />
          {/* Splash from kicking */}
          {Array.from({ length: 6 }, (_, k) => (
            <circle
              key={k}
              cx={sx - s.size * 0.7 + k * 2}
              cy={sy - 4 - Math.sin(frame * 0.3 + k) * 2}
              r={0.8}
              fill="rgba(255, 255, 250, 0.85)"
            />
          ))}
        </g>
      );
    } else {
      // wave
      return (
        <g key={`sw-${idx}`}>
          <ellipse cx={sx} cy={sy + 3} rx={s.size * 0.8} ry={3} fill="rgba(0, 0, 0, 0.3)" />
          <ellipse cx={sx} cy={sy} rx={s.size * 0.6} ry={s.size * 0.3} fill={skinColor} stroke="rgba(40, 20, 8, 0.85)" strokeWidth={0.8} />
          <circle cx={sx} cy={sy - s.size * 0.2} r={s.size * 0.32} fill={skinColor} stroke="rgba(40, 20, 8, 0.85)" strokeWidth={0.8} />
          <path d={`M ${sx - s.size * 0.32} ${sy - s.size * 0.2} Q ${sx} ${sy - s.size * 0.6} ${sx + s.size * 0.32} ${sy - s.size * 0.2}`} fill={hairColor} />
          {/* Waving arm */}
          <line x1={sx} y1={sy} x2={sx + s.size * 0.5 + Math.sin(frame * 0.15) * 4} y2={sy - s.size * 0.8} stroke={skinColor} strokeWidth={3} strokeLinecap="round" />
          {/* Other arm */}
          <line x1={sx} y1={sy} x2={sx - s.size * 0.4} y2={sy} stroke={skinColor} strokeWidth={3} strokeLinecap="round" />
          {/* Smile */}
          <path d={`M ${sx - 2} ${sy - s.size * 0.18} Q ${sx} ${sy - s.size * 0.14} ${sx + 2} ${sy - s.size * 0.18}`} stroke="rgba(40, 20, 8, 0.85)" strokeWidth={0.6} fill="none" />
        </g>
      );
    }
  }

  const dragonNodes = dragons.map((d, i) => {
    const t = frame * d.speed * tempoFactor + d.phase;
    const dx = d.cx * width + Math.cos(t) * d.r * width;
    const dy = d.cy * height + Math.sin(t * 1.5) * d.r * height * 0.5;
    const wing = Math.sin(frame * 0.4 + i) * 4;
    return (
      <g key={`dr-${i}`} opacity={0.85}>
        <ellipse cx={dx - 3} cy={dy} rx={3 + wing} ry={1.5} fill={`hsla(${(tintHue + 200) % 360}, 80%, 70%, 0.55)`} />
        <ellipse cx={dx + 3} cy={dy} rx={3 + wing} ry={1.5} fill={`hsla(${(tintHue + 200) % 360}, 80%, 70%, 0.55)`} />
        <line x1={dx - 4} y1={dy} x2={dx + 4} y2={dy} stroke="rgba(80, 30, 100, 0.95)" strokeWidth={1.4} />
        <circle cx={dx + 4} cy={dy} r={1} fill="rgba(20, 20, 20, 0.95)" />
      </g>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="vs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="vs-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={waterTop} />
            <stop offset="100%" stopColor={waterBot} />
          </linearGradient>
          <radialGradient id="vs-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFAE0" stopOpacity={0.95 * sunBright} />
            <stop offset="40%" stopColor={`hsl(${(tintHue + 60) % 360}, 95%, 80%)`} stopOpacity={0.7 * sunBright} />
            <stop offset="100%" stopColor={`hsl(${tintHue}, 80%, 60%)`} stopOpacity={0} />
          </radialGradient>
          <filter id="vs-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* SKY */}
        <rect width={width} height={height} fill="url(#vs-sky)" />

        {/* SUN */}
        <circle cx={sunX} cy={sunY} r={Math.min(width, height) * 0.10 * 4} fill="url(#vs-sun)" />
        <circle cx={sunX} cy={sunY} r={Math.min(width, height) * 0.06} fill="rgba(255, 240, 200, 0.85)" opacity={sunBright} />
        <circle cx={sunX} cy={sunY} r={Math.min(width, height) * 0.03} fill="#FFFFFF" opacity={0.92 * sunBright} />

        {/* SUN RAYS through trees */}
        <g opacity={0.4 * rayPulse} style={{ mixBlendMode: "screen" }}>
          {Array.from({ length: 10 }, (_, i) => {
            const a = -Math.PI / 2 + (i - 5) * 0.12;
            const len = height * 0.95;
            return (
              <path
                key={`sr-${i}`}
                d={`M ${sunX} ${sunY}
                    L ${sunX + Math.cos(a) * len - 12} ${sunY + Math.sin(a) * len}
                    L ${sunX + Math.cos(a) * len + 12} ${sunY + Math.sin(a) * len} Z`}
                fill={`hsla(${(tintHue + 60) % 360}, 95%, 85%, 0.20)`}
              />
            );
          })}
        </g>

        {/* DISTANT HILLS */}
        <path
          d={`M 0 ${horizonY + 4}
              L ${width * 0.10} ${horizonY - 18}
              L ${width * 0.22} ${horizonY - 8}
              L ${width * 0.36} ${horizonY - 22}
              L ${width * 0.50} ${horizonY - 12}
              L ${width * 0.64} ${horizonY - 24}
              L ${width * 0.78} ${horizonY - 8}
              L ${width * 0.90} ${horizonY - 18}
              L ${width} ${horizonY + 4}
              L ${width} ${horizonY + 8}
              L 0 ${horizonY + 8} Z`}
          fill={`hsl(${(tintHue + 30) % 360}, 50%, 38%)`}
          opacity={0.85}
        />
        {/* Mid hills */}
        <path
          d={`M 0 ${horizonY + 8}
              L ${width * 0.20} ${horizonY - 4}
              L ${width * 0.40} ${horizonY - 10}
              L ${width * 0.60} ${horizonY - 6}
              L ${width * 0.80} ${horizonY - 12}
              L ${width} ${horizonY + 4}
              L ${width} ${horizonY + 14}
              L 0 ${horizonY + 14} Z`}
          fill={`hsl(${(tintHue + 30) % 360}, 55%, 30%)`}
          opacity={0.95}
        />

        {/* WILLOW TREES on far bank */}
        {Array.from({ length: 8 }, (_, i) => {
          const tx = (i / 7) * width + Math.sin(i) * 12;
          const ty = horizonY + 8;
          return (
            <g key={`wt-${i}`}>
              <line x1={tx} y1={ty} x2={tx + 2} y2={ty + 32} stroke="rgba(60, 36, 14, 0.95)" strokeWidth={2} />
              {/* Drooping willow branches */}
              {Array.from({ length: 8 }, (_, k) => {
                const a = -Math.PI + (k / 7) * Math.PI;
                const r = 22;
                return (
                  <path
                    key={k}
                    d={`M ${tx + 2} ${ty} Q ${tx + Math.cos(a) * r} ${ty + 8} ${tx + Math.cos(a) * r * 1.2} ${ty + 18 + Math.sin(frame * 0.02 + k) * 2}`}
                    stroke="rgba(40, 80, 30, 0.85)"
                    strokeWidth={1.4}
                    fill="none"
                  />
                );
              })}
              {/* Foliage clumps */}
              {Array.from({ length: 6 }, (_, k) => {
                const a = (k / 6) * Math.PI * 2;
                return (
                  <ellipse
                    key={k}
                    cx={tx + Math.cos(a) * 14}
                    cy={ty + 4 + Math.sin(a) * 6}
                    rx={6}
                    ry={5}
                    fill={`hsla(${(tintHue + 30) % 360}, 60%, ${35 + (k % 2) * 8}%, 0.85)`}
                  />
                );
              })}
            </g>
          );
        })}

        {/* FAR BANK GRASS */}
        <rect x={0} y={horizonY + 14} width={width} height={6} fill={`hsl(${(tintHue + 30) % 360}, 65%, 35%)`} />

        {/* WATER */}
        <rect x={0} y={horizonY + 20} width={width} height={height - horizonY - 20} fill="url(#vs-water)" />

        {/* SUN GLINT on water */}
        <ellipse
          cx={sunX}
          cy={horizonY + 26}
          rx={width * 0.08}
          ry={3}
          fill="rgba(255, 250, 200, 0.85)"
        />
        {Array.from({ length: 14 }, (_, i) => {
          const t = i / 13;
          const sy = horizonY + 30 + t * (height - horizonY - 40);
          const swidth = width * 0.04 * (1 - t);
          return (
            <ellipse
              key={`gli-${i}`}
              cx={sunX + Math.sin(t * 6 + frame * 0.04) * 6}
              cy={sy}
              rx={swidth}
              ry={1.5}
              fill="rgba(255, 250, 200, 0.55)"
            />
          );
        })}

        {/* WATER RIPPLES (concentric) */}
        {ripples.map((r, i) => {
          const t = frame * r.speed + r.phase;
          const phase = (t % 1);
          const size = r.size * (0.6 + phase * 1.4) * rippleAmp;
          const op = (1 - phase) * 0.5;
          return (
            <ellipse
              key={`rp-${i}`}
              cx={r.bx * width}
              cy={r.by * height}
              rx={size}
              ry={size * 0.32}
              fill="none"
              stroke={`rgba(255, 255, 250, ${op})`}
              strokeWidth={1.2}
            />
          );
        })}

        {/* LILY PADS */}
        {lilyPads.map((lp, i) => {
          const lx = lp.bx * width;
          const ly = lp.by * height + Math.sin(frame * 0.02 + i) * 1.5;
          return (
            <g key={`lp-${i}`}>
              <ellipse cx={lx + 2} cy={ly + 1} rx={lp.size} ry={lp.size * 0.4} fill="rgba(0, 0, 0, 0.25)" />
              <ellipse cx={lx} cy={ly} rx={lp.size} ry={lp.size * 0.4} fill={`hsl(${(tintHue + 30) % 360}, 65%, 38%)`} stroke={`hsl(${(tintHue + 30) % 360}, 60%, 25%)`} strokeWidth={0.8} />
              {/* Slit cut */}
              <line x1={lx} y1={ly} x2={lx + lp.size} y2={ly} stroke={`hsl(${(tintHue + 30) % 360}, 60%, 25%)`} strokeWidth={0.8} />
              {/* Flower */}
              {lp.hasFlower && (
                <g>
                  {Array.from({ length: 6 }, (_, k) => {
                    const a = (k / 6) * Math.PI * 2;
                    return (
                      <ellipse
                        key={k}
                        cx={lx + Math.cos(a) * 2}
                        cy={ly - 2 + Math.sin(a) * 1}
                        rx={2.5}
                        ry={4}
                        fill="rgba(255, 240, 245, 0.95)"
                        stroke="rgba(180, 60, 80, 0.85)"
                        strokeWidth={0.5}
                      />
                    );
                  })}
                  <circle cx={lx} cy={ly - 2} r={1.5} fill={`hsl(50, 95%, 60%)`} />
                </g>
              )}
            </g>
          );
        })}

        {/* === SWIMMERS === */}
        {swimmers.map((s, i) => renderSwimmer(s, i))}

        {/* DRAGONFLIES */}
        {dragonNodes}

        {/* FOREGROUND BANK (left + right) with reeds */}
        <path
          d={`M 0 ${height * 0.78}
              Q ${width * 0.04} ${height * 0.74} ${width * 0.06} ${height * 0.78}
              Q ${width * 0.04} ${height * 0.85} 0 ${height * 0.88} Z`}
          fill={`hsl(${(tintHue + 30) % 360}, 60%, 28%)`}
        />
        <path
          d={`M ${width} ${height * 0.78}
              Q ${width * 0.96} ${height * 0.74} ${width * 0.94} ${height * 0.78}
              Q ${width * 0.96} ${height * 0.85} ${width} ${height * 0.88} Z`}
          fill={`hsl(${(tintHue + 30) % 360}, 60%, 28%)`}
        />

        {/* REEDS along banks */}
        {reeds.map((r, i) => {
          const x = r.x < 0.5 ? r.x * width * 0.16 : width - (1 - r.x) * width * 0.16;
          const baseY = height * 0.86;
          const sway = Math.sin(frame * r.sway + r.phase) * 4;
          return (
            <path
              key={`reed-${i}`}
              d={`M ${x} ${baseY} Q ${x + sway} ${baseY - r.height * 0.6} ${x + sway * 1.6} ${baseY - r.height}`}
              stroke={`hsl(${(tintHue + 35) % 360}, 70%, 35%)`}
              strokeWidth={1.4}
              fill="none"
            />
          );
        })}

        {/* SUN DAPPLES on water (front layer) */}
        {Array.from({ length: 38 }, (_, i) => {
          const dx = (i * 73) % width;
          const dy = horizonY + 30 + ((i * 47) % (height * 0.30));
          const r = 1 + Math.sin(frame * 0.05 + i) * 0.6;
          return (
            <circle
              key={`dap-${i}`}
              cx={dx}
              cy={dy}
              r={r}
              fill="rgba(255, 250, 200, 0.55)"
              opacity={0.5 + Math.sin(frame * 0.1 + i) * 0.3}
            />
          );
        })}

        {/* WARM TINT WASH */}
        <rect width={width} height={height} fill={`hsla(${tintHue + 60}, 80%, 60%, ${0.04 + slowEnergy * 0.05})`} />
      </svg>
    </div>
  );
};
