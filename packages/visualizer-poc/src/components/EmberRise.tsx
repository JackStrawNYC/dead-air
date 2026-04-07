/**
 * EmberRise — A+++ overlay: a fire at the bottom of the frame with 100+
 * embers and sparks rising and fading. Multi-layered flames at the base,
 * smoke trailing up, ember particles in 3 depth layers, distant trees in
 * the night, starry sky. Bass intensifies the fire pulse; energy raises
 * the ember spawn rate; chromaHue tints flame color.
 *
 * Audio reactivity:
 *   slowEnergy   → fire warmth and atmospheric glow
 *   energy       → ember spawn rate
 *   bass         → flame size pulse
 *   beatDecay    → fire flare
 *   onsetEnvelope→ ember burst
 *   chromaHue    → flame tint
 *   tempoFactor  → ember speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 800;
const FRONT_EMBERS = 36;
const MID_EMBERS = 40;
const BACK_EMBERS = 40;
const SMOKE_PUFFS = 16;
const FLAME_BLOBS = 12;
const TREE_COUNT = 10;
const STAR_COUNT = 80;

interface Ember {
  baseX: number;
  riseSpeed: number;
  driftFreq: number;
  driftAmp: number;
  driftPhase: number;
  size: number;
  flickerSpeed: number;
  hueOffset: number;
  spawnOffset: number;
  lifeSpan: number;
}

interface SmokePuff {
  x: number;
  rise: number;
  rx: number;
  ry: number;
  drift: number;
  phase: number;
  spawnOffset: number;
}

interface FlameBlob {
  x: number;
  height: number;
  width: number;
  flickerSpeed: number;
  phase: number;
  hueOffset: number;
}

interface Tree {
  x: number;
  size: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

function buildEmbers(seed: number, count: number): Ember[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    baseX: 0.20 + rng() * 0.60,
    riseSpeed: 0.0030 + rng() * 0.0080,
    driftFreq: 0.018 + rng() * 0.030,
    driftAmp: 12 + rng() * 30,
    driftPhase: rng() * Math.PI * 2,
    size: 0.7 + rng() * 1.6,
    flickerSpeed: 0.10 + rng() * 0.30,
    hueOffset: -10 + rng() * 30,
    spawnOffset: rng() * 180,
    lifeSpan: 220 + rng() * 220,
  }));
}

function buildSmoke(): SmokePuff[] {
  const rng = seeded(60_338_002);
  return Array.from({ length: SMOKE_PUFFS }, () => ({
    x: 0.30 + rng() * 0.40,
    rise: 0.0010 + rng() * 0.0030,
    rx: 30 + rng() * 40,
    ry: 18 + rng() * 22,
    drift: 0.005 + rng() * 0.010,
    phase: rng() * Math.PI * 2,
    spawnOffset: rng() * 280,
  }));
}

function buildFlames(): FlameBlob[] {
  const rng = seeded(81_447_226);
  return Array.from({ length: FLAME_BLOBS }, (_, i) => ({
    x: 0.32 + (i / (FLAME_BLOBS - 1)) * 0.36 + (rng() - 0.5) * 0.04,
    height: 60 + rng() * 50,
    width: 22 + rng() * 18,
    flickerSpeed: 0.15 + rng() * 0.30,
    phase: rng() * Math.PI * 2,
    hueOffset: -10 + rng() * 20,
  }));
}

function buildTrees(): Tree[] {
  const rng = seeded(72_117_226);
  return Array.from({ length: TREE_COUNT }, (_, i) => ({
    x: (i + 0.3 + rng() * 0.4) / TREE_COUNT,
    size: 0.85 + rng() * 0.5,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(93_002_115);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.55,
    size: 0.4 + rng() * 1.4,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const EmberRise: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const frontEmbers = React.useMemo(() => buildEmbers(11_009_443, FRONT_EMBERS), []);
  const midEmbers = React.useMemo(() => buildEmbers(22_018_554, MID_EMBERS), []);
  const backEmbers = React.useMemo(() => buildEmbers(33_027_665, BACK_EMBERS), []);
  const smoke = React.useMemo(buildSmoke, []);
  const flames = React.useMemo(buildFlames, []);
  const trees = React.useMemo(buildTrees, []);
  const stars = React.useMemo(buildStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const fireGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.6, 1.20], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const energy = snap.energy;
  const bass = snap.bass;
  const beatPulse = 1 + snap.beatDecay * 0.40;
  const onsetFlare = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  const baseHue = 22;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;

  const skyTop = `hsl(${(tintHue + 220) % 360}, 36%, 5%)`;
  const skyMid = `hsl(${(tintHue + 240) % 360}, 30%, 8%)`;
  const skyHorizon = `hsl(${(tintHue + 6) % 360}, 36%, 14%)`;

  const horizonY = height * 0.78;
  const fireBaseY = height * 0.96;

  // Ember renderer
  function renderEmber(e: Ember, depth: 0 | 1 | 2, key: string) {
    const t = ((frame * tempoFactor + e.spawnOffset) % e.lifeSpan) / e.lifeSpan;
    const rise = t * e.lifeSpan * e.riseSpeed * height;
    const px = e.baseX * width + Math.sin((frame + e.spawnOffset) * e.driftFreq + e.driftPhase) * e.driftAmp;
    const py = fireBaseY - rise;
    if (py < height * 0.02) return null;
    const lifeFade = 1 - t;
    const flicker = 0.5 + Math.sin((frame + e.spawnOffset) * e.flickerSpeed) * 0.4;
    const depthScale = depth === 0 ? 1.0 : depth === 1 ? 0.78 : 0.55;
    const sz = e.size * depthScale * beatPulse;
    const hue = (tintHue + e.hueOffset + 360) % 360;
    const cCore = `hsl(${hue + 22}, 100%, 90%)`;
    const cMid = `hsl(${hue + 6}, 95%, 65%)`;
    const cOuter = `hsl(${hue - 8}, 90%, 45%)`;
    return (
      <g key={key} style={{ mixBlendMode: "screen" }}>
        <circle cx={px} cy={py} r={sz * 10} fill={cOuter} opacity={0.10 * lifeFade * flicker * fireGlow} />
        <circle cx={px} cy={py} r={sz * 5} fill={cMid} opacity={0.22 * lifeFade * flicker * fireGlow} />
        <circle cx={px} cy={py} r={sz * 2.2} fill={cMid} opacity={0.55 * lifeFade * flicker} />
        <circle cx={px} cy={py} r={sz * 1.0} fill={cCore} opacity={0.95 * lifeFade * flicker} />
      </g>
    );
  }

  // Smoke puffs rising
  const smokeNodes = smoke.map((s, i) => {
    const t = ((frame + s.spawnOffset) * s.rise) % 1;
    const rise = t * (height * 0.7);
    const px = s.x * width + Math.sin((frame + s.spawnOffset) * s.drift + s.phase) * 18;
    const py = fireBaseY - rise;
    const fade = 1 - t;
    return (
      <ellipse
        key={`sm-${i}`}
        cx={px}
        cy={py}
        rx={s.rx * (1 + (1 - fade) * 0.6)}
        ry={s.ry * (1 + (1 - fade) * 0.4)}
        fill={`rgba(50, 40, 50, ${fade * 0.40})`}
      />
    );
  });

  // Flames
  const flameNodes = flames.map((fl, i) => {
    const px = fl.x * width;
    const py = fireBaseY;
    const t = frame * fl.flickerSpeed + fl.phase;
    const flicker = 0.85 + Math.sin(t) * 0.15 + Math.sin(t * 2.7) * 0.08;
    const fH = fl.height * flicker * (1 + bass * 0.30) * beatPulse;
    const fW = fl.width * (1 + Math.sin(t * 1.3) * 0.10);
    const hue = (tintHue + fl.hueOffset + 360) % 360;
    const cCore = `hsl(${hue + 22}, 100%, 90%)`;
    const cMid = `hsl(${hue + 6}, 95%, 65%)`;
    const cDeep = `hsl(${hue - 14}, 85%, 40%)`;
    return (
      <g key={`fl-${i}`} style={{ mixBlendMode: "screen" }}>
        <ellipse cx={px} cy={py - fH * 0.4} rx={fW} ry={fH * 0.55} fill={cDeep} opacity={0.85} />
        <ellipse cx={px} cy={py - fH * 0.5} rx={fW * 0.7} ry={fH * 0.45} fill={cMid} opacity={0.85} />
        <ellipse cx={px} cy={py - fH * 0.6} rx={fW * 0.4} ry={fH * 0.32} fill={cCore} opacity={0.92} />
      </g>
    );
  });

  // Trees
  const treeNodes = trees.map((t, i) => {
    const tx = t.x * width;
    const ty = horizonY;
    const ts = t.size;
    return (
      <g key={`tr-${i}`}>
        <rect x={tx - 4 * ts} y={ty - 4} width={8 * ts} height={20 * ts} fill="rgba(8, 6, 12, 0.96)" />
        <path d={`M ${tx - 32 * ts} ${ty - 4} L ${tx} ${ty - 86 * ts} L ${tx + 32 * ts} ${ty - 4} Z`} fill="rgba(10, 16, 12, 0.96)" />
        <path d={`M ${tx - 26 * ts} ${ty - 22 * ts} L ${tx} ${ty - 76 * ts} L ${tx + 26 * ts} ${ty - 22 * ts} Z`} fill="rgba(14, 22, 16, 0.96)" />
      </g>
    );
  });

  // Stars
  const starNodes = stars.map((s, i) => {
    const tw = 0.5 + Math.sin(frame * 0.05 + s.phase) * 0.45;
    return <circle key={`star-${i}`} cx={s.x * width} cy={s.y * height} r={s.size * tw} fill="rgba(240, 232, 220, 0.85)" />;
  });

  // Glow pool around the fire
  const fireWashR = 200 + bass * 60 + beatPulse * 18;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="er-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="er-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${tintHue}, 35%, 14%)`} />
            <stop offset="100%" stopColor="rgba(4, 2, 4, 0.98)" />
          </linearGradient>
          <radialGradient id="er-firewash" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={`hsl(${tintHue + 24}, 95%, 80%)`} stopOpacity="0.9" />
            <stop offset="50%" stopColor={`hsl(${tintHue}, 90%, 55%)`} stopOpacity="0.40" />
            <stop offset="100%" stopColor={`hsl(${tintHue - 14}, 80%, 35%)`} stopOpacity="0" />
          </radialGradient>
          <filter id="er-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#er-sky)" />

        {/* Stars */}
        <g>{starNodes}</g>

        {/* Trees */}
        <g>{treeNodes}</g>

        {/* Ground */}
        <rect x={0} y={horizonY} width={width} height={height - horizonY} fill="url(#er-ground)" />

        {/* Firewash glow */}
        <ellipse
          cx={width * 0.5}
          cy={fireBaseY}
          rx={fireWashR * 1.4}
          ry={fireWashR * 0.8}
          fill="url(#er-firewash)"
          opacity={fireGlow}
          style={{ mixBlendMode: "screen" }}
        />

        {/* Smoke (back) */}
        <g filter="url(#er-blur)">{smokeNodes}</g>

        {/* Back embers (smallest) */}
        <g>{backEmbers.map((e, i) => renderEmber(e, 2, `bk-${i}`))}</g>

        {/* Mid embers */}
        <g>{midEmbers.map((e, i) => renderEmber(e, 1, `md-${i}`))}</g>

        {/* Onset flare */}
        {onsetFlare > 0 && (
          <ellipse
            cx={width * 0.5}
            cy={fireBaseY}
            rx={fireWashR * 2.2}
            ry={fireWashR * 1.4}
            fill={`hsl(${tintHue + 24}, 95%, 80%)`}
            opacity={onsetFlare * 0.20}
            style={{ mixBlendMode: "screen" }}
          />
        )}

        {/* Flames (foreground) */}
        <g>{flameNodes}</g>

        {/* Front embers (largest, most prominent) */}
        <g>{frontEmbers.map((e, i) => renderEmber(e, 0, `fn-${i}`))}</g>

        {/* Logs at the base */}
        <g>
          <ellipse cx={width * 0.50} cy={fireBaseY + 4} rx={120} ry={10} fill="rgba(20, 12, 6, 0.98)" />
          <rect x={width * 0.42} y={fireBaseY - 6} width={80} height={14} rx={6} fill="rgba(28, 16, 6, 0.98)" />
          <rect x={width * 0.50} y={fireBaseY - 10} width={70} height={12} rx={5} fill="rgba(24, 14, 6, 0.98)" />
          {/* Glow on logs */}
          <ellipse cx={width * 0.50} cy={fireBaseY - 2} rx={80} ry={8} fill={`hsl(${tintHue + 14}, 95%, 60%)`} opacity={0.55 * fireGlow} />
        </g>

        {/* Final atmospheric warmth wash */}
        <rect
          width={width}
          height={height}
          fill={`hsla(${tintHue}, 80%, 50%, ${0.05 + fireGlow * 0.04})`}
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
