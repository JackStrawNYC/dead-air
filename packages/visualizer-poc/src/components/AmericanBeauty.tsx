/**
 * AmericanBeauty -- Rose field growing across bottom third.
 * 10 stems (cubic bezier S-curve), 3-4 tangent-aligned thorns, 2 veined leaves,
 * rose bloom (7 outer + 5 middle + 3 inner petals + sepals + bud spiral),
 * per-petal radial gradient, dewdrop with beat-sparkle, ground grass.
 * Bloom sequence L→R, energy-driven speed. Appears every 55s for 14s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const BLOOM_FRAMES = 240;
const STEM_COUNT = 10;

interface StemData {
  x: number;
  height: number;
  swayPhase: number;
  bloomDelay: number;
  roseHue: number;
  roseSize: number;
  thornCount: number;
  stemCurve1: number;
  stemCurve2: number;
  leafPositions: number[];
  leafAngles: number[];
  leafSides: number[];
  dewdropPetal: number;
}

/* Point on cubic bezier — stem/thorn/leaf placement */
function cubicBez(
  t: number,
  x0: number, y0: number, x1: number, y1: number,
  x2: number, y2: number, x3: number, y3: number,
): [number, number] {
  const u = 1 - t, uu = u * u, uuu = uu * u, tt = t * t, ttt = tt * t;
  return [
    uuu * x0 + 3 * uu * t * x1 + 3 * u * tt * x2 + ttt * x3,
    uuu * y0 + 3 * uu * t * y1 + 3 * u * tt * y2 + ttt * y3,
  ];
}

/* Normalized tangent on cubic bezier — thorn alignment */
function cubicTan(
  t: number,
  x0: number, y0: number, x1: number, y1: number,
  x2: number, y2: number, x3: number, y3: number,
): [number, number] {
  const u = 1 - t;
  const dx = 3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2);
  const dy = 3 * u * u * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t * t * (y3 - y2);
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return [dx / len, dy / len];
}

/* ------------------------------------------------------------------ */
/*  SVG gradient definitions — per-stem petal + leaf gradients        */
/* ------------------------------------------------------------------ */
const GradientDefs: React.FC<{
  stems: StemData[];
  chromaTint: number;
  beatDecay: number;
}> = ({ stems, chromaTint, beatDecay }) => (
  <defs>
    <filter id="dew-blur">
      <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" />
    </filter>
    {stems.map((stem, si) => {
      const h = (stem.roseHue + chromaTint) % 360;
      const lb = 32 + beatDecay * 5, le = 52 + beatDecay * 8;
      return (
        <React.Fragment key={si}>
          <radialGradient id={`pg-${si}`} cx="30%" cy="70%" r="80%">
            <stop offset="0%" stopColor={`hsl(${h},88%,${lb}%)`} />
            <stop offset="100%" stopColor={`hsl(${h},82%,${le}%)`} />
          </radialGradient>
          <radialGradient id={`pm-${si}`} cx="35%" cy="65%" r="75%">
            <stop offset="0%" stopColor={`hsl(${(h + 5) % 360},90%,${lb + 3}%)`} />
            <stop offset="100%" stopColor={`hsl(${(h + 5) % 360},85%,${le + 4}%)`} />
          </radialGradient>
          <radialGradient id={`pi-${si}`} cx="40%" cy="60%" r="65%">
            <stop offset="0%" stopColor={`hsl(${(h + 10) % 360},92%,${lb + 5}%)`} />
            <stop offset="100%" stopColor={`hsl(${(h + 10) % 360},88%,${le + 6}%)`} />
          </radialGradient>
          <linearGradient id={`lg-${si}`} x1="0%" y1="0%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="hsl(130,55%,30%)" />
            <stop offset="100%" stopColor="hsl(125,50%,42%)" />
          </linearGradient>
        </React.Fragment>
      );
    })}
  </defs>
);

/* ------------------------------------------------------------------ */
/*  Rose Bloom — sepals + 3 petal rings (7/5/3) + central bud spiral  */
/* ------------------------------------------------------------------ */
const RoseBloom: React.FC<{
  cx: number; cy: number; size: number;
  bloom: number; si: number; breathe: number;
}> = ({ cx, cy, size, bloom, si, breathe }) => {
  const es = size * bloom * (0.95 + breathe * 0.05);
  if (es < 1) return null;
  const el: React.ReactNode[] = [];

  // Sepals — 3-4 green pointed leaves behind bloom
  const sepalCount = 3 + (si % 2);
  for (let s = 0; s < sepalCount; s++) {
    const a = (s / sepalCount) * Math.PI * 2 + 0.3;
    const sx = Math.cos(a) * es * 0.5, sy = Math.sin(a) * es * 0.5;
    const tx = Math.cos(a) * es * 0.85, ty = Math.sin(a) * es * 0.85;
    const px = -Math.sin(a) * es * 0.12, py = Math.cos(a) * es * 0.12;
    el.push(
      <path key={`sp-${s}`}
        d={`M${cx},${cy} Q${cx + sx + px},${cy + sy + py} ${cx + tx},${cy + ty} Q${cx + sx - px},${cy + sy - py} ${cx},${cy}`}
        fill="hsl(130,55%,32%)" opacity={0.6 * bloom} />,
    );
  }

  // Outer ring: 7 curved petals with slight tip curl
  for (let p = 0; p < 7; p++) {
    const a = (p / 7) * Math.PI * 2;
    const px = Math.cos(a) * es * 0.42, py = Math.sin(a) * es * 0.42;
    const tx = Math.cos(a) * es * 0.65, ty = Math.sin(a) * es * 0.65;
    const curlX = -Math.sin(a) * es * 0.08, curlY = Math.cos(a) * es * 0.08;
    const w = es * 0.22, wx = -Math.sin(a) * w, wy = Math.cos(a) * w;
    el.push(
      <path key={`o-${p}`}
        d={`M${cx + wx * 0.3},${cy + wy * 0.3} Q${cx + px + wx},${cy + py + wy} ${cx + tx + curlX},${cy + ty + curlY} Q${cx + px - wx},${cy + py - wy} ${cx - wx * 0.3},${cy - wy * 0.3}`}
        fill={`url(#pg-${si})`} opacity={0.72 * bloom} />,
    );
  }

  // Middle ring: 5 petals, slightly more closed
  for (let p = 0; p < 5; p++) {
    const a = ((p + 0.35) / 5) * Math.PI * 2;
    const px = Math.cos(a) * es * 0.28, py = Math.sin(a) * es * 0.28;
    const tx = Math.cos(a) * es * 0.42, ty = Math.sin(a) * es * 0.42;
    const w = es * 0.16, wx = -Math.sin(a) * w, wy = Math.cos(a) * w;
    el.push(
      <path key={`m-${p}`}
        d={`M${cx + wx * 0.2},${cy + wy * 0.2} Q${cx + px + wx * 0.8},${cy + py + wy * 0.8} ${cx + tx},${cy + ty} Q${cx + px - wx * 0.8},${cy + py - wy * 0.8} ${cx - wx * 0.2},${cy - wy * 0.2}`}
        fill={`url(#pm-${si})`} opacity={0.82 * bloom} />,
    );
  }

  // Inner ring: 3 tight petals
  for (let p = 0; p < 3; p++) {
    const a = ((p + 0.2) / 3) * Math.PI * 2;
    const px = Math.cos(a) * es * 0.14, py = Math.sin(a) * es * 0.14;
    const tx = Math.cos(a) * es * 0.24, ty = Math.sin(a) * es * 0.24;
    const w = es * 0.1, wx = -Math.sin(a) * w, wy = Math.cos(a) * w;
    el.push(
      <path key={`i-${p}`}
        d={`M${cx},${cy} Q${cx + px + wx},${cy + py + wy} ${cx + tx},${cy + ty} Q${cx + px - wx},${cy + py - wy} ${cx},${cy}`}
        fill={`url(#pi-${si})`} opacity={0.9 * bloom} />,
    );
  }

  // Central bud spiral
  const budR = es * 0.07;
  el.push(
    <circle key="bo" cx={cx} cy={cy} r={budR} fill={`url(#pi-${si})`} opacity={0.95 * bloom} />,
    <circle key="bi" cx={cx + budR * 0.2} cy={cy - budR * 0.15} r={budR * 0.5}
      fill={`url(#pm-${si})`} opacity={0.9 * bloom} />,
  );

  return <>{el}</>;
};

/* ------------------------------------------------------------------ */
/*  Leaf — pointed bezier blade + midrib + 3 lateral vein pairs       */
/* ------------------------------------------------------------------ */
const Leaf: React.FC<{
  cx: number; cy: number; side: number;
  angle: number; scale: number; si: number; opacity: number;
}> = ({ cx, cy, side, angle, scale, si, opacity }) => {
  const len = 22 * scale, w = 8 * scale;
  const rot = side * (35 + angle * 10);
  const rad = (rot * Math.PI) / 180;
  const tipX = cx + Math.cos(rad) * len;
  const tipY = cy + Math.sin(rad) * len;
  const perpX = -Math.sin(rad) * w;
  const perpY = Math.cos(rad) * w;
  const mf = 0.45;
  const mx = cx + Math.cos(rad) * len * mf;
  const my = cy + Math.sin(rad) * len * mf;

  return (
    <g opacity={opacity}>
      {/* Leaf blade — pointed bezier */}
      <path
        d={`M${cx},${cy} Q${mx + perpX * 1.3},${my + perpY * 1.3} ${tipX},${tipY} Q${mx - perpX * 1.3},${my - perpY * 1.3} ${cx},${cy}`}
        fill={`url(#lg-${si})`}
      />
      {/* Midrib vein */}
      <line x1={cx} y1={cy} x2={tipX} y2={tipY}
        stroke="hsl(130,40%,28%)" strokeWidth={0.8 * scale} opacity={0.5} />
      {/* Lateral veins — 3 pairs angled off midrib */}
      {[0.3, 0.5, 0.7].map((f, vi) => {
        const vx = cx + Math.cos(rad) * len * f;
        const vy = cy + Math.sin(rad) * len * f;
        const vl = w * (1 - Math.abs(f - 0.5)) * 0.1;
        return (
          <React.Fragment key={vi}>
            <line x1={vx} y1={vy} x2={vx + perpX * vl} y2={vy + perpY * vl}
              stroke="hsl(130,40%,28%)" strokeWidth={0.5 * scale} opacity={0.35} />
            <line x1={vx} y1={vy} x2={vx - perpX * vl} y2={vy - perpY * vl}
              stroke="hsl(130,40%,28%)" strokeWidth={0.5 * scale} opacity={0.35} />
          </React.Fragment>
        );
      })}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Dewdrop — white ellipse with gaussian blur + beat sparkle          */
/* ------------------------------------------------------------------ */
const Dewdrop: React.FC<{
  cx: number; cy: number; size: number; sparkle: number;
}> = ({ cx, cy, size, sparkle }) => {
  const r = size * (0.8 + sparkle * 0.4);
  const op = 0.5 + sparkle * 0.5;
  return (
    <g filter="url(#dew-blur)">
      <ellipse cx={cx} cy={cy} rx={r * 1.2} ry={r * 0.8} fill="white" opacity={op * 0.6} />
      <ellipse cx={cx - r * 0.15} cy={cy - r * 0.2} rx={r * 0.5} ry={r * 0.35}
        fill="white" opacity={op * 0.9} />
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
interface Props {
  frames: EnhancedFrameData[];
}

export const AmericanBeauty: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, slowEnergy, chromaHue, beatDecay, bass } = snap;

  /* Pre-generate stem data deterministically */
  const stems = React.useMemo(() => {
    const rng = seeded(19_700_101);
    const result: StemData[] = [];
    for (let s = 0; s < STEM_COUNT; s++) {
      result.push({
        x: 0.07 + (s / (STEM_COUNT - 1)) * 0.86,
        height: 160 + rng() * 110,
        roseSize: 22 + rng() * 12,
        swayPhase: rng() * Math.PI * 2,
        bloomDelay: s * 0.055,
        thornCount: 3 + Math.floor(rng() * 2),
        roseHue: 340 + rng() * 30,
        stemCurve1: (rng() - 0.5) * 30,
        stemCurve2: (rng() - 0.5) * 25,
        leafPositions: [0.3 + rng() * 0.1, 0.55 + rng() * 0.1],
        leafAngles: [rng(), rng()],
        leafSides: [rng() > 0.5 ? 1 : -1, rng() > 0.5 ? -1 : 1],
        dewdropPetal: Math.floor(rng() * 7),
      });
    }
    return result;
  }, []);

  /* Pre-generate grass blades */
  const grass = React.useMemo(() => {
    const rng = seeded(19_700_102);
    return Array.from({ length: 60 }, () => ({
      x: rng() * 1.1 - 0.05,
      height: 8 + rng() * 18,
      lean: (rng() - 0.5) * 20,
      hue: 115 + rng() * 30,
    }));
  }, []);

  /* Bloom timing — energy drives speed */
  const bloomSpeed = 0.8 + energy * 2.0;
  const progress = Math.min(frame / (BLOOM_FRAMES / bloomSpeed), 1);

  /* Master opacity */
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.3, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (baseOpacity < 0.01) return null;

  /* Audio-derived modulations */
  const chromaTint = ((chromaHue / 360) - 0.5) * 12;
  const breathe = slowEnergy;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: baseOpacity,
          filter: "drop-shadow(0 0 6px rgba(220,20,60,0.35)) drop-shadow(0 0 16px rgba(220,20,60,0.18))",
        }}
      >
        <GradientDefs stems={stems} chromaTint={chromaTint} beatDecay={beatDecay} />

        {/* Ground grass — small green strokes swaying at base */}
        {grass.map((blade, gi) => {
          const bx = blade.x * width;
          const by = height;
          const sway = Math.sin(frame * 0.02 * tempoFactor + gi * 0.7) * 3;
          const lean = blade.lean + sway + bass * 4;
          return (
            <path
              key={`g-${gi}`}
              d={`M${bx},${by} L${bx + lean * 0.4},${by - blade.height * 0.6} L${bx + lean},${by - blade.height}`}
              stroke={`hsl(${blade.hue},50%,${32 + slowEnergy * 8}%)`}
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
              opacity={0.45}
            />
          );
        })}

        {/* Rose stems — each with S-curve, thorns, leaves, bloom, dewdrop */}
        {stems.map((stem, si) => {
          const bx = stem.x * width;
          const by = height;

          /* Growth progress per stem — staggered left to right */
          const growProgress = interpolate(
            progress,
            [stem.bloomDelay, Math.min(stem.bloomDelay + 0.25 / bloomSpeed, 0.85)],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const currentHeight = stem.height * growProgress;
          if (currentHeight < 2) return null;

          const topY = by - currentHeight;
          const sway = Math.sin(frame * 0.025 * tempoFactor + stem.swayPhase) * 9 * growProgress;

          /* Cubic bezier S-curve control points */
          const c1x = bx + stem.stemCurve1 + sway * 0.25;
          const c1y = by - currentHeight * 0.33;
          const c2x = bx + stem.stemCurve2 + sway * 0.6;
          const c2y = by - currentHeight * 0.66;
          const ex = bx + sway;
          const ey = topY;

          /* Bloom starts after stem is 60% grown */
          const bloomProgress = interpolate(
            growProgress, [0.6, 1], [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          /* Dewdrop position — on one outer petal */
          const dewAngle = (stem.dewdropPetal / 7) * Math.PI * 2;
          const dewR = stem.roseSize * bloomProgress * 0.55;

          return (
            <g key={si}>
              {/* Stem path — cubic bezier S-curve */}
              <path
                d={`M${bx},${by} C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`}
                stroke="hsl(130,55%,33%)"
                strokeWidth={3.2}
                fill="none"
                strokeLinecap="round"
              />

              {/* Thorns — tangent-aligned sharp triangular projections */}
              {Array.from({ length: stem.thornCount }).map((_, ti) => {
                const t = (ti + 1) / (stem.thornCount + 1);
                if (t * currentHeight < 15) return null;
                const [tx, ty] = cubicBez(t, bx, by, c1x, c1y, c2x, c2y, ex, ey);
                const [dx, dy] = cubicTan(t, bx, by, c1x, c1y, c2x, c2y, ex, ey);
                const side = ti % 2 === 0 ? 1 : -1;
                const perpX = -dy * side, perpY = dx * side;
                return (
                  <polygon
                    key={`th-${ti}`}
                    points={`${tx},${ty} ${tx + perpX * 5.5 + dx * 3},${ty + perpY * 5.5 + dy * 3} ${tx - dx * 1.5},${ty - dy * 1.5}`}
                    fill="hsl(130,50%,28%)"
                    opacity={0.65}
                  />
                );
              })}

              {/* Leaves — 2 per stem with pointed bezier + veins */}
              {stem.leafPositions.map((leafT, li) => {
                if (leafT * currentHeight < 40) return null;
                const [lx, ly] = cubicBez(leafT, bx, by, c1x, c1y, c2x, c2y, ex, ey);
                return (
                  <Leaf
                    key={`lf-${li}`}
                    cx={lx}
                    cy={ly}
                    side={stem.leafSides[li]}
                    angle={stem.leafAngles[li]}
                    scale={0.85 + slowEnergy * 0.15}
                    si={si}
                    opacity={0.7}
                  />
                );
              })}

              {/* Rose bloom — sepals + 3 petal rings + bud spiral */}
              {bloomProgress > 0 && (
                <RoseBloom
                  cx={ex}
                  cy={ey}
                  size={stem.roseSize}
                  bloom={bloomProgress}
                  si={si}
                  breathe={breathe}
                />
              )}

              {/* Dewdrop — one per rose, beat-sparkle */}
              {bloomProgress > 0.5 && (
                <Dewdrop
                  cx={ex + Math.cos(dewAngle) * dewR}
                  cy={ey + Math.sin(dewAngle) * dewR}
                  size={2.2}
                  sparkle={beatDecay}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
