/**
 * TouchOfGrey — A+++ sophisticated grey study for the Dead's lone Top 40 hit.
 *
 * A foggy bridge silhouette emerging from layered grey atmosphere — distant
 * city skyline at dawn, tall suspension bridge cables, mist rolling across
 * the water, lampposts with warm pinpoint glows, gulls wheeling above.
 * Multiple shades of grey from charcoal to silver, with subtle warm/cool
 * tints. The hit is cinematic restraint — black, white, and every shade
 * between. "We will get by, we will survive."
 *
 * Audio reactivity:
 *   slowEnergy   → fog density / horizon brightness
 *   energy       → lamppost halo intensity
 *   bass         → bridge sway
 *   beatDecay    → lamp pulse
 *   onsetEnvelope→ lighthouse beacon flare
 *   chromaHue    → subtle warm/cool grey shift
 *   tempoFactor  → gull drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

interface FogBand {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  drift: number;
  shade: number;
}

interface Gull {
  cx: number;
  cy: number;
  radius: number;
  speed: number;
  size: number;
  phase: number;
}

interface BuildingSpec {
  x: number;
  w: number;
  h: number;
  shade: number;
  windowRows: number;
  hasAntenna: boolean;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const TouchOfGrey: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const fogBands = React.useMemo<FogBand[]>(() => {
    const rng = seeded(89_113_445);
    return Array.from({ length: 14 }, () => ({
      cx: rng(),
      cy: 0.45 + rng() * 0.35,
      rx: 0.20 + rng() * 0.30,
      ry: 0.04 + rng() * 0.06,
      drift: 0.00008 + rng() * 0.0002,
      shade: 0.45 + rng() * 0.45,
    }));
  }, []);

  const gulls = React.useMemo<Gull[]>(() => {
    const rng = seeded(11_447_995);
    return Array.from({ length: 9 }, () => ({
      cx: 0.1 + rng() * 0.8,
      cy: 0.18 + rng() * 0.20,
      radius: 0.04 + rng() * 0.06,
      speed: 0.0014 + rng() * 0.002,
      size: 4 + rng() * 4,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const cityBuildings = React.useMemo<BuildingSpec[]>(() => {
    const rng = seeded(72_001_113);
    const out: BuildingSpec[] = [];
    let x = 0.04;
    let i = 0;
    while (x < 0.96) {
      const w = 0.025 + rng() * 0.04;
      out.push({
        x,
        w,
        h: 0.06 + rng() * 0.14,
        shade: 0.20 + rng() * 0.20,
        windowRows: 3 + Math.floor(rng() * 6),
        hasAntenna: i % 5 === 0,
      });
      x += w + 0.005;
      i++;
    }
    return out;
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

  const fogDensity = 0.6 + slowEnergy * 0.4;
  const lampHalo = 0.5 + energy * 0.5 + beatDecay * 0.3;
  const bridgeSway = bass * 1.2;

  /* Subtle warm/cool grey shift via chromaHue */
  const tintShift = (chromaHue - 180) * 0.10;
  const warmCool = tintShift; // -18 to +18
  const greyHue = ((30 + warmCool) % 360 + 360) % 360;

  function grey(level: number, alpha: number = 1, hueOffset = 0): string {
    const h = (greyHue + hueOffset + 360) % 360;
    return `hsla(${h}, 8%, ${level}%, ${alpha})`;
  }

  const skyTop = grey(8, 1, -10);
  const skyMid = grey(22, 1);
  const skyHorizon = grey(58, 1, 10);
  const skyBottom = grey(72, 1, 12);

  const cx = width * 0.5;
  const horizonY = height * 0.62;

  /* Fog nodes */
  const fogNodes = fogBands.map((f, i) => {
    const cxN = ((f.cx + frame * f.drift * tempoFactor) % 1.2) - 0.1;
    return (
      <ellipse
        key={`fog-${i}`}
        cx={cxN * width}
        cy={f.cy * height}
        rx={f.rx * width}
        ry={f.ry * height}
        fill={grey(75 + f.shade * 15, 0.45 * fogDensity)}
      />
    );
  });

  const gullNodes = gulls.map((g, i) => {
    const t = frame * g.speed * tempoFactor + g.phase;
    const gx = g.cx * width + Math.cos(t) * g.radius * width;
    const gy = g.cy * height + Math.sin(t * 1.2) * g.radius * height * 0.5;
    const flap = Math.sin(frame * 0.15 + i * 0.7) * 3;
    return (
      <path
        key={`gull-${i}`}
        d={`M ${gx - g.size} ${gy + flap}
            Q ${gx - g.size * 0.4} ${gy - g.size * 0.5 - flap} ${gx} ${gy}
            Q ${gx + g.size * 0.4} ${gy - g.size * 0.5 - flap} ${gx + g.size} ${gy + flap}`}
        fill="none"
        stroke={grey(20, 0.85)}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    );
  });

  /* Bridge geometry — dual towers with main suspension cables and verticals */
  const bridgeBaseY = height * 0.74;
  const bridgeDeckY = height * 0.78;
  const towerLX = width * 0.30;
  const towerRX = width * 0.70;
  const towerH = height * 0.45;
  const towerTopY = bridgeDeckY - towerH;
  const sway = Math.sin(frame * 0.018) * bridgeSway;

  /* Main cable parabolic curve (catenary approximation) */
  const cablePath = `M ${0} ${bridgeDeckY - 6}
                     Q ${towerLX} ${bridgeDeckY - 12} ${towerLX} ${towerTopY + 12}
                     L ${towerLX} ${towerTopY + 12}
                     Q ${cx} ${bridgeDeckY - height * 0.38} ${towerRX} ${towerTopY + 12}
                     Q ${towerRX} ${bridgeDeckY - 12} ${width} ${bridgeDeckY - 6}`;

  /* Vertical suspender cables (every X distance) */
  const suspenders: React.ReactNode[] = [];
  const numSusp = 26;
  for (let i = 0; i < numSusp; i++) {
    const t = i / (numSusp - 1);
    const sx = towerLX + t * (towerRX - towerLX);
    // Catenary y at this x
    const tt = (sx - towerLX) / (towerRX - towerLX);
    const cableY = (towerTopY + 12) + Math.sin(tt * Math.PI) * (height * 0.30);
    suspenders.push(
      <line
        key={`susp-${i}`}
        x1={sx + sway * 0.2}
        y1={cableY}
        x2={sx}
        y2={bridgeDeckY}
        stroke={grey(18, 0.75)}
        strokeWidth={1}
      />,
    );
  }

  /* Lampposts */
  const lampNodes: React.ReactNode[] = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const lx = width * 0.04 + t * width * 0.92;
    const ly = bridgeDeckY - 6;
    const inLightShaft = Math.abs(lx - cx) < width * 0.4;
    const halo = (inLightShaft ? 1 : 0.65) * lampHalo;
    lampNodes.push(
      <g key={`lamp-${i}`}>
        {/* Pole */}
        <line x1={lx} y1={ly} x2={lx} y2={ly - 22} stroke={grey(15, 0.95)} strokeWidth={1.4} />
        <line x1={lx} y1={ly - 22} x2={lx + 4} y2={ly - 24} stroke={grey(15, 0.95)} strokeWidth={1.2} />
        {/* Lamp head */}
        <circle cx={lx + 4} cy={ly - 24} r={2.2} fill={grey(20, 0.95)} stroke={grey(8, 0.95)} strokeWidth={0.5} />
        {/* Halo (3-layer warm pinpoint) */}
        <circle cx={lx + 4} cy={ly - 24} r={14 * halo} fill="hsla(40, 70%, 80%, 0.18)" />
        <circle cx={lx + 4} cy={ly - 24} r={6 * halo} fill="hsla(40, 80%, 85%, 0.4)" />
        <circle cx={lx + 4} cy={ly - 24} r={2 * halo} fill="hsla(45, 90%, 92%, 0.85)" />
      </g>,
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="tg-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="40%" stopColor={skyMid} />
            <stop offset="78%" stopColor={skyHorizon} />
            <stop offset="100%" stopColor={skyBottom} />
          </linearGradient>
          <linearGradient id="tg-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={grey(45, 1)} />
            <stop offset="100%" stopColor={grey(15, 1)} />
          </linearGradient>
          <linearGradient id="tg-tower" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={grey(28, 1)} />
            <stop offset="100%" stopColor={grey(12, 1)} />
          </linearGradient>
          <radialGradient id="tg-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={grey(95, 0.92)} />
            <stop offset="60%" stopColor={grey(75, 0.4)} />
            <stop offset="100%" stopColor={grey(50, 0)} />
          </radialGradient>
          <filter id="tg-blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* SKY */}
        <rect width={width} height={height} fill="url(#tg-sky)" />

        {/* HAZY SUN */}
        <circle cx={cx} cy={horizonY - 20} r={Math.min(width, height) * 0.10 * 4} fill="url(#tg-sun)" />
        <circle cx={cx} cy={horizonY - 20} r={Math.min(width, height) * 0.05} fill={grey(92, 0.85)} />

        {/* CITY SKYLINE BACK */}
        {cityBuildings.map((b, i) => (
          <g key={`city-${i}`}>
            <rect
              x={b.x * width}
              y={horizonY - b.h * height}
              width={b.w * width}
              height={b.h * height}
              fill={grey(b.shade * 100, 0.95)}
              stroke="rgba(0,0,0,0.5)"
              strokeWidth={0.4}
            />
            {/* Building windows */}
            {Array.from({ length: b.windowRows }, (_, k) => {
              const winY = horizonY - b.h * height + 4 + k * (b.h * height / b.windowRows);
              return (
                <g key={`bw-${i}-${k}`}>
                  <rect
                    x={b.x * width + b.w * width * 0.18}
                    y={winY}
                    width={b.w * width * 0.20}
                    height={2}
                    fill="hsla(45, 70%, 70%, 0.45)"
                  />
                  <rect
                    x={b.x * width + b.w * width * 0.55}
                    y={winY}
                    width={b.w * width * 0.20}
                    height={2}
                    fill="hsla(45, 70%, 70%, 0.45)"
                  />
                </g>
              );
            })}
            {/* Antenna */}
            {b.hasAntenna && (
              <line
                x1={b.x * width + b.w * width * 0.5}
                y1={horizonY - b.h * height}
                x2={b.x * width + b.w * width * 0.5}
                y2={horizonY - b.h * height - 14}
                stroke={grey(8, 0.95)}
                strokeWidth={0.8}
              />
            )}
          </g>
        ))}

        {/* GULLS in distance */}
        {gullNodes}

        {/* WATER */}
        <rect x={0} y={horizonY + 4} width={width} height={height - horizonY - 4} fill="url(#tg-water)" />
        {/* Water reflections */}
        {Array.from({ length: 22 }, (_, i) => {
          const t = i / 21;
          const wy = horizonY + 6 + t * (height - horizonY - 6);
          return (
            <line
              key={`wr-${i}`}
              x1={0}
              y1={wy}
              x2={width}
              y2={wy + Math.sin(i * 0.7 + frame * 0.02) * 1.5}
              stroke={grey(60 - t * 30, 0.18)}
              strokeWidth={0.6}
            />
          );
        })}

        {/* Distant city reflection on water (inverted, faded) */}
        {cityBuildings.slice(0, 16).map((b, i) => (
          <rect
            key={`refl-${i}`}
            x={b.x * width}
            y={horizonY + 4}
            width={b.w * width}
            height={b.h * height * 0.4}
            fill={grey(b.shade * 80, 0.35)}
          />
        ))}

        {/* FOG BANDS BACK */}
        <g filter="url(#tg-blur)">{fogNodes.slice(0, 7)}</g>

        {/* === BRIDGE === */}
        <g transform={`translate(${sway}, 0)`}>
          {/* Tower L */}
          <rect x={towerLX - 12} y={towerTopY} width={24} height={towerH} fill="url(#tg-tower)" stroke="rgba(0,0,0,0.85)" strokeWidth={1.4} />
          {/* Tower L horizontal cross-bracing */}
          {[0.25, 0.45, 0.65, 0.85].map((t, k) => (
            <rect
              key={`tlx-${k}`}
              x={towerLX - 14}
              y={towerTopY + t * towerH}
              width={28}
              height={5}
              fill="rgba(20, 18, 16, 0.95)"
            />
          ))}
          {/* Tower L flag/light at top */}
          <circle cx={towerLX} cy={towerTopY - 4} r={2.5} fill="hsla(0, 80%, 60%, 0.85)" />
          <circle cx={towerLX} cy={towerTopY - 4} r={6} fill="hsla(0, 80%, 60%, 0.35)" filter="url(#tg-blur)" />

          {/* Tower R */}
          <rect x={towerRX - 12} y={towerTopY} width={24} height={towerH} fill="url(#tg-tower)" stroke="rgba(0,0,0,0.85)" strokeWidth={1.4} />
          {[0.25, 0.45, 0.65, 0.85].map((t, k) => (
            <rect
              key={`trx-${k}`}
              x={towerRX - 14}
              y={towerTopY + t * towerH}
              width={28}
              height={5}
              fill="rgba(20, 18, 16, 0.95)"
            />
          ))}
          <circle cx={towerRX} cy={towerTopY - 4} r={2.5} fill="hsla(0, 80%, 60%, 0.85)" />
          <circle cx={towerRX} cy={towerTopY - 4} r={6} fill="hsla(0, 80%, 60%, 0.35)" filter="url(#tg-blur)" />

          {/* Main suspension cable */}
          <path d={cablePath} fill="none" stroke={grey(15, 0.95)} strokeWidth={2.5} />
          {/* Cable highlight */}
          <path d={cablePath} fill="none" stroke={grey(60, 0.45)} strokeWidth={0.8} />

          {/* Suspender verticals */}
          {suspenders}

          {/* Bridge deck */}
          <rect x={0} y={bridgeDeckY} width={width} height={8} fill={grey(25, 0.95)} stroke="rgba(0,0,0,0.95)" strokeWidth={1} />
          <rect x={0} y={bridgeDeckY + 8} width={width} height={4} fill={grey(15, 0.95)} />
          {/* Deck stripes */}
          {Array.from({ length: 30 }, (_, i) => {
            const dx = (i / 29) * width;
            return (
              <rect
                key={`stripe-${i}`}
                x={dx}
                y={bridgeDeckY + 3}
                width={6}
                height={1.5}
                fill="hsla(45, 80%, 75%, 0.7)"
              />
            );
          })}

          {/* Lampposts */}
          {lampNodes}
        </g>

        {/* FOG BANDS FRONT */}
        <g filter="url(#tg-blur)">{fogNodes.slice(7)}</g>

        {/* DENSE FOG WASH OVER WATER */}
        <rect
          x={0}
          y={bridgeDeckY + 12}
          width={width}
          height={height * 0.10}
          fill={grey(80, 0.35 * fogDensity)}
          filter="url(#tg-blur)"
        />

        {/* LIGHTHOUSE BEACON in distance */}
        <g style={{ mixBlendMode: "screen" }}>
          <circle
            cx={width * 0.86}
            cy={horizonY - 12}
            r={6 + onsetEnv * 14}
            fill="hsla(45, 90%, 80%, 0.85)"
          />
          <circle
            cx={width * 0.86}
            cy={horizonY - 12}
            r={20 + onsetEnv * 28}
            fill="hsla(45, 80%, 70%, 0.30)"
            filter="url(#tg-blur)"
          />
        </g>

        {/* SUBTLE GREY GRAIN OVERLAY */}
        {Array.from({ length: 30 }, (_, i) => {
          const rng = ((i * 0.137 + 0.31) * 7919) % 1;
          const gx = (i * 137) % width;
          const gy = (i * 211) % height;
          return (
            <circle
              key={`grain-${i}`}
              cx={gx}
              cy={gy}
              r={0.6}
              fill={grey(rng > 0.5 ? 80 : 20, 0.18)}
            />
          );
        })}

        {/* TINT WASH (subtle) */}
        <rect width={width} height={height} fill={grey(50, 0.04 + slowEnergy * 0.04, warmCool * 2)} />

        {/* VIGNETTE */}
        <radialGradient id="tg-vign" cx="50%" cy="55%" r="70%">
          <stop offset="50%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.6)" />
        </radialGradient>
        <rect width={width} height={height} fill="url(#tg-vign)" />
      </svg>
    </div>
  );
};
