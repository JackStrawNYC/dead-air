/**
 * SugareeRose — A single stem rose, falling and floating across the frame.
 *
 * Cinematic intimate solo rose referencing "Sugaree." A single perfect bloom
 * with 15 petals across 3 concentric rings, each petal a curved cubic bezier
 * with multi-stop radial gradient and subtle veins. Central spiral bud, 5
 * sepals, S-curve stem with 4 thorns and 2 veined leaves, single dewdrop with
 * beat sparkle. Drifts gently top-to-bottom over ~30 seconds with gentle
 * horizontal sine wander, slow tumble rotation, atmospheric radial glow halo,
 * trailing ghost echoes, and floating petal escapees on onsets.
 *
 * Distinct from RoseOverlay (centered featured rose), Roses (3 connected by
 * vine), AmericanBeauty (rose field), and RoseGarden (lush garden) — this is
 * one perfect rose, alone in space, slowly tumbling through frame.
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

/** Build a single curved petal as an SVG path string using cubic beziers
 *  with proper tip curl. Petal grows upward from (cx, cy). */
function petalPath(
  cx: number,
  cy: number,
  length: number,
  width: number,
  curlAmount: number,
): string {
  const tipY = cy - length;
  const curlX = curlAmount * width * 0.45;
  // Left edge cubic bezier control points
  const lcp1x = cx - width * 0.7;
  const lcp1y = cy - length * 0.25;
  const lcp2x = cx - width * 0.55 + curlX * 0.3;
  const lcp2y = cy - length * 0.78;
  // Tip
  const tipMidX = cx + curlX;
  const tipMidY = tipY + length * 0.04;
  // Right edge cubic bezier control points
  const rcp1x = cx + width * 0.55 + curlX * 0.5;
  const rcp1y = cy - length * 0.78;
  const rcp2x = cx + width * 0.7;
  const rcp2y = cy - length * 0.25;

  return [
    `M ${cx} ${cy}`,
    `C ${lcp1x} ${lcp1y} ${lcp2x} ${lcp2y} ${tipMidX} ${tipMidY}`,
    `C ${rcp1x} ${rcp1y} ${rcp2x} ${rcp2y} ${cx} ${cy}`,
    "Z",
  ].join(" ");
}

/** Build vein lines inside a petal (central + branching). */
function petalVeinPaths(
  cx: number,
  cy: number,
  length: number,
  curlAmount: number,
): string[] {
  const tipY = cy - length;
  const curlX = curlAmount * length * 0.035;
  const central = `M ${cx} ${cy - length * 0.1} Q ${cx + curlX * 0.4} ${cy - length * 0.5} ${cx + curlX} ${tipY + length * 0.12}`;
  const leftBranch = `M ${cx - 1} ${cy - length * 0.32} Q ${cx - length * 0.09} ${cy - length * 0.5} ${cx - length * 0.07 + curlX * 0.2} ${cy - length * 0.62}`;
  const rightBranch = `M ${cx + 1} ${cy - length * 0.42} Q ${cx + length * 0.085} ${cy - length * 0.55} ${cx + length * 0.06 + curlX * 0.3} ${cy - length * 0.68}`;
  return [central, leftBranch, rightBranch];
}

/** Leaf shape — pointed tip with slight asymmetry. */
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

/** Leaf vein paths — midrib + 4 lateral veins. */
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
  const midrib = `M ${baseX} ${baseY} L ${tipX} ${tipY}`;
  const laterals: string[] = [];
  // 4 lateral veins per leaf
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const px = baseX + dx * t;
    const py = baseY + dy * t;
    const lx = px + nx * bulge * sign * 0.32 * (1 - t * 0.4);
    const ly = py + ny * bulge * sign * 0.32 * (1 - t * 0.4);
    laterals.push(`M ${px} ${py} L ${lx} ${ly}`);
  }
  return [midrib, ...laterals];
}

/** Spiral bud center as a tight Archimedean spiral. */
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

export const SugareeRose: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  // SVG-internal coordinate system for rose body
  const cx = 200;
  const cy = 200;
  const baseSize = Math.min(width, height) * 0.26;

  /* ---- Audio-reactive values ---- */
  const slowE = snap.slowEnergy;
  const energy = snap.energy;
  const beatD = snap.beatDecay;
  const chromaHue = snap.chromaHue;
  const onsetEnv = snap.onsetEnvelope;

  /* ---- Cinematic falling motion ---- */
  // Fall cycle ~30 seconds at 30fps = 900 frames, modulated by tempo
  const fallPeriod = 900 / Math.max(0.6, tempoFactor);
  const tFall = ((frame % fallPeriod) / fallPeriod);

  // Vertical drift: starts above frame, ends below
  const startY = -baseSize * 0.6;
  const endY = height + baseSize * 0.4;
  const verticalY = interpolate(tFall, [0, 1], [startY, endY]);

  // Diagonal horizontal drift: starts upper-left, drifts to lower-right
  const startX = width * 0.18;
  const endX = width * 0.78;
  const baseX = interpolate(tFall, [0, 1], [startX, endX]);
  // Gentle horizontal sine wander overlaid on diagonal path
  const wanderAmplitude = width * 0.06;
  const wander = Math.sin(frame * 0.012 * tempoFactor + tFall * Math.PI * 2) * wanderAmplitude;
  const horizontalX = baseX + wander;

  // Subtle slow tumble rotation
  const rotation = Math.sin(frame * 0.008 * tempoFactor) * 18 + tFall * 25;

  // Breathing scale on the bloom from slowEnergy
  const breathe = Math.sin(frame * 0.018 * tempoFactor) * 0.025 * (0.5 + slowE);
  const scale = 0.92 + slowE * 0.12 + breathe;

  // Overall opacity: fade in early, hold, fade out at edges of fall cycle
  const fallOpacity = interpolate(
    tFall,
    [0, 0.08, 0.92, 1],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const energyOpacity = interpolate(energy, [0.02, 0.3], [0.55, 0.92], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = fallOpacity * energyOpacity;

  // Glow halo intensity reacts to energy
  const glowIntensity = interpolate(energy, [0.05, 0.5], [12, 38], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Dewdrop sparkle on beats
  const dewdropOpacity = interpolate(beatD, [0, 0.6], [0.18, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dewdropScale = 1 + beatD * 0.55 + onsetEnv * 0.35;

  /* ---- Color palette: deep crimson centered, chromaHue subtly tints ---- */
  const hueShift = interpolate(chromaHue, [0, 360], [-14, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const baseHue = 352 + hueShift;
  const h = ((baseHue % 360) + 360) % 360;

  const deepCrimson = `hsl(${h}, 80%, 22%)`;
  const crimson = `hsl(${h}, 76%, 36%)`;
  const rosePink = `hsl(${(h + 8) % 360}, 72%, 52%)`;
  const coralEdge = `hsl(${(h + 14) % 360}, 78%, 68%)`;
  const budColor = `hsl(${(h - 6 + 360) % 360}, 84%, 18%)`;
  const stemGreen = `hsl(${(118 + hueShift * 0.3) % 360}, 46%, 26%)`;
  const leafGreen = `hsl(${(125 + hueShift * 0.3) % 360}, 50%, 30%)`;
  const sepalGreen = `hsl(${(115 + hueShift * 0.2) % 360}, 42%, 24%)`;
  const glowColor = `hsla(${h}, 65%, 38%, ${0.32 + energy * 0.22})`;
  const veinColor = `hsla(${(h - 10 + 360) % 360}, 55%, 18%, 0.22)`;
  const leafVeinColor = `hsla(120, 32%, 16%, 0.28)`;

  /* ---- Petal ring config ---- */
  const outerPetals = 7;
  const middlePetals = 5;
  const innerPetals = 3;

  const outerLength = 70;
  const outerWidth = 32;
  const middleLength = 52;
  const middleWidth = 24;
  const innerLength = 34;
  const innerWidth = 17;

  /* ---- Sepal config (5 sepals tucked behind bloom) ---- */
  const sepalCount = 5;
  const sepalLength = 56;
  const sepalWidth = 13;

  /* ---- Stem geometry: cubic S-curve ---- */
  const stemStartY = cy + 18;
  const stemEndY = cy + 175;
  const sp0 = { x: cx, y: stemStartY };
  const sp1 = { x: cx - 14, y: stemStartY + 55 };
  const sp2 = { x: cx + 16, y: stemStartY + 110 };
  const sp3 = { x: cx + 4, y: stemEndY };
  const stemPath = `M ${sp0.x} ${sp0.y} C ${sp1.x} ${sp1.y} ${sp2.x} ${sp2.y} ${sp3.x} ${sp3.y}`;

  // Evaluate cubic bezier point on stem at parameter t
  function stemPoint(t: number): { x: number; y: number } {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * sp0.x + 3 * mt * mt * t * sp1.x + 3 * mt * t * t * sp2.x + t * t * t * sp3.x,
      y: mt * mt * mt * sp0.y + 3 * mt * mt * t * sp1.y + 3 * mt * t * t * sp2.y + t * t * t * sp3.y,
    };
  }

  // Evaluate cubic bezier tangent on stem at parameter t
  function stemTangent(t: number): { dx: number; dy: number } {
    const mt = 1 - t;
    return {
      dx: 3 * mt * mt * (sp1.x - sp0.x) + 6 * mt * t * (sp2.x - sp1.x) + 3 * t * t * (sp3.x - sp2.x),
      dy: 3 * mt * mt * (sp1.y - sp0.y) + 6 * mt * t * (sp2.y - sp1.y) + 3 * t * t * (sp3.y - sp2.y),
    };
  }

  // 4 thorns along stem (alternating sides), tangent-aligned
  const thorns = [
    { t: 0.22, side: "right" as const },
    { t: 0.42, side: "left" as const },
    { t: 0.62, side: "right" as const },
    { t: 0.82, side: "left" as const },
  ];

  // 2 leaves with midrib + lateral veins
  const leaves = [
    { t: 0.34, side: "left" as const, size: 1.0 },
    { t: 0.6, side: "right" as const, size: 0.85 },
  ];

  /* ---- Trail of ghost echoes (3 fading copies behind the rose) ---- */
  // Each ghost samples a slightly earlier frame in the fall path
  const ghostOffsets = [
    { lag: 0.025, opacity: 0.32, scale: 0.94 },
    { lag: 0.05, opacity: 0.18, scale: 0.88 },
    { lag: 0.08, opacity: 0.09, scale: 0.82 },
  ];

  /* ---- Floating petal escapees ---- */
  // 2 baseline + extras spawned on onsets
  const baselinePetals = 2;
  const onsetPetals = Math.floor(onsetEnv * 3); // 0-3 extras on strong onsets
  const totalFloating = baselinePetals + onsetPetals;

  const floatingPetals = Array.from({ length: totalFloating }, (_, i) => {
    // Each petal has its own deterministic phase
    const phase = (i * 1.7 + 0.3) % 1;
    const seed = i * 137.5 + 42;
    const drift = ((frame + seed) % 240) / 240; // 8s lifetime
    // Drift away from rose center in random direction
    const angle = (i / totalFloating) * Math.PI * 2 + frame * 0.003;
    const distance = drift * (60 + (i % 3) * 20);
    const px = Math.cos(angle) * distance;
    const py = Math.sin(angle) * distance + drift * 35; // gravity adds downward
    const petalRot = drift * 180 + i * 23;
    const petalOpacity = (1 - drift) * 0.55;
    return {
      x: px,
      y: py,
      rotation: petalRot,
      opacity: petalOpacity,
      scale: 0.35 + (i % 2) * 0.08,
      phase,
    };
  });

  /* ---- Render a single rose body (used for main + ghosts) ---- */
  const roseBody = (
    <svg
      width={baseSize}
      height={baseSize * 1.85}
      viewBox="0 0 400 740"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible" }}
    >
      <defs>
        {/* Atmospheric radial glow halo behind bloom */}
        <radialGradient id="sugaree-glow" cx="50%" cy="27%" r="32%">
          <stop offset="0%" stopColor={glowColor} />
          <stop offset="60%" stopColor={`hsla(${h}, 60%, 30%, 0.14)`} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>

        {/* Outer petal: deep base to coral edge */}
        <radialGradient id="sugaree-petal-outer" cx="50%" cy="92%" r="85%">
          <stop offset="0%" stopColor={deepCrimson} />
          <stop offset="35%" stopColor={crimson} />
          <stop offset="75%" stopColor={rosePink} />
          <stop offset="100%" stopColor={coralEdge} />
        </radialGradient>

        {/* Middle petal */}
        <radialGradient id="sugaree-petal-mid" cx="50%" cy="90%" r="78%">
          <stop offset="0%" stopColor={crimson} />
          <stop offset="55%" stopColor={rosePink} />
          <stop offset="100%" stopColor={coralEdge} />
        </radialGradient>

        {/* Inner petal — brightest, closest to bud */}
        <radialGradient id="sugaree-petal-inner" cx="50%" cy="88%" r="72%">
          <stop offset="0%" stopColor={rosePink} />
          <stop offset="100%" stopColor={coralEdge} />
        </radialGradient>

        {/* Stem gradient */}
        <linearGradient id="sugaree-stem" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stemGreen} />
          <stop offset="100%" stopColor={`hsl(${(116 + hueShift * 0.3) % 360}, 36%, 20%)`} />
        </linearGradient>

        {/* Leaf gradient */}
        <linearGradient id="sugaree-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={leafGreen} />
          <stop offset="100%" stopColor={`hsl(${(120 + hueShift * 0.2) % 360}, 42%, 22%)`} />
        </linearGradient>

        {/* Dewdrop radial */}
        <radialGradient id="sugaree-dewdrop" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="40%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>

        {/* Soft glow blur */}
        <filter id="sugaree-glow-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={glowIntensity * 0.4} />
        </filter>
        <filter id="sugaree-dew-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      {/* ============ Atmospheric radial glow halo ============ */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={130 + energy * 32}
        ry={118 + energy * 28}
        fill="url(#sugaree-glow)"
        filter="url(#sugaree-glow-blur)"
      />

      {/* ============ Stem with cubic S-curve ============ */}
      <path
        d={stemPath}
        stroke="url(#sugaree-stem)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* ---- Thorns (4, tangent-aligned triangles) ---- */}
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
            key={`sugaree-thorn-${i}`}
            d={`M ${b1x} ${b1y} L ${tipX} ${tipY} L ${b2x} ${b2y} Z`}
            fill={stemGreen}
            opacity={0.88}
          />
        );
      })}

      {/* ---- Leaves (2 with midrib + 4 lateral veins each) ---- */}
      {leaves.map((leaf, i) => {
        const pt = stemPoint(leaf.t);
        const tan = stemTangent(leaf.t);
        const len = Math.sqrt(tan.dx * tan.dx + tan.dy * tan.dy) || 1;
        const nx = -tan.dy / len;
        const ny = tan.dx / len;
        const sign = leaf.side === "right" ? 1 : -1;
        const leafLen = 44 * leaf.size;
        const tipX = pt.x + (nx * sign * leafLen * 0.82) + (tan.dx / len * leafLen * 0.42);
        const tipY = pt.y + (ny * sign * leafLen * 0.82) + (tan.dy / len * leafLen * 0.42);
        const bulge = 0.36;
        const lp = leafPath(pt.x, pt.y, tipX, tipY, bulge, leaf.side);
        const veins = leafVeinPaths(pt.x, pt.y, tipX, tipY, bulge, leaf.side);
        return (
          <g key={`sugaree-leaf-${i}`}>
            <path d={lp} fill="url(#sugaree-leaf)" opacity={0.85} />
            {veins.map((v, vi) => (
              <path
                key={`sugaree-leaf-vein-${i}-${vi}`}
                d={v}
                stroke={leafVeinColor}
                strokeWidth="0.6"
                fill="none"
              />
            ))}
          </g>
        );
      })}

      {/* ============ Sepals (5 behind bloom) ============ */}
      {Array.from({ length: sepalCount }, (_, i) => {
        const angle = (i / sepalCount) * 360 + 36;
        const sp = petalPath(cx, cy + 8, sepalLength, sepalWidth, 0.32);
        return (
          <path
            key={`sugaree-sepal-${i}`}
            d={sp}
            fill={sepalGreen}
            opacity={0.62}
            transform={`rotate(${angle} ${cx} ${cy})`}
          />
        );
      })}

      {/* ============ Outer petal ring (7 petals) ============ */}
      {Array.from({ length: outerPetals }, (_, i) => {
        const angle = (i / outerPetals) * 360;
        const curlDir = i % 2 === 0 ? 1 : -1;
        const curlAmount = curlDir * (0.62 + Math.sin(i * 1.3) * 0.32);
        const pp = petalPath(cx, cy, outerLength, outerWidth, curlAmount);
        const veins = petalVeinPaths(cx, cy, outerLength, curlAmount);
        const petalOpacity = 0.93 - i * 0.012;
        return (
          <g
            key={`sugaree-outer-${i}`}
            transform={`rotate(${angle} ${cx} ${cy})`}
            opacity={petalOpacity}
          >
            <path d={pp} fill="url(#sugaree-petal-outer)" />
            <path
              d={pp}
              fill="none"
              stroke={coralEdge}
              strokeWidth="0.7"
              opacity={0.28}
            />
            {veins.map((v, vi) => (
              <path
                key={`sugaree-ov-${i}-${vi}`}
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
        const angle = (i / middlePetals) * 360 + 25;
        const curlDir = i % 2 === 0 ? -1 : 1;
        const curlAmount = curlDir * (0.52 + Math.cos(i * 1.7) * 0.28);
        const pp = petalPath(cx, cy, middleLength, middleWidth, curlAmount);
        const veins = petalVeinPaths(cx, cy, middleLength, curlAmount);
        return (
          <g
            key={`sugaree-mid-${i}`}
            transform={`rotate(${angle} ${cx} ${cy})`}
            opacity={0.87}
          >
            <path d={pp} fill="url(#sugaree-petal-mid)" />
            <path
              d={pp}
              fill="none"
              stroke={coralEdge}
              strokeWidth="0.5"
              opacity={0.22}
            />
            {veins.map((v, vi) => (
              <path
                key={`sugaree-mv-${i}-${vi}`}
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
        const angle = (i / innerPetals) * 360 + 60;
        const curlAmount = (i % 2 === 0 ? 1 : -1) * 0.42;
        const pp = petalPath(cx, cy, innerLength, innerWidth, curlAmount);
        const veins = petalVeinPaths(cx, cy, innerLength, curlAmount);
        return (
          <g
            key={`sugaree-inner-${i}`}
            transform={`rotate(${angle} ${cx} ${cy})`}
            opacity={0.8}
          >
            <path d={pp} fill="url(#sugaree-petal-inner)" />
            {veins.map((v, vi) => (
              <path
                key={`sugaree-iv-${i}-${vi}`}
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
        strokeWidth="1.8"
        fill="none"
        opacity={0.72}
      />
      <circle cx={cx} cy={cy} r={6} fill={budColor} opacity={0.88} />
      <circle cx={cx - 1.5} cy={cy - 1.5} r={2.4} fill={crimson} opacity={0.55} />

      {/* ============ Dewdrop on outer petal (beat-sparkle) ============ */}
      <g
        transform={`translate(${cx + 24}, ${cy - 56}) scale(${dewdropScale})`}
        opacity={dewdropOpacity}
      >
        <ellipse
          cx="0"
          cy="0"
          rx="3.6"
          ry="4.6"
          fill="url(#sugaree-dewdrop)"
          filter="url(#sugaree-dew-blur)"
        />
        <ellipse
          cx="-1"
          cy="-1.5"
          rx="1.2"
          ry="1.0"
          fill="rgba(255,255,255,0.92)"
        />
      </g>

      {/* ============ Floating petal escapees ============ */}
      {floatingPetals.map((fp, i) => {
        const pp = petalPath(cx + fp.x, cy + fp.y, outerLength * fp.scale, outerWidth * fp.scale, 0.5);
        return (
          <g
            key={`sugaree-float-${i}`}
            opacity={fp.opacity}
            transform={`rotate(${fp.rotation} ${cx + fp.x} ${cy + fp.y})`}
          >
            <path d={pp} fill="url(#sugaree-petal-mid)" />
          </g>
        );
      })}
    </svg>
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* ---- Ghost trail (3 fading echoes behind main rose) ---- */}
      {ghostOffsets.map((ghost, i) => {
        const ghostT = Math.max(0, tFall - ghost.lag);
        const gY = interpolate(ghostT, [0, 1], [startY, endY]);
        const gBaseX = interpolate(ghostT, [0, 1], [startX, endX]);
        const gWander = Math.sin((frame - ghost.lag * fallPeriod) * 0.012 * tempoFactor + ghostT * Math.PI * 2) * wanderAmplitude;
        const gX = gBaseX + gWander;
        const gRot = Math.sin((frame - ghost.lag * fallPeriod) * 0.008 * tempoFactor) * 18 + ghostT * 25;
        return (
          <div
            key={`sugaree-ghost-${i}`}
            style={{
              position: "absolute",
              left: gX - baseSize / 2,
              top: gY - (baseSize * 1.85) / 2,
              transform: `rotate(${gRot}deg) scale(${ghost.scale * scale})`,
              transformOrigin: "center center",
              opacity: ghost.opacity * opacity,
              willChange: "transform, opacity",
              filter: `blur(${1.5 + i * 0.8}px)`,
            }}
          >
            {roseBody}
          </div>
        );
      })}

      {/* ---- Main rose ---- */}
      <div
        style={{
          position: "absolute",
          left: horizontalX - baseSize / 2,
          top: verticalY - (baseSize * 1.85) / 2,
          transform: `rotate(${rotation}deg) scale(${scale})`,
          transformOrigin: "center center",
          opacity,
          willChange: "transform, opacity",
        }}
      >
        {roseBody}
      </div>
    </div>
  );
};
