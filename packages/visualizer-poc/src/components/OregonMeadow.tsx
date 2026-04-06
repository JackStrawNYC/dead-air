/**
 * OregonMeadow -- Veneta 8/27/72 Old Renaissance Faire grounds.
 * Wild dry-summer Pacific Northwest meadow: 64 tapered bezier grass blades
 * (bleached gold front, olive mid, deep green back) with seed-head clusters,
 * 14 wildflowers (iris, daisy, fireweed, lupine, aster) with stems and leaves,
 * 4 bumblebees on lissajous flight paths, hot summer haze, golden sun glow,
 * dust pollen drifting in light shafts. Wind sways everything; bass = gust,
 * slowEnergy = haze, beatDecay = pollen flicker, chromaHue = sun tint,
 * energy = bee activity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const GRASS_COUNT = 64;
const FLOWER_COUNT = 14;
const BEE_COUNT = 4;
const POLLEN_COUNT = 38;
const SHAFT_COUNT = 5;

type FlowerKind = "iris" | "daisy" | "fireweed" | "lupine" | "aster";

interface GrassBlade {
  x: number; height: number; layer: 0 | 1 | 2;
  lean: number; curve: number; swayPhase: number; swayAmp: number;
  hasSeedHead: boolean; seedCount: number;
}
interface FlowerData {
  x: number; yOffset: number; kind: FlowerKind; scale: number;
  stemHeight: number; swayPhase: number; petalRot: number;
  spikeBlooms: number; leafCount: number; leafSide: number;
}
interface BeeData {
  cx: number; cy: number; ax: number; ay: number;
  fx: number; fy: number; phase: number; size: number;
}
interface PollenMote { x: number; y: number; size: number; phase: number; driftAmp: number }

/* ------------------------------------------------------------------ */
/*  SVG defs — sun, haze, shafts, flower gradients, filters           */
/* ------------------------------------------------------------------ */
const MeadowDefs: React.FC<{ hueTint: number; hazeOpacity: number }> = ({ hueTint, hazeOpacity }) => {
  const sunHue = 45 + hueTint;
  return (
    <defs>
      <radialGradient id="om-sun" cx="50%" cy="0%" r="80%">
        <stop offset="0%" stopColor={`hsl(${sunHue},95%,82%)`} stopOpacity="0.85" />
        <stop offset="20%" stopColor={`hsl(${(sunHue + 5) % 360},90%,72%)`} stopOpacity="0.5" />
        <stop offset="55%" stopColor={`hsl(${(sunHue + 10) % 360},80%,60%)`} stopOpacity="0.18" />
        <stop offset="100%" stopColor="hsl(40,60%,50%)" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="om-haze" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor={`hsl(${(sunHue + 8) % 360},70%,75%)`} stopOpacity={hazeOpacity * 0.55} />
        <stop offset="60%" stopColor={`hsl(${(sunHue + 12) % 360},60%,65%)`} stopOpacity={hazeOpacity * 0.28} />
        <stop offset="100%" stopColor="hsl(35,50%,45%)" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="om-shaft" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor={`hsl(${sunHue},90%,80%)`} stopOpacity="0.32" />
        <stop offset="100%" stopColor={`hsl(${sunHue},80%,60%)`} stopOpacity="0" />
      </linearGradient>
      <radialGradient id="om-iris" cx="50%" cy="40%" r="70%">
        <stop offset="0%" stopColor="hsl(285,75%,72%)" />
        <stop offset="60%" stopColor="hsl(275,65%,52%)" />
        <stop offset="100%" stopColor="hsl(265,60%,38%)" />
      </radialGradient>
      <radialGradient id="om-ray" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stopColor="hsl(55,15%,98%)" />
        <stop offset="100%" stopColor="hsl(50,30%,88%)" />
      </radialGradient>
      <radialGradient id="om-disc" cx="40%" cy="40%" r="65%">
        <stop offset="0%" stopColor="hsl(48,95%,68%)" />
        <stop offset="100%" stopColor="hsl(38,90%,46%)" />
      </radialGradient>
      <linearGradient id="om-fire" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="hsl(335,80%,72%)" />
        <stop offset="100%" stopColor="hsl(325,72%,55%)" />
      </linearGradient>
      <linearGradient id="om-lup" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="hsl(255,72%,68%)" />
        <stop offset="100%" stopColor="hsl(245,65%,45%)" />
      </linearGradient>
      <radialGradient id="om-bee" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="hsl(48,95%,72%)" />
        <stop offset="100%" stopColor="hsl(35,80%,50%)" />
      </radialGradient>
      <filter id="om-haze-blur"><feGaussianBlur in="SourceGraphic" stdDeviation="6" /></filter>
      <filter id="om-bee-blur"><feGaussianBlur in="SourceGraphic" stdDeviation="0.6" /></filter>
      <filter id="om-pollen"><feGaussianBlur in="SourceGraphic" stdDeviation="1.6" /></filter>
    </defs>
  );
};

/* ------------------------------------------------------------------ */
/*  Wildflower bloom renderers                                         */
/* ------------------------------------------------------------------ */
const renderBloom = (kind: FlowerKind, cx: number, cy: number, scale: number, rot: number, blooms: number): React.ReactNode => {
  if (kind === "iris") {
    const r = 9 * scale;
    const petals: React.ReactNode[] = [];
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2 + (rot * Math.PI) / 180;
      const tx = cx + Math.cos(a) * r, ty = cy + Math.sin(a) * r;
      const w = r * 0.55, px = -Math.sin(a) * w, py = Math.cos(a) * w;
      const mx = cx + Math.cos(a) * r * 0.55, my = cy + Math.sin(a) * r * 0.55;
      petals.push(
        <path key={`ip-${p}`}
          d={`M${cx},${cy} Q${mx + px},${my + py} ${tx},${ty} Q${mx - px},${my - py} ${cx},${cy}`}
          fill="url(#om-iris)" opacity={0.86} />,
      );
    }
    return <g>{petals}<circle cx={cx} cy={cy} r={r * 0.18} fill="hsl(50,95%,65%)" opacity={0.95} /></g>;
  }
  if (kind === "daisy") {
    const r = 7 * scale;
    const rays: React.ReactNode[] = [];
    for (let p = 0; p < 8; p++) {
      const a = (p / 8) * Math.PI * 2 + (rot * Math.PI) / 180;
      const tx = cx + Math.cos(a) * r, ty = cy + Math.sin(a) * r;
      const w = r * 0.32, px = -Math.sin(a) * w, py = Math.cos(a) * w;
      const mx = cx + Math.cos(a) * r * 0.55, my = cy + Math.sin(a) * r * 0.55;
      rays.push(
        <path key={`dr-${p}`}
          d={`M${cx},${cy} Q${mx + px},${my + py} ${tx},${ty} Q${mx - px},${my - py} ${cx},${cy}`}
          fill="url(#om-ray)" opacity={0.92} />,
      );
    }
    return <g>{rays}<circle cx={cx} cy={cy} r={r * 0.32} fill="url(#om-disc)" /></g>;
  }
  if (kind === "fireweed") {
    const spike = 26 * scale;
    const out: React.ReactNode[] = [];
    for (let b = 0; b < blooms; b++) {
      const t = b / Math.max(1, blooms - 1);
      const by = cy - t * spike, side = b % 2 === 0 ? 1 : -1;
      const offX = side * (1 - t) * 2.5, br = (2.4 - t * 1.2) * scale;
      out.push(<circle key={`fw-${b}`} cx={cx + offX} cy={by} r={br} fill="url(#om-fire)" opacity={0.88} />);
      if (b < blooms - 1) {
        out.push(<circle key={`fw2-${b}`} cx={cx - offX * 0.6} cy={by - 1} r={br * 0.7} fill="url(#om-fire)" opacity={0.7} />);
      }
    }
    return <>{out}</>;
  }
  if (kind === "lupine") {
    const h = 28 * scale;
    const florets: React.ReactNode[] = [];
    for (let r = 0; r < 9; r++) {
      const t = r / 8, ry = cy - t * h, wAtRow = (1 - t * 0.85) * 4.5 * scale;
      const count = Math.max(2, Math.round(3 + (1 - t) * 2));
      for (let c = 0; c < count; c++) {
        const offX = ((c / Math.max(1, count - 1)) - 0.5) * wAtRow * 2;
        const flrR = (1.6 - t * 0.6) * scale;
        florets.push(<ellipse key={`lp-${r}-${c}`} cx={cx + offX} cy={ry} rx={flrR * 1.1} ry={flrR} fill="url(#om-lup)" opacity={0.85} />);
      }
    }
    return <>{florets}</>;
  }
  // aster
  const r = 4.5 * scale;
  const rays: React.ReactNode[] = [];
  for (let p = 0; p < 10; p++) {
    const a = (p / 10) * Math.PI * 2 + (rot * Math.PI) / 180;
    rays.push(<line key={`as-${p}`} x1={cx} y1={cy} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r}
      stroke="hsl(50,15%,96%)" strokeWidth={1.1 * scale} strokeLinecap="round" opacity={0.9} />);
  }
  return <g>{rays}<circle cx={cx} cy={cy} r={r * 0.3} fill="hsl(48,90%,62%)" /></g>;
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
interface Props { frames: EnhancedFrameData[] }

export const OregonMeadow: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, slowEnergy, chromaHue, beatDecay, bass } = snap;

  /* Pre-generate grass blades — layered (back→front) */
  const grass = React.useMemo<GrassBlade[]>(() => {
    const rng = seeded(19_720_827);
    const result: GrassBlade[] = [];
    for (let g = 0; g < GRASS_COUNT; g++) {
      const r = rng();
      const layer: 0 | 1 | 2 = r < 0.33 ? 0 : r < 0.66 ? 1 : 2;
      const heightBase = layer === 2 ? 110 : layer === 1 ? 130 : 150;
      const tall = rng() > 0.78;
      result.push({
        x: rng() * 1.08 - 0.04,
        height: heightBase + rng() * 60 + (tall ? 30 : 0),
        layer,
        lean: (rng() - 0.5) * 18,
        curve: (rng() - 0.5) * 22,
        swayPhase: rng() * Math.PI * 2,
        swayAmp: 4 + rng() * 5,
        hasSeedHead: tall && rng() > 0.45,
        seedCount: 4 + Math.floor(rng() * 5),
      });
    }
    result.sort((a, b) => a.layer - b.layer);
    return result;
  }, []);

  /* Wildflowers — clustered placement */
  const flowers = React.useMemo<FlowerData[]>(() => {
    const rng = seeded(19_720_828);
    const kinds: FlowerKind[] = ["iris", "daisy", "fireweed", "lupine", "aster"];
    const clusters = [0.16, 0.38, 0.6, 0.82].map((c) => c + (rng() - 0.5) * 0.08);
    const result: FlowerData[] = [];
    for (let f = 0; f < FLOWER_COUNT; f++) {
      result.push({
        x: clusters[f % 4] + (rng() - 0.5) * 0.12,
        yOffset: rng() * 38,
        kind: kinds[Math.floor(rng() * 5)],
        scale: 0.82 + rng() * 0.45,
        stemHeight: 42 + rng() * 60,
        swayPhase: rng() * Math.PI * 2,
        petalRot: rng() * 60,
        spikeBlooms: 6 + Math.floor(rng() * 4),
        leafCount: 2 + Math.floor(rng() * 2),
        leafSide: rng() > 0.5 ? 1 : -1,
      });
    }
    return result;
  }, []);

  /* Bees — lissajous parameters */
  const bees = React.useMemo<BeeData[]>(() => {
    const rng = seeded(19_720_829);
    return Array.from({ length: BEE_COUNT }, () => ({
      cx: 0.18 + rng() * 0.64, cy: 0.62 + rng() * 0.18,
      ax: 0.06 + rng() * 0.08, ay: 0.04 + rng() * 0.05,
      fx: 0.6 + rng() * 0.6, fy: 0.9 + rng() * 0.7,
      phase: rng() * Math.PI * 2, size: 4.5 + rng() * 2.4,
    }));
  }, []);

  /* Pollen motes */
  const pollen = React.useMemo<PollenMote[]>(() => {
    const rng = seeded(19_720_830);
    return Array.from({ length: POLLEN_COUNT }, () => ({
      x: rng(), y: 0.05 + rng() * 0.75,
      size: 0.8 + rng() * 1.8,
      phase: rng() * Math.PI * 2, driftAmp: 3 + rng() * 5,
    }));
  }, []);

  /* Light shafts */
  const shafts = React.useMemo(() => {
    const rng = seeded(19_720_831);
    return Array.from({ length: SHAFT_COUNT }, (_, i) => ({
      x: 0.12 + (i / (SHAFT_COUNT - 1)) * 0.76 + (rng() - 0.5) * 0.06,
      width: 30 + rng() * 50, tilt: (rng() - 0.5) * 8, phase: rng() * Math.PI * 2,
    }));
  }, []);

  /* Master opacity */
  const baseOpacity = interpolate(energy, [0.03, 0.28], [0.32, 0.7], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  if (baseOpacity < 0.01) return null;

  /* Audio modulations */
  const hueTint = ((chromaHue / 360) - 0.5) * 16;
  const hazeOpacity = 0.18 + slowEnergy * 0.42;
  const gust = 1 + bass * 1.8;
  const beeActivity = 0.55 + energy * 1.25;
  const sparkleBoost = 0.4 + beatDecay * 1.6;
  const swayTime = frame * 0.022 * tempoFactor;
  const groundY = height;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}
        style={{ opacity: baseOpacity, filter: "drop-shadow(0 0 8px rgba(255,200,90,0.22))" }}>
        <MeadowDefs hueTint={hueTint} hazeOpacity={hazeOpacity} />

        {/* Sun glow at top */}
        <rect x={0} y={0} width={width} height={height * 0.45} fill="url(#om-sun)" />

        {/* Light shafts streaming down */}
        {shafts.map((s, si) => {
          const sx = s.x * width + Math.sin(swayTime * 0.4 + s.phase) * 6;
          const topX = sx + s.tilt * 6, bottomX = sx - s.tilt * 6;
          const bottomY = height * 0.85, halfW = s.width * 0.5;
          return (
            <polygon key={`shaft-${si}`}
              points={`${topX - halfW * 0.4},-10 ${topX + halfW * 0.4},-10 ${bottomX + halfW},${bottomY} ${bottomX - halfW},${bottomY}`}
              fill="url(#om-shaft)" opacity={0.55 + slowEnergy * 0.25} />
          );
        })}

        {/* Hot summer haze + heat shimmer ribbons */}
        <g filter="url(#om-haze-blur)">
          <rect x={0} y={height * 0.48} width={width} height={height * 0.52} fill="url(#om-haze)" />
          {Array.from({ length: 4 }).map((_, ri) => (
            <ellipse key={`hr-${ri}`} cx={width * 0.5}
              cy={height * (0.55 + ri * 0.08) + Math.sin(swayTime * 1.6 + ri) * 4}
              rx={width * 0.55} ry={6 + slowEnergy * 4}
              fill={`hsl(${(50 + hueTint) % 360},65%,72%)`}
              opacity={0.08 + slowEnergy * 0.1} />
          ))}
        </g>

        {/* Pollen motes drifting */}
        <g filter="url(#om-pollen)">
          {pollen.map((p, pi) => {
            const px = p.x * width + Math.sin(swayTime * 0.6 + p.phase) * p.driftAmp;
            const py = p.y * height + Math.cos(swayTime * 0.4 + p.phase) * p.driftAmp * 0.6;
            const tw = 0.5 + 0.5 * Math.sin(frame * 0.18 + p.phase * 3);
            const op = Math.min((0.35 + tw * 0.45) * sparkleBoost, 1);
            return (
              <circle key={`pl-${pi}`} cx={px} cy={py} r={p.size * (0.85 + tw * 0.4)}
                fill={`hsl(${(50 + hueTint) % 360},90%,${78 + tw * 12}%)`} opacity={op} />
            );
          })}
        </g>

        {/* Grass blades — back to front, tapered bezier */}
        {grass.map((blade, gi) => {
          const bx = blade.x * width, by = groundY;
          const sway = Math.sin(swayTime + blade.swayPhase) * blade.swayAmp * gust;
          const tipX = bx + blade.lean + sway, tipY = by - blade.height;
          const c1x = bx + blade.curve * 0.3 + sway * 0.25, c1y = by - blade.height * 0.4;
          const c2x = bx + blade.curve + sway * 0.7, c2y = by - blade.height * 0.75;
          const perpX = 1.2;

          const hue = blade.layer === 2 ? 48 + hueTint : blade.layer === 1 ? 78 : 105;
          const sat = blade.layer === 2 ? 55 : blade.layer === 1 ? 38 : 45;
          const light = blade.layer === 2 ? 62 + slowEnergy * 8
            : blade.layer === 1 ? 38 + slowEnergy * 6 : 26 + slowEnergy * 5;
          const op = blade.layer === 2 ? 0.78 : blade.layer === 1 ? 0.7 : 0.62;

          return (
            <g key={`gb-${gi}`}>
              <path
                d={`M${bx - perpX},${by} Q${c1x},${c1y} ${c2x},${c2y} T${tipX},${tipY} Q${c2x + 0.4},${c2y + 0.6} ${c1x + 0.4},${c1y + 0.6} Q${bx + perpX * 0.4},${by - 1} ${bx + perpX},${by} Z`}
                fill={`hsl(${hue},${sat}%,${light}%)`} opacity={op} />
              {blade.hasSeedHead && Array.from({ length: blade.seedCount }).map((_, si) => {
                const sf = si / Math.max(1, blade.seedCount - 1);
                return (
                  <ellipse key={`sh-${si}`}
                    cx={tipX + (sf - 0.5) * 4}
                    cy={tipY + (1 - (0.78 + sf * 0.22)) * blade.height * 0.18}
                    rx={1.2} ry={1.6}
                    fill={`hsl(${hue + 5},${sat + 10}%,${light + 12}%)`} opacity={op + 0.1} />
                );
              })}
            </g>
          );
        })}

        {/* Wildflowers — stem + leaves + bloom */}
        {flowers.map((flower, fi) => {
          const bx = flower.x * width, by = groundY - flower.yOffset;
          const sway = Math.sin(swayTime * 0.9 + flower.swayPhase) * 6 * gust;
          const tipX = bx + sway, tipY = by - flower.stemHeight;
          const c1x = bx + sway * 0.3, c1y = by - flower.stemHeight * 0.5;
          return (
            <g key={`fl-${fi}`}>
              <path d={`M${bx},${by} Q${c1x},${c1y} ${tipX},${tipY}`}
                stroke={`hsl(${95 + (fi % 3) * 8},45%,${36 + slowEnergy * 6}%)`}
                strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.78} />
              {Array.from({ length: flower.leafCount }).map((_, li) => {
                const lt = 0.35 + (li / flower.leafCount) * 0.4;
                const lx = bx + (tipX - bx) * lt, ly = by + (tipY - by) * lt;
                const side = li % 2 === 0 ? flower.leafSide : -flower.leafSide;
                return (
                  <path key={`lf-${li}`}
                    d={`M${lx},${ly} Q${lx + side * 3},${ly - 5.6} ${lx + side * 5},${ly - 3.2} Q${lx + side * 1.5},${ly - 1.6} ${lx},${ly}`}
                    fill={`hsl(${100 + (fi % 4) * 6},48%,38%)`} opacity={0.72} />
                );
              })}
              {renderBloom(flower.kind, tipX, tipY, flower.scale, flower.petalRot, flower.spikeBlooms)}
            </g>
          );
        })}

        {/* Bumblebees — lissajous flight, fuzzy body, motion-blurred wings */}
        {bees.map((bee, bi) => {
          const t = frame * 0.018 * tempoFactor * beeActivity + bee.phase;
          const bx = (bee.cx + Math.sin(t * bee.fx) * bee.ax) * width;
          const by = (bee.cy + Math.sin(t * bee.fy + 1.2) * bee.ay) * height;
          const flap = Math.sin(frame * 0.9 + bi);
          const tilt = Math.cos(t * bee.fx) * bee.fx * 12;
          const wingW = bee.size * 1.5;
          return (
            <g key={`bee-${bi}`} transform={`translate(${bx},${by}) rotate(${tilt})`}>
              <g filter="url(#om-bee-blur)">
                <ellipse cx={-bee.size * 0.2} cy={-bee.size * 0.6} rx={wingW} ry={bee.size * 0.55}
                  fill="hsl(200,40%,90%)" opacity={0.42 + flap * 0.18} />
                <ellipse cx={bee.size * 0.2} cy={-bee.size * 0.6} rx={wingW} ry={bee.size * 0.55}
                  fill="hsl(200,40%,90%)" opacity={0.42 - flap * 0.18} />
              </g>
              <ellipse cx={0} cy={0} rx={bee.size * 1.25} ry={bee.size * 0.85}
                fill="hsl(45,80%,72%)" opacity={0.18} />
              <ellipse cx={0} cy={0} rx={bee.size} ry={bee.size * 0.65} fill="url(#om-bee)" opacity={0.92} />
              <rect x={-bee.size * 0.6} y={-bee.size * 0.18} width={bee.size * 0.35} height={bee.size * 0.36}
                fill="hsl(30,30%,12%)" opacity={0.78} />
              <rect x={bee.size * 0.15} y={-bee.size * 0.18} width={bee.size * 0.35} height={bee.size * 0.36}
                fill="hsl(30,30%,12%)" opacity={0.78} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
