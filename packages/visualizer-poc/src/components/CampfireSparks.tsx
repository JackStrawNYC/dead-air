/**
 * CampfireSparks — A+++ overlay: a campfire scene with detailed multi-layer
 * flames in the foreground, sparks flying up in arcs, log silhouettes
 * stacked, glowing coal bed, seated silhouettes around the fire, distant
 * trees, and stars overhead. The flame is detailed with 3 color stops
 * (red core, orange mid, yellow tips) and animated independently.
 *
 * Audio reactivity:
 *   slowEnergy   → fire warmth and atmospheric glow
 *   energy       → spark spawn rate
 *   bass         → flame size pulse
 *   beatDecay    → fire flare
 *   onsetEnvelope→ ember burst
 *   chromaHue    → flame tint
 *   tempoFactor  → spark speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 800;
const SPARK_COUNT = 80;
const FLAME_LAYER_COUNT = 14;
const COAL_COUNT = 20;
const LOG_COUNT = 5;
const SITTER_COUNT = 4;
const TREE_COUNT = 8;
const STAR_COUNT = 80;
const SMOKE_COUNT = 10;

interface Spark {
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

interface Flame {
  x: number;
  height: number;
  width: number;
  hueOffset: number;
  flickerSpeed: number;
  phase: number;
  layer: 0 | 1 | 2;
}

interface Coal {
  x: number;
  y: number;
  size: number;
  flickerSpeed: number;
  phase: number;
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

interface Smoke {
  x: number;
  rise: number;
  rx: number;
  ry: number;
  phase: number;
  spawnOffset: number;
}

function buildSparks(): Spark[] {
  const rng = seeded(48_117_223);
  return Array.from({ length: SPARK_COUNT }, () => ({
    baseX: 0.30 + rng() * 0.40,
    riseSpeed: 0.0035 + rng() * 0.0090,
    driftFreq: 0.020 + rng() * 0.030,
    driftAmp: 14 + rng() * 28,
    driftPhase: rng() * Math.PI * 2,
    size: 0.7 + rng() * 1.4,
    flickerSpeed: 0.10 + rng() * 0.30,
    hueOffset: -8 + rng() * 22,
    spawnOffset: rng() * 200,
    lifeSpan: 200 + rng() * 200,
  }));
}

function buildFlames(): Flame[] {
  const rng = seeded(73_447_006);
  return Array.from({ length: FLAME_LAYER_COUNT }, (_, i) => ({
    x: 0.34 + (i / (FLAME_LAYER_COUNT - 1)) * 0.32 + (rng() - 0.5) * 0.04,
    height: 60 + rng() * 70,
    width: 18 + rng() * 18,
    hueOffset: -10 + rng() * 22,
    flickerSpeed: 0.13 + rng() * 0.30,
    phase: rng() * Math.PI * 2,
    layer: (i % 3) as 0 | 1 | 2,
  }));
}

function buildCoals(): Coal[] {
  const rng = seeded(80_117_443);
  return Array.from({ length: COAL_COUNT }, () => ({
    x: 0.34 + rng() * 0.32,
    y: 0.96 + rng() * 0.02,
    size: 1.5 + rng() * 2.4,
    flickerSpeed: 0.08 + rng() * 0.20,
    phase: rng() * Math.PI * 2,
  }));
}

function buildTrees(): Tree[] {
  const rng = seeded(36_117_009);
  return Array.from({ length: TREE_COUNT }, (_, i) => ({
    x: (i + 0.3 + rng() * 0.4) / TREE_COUNT,
    size: 0.85 + rng() * 0.5,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(91_006_115);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.55,
    size: 0.4 + rng() * 1.4,
    phase: rng() * Math.PI * 2,
  }));
}

function buildSmoke(): Smoke[] {
  const rng = seeded(58_998_447);
  return Array.from({ length: SMOKE_COUNT }, () => ({
    x: 0.40 + rng() * 0.20,
    rise: 0.0010 + rng() * 0.0030,
    rx: 28 + rng() * 32,
    ry: 18 + rng() * 18,
    phase: rng() * Math.PI * 2,
    spawnOffset: rng() * 280,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CampfireSparks: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const sparks = React.useMemo(buildSparks, []);
  const flames = React.useMemo(buildFlames, []);
  const coals = React.useMemo(buildCoals, []);
  const trees = React.useMemo(buildTrees, []);
  const stars = React.useMemo(buildStars, []);
  const smoke = React.useMemo(buildSmoke, []);

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

  // Sparks
  const sparkNodes = sparks.map((s, i) => {
    const t = ((frame * tempoFactor + s.spawnOffset) % s.lifeSpan) / s.lifeSpan;
    const rise = t * s.lifeSpan * s.riseSpeed * height;
    const px = s.baseX * width + Math.sin((frame + s.spawnOffset) * s.driftFreq + s.driftPhase) * s.driftAmp;
    const py = fireBaseY - rise;
    if (py < height * 0.02) return null;
    const lifeFade = 1 - t;
    const flicker = 0.5 + Math.sin((frame + s.spawnOffset) * s.flickerSpeed) * 0.4;
    const sz = s.size * beatPulse;
    const hue = (tintHue + s.hueOffset + 360) % 360;
    const cCore = `hsl(${hue + 22}, 100%, 90%)`;
    const cMid = `hsl(${hue + 6}, 95%, 65%)`;
    const cOuter = `hsl(${hue - 8}, 90%, 45%)`;
    return (
      <g key={`sp-${i}`} style={{ mixBlendMode: "screen" }}>
        <circle cx={px} cy={py} r={sz * 9} fill={cOuter} opacity={0.10 * lifeFade * flicker * fireGlow} />
        <circle cx={px} cy={py} r={sz * 4.5} fill={cMid} opacity={0.22 * lifeFade * flicker * fireGlow} />
        <circle cx={px} cy={py} r={sz * 2.0} fill={cMid} opacity={0.55 * lifeFade * flicker} />
        <circle cx={px} cy={py} r={sz * 1.0} fill={cCore} opacity={0.95 * lifeFade * flicker} />
      </g>
    );
  });

  // Flames (3 layers per flame)
  const flameNodes = flames.map((fl, i) => {
    const px = fl.x * width;
    const py = fireBaseY - 4;
    const t = frame * fl.flickerSpeed * tempoFactor + fl.phase;
    const flicker = 0.85 + Math.sin(t) * 0.15 + Math.sin(t * 2.7) * 0.08;
    const fH = fl.height * flicker * (1 + bass * 0.30) * beatPulse;
    const fW = fl.width * (1 + Math.sin(t * 1.3) * 0.10);
    const hue = (tintHue + fl.hueOffset + 360) % 360;
    const cCore = `hsl(${hue + 22}, 100%, 90%)`;
    const cMid = `hsl(${hue + 6}, 95%, 65%)`;
    const cDeep = `hsl(${hue - 14}, 85%, 40%)`;
    return (
      <g key={`fl-${i}`} style={{ mixBlendMode: "screen" }}>
        {/* Outer red */}
        <path
          d={`M ${px - fW * 1.2} ${py}
              Q ${px - fW * 1.2} ${py - fH * 0.6} ${px} ${py - fH}
              Q ${px + fW * 1.2} ${py - fH * 0.6} ${px + fW * 1.2} ${py}
              Z`}
          fill={cDeep}
          opacity={0.85}
        />
        {/* Mid orange */}
        <path
          d={`M ${px - fW * 0.7} ${py}
              Q ${px - fW * 0.8} ${py - fH * 0.55} ${px} ${py - fH * 0.92}
              Q ${px + fW * 0.8} ${py - fH * 0.55} ${px + fW * 0.7} ${py}
              Z`}
          fill={cMid}
          opacity={0.92}
        />
        {/* Core yellow */}
        <path
          d={`M ${px - fW * 0.32} ${py}
              Q ${px - fW * 0.35} ${py - fH * 0.50} ${px} ${py - fH * 0.80}
              Q ${px + fW * 0.35} ${py - fH * 0.50} ${px + fW * 0.32} ${py}
              Z`}
          fill={cCore}
          opacity={0.95}
        />
      </g>
    );
  });

  // Coals
  const coalNodes = coals.map((c, i) => {
    const t = frame * c.flickerSpeed + c.phase;
    const flicker = 0.6 + Math.sin(t) * 0.4;
    const cx = c.x * width;
    const cy = c.y * height - 4;
    return (
      <g key={`co-${i}`}>
        <ellipse cx={cx} cy={cy} rx={c.size * 1.6} ry={c.size * 0.7} fill="rgba(40, 18, 6, 0.95)" />
        <ellipse cx={cx} cy={cy} rx={c.size * 1.0} ry={c.size * 0.45} fill={`hsl(${tintHue + 18}, 95%, 55%)`} opacity={0.70 * flicker} />
        <ellipse cx={cx} cy={cy} rx={c.size * 0.5} ry={c.size * 0.20} fill={`hsl(${tintHue + 30}, 100%, 80%)`} opacity={0.85 * flicker} />
      </g>
    );
  });

  // Logs (stacked)
  const logNodes = Array.from({ length: LOG_COUNT }).map((_, i) => {
    const px = width * 0.50 + (i - LOG_COUNT / 2) * 18;
    const py = fireBaseY + 6 + (i % 2) * 4;
    const tilt = (i - LOG_COUNT / 2) * 8;
    return (
      <g key={`log-${i}`} transform={`rotate(${tilt}, ${px}, ${py})`}>
        <ellipse cx={px} cy={py} rx={70} ry={11} fill="rgba(20, 10, 4, 0.98)" />
        <ellipse cx={px} cy={py - 1} rx={68} ry={9} fill="rgba(36, 18, 6, 0.95)" />
        {/* End ring detail */}
        <ellipse cx={px - 64} cy={py} rx={4} ry={10} fill="rgba(18, 8, 2, 0.95)" />
        <ellipse cx={px - 64} cy={py} rx={2.5} ry={6} fill="rgba(54, 26, 8, 0.85)" />
        {/* Bark texture */}
        <line x1={px - 50} y1={py - 4} x2={px + 60} y2={py - 3} stroke="rgba(8, 4, 0, 0.7)" strokeWidth={0.6} />
        <line x1={px - 40} y1={py + 1} x2={px + 52} y2={py + 2} stroke="rgba(8, 4, 0, 0.7)" strokeWidth={0.6} />
      </g>
    );
  });

  // Sitter silhouettes around the fire
  const sitterNodes = Array.from({ length: SITTER_COUNT }).map((_, i) => {
    const sideX =
      i === 0 ? width * 0.22 : i === 1 ? width * 0.78 : i === 2 ? width * 0.16 : width * 0.84;
    const sideY = horizonY + height * 0.10 + (i % 2) * 18;
    const figH = 90 - (i % 2) * 10;
    const fill = "rgba(6, 3, 10, 0.96)";
    return (
      <g key={`sitter-${i}`}>
        {/* Body (seated triangle) */}
        <ellipse cx={sideX} cy={sideY + figH * 0.05} rx={figH * 0.36} ry={figH * 0.30} fill={fill} />
        {/* Head */}
        <circle cx={sideX} cy={sideY - figH * 0.20} r={figH * 0.16} fill={fill} />
        {/* Hat (some have one) */}
        {i % 2 === 0 && (
          <ellipse cx={sideX} cy={sideY - figH * 0.34} rx={figH * 0.26} ry={figH * 0.07} fill={fill} />
        )}
        {/* Fire glow on body */}
        <ellipse cx={sideX} cy={sideY + figH * 0.05} rx={figH * 0.40} ry={figH * 0.32} fill={`hsl(${tintHue + 14}, 95%, 60%)`} opacity={0.18 * fireGlow} />
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

  // Smoke
  const smokeNodes = smoke.map((s, i) => {
    const t = ((frame + s.spawnOffset) * s.rise) % 1;
    const rise = t * (height * 0.7);
    const px = s.x * width + Math.sin((frame + s.spawnOffset) * 0.01 + s.phase) * 20;
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

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="cs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="cs-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${tintHue}, 35%, 14%)`} />
            <stop offset="100%" stopColor="rgba(4, 2, 4, 0.98)" />
          </linearGradient>
          <radialGradient id="cs-firewash" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={`hsl(${tintHue + 24}, 95%, 80%)`} stopOpacity="0.85" />
            <stop offset="50%" stopColor={`hsl(${tintHue}, 90%, 55%)`} stopOpacity="0.40" />
            <stop offset="100%" stopColor={`hsl(${tintHue - 14}, 80%, 35%)`} stopOpacity="0" />
          </radialGradient>
          <filter id="cs-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#cs-sky)" />

        {/* Stars */}
        <g>{starNodes}</g>

        {/* Trees */}
        <g>{treeNodes}</g>

        {/* Ground */}
        <rect x={0} y={horizonY} width={width} height={height - horizonY} fill="url(#cs-ground)" />

        {/* Firewash glow */}
        <ellipse
          cx={width * 0.5}
          cy={fireBaseY}
          rx={300 + bass * 60}
          ry={180 + bass * 30}
          fill="url(#cs-firewash)"
          opacity={fireGlow}
          style={{ mixBlendMode: "screen" }}
        />

        {/* Sitters around fire (back) */}
        <g>{sitterNodes}</g>

        {/* Smoke */}
        <g filter="url(#cs-blur)">{smokeNodes}</g>

        {/* Logs */}
        <g>{logNodes}</g>

        {/* Coal bed glow */}
        <g style={{ mixBlendMode: "screen" }}>{coalNodes}</g>

        {/* Onset flare */}
        {onsetFlare > 0 && (
          <ellipse
            cx={width * 0.5}
            cy={fireBaseY}
            rx={400}
            ry={240}
            fill={`hsl(${tintHue + 24}, 95%, 80%)`}
            opacity={onsetFlare * 0.20}
            style={{ mixBlendMode: "screen" }}
          />
        )}

        {/* Flames (foreground) */}
        <g>{flameNodes}</g>

        {/* Sparks (top) */}
        <g>{sparkNodes}</g>

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
