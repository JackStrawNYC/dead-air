/**
 * FogBank — A+++ overlay: dense fog filling the frame in 5 depth layers,
 * with faint silhouettes barely visible (trees, distant figures, distant
 * stage). Light rays cut through the fog from above. Wispy tendrils drift
 * laterally. The whole feels dreamy and uncertain. Bass slowly rocks the
 * fog laterally; energy thickens the wisps; chromaHue tints the moonlight.
 *
 * Audio reactivity:
 *   slowEnergy   → fog density and ray brightness
 *   energy       → tendril speed and amplitude
 *   bass         → lateral drift
 *   beatDecay    → ray pulse
 *   onsetEnvelope→ flash flare
 *   chromaHue    → moonlight tint
 *   tempoFactor  → drift rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 800;
const BACK_FOG = 8;
const MID_FOG = 10;
const FRONT_FOG = 12;
const TENDRIL_COUNT = 22;
const RAY_COUNT = 9;
const FIGURE_COUNT = 7;
const TREE_COUNT = 9;
const STAR_COUNT = 30;

interface FogBlob {
  x: number;
  y: number;
  rx: number;
  ry: number;
  drift: number;
  shade: number;
  phase: number;
}

interface Tendril {
  x: number;
  y: number;
  length: number;
  thickness: number;
  drift: number;
  phase: number;
}

interface Ray {
  x: number;
  width: number;
  angle: number;
  phase: number;
}

interface Figure {
  x: number;
  y: number;
  size: number;
  bobPhase: number;
  shade: number;
  isFigure: boolean;
}

interface Tree {
  x: number;
  y: number;
  size: number;
  treeType: 0 | 1;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

function buildFog(seed: number, count: number, yMin: number, yMax: number): FogBlob[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: rng(),
    y: yMin + rng() * (yMax - yMin),
    rx: 0.18 + rng() * 0.30,
    ry: 0.06 + rng() * 0.10,
    drift: 0.00008 + rng() * 0.00040,
    shade: 0.38 + rng() * 0.30,
    phase: rng() * Math.PI * 2,
  }));
}

function buildTendrils(): Tendril[] {
  const rng = seeded(45_882_607);
  return Array.from({ length: TENDRIL_COUNT }, () => ({
    x: rng(),
    y: 0.20 + rng() * 0.70,
    length: 0.18 + rng() * 0.30,
    thickness: 12 + rng() * 22,
    drift: 0.0001 + rng() * 0.00038,
    phase: rng() * Math.PI * 2,
  }));
}

function buildRays(): Ray[] {
  const rng = seeded(73_117_945);
  return Array.from({ length: RAY_COUNT }, (_, i) => ({
    x: 0.10 + (i / (RAY_COUNT - 1)) * 0.80 + (rng() - 0.5) * 0.06,
    width: 70 + rng() * 60,
    angle: -0.10 + rng() * 0.20,
    phase: rng() * Math.PI * 2,
  }));
}

function buildFigures(): Figure[] {
  const rng = seeded(89_004_338);
  return Array.from({ length: FIGURE_COUNT }, (_, i) => ({
    x: 0.10 + (i / (FIGURE_COUNT - 1)) * 0.80 + (rng() - 0.5) * 0.05,
    y: 0.62 + rng() * 0.18,
    size: 0.65 + rng() * 0.45,
    bobPhase: rng() * Math.PI * 2,
    shade: 0.05 + rng() * 0.10,
    isFigure: rng() > 0.4,
  }));
}

function buildTrees(): Tree[] {
  const rng = seeded(38_006_751);
  return Array.from({ length: TREE_COUNT }, (_, i) => ({
    x: (i / TREE_COUNT) + (rng() - 0.5) * 0.05,
    y: 0.55 + rng() * 0.20,
    size: 0.85 + rng() * 0.5,
    treeType: Math.floor(rng() * 2) as 0 | 1,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(67_881_002);
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

export const FogBank: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const backFog = React.useMemo(() => buildFog(11_991_337, BACK_FOG, 0.30, 0.65), []);
  const midFog = React.useMemo(() => buildFog(22_882_446, MID_FOG, 0.40, 0.85), []);
  const frontFog = React.useMemo(() => buildFog(33_773_555, FRONT_FOG, 0.55, 1.05), []);
  const tendrils = React.useMemo(buildTendrils, []);
  const rays = React.useMemo(buildRays, []);
  const figures = React.useMemo(buildFigures, []);
  const trees = React.useMemo(buildTrees, []);
  const stars = React.useMemo(buildStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.85;
  if (masterOpacity < 0.01) return null;

  const fogDensity = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const energy = snap.energy;
  const bass = snap.bass;
  const beatPulse = 1 + snap.beatDecay * 0.30;
  const onsetFlare = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.5) : 0;

  const baseHue = 210;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.4) % 360 + 360) % 360;
  const moonCore = `hsl(${tintHue}, 60%, 90%)`;
  const moonRay = `hsl(${tintHue}, 50%, 78%)`;
  const moonFog = `hsl(${tintHue}, 30%, 65%)`;

  const skyTop = `hsl(${(tintHue + 220) % 360}, 25%, 7%)`;
  const skyMid = `hsl(${(tintHue + 235) % 360}, 22%, 12%)`;
  const skyHorizon = `hsl(${(tintHue + 10) % 360}, 25%, 22%)`;

  const lateralDrift = Math.sin(frame * 0.005 * tempoFactor) * (8 + bass * 24);

  // ===== fog blob renderer =====
  function renderFog(blob: FogBlob, key: string, depth: 0 | 1 | 2) {
    const drift = (blob.x + frame * blob.drift * (1 + bass * 0.4)) % 1.2 - 0.1;
    const breath = 1 + Math.sin(frame * 0.012 + blob.phase) * 0.08;
    const opacity = (depth === 0 ? 0.50 : depth === 1 ? 0.42 : 0.34) * fogDensity * (0.75 + blob.shade * 0.5);
    const px = drift * width + lateralDrift * (depth === 0 ? 0.4 : depth === 1 ? 0.6 : 1.0);
    return (
      <ellipse
        key={key}
        cx={px}
        cy={blob.y * height}
        rx={blob.rx * width * breath}
        ry={blob.ry * height * breath}
        fill={`hsla(${tintHue}, 25%, ${50 + blob.shade * 20}%, ${opacity})`}
      />
    );
  }

  // ===== tendrils =====
  const tendrilNodes = tendrils.map((t, i) => {
    const drift = (t.x + frame * t.drift * (1 + energy * 0.4)) % 1.2 - 0.1;
    const px = drift * width + lateralDrift * 0.7;
    const py = t.y * height;
    const sweep = Math.sin(frame * 0.018 + t.phase) * 30;
    const len = t.length * width;
    return (
      <path
        key={`td-${i}`}
        d={`M ${px} ${py}
            Q ${px + len * 0.3} ${py + sweep * 0.5} ${px + len * 0.6} ${py + sweep * 0.8}
            T ${px + len} ${py + sweep * 1.2}`}
        stroke={moonFog}
        strokeWidth={t.thickness * (0.85 + fogDensity * 0.40)}
        strokeLinecap="round"
        fill="none"
        opacity={0.16 * fogDensity}
      />
    );
  });

  // ===== light rays from above =====
  const rayNodes = rays.map((r, i) => {
    const sx = r.x * width;
    const sy = -10;
    const angle = r.angle + Math.sin(frame * 0.008 + r.phase) * 0.04;
    const len = height * 1.05;
    const ex = sx + Math.tan(angle) * len;
    const ey = len;
    const w = r.width * (1 + energy * 0.3) * beatPulse;
    return (
      <g key={`ray-${i}`} style={{ mixBlendMode: "screen" }}>
        <path
          d={`M ${sx - w * 0.10} ${sy}
              L ${ex - w * 0.55} ${ey}
              L ${ex + w * 0.55} ${ey}
              L ${sx + w * 0.10} ${sy} Z`}
          fill={moonRay}
          opacity={0.08 * fogDensity}
        />
        <path
          d={`M ${sx - w * 0.05} ${sy}
              L ${ex - w * 0.28} ${ey}
              L ${ex + w * 0.28} ${ey}
              L ${sx + w * 0.05} ${sy} Z`}
          fill={moonRay}
          opacity={0.16 * fogDensity}
        />
        <path
          d={`M ${sx - w * 0.018} ${sy}
              L ${ex - w * 0.10} ${ey}
              L ${ex + w * 0.10} ${ey}
              L ${sx + w * 0.018} ${sy} Z`}
          fill={moonCore}
          opacity={0.28 * fogDensity * beatPulse}
        />
      </g>
    );
  });

  // ===== faint figures (people in the fog) =====
  const figureNodes = figures.map((f, i) => {
    const fx = f.x * width;
    const fy = f.y * height;
    const bob = Math.sin(frame * 0.018 + f.bobPhase) * 2;
    const figH = 100 * f.size;
    const shade = `rgba(${10 + f.shade * 20},${10 + f.shade * 20},${20 + f.shade * 20}, ${0.40 + f.shade * 0.20})`;
    if (f.isFigure) {
      return (
        <g key={`fig-${i}`}>
          <ellipse cx={fx} cy={fy + bob} rx={figH * 0.18} ry={figH * 0.45} fill={shade} />
          <circle cx={fx} cy={fy - figH * 0.36 + bob} r={figH * 0.12} fill={shade} />
        </g>
      );
    }
    // distant stage box (alternative)
    return (
      <g key={`fig-${i}`}>
        <rect x={fx - figH * 0.4} y={fy - figH * 0.4} width={figH * 0.8} height={figH * 0.4} fill={shade} />
      </g>
    );
  });

  // ===== trees in the fog =====
  const treeNodes = trees.map((t, i) => {
    const tx = t.x * width;
    const ty = t.y * height;
    const ts = t.size;
    const fade = `rgba(20, 18, 26, ${0.35 + (1 - t.y) * 0.20})`;
    if (t.treeType === 0) {
      return (
        <g key={`tr-${i}`}>
          <rect x={tx - 5 * ts} y={ty} width={10 * ts} height={20 * ts} fill={fade} />
          <path d={`M ${tx - 32 * ts} ${ty + 8} L ${tx} ${ty - 80 * ts} L ${tx + 32 * ts} ${ty + 8} Z`} fill={fade} />
        </g>
      );
    }
    return (
      <g key={`tr-${i}`}>
        <rect x={tx - 4 * ts} y={ty} width={8 * ts} height={22 * ts} fill={fade} />
        <circle cx={tx} cy={ty - 30 * ts} r={36 * ts} fill={fade} />
      </g>
    );
  });

  // ===== stars =====
  const starNodes = stars.map((s, i) => {
    const tw = 0.5 + Math.sin(frame * 0.05 + s.phase) * 0.45;
    return <circle key={`star-${i}`} cx={s.x * width} cy={s.y * height} r={s.size * tw} fill="rgba(220, 220, 230, 0.55)" />;
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="fb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyHorizon} />
          </linearGradient>
          <radialGradient id="fb-moon" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={moonCore} stopOpacity="0.5" />
            <stop offset="100%" stopColor={moonRay} stopOpacity="0" />
          </radialGradient>
          <filter id="fb-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="fb-blur-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#fb-sky)" />

        {/* Stars */}
        <g>{starNodes}</g>

        {/* Moon glow */}
        <circle cx={width * 0.78} cy={height * 0.18} r={height * 0.24} fill="url(#fb-moon)" />
        <circle cx={width * 0.78} cy={height * 0.18} r={28} fill={moonCore} opacity={0.85} />

        {/* Trees in the back (faint) */}
        <g filter="url(#fb-blur-soft)">{treeNodes}</g>

        {/* Distant figures */}
        <g filter="url(#fb-blur-soft)">{figureNodes}</g>

        {/* Back fog */}
        <g filter="url(#fb-blur)">{backFog.map((b, i) => renderFog(b, `bk-${i}`, 0))}</g>

        {/* Light rays cutting through */}
        <g>{rayNodes}</g>

        {/* Mid fog */}
        <g filter="url(#fb-blur)">{midFog.map((b, i) => renderFog(b, `md-${i}`, 1))}</g>

        {/* Tendrils */}
        <g filter="url(#fb-blur-soft)">{tendrilNodes}</g>

        {/* Front fog */}
        <g filter="url(#fb-blur)">{frontFog.map((b, i) => renderFog(b, `fn-${i}`, 2))}</g>

        {/* Onset flash */}
        {onsetFlare > 0 && (
          <rect width={width} height={height} fill={`hsla(${tintHue}, 60%, 80%, ${onsetFlare * 0.10})`} />
        )}

        {/* Final atmospheric wash */}
        <rect
          width={width}
          height={height}
          fill={`hsla(${tintHue}, 30%, 50%, ${0.06 + fogDensity * 0.05})`}
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
