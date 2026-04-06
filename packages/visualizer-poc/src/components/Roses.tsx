/**
 * Roses -- Skeleton & Roses / American Beauty style overlay.
 *
 * A+++ quality: 3 featured roses with anatomically layered petals (outer 7,
 * middle 5, inner 3, central bud spiral), per-petal radial gradients, subtle
 * petal veins, sepals, dewdrop highlights that sparkle on beat, organic cubic
 * bezier vine with branching tendrils, tangent-aligned thorns, veined leaves,
 * vine growth animation over 6 seconds, and atmospheric radial glow.
 *
 * Audio mapping:
 *   slowEnergy  -> bloom breathing (petal openness)
 *   beatDecay   -> dewdrop sparkle
 *   chromaHue   -> hue tint within crimson/pink range
 *   energy      -> overall opacity + glow intensity
 *   bass        -> petal sway
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Color utilities                                                    */
/* ------------------------------------------------------------------ */

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) { r = c; g = x; }
  else if (sector === 1) { r = x; g = c; }
  else if (sector === 2) { g = c; b = x; }
  else if (sector === 3) { g = x; b = c; }
  else if (sector === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const hex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v + m)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/* ------------------------------------------------------------------ */
/*  Rose geometry helpers                                              */
/* ------------------------------------------------------------------ */

interface PetalDef {
  angle: number;
  radius: number;
  width: number;
  height: number;
  curlTip: number; // tip curl amount
  layer: "outer" | "middle" | "inner";
}

function buildPetalPath(
  cx: number,
  cy: number,
  petal: PetalDef,
  bloom: number,
): string {
  const { angle, radius, width, height, curlTip } = petal;
  const px = cx + Math.cos(angle) * radius * bloom;
  const py = cy + Math.sin(angle) * radius * bloom;
  const a = angle + Math.PI / 2;
  const cosa = Math.cos(a);
  const sina = Math.sin(a);
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);

  // Base points (where petal meets center)
  const bx1 = px - cosa * width * 0.5;
  const by1 = py - sina * width * 0.5;
  const bx2 = px + cosa * width * 0.5;
  const by2 = py + sina * width * 0.5;

  // Tip point with curl
  const tipDist = height * (0.6 + bloom * 0.4);
  const curlAngle = angle + curlTip * bloom * 0.3;
  const tx = px + Math.cos(curlAngle) * tipDist;
  const ty = py + Math.sin(curlAngle) * tipDist;

  // Bezier control points for curved petal edges
  const cpOff = height * 0.55;
  const cpWidth = width * 0.7;
  const cp1x = bx1 + cosAngle * cpOff - cosa * cpWidth * 0.2;
  const cp1y = by1 + sinAngle * cpOff - sina * cpWidth * 0.2;
  const cp2x = bx2 + cosAngle * cpOff + cosa * cpWidth * 0.2;
  const cp2y = by2 + sinAngle * cpOff + sina * cpWidth * 0.2;

  return `M ${px} ${py} Q ${cp1x} ${cp1y} ${tx} ${ty} Q ${cp2x} ${cp2y} ${px} ${py} Z`;
}

/* ------------------------------------------------------------------ */
/*  Petal vein path                                                    */
/* ------------------------------------------------------------------ */

function buildVeinPath(
  cx: number,
  cy: number,
  petal: PetalDef,
  bloom: number,
): string {
  const { angle, radius, height, curlTip } = petal;
  const px = cx + Math.cos(angle) * radius * bloom;
  const py = cy + Math.sin(angle) * radius * bloom;
  const tipDist = height * (0.6 + bloom * 0.4) * 0.85;
  const curlAngle = angle + curlTip * bloom * 0.3;
  const tx = px + Math.cos(curlAngle) * tipDist;
  const ty = py + Math.sin(curlAngle) * tipDist;
  const midX = (px + tx) / 2;
  const midY = (py + ty) / 2;
  const perpX = -Math.sin(angle) * 1.2;
  const perpY = Math.cos(angle) * 1.2;
  return `M ${px} ${py} Q ${midX + perpX} ${midY + perpY} ${tx} ${ty}`;
}

/* ------------------------------------------------------------------ */
/*  Single Rose component                                              */
/* ------------------------------------------------------------------ */

interface RoseProps {
  size: number;
  bloom: number;
  sway: number;
  hueShift: number; // 0-1 chroma shift
  beatDecay: number;
  rng: () => number;
  defIdPrefix: string;
}

const Rose: React.FC<RoseProps> = ({
  size,
  bloom,
  sway,
  hueShift,
  beatDecay,
  rng,
  defIdPrefix,
}) => {
  const cx = 50;
  const cy = 50;

  // Color palette: deep crimson shifted by chromaHue within red/pink range
  const baseHue = 0.97 + hueShift * 0.06; // 0.97-1.03 (wraps through red)
  const petalDark = hslToHex(baseHue, 0.85, 0.22);
  const petalMid = hslToHex(baseHue, 0.9, 0.35);
  const petalLight = hslToHex(baseHue + 0.01, 0.8, 0.48);
  const petalInner = hslToHex(baseHue + 0.02, 0.75, 0.55);
  const budColor = hslToHex(baseHue + 0.03, 0.7, 0.6);
  const sepalColor = hslToHex(0.33, 0.6, 0.25); // dark green
  const sepalLight = hslToHex(0.33, 0.5, 0.35);

  // Build petal definitions with seeded randomness for organic variation
  const petals = useMemo(() => {
    const defs: PetalDef[] = [];

    // 7 outer petals
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng() * 0.15;
      defs.push({
        angle: a,
        radius: 16 + rng() * 3,
        width: 8 + rng() * 2,
        height: 14 + rng() * 3,
        curlTip: (rng() - 0.5) * 1.5,
        layer: "outer",
      });
    }

    // 5 middle petals
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3 + rng() * 0.1;
      defs.push({
        angle: a,
        radius: 9 + rng() * 2,
        width: 6 + rng() * 1.5,
        height: 10 + rng() * 2,
        curlTip: (rng() - 0.5) * 1.0,
        layer: "middle",
      });
    }

    // 3 inner petals
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.6 + rng() * 0.15;
      defs.push({
        angle: a,
        radius: 4 + rng() * 1.5,
        width: 4 + rng() * 1,
        height: 7 + rng() * 1.5,
        curlTip: (rng() - 0.5) * 0.6,
        layer: "inner",
      });
    }
    return defs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dewdrop position: pick a random outer petal
  const dewPetalIdx = Math.floor(rng() * 7);
  const dewPetal = petals[dewPetalIdx];
  const dewAngle = dewPetal?.angle ?? 0;
  const dewR = (dewPetal?.radius ?? 16) * bloom * 0.7;
  const dewX = cx + Math.cos(dewAngle) * dewR + 3;
  const dewY = cy + Math.sin(dewAngle) * dewR - 1;

  // Gradient IDs
  const gradOuter = `${defIdPrefix}-gO`;
  const gradMiddle = `${defIdPrefix}-gM`;
  const gradInner = `${defIdPrefix}-gI`;
  const gradSepal = `${defIdPrefix}-gS`;
  const gradGlow = `${defIdPrefix}-gG`;
  const gradDew = `${defIdPrefix}-gD`;

  const layerColor = (layer: PetalDef["layer"]) =>
    layer === "outer" ? gradOuter : layer === "middle" ? gradMiddle : gradInner;

  const layerOpacity = (layer: PetalDef["layer"]) =>
    layer === "outer" ? 0.85 : layer === "middle" ? 0.9 : 0.95;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        {/* Per-layer radial gradients: darker base, lighter edge */}
        <radialGradient id={gradOuter} cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor={petalDark} />
          <stop offset="60%" stopColor={petalMid} />
          <stop offset="100%" stopColor={petalLight} />
        </radialGradient>
        <radialGradient id={gradMiddle} cx="40%" cy="40%" r="65%">
          <stop offset="0%" stopColor={petalMid} />
          <stop offset="70%" stopColor={petalLight} />
          <stop offset="100%" stopColor={petalInner} />
        </radialGradient>
        <radialGradient id={gradInner} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={petalLight} />
          <stop offset="100%" stopColor={budColor} />
        </radialGradient>
        <radialGradient id={gradSepal} cx="50%" cy="20%" r="80%">
          <stop offset="0%" stopColor={sepalColor} />
          <stop offset="100%" stopColor={sepalLight} />
        </radialGradient>
        <radialGradient id={gradGlow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={petalMid} stopOpacity="0.35" />
          <stop offset="100%" stopColor={petalMid} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={gradDew} cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#ddeeff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#aaccee" stopOpacity="0.1" />
        </radialGradient>
      </defs>

      <g transform={`rotate(${sway}, ${cx}, ${cy})`}>
        {/* Atmospheric glow behind the bloom */}
        <circle cx={cx} cy={cy} r={38} fill={`url(#${gradGlow})`} />

        {/* Sepals: 5 pointed leaves behind the bloom */}
        {Array.from({ length: 5 }, (_, i) => {
          const a = (i / 5) * Math.PI * 2 + 0.15;
          const sx = cx + Math.cos(a) * 18 * bloom;
          const sy = cy + Math.sin(a) * 18 * bloom;
          const tipX = cx + Math.cos(a) * 32 * bloom;
          const tipY = cy + Math.sin(a) * 32 * bloom;
          const perpX = -Math.sin(a) * 4;
          const perpY = Math.cos(a) * 4;
          const path = `M ${cx + Math.cos(a) * 6} ${cy + Math.sin(a) * 6}
            Q ${sx + perpX} ${sy + perpY} ${tipX} ${tipY}
            Q ${sx - perpX} ${sy - perpY} ${cx + Math.cos(a) * 6} ${cy + Math.sin(a) * 6} Z`;
          return (
            <path
              key={`sepal-${i}`}
              d={path}
              fill={`url(#${gradSepal})`}
              opacity={0.7}
            />
          );
        })}

        {/* Outer petals (7) */}
        {petals
          .filter((p) => p.layer === "outer")
          .map((p, i) => (
            <g key={`outer-${i}`}>
              <path
                d={buildPetalPath(cx, cy, p, bloom)}
                fill={`url(#${layerColor(p.layer)})`}
                opacity={layerOpacity(p.layer)}
              />
              {/* Subtle vein */}
              <path
                d={buildVeinPath(cx, cy, p, bloom)}
                stroke={petalDark}
                strokeWidth={0.25}
                fill="none"
                opacity={0.2}
              />
            </g>
          ))}

        {/* Middle petals (5) */}
        {petals
          .filter((p) => p.layer === "middle")
          .map((p, i) => (
            <g key={`mid-${i}`}>
              <path
                d={buildPetalPath(cx, cy, p, bloom)}
                fill={`url(#${layerColor(p.layer)})`}
                opacity={layerOpacity(p.layer)}
              />
              <path
                d={buildVeinPath(cx, cy, p, bloom)}
                stroke={petalMid}
                strokeWidth={0.2}
                fill="none"
                opacity={0.15}
              />
            </g>
          ))}

        {/* Inner petals (3) */}
        {petals
          .filter((p) => p.layer === "inner")
          .map((p, i) => (
            <path
              key={`inner-${i}`}
              d={buildPetalPath(cx, cy, p, bloom)}
              fill={`url(#${layerColor(p.layer)})`}
              opacity={layerOpacity(p.layer)}
            />
          ))}

        {/* Central bud spiral */}
        {(() => {
          const spiralPts: string[] = [];
          for (let t = 0; t < Math.PI * 4; t += 0.3) {
            const r = 1 + t * 0.5 * bloom;
            const x = cx + Math.cos(t * 1.2) * r;
            const y = cy + Math.sin(t * 1.2) * r;
            spiralPts.push(`${x},${y}`);
          }
          return (
            <polyline
              points={spiralPts.join(" ")}
              stroke={budColor}
              strokeWidth={0.8}
              fill="none"
              opacity={0.6}
            />
          );
        })()}

        {/* Center pistil */}
        <circle cx={cx} cy={cy} r={2.5 + bloom * 1.5} fill="#FFD700" opacity={0.75} />
        <circle cx={cx} cy={cy} r={1.2} fill="#8B4513" opacity={0.5} />

        {/* Dewdrop highlight -- sparkles with beatDecay */}
        <circle
          cx={dewX}
          cy={dewY}
          r={1.2 + beatDecay * 0.8}
          fill={`url(#${gradDew})`}
          opacity={0.3 + beatDecay * 0.7}
        />
        {/* Specular highlight inside dewdrop */}
        <circle
          cx={dewX - 0.3}
          cy={dewY - 0.3}
          r={0.4 + beatDecay * 0.3}
          fill="#ffffff"
          opacity={0.5 + beatDecay * 0.5}
        />
      </g>
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Vine geometry                                                      */
/* ------------------------------------------------------------------ */

interface VinePoint {
  x: number;
  y: number;
  angle: number; // tangent angle at this point
}

function evaluateCubicBezier(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
  t: number,
): { x: number; y: number; angle: number } {
  const u = 1 - t;
  const x = u * u * u * p0x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * p3x;
  const y = u * u * u * p0y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * p3y;
  // Tangent
  const dx = 3 * u * u * (p1x - p0x) + 6 * u * t * (p2x - p1x) + 3 * t * t * (p3x - p2x);
  const dy = 3 * u * u * (p1y - p0y) + 6 * u * t * (p2y - p1y) + 3 * t * t * (p3y - p2y);
  return { x, y, angle: Math.atan2(dy, dx) };
}

/* ------------------------------------------------------------------ */
/*  Thorned Vine component                                             */
/* ------------------------------------------------------------------ */

interface VineProps {
  width: number;
  height: number;
  progress: number; // 0-1 growth
  hueShift: number;
}

const ThornedVine: React.FC<VineProps> = ({ width, height, progress, hueShift }) => {
  const vineColor = hslToHex(0.33, 0.55, 0.22 + hueShift * 0.03);
  const vineLight = hslToHex(0.33, 0.45, 0.32);
  const leafDark = hslToHex(0.33, 0.6, 0.2);
  const leafLight = hslToHex(0.35, 0.5, 0.35);

  // Main vine: cubic bezier from left to right with organic wave
  const vineY = height - 55;
  const p0 = { x: -20, y: vineY + 15 };
  const p1 = { x: width * 0.25, y: vineY - 30 };
  const p2 = { x: width * 0.65, y: vineY + 25 };
  const p3 = { x: width + 20, y: vineY - 10 };

  // Sample points along the vine for thorns, leaves, and tendrils
  const vinePoints = useMemo(() => {
    const pts: VinePoint[] = [];
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pt = evaluateCubicBezier(
        p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, t,
      );
      pts.push(pt);
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // Build the main vine SVG path
  const vinePath = useMemo(() => {
    const visiblePts = vinePoints.filter(
      (_, i) => i / vinePoints.length <= progress,
    );
    if (visiblePts.length < 2) return "";
    let d = `M ${visiblePts[0].x} ${visiblePts[0].y}`;
    for (let i = 1; i < visiblePts.length; i++) {
      d += ` L ${visiblePts[i].x} ${visiblePts[i].y}`;
    }
    return d;
  }, [vinePoints, progress]);

  // Thorns: every 4th point, alternating sides
  const thorns = useMemo(() => {
    const result: { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number }[] = [];
    for (let i = 3; i < vinePoints.length; i += 4) {
      if (i / vinePoints.length > progress) break;
      const pt = vinePoints[i];
      const side = (i % 8 < 4) ? 1 : -1;
      const perpAngle = pt.angle + (Math.PI / 2) * side;
      const thornLen = 6;
      // Sharp triangular thorn aligned to tangent
      const baseOff = 2;
      const bx1 = pt.x + Math.cos(pt.angle) * baseOff;
      const by1 = pt.y + Math.sin(pt.angle) * baseOff;
      const bx2 = pt.x - Math.cos(pt.angle) * baseOff;
      const by2 = pt.y - Math.sin(pt.angle) * baseOff;
      const tx = pt.x + Math.cos(perpAngle) * thornLen;
      const ty = pt.y + Math.sin(perpAngle) * thornLen;
      result.push({ x1: bx1, y1: by1, x2: tx, y2: ty, x3: bx2, y3: by2 });
    }
    return result;
  }, [vinePoints, progress]);

  // Leaves: every 12th point
  const leaves = useMemo(() => {
    const result: { cx: number; cy: number; angle: number; side: number }[] = [];
    for (let i = 6; i < vinePoints.length; i += 12) {
      if (i / vinePoints.length > progress) break;
      const pt = vinePoints[i];
      const side = (i % 24 < 12) ? 1 : -1;
      result.push({ cx: pt.x, cy: pt.y, angle: pt.angle, side });
    }
    return result;
  }, [vinePoints, progress]);

  // Branching tendrils: every 18th point
  const tendrils = useMemo(() => {
    const result: string[] = [];
    for (let i = 9; i < vinePoints.length; i += 18) {
      if (i / vinePoints.length > progress) break;
      const pt = vinePoints[i];
      const side = (i % 36 < 18) ? 1 : -1;
      const perpAngle = pt.angle + (Math.PI / 2) * side;
      const len = 18 + (i % 7) * 2;
      // Spiraling tendril
      let d = `M ${pt.x} ${pt.y}`;
      const steps = 8;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const spiralAngle = perpAngle + t * Math.PI * 1.5 * side;
        const r = len * t;
        const tx = pt.x + Math.cos(spiralAngle) * r * 0.6;
        const ty = pt.y + Math.sin(spiralAngle) * r * 0.4;
        d += ` L ${tx} ${ty}`;
      }
      result.push(d);
    }
    return result;
  }, [vinePoints, progress]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
      fill="none"
    >
      {/* Main vine stroke */}
      <path
        d={vinePath}
        stroke={vineColor}
        strokeWidth={3.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.75}
      />
      {/* Secondary lighter vine stroke */}
      <path
        d={vinePath}
        stroke={vineLight}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.35}
        transform="translate(0, -1.5)"
      />

      {/* Branching tendrils */}
      {tendrils.map((d, i) => (
        <path
          key={`tendril-${i}`}
          d={d}
          stroke={vineColor}
          strokeWidth={1}
          strokeLinecap="round"
          fill="none"
          opacity={0.4}
        />
      ))}

      {/* Thorns: sharp triangular, tangent-aligned */}
      {thorns.map((t, i) => (
        <polygon
          key={`thorn-${i}`}
          points={`${t.x1},${t.y1} ${t.x2},${t.y2} ${t.x3},${t.y3}`}
          fill={vineColor}
          opacity={0.55}
        />
      ))}

      {/* Leaves with midrib + lateral veins */}
      {leaves.map((leaf, i) => {
        const perpAngle = leaf.angle + (Math.PI / 2) * leaf.side;
        const leafLen = 16;
        const leafWidth = 7;
        // Leaf tip
        const tipX = leaf.cx + Math.cos(perpAngle) * leafLen;
        const tipY = leaf.cy + Math.sin(perpAngle) * leafLen;
        // Control points for leaf shape
        const perpLeaf = perpAngle + Math.PI / 2;
        const midX = (leaf.cx + tipX) / 2;
        const midY = (leaf.cy + tipY) / 2;
        const cp1x = midX + Math.cos(perpLeaf) * leafWidth;
        const cp1y = midY + Math.sin(perpLeaf) * leafWidth;
        const cp2x = midX - Math.cos(perpLeaf) * leafWidth;
        const cp2y = midY - Math.sin(perpLeaf) * leafWidth;

        const leafPath = `M ${leaf.cx} ${leaf.cy} Q ${cp1x} ${cp1y} ${tipX} ${tipY} Q ${cp2x} ${cp2y} ${leaf.cx} ${leaf.cy} Z`;

        // Midrib
        const midribPath = `M ${leaf.cx} ${leaf.cy} L ${tipX} ${tipY}`;

        // Lateral veins (3 pairs)
        const lateralVeins: string[] = [];
        for (let v = 1; v <= 3; v++) {
          const t = v / 4;
          const vx = leaf.cx + (tipX - leaf.cx) * t;
          const vy = leaf.cy + (tipY - leaf.cy) * t;
          const vLen = leafWidth * (1 - t * 0.4) * 0.6;
          lateralVeins.push(
            `M ${vx} ${vy} L ${vx + Math.cos(perpLeaf) * vLen} ${vy + Math.sin(perpLeaf) * vLen}`,
          );
          lateralVeins.push(
            `M ${vx} ${vy} L ${vx - Math.cos(perpLeaf) * vLen} ${vy - Math.sin(perpLeaf) * vLen}`,
          );
        }

        return (
          <g key={`leaf-${i}`}>
            <path d={leafPath} fill={leafDark} opacity={0.55} />
            <path d={leafPath} fill={leafLight} opacity={0.2} />
            <path
              d={midribPath}
              stroke={vineColor}
              strokeWidth={0.6}
              fill="none"
              opacity={0.5}
            />
            {lateralVeins.map((vd, vi) => (
              <path
                key={`lv-${vi}`}
                d={vd}
                stroke={vineColor}
                strokeWidth={0.35}
                fill="none"
                opacity={0.35}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Rose positions                                                     */
/* ------------------------------------------------------------------ */

const ROSE_CONFIGS = [
  { left: "50%", top: "45%", scale: 1.0, bloomMul: 1.0, swayMul: 1.0, rotation: 0, opacityMul: 1.0 },
  { left: "20%", top: "55%", scale: 0.65, bloomMul: 0.75, swayMul: 0.7, rotation: -18, opacityMul: 0.75 },
  { left: "80%", top: "58%", scale: 0.7, bloomMul: 0.85, swayMul: -0.85, rotation: 14, opacityMul: 0.7 },
] as const;

/* ------------------------------------------------------------------ */
/*  Main export                                                        */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const Roses: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const bass = snap.bass;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue / 360;

  // Vine growth: extends over first 6 seconds then holds
  const growthFrames = 6 * fps;
  const vineProgress = interpolate(frame, [0, growthFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bloom: slowEnergy breathes petal openness for organic feel
  const bloom = interpolate(slowEnergy, [0.02, 0.3], [0.25, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bass-driven petal sway, tempo-scaled
  const sway = Math.sin(frame * 0.025 * tempoFactor) * (2 + bass * 10);

  // Overall opacity: energy-driven
  const baseOpacity = interpolate(energy, [0.02, 0.3], [0.35, 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow radius from energy
  const glowRadius = interpolate(energy, [0.05, 0.3], [4, 22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Rose base size scaled to resolution
  const resScale = height / 1080;
  const baseRoseSize = Math.round(240 * resScale);

  // Glow color
  const glowColor = hslToHex(0.97 + chromaHue * 0.06, 0.8, 0.35);

  // Seeded RNG per-rose (deterministic across frames)
  const rngFns = useMemo(() => {
    return ROSE_CONFIGS.map((_, i) => seeded(42 + i * 137));
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Thorned vine along lower portion */}
      <ThornedVine
        width={width}
        height={height}
        progress={vineProgress}
        hueShift={chromaHue}
      />

      {/* 3 featured roses */}
      {ROSE_CONFIGS.map((cfg, i) => {
        const roseSize = Math.round(baseRoseSize * cfg.scale);
        const roseBloom = bloom * cfg.bloomMul;
        const roseSway = sway * cfg.swayMul;
        const roseOpacity = baseOpacity * cfg.opacityMul;
        const roseGlow = glowRadius * cfg.scale;
        const pulseScale = 1 + snap.onsetEnvelope * 0.03 * cfg.scale;

        return (
          <div
            key={`rose-${i}`}
            style={{
              position: "absolute",
              left: cfg.left,
              top: cfg.top,
              transform: `translate(-50%, -50%) rotate(${cfg.rotation}deg) scale(${pulseScale})`,
              opacity: roseOpacity,
              filter: `drop-shadow(0 0 ${roseGlow}px ${glowColor})`,
              willChange: "transform, opacity, filter",
            }}
          >
            <Rose
              size={roseSize}
              bloom={roseBloom}
              sway={roseSway}
              hueShift={chromaHue}
              beatDecay={beatDecay}
              rng={rngFns[i]}
              defIdPrefix={`rose-${i}`}
            />
          </div>
        );
      })}
    </div>
  );
};
