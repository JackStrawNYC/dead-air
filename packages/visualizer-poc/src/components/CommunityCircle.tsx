/**
 * CommunityCircle — A+++ overlay: top-down view of a circle of dancers
 * holding hands around a central campfire, with an outer ring of seated
 * watchers, surrounded by a forest clearing at twilight. 16 inner dancers
 * connected by hand-link arcs, 24 outer onlookers, central fire with
 * flames and ember pulse, ring of stones, scattered sit-mats, drifting
 * smoke plumes, fireflies, and a starry sky vignette around the edges.
 *
 * Audio reactivity:
 *   slowEnergy   → fire warmth and ground glow
 *   energy       → dancer arm raise and rotation speed
 *   bass         → fire size pulse + stomp
 *   beatDecay    → ember burst + ring sync
 *   onsetEnvelope→ flame flare
 *   chromaHue    → ground tint and aura color
 *   tempoFactor  → circle rotation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 800;
const INNER_DANCERS = 16;
const OUTER_WATCHERS = 24;
const STONE_COUNT = 18;
const FIREFLY_COUNT = 36;
const STAR_COUNT = 70;
const SMOKE_PLUMES = 8;
const TREE_COUNT = 14;

interface Dancer {
  baseAngle: number;
  bodyShade: number;
  swayPhase: number;
  armPhase: number;
  hatType: 0 | 1 | 2;
  height: number;
}

interface Watcher {
  baseAngle: number;
  bodyShade: number;
  bobPhase: number;
  height: number;
}

interface Stone {
  angle: number;
  size: number;
  shade: number;
}

interface Firefly {
  angle: number;
  radius: number;
  size: number;
  flickerSpeed: number;
  phase: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

interface SmokePlume {
  angle: number;
  drift: number;
  rx: number;
  ry: number;
  phase: number;
}

interface Tree {
  angle: number;
  size: number;
  treeType: 0 | 1 | 2;
}

function buildInner(): Dancer[] {
  const rng = seeded(42_881_031);
  return Array.from({ length: INNER_DANCERS }, (_, i) => ({
    baseAngle: (i / INNER_DANCERS) * Math.PI * 2,
    bodyShade: 0.06 + rng() * 0.10,
    swayPhase: rng() * Math.PI * 2,
    armPhase: rng() * Math.PI * 2,
    hatType: Math.floor(rng() * 3) as 0 | 1 | 2,
    height: 0.85 + rng() * 0.30,
  }));
}

function buildOuter(): Watcher[] {
  const rng = seeded(57_012_204);
  return Array.from({ length: OUTER_WATCHERS }, (_, i) => ({
    baseAngle: (i / OUTER_WATCHERS) * Math.PI * 2 + (rng() - 0.5) * 0.08,
    bodyShade: 0.06 + rng() * 0.10,
    bobPhase: rng() * Math.PI * 2,
    height: 0.7 + rng() * 0.35,
  }));
}

function buildStones(): Stone[] {
  const rng = seeded(83_339_927);
  return Array.from({ length: STONE_COUNT }, (_, i) => ({
    angle: (i / STONE_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.10,
    size: 0.7 + rng() * 0.6,
    shade: 0.2 + rng() * 0.2,
  }));
}

function buildFireflies(): Firefly[] {
  const rng = seeded(64_488_119);
  return Array.from({ length: FIREFLY_COUNT }, () => ({
    angle: rng() * Math.PI * 2,
    radius: 0.16 + rng() * 0.34,
    size: 1.0 + rng() * 1.6,
    flickerSpeed: 0.04 + rng() * 0.08,
    phase: rng() * Math.PI * 2,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(72_005_881);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    size: 0.4 + rng() * 1.4,
    phase: rng() * Math.PI * 2,
  }));
}

function buildSmoke(): SmokePlume[] {
  const rng = seeded(38_117_046);
  return Array.from({ length: SMOKE_PLUMES }, (_, i) => ({
    angle: (i / SMOKE_PLUMES) * Math.PI * 2 + rng() * 0.5,
    drift: 0.0006 + rng() * 0.0014,
    rx: 30 + rng() * 26,
    ry: 18 + rng() * 16,
    phase: rng() * Math.PI * 2,
  }));
}

function buildTrees(): Tree[] {
  const rng = seeded(91_660_523);
  return Array.from({ length: TREE_COUNT }, (_, i) => ({
    angle: (i / TREE_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.08,
    size: 0.9 + rng() * 0.7,
    treeType: Math.floor(rng() * 3) as 0 | 1 | 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CommunityCircle: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const inner = React.useMemo(buildInner, []);
  const outer = React.useMemo(buildOuter, []);
  const stones = React.useMemo(buildStones, []);
  const fireflies = React.useMemo(buildFireflies, []);
  const stars = React.useMemo(buildStars, []);
  const smokes = React.useMemo(buildSmoke, []);
  const trees = React.useMemo(buildTrees, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const fireGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.6, 1.2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const energy = snap.energy;
  const bass = snap.bass;
  const beatPulse = 1 + snap.beatDecay * 0.4;
  const onsetFlare = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;

  const baseHue = 22;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.4) % 360 + 360) % 360;
  const fireCore = `hsl(${tintHue + 14}, 95%, 78%)`;
  const fireOuter = `hsl(${tintHue}, 90%, 55%)`;
  const fireDeep = `hsl(${(tintHue - 14 + 360) % 360}, 85%, 35%)`;

  const cx = width * 0.5;
  const cy = height * 0.52;
  const innerR = Math.min(width, height) * 0.21;
  const outerR = Math.min(width, height) * 0.35;
  const treeR = Math.min(width, height) * 0.46;

  const rotation = frame * 0.003 * tempoFactor * (0.8 + energy * 0.6);

  // ===== ground / clearing gradient =====
  const groundColor = `hsl(${(tintHue + 20) % 360}, 28%, 14%)`;
  const grassColor = `hsl(${(tintHue + 70) % 360}, 32%, 12%)`;

  // ===== fire =====
  const fireR = 36 + bass * 18 + beatPulse * 6;
  const flameLayers = Array.from({ length: 6 }).map((_, i) => {
    const r = fireR * (1.4 - i * 0.16) * (1 + Math.sin(frame * 0.18 + i) * 0.05);
    const opacity = 0.20 + i * 0.12;
    return (
      <circle
        key={`flame-${i}`}
        cx={cx}
        cy={cy}
        r={r}
        fill={i < 2 ? fireDeep : i < 4 ? fireOuter : fireCore}
        opacity={opacity}
      />
    );
  });

  // ===== inner dancers =====
  const innerNodes = inner.map((d, i) => {
    const a = d.baseAngle + rotation;
    const dx = cx + Math.cos(a) * innerR;
    const dy = cy + Math.sin(a) * innerR;
    // figure faces center; their "up" is radial outward
    const figH = 50 * d.height;
    const sway = Math.sin(frame * 0.025 + d.swayPhase) * (3 + bass * 6);
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const headX = dx + ux * figH * 0.2;
    const headY = dy + uy * figH * 0.2;
    const armRaise = 0.6 + Math.sin(frame * 0.04 + d.armPhase) * 0.4 + energy * 0.5;
    const fillR = Math.round(8 + d.bodyShade * 12);
    const fill = `rgba(${fillR},${fillR + 2},${fillR + 4},0.95)`;
    // hands link to neighbors via the hand-link arc layer
    return (
      <g key={`inner-${i}`}>
        {/* Body torso (oval) */}
        <ellipse cx={dx} cy={dy} rx={figH * 0.18} ry={figH * 0.30} fill={fill} />
        {/* Head */}
        <circle cx={headX} cy={headY} r={figH * 0.18} fill={fill} />
        {/* Arms outstretched perpendicular to radius (tangential), reaching to neighbors */}
        {(() => {
          const tx = -uy;
          const ty = ux;
          const armLen = (Math.PI * 2 * innerR / INNER_DANCERS) * 0.55;
          const armUp = armLen * armRaise * 0.18;
          const lhx = dx + tx * armLen * 0.5 - ux * armUp;
          const lhy = dy + ty * armLen * 0.5 - uy * armUp;
          const rhx = dx - tx * armLen * 0.5 - ux * armUp;
          const rhy = dy - ty * armLen * 0.5 - uy * armUp;
          return (
            <>
              <line x1={dx} y1={dy} x2={lhx} y2={lhy} stroke={fill} strokeWidth={figH * 0.08} strokeLinecap="round" />
              <line x1={dx} y1={dy} x2={rhx} y2={rhy} stroke={fill} strokeWidth={figH * 0.08} strokeLinecap="round" />
            </>
          );
        })()}
        {/* Hat */}
        {d.hatType === 1 && (
          <ellipse cx={headX} cy={headY - figH * 0.15} rx={figH * 0.28} ry={figH * 0.08} fill={fill} />
        )}
        {d.hatType === 2 && (
          <path
            d={`M ${headX - figH * 0.22} ${headY}
                Q ${headX} ${headY - figH * 0.32} ${headX + figH * 0.22} ${headY} Z`}
            fill={fill}
          />
        )}
        {/* Fire glow on dancer */}
        <circle cx={dx + sway * 0.2} cy={dy} r={figH * 0.5} fill={fireOuter} opacity={0.10 * fireGlow} />
      </g>
    );
  });

  // hand-link arcs between adjacent inner dancers
  const handLinks = inner.map((_, i) => {
    const a1 = inner[i].baseAngle + rotation;
    const a2 = inner[(i + 1) % INNER_DANCERS].baseAngle + rotation;
    const x1 = cx + Math.cos(a1) * innerR;
    const y1 = cy + Math.sin(a1) * innerR;
    const x2 = cx + Math.cos(a2) * innerR;
    const y2 = cy + Math.sin(a2) * innerR;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const am = (a1 + a2) / 2;
    const sag = innerR * 0.06 + Math.sin(frame * 0.04 + i) * 2;
    const cmx = mx + Math.cos(am) * sag;
    const cmy = my + Math.sin(am) * sag;
    return (
      <path
        key={`link-${i}`}
        d={`M ${x1} ${y1} Q ${cmx} ${cmy} ${x2} ${y2}`}
        fill="none"
        stroke="rgba(20, 14, 10, 0.85)"
        strokeWidth={3}
        strokeLinecap="round"
      />
    );
  });

  // ===== stones around the fire =====
  const stoneNodes = stones.map((s, i) => {
    const a = s.angle;
    const sR = fireR * 1.6;
    const sx = cx + Math.cos(a) * sR;
    const sy = cy + Math.sin(a) * sR;
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

  // ===== outer ring of seated watchers =====
  const watcherNodes = outer.map((w, i) => {
    const a = w.baseAngle;
    const wx = cx + Math.cos(a) * outerR;
    const wy = cy + Math.sin(a) * outerR;
    const figH = 36 * w.height;
    const fillR = Math.round(6 + w.bodyShade * 10);
    const fill = `rgba(${fillR},${fillR + 2},${fillR + 6},0.92)`;
    const bob = Math.sin(frame * 0.025 + w.bobPhase) * 1.5;
    return (
      <g key={`watch-${i}`}>
        {/* Seated body (rounded triangle/blob) */}
        <ellipse cx={wx} cy={wy + bob} rx={figH * 0.36} ry={figH * 0.28} fill={fill} />
        {/* Head */}
        <circle
          cx={wx + Math.cos(a + Math.PI) * figH * 0.05}
          cy={wy + Math.sin(a + Math.PI) * figH * 0.05 + bob - figH * 0.18}
          r={figH * 0.16}
          fill={fill}
        />
      </g>
    );
  });

  // ===== smoke plumes rising from fire =====
  const smokeNodes = smokes.map((sm, i) => {
    const t = frame * sm.drift;
    const liftA = sm.angle + t * 0.6;
    const liftR = (t * 80) % 220;
    const sx = cx + Math.cos(liftA) * (liftR * 0.3);
    const sy = cy - liftR;
    const fade = 1 - liftR / 220;
    return (
      <ellipse
        key={`smoke-${i}`}
        cx={sx + Math.sin(frame * 0.02 + sm.phase) * 4}
        cy={sy}
        rx={sm.rx * (1 + (1 - fade) * 0.6)}
        ry={sm.ry * (1 + (1 - fade) * 0.4)}
        fill={`rgba(60, 50, 60, ${fade * 0.45})`}
      />
    );
  });

  // ===== fireflies in the meadow =====
  const fireflyNodes = fireflies.map((f, i) => {
    const t = frame * f.flickerSpeed + f.phase;
    const r = (f.radius + Math.sin(t * 0.3) * 0.02) * Math.min(width, height);
    const a = f.angle + t * 0.05;
    const fx = cx + Math.cos(a) * r;
    const fy = cy + Math.sin(a) * r;
    const blink = 0.3 + Math.abs(Math.sin(t * 1.2)) * 0.7;
    return (
      <g key={`fly-${i}`}>
        <circle cx={fx} cy={fy} r={f.size * 4} fill="rgba(255, 220, 100, 0.10)" opacity={blink} />
        <circle cx={fx} cy={fy} r={f.size * 1.6} fill="rgba(255, 240, 160, 0.85)" opacity={blink} />
      </g>
    );
  });

  // ===== stars in sky vignette =====
  const starNodes = stars.map((s, i) => {
    const tw = 0.5 + Math.sin(frame * 0.05 + s.phase) * 0.45;
    return <circle key={`star-${i}`} cx={s.x * width} cy={s.y * height} r={s.size * tw} fill="rgba(240, 232, 220, 0.85)" />;
  });

  // ===== background trees encircling =====
  const treeNodes = trees.map((tr, i) => {
    const a = tr.angle;
    const tx = cx + Math.cos(a) * treeR;
    const ty = cy + Math.sin(a) * treeR * 0.95;
    const ts = tr.size;
    if (tr.treeType === 0) {
      // pine
      return (
        <g key={`tree-${i}`}>
          <rect x={tx - 4 * ts} y={ty} width={8 * ts} height={20 * ts} fill="rgba(20, 14, 8, 0.95)" />
          <path
            d={`M ${tx - 30 * ts} ${ty + 8}
                L ${tx} ${ty - 80 * ts}
                L ${tx + 30 * ts} ${ty + 8} Z`}
            fill="rgba(14, 22, 14, 0.95)"
          />
          <path
            d={`M ${tx - 26 * ts} ${ty - 14 * ts}
                L ${tx} ${ty - 70 * ts}
                L ${tx + 26 * ts} ${ty - 14 * ts} Z`}
            fill="rgba(20, 30, 18, 0.95)"
          />
        </g>
      );
    }
    if (tr.treeType === 1) {
      // round oak
      return (
        <g key={`tree-${i}`}>
          <rect x={tx - 5 * ts} y={ty} width={10 * ts} height={18 * ts} fill="rgba(20, 14, 8, 0.95)" />
          <circle cx={tx} cy={ty - 30 * ts} r={36 * ts} fill="rgba(18, 26, 14, 0.95)" />
          <circle cx={tx - 18 * ts} cy={ty - 22 * ts} r={22 * ts} fill="rgba(14, 22, 10, 0.92)" />
          <circle cx={tx + 18 * ts} cy={ty - 22 * ts} r={22 * ts} fill="rgba(14, 22, 10, 0.92)" />
        </g>
      );
    }
    // willow
    return (
      <g key={`tree-${i}`}>
        <rect x={tx - 4 * ts} y={ty} width={8 * ts} height={22 * ts} fill="rgba(20, 14, 8, 0.95)" />
        <ellipse cx={tx} cy={ty - 24 * ts} rx={42 * ts} ry={32 * ts} fill="rgba(16, 24, 12, 0.92)" />
        {Array.from({ length: 5 }).map((_, k) => (
          <path
            key={k}
            d={`M ${tx - 30 * ts + k * 15 * ts} ${ty - 22 * ts}
                Q ${tx - 28 * ts + k * 15 * ts} ${ty + 4} ${tx - 32 * ts + k * 15 * ts} ${ty + 14}`}
            stroke="rgba(14, 22, 12, 0.85)"
            strokeWidth={1.4}
            fill="none"
          />
        ))}
      </g>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <radialGradient id="cc-sky" cx="0.5" cy="0.5" r="0.7">
            <stop offset="0%" stopColor={groundColor} />
            <stop offset="60%" stopColor={`hsl(${(tintHue + 230) % 360}, 28%, 8%)`} />
            <stop offset="100%" stopColor="rgba(2, 1, 6, 0.98)" />
          </radialGradient>
          <radialGradient id="cc-clearing" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={`hsla(${tintHue}, 60%, 30%, 0.4)`} />
            <stop offset="60%" stopColor={`hsla(${tintHue}, 35%, 20%, 0.18)`} />
            <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
          </radialGradient>
          <radialGradient id="cc-fireglow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={fireCore} stopOpacity="0.85" />
            <stop offset="30%" stopColor={fireOuter} stopOpacity="0.55" />
            <stop offset="100%" stopColor={fireDeep} stopOpacity="0" />
          </radialGradient>
          <filter id="cc-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky / vignette */}
        <rect width={width} height={height} fill="url(#cc-sky)" />

        {/* Stars */}
        <g>{starNodes}</g>

        {/* Background trees ring */}
        <g>{treeNodes}</g>

        {/* Clearing ground */}
        <ellipse cx={cx} cy={cy} rx={treeR * 0.95} ry={treeR * 0.78} fill={grassColor} opacity={0.85} />

        {/* Fire wash */}
        <ellipse cx={cx} cy={cy} rx={innerR * 1.6} ry={innerR * 1.4} fill="url(#cc-clearing)" />
        <circle cx={cx} cy={cy} r={fireR * 4 * fireGlow} fill="url(#cc-fireglow)" style={{ mixBlendMode: "screen" }} />

        {/* Outer watchers */}
        <g>{watcherNodes}</g>

        {/* Stones */}
        <g>{stoneNodes}</g>

        {/* Inner dancers */}
        <g>{innerNodes}</g>
        <g>{handLinks}</g>

        {/* Fire flames */}
        <g style={{ mixBlendMode: "screen" }}>{flameLayers}</g>

        {/* Onset flare */}
        {onsetFlare > 0 && (
          <circle cx={cx} cy={cy} r={fireR * 6} fill={fireCore} opacity={onsetFlare * 0.15} style={{ mixBlendMode: "screen" }} />
        )}

        {/* Smoke plumes */}
        <g filter="url(#cc-blur)">{smokeNodes}</g>

        {/* Fireflies */}
        <g style={{ mixBlendMode: "screen" }}>{fireflyNodes}</g>

        {/* Final atmospheric wash */}
        <rect
          width={width}
          height={height}
          fill={`hsla(${tintHue}, 60%, 40%, ${0.04 + fireGlow * 0.04})`}
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
