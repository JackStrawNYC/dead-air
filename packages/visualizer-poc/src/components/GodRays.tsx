/**
 * GodRays — A+++ overlay: divine sun/spotlight rays beaming down from above
 * a cathedral or forest backdrop, with visible dust motes drifting through
 * the rays. 14 large diagonal beams (3 layers each), distant gothic arches
 * silhouetted in the background, atmospheric mist on the floor, ground
 * pool where rays land. Energy drives ray brightness; bass thickens the
 * mist; chromaHue shifts the divine tint warm↔cool.
 *
 * Audio reactivity:
 *   slowEnergy   → ray brightness and atmospheric warmth
 *   energy       → cone width
 *   bass         → mist density
 *   beatDecay    → simultaneous pulse
 *   onsetEnvelope→ flash
 *   chromaHue    → divine tint
 *   tempoFactor  → drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 800;
const RAY_COUNT = 14;
const DUST_COUNT = 90;
const ARCH_COUNT = 6;
const TREE_COUNT = 10;
const STAR_COUNT = 30;
const MIST_COUNT = 12;

interface Ray {
  x: number;
  width: number;
  angle: number;
  hueOffset: number;
  phase: number;
  reach: number;
}

interface Dust {
  x: number;
  y: number;
  size: number;
  speed: number;
  phase: number;
}

interface MistBlob {
  x: number;
  y: number;
  rx: number;
  ry: number;
  drift: number;
  phase: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

function buildRays(): Ray[] {
  const rng = seeded(50_881_337);
  return Array.from({ length: RAY_COUNT }, (_, i) => ({
    x: 0.06 + (i / (RAY_COUNT - 1)) * 0.88 + (rng() - 0.5) * 0.04,
    width: 80 + rng() * 70,
    angle: -0.18 + (i / (RAY_COUNT - 1)) * 0.36 + (rng() - 0.5) * 0.06,
    hueOffset: -8 + rng() * 16,
    phase: rng() * Math.PI * 2,
    reach: 0.92 + rng() * 0.18,
  }));
}

function buildDust(): Dust[] {
  const rng = seeded(64_002_881);
  return Array.from({ length: DUST_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.95,
    size: 0.7 + rng() * 1.6,
    speed: 0.0006 + rng() * 0.0030,
    phase: rng() * Math.PI * 2,
  }));
}

function buildMist(): MistBlob[] {
  const rng = seeded(81_117_220);
  return Array.from({ length: MIST_COUNT }, () => ({
    x: rng(),
    y: 0.62 + rng() * 0.22,
    rx: 0.14 + rng() * 0.20,
    ry: 0.05 + rng() * 0.07,
    drift: 0.0001 + rng() * 0.00040,
    phase: rng() * Math.PI * 2,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(38_881_445);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.30,
    size: 0.4 + rng() * 1.4,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const GodRays: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const rays = React.useMemo(buildRays, []);
  const dust = React.useMemo(buildDust, []);
  const mist = React.useMemo(buildMist, []);
  const stars = React.useMemo(buildStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.92;
  if (masterOpacity < 0.01) return null;

  const rayBright = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.20], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const energy = snap.energy;
  const bass = snap.bass;
  const beatPulse = 1 + snap.beatDecay * 0.32;
  const onsetFlare = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  const baseHue = 44;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.4) % 360 + 360) % 360;
  const rayCore = `hsl(${tintHue + 18}, 95%, 88%)`;
  const rayMid = `hsl(${tintHue + 6}, 90%, 70%)`;
  const rayDeep = `hsl(${tintHue - 8}, 85%, 50%)`;

  const skyTop = `hsl(${(tintHue + 220) % 360}, 22%, 8%)`;
  const skyMid = `hsl(${(tintHue + 240) % 360}, 18%, 14%)`;
  const skyHorizon = `hsl(${tintHue}, 36%, 28%)`;

  const horizonY = height * 0.78;

  // Ray cone renderer
  const rayNodes = rays.map((r, i) => {
    const sx = r.x * width;
    const sy = -10;
    const angle = r.angle + Math.sin(frame * 0.005 * tempoFactor + r.phase) * 0.04;
    const len = height * r.reach;
    const ex = sx + Math.tan(angle) * len;
    const ey = len;
    const w = r.width * (1 + energy * 0.30) * beatPulse;
    const hue = (tintHue + r.hueOffset + 360) % 360;
    const cCore = `hsl(${hue + 18}, 95%, 88%)`;
    const cMid = `hsl(${hue + 6}, 92%, 72%)`;
    const cDeep = `hsl(${hue - 6}, 88%, 52%)`;
    return (
      <g key={`ray-${i}`} style={{ mixBlendMode: "screen" }}>
        {/* Outermost atmospheric wash */}
        <path
          d={`M ${sx - w * 0.12} ${sy}
              L ${ex - w * 0.62} ${ey}
              L ${ex + w * 0.62} ${ey}
              L ${sx + w * 0.12} ${sy} Z`}
          fill={cDeep}
          opacity={0.10 * rayBright}
        />
        {/* Mid */}
        <path
          d={`M ${sx - w * 0.06} ${sy}
              L ${ex - w * 0.32} ${ey}
              L ${ex + w * 0.32} ${ey}
              L ${sx + w * 0.06} ${sy} Z`}
          fill={cMid}
          opacity={0.22 * rayBright}
        />
        {/* Core */}
        <path
          d={`M ${sx - w * 0.022} ${sy}
              L ${ex - w * 0.12} ${ey}
              L ${ex + w * 0.12} ${ey}
              L ${sx + w * 0.022} ${sy} Z`}
          fill={cCore}
          opacity={0.40 * rayBright * beatPulse}
        />
        {/* Floor pool where ray lands */}
        <ellipse
          cx={ex}
          cy={ey - 4}
          rx={w * 0.55}
          ry={w * 0.10}
          fill={cMid}
          opacity={0.30 * rayBright}
        />
        <ellipse
          cx={ex}
          cy={ey - 4}
          rx={w * 0.20}
          ry={w * 0.04}
          fill={cCore}
          opacity={0.55 * rayBright}
        />
      </g>
    );
  });

  // Dust motes drifting in the rays
  const dustNodes = dust.map((d, i) => {
    const t = frame * d.speed + d.phase;
    const px = ((d.x + t * 0.5) % 1.1 - 0.05) * width;
    const py = (d.y + Math.sin(t * 1.4) * 0.02) * height;
    const flicker = 0.4 + Math.sin(t * 2.3) * 0.45;
    return (
      <circle
        key={`dust-${i}`}
        cx={px}
        cy={py}
        r={d.size * (0.7 + rayBright * 0.5)}
        fill={rayCore}
        opacity={0.40 * flicker * rayBright}
      />
    );
  });

  // Mist on the floor
  const mistNodes = mist.map((m, i) => {
    const drift = (m.x + frame * m.drift * (1 + bass * 0.5)) % 1.2 - 0.1;
    const breath = 1 + Math.sin(frame * 0.012 + m.phase) * 0.08;
    return (
      <ellipse
        key={`mist-${i}`}
        cx={drift * width}
        cy={m.y * height}
        rx={m.rx * width * breath}
        ry={m.ry * height * breath}
        fill={`hsla(${tintHue + 14}, 50%, 70%, ${0.20 + bass * 0.18 + rayBright * 0.10})`}
      />
    );
  });

  // Stars
  const starNodes = stars.map((s, i) => {
    const tw = 0.5 + Math.sin(frame * 0.05 + s.phase) * 0.45;
    return <circle key={`star-${i}`} cx={s.x * width} cy={s.y * height} r={s.size * tw} fill="rgba(240, 232, 220, 0.65)" />;
  });

  // Gothic arches in the back
  const archNodes = Array.from({ length: ARCH_COUNT }).map((_, i) => {
    const arx = (i + 0.5) / ARCH_COUNT * width;
    const ary = horizonY - height * 0.30;
    const archW = width * 0.10;
    const archH = height * 0.30;
    return (
      <g key={`arch-${i}`} opacity={0.85}>
        <path
          d={`M ${arx - archW / 2} ${horizonY}
              L ${arx - archW / 2} ${ary + archH * 0.4}
              Q ${arx - archW / 2} ${ary} ${arx} ${ary - 4}
              Q ${arx + archW / 2} ${ary} ${arx + archW / 2} ${ary + archH * 0.4}
              L ${arx + archW / 2} ${horizonY} Z`}
          fill="rgba(20, 16, 26, 0.96)"
        />
        <path
          d={`M ${arx - archW / 2 + 3} ${horizonY}
              L ${arx - archW / 2 + 3} ${ary + archH * 0.42}
              Q ${arx - archW / 2 + 3} ${ary + 3} ${arx} ${ary + 1}
              Q ${arx + archW / 2 - 3} ${ary + 3} ${arx + archW / 2 - 3} ${ary + archH * 0.42}
              L ${arx + archW / 2 - 3} ${horizonY} Z`}
          fill="rgba(40, 32, 50, 0.65)"
        />
      </g>
    );
  });

  // Distant trees flanking
  const treeNodes = Array.from({ length: TREE_COUNT }).map((_, i) => {
    const t = i / TREE_COUNT;
    const tx = (t < 0.5 ? t * 0.4 : 0.6 + (t - 0.5) * 0.4) * width;
    const ty = horizonY - 6;
    const ts = 0.85 + ((i * 1.31) % 1) * 0.5;
    return (
      <g key={`tree-${i}`}>
        <rect x={tx - 4 * ts} y={ty} width={8 * ts} height={20 * ts} fill="rgba(18, 14, 8, 0.95)" />
        <path d={`M ${tx - 30 * ts} ${ty + 6} L ${tx} ${ty - 80 * ts} L ${tx + 30 * ts} ${ty + 6} Z`} fill="rgba(14, 22, 14, 0.95)" />
        <path d={`M ${tx - 26 * ts} ${ty - 14 * ts} L ${tx} ${ty - 70 * ts} L ${tx + 26 * ts} ${ty - 14 * ts} Z`} fill="rgba(20, 30, 18, 0.95)" />
      </g>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="gr-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="gr-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${tintHue}, 25%, 18%)`} />
            <stop offset="100%" stopColor="rgba(8, 6, 12, 0.98)" />
          </linearGradient>
          <radialGradient id="gr-source" cx="0.5" cy="0" r="0.6">
            <stop offset="0%" stopColor={rayCore} stopOpacity="0.7" />
            <stop offset="100%" stopColor={rayDeep} stopOpacity="0" />
          </radialGradient>
          <filter id="gr-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#gr-sky)" />

        {/* Stars */}
        <g>{starNodes}</g>

        {/* Source glow at the top */}
        <ellipse cx={width * 0.5} cy={0} rx={width * 0.6} ry={height * 0.18} fill="url(#gr-source)" />

        {/* Distant trees & arches at horizon */}
        <g>{treeNodes}</g>
        <g>{archNodes}</g>

        {/* Floor */}
        <rect x={0} y={horizonY} width={width} height={height - horizonY} fill="url(#gr-floor)" />

        {/* Mist on floor (behind rays) */}
        <g filter="url(#gr-blur)">{mistNodes}</g>

        {/* Onset flash */}
        {onsetFlare > 0 && (
          <rect width={width} height={height} fill={`hsla(${tintHue}, 80%, 88%, ${onsetFlare * 0.12})`} />
        )}

        {/* God rays (the focus) */}
        <g>{rayNodes}</g>

        {/* Dust motes (top layer) */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* Final atmospheric wash */}
        <rect
          width={width}
          height={height}
          fill={`hsla(${tintHue}, 70%, 60%, ${0.05 + rayBright * 0.05})`}
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
