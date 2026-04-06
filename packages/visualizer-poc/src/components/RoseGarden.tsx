/**
 * RoseGarden -- Lush rose garden vista across the bottom third.
 *
 * A+++ quality: 14 rose bushes at 3 depth layers (back/mid/front), each bush
 * containing 3-5 blooms at different stages (bud, half-open, full bloom) with
 * 5-7 curved petals per bloom and gradient fills. Dense green foliage clusters
 * around and between blooms. Garden path suggestion (lighter ground strip),
 * lattice/trellis in background (grid of thin lines), morning dew sparkles on
 * petals (3-5 per bush, beat-reactive). Soft atmospheric haze between layers.
 *
 * Distinct from AmericanBeauty (field of stems growing up) and Roses (3 featured
 * roses with vine). This is a garden LANDSCAPE -- wide panoramic, looking across
 * rows of bushes with depth perspective.
 *
 * Audio mapping:
 *   slowEnergy  -> bloom breathing (petal openness oscillation)
 *   energy      -> dewdrop sparkle intensity + overall opacity
 *   chromaHue   -> hue shift within red/pink/crimson range
 *   beatDecay   -> dew highlight pulse
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

interface BloomDef {
  /** Offset from bush center (fraction of bush width) */
  ox: number;
  oy: number;
  /** Bloom stage: 0 = tight bud, 0.5 = half-open, 1 = full bloom */
  stage: number;
  /** Number of petals (5-7) */
  petalCount: number;
  /** Base radius of bloom in px */
  radius: number;
  /** Rotation offset for organic variety */
  rotOffset: number;
  /** Per-bloom hue nudge (-8 to +8 degrees) */
  hueNudge: number;
}

interface BushDef {
  /** X position as fraction of width (0-1) */
  x: number;
  /** Depth layer: 0 = back, 1 = mid, 2 = front */
  layer: number;
  /** Scale factor (smaller = farther) */
  scale: number;
  /** Y position as fraction of height (0-1) */
  y: number;
  /** Blooms in this bush */
  blooms: BloomDef[];
  /** Foliage seed for deterministic leaf placement */
  foliageSeed: number;
  /** Dewdrop positions (3-5 per bush) */
  dewdrops: { dx: number; dy: number; size: number; phase: number }[];
}

/* ------------------------------------------------------------------ */
/*  Petal path builder -- curved bezier petal with gradient-ready shape */
/* ------------------------------------------------------------------ */

function buildPetalPath(
  cx: number,
  cy: number,
  angle: number,
  length: number,
  width: number,
  curlAmount: number,
): string {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const perpX = -sinA;
  const perpY = cosA;

  // Tip point with slight curl
  const curlAngle = angle + curlAmount * 0.25;
  const tipX = cx + Math.cos(curlAngle) * length;
  const tipY = cy + Math.sin(curlAngle) * length;

  // Control points for left and right petal edges
  const midFrac = 0.55;
  const midX = cx + cosA * length * midFrac;
  const midY = cy + sinA * length * midFrac;

  const cp1x = midX + perpX * width * 0.9;
  const cp1y = midY + perpY * width * 0.9;
  const cp2x = midX - perpX * width * 0.9;
  const cp2y = midY - perpY * width * 0.9;

  return `M ${cx} ${cy} Q ${cp1x} ${cp1y} ${tipX} ${tipY} Q ${cp2x} ${cp2y} ${cx} ${cy} Z`;
}

/* ------------------------------------------------------------------ */
/*  Leaf cluster path -- pointed elliptical leaf                       */
/* ------------------------------------------------------------------ */

function buildLeafPath(
  cx: number,
  cy: number,
  angle: number,
  length: number,
  width: number,
): string {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const perpX = -sinA;
  const perpY = cosA;
  const tipX = cx + cosA * length;
  const tipY = cy + sinA * length;
  const midX = (cx + tipX) / 2;
  const midY = (cy + tipY) / 2;
  const cp1x = midX + perpX * width;
  const cp1y = midY + perpY * width;
  const cp2x = midX - perpX * width;
  const cp2y = midY - perpY * width;
  return `M ${cx} ${cy} Q ${cp1x} ${cp1y} ${tipX} ${tipY} Q ${cp2x} ${cp2y} ${cx} ${cy} Z`;
}

/* ------------------------------------------------------------------ */
/*  Bush data generator                                                */
/* ------------------------------------------------------------------ */

function generateBushes(rng: () => number): BushDef[] {
  const bushes: BushDef[] = [];

  // 14 bushes across 3 layers
  const bushConfigs: { x: number; layer: number }[] = [
    // Back layer (5 bushes) -- smallest, highest Y (closer to horizon)
    { x: 0.08, layer: 0 },
    { x: 0.28, layer: 0 },
    { x: 0.48, layer: 0 },
    { x: 0.68, layer: 0 },
    { x: 0.88, layer: 0 },
    // Mid layer (5 bushes)
    { x: 0.15, layer: 1 },
    { x: 0.35, layer: 1 },
    { x: 0.55, layer: 1 },
    { x: 0.75, layer: 1 },
    { x: 0.92, layer: 1 },
    // Front layer (4 bushes) -- largest, lowest Y
    { x: 0.10, layer: 2 },
    { x: 0.38, layer: 2 },
    { x: 0.62, layer: 2 },
    { x: 0.90, layer: 2 },
  ];

  const layerScales = [0.45, 0.7, 1.0];
  const layerYBase = [0.60, 0.72, 0.85];

  for (const cfg of bushConfigs) {
    const scale = layerScales[cfg.layer] * (0.85 + rng() * 0.3);
    const yJitter = (rng() - 0.5) * 0.04;
    const xJitter = (rng() - 0.5) * 0.04;

    // 3-5 blooms per bush
    const bloomCount = 3 + Math.floor(rng() * 3);
    const blooms: BloomDef[] = [];
    for (let b = 0; b < bloomCount; b++) {
      const stage = rng(); // 0=bud, 0.5=half, 1=full
      blooms.push({
        ox: (rng() - 0.5) * 0.7,
        oy: (rng() - 0.5) * 0.6 - 0.3,
        stage,
        petalCount: 5 + Math.floor(rng() * 3), // 5-7
        radius: 8 + rng() * 6,
        rotOffset: rng() * Math.PI * 2,
        hueNudge: (rng() - 0.5) * 16,
      });
    }

    // 3-5 dewdrops per bush
    const dewCount = 3 + Math.floor(rng() * 3);
    const dewdrops: BushDef["dewdrops"] = [];
    for (let d = 0; d < dewCount; d++) {
      dewdrops.push({
        dx: (rng() - 0.5) * 0.8,
        dy: (rng() - 0.5) * 0.7 - 0.2,
        size: 1.0 + rng() * 1.5,
        phase: rng() * Math.PI * 2,
      });
    }

    bushes.push({
      x: cfg.x + xJitter,
      layer: cfg.layer,
      scale,
      y: layerYBase[cfg.layer] + yJitter,
      blooms,
      foliageSeed: Math.floor(rng() * 100000),
      dewdrops,
    });
  }

  return bushes;
}

/* ------------------------------------------------------------------ */
/*  Foliage cluster renderer                                           */
/* ------------------------------------------------------------------ */

function renderFoliage(
  cx: number,
  cy: number,
  bushScale: number,
  seed: number,
  slowEnergy: number,
  chromaHue: number,
): React.ReactNode[] {
  const rng = seeded(seed);
  const leaves: React.ReactNode[] = [];
  const leafCount = 10 + Math.floor(rng() * 6);

  for (let i = 0; i < leafCount; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 10 + rng() * 25;
    const lx = cx + Math.cos(angle) * dist * bushScale;
    const ly = cy + Math.sin(angle) * dist * bushScale * 0.6;
    const leafAngle = angle + (rng() - 0.5) * 1.2;
    const leafLen = (6 + rng() * 8) * bushScale;
    const leafW = (2 + rng() * 2.5) * bushScale;

    // Green hue varies slightly per leaf
    const greenHue = 120 + rng() * 25;
    const greenSat = 40 + rng() * 20;
    const greenLight = 22 + rng() * 16 + slowEnergy * 5;
    const leafOpacity = 0.4 + rng() * 0.35;

    const path = buildLeafPath(lx, ly, leafAngle, leafLen, leafW);

    leaves.push(
      <g key={`foliage-${i}`}>
        <path
          d={path}
          fill={`hsl(${greenHue}, ${greenSat}%, ${greenLight}%)`}
          opacity={leafOpacity}
        />
        {/* Midrib vein */}
        <line
          x1={lx}
          y1={ly}
          x2={lx + Math.cos(leafAngle) * leafLen * 0.85}
          y2={ly + Math.sin(leafAngle) * leafLen * 0.85}
          stroke={`hsl(${greenHue - 5}, ${greenSat - 10}%, ${greenLight - 8}%)`}
          strokeWidth={0.4 * bushScale}
          opacity={0.35}
        />
      </g>,
    );
  }
  return leaves;
}

/* ------------------------------------------------------------------ */
/*  Single Bloom renderer                                              */
/* ------------------------------------------------------------------ */

function renderBloom(
  cx: number,
  cy: number,
  bloom: BloomDef,
  bushScale: number,
  breathe: number,
  baseHueDeg: number,
  gradIdPrefix: string,
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const effectiveStage = bloom.stage * (0.6 + breathe * 0.4);
  const r = bloom.radius * bushScale * (0.5 + effectiveStage * 0.5);

  if (r < 1.5) {
    // Tight bud -- just a small ellipse
    elements.push(
      <ellipse
        key="bud"
        cx={cx}
        cy={cy}
        rx={r * 0.6}
        ry={r}
        fill={`hsl(${baseHueDeg + bloom.hueNudge}, 75%, 35%)`}
        opacity={0.7}
        transform={`rotate(${bloom.rotOffset * (180 / Math.PI)}, ${cx}, ${cy})`}
      />,
    );
    // Bud sepals
    for (let s = 0; s < 3; s++) {
      const sa = bloom.rotOffset + (s / 3) * Math.PI * 2;
      const sepalPath = buildLeafPath(
        cx, cy, sa, r * 1.8, r * 0.5,
      );
      elements.push(
        <path
          key={`bud-sepal-${s}`}
          d={sepalPath}
          fill="hsl(130, 50%, 28%)"
          opacity={0.5}
        />,
      );
    }
    return elements;
  }

  const hueDeg = baseHueDeg + bloom.hueNudge;

  // Sepals behind bloom
  if (effectiveStage > 0.3) {
    const sepalCount = 4 + (bloom.petalCount % 2);
    for (let s = 0; s < sepalCount; s++) {
      const sa = bloom.rotOffset + (s / sepalCount) * Math.PI * 2;
      const sepalLen = r * 0.7;
      const sepalW = r * 0.2;
      const sp = buildLeafPath(cx, cy, sa, sepalLen, sepalW);
      elements.push(
        <path
          key={`sepal-${s}`}
          d={sp}
          fill="hsl(128, 50%, 26%)"
          opacity={0.45 * effectiveStage}
        />,
      );
    }
  }

  // Petals -- outer ring
  for (let p = 0; p < bloom.petalCount; p++) {
    const angle = bloom.rotOffset + (p / bloom.petalCount) * Math.PI * 2;
    const petalLen = r * (0.7 + effectiveStage * 0.3);
    const petalW = r * 0.35;
    const curl = (p % 2 === 0 ? 0.15 : -0.1) * effectiveStage;
    const path = buildPetalPath(cx, cy, angle, petalLen, petalW, curl);

    elements.push(
      <path
        key={`outer-${p}`}
        d={path}
        fill={`url(#${gradIdPrefix}-outer)`}
        opacity={0.7 + effectiveStage * 0.15}
      />,
    );

    // Subtle petal vein
    if (effectiveStage > 0.4) {
      const veinTipX = cx + Math.cos(angle) * petalLen * 0.8;
      const veinTipY = cy + Math.sin(angle) * petalLen * 0.8;
      elements.push(
        <line
          key={`vein-o-${p}`}
          x1={cx}
          y1={cy}
          x2={veinTipX}
          y2={veinTipY}
          stroke={`hsl(${hueDeg}, 60%, 25%)`}
          strokeWidth={0.3 * bushScale}
          opacity={0.15}
        />,
      );
    }
  }

  // Inner petals (fewer, tighter)
  if (effectiveStage > 0.35) {
    const innerCount = Math.max(3, bloom.petalCount - 2);
    for (let p = 0; p < innerCount; p++) {
      const angle = bloom.rotOffset + 0.3 + (p / innerCount) * Math.PI * 2;
      const petalLen = r * 0.45 * effectiveStage;
      const petalW = r * 0.25;
      const curl = (p % 2 === 0 ? 0.1 : -0.08);
      const path = buildPetalPath(cx, cy, angle, petalLen, petalW, curl);
      elements.push(
        <path
          key={`inner-${p}`}
          d={path}
          fill={`url(#${gradIdPrefix}-inner)`}
          opacity={0.8 + effectiveStage * 0.1}
        />,
      );
    }
  }

  // Central bud / pistil
  const budR = r * 0.12 * (0.5 + effectiveStage * 0.5);
  elements.push(
    <circle
      key="center"
      cx={cx}
      cy={cy}
      r={budR}
      fill={`hsl(${hueDeg + 5}, 80%, 45%)`}
      opacity={0.8}
    />,
  );
  if (effectiveStage > 0.6) {
    elements.push(
      <circle
        key="pistil"
        cx={cx}
        cy={cy}
        r={budR * 0.45}
        fill="hsl(45, 80%, 55%)"
        opacity={0.6}
      />,
    );
  }

  return elements;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export const RoseGarden: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue;
  const slowEnergy = snap.slowEnergy;

  // Pre-generate all bush data deterministically
  const bushes = useMemo(() => {
    const rng = seeded(77_042_605);
    return generateBushes(rng);
  }, []);

  // Bloom breathing from slowEnergy
  const breathe = 0.6 + slowEnergy * 0.4;

  // Hue in red/pink/crimson range (340-370 mapped)
  const baseHueDeg = 348 + (chromaHue / 360) * 22;

  // Overall opacity: gentle presence, energy-driven
  const opacity = 0.12 + energy * 0.28;

  // Dew sparkle intensity
  const dewSparkle = 0.2 + energy * 0.5 + beatDecay * 0.3;

  // Gentle sway from frame + tempo
  const swayPhase = (frame * 0.012 * tempoFactor);

  // Atmospheric haze opacity per layer (thicker for back layers)
  const hazeOpacity = [0.12 + slowEnergy * 0.06, 0.06 + slowEnergy * 0.03, 0];

  // Resolution scale factor
  const resScale = height / 1080;
  const bushBaseSize = 50 * resScale;

  // Sort bushes by layer so back renders first
  const sortedBushes = useMemo(
    () => [...bushes].sort((a, b) => a.layer - b.layer),
    [bushes],
  );

  // Trellis dimensions
  const trellisTop = height * 0.48;
  const trellisBottom = height * 0.63;
  const trellisLeft = width * 0.08;
  const trellisRight = width * 0.92;
  const trellisColCount = 18;
  const trellisRowCount = 5;

  // Garden path
  const pathTop = height * 0.78;
  const pathBottom = height * 0.84;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ opacity }}
      >
        <defs>
          {/* Gradient definitions for bloom petals -- shared across bushes */}
          <radialGradient id="rg-outer" cx="30%" cy="30%" r="75%">
            <stop offset="0%" stopColor={`hsl(${baseHueDeg}, 82%, 28%)`} />
            <stop offset="50%" stopColor={`hsl(${baseHueDeg}, 85%, 38%)`} />
            <stop offset="100%" stopColor={`hsl(${baseHueDeg + 4}, 78%, 50%)`} />
          </radialGradient>
          <radialGradient id="rg-inner" cx="40%" cy="40%" r="65%">
            <stop offset="0%" stopColor={`hsl(${baseHueDeg + 5}, 88%, 35%)`} />
            <stop offset="60%" stopColor={`hsl(${baseHueDeg + 8}, 82%, 48%)`} />
            <stop offset="100%" stopColor={`hsl(${baseHueDeg + 10}, 75%, 58%)`} />
          </radialGradient>
          {/* Dewdrop gradient */}
          <radialGradient id="rg-dew" cx="30%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#e8f0ff" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#b0d0ee" stopOpacity="0.1" />
          </radialGradient>
          {/* Atmospheric haze gradient for depth layers */}
          <linearGradient id="rg-haze" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={`hsl(${baseHueDeg - 20}, 20%, 75%)`} stopOpacity="0.5" />
            <stop offset="100%" stopColor={`hsl(${baseHueDeg - 20}, 15%, 80%)`} stopOpacity="0" />
          </linearGradient>
          {/* Garden path gradient */}
          <linearGradient id="rg-path" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(35, 25%, 55%)" stopOpacity="0.2" />
            <stop offset="50%" stopColor="hsl(30, 20%, 60%)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="hsl(35, 25%, 55%)" stopOpacity="0.1" />
          </linearGradient>
          {/* Glow filter for dew sparkles */}
          <filter id="rg-dew-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
          </filter>
          {/* Soft bloom filter for atmospheric effect */}
          <filter id="rg-soft">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" />
          </filter>
        </defs>

        {/* ---- Background trellis/lattice ---- */}
        <g opacity={0.08 + slowEnergy * 0.04}>
          {/* Vertical bars */}
          {Array.from({ length: trellisColCount + 1 }, (_, i) => {
            const x = trellisLeft + (i / trellisColCount) * (trellisRight - trellisLeft);
            return (
              <line
                key={`tv-${i}`}
                x1={x}
                y1={trellisTop}
                x2={x}
                y2={trellisBottom}
                stroke="hsl(30, 20%, 50%)"
                strokeWidth={1.2 * resScale}
              />
            );
          })}
          {/* Horizontal bars */}
          {Array.from({ length: trellisRowCount + 1 }, (_, i) => {
            const y = trellisTop + (i / trellisRowCount) * (trellisBottom - trellisTop);
            return (
              <line
                key={`th-${i}`}
                x1={trellisLeft}
                y1={y}
                x2={trellisRight}
                y2={y}
                stroke="hsl(30, 20%, 50%)"
                strokeWidth={1.0 * resScale}
              />
            );
          })}
          {/* Diagonal cross bracing for visual interest */}
          {Array.from({ length: Math.floor(trellisColCount / 3) }, (_, i) => {
            const x1 = trellisLeft + ((i * 3) / trellisColCount) * (trellisRight - trellisLeft);
            const x2 = trellisLeft + (((i * 3) + 3) / trellisColCount) * (trellisRight - trellisLeft);
            return (
              <g key={`td-${i}`}>
                <line
                  x1={x1} y1={trellisTop}
                  x2={x2} y2={trellisBottom}
                  stroke="hsl(30, 18%, 48%)"
                  strokeWidth={0.6 * resScale}
                  opacity={0.5}
                />
                <line
                  x1={x2} y1={trellisTop}
                  x2={x1} y2={trellisBottom}
                  stroke="hsl(30, 18%, 48%)"
                  strokeWidth={0.6 * resScale}
                  opacity={0.5}
                />
              </g>
            );
          })}
        </g>

        {/* ---- Garden path suggestion ---- */}
        <path
          d={`M 0 ${pathTop} Q ${width * 0.25} ${pathTop - 4 * resScale} ${width * 0.5} ${pathTop} Q ${width * 0.75} ${pathTop + 4 * resScale} ${width} ${pathTop} L ${width} ${pathBottom} Q ${width * 0.75} ${pathBottom + 3 * resScale} ${width * 0.5} ${pathBottom} Q ${width * 0.25} ${pathBottom - 3 * resScale} 0 ${pathBottom} Z`}
          fill="url(#rg-path)"
        />
        {/* Path edge -- subtle gravel dots */}
        {useMemo(() => {
          const rng = seeded(88_112_233);
          const dots: React.ReactNode[] = [];
          for (let i = 0; i < 40; i++) {
            const gx = rng() * width;
            const gy = pathTop + rng() * (pathBottom - pathTop);
            const gr = (0.5 + rng() * 1.2) * resScale;
            dots.push(
              <circle
                key={`gravel-${i}`}
                cx={gx}
                cy={gy}
                r={gr}
                fill={`hsl(${28 + rng() * 15}, ${15 + rng() * 10}%, ${52 + rng() * 15}%)`}
                opacity={0.08 + rng() * 0.07}
              />,
            );
          }
          return dots;
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [width, height])}

        {/* ---- Atmospheric haze layers (between depth rows) ---- */}
        {[0, 1].map((layerIdx) => {
          const hazeY = height * (layerIdx === 0 ? 0.58 : 0.70);
          const hazeH = height * 0.08;
          return (
            <rect
              key={`haze-${layerIdx}`}
              x={0}
              y={hazeY}
              width={width}
              height={hazeH}
              fill={`hsl(${baseHueDeg - 30}, 15%, 78%)`}
              opacity={hazeOpacity[layerIdx]}
              filter="url(#rg-soft)"
            />
          );
        })}

        {/* ---- Rose bushes by depth layer ---- */}
        {sortedBushes.map((bush, bi) => {
          const bushCx = bush.x * width;
          const bushCy = bush.y * height;
          const bScale = bush.scale * (bushBaseSize / 50);

          // Per-bush gentle sway
          const bushSway = Math.sin(swayPhase + bi * 1.7) * 2 * bush.scale;

          return (
            <g key={`bush-${bi}`} transform={`translate(${bushSway}, 0)`}>
              {/* Bush base -- dark mound shape */}
              <ellipse
                cx={bushCx}
                cy={bushCy + 8 * bScale}
                rx={28 * bScale}
                ry={10 * bScale}
                fill={`hsl(125, 35%, ${18 + slowEnergy * 5}%)`}
                opacity={0.25}
              />

              {/* Foliage cluster */}
              {renderFoliage(
                bushCx,
                bushCy,
                bScale,
                bush.foliageSeed,
                slowEnergy,
                chromaHue,
              )}

              {/* Blooms */}
              {bush.blooms.map((bloom, bloomIdx) => {
                const bx = bushCx + bloom.ox * 30 * bScale;
                const by = bushCy + bloom.oy * 25 * bScale;

                return (
                  <g key={`bloom-${bi}-${bloomIdx}`}>
                    {renderBloom(
                      bx,
                      by,
                      bloom,
                      bScale,
                      breathe,
                      baseHueDeg,
                      "rg",
                    )}
                  </g>
                );
              })}

              {/* Dewdrops -- sparkle with energy + beatDecay */}
              {bush.dewdrops.map((dew, di) => {
                const dx = bushCx + dew.dx * 28 * bScale;
                const dy = bushCy + dew.dy * 22 * bScale;
                const sparklePhase = Math.sin(frame * 0.08 + dew.phase) * 0.5 + 0.5;
                const dewR = dew.size * bScale * (0.6 + dewSparkle * 0.4 + sparklePhase * 0.2);
                const dewOp = 0.15 + dewSparkle * 0.5 + beatDecay * 0.35;

                return (
                  <g key={`dew-${bi}-${di}`}>
                    {/* Outer glow */}
                    <circle
                      cx={dx}
                      cy={dy}
                      r={dewR * 2.2}
                      fill="white"
                      opacity={dewOp * 0.12 * sparklePhase}
                      filter="url(#rg-dew-glow)"
                    />
                    {/* Main dewdrop */}
                    <ellipse
                      cx={dx}
                      cy={dy}
                      rx={dewR * 1.1}
                      ry={dewR * 0.8}
                      fill="url(#rg-dew)"
                      opacity={dewOp * 0.6}
                    />
                    {/* Specular highlight */}
                    <circle
                      cx={dx - dewR * 0.2}
                      cy={dy - dewR * 0.25}
                      r={dewR * 0.3}
                      fill="white"
                      opacity={dewOp * 0.8 + beatDecay * 0.2}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* ---- Ground foliage strip (bottom edge greenery) ---- */}
        {useMemo(() => {
          const rng = seeded(55_667_788);
          const blades: React.ReactNode[] = [];
          for (let i = 0; i < 50; i++) {
            const gx = rng() * width;
            const gy = height * (0.92 + rng() * 0.08);
            const bladeH = (6 + rng() * 14) * resScale;
            const lean = (rng() - 0.5) * 12;
            const greenHue = 118 + rng() * 22;
            const greenLight = 25 + rng() * 18;
            blades.push(
              <path
                key={`grass-${i}`}
                d={`M ${gx} ${gy} Q ${gx + lean * 0.5} ${gy - bladeH * 0.6} ${gx + lean} ${gy - bladeH}`}
                stroke={`hsl(${greenHue}, 45%, ${greenLight}%)`}
                strokeWidth={1.2 * resScale}
                fill="none"
                strokeLinecap="round"
                opacity={0.3}
              />,
            );
          }
          return blades;
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [width, height])}

        {/* ---- Ambient glow behind garden (warm atmosphere) ---- */}
        <rect
          x={0}
          y={height * 0.5}
          width={width}
          height={height * 0.5}
          fill={`hsl(${baseHueDeg}, 30%, 60%)`}
          opacity={0.03 + slowEnergy * 0.02}
          filter="url(#rg-soft)"
        />
      </svg>
    </div>
  );
};
