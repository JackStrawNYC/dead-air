/**
 * RedwoodSilhouettes — California redwood/sequoia treeline along the bottom of the frame.
 *
 * The Dead are inseparable from California: Marin County, Mt. Tamalpais, the redwoods,
 * the fog rolling in off the Pacific. This overlay evokes that exact place: a contemplative
 * forest scene at golden hour, with crepuscular light shafts filtering through tall trunks
 * and mist hugging the forest floor. Perfect for Morning Dew, Box of Rain, Stella Blue,
 * Brokedown Palace — the slow, luminous, west-coast moments.
 *
 * Composition (back-to-front):
 *   1. Sky gradient (golden-hour band above the treeline, chromaHue-tinted)
 *   2. Distant mountain silhouette (Mt. Tam abstract)
 *   3. Crepuscular rays (light shafts filtering between trunks)
 *   4. Back-layer redwoods (small, hazy, atmospheric perspective)
 *   5. Mid-layer redwoods (medium)
 *   6. Front-layer redwoods (tall, dark, detailed bark)
 *   7. Ground line + ground fog
 *   8. Undergrowth (ferns, mushrooms)
 *
 * Audio reactivity:
 *   - slowEnergy → golden-hour glow intensity
 *   - chromaHue → sky tint
 *   - energy → crepuscular ray brightness
 *   - bass + tempoFactor → very subtle tree sway
 *   - beatDecay → faint highlight pulse on front layer
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE = 2400; // 80s at 30fps
const VISIBLE_DURATION = 720; // 24s
const FADE_FRAMES = 75;

const NUM_BACK = 5;
const NUM_MID = 4;
const NUM_FRONT = 3;

interface FoliageCluster {
  /** Vertical position as fraction up the tree (0=base, 1=top) */
  yFrac: number;
  /** Horizontal offset from trunk center (px) */
  xOffset: number;
  /** Radius of cluster (px) */
  radius: number;
  /** Number of bumps around the cluster perimeter */
  bumps: number;
  /** Random seed for bump radii */
  bumpSeed: number;
  /** Vertical squash (>1 = wider than tall) */
  squash: number;
}

interface Redwood {
  /** Layer: 0=back, 1=mid, 2=front */
  layer: 0 | 1 | 2;
  /** X position fraction of width */
  x: number;
  /** Tree height in px */
  height: number;
  /** Trunk base width in px */
  baseWidth: number;
  /** Trunk top width in px (taper) */
  topWidth: number;
  /** Sway phase offset */
  swayPhase: number;
  /** Sway frequency multiplier */
  swayFreq: number;
  /** Foliage clusters */
  clusters: FoliageCluster[];
  /** Bark texture seed */
  barkSeed: number;
  /** Y offset of base from ground line (px, allows trees to sit at varying depths) */
  yBase: number;
}

interface Fern {
  x: number;
  size: number;
  fronds: number;
  tilt: number;
}

interface Mushroom {
  x: number;
  capRadius: number;
  stemHeight: number;
  hueBias: number;
}

interface RayDef {
  /** Origin x in px (above treeline) */
  ox: number;
  /** Origin y in px (sky height) */
  oy: number;
  /** Angle from vertical (radians) */
  angle: number;
  /** Width at top (px) */
  topWidth: number;
  /** Width at bottom (px) */
  bottomWidth: number;
  /** Phase offset for shimmer */
  phase: number;
}

function generateScene(seed: number, width: number, height: number) {
  const rng = seeded(seed ^ 0x523dc1);

  const groundY = height * 0.93;

  const trees: Redwood[] = [];

  // Back layer — small, distant, hazy
  for (let i = 0; i < NUM_BACK; i++) {
    const treeHeight = height * (0.32 + rng() * 0.1);
    const baseW = 12 + rng() * 8;
    trees.push({
      layer: 0,
      x: (i + 0.5 + rng() * 0.4) / NUM_BACK,
      height: treeHeight,
      baseWidth: baseW,
      topWidth: baseW * 0.35,
      swayPhase: rng() * Math.PI * 2,
      swayFreq: 0.005 + rng() * 0.004,
      clusters: generateClusters(rng, 3 + Math.floor(rng() * 2)),
      barkSeed: Math.floor(rng() * 100000),
      yBase: -8 + rng() * 12,
    });
  }

  // Mid layer — medium
  for (let i = 0; i < NUM_MID; i++) {
    const treeHeight = height * (0.5 + rng() * 0.12);
    const baseW = 22 + rng() * 12;
    trees.push({
      layer: 1,
      x: (i + 0.4 + rng() * 0.5) / NUM_MID,
      height: treeHeight,
      baseWidth: baseW,
      topWidth: baseW * 0.32,
      swayPhase: rng() * Math.PI * 2,
      swayFreq: 0.004 + rng() * 0.003,
      clusters: generateClusters(rng, 4 + Math.floor(rng() * 2)),
      barkSeed: Math.floor(rng() * 100000),
      yBase: -4 + rng() * 8,
    });
  }

  // Front layer — tall, dark, prominent
  for (let i = 0; i < NUM_FRONT; i++) {
    const treeHeight = height * (0.7 + rng() * 0.18);
    const baseW = 38 + rng() * 16;
    trees.push({
      layer: 2,
      x: (i + 0.35 + rng() * 0.55) / NUM_FRONT,
      height: treeHeight,
      baseWidth: baseW,
      topWidth: baseW * 0.28,
      swayPhase: rng() * Math.PI * 2,
      swayFreq: 0.0035 + rng() * 0.0025,
      clusters: generateClusters(rng, 5 + Math.floor(rng() * 2)),
      barkSeed: Math.floor(rng() * 100000),
      yBase: rng() * 6,
    });
  }

  // Ferns
  const ferns: Fern[] = Array.from({ length: 4 + Math.floor(rng() * 2) }, () => ({
    x: rng(),
    size: 18 + rng() * 14,
    fronds: 5 + Math.floor(rng() * 3),
    tilt: (rng() - 0.5) * 0.5,
  }));

  // Mushrooms
  const mushrooms: Mushroom[] = Array.from({ length: 1 + Math.floor(rng() * 2) }, () => ({
    x: 0.15 + rng() * 0.7,
    capRadius: 7 + rng() * 5,
    stemHeight: 9 + rng() * 6,
    hueBias: rng(),
  }));

  // Crepuscular rays — between trunks
  const rays: RayDef[] = Array.from({ length: 4 }, () => ({
    ox: width * (0.15 + rng() * 0.7),
    oy: -height * 0.05,
    angle: (rng() - 0.5) * 0.35,
    topWidth: 30 + rng() * 30,
    bottomWidth: 140 + rng() * 100,
    phase: rng() * Math.PI * 2,
  }));

  // Distant mountain silhouette path (Mt. Tamalpais–ish profile)
  const mountainPoints: Array<[number, number]> = [];
  const peaks = 7;
  for (let i = 0; i <= peaks; i++) {
    const t = i / peaks;
    const px = t * width;
    const baseY = height * 0.7;
    const variation =
      Math.sin(t * Math.PI * 1.6 + 0.3) * height * 0.06 +
      (rng() - 0.5) * height * 0.025;
    mountainPoints.push([px, baseY + variation]);
  }

  return { trees, ferns, mushrooms, rays, mountainPoints, groundY };
}

function generateClusters(rng: () => number, count: number): FoliageCluster[] {
  const clusters: FoliageCluster[] = [];
  for (let i = 0; i < count; i++) {
    // Distribute clusters in upper 70% of tree, weighted toward top
    const yFrac = 0.32 + (i / Math.max(1, count - 1)) * 0.62 + (rng() - 0.5) * 0.06;
    clusters.push({
      yFrac: Math.min(0.98, yFrac),
      xOffset: (rng() - 0.5) * 16,
      radius: 28 + rng() * 22,
      bumps: 9 + Math.floor(rng() * 4),
      bumpSeed: Math.floor(rng() * 100000),
      squash: 0.78 + rng() * 0.32,
    });
  }
  return clusters;
}

/** Build an organic blob path with bumpy edges (suggesting needle clusters). */
function blobPath(
  cx: number,
  cy: number,
  radius: number,
  bumps: number,
  squash: number,
  seedNum: number,
): string {
  const rng = seeded(seedNum);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < bumps; i++) {
    const a = (i / bumps) * Math.PI * 2 - Math.PI / 2;
    const r = radius * (0.78 + rng() * 0.42);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * squash;
    pts.push([x, y]);
  }
  // Smooth closed path with quadratic curves between midpoints
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % pts.length];
    const mx = (cur[0] + next[0]) / 2;
    const my = (cur[1] + next[1]) / 2;
    if (i === 0) d += `M ${mx.toFixed(1)} ${my.toFixed(1)} `;
    d += `Q ${cur[0].toFixed(1)} ${cur[1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)} `;
  }
  // Close back to start midpoint
  const first = pts[0];
  const last = pts[pts.length - 1];
  const closeMx = (first[0] + last[0]) / 2;
  const closeMy = (first[1] + last[1]) / 2;
  d += `Q ${last[0].toFixed(1)} ${last[1].toFixed(1)} ${closeMx.toFixed(1)} ${closeMy.toFixed(1)} Z`;
  return d;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const RedwoodSilhouettes: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const audio = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  // Stable scene generation
  const scene = React.useMemo(
    () => generateScene(0x9bf3a1, width, height),
    [width, height],
  );

  /* Visibility cycle */
  const cycleFrame = frame % CYCLE;
  const isVisible = cycleFrame < VISIBLE_DURATION;
  const fadeIn = interpolate(cycleFrame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    cycleFrame,
    [VISIBLE_DURATION - FADE_FRAMES, VISIBLE_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const visibility = isVisible ? Math.min(fadeIn, fadeOut) : 0;
  if (visibility < 0.01) return null;

  /* Audio-driven values */
  const slowE = audio.slowEnergy;
  const e = audio.energy;
  const bass = audio.bass;
  const hue = audio.chromaHue;
  const beatPulse = audio.beatDecay;

  // Golden hour intensity from slowEnergy: subtler at low, brighter at high
  const glowIntensity = interpolate(slowE, [0.02, 0.25], [0.45, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sky tint from chromaHue — biased toward warm golden range
  // chromaHue is 0-360; we map to a warm offset around 30deg (gold/amber)
  const tintHue = 25 + Math.sin((hue / 180) * Math.PI) * 18;

  // Crepuscular ray brightness
  const rayBrightness = interpolate(e, [0.04, 0.3], [0.18, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sway: very subtle, bass + tempo modulated
  const swayMag = interpolate(bass, [0.05, 0.5], [0.4, 1.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const horizonY = scene.groundY - height * 0.04;
  const skyTopY = horizonY - height * 0.55;

  const masterOpacity = visibility * 0.78;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          {/* Golden hour sky gradient */}
          <linearGradient id="redwood-sky" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={`hsl(${tintHue + 8}, 55%, ${10 + glowIntensity * 8}%)`}
              stopOpacity={0}
            />
            <stop
              offset="35%"
              stopColor={`hsl(${tintHue + 4}, 65%, ${18 + glowIntensity * 12}%)`}
              stopOpacity={0.32 * glowIntensity}
            />
            <stop
              offset="80%"
              stopColor={`hsl(${tintHue}, 75%, ${30 + glowIntensity * 20}%)`}
              stopOpacity={0.55 * glowIntensity}
            />
            <stop
              offset="100%"
              stopColor={`hsl(${tintHue - 6}, 80%, ${42 + glowIntensity * 18}%)`}
              stopOpacity={0.62 * glowIntensity}
            />
          </linearGradient>

          {/* Crepuscular ray gradient */}
          <linearGradient id="redwood-ray" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={`hsl(${tintHue + 10}, 90%, 78%)`}
              stopOpacity={0.55 * rayBrightness}
            />
            <stop
              offset="60%"
              stopColor={`hsl(${tintHue + 4}, 80%, 70%)`}
              stopOpacity={0.28 * rayBrightness}
            />
            <stop
              offset="100%"
              stopColor={`hsl(${tintHue}, 70%, 55%)`}
              stopOpacity={0}
            />
          </linearGradient>

          {/* Ground fog gradient */}
          <linearGradient id="redwood-fog" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={`hsl(${tintHue + 20}, 25%, 75%)`}
              stopOpacity={0}
            />
            <stop
              offset="55%"
              stopColor={`hsl(${tintHue + 15}, 30%, 70%)`}
              stopOpacity={0.18 + glowIntensity * 0.08}
            />
            <stop
              offset="100%"
              stopColor={`hsl(${tintHue + 10}, 35%, 65%)`}
              stopOpacity={0.32 + glowIntensity * 0.1}
            />
          </linearGradient>

          {/* Soft blur for back layer atmospheric perspective */}
          <filter id="redwood-haze" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>

        {/* 1. Sky golden-hour glow band */}
        <rect
          x={0}
          y={skyTopY}
          width={width}
          height={horizonY - skyTopY + 4}
          fill="url(#redwood-sky)"
        />

        {/* 2. Distant mountain silhouette */}
        <path
          d={`M 0 ${height} L 0 ${scene.mountainPoints[0][1]} ${scene.mountainPoints
            .map(([px, py]) => `L ${px.toFixed(1)} ${py.toFixed(1)}`)
            .join(" ")} L ${width} ${height} Z`}
          fill={`hsl(${tintHue - 10}, 20%, ${8 + glowIntensity * 6}%)`}
          opacity={0.55}
        />

        {/* 3. Crepuscular rays */}
        <g style={{ mixBlendMode: "screen" }}>
          {scene.rays.map((ray, ri) => {
            const shimmer = 0.85 + Math.sin(frame * 0.012 + ray.phase) * 0.15;
            const length = height * 0.85;
            const dx = Math.sin(ray.angle) * length;
            const dy = Math.cos(ray.angle) * length;
            const tx = ray.ox + dx;
            const ty = ray.oy + dy;
            // Build a tapered quad polygon
            const perpAngle = ray.angle + Math.PI / 2;
            const tpx = (Math.cos(perpAngle) * ray.topWidth) / 2;
            const tpy = (Math.sin(perpAngle) * ray.topWidth) / 2;
            const bpx = (Math.cos(perpAngle) * ray.bottomWidth) / 2;
            const bpy = (Math.sin(perpAngle) * ray.bottomWidth) / 2;
            const points = [
              [ray.ox - tpx, ray.oy - tpy],
              [ray.ox + tpx, ray.oy + tpy],
              [tx + bpx, ty + bpy],
              [tx - bpx, ty - bpy],
            ];
            return (
              <polygon
                key={`ray-${ri}`}
                points={points
                  .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
                  .join(" ")}
                fill="url(#redwood-ray)"
                opacity={shimmer}
              />
            );
          })}
        </g>

        {/* 4-6. Trees, drawn back to front so depth ordering is correct */}
        {[0, 1, 2].map((layer) => (
          <g key={`layer-${layer}`}>
            {scene.trees
              .filter((t) => t.layer === layer)
              .map((tree, ti) => {
                const baseX = tree.x * width;
                const baseY = scene.groundY + tree.yBase;
                const topY = baseY - tree.height;

                // Sway: very subtle horizontal offset at top
                const sway =
                  Math.sin(frame * tree.swayFreq * tempoFactor + tree.swayPhase) *
                  3 *
                  swayMag *
                  (tree.layer === 0 ? 0.5 : tree.layer === 1 ? 0.8 : 1);

                // Color per layer (back = lighter/hazier, front = dark)
                const layerLight =
                  tree.layer === 0
                    ? 18 + glowIntensity * 5
                    : tree.layer === 1
                      ? 10 + glowIntensity * 4
                      : 5 + glowIntensity * 3;
                const layerSat = tree.layer === 0 ? 18 : tree.layer === 1 ? 14 : 10;
                const trunkColor = `hsl(${tintHue - 8}, ${layerSat}%, ${layerLight}%)`;
                const foliageColor = `hsl(${tintHue - 14}, ${layerSat + 6}%, ${layerLight - 1}%)`;

                // Trunk taper polygon
                const halfBase = tree.baseWidth / 2;
                const halfTop = tree.topWidth / 2;
                const trunkPoints = [
                  [baseX - halfBase, baseY],
                  [baseX + halfBase, baseY],
                  [baseX + halfTop + sway, topY],
                  [baseX - halfTop + sway, topY],
                ];

                // Bark texture lines: vertical streaks on trunk
                const barkRng = seeded(tree.barkSeed);
                const barkLines = tree.layer === 2 ? 5 : tree.layer === 1 ? 3 : 0;
                const barkStreaks: Array<{ x1: number; x2: number; y1: number; y2: number; opacity: number }> = [];
                for (let b = 0; b < barkLines; b++) {
                  const fracX = (b + 0.5) / (barkLines + 0.5);
                  const xBase = baseX - halfBase + fracX * tree.baseWidth;
                  const xTop = baseX - halfTop + fracX * tree.topWidth + sway;
                  const yStart = baseY - 4 - barkRng() * 14;
                  const yEnd = topY + 8 + barkRng() * 18;
                  barkStreaks.push({
                    x1: xBase,
                    y1: yStart,
                    x2: xTop,
                    y2: yEnd,
                    opacity: 0.25 + barkRng() * 0.2,
                  });
                }

                // Front-layer beat highlight (faint reddish shimmer along trunk on beat)
                const beatHighlight =
                  tree.layer === 2 ? beatPulse * 0.12 * glowIntensity : 0;

                const treeGroup = (
                  <g key={`tree-${layer}-${ti}`}>
                    {/* Trunk */}
                    <polygon
                      points={trunkPoints
                        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
                        .join(" ")}
                      fill={trunkColor}
                    />

                    {/* Bark texture */}
                    {barkStreaks.map((s, si) => (
                      <line
                        key={`bark-${si}`}
                        x1={s.x1}
                        y1={s.y1}
                        x2={s.x2}
                        y2={s.y2}
                        stroke={`hsl(${tintHue - 10}, ${layerSat - 4}%, ${Math.max(2, layerLight - 4)}%)`}
                        strokeWidth={tree.layer === 2 ? 1.4 : 1}
                        opacity={s.opacity}
                      />
                    ))}

                    {/* Beat highlight on front trunks */}
                    {beatHighlight > 0.005 && (
                      <polygon
                        points={trunkPoints
                          .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
                          .join(" ")}
                        fill={`hsl(${tintHue + 12}, 60%, 60%)`}
                        opacity={beatHighlight}
                      />
                    )}

                    {/* Foliage clusters (drawn on top of trunk) */}
                    {tree.clusters.map((c, ci) => {
                      const cy = baseY - tree.height * c.yFrac;
                      // Sway scales with cluster height
                      const cSway = sway * c.yFrac;
                      const cx = baseX + c.xOffset + cSway;
                      const cRadius = c.radius * (tree.layer === 0 ? 0.65 : tree.layer === 1 ? 0.85 : 1);
                      const path = blobPath(
                        cx,
                        cy,
                        cRadius,
                        c.bumps,
                        c.squash,
                        c.bumpSeed + ci,
                      );
                      return (
                        <path
                          key={`cluster-${ci}`}
                          d={path}
                          fill={foliageColor}
                        />
                      );
                    })}
                  </g>
                );

                // Apply haze filter only to back layer
                if (tree.layer === 0) {
                  return (
                    <g key={`tree-wrap-${ti}`} filter="url(#redwood-haze)" opacity={0.78}>
                      {treeGroup}
                    </g>
                  );
                }
                return treeGroup;
              })}
          </g>
        ))}

        {/* 7. Ground line */}
        <line
          x1={0}
          y1={scene.groundY}
          x2={width}
          y2={scene.groundY}
          stroke={`hsl(${tintHue - 10}, 18%, ${6 + glowIntensity * 4}%)`}
          strokeWidth={2}
          opacity={0.55}
        />

        {/* 8. Undergrowth: ferns */}
        {scene.ferns.map((fern, fi) => {
          const fx = fern.x * width;
          const fy = scene.groundY - 4;
          const frondPaths: string[] = [];
          for (let f = 0; f < fern.fronds; f++) {
            const t = f / (fern.fronds - 1);
            const angle = -Math.PI / 2 + (t - 0.5) * 1.4 + fern.tilt;
            const len = fern.size * (0.7 + (1 - Math.abs(t - 0.5) * 1.3) * 0.5);
            const tipX = fx + Math.cos(angle) * len;
            const tipY = fy + Math.sin(angle) * len;
            // Curve via control point offset perpendicular to direction
            const midX = (fx + tipX) / 2 + Math.sin(angle) * len * 0.2;
            const midY = (fy + tipY) / 2 - Math.cos(angle) * len * 0.2;
            frondPaths.push(`M ${fx} ${fy} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)}`);
          }
          return (
            <g key={`fern-${fi}`} opacity={0.6}>
              {frondPaths.map((p, pi) => (
                <path
                  key={`frond-${pi}`}
                  d={p}
                  fill="none"
                  stroke={`hsl(${tintHue - 20}, 30%, ${10 + glowIntensity * 4}%)`}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                />
              ))}
            </g>
          );
        })}

        {/* Mushrooms */}
        {scene.mushrooms.map((m, mi) => {
          const mx = m.x * width;
          const my = scene.groundY - 2;
          const stemTop = my - m.stemHeight;
          const capHueShift = m.hueBias > 0.5 ? 8 : -10;
          return (
            <g key={`mush-${mi}`} opacity={0.7}>
              {/* Stem */}
              <rect
                x={mx - 1.6}
                y={stemTop}
                width={3.2}
                height={m.stemHeight}
                fill={`hsl(${tintHue + 5}, 18%, ${22 + glowIntensity * 6}%)`}
              />
              {/* Cap (semi-ellipse) */}
              <path
                d={`M ${mx - m.capRadius} ${stemTop} A ${m.capRadius} ${m.capRadius * 0.7} 0 0 1 ${mx + m.capRadius} ${stemTop} Z`}
                fill={`hsl(${tintHue + capHueShift}, 35%, ${18 + glowIntensity * 6}%)`}
              />
            </g>
          );
        })}

        {/* Ground fog (drawn last so it sits over the bases of everything) */}
        <rect
          x={0}
          y={scene.groundY - height * 0.08}
          width={width}
          height={height * 0.12}
          fill="url(#redwood-fog)"
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </div>
  );
};
