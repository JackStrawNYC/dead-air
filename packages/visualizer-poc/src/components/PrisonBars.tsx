/**
 * PrisonBars — A+++ "He's Gone" / escape-themed prison cell scene.
 *
 * 13 vertical iron bars dominate the foreground, weathered and rusted, with
 * rivets, weld marks, and chipped paint. Looking through the bars at a
 * dramatic distant landscape: a warm sunset over open plains, distant
 * mountains, soaring birds — the freedom that lies beyond. Stone cell wall
 * on either edge with mortar joints. A sliver of light from a high window
 * cuts across the floor.
 *
 * Audio reactivity:
 *   slowEnergy   → sunset warmth + horizon glow
 *   energy       → light shaft brightness
 *   bass         → subtle bar shake
 *   beatDecay    → rust/highlight pulse
 *   onsetEnvelope→ flash from window
 *   chromaHue    → freedom-light tint shift
 *   tempoFactor  → bird drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const BAR_COUNT = 13;

interface BarSpec {
  rivetCount: number;
  rustOffset: number;
  chipPositions: number[];
}

interface BirdFly {
  cx: number;
  cy: number;
  radius: number;
  speed: number;
  size: number;
  phase: number;
}

interface DustMote {
  bx: number;
  by: number;
  r: number;
  speed: number;
  phase: number;
}

interface Stone {
  x: number;
  y: number;
  w: number;
  h: number;
  shade: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PrisonBars: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const barSpecs = React.useMemo<BarSpec[]>(() => {
    const rng = seeded(54_998_117);
    return Array.from({ length: BAR_COUNT }, () => ({
      rivetCount: 5 + Math.floor(rng() * 3),
      rustOffset: rng() * 100,
      chipPositions: Array.from({ length: 4 + Math.floor(rng() * 3) }, () => rng()),
    }));
  }, []);

  const birds = React.useMemo<BirdFly[]>(() => {
    const rng = seeded(77_001_211);
    return Array.from({ length: 7 }, () => ({
      cx: 0.2 + rng() * 0.6,
      cy: 0.18 + rng() * 0.20,
      radius: 0.04 + rng() * 0.06,
      speed: 0.0014 + rng() * 0.002,
      size: 4 + rng() * 4,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const dust = React.useMemo<DustMote[]>(() => {
    const rng = seeded(91_447_303);
    return Array.from({ length: 65 }, () => ({
      bx: rng(),
      by: rng(),
      r: 0.4 + rng() * 1.4,
      speed: 0.001 + rng() * 0.003,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const leftStones = React.useMemo<Stone[]>(() => {
    const rng = seeded(33_887_211);
    const stones: Stone[] = [];
    let y = 0;
    let row = 0;
    while (y < 1.0) {
      const xOff = (row % 2) * 0.5;
      let x = -0.05 + xOff * 0.04;
      while (x < 0.16) {
        stones.push({ x, y, w: 0.04 + rng() * 0.02, h: 0.06 + rng() * 0.02, shade: 0.4 + rng() * 0.4 });
        x += 0.04 + rng() * 0.02;
      }
      y += 0.06 + rng() * 0.01;
      row++;
    }
    return stones;
  }, []);

  const rightStones = React.useMemo<Stone[]>(() => {
    const rng = seeded(66_887_211);
    const stones: Stone[] = [];
    let y = 0;
    let row = 0;
    while (y < 1.0) {
      const xOff = (row % 2) * 0.5;
      let x = 0.86 + xOff * 0.04;
      while (x < 1.05) {
        stones.push({ x, y, w: 0.04 + rng() * 0.02, h: 0.06 + rng() * 0.02, shade: 0.4 + rng() * 0.4 });
        x += 0.04 + rng() * 0.02;
      }
      y += 0.06 + rng() * 0.01;
      row++;
    }
    return stones;
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
  const lightShaft = 0.4 + energy * 0.4 + onsetEnv * 0.4;
  const barShake = bass * 0.6;

  const baseHue = 24;
  const tintHue = ((baseHue + (chromaHue - 180) * 0.32) % 360 + 360) % 360;
  const skyTop = `hsl(${(tintHue + 240) % 360}, 50%, 22%)`;
  const skyMid = `hsl(${(tintHue + 18) % 360}, 80%, 50%)`;
  const skyHorizon = `hsl(${(tintHue - 4 + 360) % 360}, 90%, 70%)`;
  const skyBottom = `hsl(${(tintHue - 12 + 360) % 360}, 78%, 60%)`;

  const cx = width * 0.5;
  const horizonY = height * 0.62;
  const sunX = width * 0.5;
  const sunY = horizonY - 6;

  /* Bar geometry */
  const wallInsetL = width * 0.10;
  const wallInsetR = width * 0.90;
  const usableW = wallInsetR - wallInsetL;
  const barW = usableW / (BAR_COUNT * 1.6);
  const barGap = (usableW - BAR_COUNT * barW) / (BAR_COUNT - 1);

  /* Bird nodes */
  const birdNodes = birds.map((b, i) => {
    const t = frame * b.speed * tempoFactor + b.phase;
    const bx = b.cx * width + Math.cos(t) * b.radius * width;
    const by = b.cy * height + Math.sin(t * 1.2) * b.radius * height * 0.5;
    const flap = Math.sin(frame * 0.16 + i * 0.7) * 3;
    return (
      <path
        key={`bird-${i}`}
        d={`M ${bx - b.size} ${by + flap}
            Q ${bx - b.size * 0.4} ${by - b.size * 0.5 - flap} ${bx} ${by}
            Q ${bx + b.size * 0.4} ${by - b.size * 0.5 - flap} ${bx + b.size} ${by + flap}`}
        fill="none"
        stroke="rgba(20, 14, 10, 0.85)"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    );
  });

  const dustNodes = dust.map((d, i) => {
    const t = frame * d.speed + d.phase;
    const px = ((d.bx + Math.sin(t) * 0.02) * width);
    const py = (d.by * height) + Math.cos(t * 1.3) * 4;
    const op = (0.18 + Math.sin(t * 2 + i) * 0.10) * lightShaft;
    return (
      <circle
        key={`d-${i}`}
        cx={px}
        cy={py}
        r={d.r}
        fill={`hsla(${tintHue + 8}, 70%, 80%, ${op})`}
      />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="pb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="40%" stopColor={skyMid} />
            <stop offset="78%" stopColor={skyHorizon} />
            <stop offset="100%" stopColor={skyBottom} />
          </linearGradient>
          <radialGradient id="pb-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFAE0" stopOpacity={0.95 * sunBright} />
            <stop offset="40%" stopColor={`hsl(${(tintHue + 14) % 360}, 95%, 70%)`} stopOpacity={0.7 * sunBright} />
            <stop offset="100%" stopColor={`hsl(${tintHue}, 90%, 60%)`} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="pb-bar" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0a0604" />
            <stop offset="20%" stopColor="#1f1410" />
            <stop offset="50%" stopColor="#3a261c" />
            <stop offset="80%" stopColor="#1f1410" />
            <stop offset="100%" stopColor="#06030a" />
          </linearGradient>
          <linearGradient id="pb-bar-rust" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a2c0a" stopOpacity={0.5} />
            <stop offset="50%" stopColor="#7a3a0e" stopOpacity={0.7} />
            <stop offset="100%" stopColor="#3a1804" stopOpacity={0.4} />
          </linearGradient>
          <linearGradient id="pb-stone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a322a" />
            <stop offset="100%" stopColor="#1a140e" />
          </linearGradient>
          <linearGradient id="pb-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#241a14" />
            <stop offset="100%" stopColor="#0e0804" />
          </linearGradient>
          <filter id="pb-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* === DISTANT LANDSCAPE THROUGH BARS === */}
        {/* SKY */}
        <rect width={width} height={horizonY + 6} fill="url(#pb-sky)" />

        {/* SUN */}
        <circle cx={sunX} cy={sunY} r={Math.min(width, height) * 0.10 * 4.5} fill="url(#pb-sun)" />
        <circle cx={sunX} cy={sunY} r={Math.min(width, height) * 0.075} fill="rgba(255, 240, 200, 0.85)" opacity={sunBright} />
        <circle cx={sunX} cy={sunY} r={Math.min(width, height) * 0.04} fill="#FFFFFF" opacity={0.92 * sunBright} />

        {/* CLOUDS */}
        {Array.from({ length: 6 }, (_, i) => {
          const cxC = (i / 5) * width + Math.sin(frame * 0.0005 + i) * 12;
          const cyC = height * (0.18 + (i % 3) * 0.06);
          return (
            <ellipse
              key={`cl-${i}`}
              cx={cxC}
              cy={cyC}
              rx={50 + i * 10}
              ry={10 + (i % 3) * 4}
              fill={`rgba(255, 230, 190, ${0.4 + (i % 2) * 0.12})`}
              filter="url(#pb-blur)"
            />
          );
        })}

        {/* MOUNTAINS BACK */}
        <path
          d={`M 0 ${horizonY}
              L ${width * 0.10} ${horizonY - 32}
              L ${width * 0.20} ${horizonY - 18}
              L ${width * 0.32} ${horizonY - 36}
              L ${width * 0.44} ${horizonY - 22}
              L ${width * 0.56} ${horizonY - 32}
              L ${width * 0.68} ${horizonY - 16}
              L ${width * 0.80} ${horizonY - 28}
              L ${width * 0.90} ${horizonY - 14}
              L ${width} ${horizonY}
              L ${width} ${horizonY + 8}
              L 0 ${horizonY + 8} Z`}
          fill={`hsl(${(tintHue + 240) % 360}, 35%, 22%)`}
          opacity={0.95}
        />

        {/* OPEN PLAINS */}
        <path
          d={`M 0 ${horizonY + 4}
              L ${width} ${horizonY + 4}
              L ${width} ${height * 0.78}
              L 0 ${height * 0.78} Z`}
          fill={`hsl(${(tintHue + 12) % 360}, 55%, 45%)`}
        />
        <path
          d={`M 0 ${height * 0.78}
              L ${width} ${height * 0.78}
              L ${width} ${height}
              L 0 ${height} Z`}
          fill="url(#pb-floor)"
        />

        {/* PLAINS GRASS LINES */}
        {Array.from({ length: 18 }, (_, i) => {
          const t = i / 17;
          const lineY = horizonY + 6 + t * (height * 0.78 - horizonY - 6);
          return (
            <line
              key={`gl-${i}`}
              x1={0}
              y1={lineY}
              x2={width}
              y2={lineY + (i % 2 === 0 ? 1 : -1)}
              stroke={`hsla(${(tintHue + 16) % 360}, 60%, 38%, ${0.25 - t * 0.1})`}
              strokeWidth={0.8}
            />
          );
        })}

        {/* BIRDS in distant sky */}
        {birdNodes}

        {/* === HIGH WINDOW LIGHT SHAFT (cuts diagonally across floor) === */}
        <g opacity={0.55 * lightShaft} style={{ mixBlendMode: "screen" }}>
          <path
            d={`M ${width * 0.20} 0
                L ${width * 0.28} 0
                L ${width * 0.62} ${height}
                L ${width * 0.50} ${height} Z`}
            fill={`hsla(${tintHue + 14}, 95%, 80%, 0.25)`}
          />
          <path
            d={`M ${width * 0.22} 0
                L ${width * 0.26} 0
                L ${width * 0.58} ${height}
                L ${width * 0.52} ${height} Z`}
            fill={`hsla(${tintHue + 18}, 100%, 88%, 0.45)`}
          />
        </g>

        {/* DUST in light shaft */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* === STONE CELL WALL LEFT === */}
        {leftStones.map((s, i) => (
          <g key={`ls-${i}`}>
            <rect
              x={s.x * width}
              y={s.y * height}
              width={s.w * width}
              height={s.h * height}
              fill="url(#pb-stone)"
              stroke="rgba(0, 0, 0, 0.85)"
              strokeWidth={1}
            />
            <rect
              x={s.x * width + 1}
              y={s.y * height + 1}
              width={s.w * width - 2}
              height={2}
              fill={`rgba(${50 + s.shade * 30}, ${44 + s.shade * 25}, ${36 + s.shade * 20}, 0.85)`}
            />
            <line
              x1={s.x * width + 2}
              y1={s.y * height + 4}
              x2={s.x * width + s.w * width - 2}
              y2={s.y * height + 4}
              stroke="rgba(20, 12, 6, 0.55)"
              strokeWidth={0.4}
            />
          </g>
        ))}

        {/* === STONE CELL WALL RIGHT === */}
        {rightStones.map((s, i) => (
          <g key={`rs-${i}`}>
            <rect
              x={s.x * width}
              y={s.y * height}
              width={s.w * width}
              height={s.h * height}
              fill="url(#pb-stone)"
              stroke="rgba(0, 0, 0, 0.85)"
              strokeWidth={1}
            />
            <rect
              x={s.x * width + 1}
              y={s.y * height + 1}
              width={s.w * width - 2}
              height={2}
              fill={`rgba(${50 + s.shade * 30}, ${44 + s.shade * 25}, ${36 + s.shade * 20}, 0.85)`}
            />
            <line
              x1={s.x * width + 2}
              y1={s.y * height + 4}
              x2={s.x * width + s.w * width - 2}
              y2={s.y * height + 4}
              stroke="rgba(20, 12, 6, 0.55)"
              strokeWidth={0.4}
            />
          </g>
        ))}

        {/* === HORIZONTAL CROSS-BAR (top frame) === */}
        <rect
          x={wallInsetL - 8}
          y={height * 0.10}
          width={usableW + 16}
          height={18}
          fill="url(#pb-bar)"
          stroke="rgba(0, 0, 0, 0.95)"
          strokeWidth={1.5}
        />
        <rect
          x={wallInsetL - 8}
          y={height * 0.10}
          width={usableW + 16}
          height={4}
          fill="rgba(220, 180, 90, 0.30)"
        />

        {/* === HORIZONTAL CROSS-BAR (mid) === */}
        <rect
          x={wallInsetL - 4}
          y={height * 0.46}
          width={usableW + 8}
          height={12}
          fill="url(#pb-bar)"
          stroke="rgba(0, 0, 0, 0.95)"
          strokeWidth={1}
        />

        {/* === HORIZONTAL CROSS-BAR (bottom frame) === */}
        <rect
          x={wallInsetL - 8}
          y={height * 0.92}
          width={usableW + 16}
          height={20}
          fill="url(#pb-bar)"
          stroke="rgba(0, 0, 0, 0.95)"
          strokeWidth={1.5}
        />

        {/* === VERTICAL BARS === */}
        {Array.from({ length: BAR_COUNT }, (_, i) => {
          const bx = wallInsetL + i * (barW + barGap) + Math.sin(frame * 0.05 + i) * barShake;
          const spec = barSpecs[i];
          const barTop = height * 0.10;
          const barBot = height * 0.92 + 20;
          const barH = barBot - barTop;
          return (
            <g key={`bar-${i}`}>
              {/* Bar shadow on floor */}
              <rect
                x={bx - 2}
                y={barBot}
                width={barW + 4}
                height={6}
                fill="rgba(0, 0, 0, 0.85)"
                filter="url(#pb-blur)"
              />
              {/* Bar core (3-layer rendering) */}
              <rect
                x={bx - 1}
                y={barTop}
                width={barW + 2}
                height={barH}
                fill="rgba(0, 0, 0, 0.95)"
              />
              <rect
                x={bx}
                y={barTop}
                width={barW}
                height={barH}
                fill="url(#pb-bar)"
              />
              {/* Rust patches (mid layer) */}
              <rect
                x={bx + 1}
                y={barTop + spec.rustOffset * 2}
                width={barW - 2}
                height={barH * 0.4}
                fill="url(#pb-bar-rust)"
                opacity={0.85}
              />
              {/* Highlight stripe (catches light) */}
              <rect
                x={bx + barW * 0.20}
                y={barTop + 4}
                width={barW * 0.18}
                height={barH - 8}
                fill={`hsla(${tintHue + 14}, 90%, 70%, ${0.30 + beatDecay * 0.20})`}
              />
              {/* Rivets at top, mid, bottom */}
              {[barTop + 24, barTop + barH * 0.33, barTop + barH * 0.66, barBot - 24].map((ry, rk) => (
                <g key={`rv-${i}-${rk}`}>
                  <circle cx={bx + barW * 0.5} cy={ry} r={barW * 0.55} fill="rgba(20, 12, 6, 0.95)" />
                  <circle cx={bx + barW * 0.5} cy={ry} r={barW * 0.40} fill="rgba(50, 32, 18, 0.85)" />
                  <circle cx={bx + barW * 0.5 - 1} cy={ry - 1} r={barW * 0.18} fill="rgba(120, 80, 30, 0.85)" />
                </g>
              ))}
              {/* Chip / paint flake marks */}
              {spec.chipPositions.map((cp, ck) => (
                <ellipse
                  key={`chip-${i}-${ck}`}
                  cx={bx + barW * (0.2 + (ck % 3) * 0.3)}
                  cy={barTop + cp * barH}
                  rx={1.4}
                  ry={2.8}
                  fill="rgba(120, 80, 30, 0.55)"
                />
              ))}
              {/* Weld marks where vertical meets horizontal cross bars */}
              <ellipse cx={bx + barW * 0.5} cy={height * 0.10 + 18} rx={barW * 0.7} ry={3} fill="rgba(80, 50, 18, 0.85)" />
              <ellipse cx={bx + barW * 0.5} cy={height * 0.46 + 12} rx={barW * 0.6} ry={2.5} fill="rgba(80, 50, 18, 0.85)" />
              <ellipse cx={bx + barW * 0.5} cy={height * 0.92} rx={barW * 0.7} ry={3} fill="rgba(80, 50, 18, 0.85)" />
            </g>
          );
        })}

        {/* === FLOOR (in front of bars, lower portion) === */}
        <path
          d={`M 0 ${height * 0.92}
              L ${width} ${height * 0.92}
              L ${width} ${height}
              L 0 ${height} Z`}
          fill="url(#pb-floor)"
          opacity={0.95}
        />
        {/* Floor texture lines */}
        {Array.from({ length: 6 }, (_, i) => (
          <line
            key={`fl-${i}`}
            x1={0}
            y1={height * 0.93 + i * (height * 0.07 / 6)}
            x2={width}
            y2={height * 0.93 + i * (height * 0.07 / 6) + (i % 2 === 0 ? 1 : -1)}
            stroke="rgba(60, 36, 16, 0.45)"
            strokeWidth={0.6}
          />
        ))}

        {/* TINT WASH */}
        <rect width={width} height={height} fill={`hsla(${tintHue + 8}, 70%, 50%, ${0.04 + slowEnergy * 0.04})`} />

        {/* VIGNETTE */}
        <radialGradient id="pb-vignette" cx="50%" cy="50%" r="70%">
          <stop offset="50%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.7)" />
        </radialGradient>
        <rect width={width} height={height} fill="url(#pb-vignette)" />
      </svg>
    </div>
  );
};
