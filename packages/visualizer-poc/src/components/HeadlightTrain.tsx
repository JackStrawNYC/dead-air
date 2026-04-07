/**
 * HeadlightTrain — A+++ scene for "I Know You Rider".
 * "I wish I was a headlight on a northbound train."
 *
 * A massive locomotive thunders out of the darkness, its single piercing
 * headlight burning toward the camera like a sun. The train silhouette fills
 * the lower half of the frame, steam billowing skyward, twin rails converging
 * to a point on a moonlit horizon. Atmospheric haze, sparks from the wheels,
 * the warm ember-glow of the firebox. Telephone poles whip past on either side.
 *
 * Audio reactivity:
 *   slowEnergy   → headlight master glow + sky warmth
 *   energy       → steam volume + spark count + wheel speed
 *   bass         → ground rumble + smoke churn
 *   beatDecay    → headlight pulse
 *   onsetEnvelope→ whistle steam burst + headlight flash
 *   chromaHue    → headlight color tint shift
 *   tempoFactor  → wheel rotation + smoke drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

interface SteamPuff {
  baseX: number;
  baseY: number;
  radius: number;
  drift: number;
  rise: number;
  phase: number;
  shade: number;
}

interface Spark {
  side: -1 | 1;
  baseY: number;
  speed: number;
  size: number;
  phase: number;
  drift: number;
}

interface Pole {
  side: -1 | 1;
  baseT: number;
  height: number;
  phase: number;
}

interface DustMote {
  bx: number;
  by: number;
  r: number;
  speed: number;
  phase: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const HeadlightTrain: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const steamPuffs = React.useMemo<SteamPuff[]>(() => {
    const rng = seeded(82_113_557);
    return Array.from({ length: 38 }, () => ({
      baseX: -0.18 + rng() * 0.36,
      baseY: 0.38 + rng() * 0.18,
      radius: 18 + rng() * 42,
      drift: 0.0006 + rng() * 0.0015,
      rise: 0.0008 + rng() * 0.0018,
      phase: rng() * Math.PI * 2,
      shade: 0.25 + rng() * 0.55,
    }));
  }, []);

  const sparks = React.useMemo<Spark[]>(() => {
    const rng = seeded(44_811_237);
    return Array.from({ length: 26 }, () => ({
      side: rng() < 0.5 ? -1 : 1,
      baseY: 0.78 + rng() * 0.14,
      speed: 0.4 + rng() * 1.4,
      size: 0.8 + rng() * 2.6,
      phase: rng() * Math.PI * 2,
      drift: rng() * 8 - 4,
    }));
  }, []);

  const poles = React.useMemo<Pole[]>(() => {
    const rng = seeded(31_775_011);
    return Array.from({ length: 14 }, (_, i) => ({
      side: i % 2 === 0 ? -1 : 1,
      baseT: (i / 14) + rng() * 0.04,
      height: 0.18 + rng() * 0.09,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const dust = React.useMemo<DustMote[]>(() => {
    const rng = seeded(99_133_447);
    return Array.from({ length: 50 }, () => ({
      bx: rng(),
      by: 0.4 + rng() * 0.55,
      r: 0.4 + rng() * 1.4,
      speed: 0.001 + rng() * 0.004,
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

  const headlightGlow = 0.55 + slowEnergy * 0.6 + beatDecay * 0.18 + onsetEnv * 0.22;
  const steamVolume = 0.4 + energy * 0.7 + onsetEnv * 0.4;
  const groundRumble = bass * 5;
  const wheelSpeed = (3 + bass * 14) * tempoFactor;

  const baseHue = 42;
  const tintHue = ((baseHue + (chromaHue - 180) * 0.32) % 360 + 360) % 360;
  const tintCore = `hsl(${tintHue}, 96%, 92%)`;
  const tintMid = `hsl(${tintHue}, 82%, 72%)`;
  const tintEdge = `hsl(${tintHue}, 65%, 50%)`;
  const skyTop = `hsl(${(tintHue + 200) % 360}, 38%, 4%)`;
  const skyMid = `hsl(${(tintHue + 215) % 360}, 30%, 9%)`;
  const skyHorizon = `hsl(${(tintHue + 18) % 360}, 36%, 17%)`;

  const cx = width * 0.5;
  const horizonY = height * 0.58;
  const trainBaseY = height * 0.96;
  const trainTopY = height * 0.40;

  const trainW = width * 0.58;
  const trainLeft = cx - trainW * 0.5;
  const trainRight = cx + trainW * 0.5;

  const hlX = cx;
  const hlY = height * 0.50;
  const hlBaseR = Math.min(width, height) * 0.085;
  const hlR = hlBaseR * (1 + beatDecay * 0.18 + onsetEnv * 0.12);

  const shakeY = Math.sin(frame * 0.42) * groundRumble * 0.4;
  const shakeX = Math.sin(frame * 0.31) * groundRumble * 0.25;

  const railVanishX = cx;
  const railVanishY = horizonY + 6;
  const railNearLeftX = cx - width * 0.16;
  const railNearRightX = cx + width * 0.16;
  const railNearY = trainBaseY;

  const ties: React.ReactNode[] = [];
  for (let i = 0; i < 16; i++) {
    const t = Math.pow(i / 15, 1.6);
    const ty = railVanishY + (railNearY - railVanishY) * t;
    const halfW = (railNearLeftX - cx) * t * 1.08;
    const tieAlpha = 0.25 + t * 0.55;
    const tieH = 2 + t * 8;
    ties.push(
      <rect
        key={`tie-${i}`}
        x={cx + halfW * 1.05}
        y={ty}
        width={-halfW * 2.1}
        height={tieH}
        fill={`rgba(28, 18, 10, ${tieAlpha})`}
      />,
    );
  }

  const railLeftPath = `M ${railVanishX - 1} ${railVanishY} L ${railNearLeftX} ${railNearY}`;
  const railRightPath = `M ${railVanishX + 1} ${railVanishY} L ${railNearRightX} ${railNearY}`;

  const steamNodes = steamPuffs.map((p, i) => {
    const t = frame * (1 + tempoFactor * 0.5);
    const px = (cx + p.baseX * width) + Math.sin(t * p.drift + p.phase) * 22 + shakeX;
    const py = (height * p.baseY) - (t * p.rise * 60) % (height * 0.6);
    const r = p.radius * (0.7 + steamVolume * 0.5 + Math.sin(t * 0.02 + i) * 0.08);
    const op = (0.18 + p.shade * 0.32) * masterOpacity;
    return (
      <ellipse
        key={`steam-${i}`}
        cx={px}
        cy={py}
        rx={r}
        ry={r * 0.78}
        fill={`rgba(${190 + p.shade * 50}, ${188 + p.shade * 45}, ${184 + p.shade * 40}, ${op})`}
      />
    );
  });

  const sparkNodes = sparks.map((s, i) => {
    const t = frame * s.speed + s.phase;
    const lifeFrac = (t * 0.06) % 1;
    const sx = cx + s.side * (width * 0.10 + s.drift) + Math.sin(t * 0.3) * 6;
    const sy = (height * s.baseY) - lifeFrac * 60;
    const op = (1 - lifeFrac) * 0.85 * energy;
    if (op < 0.02) return null;
    return (
      <circle
        key={`spark-${i}`}
        cx={sx}
        cy={sy}
        r={s.size * (1.2 - lifeFrac)}
        fill={`hsl(${28 + i * 4}, 95%, 70%)`}
        opacity={op}
      />
    );
  });

  const poleNodes = poles.map((p, i) => {
    const tBase = (p.baseT + (frame * 0.0035 * tempoFactor)) % 1;
    const t = Math.pow(tBase, 1.5);
    const px = cx + p.side * (width * 0.12 + t * width * 0.42);
    const topY = horizonY - (height * p.height) * (0.4 + t * 0.6);
    const botY = horizonY + (trainBaseY - horizonY) * t * 0.95;
    const op = (0.25 + t * 0.55) * masterOpacity;
    const sw = 0.6 + t * 2.2;
    return (
      <g key={`pole-${i}`} opacity={op}>
        <line x1={px} y1={topY} x2={px} y2={botY} stroke="rgba(20, 14, 8, 0.9)" strokeWidth={sw} />
        <line
          x1={px - 8 - t * 14}
          y1={topY + 4 + t * 6}
          x2={px + 8 + t * 14}
          y2={topY + 4 + t * 6}
          stroke="rgba(20, 14, 8, 0.9)"
          strokeWidth={sw * 0.7}
        />
        <path
          d={`M ${px - 6 - t * 12} ${topY + 6 + t * 6} Q ${px} ${topY + 14 + t * 8} ${px + 6 + t * 12} ${topY + 6 + t * 6}`}
          stroke="rgba(10, 8, 4, 0.6)"
          strokeWidth={sw * 0.4}
          fill="none"
        />
      </g>
    );
  });

  const dustNodes = dust.map((d, i) => {
    const t = frame * d.speed + d.phase;
    const px = ((d.bx + Math.sin(t) * 0.02) * width) % width;
    const py = (d.by * height) + Math.cos(t * 1.3) * 4;
    const op = 0.18 + Math.sin(t * 2 + i) * 0.08;
    return (
      <circle
        key={`dust-${i}`}
        cx={px}
        cy={py}
        r={d.r}
        fill={`hsla(${tintHue}, 30%, 75%, ${op})`}
      />
    );
  });

  const wheelRot = (frame * wheelSpeed) % 360;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="ht-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <radialGradient id="ht-headlight" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.98 * headlightGlow} />
            <stop offset="14%" stopColor={tintCore} stopOpacity={0.85 * headlightGlow} />
            <stop offset="42%" stopColor={tintMid} stopOpacity={0.42 * headlightGlow} />
            <stop offset="78%" stopColor={tintEdge} stopOpacity={0.10 * headlightGlow} />
            <stop offset="100%" stopColor={tintEdge} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="ht-headcore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
            <stop offset="60%" stopColor={tintCore} stopOpacity={0.7} />
            <stop offset="100%" stopColor={tintCore} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="ht-train" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0608" />
            <stop offset="60%" stopColor="#1a1216" />
            <stop offset="100%" stopColor="#06030a" />
          </linearGradient>
          <linearGradient id="ht-firebox" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFB860" />
            <stop offset="50%" stopColor="#E04A14" />
            <stop offset="100%" stopColor="#7A1E04" />
          </linearGradient>
          <linearGradient id="ht-rail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a5046" />
            <stop offset="100%" stopColor="#2a221c" />
          </linearGradient>
          <radialGradient id="ht-moon" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F4E8C0" stopOpacity={0.92} />
            <stop offset="60%" stopColor="#C8B488" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#88765a" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="ht-vignette" cx="50%" cy="55%" r="70%">
            <stop offset="40%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="ht-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="ht-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* SKY */}
        <rect width={width} height={height} fill="url(#ht-sky)" />

        {/* MOON */}
        <circle cx={width * 0.18} cy={height * 0.22} r={hlBaseR * 0.7} fill="url(#ht-moon)" filter="url(#ht-soft)" />
        <circle cx={width * 0.18} cy={height * 0.22} r={hlBaseR * 0.32} fill="rgba(244, 232, 192, 0.55)" />
        <circle cx={width * 0.18 - 4} cy={height * 0.215} r={2} fill="rgba(120, 100, 70, 0.4)" />
        <circle cx={width * 0.18 + 6} cy={height * 0.225} r={1.5} fill="rgba(120, 100, 70, 0.35)" />

        {/* MOUNTAINS */}
        <path
          d={`M 0 ${horizonY + 4}
              L ${width * 0.10} ${horizonY - 22}
              L ${width * 0.18} ${horizonY - 8}
              L ${width * 0.26} ${horizonY - 30}
              L ${width * 0.34} ${horizonY - 14}
              L ${width * 0.44} ${horizonY - 26}
              L ${width * 0.55} ${horizonY - 12}
              L ${width * 0.66} ${horizonY - 22}
              L ${width * 0.76} ${horizonY - 8}
              L ${width * 0.86} ${horizonY - 18}
              L ${width} ${horizonY + 4}
              L ${width} ${horizonY + 8}
              L 0 ${horizonY + 8} Z`}
          fill="rgba(14, 10, 16, 0.95)"
        />

        {/* GROUND */}
        <rect x={0} y={horizonY + 6} width={width} height={height - horizonY - 6} fill="rgba(10, 6, 8, 0.92)" />

        {/* TIES */}
        <g>{ties}</g>

        {/* RAILS */}
        <path d={railLeftPath} stroke="url(#ht-rail)" strokeWidth={3.5} fill="none" />
        <path d={railRightPath} stroke="url(#ht-rail)" strokeWidth={3.5} fill="none" />
        <path d={railLeftPath} stroke={tintMid} strokeWidth={1.2} fill="none" opacity={0.55 * headlightGlow} />
        <path d={railRightPath} stroke={tintMid} strokeWidth={1.2} fill="none" opacity={0.55 * headlightGlow} />

        {/* POLES */}
        {poleNodes}

        {/* DUST BACK */}
        <g opacity={0.4}>{dustNodes.slice(0, 25)}</g>

        {/* HEADLIGHT BEAM CONE */}
        <g opacity={0.42 * headlightGlow} style={{ mixBlendMode: "screen" }}>
          <path
            d={`M ${hlX} ${hlY + 6}
                L ${railNearLeftX - 90} ${trainBaseY}
                L ${railNearRightX + 90} ${trainBaseY} Z`}
            fill={`hsla(${tintHue}, 95%, 78%, 0.18)`}
          />
          <path
            d={`M ${hlX} ${hlY + 6}
                L ${railNearLeftX - 30} ${trainBaseY}
                L ${railNearRightX + 30} ${trainBaseY} Z`}
            fill={`hsla(${tintHue}, 98%, 86%, 0.30)`}
          />
          <path
            d={`M ${hlX} ${hlY + 6}
                L ${cx - 60} ${trainBaseY}
                L ${cx + 60} ${trainBaseY} Z`}
            fill={`hsla(${tintHue}, 100%, 94%, 0.42)`}
          />
        </g>

        {/* STEAM BACK */}
        <g filter="url(#ht-blur)">{steamNodes.slice(0, 22)}</g>

        {/* LOCOMOTIVE */}
        <g transform={`translate(${shakeX}, ${shakeY})`}>
          {/* Cowcatcher */}
          <path
            d={`M ${trainLeft + 60} ${trainBaseY}
                L ${cx - 130} ${trainBaseY - 70}
                L ${cx + 130} ${trainBaseY - 70}
                L ${trainRight - 60} ${trainBaseY}
                Z`}
            fill="url(#ht-train)"
            stroke="rgba(0,0,0,0.95)"
            strokeWidth={2}
          />
          {Array.from({ length: 9 }, (_, i) => {
            const t = i / 8;
            const sx = trainLeft + 60 + t * (trainW - 120);
            return (
              <line
                key={`slat-${i}`}
                x1={sx}
                y1={trainBaseY}
                x2={cx - 130 + t * 260}
                y2={trainBaseY - 70}
                stroke="rgba(40, 28, 18, 0.85)"
                strokeWidth={1.8}
              />
            );
          })}

          {/* Boiler front */}
          <ellipse
            cx={cx}
            cy={hlY + 60}
            rx={trainW * 0.42}
            ry={hlR * 1.95}
            fill="url(#ht-train)"
            stroke="rgba(0,0,0,0.9)"
            strokeWidth={2.5}
          />
          {[-1, 0, 1].map((k) => (
            <ellipse
              key={`band-${k}`}
              cx={cx}
              cy={hlY + 60 + k * hlR * 0.8}
              rx={trainW * 0.42 + k * 1.2}
              ry={hlR * 1.95 + k * 0.4}
              fill="none"
              stroke="rgba(60, 44, 30, 0.45)"
              strokeWidth={1.2}
            />
          ))}
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2;
            return (
              <circle
                key={`rivet-${i}`}
                cx={cx + Math.cos(a) * trainW * 0.42}
                cy={hlY + 60 + Math.sin(a) * hlR * 1.95}
                r={1.4}
                fill="rgba(80, 60, 40, 0.7)"
              />
            );
          })}

          {/* Smokestack */}
          <rect
            x={cx - 22}
            y={trainTopY - 30}
            width={44}
            height={70}
            fill="url(#ht-train)"
            stroke="rgba(0,0,0,0.9)"
            strokeWidth={2}
          />
          <path
            d={`M ${cx - 28} ${trainTopY - 30}
                L ${cx - 36} ${trainTopY - 44}
                L ${cx + 36} ${trainTopY - 44}
                L ${cx + 28} ${trainTopY - 30} Z`}
            fill="rgba(8, 4, 6, 0.95)"
            stroke="rgba(0,0,0,1)"
            strokeWidth={1.6}
          />

          {/* Steam dome */}
          <ellipse cx={cx + 70} cy={trainTopY + 24} rx={22} ry={14} fill="url(#ht-train)" stroke="rgba(0,0,0,0.9)" strokeWidth={1.6} />
          <ellipse cx={cx + 70} cy={trainTopY + 22} rx={18} ry={3} fill="rgba(60, 42, 28, 0.5)" />

          {/* Bell */}
          <path
            d={`M ${cx - 60} ${trainTopY + 18}
                Q ${cx - 60} ${trainTopY + 6} ${cx - 50} ${trainTopY + 6}
                L ${cx - 70} ${trainTopY + 6}
                Q ${cx - 80} ${trainTopY + 6} ${cx - 80} ${trainTopY + 18}
                Z`}
            fill="rgba(120, 92, 40, 0.85)"
            stroke="rgba(20, 12, 4, 0.9)"
            strokeWidth={1}
          />
          <line x1={cx - 70} y1={trainTopY + 18} x2={cx - 70} y2={trainTopY + 24} stroke="rgba(20, 12, 4, 0.9)" strokeWidth={0.8} />

          {/* Headlight housing */}
          <circle cx={hlX} cy={hlY} r={hlR * 1.55} fill="rgba(8, 4, 6, 0.95)" stroke="rgba(0, 0, 0, 1)" strokeWidth={2.2} />
          <circle cx={hlX} cy={hlY} r={hlR * 1.4} fill="rgba(18, 12, 10, 0.92)" />
          <circle
            cx={hlX}
            cy={hlY}
            r={hlR * 1.4}
            fill="none"
            stroke="rgba(180, 160, 130, 0.7)"
            strokeWidth={1.4}
          />

          {/* HEADLIGHT 3-LAYER GLOW */}
          <circle cx={hlX} cy={hlY} r={hlR * 4.0} fill="url(#ht-headlight)" style={{ mixBlendMode: "screen" }} opacity={0.55 * headlightGlow} />
          <circle cx={hlX} cy={hlY} r={hlR * 2.2} fill="url(#ht-headlight)" style={{ mixBlendMode: "screen" }} opacity={0.78 * headlightGlow} />
          <circle cx={hlX} cy={hlY} r={hlR * 1.0} fill="url(#ht-headcore)" style={{ mixBlendMode: "screen" }} />
          <circle cx={hlX} cy={hlY} r={hlR * 0.45} fill="#FFFFFF" opacity={0.95 * headlightGlow} />

          {/* Number plate */}
          <rect
            x={cx - 30}
            y={trainTopY + 50}
            width={60}
            height={18}
            rx={2}
            fill="rgba(40, 28, 18, 0.9)"
            stroke="rgba(120, 90, 50, 0.7)"
            strokeWidth={0.8}
          />
          <text
            x={cx}
            y={trainTopY + 64}
            fontSize="12"
            fontFamily="Georgia, serif"
            fontWeight="900"
            textAnchor="middle"
            fill="rgba(220, 180, 110, 0.85)"
            letterSpacing="1.5"
          >
            1972
          </text>

          {/* Firebox glow */}
          <ellipse
            cx={cx}
            cy={trainBaseY - 40}
            rx={36}
            ry={14}
            fill="url(#ht-firebox)"
            opacity={0.65 + bass * 0.25}
            style={{ mixBlendMode: "screen" }}
          />
          <ellipse
            cx={cx}
            cy={trainBaseY - 40}
            rx={20}
            ry={6}
            fill="#FFE0A0"
            opacity={0.5 + bass * 0.3}
          />

          {/* Driving wheels */}
          {[-1, 1].map((side) => (
            <g key={`wheelgrp-${side}`}>
              <circle
                cx={cx + side * 90}
                cy={trainBaseY - 28}
                r={28}
                fill="rgba(8, 4, 6, 0.98)"
                stroke="rgba(40, 28, 18, 0.9)"
                strokeWidth={2}
              />
              <circle
                cx={cx + side * 90}
                cy={trainBaseY - 28}
                r={22}
                fill="rgba(14, 10, 8, 0.95)"
              />
              <g transform={`rotate(${wheelRot * side}, ${cx + side * 90}, ${trainBaseY - 28})`}>
                {[0, 60, 120].map((a) => {
                  const rad = (a * Math.PI) / 180;
                  return (
                    <line
                      key={`spoke-${side}-${a}`}
                      x1={cx + side * 90 - Math.cos(rad) * 22}
                      y1={trainBaseY - 28 - Math.sin(rad) * 22}
                      x2={cx + side * 90 + Math.cos(rad) * 22}
                      y2={trainBaseY - 28 + Math.sin(rad) * 22}
                      stroke="rgba(60, 44, 30, 0.85)"
                      strokeWidth={2.5}
                    />
                  );
                })}
                <circle cx={cx + side * 90} cy={trainBaseY - 28} r={5} fill="rgba(120, 92, 50, 0.85)" />
              </g>
            </g>
          ))}
          {/* Pony wheels */}
          {[-1, 1].map((side) => (
            <g key={`pwheel-${side}`}>
              <circle
                cx={cx + side * 160}
                cy={trainBaseY - 18}
                r={16}
                fill="rgba(8, 4, 6, 0.98)"
                stroke="rgba(40, 28, 18, 0.9)"
                strokeWidth={1.5}
              />
              <g transform={`rotate(${wheelRot * 1.4 * side}, ${cx + side * 160}, ${trainBaseY - 18})`}>
                <line
                  x1={cx + side * 160 - 12}
                  y1={trainBaseY - 18}
                  x2={cx + side * 160 + 12}
                  y2={trainBaseY - 18}
                  stroke="rgba(60, 44, 30, 0.85)"
                  strokeWidth={1.8}
                />
                <line
                  x1={cx + side * 160}
                  y1={trainBaseY - 30}
                  x2={cx + side * 160}
                  y2={trainBaseY - 6}
                  stroke="rgba(60, 44, 30, 0.85)"
                  strokeWidth={1.8}
                />
              </g>
            </g>
          ))}

          {/* Connecting rod */}
          <line
            x1={cx - 90}
            y1={trainBaseY - 28}
            x2={cx + 90}
            y2={trainBaseY - 28}
            stroke="rgba(140, 110, 70, 0.75)"
            strokeWidth={3}
          />
          <circle cx={cx - 90} cy={trainBaseY - 28} r={3} fill="rgba(180, 140, 80, 0.9)" />
          <circle cx={cx + 90} cy={trainBaseY - 28} r={3} fill="rgba(180, 140, 80, 0.9)" />

          {/* Cab */}
          <rect
            x={cx - 90}
            y={trainTopY - 4}
            width={180}
            height={50}
            fill="rgba(8, 4, 6, 0.85)"
            stroke="rgba(40, 28, 18, 0.7)"
            strokeWidth={1.4}
          />
          <rect x={cx - 70} y={trainTopY + 6} width={26} height={20} fill="rgba(220, 150, 60, 0.4)" stroke="rgba(0,0,0,0.8)" strokeWidth={1} />
          <rect x={cx + 44} y={trainTopY + 6} width={26} height={20} fill="rgba(220, 150, 60, 0.4)" stroke="rgba(0,0,0,0.8)" strokeWidth={1} />
        </g>

        {/* SPARKS */}
        <g style={{ mixBlendMode: "screen" }}>{sparkNodes}</g>

        {/* STEAM FRONT */}
        <g filter="url(#ht-blur)">{steamNodes.slice(22)}</g>

        {/* DUST FRONT */}
        <g opacity={0.7}>{dustNodes.slice(25)}</g>

        {/* OUTER BLOOM */}
        <circle
          cx={hlX}
          cy={hlY}
          r={Math.max(width, height) * 0.55}
          fill="url(#ht-headlight)"
          opacity={0.18 * headlightGlow}
          style={{ mixBlendMode: "screen" }}
        />

        {/* WHISTLE BURST */}
        {onsetEnv > 0.5 && (
          <g opacity={onsetEnv * 0.7} style={{ mixBlendMode: "screen" }}>
            <ellipse cx={cx + 70} cy={trainTopY - 8} rx={28} ry={14} fill="rgba(240, 235, 220, 0.85)" filter="url(#ht-blur)" />
            <ellipse cx={cx + 90} cy={trainTopY - 24} rx={22} ry={10} fill="rgba(240, 235, 220, 0.7)" filter="url(#ht-blur)" />
          </g>
        )}

        {/* VIGNETTE */}
        <rect width={width} height={height} fill="url(#ht-vignette)" />

        {/* WARM TINT WASH */}
        <rect width={width} height={height} fill={`hsla(${tintHue}, 60%, 55%, ${0.04 + slowEnergy * 0.04})`} />
      </svg>
    </div>
  );
};
