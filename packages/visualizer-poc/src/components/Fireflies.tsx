/**
 * Fireflies — A+++ overlay: a meadow at twilight with dozens of fireflies
 * blinking and drifting. Tall grass silhouettes at the bottom, dark sky
 * with stars at top, distant trees on the horizon, low fog ribbon, and
 * 90 fireflies each with a 3-layer glow halo flickering on independent
 * cycles. Energy raises the firefly density; bass slowly sways the grass;
 * chromaHue shifts the firefly hue gold↔green↔amber.
 *
 * Audio reactivity:
 *   slowEnergy   → firefly glow brightness
 *   energy       → drift speed
 *   bass         → grass sway
 *   beatDecay    → simultaneous flash
 *   onsetEnvelope→ flare burst
 *   chromaHue    → firefly tint
 *   tempoFactor  → flicker speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 800;
const FIREFLY_COUNT = 96;
const GRASS_BLADE_COUNT = 70;
const TREE_COUNT = 12;
const STAR_COUNT = 90;
const FOG_COUNT = 8;

interface Firefly {
  baseX: number;
  baseY: number;
  driftFreq: number;
  driftAmpX: number;
  driftAmpY: number;
  driftPhase: number;
  flickerSpeed: number;
  flickerPhase: number;
  size: number;
  hueOffset: number;
}

interface Grass {
  x: number;
  height: number;
  swayFreq: number;
  swayAmp: number;
  phase: number;
  shade: number;
}

interface Tree {
  x: number;
  size: number;
  treeType: 0 | 1 | 2;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

interface FogRibbon {
  x: number;
  y: number;
  rx: number;
  ry: number;
  drift: number;
  phase: number;
}

function buildFireflies(): Firefly[] {
  const rng = seeded(67_001_882);
  return Array.from({ length: FIREFLY_COUNT }, () => ({
    baseX: rng(),
    baseY: 0.10 + rng() * 0.78,
    driftFreq: 0.005 + rng() * 0.012,
    driftAmpX: 0.02 + rng() * 0.06,
    driftAmpY: 0.01 + rng() * 0.04,
    driftPhase: rng() * Math.PI * 2,
    flickerSpeed: 0.06 + rng() * 0.18,
    flickerPhase: rng() * Math.PI * 2,
    size: 0.8 + rng() * 1.6,
    hueOffset: -10 + rng() * 30,
  }));
}

function buildGrass(): Grass[] {
  const rng = seeded(54_117_226);
  return Array.from({ length: GRASS_BLADE_COUNT }, (_, i) => ({
    x: (i + 0.4 + rng() * 0.2) / GRASS_BLADE_COUNT,
    height: 30 + rng() * 80,
    swayFreq: 0.012 + rng() * 0.020,
    swayAmp: 4 + rng() * 8,
    phase: rng() * Math.PI * 2,
    shade: 0.10 + rng() * 0.18,
  }));
}

function buildTrees(): Tree[] {
  const rng = seeded(82_447_991);
  return Array.from({ length: TREE_COUNT }, (_, i) => ({
    x: (i + 0.3 + rng() * 0.4) / TREE_COUNT,
    size: 0.8 + rng() * 0.6,
    treeType: Math.floor(rng() * 3) as 0 | 1 | 2,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(91_177_006);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.45,
    size: 0.4 + rng() * 1.6,
    phase: rng() * Math.PI * 2,
  }));
}

function buildFog(): FogRibbon[] {
  const rng = seeded(36_881_335);
  return Array.from({ length: FOG_COUNT }, () => ({
    x: rng(),
    y: 0.75 + rng() * 0.10,
    rx: 0.12 + rng() * 0.16,
    ry: 0.03 + rng() * 0.04,
    drift: 0.0001 + rng() * 0.00030,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Fireflies: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const fireflies = React.useMemo(buildFireflies, []);
  const grass = React.useMemo(buildGrass, []);
  const trees = React.useMemo(buildTrees, []);
  const stars = React.useMemo(buildStars, []);
  const fog = React.useMemo(buildFog, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const fireflyGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.6, 1.20], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const energy = snap.energy;
  const bass = snap.bass;
  const beatPulse = 1 + snap.beatDecay * 0.30;
  const onsetFlare = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  const baseHue = 56;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.35) % 360 + 360) % 360;

  const skyTop = `hsl(${(tintHue + 220) % 360}, 36%, 5%)`;
  const skyMid = `hsl(${(tintHue + 240) % 360}, 30%, 9%)`;
  const skyHorizon = `hsl(${(tintHue + 260) % 360}, 28%, 14%)`;

  const horizonY = height * 0.78;

  // Firefly with 3-layer halo
  const fireflyNodes = fireflies.map((f, i) => {
    const t = frame * f.driftFreq * tempoFactor + f.driftPhase;
    const px = (f.baseX + Math.sin(t) * f.driftAmpX) * width;
    const py = (f.baseY + Math.cos(t * 1.3) * f.driftAmpY) * height;
    const fT = frame * f.flickerSpeed * tempoFactor + f.flickerPhase;
    const blink = 0.25 + Math.abs(Math.sin(fT)) * 0.75;
    const sz = f.size * beatPulse;
    const hue = (tintHue + f.hueOffset + 360) % 360;
    const cCore = `hsl(${hue + 12}, 100%, 92%)`;
    const cMid = `hsl(${hue}, 100%, 70%)`;
    const cOuter = `hsl(${hue - 8}, 95%, 50%)`;
    return (
      <g key={`f-${i}`} style={{ mixBlendMode: "screen" }}>
        <circle cx={px} cy={py} r={sz * 14} fill={cOuter} opacity={0.10 * blink * fireflyGlow} />
        <circle cx={px} cy={py} r={sz * 7} fill={cMid} opacity={0.22 * blink * fireflyGlow} />
        <circle cx={px} cy={py} r={sz * 3.2} fill={cMid} opacity={0.45 * blink * fireflyGlow} />
        <circle cx={px} cy={py} r={sz * 1.4} fill={cCore} opacity={0.95 * blink} />
      </g>
    );
  });

  // Grass blades at bottom
  const grassNodes = grass.map((g, i) => {
    const px = g.x * width;
    const baseY = height;
    const sway = Math.sin(frame * g.swayFreq * tempoFactor + g.phase) * (g.swayAmp + bass * 6);
    const tipX = px + sway;
    const tipY = baseY - g.height;
    const midX = px + sway * 0.5;
    const midY = baseY - g.height * 0.5;
    const fill = `rgba(${10 + g.shade * 20},${14 + g.shade * 24},${12 + g.shade * 18}, 0.95)`;
    return (
      <path
        key={`g-${i}`}
        d={`M ${px - 1.2} ${baseY} Q ${midX} ${midY} ${tipX} ${tipY} Q ${midX + 1} ${midY + 1} ${px + 1.2} ${baseY} Z`}
        fill={fill}
      />
    );
  });

  // Trees on horizon
  const treeNodes = trees.map((t, i) => {
    const tx = t.x * width;
    const ty = horizonY;
    const ts = t.size;
    if (t.treeType === 0) {
      return (
        <g key={`tr-${i}`}>
          <rect x={tx - 4 * ts} y={ty - 4} width={8 * ts} height={20 * ts} fill="rgba(8, 6, 12, 0.96)" />
          <path d={`M ${tx - 32 * ts} ${ty - 4} L ${tx} ${ty - 88 * ts} L ${tx + 32 * ts} ${ty - 4} Z`} fill="rgba(10, 16, 12, 0.96)" />
          <path d={`M ${tx - 26 * ts} ${ty - 24 * ts} L ${tx} ${ty - 78 * ts} L ${tx + 26 * ts} ${ty - 24 * ts} Z`} fill="rgba(14, 22, 16, 0.96)" />
        </g>
      );
    }
    if (t.treeType === 1) {
      return (
        <g key={`tr-${i}`}>
          <rect x={tx - 5 * ts} y={ty - 4} width={10 * ts} height={22 * ts} fill="rgba(8, 6, 12, 0.96)" />
          <circle cx={tx} cy={ty - 36 * ts} r={36 * ts} fill="rgba(10, 16, 12, 0.96)" />
          <circle cx={tx - 18 * ts} cy={ty - 28 * ts} r={22 * ts} fill="rgba(8, 14, 10, 0.96)" />
          <circle cx={tx + 18 * ts} cy={ty - 28 * ts} r={22 * ts} fill="rgba(8, 14, 10, 0.96)" />
        </g>
      );
    }
    return (
      <g key={`tr-${i}`}>
        <rect x={tx - 4 * ts} y={ty - 4} width={8 * ts} height={24 * ts} fill="rgba(8, 6, 12, 0.96)" />
        <ellipse cx={tx} cy={ty - 30 * ts} rx={42 * ts} ry={32 * ts} fill="rgba(10, 16, 12, 0.96)" />
        {Array.from({ length: 5 }).map((_, k) => (
          <path
            key={k}
            d={`M ${tx - 30 * ts + k * 15 * ts} ${ty - 26 * ts}
                Q ${tx - 28 * ts + k * 15 * ts} ${ty - 4} ${tx - 32 * ts + k * 15 * ts} ${ty + 8}`}
            stroke="rgba(8, 14, 10, 0.86)"
            strokeWidth={1.4}
            fill="none"
          />
        ))}
      </g>
    );
  });

  // Stars
  const starNodes = stars.map((s, i) => {
    const tw = 0.4 + Math.sin(frame * 0.05 + s.phase) * 0.55;
    return <circle key={`star-${i}`} cx={s.x * width} cy={s.y * height} r={s.size * tw} fill="rgba(240, 232, 220, 0.85)" />;
  });

  // Fog ribbons
  const fogNodes = fog.map((f, i) => {
    const drift = (f.x + frame * f.drift) % 1.2 - 0.1;
    const breath = 1 + Math.sin(frame * 0.012 + f.phase) * 0.08;
    return (
      <ellipse
        key={`fog-${i}`}
        cx={drift * width}
        cy={f.y * height}
        rx={f.rx * width * breath}
        ry={f.ry * height * breath}
        fill={`hsla(${tintHue}, 30%, 55%, ${0.18 + fireflyGlow * 0.12})`}
      />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="ff-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="ff-meadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${tintHue + 30}, 30%, 14%)`} />
            <stop offset="100%" stopColor="rgba(4, 6, 8, 0.98)" />
          </linearGradient>
          <radialGradient id="ff-moon" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="rgba(240, 240, 220, 0.75)" />
            <stop offset="100%" stopColor="rgba(240, 240, 220, 0)" />
          </radialGradient>
          <filter id="ff-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#ff-sky)" />

        {/* Stars */}
        <g>{starNodes}</g>

        {/* Moon */}
        <circle cx={width * 0.18} cy={height * 0.16} r={height * 0.18} fill="url(#ff-moon)" />
        <circle cx={width * 0.18} cy={height * 0.16} r={20} fill="rgba(240, 240, 220, 0.85)" />

        {/* Trees */}
        <g>{treeNodes}</g>

        {/* Meadow ground */}
        <rect x={0} y={horizonY} width={width} height={height - horizonY} fill="url(#ff-meadow)" />

        {/* Low fog */}
        <g filter="url(#ff-blur)">{fogNodes}</g>

        {/* Onset flare */}
        {onsetFlare > 0 && (
          <rect width={width} height={height} fill={`hsla(${tintHue}, 90%, 80%, ${onsetFlare * 0.10})`} />
        )}

        {/* Fireflies */}
        <g>{fireflyNodes}</g>

        {/* Grass blades (foreground) */}
        <g>{grassNodes}</g>

        {/* Final atmospheric wash */}
        <rect
          width={width}
          height={height}
          fill={`hsla(${tintHue}, 60%, 50%, ${0.04 + fireflyGlow * 0.04})`}
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
