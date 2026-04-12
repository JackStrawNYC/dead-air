/**
 * VWBusParade — A+++ convoy of detailed VW Type 2 Microbuses on a beach road.
 *
 * 5 buses parked / driving in formation on a sandy beach road, ocean horizon
 * behind them. Each bus is uniquely painted: peace signs, flowers, sun rays,
 * tie-dye, dancing bears. Detailed front faces with split-windshield, round
 * headlights, V badge, fenders, white-wall tires, chrome bumpers, hubcaps.
 * Beach palms, surf, sun, seagulls, dust trails, hippie convoy energy.
 *
 * Audio reactivity:
 *   slowEnergy   → sun warmth
 *   energy       → headlight glow + smoke
 *   bass         → bus bounce / suspension
 *   beatDecay    → headlight pulse
 *   onsetEnvelope→ horn flash
 *   chromaHue    → palette tint
 *   tempoFactor  → bus drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

interface BusSpec {
  bx: number;
  scale: number;
  baseHue: number;
  hueB: number;
  pattern: "peace" | "flower" | "tiedye" | "sunrays" | "bears";
  bobPhase: number;
}

interface PalmSpec {
  x: number;
  scale: number;
  fronds: number;
}

interface Gull {
  cx: number;
  cy: number;
  r: number;
  speed: number;
  size: number;
  phase: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const VWBusParade: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const buses = React.useMemo<BusSpec[]>(() => {
    const rng = seeded(45_113_998);
    return [
      { bx: 0.10, scale: 0.55, baseHue: 220, hueB: 180, pattern: "peace",  bobPhase: rng() * Math.PI * 2 },
      { bx: 0.30, scale: 0.65, baseHue: 22,  hueB: 280, pattern: "flower", bobPhase: rng() * Math.PI * 2 },
      { bx: 0.50, scale: 0.78, baseHue: 340, hueB: 50,  pattern: "tiedye", bobPhase: rng() * Math.PI * 2 },
      { bx: 0.72, scale: 0.62, baseHue: 120, hueB: 60,  pattern: "sunrays",bobPhase: rng() * Math.PI * 2 },
      { bx: 0.92, scale: 0.50, baseHue: 280, hueB: 200, pattern: "bears",  bobPhase: rng() * Math.PI * 2 },
    ];
  }, []);

  const palms = React.useMemo<PalmSpec[]>(() => {
    const rng = seeded(72_887_001);
    return Array.from({ length: 9 }, (_, i) => ({
      x: 0.04 + (i / 8) * 0.92 + (rng() - 0.5) * 0.04,
      scale: 0.6 + rng() * 0.7,
      fronds: 7 + Math.floor(rng() * 4),
    }));
  }, []);

  const gulls = React.useMemo<Gull[]>(() => {
    const rng = seeded(33_889_211);
    return Array.from({ length: 8 }, () => ({
      cx: 0.1 + rng() * 0.8,
      cy: 0.18 + rng() * 0.18,
      r: 0.04 + rng() * 0.06,
      speed: 0.0014 + rng() * 0.002,
      size: 4 + rng() * 4,
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

  // Widened: dim at quiet, blazing at loud
  const sunBright = 0.25 + slowEnergy * 0.8;
  const headlightGlow = 0.2 + energy * 0.7 + beatDecay * 0.6;

  const baseHue = 28;
  const tintHue = ((baseHue + (chromaHue - 180) * 0.32) % 360 + 360) % 360;
  const skyTop = `hsl(${(tintHue + 220) % 360}, 65%, 60%)`;
  const skyMid = `hsl(${(tintHue + 200) % 360}, 70%, 75%)`;
  const skyHorizon = `hsl(${(tintHue + 12) % 360}, 80%, 85%)`;

  const horizonY = height * 0.55;
  const sunX = width * 0.72;
  const sunY = horizonY - 18;

  /* Gull nodes */
  const gullNodes = gulls.map((g, i) => {
    const t = frame * g.speed * tempoFactor + g.phase;
    const gx = g.cx * width + Math.cos(t) * g.r * width;
    const gy = g.cy * height + Math.sin(t * 1.2) * g.r * height * 0.5;
    const flap = Math.sin(frame * 0.16 + i * 0.7) * 3;
    return (
      <path
        key={`g-${i}`}
        d={`M ${gx - g.size} ${gy + flap}
            Q ${gx - g.size * 0.4} ${gy - g.size * 0.5 - flap} ${gx} ${gy}
            Q ${gx + g.size * 0.4} ${gy - g.size * 0.5 - flap} ${gx + g.size} ${gy + flap}`}
        fill="none"
        stroke="rgba(20, 14, 10, 0.85)"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    );
  });

  /* === Render a single VW bus === */
  function renderBus(b: BusSpec, idx: number): React.ReactNode {
    const driftOffset = ((frame * 0.0002 * tempoFactor) % 0.04) - 0.02;
    const cxN = b.bx + driftOffset;
    const busW = width * 0.20 * b.scale;
    const busH = busW * 0.62;
    const busCx = cxN * width;
    const busCy = height * 0.78 + Math.sin(frame * 0.018 + b.bobPhase) * (1 + bass * 2.5);

    const bodyX = busCx - busW * 0.5;
    const bodyY = busCy - busH * 0.5;

    const colorA = `hsl(${b.baseHue}, 80%, 55%)`;
    const colorB = `hsl(${b.hueB}, 80%, 60%)`;
    const colorWhite = "hsl(40, 30%, 95%)";

    /* Pattern */
    let patternEls: React.ReactNode = null;
    if (b.pattern === "peace") {
      patternEls = (
        <g>
          <circle cx={busCx + busW * 0.15} cy={busCy} r={busW * 0.12} fill="none" stroke={colorWhite} strokeWidth={2.5} />
          <line x1={busCx + busW * 0.15} y1={busCy - busW * 0.12} x2={busCx + busW * 0.15} y2={busCy + busW * 0.12} stroke={colorWhite} strokeWidth={2.5} />
          <line x1={busCx + busW * 0.15} y1={busCy} x2={busCx + busW * 0.15 - busW * 0.08} y2={busCy + busW * 0.08} stroke={colorWhite} strokeWidth={2.5} />
          <line x1={busCx + busW * 0.15} y1={busCy} x2={busCx + busW * 0.15 + busW * 0.08} y2={busCy + busW * 0.08} stroke={colorWhite} strokeWidth={2.5} />
        </g>
      );
    } else if (b.pattern === "flower") {
      patternEls = Array.from({ length: 4 }, (_, k) => (
        <g key={`fl-${idx}-${k}`}>
          {Array.from({ length: 6 }, (_, p) => {
            const a = (p / 6) * Math.PI * 2;
            const fcx = busCx - busW * 0.1 + (k % 2) * busW * 0.18;
            const fcy = busCy + Math.floor(k / 2) * busW * 0.10 - busW * 0.04;
            return (
              <circle
                key={p}
                cx={fcx + Math.cos(a) * busW * 0.025}
                cy={fcy + Math.sin(a) * busW * 0.025}
                r={busW * 0.025}
                fill={`hsl(${(b.baseHue + p * 30) % 360}, 90%, 65%)`}
              />
            );
          })}
        </g>
      ));
    } else if (b.pattern === "tiedye") {
      patternEls = (
        <g>
          {Array.from({ length: 5 }, (_, k) => (
            <ellipse
              key={`td-${idx}-${k}`}
              cx={busCx}
              cy={busCy}
              rx={busW * (0.12 + k * 0.08)}
              ry={busH * (0.12 + k * 0.08)}
              fill="none"
              stroke={`hsl(${(b.baseHue + k * 60) % 360}, 90%, 65%)`}
              strokeWidth={2.5}
              opacity={0.85}
            />
          ))}
        </g>
      );
    } else if (b.pattern === "sunrays") {
      patternEls = (
        <g>
          <circle cx={busCx + busW * 0.15} cy={busCy} r={busW * 0.06} fill={colorWhite} />
          {Array.from({ length: 12 }, (_, k) => {
            const a = (k / 12) * Math.PI * 2;
            return (
              <line
                key={`sr-${idx}-${k}`}
                x1={busCx + busW * 0.15 + Math.cos(a) * busW * 0.07}
                y1={busCy + Math.sin(a) * busW * 0.07}
                x2={busCx + busW * 0.15 + Math.cos(a) * busW * 0.13}
                y2={busCy + Math.sin(a) * busW * 0.13}
                stroke={colorWhite}
                strokeWidth={1.8}
              />
            );
          })}
        </g>
      );
    } else {
      // bears
      patternEls = Array.from({ length: 4 }, (_, k) => {
        const cxB = busCx - busW * 0.18 + k * busW * 0.12;
        const cyB = busCy + Math.sin(k) * 4;
        const hue = (b.baseHue + k * 80) % 360;
        return (
          <g key={`bears-${idx}-${k}`}>
            <ellipse cx={cxB} cy={cyB} rx={4} ry={5} fill={`hsl(${hue}, 90%, 60%)`} />
            <circle cx={cxB} cy={cyB - 5} r={3} fill={`hsl(${hue}, 90%, 65%)`} />
            <circle cx={cxB - 1.5} cy={cyB - 6.5} r={1} fill={`hsl(${hue}, 90%, 65%)`} />
            <circle cx={cxB + 1.5} cy={cyB - 6.5} r={1} fill={`hsl(${hue}, 90%, 65%)`} />
          </g>
        );
      });
    }

    return (
      <g key={`bus-${idx}`}>
        {/* Shadow */}
        <ellipse
          cx={busCx + 4}
          cy={busCy + busH * 0.55}
          rx={busW * 0.55}
          ry={4}
          fill="rgba(0, 0, 0, 0.4)"
        />

        {/* Body — split top/bottom */}
        {/* Top half */}
        <rect
          x={bodyX}
          y={bodyY}
          width={busW}
          height={busH * 0.5}
          rx={busW * 0.08}
          fill={colorA}
          stroke="rgba(0, 0, 0, 0.9)"
          strokeWidth={2}
        />
        {/* Bottom half */}
        <rect
          x={bodyX}
          y={bodyY + busH * 0.5}
          width={busW}
          height={busH * 0.5}
          fill={colorB}
          stroke="rgba(0, 0, 0, 0.9)"
          strokeWidth={2}
        />
        {/* Belt-line trim (chrome) */}
        <rect
          x={bodyX}
          y={bodyY + busH * 0.48}
          width={busW}
          height={busH * 0.06}
          fill="rgba(220, 220, 210, 0.85)"
          stroke="rgba(60, 60, 50, 0.85)"
          strokeWidth={0.6}
        />

        {/* Pattern art */}
        {patternEls}

        {/* SPLIT WINDSHIELD — characteristic V split */}
        <path
          d={`M ${bodyX + busW * 0.10} ${bodyY + busH * 0.12}
              L ${busCx} ${bodyY + busH * 0.08}
              L ${busCx} ${bodyY + busH * 0.40}
              L ${bodyX + busW * 0.10} ${bodyY + busH * 0.40} Z`}
          fill="hsla(200, 60%, 75%, 0.65)"
          stroke="rgba(20, 18, 14, 0.95)"
          strokeWidth={1.4}
        />
        <path
          d={`M ${busCx} ${bodyY + busH * 0.08}
              L ${bodyX + busW * 0.90} ${bodyY + busH * 0.12}
              L ${bodyX + busW * 0.90} ${bodyY + busH * 0.40}
              L ${busCx} ${bodyY + busH * 0.40} Z`}
          fill="hsla(200, 60%, 75%, 0.65)"
          stroke="rgba(20, 18, 14, 0.95)"
          strokeWidth={1.4}
        />

        {/* SIDE WINDOWS */}
        {Array.from({ length: 3 }, (_, k) => {
          const wxk = bodyX + busW * 0.10 + k * busW * 0.27;
          return (
            <rect
              key={`sw-${idx}-${k}`}
              x={wxk}
              y={bodyY + busH * 0.16}
              width={busW * 0.22}
              height={busH * 0.22}
              rx={2}
              fill="hsla(200, 60%, 70%, 0.55)"
              stroke="rgba(20, 18, 14, 0.85)"
              strokeWidth={1}
            />
          );
        })}

        {/* LARGE V BADGE on front */}
        <circle cx={busCx} cy={bodyY + busH * 0.62} r={busW * 0.05} fill="rgba(220, 220, 210, 0.95)" stroke="rgba(20, 18, 14, 0.95)" strokeWidth={1.2} />
        <text x={busCx} y={bodyY + busH * 0.65} fontSize={busW * 0.08} fontFamily="Arial" fontWeight="900" textAnchor="middle" fill="rgba(20, 18, 14, 0.95)">V</text>

        {/* HEADLIGHTS — round, glow */}
        <circle cx={bodyX + busW * 0.18} cy={bodyY + busH * 0.62} r={busW * 0.05} fill="hsla(45, 100%, 90%, 0.95)" stroke="rgba(20, 18, 14, 0.95)" strokeWidth={1} />
        <circle cx={bodyX + busW * 0.82} cy={bodyY + busH * 0.62} r={busW * 0.05} fill="hsla(45, 100%, 90%, 0.95)" stroke="rgba(20, 18, 14, 0.95)" strokeWidth={1} />
        {/* Headlight glow */}
        <circle cx={bodyX + busW * 0.18} cy={bodyY + busH * 0.62} r={busW * 0.12 * headlightGlow} fill="hsla(45, 90%, 80%, 0.4)" />
        <circle cx={bodyX + busW * 0.82} cy={bodyY + busH * 0.62} r={busW * 0.12 * headlightGlow} fill="hsla(45, 90%, 80%, 0.4)" />

        {/* TURN SIGNALS */}
        <circle cx={bodyX + busW * 0.10} cy={bodyY + busH * 0.65} r={busW * 0.02} fill="hsl(40, 90%, 60%)" />
        <circle cx={bodyX + busW * 0.90} cy={bodyY + busH * 0.65} r={busW * 0.02} fill="hsl(40, 90%, 60%)" />

        {/* CHROME BUMPER */}
        <rect x={bodyX} y={bodyY + busH * 0.85} width={busW} height={busH * 0.06} fill="rgba(220, 220, 210, 0.92)" stroke="rgba(60, 60, 50, 0.85)" strokeWidth={0.8} />

        {/* WHEELS — white-walls */}
        {[-0.30, 0.30].map((dx, k) => (
          <g key={`w-${idx}-${k}`}>
            <circle
              cx={busCx + dx * busW}
              cy={bodyY + busH * 0.95}
              r={busW * 0.10}
              fill="rgba(20, 18, 14, 0.98)"
              stroke="rgba(245, 245, 240, 0.9)"
              strokeWidth={busW * 0.025}
            />
            <circle cx={busCx + dx * busW} cy={bodyY + busH * 0.95} r={busW * 0.05} fill="rgba(220, 220, 210, 0.95)" />
            <g transform={`rotate(${frame * 6 + idx * 30}, ${busCx + dx * busW}, ${bodyY + busH * 0.95})`}>
              <line x1={busCx + dx * busW - busW * 0.04} y1={bodyY + busH * 0.95} x2={busCx + dx * busW + busW * 0.04} y2={bodyY + busH * 0.95} stroke="rgba(60, 60, 50, 0.85)" strokeWidth={1} />
              <line x1={busCx + dx * busW} y1={bodyY + busH * 0.95 - busW * 0.04} x2={busCx + dx * busW} y2={bodyY + busH * 0.95 + busW * 0.04} stroke="rgba(60, 60, 50, 0.85)" strokeWidth={1} />
            </g>
          </g>
        ))}

        {/* MIRROR */}
        <line x1={bodyX + busW * 0.06} y1={bodyY + busH * 0.30} x2={bodyX - busW * 0.04} y2={bodyY + busH * 0.20} stroke="rgba(60, 60, 50, 0.95)" strokeWidth={1.4} />
        <rect x={bodyX - busW * 0.06} y={bodyY + busH * 0.16} width={busW * 0.04} height={busW * 0.05} fill="rgba(220, 220, 210, 0.85)" stroke="rgba(60, 60, 50, 0.95)" strokeWidth={0.5} />

        {/* SURFBOARD on roof */}
        {idx % 2 === 0 && (
          <g>
            <ellipse cx={busCx} cy={bodyY - 3} rx={busW * 0.32} ry={2.5} fill={`hsl(${(b.hueB + 60) % 360}, 80%, 60%)`} stroke="rgba(20, 18, 14, 0.95)" strokeWidth={0.8} />
            <line x1={busCx} y1={bodyY - 5} x2={busCx} y2={bodyY - 0.5} stroke="rgba(20, 18, 14, 0.85)" strokeWidth={0.5} />
          </g>
        )}
      </g>
    );
  }

  /* Sort buses back-to-front by scale */
  const orderedBuses = [...buses].sort((a, b) => a.scale - b.scale);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="vw-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="vw-ocean" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${(tintHue + 200) % 360}, 70%, 50%)`} />
            <stop offset="100%" stopColor={`hsl(${(tintHue + 220) % 360}, 75%, 28%)`} />
          </linearGradient>
          <linearGradient id="vw-sand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${(tintHue + 12) % 360}, 60%, 75%)`} />
            <stop offset="100%" stopColor={`hsl(${(tintHue + 18) % 360}, 55%, 55%)`} />
          </linearGradient>
          <radialGradient id="vw-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFAE0" stopOpacity={0.95 * sunBright} />
            <stop offset="40%" stopColor={`hsl(${(tintHue + 14) % 360}, 95%, 70%)`} stopOpacity={0.7 * sunBright} />
            <stop offset="100%" stopColor={`hsl(${tintHue}, 90%, 60%)`} stopOpacity={0} />
          </radialGradient>
          <filter id="vw-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* SKY */}
        <rect width={width} height={height} fill="url(#vw-sky)" />

        {/* SUN */}
        <circle cx={sunX} cy={sunY} r={Math.min(width, height) * 0.10 * 4} fill="url(#vw-sun)" />
        <circle cx={sunX} cy={sunY} r={Math.min(width, height) * 0.06} fill="rgba(255, 240, 200, 0.85)" opacity={sunBright} />
        <circle cx={sunX} cy={sunY} r={Math.min(width, height) * 0.03} fill="#FFFFFF" opacity={0.92 * sunBright} />

        {/* CLOUDS */}
        {Array.from({ length: 6 }, (_, i) => {
          const cxC = (i / 5) * width + Math.sin(frame * 0.0006 + i) * 14;
          const cyC = height * (0.18 + (i % 3) * 0.06);
          return (
            <ellipse
              key={`cl-${i}`}
              cx={cxC}
              cy={cyC}
              rx={50 + i * 10}
              ry={10 + (i % 3) * 4}
              fill="rgba(255, 250, 240, 0.65)"
              filter="url(#vw-blur)"
            />
          );
        })}

        {/* GULLS */}
        {gullNodes}

        {/* OCEAN */}
        <rect x={0} y={horizonY} width={width} height={height * 0.10} fill="url(#vw-ocean)" />

        {/* OCEAN WAVES */}
        {Array.from({ length: 12 }, (_, i) => {
          const t = i / 11;
          const wy = horizonY + 4 + t * (height * 0.08);
          return (
            <line
              key={`wv-${i}`}
              x1={0}
              y1={wy}
              x2={width}
              y2={wy + Math.sin(i + frame * 0.04) * 2}
              stroke="rgba(255, 255, 250, 0.45)"
              strokeWidth={0.8}
            />
          );
        })}

        {/* SURF FOAM at shoreline */}
        <rect x={0} y={horizonY + height * 0.08} width={width} height={4} fill="rgba(255, 255, 250, 0.85)" />
        {Array.from({ length: 30 }, (_, i) => (
          <ellipse
            key={`foam-${i}`}
            cx={(i / 29) * width + Math.sin(i + frame * 0.05) * 4}
            cy={horizonY + height * 0.08 + 2}
            rx={6}
            ry={1.5}
            fill="rgba(255, 255, 250, 0.6)"
          />
        ))}

        {/* SAND */}
        <rect x={0} y={horizonY + height * 0.10} width={width} height={height - horizonY - height * 0.10} fill="url(#vw-sand)" />

        {/* PALM TREES */}
        {palms.map((p, i) => {
          const px = p.x * width;
          const py = horizonY + height * 0.12;
          const trunkH = 60 * p.scale;
          return (
            <g key={`palm-${i}`} opacity={0.9}>
              {/* Trunk */}
              <path
                d={`M ${px} ${py} Q ${px + 3} ${py - trunkH * 0.5} ${px + 1} ${py - trunkH}`}
                stroke="rgba(60, 36, 14, 0.95)"
                strokeWidth={3 * p.scale}
                fill="none"
              />
              {/* Trunk segments */}
              {Array.from({ length: 8 }, (_, k) => (
                <line
                  key={`tk-${i}-${k}`}
                  x1={px - 2}
                  y1={py - k * (trunkH / 8)}
                  x2={px + 4}
                  y2={py - k * (trunkH / 8)}
                  stroke="rgba(40, 24, 8, 0.85)"
                  strokeWidth={0.6}
                />
              ))}
              {/* Fronds */}
              {Array.from({ length: p.fronds }, (_, k) => {
                const a = -Math.PI / 2 + (k - p.fronds / 2) * 0.4;
                const len = 30 * p.scale;
                const fx = px + 1 + Math.cos(a) * len;
                const fy = py - trunkH + Math.sin(a) * len;
                return (
                  <g key={`fr-${i}-${k}`}>
                    <path
                      d={`M ${px + 1} ${py - trunkH} Q ${(px + fx) / 2 + 4} ${(py - trunkH + fy) / 2 - 6} ${fx} ${fy}`}
                      stroke="rgba(40, 80, 30, 0.95)"
                      strokeWidth={2.5}
                      fill="none"
                      strokeLinecap="round"
                    />
                    {/* Frond leaflets */}
                    {Array.from({ length: 6 }, (_, j) => {
                      const tt = j / 5;
                      const lx = px + 1 + (fx - px - 1) * tt;
                      const ly = py - trunkH + (fy - (py - trunkH)) * tt;
                      return (
                        <line
                          key={j}
                          x1={lx}
                          y1={ly}
                          x2={lx + Math.cos(a + Math.PI / 2) * 4}
                          y2={ly + Math.sin(a + Math.PI / 2) * 4}
                          stroke="rgba(40, 80, 30, 0.85)"
                          strokeWidth={0.8}
                        />
                      );
                    })}
                  </g>
                );
              })}
              {/* Coconuts */}
              <circle cx={px + 2} cy={py - trunkH + 4} r={2.2} fill="rgba(60, 36, 14, 0.95)" />
              <circle cx={px - 2} cy={py - trunkH + 6} r={2} fill="rgba(60, 36, 14, 0.95)" />
            </g>
          );
        })}

        {/* SAND TEXTURE */}
        {Array.from({ length: 14 }, (_, i) => (
          <line
            key={`st-${i}`}
            x1={0}
            y1={horizonY + height * 0.13 + i * (height * 0.40 / 14)}
            x2={width}
            y2={horizonY + height * 0.13 + i * (height * 0.40 / 14) + (i % 2 === 0 ? 1 : -1)}
            stroke={`hsla(${(tintHue + 18) % 360}, 50%, 55%, 0.35)`}
            strokeWidth={0.6}
          />
        ))}

        {/* === BUSES === */}
        {orderedBuses.map((b, i) => renderBus(b, i))}

        {/* DUST KICKED UP between buses */}
        {Array.from({ length: 22 }, (_, i) => {
          const bx = (i / 21) * width;
          const by = height * 0.86 + Math.sin(frame * 0.04 + i) * 2;
          const r = 2 + Math.sin(i * 1.3) * 1.5;
          return (
            <circle
              key={`dk-${i}`}
              cx={bx}
              cy={by}
              r={r}
              fill={`hsla(${tintHue + 18}, 60%, 70%, ${0.18 + Math.sin(i + frame * 0.04) * 0.05})`}
            />
          );
        })}

        {/* TINT WASH */}
        <rect width={width} height={height} fill={`hsla(${tintHue + 14}, 80%, 60%, ${0.04 + slowEnergy * 0.04})`} />

        {/* HORN BURST on onset (chrome flash) */}
        {onsetEnv > 0.5 && (
          <rect width={width} height={height} fill={`hsla(${tintHue + 14}, 100%, 90%, ${onsetEnv * 0.10})`} style={{ mixBlendMode: "screen" }} />
        )}
      </svg>
    </div>
  );
};
