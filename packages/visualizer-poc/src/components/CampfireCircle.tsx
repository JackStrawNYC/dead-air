/**
 * CampfireCircle — A+++ overlay: a 3/4 view of a hippie commune circle
 * gathered around a central campfire, with 8 figures seated/cross-legged
 * facing the fire. Trees in the background, stars overhead, fire in the
 * middle, smoke rising, sparks, ground glow on each figure, blanket and
 * guitar props between figures, and a ring of stones at the fire base.
 *
 * Audio reactivity:
 *   slowEnergy   → fire warmth and atmospheric glow
 *   energy       → spark spawn rate
 *   bass         → flame size pulse
 *   beatDecay    → fire flare
 *   onsetEnvelope→ ember burst
 *   chromaHue    → flame tint
 *   tempoFactor  → spark drift
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 800;
const SITTER_COUNT = 8;
const SPARK_COUNT = 50;
const STONE_COUNT = 14;
const FLAME_COUNT = 10;
const TREE_COUNT = 12;
const STAR_COUNT = 90;
const SMOKE_COUNT = 8;

interface Sitter {
  baseAngle: number;
  height: number;
  pose: 0 | 1 | 2;
  hatType: 0 | 1 | 2;
  bobPhase: number;
  prop: 0 | 1 | 2; // none, guitar, drum
}

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

interface Stone {
  angle: number;
  size: number;
  shade: number;
}

interface Flame {
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
  treeType: 0 | 1;
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

function buildSitters(): Sitter[] {
  const rng = seeded(48_447_009);
  return Array.from({ length: SITTER_COUNT }, (_, i) => ({
    baseAngle: (i / SITTER_COUNT) * Math.PI * 2,
    height: 0.85 + rng() * 0.30,
    pose: Math.floor(rng() * 3) as 0 | 1 | 2,
    hatType: Math.floor(rng() * 3) as 0 | 1 | 2,
    bobPhase: rng() * Math.PI * 2,
    prop: Math.floor(rng() * 3) as 0 | 1 | 2,
  }));
}

function buildSparks(): Spark[] {
  const rng = seeded(67_117_223);
  return Array.from({ length: SPARK_COUNT }, () => ({
    baseX: 0.46 + (rng() - 0.5) * 0.12,
    riseSpeed: 0.0035 + rng() * 0.0080,
    driftFreq: 0.020 + rng() * 0.030,
    driftAmp: 14 + rng() * 26,
    driftPhase: rng() * Math.PI * 2,
    size: 0.7 + rng() * 1.4,
    flickerSpeed: 0.10 + rng() * 0.30,
    hueOffset: -8 + rng() * 22,
    spawnOffset: rng() * 200,
    lifeSpan: 200 + rng() * 200,
  }));
}

function buildStones(): Stone[] {
  const rng = seeded(82_117_006);
  return Array.from({ length: STONE_COUNT }, (_, i) => ({
    angle: (i / STONE_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.12,
    size: 0.7 + rng() * 0.6,
    shade: 0.20 + rng() * 0.20,
  }));
}

function buildFlames(): Flame[] {
  const rng = seeded(93_882_447);
  return Array.from({ length: FLAME_COUNT }, (_, i) => ({
    x: -0.10 + (i / (FLAME_COUNT - 1)) * 0.20,
    height: 60 + rng() * 50,
    width: 22 + rng() * 18,
    flickerSpeed: 0.13 + rng() * 0.30,
    phase: rng() * Math.PI * 2,
    hueOffset: -10 + rng() * 22,
  }));
}

function buildTrees(): Tree[] {
  const rng = seeded(36_117_558);
  return Array.from({ length: TREE_COUNT }, (_, i) => ({
    x: (i + 0.3 + rng() * 0.4) / TREE_COUNT,
    size: 0.85 + rng() * 0.5,
    treeType: Math.floor(rng() * 2) as 0 | 1,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(47_998_006);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.55,
    size: 0.4 + rng() * 1.4,
    phase: rng() * Math.PI * 2,
  }));
}

function buildSmoke(): Smoke[] {
  const rng = seeded(58_118_337);
  return Array.from({ length: SMOKE_COUNT }, () => ({
    x: 0.46 + (rng() - 0.5) * 0.06,
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

export const CampfireCircle: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const sitters = React.useMemo(buildSitters, []);
  const sparks = React.useMemo(buildSparks, []);
  const stones = React.useMemo(buildStones, []);
  const flames = React.useMemo(buildFlames, []);
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

  const horizonY = height * 0.40;
  const cx = width * 0.50;
  const cy = height * 0.60;
  const sitterRX = width * 0.30;
  const sitterRY = height * 0.18;

  // Sitters around fire (3/4 view ellipse)
  const sitterNodes = sitters.map((s, i) => {
    const a = s.baseAngle;
    const sx = cx + Math.cos(a) * sitterRX;
    const sy = cy + Math.sin(a) * sitterRY;
    const figH = 90 * s.height;
    const fill = "rgba(6, 3, 10, 0.96)";
    const bob = Math.sin(frame * 0.025 + s.bobPhase) * (1.5 + bass * 3);
    // Direction toward center
    const dx = cx - sx;
    const dy = cy - sy;
    const dlen = Math.sqrt(dx * dx + dy * dy);
    const tx = dx / dlen;
    const ty = dy / dlen;
    return (
      <g key={`s-${i}`}>
        {/* Body (seated triangle) */}
        <path
          d={`M ${sx - figH * 0.34} ${sy + figH * 0.28}
              Q ${sx - figH * 0.30} ${sy} ${sx - figH * 0.16} ${sy - figH * 0.16}
              L ${sx + figH * 0.16} ${sy - figH * 0.16}
              Q ${sx + figH * 0.30} ${sy} ${sx + figH * 0.34} ${sy + figH * 0.28}
              L ${sx + figH * 0.40} ${sy + figH * 0.32}
              L ${sx - figH * 0.40} ${sy + figH * 0.32} Z`}
          fill={fill}
        />
        {/* Knees protruding forward */}
        <ellipse cx={sx + tx * figH * 0.16} cy={sy + ty * figH * 0.16 + figH * 0.18} rx={figH * 0.18} ry={figH * 0.10} fill={fill} />
        {/* Head */}
        <circle cx={sx} cy={sy - figH * 0.28 + bob} r={figH * 0.16} fill={fill} />
        {/* Hat */}
        {s.hatType === 1 && (
          <ellipse cx={sx} cy={sy - figH * 0.42 + bob} rx={figH * 0.26} ry={figH * 0.07} fill={fill} />
        )}
        {s.hatType === 2 && (
          <rect x={sx - figH * 0.18} y={sy - figH * 0.36 + bob} width={figH * 0.36} height={figH * 0.06} fill={fill} />
        )}
        {/* Arms (resting forward toward fire if pose==0; raised if pose==1; crossed if pose==2) */}
        {s.pose === 0 && (
          <line
            x1={sx - figH * 0.12}
            y1={sy + figH * 0.04}
            x2={sx + tx * figH * 0.36}
            y2={sy + ty * figH * 0.36 + figH * 0.04}
            stroke={fill}
            strokeWidth={figH * 0.07}
            strokeLinecap="round"
          />
        )}
        {s.pose === 1 && (
          <>
            <line
              x1={sx - figH * 0.12}
              y1={sy + figH * 0.04}
              x2={sx - figH * 0.20}
              y2={sy - figH * 0.30}
              stroke={fill}
              strokeWidth={figH * 0.07}
              strokeLinecap="round"
            />
            <line
              x1={sx + figH * 0.12}
              y1={sy + figH * 0.04}
              x2={sx + figH * 0.20}
              y2={sy - figH * 0.30}
              stroke={fill}
              strokeWidth={figH * 0.07}
              strokeLinecap="round"
            />
          </>
        )}
        {s.pose === 2 && (
          <path
            d={`M ${sx - figH * 0.12} ${sy + figH * 0.04}
                Q ${sx} ${sy + figH * 0.18} ${sx + figH * 0.12} ${sy + figH * 0.04}`}
            stroke={fill}
            strokeWidth={figH * 0.07}
            strokeLinecap="round"
            fill="none"
          />
        )}
        {/* Prop */}
        {s.prop === 1 && (
          /* guitar */
          <g>
            <ellipse cx={sx + tx * figH * 0.10 - 6} cy={sy + figH * 0.16} rx={figH * 0.18} ry={figH * 0.08} fill={fill} />
            <rect x={sx + tx * figH * 0.10 - 4} y={sy + figH * 0.04} width={4} height={figH * 0.30} fill={fill} />
          </g>
        )}
        {s.prop === 2 && (
          /* drum */
          <ellipse cx={sx + tx * figH * 0.18} cy={sy + figH * 0.20} rx={figH * 0.16} ry={figH * 0.10} fill={fill} />
        )}
        {/* Fire glow on body */}
        <ellipse
          cx={sx - tx * figH * 0.14}
          cy={sy - ty * figH * 0.14}
          rx={figH * 0.28}
          ry={figH * 0.36}
          fill={`hsl(${tintHue + 14}, 95%, 60%)`}
          opacity={0.20 * fireGlow}
        />
      </g>
    );
  });

  // Stones in a ring around the fire base
  const stoneNodes = stones.map((s, i) => {
    const a = s.angle;
    const sR = 56;
    const sx = cx + Math.cos(a) * sR;
    const sy = cy + Math.sin(a) * sR * 0.4 + 30;
    return (
      <ellipse
        key={`stone-${i}`}
        cx={sx}
        cy={sy}
        rx={10 * s.size}
        ry={6 * s.size}
        fill={`rgba(${40 + s.shade * 30}, ${36 + s.shade * 28}, ${30 + s.shade * 25}, 0.95)`}
      />
    );
  });

  // Flames at center
  const flameNodes = flames.map((fl, i) => {
    const px = cx + fl.x * width;
    const py = cy + 28;
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
        <path
          d={`M ${px - fW * 1.2} ${py}
              Q ${px - fW * 1.2} ${py - fH * 0.6} ${px} ${py - fH}
              Q ${px + fW * 1.2} ${py - fH * 0.6} ${px + fW * 1.2} ${py}
              Z`}
          fill={cDeep}
          opacity={0.85}
        />
        <path
          d={`M ${px - fW * 0.7} ${py}
              Q ${px - fW * 0.8} ${py - fH * 0.55} ${px} ${py - fH * 0.92}
              Q ${px + fW * 0.8} ${py - fH * 0.55} ${px + fW * 0.7} ${py}
              Z`}
          fill={cMid}
          opacity={0.92}
        />
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

  // Sparks
  const sparkNodes = sparks.map((s, i) => {
    const t = ((frame * tempoFactor + s.spawnOffset) % s.lifeSpan) / s.lifeSpan;
    const rise = t * s.lifeSpan * s.riseSpeed * height;
    const px = s.baseX * width + Math.sin((frame + s.spawnOffset) * s.driftFreq + s.driftPhase) * s.driftAmp;
    const py = cy + 28 - rise;
    if (py < height * 0.04) return null;
    const lifeFade = 1 - t;
    const flicker = 0.5 + Math.sin((frame + s.spawnOffset) * s.flickerSpeed) * 0.4;
    const sz = s.size * beatPulse;
    const hue = (tintHue + s.hueOffset + 360) % 360;
    const cCore = `hsl(${hue + 22}, 100%, 90%)`;
    const cMid = `hsl(${hue + 6}, 95%, 65%)`;
    const cOuter = `hsl(${hue - 8}, 90%, 45%)`;
    return (
      <g key={`sp-${i}`} style={{ mixBlendMode: "screen" }}>
        <circle cx={px} cy={py} r={sz * 8} fill={cOuter} opacity={0.10 * lifeFade * flicker * fireGlow} />
        <circle cx={px} cy={py} r={sz * 4} fill={cMid} opacity={0.22 * lifeFade * flicker * fireGlow} />
        <circle cx={px} cy={py} r={sz * 2} fill={cMid} opacity={0.55 * lifeFade * flicker} />
        <circle cx={px} cy={py} r={sz * 0.9} fill={cCore} opacity={0.95 * lifeFade * flicker} />
      </g>
    );
  });

  // Trees
  const treeNodes = trees.map((t, i) => {
    const tx = t.x * width;
    const ty = horizonY - 4;
    const ts = t.size;
    if (t.treeType === 0) {
      return (
        <g key={`tr-${i}`}>
          <rect x={tx - 4 * ts} y={ty} width={8 * ts} height={20 * ts} fill="rgba(8, 6, 12, 0.96)" />
          <path d={`M ${tx - 32 * ts} ${ty} L ${tx} ${ty - 86 * ts} L ${tx + 32 * ts} ${ty} Z`} fill="rgba(10, 16, 12, 0.96)" />
          <path d={`M ${tx - 26 * ts} ${ty - 22 * ts} L ${tx} ${ty - 76 * ts} L ${tx + 26 * ts} ${ty - 22 * ts} Z`} fill="rgba(14, 22, 16, 0.96)" />
        </g>
      );
    }
    return (
      <g key={`tr-${i}`}>
        <rect x={tx - 5 * ts} y={ty} width={10 * ts} height={22 * ts} fill="rgba(8, 6, 12, 0.96)" />
        <circle cx={tx} cy={ty - 36 * ts} r={36 * ts} fill="rgba(10, 16, 12, 0.96)" />
        <circle cx={tx - 18 * ts} cy={ty - 28 * ts} r={22 * ts} fill="rgba(8, 14, 10, 0.96)" />
        <circle cx={tx + 18 * ts} cy={ty - 28 * ts} r={22 * ts} fill="rgba(8, 14, 10, 0.96)" />
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
    const rise = t * (height * 0.6);
    const px = s.x * width + Math.sin((frame + s.spawnOffset) * 0.01 + s.phase) * 16;
    const py = cy - rise;
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

  // Ground glow under each sitter (light pool from fire)
  const sitterGlows = sitters.map((s, i) => {
    const a = s.baseAngle;
    const sx = cx + Math.cos(a) * sitterRX;
    const sy = cy + Math.sin(a) * sitterRY + 30;
    return (
      <ellipse
        key={`gl-${i}`}
        cx={sx}
        cy={sy}
        rx={50}
        ry={14}
        fill={`hsl(${tintHue + 14}, 95%, 60%)`}
        opacity={0.18 * fireGlow}
      />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="cc-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <linearGradient id="cc-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${tintHue}, 35%, 14%)`} />
            <stop offset="100%" stopColor="rgba(4, 2, 4, 0.98)" />
          </linearGradient>
          <radialGradient id="cc-firewash" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={`hsl(${tintHue + 24}, 95%, 80%)`} stopOpacity="0.85" />
            <stop offset="40%" stopColor={`hsl(${tintHue}, 90%, 55%)`} stopOpacity="0.40" />
            <stop offset="100%" stopColor={`hsl(${tintHue - 14}, 80%, 35%)`} stopOpacity="0" />
          </radialGradient>
          <filter id="cc-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#cc-sky)" />

        {/* Stars */}
        <g>{starNodes}</g>

        {/* Trees */}
        <g>{treeNodes}</g>

        {/* Ground */}
        <rect x={0} y={horizonY} width={width} height={height - horizonY} fill="url(#cc-ground)" />

        {/* Firewash glow */}
        <ellipse
          cx={cx}
          cy={cy + 10}
          rx={300 + bass * 60}
          ry={140 + bass * 30}
          fill="url(#cc-firewash)"
          opacity={fireGlow}
          style={{ mixBlendMode: "screen" }}
        />

        {/* Ground glows under sitters */}
        <g style={{ mixBlendMode: "screen" }}>{sitterGlows}</g>

        {/* Stones around fire base */}
        <g>{stoneNodes}</g>

        {/* Smoke */}
        <g filter="url(#cc-blur)">{smokeNodes}</g>

        {/* Onset flare */}
        {onsetFlare > 0 && (
          <ellipse
            cx={cx}
            cy={cy + 10}
            rx={360}
            ry={200}
            fill={`hsl(${tintHue + 24}, 95%, 80%)`}
            opacity={onsetFlare * 0.18}
            style={{ mixBlendMode: "screen" }}
          />
        )}

        {/* Sitters */}
        <g>{sitterNodes}</g>

        {/* Flames */}
        <g>{flameNodes}</g>

        {/* Sparks */}
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
