/**
 * Fireflies -- A+++ bioluminescent overlay.
 *
 * 55 fireflies across 3 depth layers (far/mid/close), each with:
 *   - 3-layer rendering: outer soft halo, mid warm glow, bright tiny core
 *   - Lissajous-like organic drift (dual sine X/Y at unique frequencies)
 *   - Duty-cycle blink: on for 0.5-2s, off for 1-4s (not a sine wave)
 *   - Faint motion trail streaks for fast-moving fireflies
 *   - Warm yellow-green bioluminescent color with per-firefly variation
 *
 * Audio behavior (fireflies are shy):
 *   - energy INVERSELY drives visibility (quiet = more fireflies, brighter)
 *   - slowEnergy breathes the glow radius
 *   - beatDecay subtly syncs blink phase for nearest fireflies
 *   - chromaHue shifts the yellow-green palette slightly
 *   - tempoFactor drives drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ---------- constants ---------- */

const NUM_FIREFLIES = 55;
const STAGGER_START = 90;
const STAGGER_WINDOW = 150;

/** Depth layers: far (small/dim/slow), mid, close (large/bright/fast) */
const DEPTH_LAYERS = [
  { count: 20, rMin: 1.2, rMax: 2.0, bMin: 0.30, bMax: 0.55, speed: 0.55, glow: 0.6, trail: 999 },
  { count: 20, rMin: 2.0, rMax: 3.5, bMin: 0.50, bMax: 0.80, speed: 0.85, glow: 1.0, trail: 1.8 },
  { count: 15, rMin: 3.0, rMax: 5.0, bMin: 0.70, bMax: 1.00, speed: 1.30, glow: 1.5, trail: 1.2 },
] as const;

/* ---------- data types ---------- */

interface FireflyData {
  x: number; y: number;
  freqX1: number; freqX2: number; freqY1: number; freqY2: number;
  ampX1: number; ampX2: number; ampY1: number; ampY2: number;
  phaseX: number; phaseY: number;
  driftX: number; driftY: number;
  blinkOn: number; blinkOff: number; blinkPhase: number;
  radius: number; brightness: number;
  hue: number; hueSat: number;
  layer: number; speedMul: number; glowMul: number; trailThresh: number;
}

/* ---------- generation ---------- */

function generateFireflies(seed: number): FireflyData[] {
  const rng = seeded(seed);
  const flies: FireflyData[] = [];

  for (let li = 0; li < DEPTH_LAYERS.length; li++) {
    const L = DEPTH_LAYERS[li];
    for (let j = 0; j < L.count; j++) {
      flies.push({
        x: rng(), y: rng(),
        freqX1: 0.003 + rng() * 0.008, freqX2: 0.001 + rng() * 0.004,
        freqY1: 0.002 + rng() * 0.007, freqY2: 0.0008 + rng() * 0.003,
        ampX1: 18 + rng() * 45, ampX2: 8 + rng() * 25,
        ampY1: 15 + rng() * 40, ampY2: 6 + rng() * 20,
        phaseX: rng() * Math.PI * 2, phaseY: rng() * Math.PI * 2,
        driftX: (rng() - 0.5) * 0.12 * L.speed,
        driftY: (rng() - 0.5) * 0.10 * L.speed,
        blinkOn: 15 + Math.floor(rng() * 45),   // 0.5-2s
        blinkOff: 30 + Math.floor(rng() * 90),  // 1-4s
        blinkPhase: Math.floor(rng() * 300),
        radius: L.rMin + rng() * (L.rMax - L.rMin),
        brightness: L.bMin + rng() * (L.bMax - L.bMin),
        hue: 58 + rng() * 42,     // 58-100: warm yellow through yellow-green
        hueSat: 75 + rng() * 20,  // 75-95%
        layer: li, speedMul: L.speed, glowMul: L.glow, trailThresh: L.trail,
      });
    }
  }
  return flies;
}

/* ---------- lissajous raw position (unwrapped) ---------- */

function rawPos(f: number, fly: FireflyData, w: number, h: number, tm: number) {
  const tf = f * tm * fly.speedMul;
  const sx = Math.sin(tf * fly.freqX1 + fly.phaseX) * fly.ampX1
           + Math.sin(tf * fly.freqX2 + fly.phaseX * 1.7) * fly.ampX2;
  const sy = Math.cos(tf * fly.freqY1 + fly.phaseY) * fly.ampY1
           + Math.cos(tf * fly.freqY2 + fly.phaseY * 0.6) * fly.ampY2;
  return {
    x: fly.x * w + sx + f * fly.driftX * tm,
    y: fly.y * h + sy + f * fly.driftY * tm,
  };
}

/** Position (wrapped) + speed + trail angle */
function computePosition(frame: number, fly: FireflyData, w: number, h: number, tm: number) {
  const cur = rawPos(frame, fly, w, h, tm);
  const prev = rawPos(frame - 1, fly, w, h, tm);
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  return {
    x: ((cur.x % w) + w) % w,
    y: ((cur.y % h) + h) % h,
    speed: Math.sqrt(dx * dx + dy * dy),
    angle: Math.atan2(dy, dx),
  };
}

/* ---------- duty-cycle blink ---------- */

function computeBlink(frame: number, fly: FireflyData): number {
  const cycle = fly.blinkOn + fly.blinkOff;
  const t = ((frame + fly.blinkPhase) % cycle + cycle) % cycle;
  if (t >= fly.blinkOn) return 0;

  const onT = t / fly.blinkOn;
  if (onT < 0.15) {
    const p = onT / 0.15;
    return p * p * (3 - 2 * p);
  } else if (onT > 0.75) {
    const p = (onT - 0.75) / 0.25;
    const inv = 1 - p;
    return inv * inv * (3 - 2 * inv);
  }
  return 1;
}

/* ---------- component ---------- */

interface Props { frames: EnhancedFrameData[] }

export const Fireflies: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();
  const audio = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const fireflies = React.useMemo(
    () => generateFireflies(ctx?.showSeed ?? 19770508),
    [ctx?.showSeed],
  );

  /* ----- audio-derived values ----- */

  const quietness = 1 - interpolate(audio.energy, [0.03, 0.25], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const breathe = interpolate(audio.slowEnergy, [0.02, 0.18], [0.7, 1.3], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const beatSync = interpolate(audio.beatDecay, [0, 1], [0, 0.25], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const hueShift = interpolate(audio.chromaHue, [0, 360], [-12, 12], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const tempoMul = interpolate(tempoFactor, [0.5, 1.5], [0.65, 1.4], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  /* ----- master fade ----- */
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 120], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const masterOpacity = interpolate(quietness, [0, 1], [0.10, 0.70], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  }) * masterFade;

  if (masterOpacity < 0.01) return null;

  const activeCount = Math.floor(
    interpolate(quietness, [0, 1], [12, NUM_FIREFLIES], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    }),
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {fireflies.slice(0, activeCount).map((fly, i) => {
          /* staggered entrance */
          const delay = STAGGER_START + (i / NUM_FIREFLIES) * STAGGER_WINDOW;
          const flyFade = interpolate(frame, [delay, delay + 60], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          if (flyFade < 0.01) return null;

          /* ----- position ----- */
          const pos = computePosition(frame, fly, width, height, tempoMul);

          /* ----- blink ----- */
          let blink = computeBlink(frame, fly);

          // Beat sync: close fireflies get subtle pulse from beatDecay
          if (fly.layer === 2) {
            const s = beatSync;
            blink = blink * (1 - s) + blink * (0.5 + audio.beatDecay * 0.5) * s;
          } else if (fly.layer === 1) {
            const s = beatSync * 0.5;
            blink = blink * (1 - s) + blink * (0.5 + audio.beatDecay * 0.5) * s;
          }
          blink = Math.min(1, Math.max(0, blink));

          const alpha = blink * fly.brightness * flyFade;
          if (alpha < 0.015) return null;

          /* ----- sizing ----- */
          const r = fly.radius * (0.75 + blink * 0.5) * breathe;
          const glowR = r * fly.glowMul;

          /* ----- color ----- */
          const hue = fly.hue + hueShift;
          const sat = fly.hueSat;
          const coreL = 78 + blink * 12;
          const midL = 62 + blink * 8;
          const haloL = 50 + blink * 5;

          const coreColor = `hsla(${hue},${sat}%,${coreL}%,${alpha})`;
          const midColor = `hsla(${hue},${sat + 5}%,${midL}%,${alpha * 0.65})`;
          const haloColor = `hsla(${hue},${sat + 8}%,${haloL}%,${alpha * 0.25})`;

          /* ----- trail streak ----- */
          const showTrail = pos.speed > fly.trailThresh && blink > 0.3;
          let trailEl: React.ReactNode = null;
          if (showTrail) {
            const trailLen = interpolate(
              pos.speed, [fly.trailThresh, fly.trailThresh * 3], [r * 3, r * 8],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            const trailAlpha = alpha * interpolate(
              pos.speed, [fly.trailThresh, fly.trailThresh * 3], [0.08, 0.25],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            trailEl = (
              <line
                x1={pos.x} y1={pos.y}
                x2={pos.x - Math.cos(pos.angle) * trailLen}
                y2={pos.y - Math.sin(pos.angle) * trailLen}
                stroke={`hsla(${hue},${sat}%,${midL}%,${trailAlpha})`}
                strokeWidth={r * 0.8}
                strokeLinecap="round"
                style={{ filter: `blur(${1.5 + r * 0.3}px)` }}
              />
            );
          }

          /* ----- 3-layer rendering ----- */
          return (
            <g key={i}>
              {trailEl}
              {/* Outer soft halo */}
              <circle
                cx={pos.x} cy={pos.y} r={glowR * 4.5}
                fill={haloColor}
                style={{ filter: `blur(${6 + blink * 4}px)` }}
              />
              {/* Mid warm glow */}
              <circle
                cx={pos.x} cy={pos.y} r={glowR * 2.2}
                fill={midColor}
                style={{ filter: `blur(${2.5 + blink * 2}px)` }}
              />
              {/* Bright tiny core */}
              <circle
                cx={pos.x} cy={pos.y} r={r}
                fill={coreColor}
                style={{ filter: `blur(${0.3 + blink * 0.5}px)` }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
