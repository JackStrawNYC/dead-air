/**
 * RoseOverlay — American Beauty rose rendered in exquisite detail.
 *
 * Single featured rose with 15 petals across 3 concentric rings,
 * curved bezier petal shapes with veins, central bud spiral,
 * sepals, thorned stem with leaves, dewdrop highlight, and
 * atmospheric radial glow. Deep crimson palette with chroma-shifted
 * hue, breathing scale, beat-synced sparkle, energy-driven glow.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

interface Props {
  frames: EnhancedFrameData[];
}

/* ------------------------------------------------------------------ */
/*  Petal geometry helpers                                             */
/* ------------------------------------------------------------------ */

/** Build a single curved petal as an SVG path string using quadratic beziers. */
function petalPath(
  cx: number,
  cy: number,
  length: number,
  width: number,
  curlAmount: number,
): string {
  // Petal grows upward from (cx, cy) with a slight curl at the tip.
  const tipY = cy - length;
  const curlX = curlAmount * width * 0.4;
  const curlY = tipY + length * 0.06;
  // Left edge control point
  const lcpX = cx - width * 0.65;
  const lcpY = cy - length * 0.55;
  // Right edge control point
  const rcpX = cx + width * 0.65;
  const rcpY = cy - length * 0.55;
  // Tip control points for curl
  const tlcpX = cx - width * 0.2 + curlX;
  const tlcpY = tipY - length * 0.08;
  const trcpX = cx + width * 0.2 + curlX;
  const trcpY = tipY - length * 0.05;

  return [
    `M ${cx} ${cy}`,
    `Q ${lcpX} ${lcpY} ${cx - width * 0.08 + curlX * 0.5} ${tipY + length * 0.04}`,
    `Q ${tlcpX} ${tlcpY} ${cx + curlX} ${curlY}`,
    `Q ${trcpX} ${trcpY} ${cx + width * 0.08 + curlX * 0.3} ${tipY + length * 0.04}`,
    `Q ${rcpX} ${rcpY} ${cx} ${cy}`,
    "Z",
  ].join(" ");
}

/** Build a vein line inside a petal (central + branching). */
function petalVeinPaths(
  cx: number,
  cy: number,
  length: number,
  curlAmount: number,
): string[] {
  const tipY = cy - length;
  const curlX = curlAmount * length * 0.03;
  // Central vein
  const central = `M ${cx} ${cy - length * 0.1} Q ${cx + curlX * 0.3} ${cy - length * 0.5} ${cx + curlX} ${tipY + length * 0.1}`;
  // Left branch
  const leftBranch = `M ${cx - 1} ${cy - length * 0.35} Q ${cx - length * 0.08} ${cy - length * 0.5} ${cx - length * 0.06 + curlX * 0.2} ${cy - length * 0.62}`;
  // Right branch
  const rightBranch = `M ${cx + 1} ${cy - length * 0.4} Q ${cx + length * 0.07} ${cy - length * 0.55} ${cx + length * 0.05 + curlX * 0.3} ${cy - length * 0.67}`;
  return [central, leftBranch, rightBranch];
}

/** Build a leaf path with pointed tip and slight asymmetry. */
function leafPath(
  baseX: number,
  baseY: number,
  tipX: number,
  tipY: number,
  bulge: number,
  side: "left" | "right",
): string {
  const mx = (baseX + tipX) / 2;
  const my = (baseY + tipY) / 2;
  const dx = tipX - baseX;
  const dy = tipY - baseY;
  const nx = -dy;
  const ny = dx;
  const sign = side === "left" ? 1 : -1;
  const cp1x = mx + nx * bulge * sign * 0.6;
  const cp1y = my + ny * bulge * sign * 0.6;
  const cp2x = mx - nx * bulge * sign * 0.3;
  const cp2y = my - ny * bulge * sign * 0.3;
  return [
    `M ${baseX} ${baseY}`,
    `Q ${cp1x} ${cp1y} ${tipX} ${tipY}`,
    `Q ${cp2x} ${cp2y} ${baseX} ${baseY}`,
    "Z",
  ].join(" ");
}

/** Leaf vein paths (midrib + 3 laterals per side). */
function leafVeinPaths(
  baseX: number,
  baseY: number,
  tipX: number,
  tipY: number,
  bulge: number,
  side: "left" | "right",
): string[] {
  const sign = side === "left" ? 1 : -1;
  const dx = tipX - baseX;
  const dy = tipY - baseY;
  const nx = -dy;
  const ny = dx;
  // Midrib
  const midrib = `M ${baseX} ${baseY} L ${tipX} ${tipY}`;
  const laterals: string[] = [];
  for (let t = 0.25; t <= 0.75; t += 0.25) {
    const px = baseX + dx * t;
    const py = baseY + dy * t;
    const lx = px + nx * bulge * sign * 0.35 * (1 - t * 0.5);
    const ly = py + ny * bulge * sign * 0.35 * (1 - t * 0.5);
    laterals.push(`M ${px} ${py} L ${lx} ${ly}`);
  }
  return [midrib, ...laterals];
}

/* ------------------------------------------------------------------ */
/*  Spiral bud center                                                  */
/* ------------------------------------------------------------------ */

function budSpiralPath(cx: number, cy: number, maxR: number, turns: number): string {
  const points: string[] = [];
  const steps = turns * 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * Math.PI * 2;
    const r = t * maxR;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }
  return points.join(" ");
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export const RoseOverlay: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const cx = 200; // SVG center x
  const cy = 185; // SVG center y (bloom center, stem goes below)
  const baseSize = Math.min(width, height) * 0.32;

  /* ---- Audio-reactive values ---- */
  const slowE = snap.slowEnergy;
  const energy = snap.energy;
  const beatD = snap.beatDecay;
  const chromaHue = snap.chromaHue;
  const onsetEnv = snap.onsetEnvelope;

  // Breathing scale driven by slowEnergy
  const breathe = Math.sin(frame * 0.015 * tempoFactor) * 0.03 * (0.5 + slowE);
  const scale = 0.88 + slowE * 0.14 + breathe;

  // Slow rotation (~0.5 deg/sec at tempoFactor=1)
  const rotation = (frame / 30) * 0.5 * tempoFactor;

  // Overall overlay opacity — gentle presence, energy adds intensity
  const opacity = interpolate(energy, [0.02, 0.3], [0.18, 0.42], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow intensity driven by energy
  const glowIntensity = interpolate(energy, [0.05, 0.5], [15, 50], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Dewdrop sparkle driven by beatDecay
  const dewdropOpacity = interpolate(beatD, [0, 0.6], [0.15, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dewdropScale = 1 + beatD * 0.5 + onsetEnv * 0.3;

  /* ---- Color palette ---- */
  // ChromaHue subtly shifts red — constrained to crimson/rose/pink range (340-20 hue)
  const hueShift = interpolate(chromaHue, [0, 360], [-12, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const baseHue = 355 + hueShift; // centered on deep red
  const h = ((baseHue % 360) + 360) % 360;

  const deepCrimson = `hsl(${h}, 78%, 28%)`;
  const crimson = `hsl(${h}, 75%, 38%)`;
  const rosePink = `hsl(${(h + 8) % 360}, 70%, 52%)`;
  const lightEdge = `hsl(${(h + 12) % 360}, 65%, 68%)`;
  const budColor = `hsl(${(h - 5 + 360) % 360}, 82%, 22%)`;
  const stemGreen = `hsl(${(120 + hueShift * 0.3) % 360}, 45%, 28%)`;
  const leafGreen = `hsl(${(125 + hueShift * 0.3) % 360}, 50%, 32%)`;
  const sepalGreen = `hsl(${(115 + hueShift * 0.2) % 360}, 40%, 26%)`;
  const glowColor = `hsla(${h}, 60%, 35%, ${0.25 + energy * 0.2})`;
  const veinColor = `hsla(${(h - 10 + 360) % 360}, 50%, 20%, 0.18)`;
  const leafVeinColor = `hsla(120, 30%, 18%, 0.25)`;

  /* ---- Petal ring definitions ---- */
  // Outer ring: 7 petals, large, deep crimson with lighter edges
  // Middle ring: 5 petals, medium, rotated offset
  // Inner ring: 3 petals, small, brightest
  const outerPetals = 7;
  const middlePetals = 5;
  const innerPetals = 3;

  const outerLength = 68;
  const outerWidth = 30;
  const middleLength = 52;
  const middleWidth = 24;
  const innerLength = 36;
  const innerWidth = 18;

  /* ---- Sepal definitions (5 sepals behind bloom) ---- */
  const sepalCount = 5;
  const sepalLength = 55;
  const sepalWidth = 14;

  /* ---- Stem geometry ---- */
  const stemStartY = cy + 15;
  const stemEndY = cy + 170;
  const stemPath = `M ${cx} ${stemStartY} C ${cx - 12} ${stemStartY + 50} ${cx + 18} ${stemStartY + 110} ${cx + 6} ${stemEndY}`;

  // Thorn positions along stem (t parameter 0-1)
  const thorns = [
    { t: 0.25, side: "right" as const },
    { t: 0.45, side: "left" as const },
    { t: 0.65, side: "right" as const },
    { t: 0.82, side: "left" as const },
  ];

  // Evaluate bezier point on stem at parameter t
  function stemPoint(t: number): { x: number; y: number } {
    const p0 = { x: cx, y: stemStartY };
    const p1 = { x: cx - 12, y: stemStartY + 50 };
    const p2 = { x: cx + 18, y: stemStartY + 110 };
    const p3 = { x: cx + 6, y: stemEndY };
    const mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    };
  }

  // Evaluate tangent direction on stem at parameter t
  function stemTangent(t: number): { dx: number; dy: number } {
    const p0 = { x: cx, y: stemStartY };
    const p1 = { x: cx - 12, y: stemStartY + 50 };
    const p2 = { x: cx + 18, y: stemStartY + 110 };
    const p3 = { x: cx + 6, y: stemEndY };
    const mt = 1 - t;
    return {
      dx: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
      dy: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
    };
  }

  // Leaf positions
  const leaves = [
    { t: 0.35, side: "left" as const, size: 1.0 },
    { t: 0.6, side: "right" as const, size: 0.85 },
  ];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transform: `rotate(${rotation}deg) scale(${scale})`,
          opacity,
          willChange: "transform, opacity",
        }}
      >
        <svg
          width={baseSize}
          height={baseSize * 1.8}
          viewBox="0 0 400 720"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Radial glow behind bloom */}
            <radialGradient id="rose-glow" cx="50%" cy="26%" r="30%">
              <stop offset="0%" stopColor={glowColor} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>

            {/* Per-petal gradient: deep center to lighter edges */}
            <radialGradient id="petal-outer-grad" cx="50%" cy="90%" r="80%">
              <stop offset="0%" stopColor={deepCrimson} />
              <stop offset="60%" stopColor={crimson} />
              <stop offset="100%" stopColor={rosePink} />
            </radialGradient>
            <radialGradient id="petal-mid-grad" cx="50%" cy="90%" r="75%">
              <stop offset="0%" stopColor={crimson} />
              <stop offset="55%" stopColor={rosePink} />
              <stop offset="100%" stopColor={lightEdge} />
            </radialGradient>
            <radialGradient id="petal-inner-grad" cx="50%" cy="85%" r="70%">
              <stop offset="0%" stopColor={rosePink} />
              <stop offset="100%" stopColor={lightEdge} />
            </radialGradient>

            {/* Stem gradient */}
            <linearGradient id="stem-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stemGreen} />
              <stop offset="100%" stopColor={`hsl(${(118 + hueShift * 0.3) % 360}, 35%, 22%)`} />
            </linearGradient>

            {/* Dewdrop radial */}
            <radialGradient id="dewdrop-grad" cx="35%" cy="35%" r="60%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
              <stop offset="40%" stopColor="rgba(255,255,255,0.5)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>

            {/* Soft blur for glow and dewdrop */}
            <filter id="rose-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={glowIntensity * 0.4} />
            </filter>
            <filter id="dewdrop-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" />
            </filter>
          </defs>

          {/* ============ Atmospheric radial glow ============ */}
          <ellipse
            cx={cx}
            cy={cy}
            rx={120 + energy * 30}
            ry={110 + energy * 25}
            fill="url(#rose-glow)"
            filter="url(#rose-soft-glow)"
          />

          {/* ============ Stem with S-curve ============ */}
          <path
            d={stemPath}
            stroke="url(#stem-grad)"
            strokeWidth="5.5"
            strokeLinecap="round"
            fill="none"
          />

          {/* ---- Thorns ---- */}
          {thorns.map((thorn, i) => {
            const pt = stemPoint(thorn.t);
            const tan = stemTangent(thorn.t);
            const len = Math.sqrt(tan.dx * tan.dx + tan.dy * tan.dy) || 1;
            const nx = -tan.dy / len;
            const ny = tan.dx / len;
            const sign = thorn.side === "right" ? 1 : -1;
            const thornLen = 7 + (i % 2) * 2;
            const tipX = pt.x + nx * sign * thornLen;
            const tipY = pt.y + ny * sign * thornLen;
            const baseOffset = 4;
            const b1x = pt.x + (tan.dx / len) * baseOffset;
            const b1y = pt.y + (tan.dy / len) * baseOffset;
            const b2x = pt.x - (tan.dx / len) * baseOffset;
            const b2y = pt.y - (tan.dy / len) * baseOffset;
            return (
              <path
                key={`thorn-${i}`}
                d={`M ${b1x} ${b1y} L ${tipX} ${tipY} L ${b2x} ${b2y} Z`}
                fill={stemGreen}
                opacity={0.85}
              />
            );
          })}

          {/* ---- Leaves ---- */}
          {leaves.map((leaf, i) => {
            const pt = stemPoint(leaf.t);
            const tan = stemTangent(leaf.t);
            const len = Math.sqrt(tan.dx * tan.dx + tan.dy * tan.dy) || 1;
            const nx = -tan.dy / len;
            const ny = tan.dx / len;
            const sign = leaf.side === "right" ? 1 : -1;
            const leafLen = 42 * leaf.size;
            const tipX = pt.x + (nx * sign * leafLen * 0.8) + (tan.dx / len * leafLen * 0.4);
            const tipY = pt.y + (ny * sign * leafLen * 0.8) + (tan.dy / len * leafLen * 0.4);
            const bulge = 0.35;
            const lp = leafPath(pt.x, pt.y, tipX, tipY, bulge, leaf.side);
            const veins = leafVeinPaths(pt.x, pt.y, tipX, tipY, bulge, leaf.side);
            return (
              <g key={`leaf-${i}`}>
                <path d={lp} fill={leafGreen} opacity={0.8} />
                {veins.map((v, vi) => (
                  <path
                    key={`leaf-vein-${i}-${vi}`}
                    d={v}
                    stroke={leafVeinColor}
                    strokeWidth="0.6"
                    fill="none"
                  />
                ))}
              </g>
            );
          })}

          {/* ============ Sepals (behind bloom) ============ */}
          {Array.from({ length: sepalCount }, (_, i) => {
            const angle = (i / sepalCount) * 360 + 36;
            const sp = petalPath(cx, cy + 8, sepalLength, sepalWidth, 0.3);
            return (
              <path
                key={`sepal-${i}`}
                d={sp}
                fill={sepalGreen}
                opacity={0.6}
                transform={`rotate(${angle} ${cx} ${cy})`}
              />
            );
          })}

          {/* ============ Outer petal ring (7 petals) ============ */}
          {Array.from({ length: outerPetals }, (_, i) => {
            const angle = (i / outerPetals) * 360;
            const curlDir = i % 2 === 0 ? 1 : -1;
            const curlAmount = curlDir * (0.6 + Math.sin(i * 1.3) * 0.3);
            const pp = petalPath(cx, cy, outerLength, outerWidth, curlAmount);
            const veins = petalVeinPaths(cx, cy, outerLength, curlAmount);
            // Overlap: later petals slightly on top, opacity decreases slightly
            const petalOpacity = 0.92 - i * 0.015;
            return (
              <g
                key={`outer-${i}`}
                transform={`rotate(${angle} ${cx} ${cy})`}
                opacity={petalOpacity}
              >
                <path d={pp} fill="url(#petal-outer-grad)" />
                {/* Lighter edge highlight stroke */}
                <path
                  d={pp}
                  fill="none"
                  stroke={lightEdge}
                  strokeWidth="0.7"
                  opacity={0.25}
                />
                {/* Veins */}
                {veins.map((v, vi) => (
                  <path
                    key={`ov-${i}-${vi}`}
                    d={v}
                    stroke={veinColor}
                    strokeWidth="0.5"
                    fill="none"
                  />
                ))}
              </g>
            );
          })}

          {/* ============ Middle petal ring (5 petals) ============ */}
          {Array.from({ length: middlePetals }, (_, i) => {
            const angle = (i / middlePetals) * 360 + 25; // offset from outer
            const curlDir = i % 2 === 0 ? -1 : 1;
            const curlAmount = curlDir * (0.5 + Math.cos(i * 1.7) * 0.25);
            const pp = petalPath(cx, cy, middleLength, middleWidth, curlAmount);
            const veins = petalVeinPaths(cx, cy, middleLength, curlAmount);
            return (
              <g
                key={`mid-${i}`}
                transform={`rotate(${angle} ${cx} ${cy})`}
                opacity={0.85}
              >
                <path d={pp} fill="url(#petal-mid-grad)" />
                <path
                  d={pp}
                  fill="none"
                  stroke={lightEdge}
                  strokeWidth="0.5"
                  opacity={0.2}
                />
                {veins.map((v, vi) => (
                  <path
                    key={`mv-${i}-${vi}`}
                    d={v}
                    stroke={veinColor}
                    strokeWidth="0.4"
                    fill="none"
                  />
                ))}
              </g>
            );
          })}

          {/* ============ Inner petal ring (3 petals) ============ */}
          {Array.from({ length: innerPetals }, (_, i) => {
            const angle = (i / innerPetals) * 360 + 60; // offset from middle
            const curlAmount = (i % 2 === 0 ? 1 : -1) * 0.4;
            const pp = petalPath(cx, cy, innerLength, innerWidth, curlAmount);
            const veins = petalVeinPaths(cx, cy, innerLength, curlAmount);
            return (
              <g
                key={`inner-${i}`}
                transform={`rotate(${angle} ${cx} ${cy})`}
                opacity={0.78}
              >
                <path d={pp} fill="url(#petal-inner-grad)" />
                {veins.map((v, vi) => (
                  <path
                    key={`iv-${i}-${vi}`}
                    d={v}
                    stroke={veinColor}
                    strokeWidth="0.35"
                    fill="none"
                  />
                ))}
              </g>
            );
          })}

          {/* ============ Central bud spiral ============ */}
          <path
            d={budSpiralPath(cx, cy, 14, 2.5)}
            stroke={budColor}
            strokeWidth="2"
            fill="none"
            opacity={0.7}
          />
          {/* Bud center dark fill */}
          <circle cx={cx} cy={cy} r={6} fill={budColor} opacity={0.85} />
          {/* Inner bud highlight */}
          <circle cx={cx - 1.5} cy={cy - 1.5} r={2.5} fill={crimson} opacity={0.5} />

          {/* ============ Dewdrop on outer petal ============ */}
          <g
            transform={`translate(${cx + 22}, ${cy - 54}) scale(${dewdropScale})`}
            opacity={dewdropOpacity}
          >
            <ellipse
              cx="0"
              cy="0"
              rx="3.5"
              ry="4.5"
              fill="url(#dewdrop-grad)"
              filter="url(#dewdrop-blur)"
            />
            {/* Specular highlight */}
            <ellipse
              cx="-1"
              cy="-1.5"
              rx="1.2"
              ry="1.0"
              fill="rgba(255,255,255,0.9)"
            />
          </g>
        </svg>
      </div>
    </div>
  );
};
