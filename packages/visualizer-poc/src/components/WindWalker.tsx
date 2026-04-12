/**
 * WindWalker — A+++ overlay for "Black Throated Wind".
 *
 * A lone figure walks right-to-left across a desolate road, leaning into a
 * driving wind. Long coat flaps behind, hat held down, hair flowing wild,
 * satchel/guitar case in hand. The frame is alive with horizontal wind
 * streaks (3 layers — fast/mid/background), tumbling dust motes, leaves and
 * paper scraps, sparse vegetation, telephone-pole fenceline, distant
 * mountain silhouettes, and a stormy sky with flowing cloud bands.
 *
 * Audio reactivity:
 *   energy     -> wind streak count + speed multiplier
 *   bass       -> gust intensity (dramatic wind bursts)
 *   slowEnergy -> sky color / overall mood drift
 *   beatDecay  -> pulse extra wind gusts
 *   chromaHue  -> subtle sky tint
 *   tempo      -> figure walking stride speed
 *
 * Continuous render — rotation engine controls visibility externally.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Color util                                                         */
/* ------------------------------------------------------------------ */

function hslToRgba(h: number, s: number, l: number, a: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return `rgba(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)},${a})`;
}

/* ------------------------------------------------------------------ */
/*  Pre-seeded streak / particle / debris layouts                      */
/* ------------------------------------------------------------------ */

interface Streak {
  yFrac: number;
  lengthFrac: number;
  speedMul: number;
  thickness: number;
  alpha: number;
  phase: number;
  layer: 0 | 1 | 2; // 0=background wide, 1=mid, 2=fast thin
}

interface DustMote {
  yFrac: number;
  speedMul: number;
  size: number;
  alpha: number;
  phase: number;
  bobAmp: number;
}

interface Debris {
  yFrac: number;
  speedMul: number;
  size: number;
  spin: number;
  kind: 0 | 1; // 0=leaf, 1=paper
  phase: number;
}

interface Cloud {
  yFrac: number;
  widthFrac: number;
  speedMul: number;
  alpha: number;
  phase: number;
  thickness: number;
}

interface Pole {
  xFrac: number;
  heightFrac: number;
}

function buildStreaks(seed: number): Streak[] {
  const rng = seeded(seed);
  const out: Streak[] = [];
  // background wide soft streaks
  for (let i = 0; i < 10; i++) {
    out.push({
      yFrac: 0.05 + rng() * 0.9,
      lengthFrac: 0.35 + rng() * 0.4,
      speedMul: 0.25 + rng() * 0.25,
      thickness: 4 + rng() * 5,
      alpha: 0.05 + rng() * 0.07,
      phase: rng() * 1000,
      layer: 0,
    });
  }
  // medium mid streaks
  for (let i = 0; i < 14; i++) {
    out.push({
      yFrac: 0.05 + rng() * 0.9,
      lengthFrac: 0.18 + rng() * 0.2,
      speedMul: 0.6 + rng() * 0.4,
      thickness: 1.5 + rng() * 1.4,
      alpha: 0.12 + rng() * 0.12,
      phase: rng() * 1000,
      layer: 1,
    });
  }
  // fast thin streaks (foreground)
  for (let i = 0; i < 14; i++) {
    out.push({
      yFrac: 0.05 + rng() * 0.9,
      lengthFrac: 0.08 + rng() * 0.12,
      speedMul: 1.1 + rng() * 0.7,
      thickness: 0.7 + rng() * 0.8,
      alpha: 0.18 + rng() * 0.18,
      phase: rng() * 1000,
      layer: 2,
    });
  }
  return out;
}

function buildDust(seed: number): DustMote[] {
  const rng = seeded(seed);
  const out: DustMote[] = [];
  for (let i = 0; i < 60; i++) {
    out.push({
      yFrac: 0.45 + rng() * 0.5,
      speedMul: 0.5 + rng() * 1.0,
      size: 0.6 + rng() * 1.6,
      alpha: 0.15 + rng() * 0.3,
      phase: rng() * 1000,
      bobAmp: 2 + rng() * 6,
    });
  }
  return out;
}

function buildDebris(seed: number): Debris[] {
  const rng = seeded(seed);
  const out: Debris[] = [];
  for (let i = 0; i < 8; i++) {
    out.push({
      yFrac: 0.35 + rng() * 0.55,
      speedMul: 0.7 + rng() * 0.6,
      size: 4 + rng() * 5,
      spin: 0.05 + rng() * 0.1,
      kind: rng() < 0.5 ? 0 : 1,
      phase: rng() * 1000,
    });
  }
  return out;
}

function buildClouds(seed: number): Cloud[] {
  const rng = seeded(seed);
  const out: Cloud[] = [];
  for (let i = 0; i < 7; i++) {
    out.push({
      yFrac: 0.05 + i * 0.05 + rng() * 0.02,
      widthFrac: 0.55 + rng() * 0.4,
      speedMul: 0.05 + rng() * 0.08,
      alpha: 0.18 + rng() * 0.18,
      phase: rng() * 1000,
      thickness: 18 + rng() * 22,
    });
  }
  return out;
}

function buildPoles(seed: number): Pole[] {
  const rng = seeded(seed);
  const out: Pole[] = [];
  // 5 poles fading toward horizon (perspective)
  for (let i = 0; i < 5; i++) {
    out.push({
      xFrac: 0.08 + i * 0.13 + rng() * 0.02,
      heightFrac: 0.06 + i * 0.012,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const WindWalker: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const { energy, beatDecay, bass, chromaHue, slowEnergy } = snap;

  /* -- Energy gate -- */
  const energyGate = interpolate(energy, [0.04, 0.14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = energyGate * 0.92;
  if (opacity < 0.01) return null;

  /* -- Layouts (memoized) -- */
  const streaks = React.useMemo(() => buildStreaks(82741), []);
  const dust = React.useMemo(() => buildDust(91333), []);
  const debris = React.useMemo(() => buildDebris(50217), []);
  const clouds = React.useMemo(() => buildClouds(31988), []);
  const poles = React.useMemo(() => buildPoles(60042), []);

  /* -- Wind speed: energy + tempo + bass gust factor -- */
  const baseWindSpeed = interpolate(energy, [0.04, 0.4], [2.5, 8.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const gustFactor =
    1 +
    interpolate(bass, [0.05, 0.45], [0, 1.4], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) +
    beatDecay * 0.5;
  const windSpeed = baseWindSpeed * gustFactor * tempoFactor;

  /* -- Streak count gating: more streaks at higher energy -- */
  const streakLimitFrac = interpolate(energy, [0.04, 0.35], [0.55, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const visibleStreakCount = Math.floor(streaks.length * streakLimitFrac);

  /* -- Sky color: slowEnergy mood + chromaHue tint -- */
  const moodLightness = interpolate(slowEnergy, [0.04, 0.22], [0.18, 0.32], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const skyHue = 200 + (chromaHue / 360) * 30 - 15; // dusty blue, +/-15
  const skySat = 0.18 + slowEnergy * 0.5;
  const skyTop = hslToRgba(skyHue - 8, skySat * 0.8, moodLightness * 0.7, 0.95);
  const skyMid = hslToRgba(skyHue, skySat, moodLightness, 0.95);
  const skyHorizon = hslToRgba(skyHue + 18, skySat * 0.6, moodLightness * 1.4, 0.95);

  /* -- Ground / road colors -- */
  const groundColor = hslToRgba(28, 0.22, 0.16, 0.95);
  const roadColor = hslToRgba(30, 0.15, 0.22, 0.95);

  /* -- Mountain silhouette color -- */
  const mountainColor = hslToRgba(skyHue - 10, 0.18, moodLightness * 0.55, 0.85);

  /* -- Horizon / ground positions -- */
  const horizonY = height * 0.62;
  const groundTop = horizonY;

  /* -- Figure: walks right -> left, looping -- */
  const walkCycleSec = 18; // full screen crossing
  const cycleFrames = walkCycleSec * 30 / Math.max(0.6, tempoFactor);
  const walkProgress = ((frame % cycleFrames) / cycleFrames);
  // start past right edge, exit past left
  const figureX = width * 1.15 - walkProgress * width * 1.35;
  const figureScale = Math.min(width, height) / 1080;
  const figureBaseY = height * 0.78;

  // Stride bob
  const strideHz = 1.3 * tempoFactor;
  const strideT = frame * strideHz * 0.05;
  const bob = Math.sin(strideT * Math.PI * 2) * 4 * figureScale;
  const figureY = figureBaseY + bob;

  // Lean angle (forward into wind = leans LEFT since walking left)
  const baseLean = -10; // degrees
  const gustLean = -interpolate(bass, [0.05, 0.4], [0, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const figureLean = baseLean + gustLean;

  /* -- Coat flap intensity -- */
  const coatFlap = 8 + windSpeed * 1.2 + beatDecay * 6;

  /* -- Hair wildness -- */
  const hairFlow = 6 + windSpeed * 0.8;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        opacity,
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="ww-sky" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="ww-ground" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={groundColor} stopOpacity={0.95} />
            <stop offset="100%" stopColor={hslToRgba(28, 0.18, 0.08, 0.95)} stopOpacity={1} />
          </linearGradient>
          <linearGradient id="ww-road" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={roadColor} />
            <stop offset="100%" stopColor={hslToRgba(28, 0.12, 0.32, 0.9)} />
          </linearGradient>
          <filter id="ww-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
          <filter id="ww-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
          <filter id="ww-motion" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6 0" />
          </filter>
        </defs>

        {/* Sky */}
        <rect x={0} y={0} width={width} height={horizonY + 2} fill="url(#ww-sky)" />

        {/* Stormy flowing cloud bands */}
        <g filter="url(#ww-soft)">
          {clouds.map((c, i) => {
            const cy = c.yFrac * horizonY;
            const drift = (frame * c.speedMul * windSpeed * 0.6 + c.phase) % (width * 1.6);
            const cx = width * 1.2 - drift;
            const w = c.widthFrac * width;
            return (
              <ellipse
                key={`cloud-${i}`}
                cx={cx}
                cy={cy}
                rx={w * 0.55}
                ry={c.thickness}
                fill={hslToRgba(skyHue + 10, 0.1, 0.55 + slowEnergy * 0.15, c.alpha)}
              />
            );
          })}
        </g>

        {/* Distant mountain silhouettes */}
        <g>
          <path
            d={`M 0 ${horizonY}
                L ${width * 0.07} ${horizonY - 22}
                L ${width * 0.13} ${horizonY - 12}
                L ${width * 0.20} ${horizonY - 36}
                L ${width * 0.27} ${horizonY - 20}
                L ${width * 0.34} ${horizonY - 44}
                L ${width * 0.42} ${horizonY - 18}
                L ${width * 0.50} ${horizonY - 30}
                L ${width * 0.58} ${horizonY - 14}
                L ${width * 0.66} ${horizonY - 38}
                L ${width * 0.74} ${horizonY - 22}
                L ${width * 0.82} ${horizonY - 32}
                L ${width * 0.90} ${horizonY - 16}
                L ${width} ${horizonY - 26}
                L ${width} ${horizonY}
                Z`}
            fill={mountainColor}
          />
          <path
            d={`M 0 ${horizonY}
                L ${width * 0.10} ${horizonY - 10}
                L ${width * 0.22} ${horizonY - 18}
                L ${width * 0.36} ${horizonY - 8}
                L ${width * 0.50} ${horizonY - 16}
                L ${width * 0.64} ${horizonY - 6}
                L ${width * 0.78} ${horizonY - 14}
                L ${width * 0.92} ${horizonY - 8}
                L ${width} ${horizonY - 12}
                L ${width} ${horizonY}
                Z`}
            fill={hslToRgba(skyHue - 5, 0.14, moodLightness * 0.4, 0.78)}
          />
        </g>

        {/* Background wide soft wind streaks (behind landscape but above sky) */}
        <g>
          {streaks.slice(0, visibleStreakCount).filter((s) => s.layer === 0).map((s, i) => {
            const y = s.yFrac * horizonY * 0.95;
            const drift = (frame * s.speedMul * windSpeed * 8 + s.phase) % (width * 1.5);
            const x = width * 1.2 - drift;
            const len = s.lengthFrac * width;
            return (
              <line
                key={`bg-streak-${i}`}
                x1={x}
                y1={y}
                x2={x + len}
                y2={y}
                stroke={hslToRgba(skyHue + 20, 0.1, 0.85, s.alpha)}
                strokeWidth={s.thickness}
                strokeLinecap="round"
                filter="url(#ww-soft)"
              />
            );
          })}
        </g>

        {/* Ground */}
        <rect x={0} y={groundTop} width={width} height={height - groundTop} fill="url(#ww-ground)" />

        {/* Road / path */}
        <path
          d={`M ${width * 0.12} ${horizonY + 0.5}
              L ${width * 0.88} ${horizonY + 0.5}
              L ${width * 0.98} ${height}
              L ${width * 0.02} ${height}
              Z`}
          fill="url(#ww-road)"
          opacity={0.85}
        />
        {/* Road center wear lines */}
        <line
          x1={width * 0.5}
          y1={horizonY + 2}
          x2={width * 0.5}
          y2={height}
          stroke={hslToRgba(40, 0.18, 0.32, 0.25)}
          strokeWidth={1.5}
          strokeDasharray="6 14"
        />

        {/* Telephone pole / fence line in distance */}
        <g>
          {poles.map((p, i) => {
            const px = p.xFrac * width;
            const ph = p.heightFrac * height;
            const py = horizonY - ph;
            const fade = 0.35 + i * 0.08;
            return (
              <g key={`pole-${i}`} opacity={fade}>
                <line
                  x1={px}
                  y1={py}
                  x2={px}
                  y2={horizonY}
                  stroke={hslToRgba(25, 0.22, 0.18, 0.9)}
                  strokeWidth={1.4}
                />
                {/* Crossbar */}
                <line
                  x1={px - 6}
                  y1={py + 4}
                  x2={px + 6}
                  y2={py + 4}
                  stroke={hslToRgba(25, 0.22, 0.18, 0.9)}
                  strokeWidth={1}
                />
                {/* Sagging wire to next pole */}
                {i < poles.length - 1 && (
                  <path
                    d={`M ${px} ${py + 4} Q ${(px + poles[i + 1].xFrac * width) / 2} ${py + 14} ${poles[i + 1].xFrac * width} ${horizonY - poles[i + 1].heightFrac * height + 4}`}
                    fill="none"
                    stroke={hslToRgba(20, 0.2, 0.15, 0.7)}
                    strokeWidth={0.8}
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* Sparse vegetation: dry grass tufts */}
        <g>
          {Array.from({ length: 22 }).map((_, i) => {
            const rng = seeded(7000 + i);
            const gx = rng() * width;
            const gy = horizonY + 8 + rng() * (height - horizonY - 12);
            const gh = 4 + rng() * 7;
            const sway = Math.sin(frame * 0.06 + i * 0.7) * (1 + windSpeed * 0.3);
            return (
              <g key={`grass-${i}`} opacity={0.6}>
                <line x1={gx} y1={gy} x2={gx + sway} y2={gy - gh} stroke={hslToRgba(40, 0.3, 0.35, 0.6)} strokeWidth={0.8} />
                <line x1={gx + 2} y1={gy} x2={gx + 2 + sway * 0.8} y2={gy - gh * 0.8} stroke={hslToRgba(38, 0.28, 0.32, 0.55)} strokeWidth={0.7} />
                <line x1={gx - 2} y1={gy} x2={gx - 2 + sway * 0.9} y2={gy - gh * 0.9} stroke={hslToRgba(42, 0.32, 0.38, 0.55)} strokeWidth={0.7} />
              </g>
            );
          })}
        </g>

        {/* Lone bent tree */}
        <g transform={`translate(${width * 0.08} ${horizonY - 4})`}>
          <path
            d={`M 0 0
                Q ${-6 - windSpeed * 0.8} -22 ${-14 - windSpeed * 1.5} -42
                Q ${-22 - windSpeed * 1.8} -56 ${-30 - windSpeed * 2.2} -64`}
            fill="none"
            stroke={hslToRgba(20, 0.4, 0.12, 0.9)}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          {/* Small branch tufts trailing in the wind */}
          <ellipse cx={-26 - windSpeed * 1.8} cy={-58} rx={6} ry={2} fill={hslToRgba(30, 0.3, 0.18, 0.6)} />
          <ellipse cx={-32 - windSpeed * 2.0} cy={-62} rx={5} ry={1.6} fill={hslToRgba(32, 0.3, 0.2, 0.55)} />
          <ellipse cx={-22 - windSpeed * 1.5} cy={-50} rx={5} ry={1.8} fill={hslToRgba(28, 0.3, 0.16, 0.55)} />
        </g>

        {/* Mid-layer wind streaks (between landscape and figure) */}
        <g>
          {streaks.slice(0, visibleStreakCount).filter((s) => s.layer === 1).map((s, i) => {
            const y = s.yFrac * height;
            const drift = (frame * s.speedMul * windSpeed * 14 + s.phase) % (width * 1.5);
            const x = width * 1.2 - drift;
            const len = s.lengthFrac * width;
            return (
              <line
                key={`mid-streak-${i}`}
                x1={x}
                y1={y}
                x2={x + len}
                y2={y}
                stroke={hslToRgba(skyHue + 30, 0.1, 0.92, s.alpha)}
                strokeWidth={s.thickness}
                strokeLinecap="round"
                filter="url(#ww-blur)"
              />
            );
          })}
        </g>

        {/* Tumbling debris (leaves / paper scraps) */}
        <g>
          {debris.map((d, i) => {
            const drift = (frame * d.speedMul * windSpeed * 18 + d.phase) % (width * 1.4);
            const x = width * 1.2 - drift;
            const yBob = Math.sin(frame * 0.08 + d.phase) * 12;
            const y = d.yFrac * height + yBob;
            const rot = (frame * d.spin * 60) % 360;
            const color = d.kind === 0
              ? hslToRgba(35, 0.6, 0.4, 0.8) // leaf brown
              : hslToRgba(45, 0.15, 0.85, 0.85); // paper off-white
            return (
              <g key={`debris-${i}`} transform={`translate(${x} ${y}) rotate(${rot})`}>
                {d.kind === 0 ? (
                  <ellipse cx={0} cy={0} rx={d.size} ry={d.size * 0.4} fill={color} />
                ) : (
                  <rect x={-d.size} y={-d.size * 0.6} width={d.size * 2} height={d.size * 1.2} fill={color} opacity={0.85} />
                )}
              </g>
            );
          })}
        </g>

        {/* The lone figure — silhouette walking right -> left, leaning forward */}
        <g transform={`translate(${figureX} ${figureY}) scale(${figureScale}) rotate(${figureLean})`}>
          {/* Long coat flapping behind (to the right since walking left) */}
          <path
            d={`M 6 -12
                Q ${22 + coatFlap * 0.6} ${-6 - coatFlap * 0.2} ${36 + coatFlap} ${4 + coatFlap * 0.4}
                Q ${50 + coatFlap * 1.2} ${30 + coatFlap * 0.5} ${42 + coatFlap * 0.9} 60
                Q ${28 + coatFlap * 0.5} 80 14 70
                Q 4 50 2 20
                Z`}
            fill="rgba(15,15,18,0.92)"
            stroke="rgba(0,0,0,0.95)"
            strokeWidth={1}
          />
          {/* Coat trailing tatters / extra flap edges */}
          <path
            d={`M ${36 + coatFlap} ${4 + coatFlap * 0.4}
                Q ${52 + coatFlap * 1.4} ${14 + coatFlap * 0.3} ${48 + coatFlap * 1.2} ${28 + coatFlap * 0.4}`}
            fill="none"
            stroke="rgba(10,10,12,0.85)"
            strokeWidth={2}
          />
          <path
            d={`M ${42 + coatFlap * 0.9} 60
                Q ${56 + coatFlap * 1.3} 56 ${60 + coatFlap * 1.4} 40`}
            fill="none"
            stroke="rgba(10,10,12,0.7)"
            strokeWidth={1.5}
          />

          {/* Back leg (further from us — slightly behind) */}
          <path
            d={`M -2 70
                Q -6 95 ${-10 + Math.sin(strideT * Math.PI * 2 + Math.PI) * 6} 124`}
            fill="none"
            stroke="rgba(8,8,10,0.95)"
            strokeWidth={7}
            strokeLinecap="round"
          />
          {/* Front leg (stride pose, planted forward — to the LEFT) */}
          <path
            d={`M -4 70
                Q ${-12 + Math.sin(strideT * Math.PI * 2) * 4} 96 ${-22 + Math.sin(strideT * Math.PI * 2) * 8} 124`}
            fill="none"
            stroke="rgba(5,5,8,0.98)"
            strokeWidth={7.5}
            strokeLinecap="round"
          />
          {/* Boots */}
          <ellipse cx={-22 + Math.sin(strideT * Math.PI * 2) * 8} cy={126} rx={9} ry={3} fill="rgba(2,2,4,0.98)" />
          <ellipse cx={-10 + Math.sin(strideT * Math.PI * 2 + Math.PI) * 6} cy={126} rx={8} ry={2.6} fill="rgba(2,2,4,0.95)" />

          {/* Torso */}
          <path
            d={`M -8 -10
                L 10 -8
                L 14 60
                L -12 62
                Z`}
            fill="rgba(8,8,11,0.97)"
          />

          {/* Back arm (carrying satchel/guitar case) — extends down and slightly back-right */}
          <path
            d={`M 8 -4
                Q 16 14 18 32`}
            fill="none"
            stroke="rgba(8,8,11,0.96)"
            strokeWidth={6}
            strokeLinecap="round"
          />
          {/* Guitar case in back hand (rectangular, hanging) */}
          <g transform={`translate(18 32) rotate(${4 + Math.sin(frame * 0.05) * 2})`}>
            <rect x={-6} y={0} width={12} height={42} rx={3} fill="rgba(20,14,8,0.95)" stroke="rgba(0,0,0,0.95)" strokeWidth={1.2} />
            {/* Case handle */}
            <path d="M -3 -1 Q 0 -5 3 -1" fill="none" stroke="rgba(35,25,15,0.95)" strokeWidth={1.6} strokeLinecap="round" />
            {/* Case clasp */}
            <rect x={-2} y={18} width={4} height={2} fill="rgba(140,110,60,0.85)" />
          </g>

          {/* Front arm (holding hat down) — reaches up to head */}
          <path
            d={`M -6 -8
                Q -16 -22 -22 -36`}
            fill="none"
            stroke="rgba(6,6,9,0.98)"
            strokeWidth={6}
            strokeLinecap="round"
          />

          {/* Neck */}
          <rect x={-3} y={-22} width={6} height={10} fill="rgba(8,8,11,0.96)" />

          {/* Head */}
          <ellipse cx={0} cy={-30} rx={9} ry={11} fill="rgba(8,8,11,0.98)" />

          {/* Hair flowing wildly behind (to the right since walking left) */}
          <g>
            <path
              d={`M 6 -34
                  Q ${14 + hairFlow * 0.5} -36 ${22 + hairFlow} -32
                  Q ${28 + hairFlow * 1.2} -28 ${30 + hairFlow * 1.3} -22`}
              fill="none"
              stroke="rgba(8,8,11,0.95)"
              strokeWidth={2.2}
              strokeLinecap="round"
            />
            <path
              d={`M 5 -30
                  Q ${16 + hairFlow * 0.6} -30 ${26 + hairFlow * 1.1} -24`}
              fill="none"
              stroke="rgba(10,10,13,0.85)"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <path
              d={`M 5 -26
                  Q ${18 + hairFlow * 0.7} -22 ${28 + hairFlow * 1.2} -16`}
              fill="none"
              stroke="rgba(10,10,13,0.8)"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <path
              d={`M 6 -36
                  Q ${18 + hairFlow * 0.5} -42 ${28 + hairFlow * 0.9} -38`}
              fill="none"
              stroke="rgba(8,8,11,0.78)"
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          </g>

          {/* Wide-brim cowboy hat (held down by front arm) */}
          <g transform={`translate(0 -38) rotate(-4)`}>
            {/* Brim */}
            <ellipse cx={0} cy={2} rx={20} ry={3.5} fill="rgba(5,5,8,0.98)" />
            <ellipse cx={0} cy={1} rx={20} ry={1.2} fill="rgba(15,15,18,0.6)" />
            {/* Crown */}
            <path
              d={`M -10 1
                  Q -11 -10 -7 -13
                  L 7 -13
                  Q 11 -10 10 1
                  Z`}
              fill="rgba(4,4,7,0.99)"
            />
            {/* Hat band */}
            <line x1={-10} y1={-2} x2={10} y2={-2} stroke="rgba(40,28,12,0.6)" strokeWidth={1.2} />
            {/* Crown crease */}
            <line x1={0} y1={-12} x2={0} y2={-2} stroke="rgba(20,18,22,0.6)" strokeWidth={0.8} />
          </g>
        </g>

        {/* Foreground fast thin streaks (over the figure for motion-blur feeling) */}
        <g>
          {streaks.slice(0, visibleStreakCount).filter((s) => s.layer === 2).map((s, i) => {
            const y = s.yFrac * height;
            const drift = (frame * s.speedMul * windSpeed * 22 + s.phase) % (width * 1.5);
            const x = width * 1.2 - drift;
            const len = s.lengthFrac * width;
            return (
              <line
                key={`fg-streak-${i}`}
                x1={x}
                y1={y}
                x2={x + len}
                y2={y}
                stroke={hslToRgba(skyHue + 40, 0.05, 0.96, s.alpha)}
                strokeWidth={s.thickness}
                strokeLinecap="round"
              />
            );
          })}
        </g>

        {/* Dust motes blowing through */}
        <g>
          {dust.map((d, i) => {
            const drift = (frame * d.speedMul * windSpeed * 16 + d.phase) % (width * 1.4);
            const x = width * 1.2 - drift;
            const bobY = Math.sin(frame * 0.07 + d.phase) * d.bobAmp;
            const y = d.yFrac * height + bobY;
            return (
              <circle
                key={`dust-${i}`}
                cx={x}
                cy={y}
                r={d.size}
                fill={hslToRgba(40, 0.2, 0.85, d.alpha)}
              />
            );
          })}
        </g>

        {/* Subtle horizontal motion-blur overlay band across the screen */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={hslToRgba(skyHue + 10, 0.05, 0.4, 0.04 + beatDecay * 0.12)}
        />
      </svg>
    </div>
  );
};
