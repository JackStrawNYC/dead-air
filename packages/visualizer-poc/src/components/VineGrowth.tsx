/**
 * VineGrowth — A+++ botanical vine overgrowth.
 *
 * Climbing vines spread from all four corners across the frame, growing over a
 * weathered stone wall background. Multi-layer depth: distant stone wall with
 * cracks and moss, midground vine network with curling tendrils, foreground
 * heavy vines with detailed leaves at multiple sizes, and floating pollen motes
 * caught in light shafts. Each vine traces an organic cubic-bezier path with
 * branching sub-vines and dozens of leaves of varying size, hue, and orientation.
 * Botanical-illustration vibe — like an overgrown cathedral wall.
 *
 * Composition (back → front):
 *   1. Sky/atmosphere gradient (chroma-tinted, soft golden-green)
 *   2. Stone wall texture (~30 stones with cracks + mortar lines + moss patches)
 *   3. Diagonal light shafts cutting across the wall
 *   4. Back vine layer (5 vines, thin, hazy, low-opacity)
 *   5. Mid vine layer (5 vines, medium thickness, more detail)
 *   6. Front vine layer (4 vines, thick, prominent leaves)
 *   7. Tendrils (curling spirals at vine tips)
 *   8. Pollen motes / spores drifting in light
 *
 * Audio reactivity:
 *   slowEnergy → growth progression and foliage glow
 *   energy     → leaf rustle and pollen density
 *   bass       → vine sway amplitude
 *   beatDecay  → leaf sparkle pulse
 *   onsetEnvelope → tendril unfurl burst
 *   chromaHue  → green hue shift (jade → emerald → forest)
 *   tempoFactor → sway rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

const BACK_VINE_COUNT = 5;
const MID_VINE_COUNT = 5;
const FRONT_VINE_COUNT = 4;

const STONE_COUNT = 32;
const POLLEN_COUNT = 48;
const LIGHT_SHAFT_COUNT = 4;

interface LeafData {
  /** position along vine 0-1 */
  t: number;
  /** size in px */
  size: number;
  /** -1 left or 1 right */
  side: 1 | -1;
  /** rotation offset deg */
  rotOffset: number;
  /** hue offset around base green */
  hueOffset: number;
  /** saturation */
  sat: number;
  /** lightness */
  light: number;
  /** has highlight dewdrop */
  hasDew: boolean;
  /** vein detail count */
  veinCount: number;
}

interface ControlPoint {
  x: number;
  y: number;
}

interface VineData {
  /** anchor point in normalized 0..1 coords */
  start: ControlPoint;
  /** array of control points (4-7) for smoother bezier path */
  controls: ControlPoint[];
  /** end point */
  end: ControlPoint;
  /** stroke width base */
  thickness: number;
  /** color hue shift */
  hueShift: number;
  /** sway frequency */
  swayFreq: number;
  /** sway phase */
  swayPhase: number;
  /** number of leaves */
  leafCount: number;
  /** leaves */
  leaves: LeafData[];
  /** has tendril */
  hasTendril: boolean;
  /** tendril spiral count */
  tendrilSpirals: number;
  /** branch sub-vines */
  branches: BranchData[];
}

interface BranchData {
  /** parent t (where it splits off) */
  t: number;
  /** length 0-1 */
  length: number;
  /** angle from parent direction */
  angle: number;
  /** thickness multiplier */
  thickness: number;
  /** leaf count */
  leafCount: number;
  /** leaves */
  leaves: LeafData[];
}

interface StoneData {
  cx: number; // 0..1
  cy: number;
  rx: number;
  ry: number;
  rot: number;
  hueShift: number;
  hasMoss: boolean;
  crackCount: number;
}

interface PollenMote {
  x: number;
  y: number;
  size: number;
  speed: number;
  phase: number;
  amp: number;
}

interface LightShaft {
  topX: number;
  bottomX: number;
  width: number;
  intensity: number;
}

function buildLeaves(rng: () => number, count: number): LeafData[] {
  const out: LeafData[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      t: 0.08 + (i / count) * 0.86 + (rng() - 0.5) * 0.04,
      size: 8 + rng() * 18,
      side: rng() > 0.5 ? 1 : -1,
      rotOffset: (rng() - 0.5) * 70,
      hueOffset: (rng() - 0.5) * 36,
      sat: 38 + rng() * 30,
      light: 28 + rng() * 22,
      hasDew: rng() > 0.6,
      veinCount: 3 + Math.floor(rng() * 3),
    });
  }
  return out;
}

function buildVine(rng: () => number, side: "TL" | "TR" | "BL" | "BR", index: number, layer: 0 | 1 | 2): VineData {
  // Anchor at the corner side
  let start: ControlPoint, end: ControlPoint;
  const off = 0.04 + index * 0.06 + rng() * 0.05;
  switch (side) {
    case "TL":
      start = { x: -0.02 + off * 0.4, y: -0.02 + off * 0.3 };
      end = { x: 0.45 + rng() * 0.4, y: 0.55 + rng() * 0.4 };
      break;
    case "TR":
      start = { x: 1.02 - off * 0.4, y: -0.02 + off * 0.3 };
      end = { x: 0.15 + rng() * 0.4, y: 0.50 + rng() * 0.4 };
      break;
    case "BL":
      start = { x: -0.02 + off * 0.3, y: 1.02 - off * 0.4 };
      end = { x: 0.40 + rng() * 0.45, y: 0.10 + rng() * 0.45 };
      break;
    case "BR":
    default:
      start = { x: 1.02 - off * 0.3, y: 1.02 - off * 0.4 };
      end = { x: 0.10 + rng() * 0.45, y: 0.10 + rng() * 0.45 };
      break;
  }
  const ctrlCount = 4 + Math.floor(rng() * 3);
  const controls: ControlPoint[] = [];
  for (let i = 0; i < ctrlCount; i++) {
    const t = (i + 1) / (ctrlCount + 1);
    const baseX = start.x + (end.x - start.x) * t;
    const baseY = start.y + (end.y - start.y) * t;
    controls.push({
      x: baseX + (rng() - 0.5) * 0.18,
      y: baseY + (rng() - 0.5) * 0.18,
    });
  }
  const leafBase = layer === 0 ? 7 : layer === 1 ? 11 : 15;
  const leafCount = leafBase + Math.floor(rng() * 6);
  const leaves = buildLeaves(rng, leafCount);
  const branchCount = layer === 2 ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2);
  const branches: BranchData[] = [];
  for (let b = 0; b < branchCount; b++) {
    const blc = (layer === 2 ? 5 : 3) + Math.floor(rng() * 3);
    branches.push({
      t: 0.25 + rng() * 0.55,
      length: 0.18 + rng() * 0.20,
      angle: (rng() - 0.5) * 1.4,
      thickness: 0.55 + rng() * 0.25,
      leafCount: blc,
      leaves: buildLeaves(rng, blc),
    });
  }
  return {
    start,
    controls,
    end,
    thickness: layer === 0 ? 1.6 + rng() * 1.4 : layer === 1 ? 2.6 + rng() * 1.6 : 3.4 + rng() * 2.0,
    hueShift: (rng() - 0.5) * 24,
    swayFreq: 0.004 + rng() * 0.006,
    swayPhase: rng() * Math.PI * 2,
    leafCount,
    leaves,
    hasTendril: rng() > 0.35,
    tendrilSpirals: 2 + Math.floor(rng() * 3),
    branches,
  };
}

function buildStones(seed: number): StoneData[] {
  const rng = seeded(seed);
  const out: StoneData[] = [];
  // Roughly grid-laid with random offsets
  const cols = 7;
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng() > 0.92) continue;
      out.push({
        cx: (c + 0.5) / cols + (rng() - 0.5) * 0.06,
        cy: (r + 0.5) / rows + (rng() - 0.5) * 0.06,
        rx: 0.05 + rng() * 0.04,
        ry: 0.06 + rng() * 0.04,
        rot: (rng() - 0.5) * 12,
        hueShift: (rng() - 0.5) * 14,
        hasMoss: rng() > 0.5,
        crackCount: Math.floor(rng() * 3),
      });
    }
  }
  while (out.length > STONE_COUNT) out.pop();
  return out;
}

function buildPollen(seed: number): PollenMote[] {
  const rng = seeded(seed);
  return Array.from({ length: POLLEN_COUNT }, () => ({
    x: rng(),
    y: rng(),
    size: 0.6 + rng() * 1.8,
    speed: 0.003 + rng() * 0.012,
    phase: rng() * Math.PI * 2,
    amp: 4 + rng() * 12,
  }));
}

function buildLightShafts(seed: number): LightShaft[] {
  const rng = seeded(seed);
  return Array.from({ length: LIGHT_SHAFT_COUNT }, (_, i) => ({
    topX: 0.10 + (i / LIGHT_SHAFT_COUNT) * 0.8 + (rng() - 0.5) * 0.05,
    bottomX: 0.20 + (i / LIGHT_SHAFT_COUNT) * 0.8 + (rng() - 0.5) * 0.05,
    width: 0.08 + rng() * 0.07,
    intensity: 0.18 + rng() * 0.18,
  }));
}

/* Cubic bezier point and tangent at parameter t */
function bezierPoint(start: ControlPoint, ctrls: ControlPoint[], end: ControlPoint, t: number): { x: number; y: number; tx: number; ty: number } {
  // Approximate via segmented LERPs through all control points (Catmull-like)
  const pts = [start, ...ctrls, end];
  const n = pts.length - 1;
  const seg = t * n;
  const i = Math.min(n - 1, Math.floor(seg));
  const lt = seg - i;
  const p0 = pts[i];
  const p1 = pts[i + 1];
  // Smooth via mid-points
  const prev = pts[Math.max(0, i - 1)];
  const next = pts[Math.min(n, i + 2)];
  const m0x = (p1.x - prev.x) * 0.5;
  const m0y = (p1.y - prev.y) * 0.5;
  const m1x = (next.x - p0.x) * 0.5;
  const m1y = (next.y - p0.y) * 0.5;
  // Hermite
  const t2 = lt * lt;
  const t3 = t2 * lt;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + lt;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const x = h00 * p0.x + h10 * m0x + h01 * p1.x + h11 * m1x;
  const y = h00 * p0.y + h10 * m0y + h01 * p1.y + h11 * m1y;
  // Tangent
  const dh00 = 6 * t2 - 6 * lt;
  const dh10 = 3 * t2 - 4 * lt + 1;
  const dh01 = -6 * t2 + 6 * lt;
  const dh11 = 3 * t2 - 2 * lt;
  const tx = dh00 * p0.x + dh10 * m0x + dh01 * p1.x + dh11 * m1x;
  const ty = dh00 * p0.y + dh10 * m0y + dh01 * p1.y + dh11 * m1y;
  return { x, y, tx, ty };
}

/* Build smooth SVG path from start through controls to end */
function buildVinePath(v: VineData, width: number, height: number, swayX: number, growT: number): string {
  const samples = 24;
  const lastSample = Math.max(1, Math.floor(samples * growT));
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= lastSample; i++) {
    const t = i / samples;
    const p = bezierPoint(v.start, v.controls, v.end, t);
    const sx = p.x * width + swayX * (1 - Math.abs(t - 0.5) * 1.2);
    const sy = p.y * height;
    pts.push([sx, sy]);
  }
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
  }
  return d;
}

function leafPath(cx: number, cy: number, size: number, rot: number): string {
  // Pointed-oval leaf path, rotated by `rot` deg around (cx, cy)
  // Build as a parametric leaf shape
  const cosR = Math.cos((rot * Math.PI) / 180);
  const sinR = Math.sin((rot * Math.PI) / 180);
  const tx = (lx: number, ly: number) => `${(cx + lx * cosR - ly * sinR).toFixed(1)},${(cy + lx * sinR + ly * cosR).toFixed(1)}`;
  // Leaf shape: from base, two arcs to tip and back
  const baseX = 0;
  const baseY = 0;
  const tipX = 0;
  const tipY = -size;
  const sideOff = size * 0.45;
  const midY = -size * 0.55;
  return `M ${tx(baseX, baseY)} Q ${tx(sideOff, midY)} ${tx(tipX, tipY)} Q ${tx(-sideOff, midY)} ${tx(baseX, baseY)} Z`;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const VineGrowth: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const { slowEnergy, energy, bass, beatDecay, onsetEnvelope, chromaHue } = snap;

  /* --- Stable scene generation --- */
  const backVines = React.useMemo<VineData[]>(() => {
    const rng = seeded(0x7e1a90);
    return Array.from({ length: BACK_VINE_COUNT }, (_, i) =>
      buildVine(rng, ["TL", "TR", "BL", "BR"][i % 4] as "TL" | "TR" | "BL" | "BR", i, 0),
    );
  }, []);
  const midVines = React.useMemo<VineData[]>(() => {
    const rng = seeded(0x7e1a91);
    return Array.from({ length: MID_VINE_COUNT }, (_, i) =>
      buildVine(rng, ["TR", "BL", "TL", "BR", "TL"][i % 5] as "TL" | "TR" | "BL" | "BR", i, 1),
    );
  }, []);
  const frontVines = React.useMemo<VineData[]>(() => {
    const rng = seeded(0x7e1a92);
    return Array.from({ length: FRONT_VINE_COUNT }, (_, i) =>
      buildVine(rng, ["BL", "BR", "TL", "TR"][i % 4] as "TL" | "TR" | "BL" | "BR", i, 2),
    );
  }, []);
  const stones = React.useMemo(() => buildStones(0x9c11a4), []);
  const pollen = React.useMemo(() => buildPollen(0x9c11a5), []);
  const lightShafts = React.useMemo(() => buildLightShafts(0x9c11a6), []);

  /* --- Cycle visibility --- */
  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.92;
  if (masterOpacity < 0.01) return null;

  /* --- Audio drives --- */
  const growT = interpolate(cycleFrame, [0, VISIBLE_DURATION * 0.55], [0.05, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const foliageGlow = interpolate(slowEnergy, [0.02, 0.32], [0.55, 1.10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rustle = interpolate(energy, [0.02, 0.30], [0.40, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const swayMag = bass * 22;
  const sparkle = 0.5 + beatDecay * 1.4;
  const tendrilBurst = 1 + onsetEnvelope * 0.7;
  const tempoTime = frame * 0.018 * tempoFactor;

  /* --- Chroma-tinted greens --- */
  const baseHue = 110;
  const tintHue = ((baseHue + (chromaHue - 180) * 0.18) % 360 + 360) % 360;
  const skyHue = (tintHue + 18) % 360;
  const stoneHue = (tintHue + 32) % 360;

  /* --- Helpers for color --- */
  const greenLeaf = (offset: number, sat: number, light: number) =>
    `hsl(${(tintHue + offset + 360) % 360}, ${sat}%, ${light}%)`;
  const stoneFill = (offset: number, sat: number, light: number) =>
    `hsl(${(stoneHue + offset + 360) % 360}, ${sat}%, ${light}%)`;

  /* --- Render vines & their leaves --- */
  const renderVine = (v: VineData, layerIdx: 0 | 1 | 2, key: string) => {
    const swayX = Math.sin(tempoTime * v.swayFreq * 60 + v.swayPhase) * swayMag * (layerIdx === 0 ? 0.4 : layerIdx === 1 ? 0.7 : 1.0);
    const path = buildVinePath(v, width, height, swayX, growT);
    if (!path) return null;
    const layerOp = layerIdx === 0 ? 0.55 : layerIdx === 1 ? 0.78 : 0.95;
    const layerSat = layerIdx === 0 ? 32 : layerIdx === 1 ? 44 : 56;
    const layerLight = layerIdx === 0 ? 18 + foliageGlow * 8 : layerIdx === 1 ? 22 + foliageGlow * 10 : 28 + foliageGlow * 12;

    const stemColor = greenLeaf(v.hueShift - 12, layerSat, layerLight);
    const stemHl = greenLeaf(v.hueShift - 4, layerSat + 14, layerLight + 14);

    // Build leaves along path
    const leafEls: React.ReactNode[] = [];
    v.leaves.forEach((leaf, li) => {
      if (leaf.t > growT) return;
      const p = bezierPoint(v.start, v.controls, v.end, leaf.t);
      const lx = p.x * width + swayX * (1 - Math.abs(leaf.t - 0.5) * 1.2);
      const ly = p.y * height;
      // Tangent angle for leaf orientation
      const tanAng = Math.atan2(p.ty, p.tx) * (180 / Math.PI);
      const sideRot = tanAng + 90 * leaf.side + leaf.rotOffset;
      const rustleSize = leaf.size * (1 + rustle * 0.08) * (layerIdx === 2 ? 1 : layerIdx === 1 ? 0.85 : 0.7);
      const lh = (leaf.hueOffset + v.hueShift);
      const lf = greenLeaf(lh, leaf.sat, leaf.light + foliageGlow * 6);
      const lfDark = greenLeaf(lh - 14, leaf.sat - 4, leaf.light - 8);
      const lfHl = greenLeaf(lh + 8, leaf.sat + 12, Math.min(72, leaf.light + 22 + foliageGlow * 8));

      // Leaf glow path (3-pass)
      leafEls.push(
        <g key={`l-${key}-${li}`}>
          {/* Outer glow */}
          <path d={leafPath(lx, ly, rustleSize * 1.18, sideRot)} fill={lf} opacity={0.10 * foliageGlow} />
          {/* Mid */}
          <path d={leafPath(lx, ly, rustleSize * 1.04, sideRot)} fill={lf} opacity={0.40} />
          {/* Core */}
          <path d={leafPath(lx, ly, rustleSize, sideRot)} fill={lfDark} opacity={0.78} />
          {/* Highlight rim */}
          <path d={leafPath(lx, ly, rustleSize * 0.86, sideRot)} fill={lfHl} opacity={0.32 + foliageGlow * 0.18} />
          {/* Veins (central + 2 side) */}
          {Array.from({ length: leaf.veinCount }).map((_, vi) => {
            const vt = vi / leaf.veinCount;
            const vlen = rustleSize * (0.95 - vt * 0.3);
            const cosR = Math.cos((sideRot * Math.PI) / 180);
            const sinR = Math.sin((sideRot * Math.PI) / 180);
            const ang = (vt - 0.5) * 0.6;
            const vy = -vlen;
            const ex = Math.sin(ang) * vlen;
            const x2 = lx + ex * cosR - vy * sinR;
            const y2 = ly + ex * sinR + vy * cosR;
            return (
              <line
                key={`v-${vi}`}
                x1={lx}
                y1={ly}
                x2={x2}
                y2={y2}
                stroke={lfDark}
                strokeWidth={0.7}
                opacity={0.6}
                strokeLinecap="round"
              />
            );
          })}
          {/* Dewdrop sparkle */}
          {leaf.hasDew && (
            <circle
              cx={lx + Math.sin(sideRot * 0.017) * rustleSize * 0.2}
              cy={ly - rustleSize * 0.4}
              r={1.4 * sparkle * (layerIdx === 2 ? 1 : 0.7)}
              fill="rgba(220, 240, 220, 0.85)"
              opacity={0.5 + sparkle * 0.4}
            />
          )}
        </g>,
      );
    });

    // Branches
    const branchEls: React.ReactNode[] = [];
    v.branches.forEach((br, bi) => {
      if (br.t > growT) return;
      const branchT = Math.min(1, (growT - br.t) / 0.2);
      if (branchT <= 0) return;
      const p = bezierPoint(v.start, v.controls, v.end, br.t);
      const bx = p.x * width + swayX * 0.6;
      const by = p.y * height;
      const ang = Math.atan2(p.ty, p.tx) + br.angle;
      const blen = br.length * Math.min(width, height) * 0.5 * branchT;
      const ex = bx + Math.cos(ang) * blen;
      const ey = by + Math.sin(ang) * blen;
      const cpx = bx + Math.cos(ang) * blen * 0.5 + Math.sin(ang) * blen * 0.2;
      const cpy = by + Math.sin(ang) * blen * 0.5 - Math.cos(ang) * blen * 0.2;
      branchEls.push(
        <path
          key={`br-${bi}`}
          d={`M ${bx.toFixed(1)} ${by.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`}
          stroke={stemColor}
          strokeWidth={v.thickness * br.thickness}
          strokeLinecap="round"
          fill="none"
          opacity={layerOp}
        />,
      );
      // Branch leaves (smaller)
      br.leaves.forEach((leaf, li) => {
        const lt = leaf.t * branchT;
        const lpx = bx + (ex - bx) * lt;
        const lpy = by + (ey - by) * lt;
        const sideRot = (ang * 180) / Math.PI + 90 * leaf.side + leaf.rotOffset;
        const lsize = leaf.size * 0.7 * (1 + rustle * 0.06);
        const lf = greenLeaf(leaf.hueOffset + v.hueShift, leaf.sat, leaf.light + foliageGlow * 4);
        const lfDark = greenLeaf(leaf.hueOffset + v.hueShift - 14, leaf.sat - 4, leaf.light - 6);
        branchEls.push(
          <g key={`brl-${bi}-${li}`}>
            <path d={leafPath(lpx, lpy, lsize * 1.1, sideRot)} fill={lf} opacity={0.30} />
            <path d={leafPath(lpx, lpy, lsize, sideRot)} fill={lfDark} opacity={0.7} />
          </g>,
        );
      });
    });

    // Tendril at the very tip (curling spiral)
    let tendrilEl: React.ReactNode = null;
    if (v.hasTendril && growT > 0.85) {
      const p = bezierPoint(v.start, v.controls, v.end, 0.99);
      const tx = p.x * width + swayX * 0.4;
      const ty = p.y * height;
      const ang = Math.atan2(p.ty, p.tx);
      const spiralPts: string[] = [];
      const turns = v.tendrilSpirals;
      const rmax = 14 * tendrilBurst;
      for (let s = 0; s < 32; s++) {
        const tt = s / 31;
        const a = ang + tt * Math.PI * 2 * turns;
        const r = rmax * tt;
        const px = tx + Math.cos(a) * r;
        const py = ty + Math.sin(a) * r;
        spiralPts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
      }
      tendrilEl = (
        <polyline
          points={spiralPts.join(" ")}
          fill="none"
          stroke={stemColor}
          strokeWidth={v.thickness * 0.6}
          strokeLinecap="round"
          opacity={layerOp * 0.9}
        />
      );
    }

    return (
      <g key={key} opacity={layerOp}>
        {/* Outer glow stem */}
        <path d={path} stroke={stemColor} strokeWidth={v.thickness * 1.7} strokeLinecap="round" fill="none" opacity={0.12 * foliageGlow} />
        {/* Mid stem */}
        <path d={path} stroke={stemColor} strokeWidth={v.thickness * 1.15} strokeLinecap="round" fill="none" opacity={0.46} />
        {/* Core stem */}
        <path d={path} stroke={stemColor} strokeWidth={v.thickness} strokeLinecap="round" fill="none" />
        {/* Stem highlight */}
        <path d={path} stroke={stemHl} strokeWidth={v.thickness * 0.36} strokeLinecap="round" fill="none" opacity={0.55 + foliageGlow * 0.15} />
        {branchEls}
        {tendrilEl}
        {leafEls}
      </g>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="vg-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${skyHue}, 22%, ${10 + foliageGlow * 8}%)`} />
            <stop offset="55%" stopColor={`hsl(${(skyHue + 8) % 360}, 26%, ${16 + foliageGlow * 10}%)`} />
            <stop offset="100%" stopColor={`hsl(${(skyHue + 18) % 360}, 32%, ${22 + foliageGlow * 14}%)`} />
          </linearGradient>
          <radialGradient id="vg-glow" cx="0.5" cy="0.45" r="0.65">
            <stop offset="0%" stopColor={`hsl(${tintHue}, 50%, 56%)`} stopOpacity="0.18" />
            <stop offset="100%" stopColor={`hsl(${tintHue}, 50%, 30%)`} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="vg-stone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stoneFill(0, 18, 38)} />
            <stop offset="100%" stopColor={stoneFill(-6, 14, 22)} />
          </linearGradient>
          <linearGradient id="vg-shaft" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255, 240, 200, 0.42)" />
            <stop offset="100%" stopColor="rgba(255, 220, 160, 0)" />
          </linearGradient>
          <filter id="vg-blur"><feGaussianBlur stdDeviation="3" /></filter>
          <filter id="vg-leaf-blur"><feGaussianBlur stdDeviation="0.6" /></filter>
        </defs>

        {/* 1. Sky / atmosphere */}
        <rect x={0} y={0} width={width} height={height} fill="url(#vg-sky)" />
        <rect x={0} y={0} width={width} height={height} fill="url(#vg-glow)" />

        {/* 2. Stone wall */}
        {stones.map((stone, si) => {
          const cx = stone.cx * width;
          const cy = stone.cy * height;
          const rx = stone.rx * width;
          const ry = stone.ry * height;
          return (
            <g key={`stone-${si}`} transform={`rotate(${stone.rot}, ${cx}, ${cy})`}>
              <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#vg-stone)" opacity={0.78} />
              {/* Mortar shadow */}
              <ellipse cx={cx} cy={cy + 2} rx={rx * 1.04} ry={ry * 1.04} fill="none" stroke="rgba(10,10,12,0.42)" strokeWidth={1.4} />
              {/* Stone surface highlight */}
              <ellipse cx={cx - rx * 0.2} cy={cy - ry * 0.3} rx={rx * 0.3} ry={ry * 0.18} fill={stoneFill(8, 14, 50)} opacity={0.32} />
              {/* Cracks */}
              {Array.from({ length: stone.crackCount }).map((_, ci) => {
                const ang = (ci * 2.1 + stone.rot * 0.1);
                const x2 = cx + Math.cos(ang) * rx * 0.7;
                const y2 = cy + Math.sin(ang) * ry * 0.7;
                const mx = cx + Math.cos(ang + 0.4) * rx * 0.3;
                const my = cy + Math.sin(ang + 0.4) * ry * 0.3;
                return (
                  <path
                    key={`cr-${ci}`}
                    d={`M ${cx.toFixed(1)} ${cy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`}
                    stroke="rgba(8,8,10,0.55)"
                    strokeWidth={0.8}
                    fill="none"
                  />
                );
              })}
              {/* Moss */}
              {stone.hasMoss && (
                <ellipse
                  cx={cx + rx * 0.15}
                  cy={cy + ry * 0.4}
                  rx={rx * 0.55}
                  ry={ry * 0.25}
                  fill={greenLeaf(stone.hueShift - 8, 36, 24)}
                  opacity={0.55}
                />
              )}
            </g>
          );
        })}

        {/* 3. Diagonal light shafts */}
        <g style={{ mixBlendMode: "screen" }}>
          {lightShafts.map((shaft, si) => {
            const tx = shaft.topX * width;
            const bx = shaft.bottomX * width;
            const w0 = shaft.width * width;
            const wave = Math.sin(tempoTime * 0.6 + si) * 6;
            return (
              <polygon
                key={`shaft-${si}`}
                points={`${tx - w0 * 0.3 + wave},0 ${tx + w0 * 0.3 + wave},0 ${bx + w0},${height} ${bx - w0},${height}`}
                fill="url(#vg-shaft)"
                opacity={shaft.intensity * (0.6 + foliageGlow * 0.4)}
              />
            );
          })}
        </g>

        {/* 4. Back vines (blurred) */}
        <g filter="url(#vg-blur)" opacity={0.78}>
          {backVines.map((v, vi) => renderVine(v, 0, `bv${vi}`))}
        </g>

        {/* 5. Mid vines */}
        <g filter="url(#vg-leaf-blur)">
          {midVines.map((v, vi) => renderVine(v, 1, `mv${vi}`))}
        </g>

        {/* 6. Front vines */}
        <g>
          {frontVines.map((v, vi) => renderVine(v, 2, `fv${vi}`))}
        </g>

        {/* 7. Pollen motes drifting in light */}
        <g style={{ mixBlendMode: "screen" }}>
          {pollen.map((m, mi) => {
            const t = frame * m.speed + m.phase;
            const px = m.x * width + Math.sin(t * 1.3) * m.amp;
            const py = m.y * height + Math.cos(t) * m.amp * 0.6 - (frame * m.speed * 12) % height;
            const yw = ((py % height) + height) % height;
            const flicker = 0.5 + Math.sin(t * 2.4) * 0.4;
            return (
              <circle
                key={`pl-${mi}`}
                cx={px}
                cy={yw}
                r={m.size * (0.7 + flicker * 0.5) * sparkle}
                fill={`hsl(${(tintHue + 30) % 360}, 70%, ${78 + flicker * 14}%)`}
                opacity={(0.35 + flicker * 0.4) * (0.5 + foliageGlow * 0.5)}
              />
            );
          })}
        </g>

        {/* 8. Soft warm wash on top */}
        <rect x={0} y={0} width={width} height={height} fill={`hsl(${tintHue}, 30%, 40%)`} opacity={0.04 + foliageGlow * 0.04} style={{ mixBlendMode: "screen" }} />
      </svg>
    </div>
  );
};
