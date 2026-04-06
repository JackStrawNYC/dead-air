/**
 * CommunityCircle — A+++ Deadhead community circle overlay.
 * Layer 6, tier A, tags: dead-culture, festival, community.
 *
 * 12 realistic silhouette figures arranged in a circle, holding hands.
 * Each has unique body shape + accessories (hats, hair, bandanas).
 * Curved neon-glow arcs connect held hands. Energy ripples travel
 * person-to-person on beats. Central mandala orb pulses with the music.
 *
 * Audio: beatDecay→ripple, energy→brightness+tightness, chromaHue→color,
 *        musicalTime→ripple position, slowEnergy→breathe, bass→bob.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ---- Utility ---- */
const hsl = (h: number, s: number, l: number, a: number) =>
  `hsla(${((h % 360) + 360) % 360},${(s * 100) | 0}%,${(l * 100) | 0}%,${a.toFixed(3)})`;
const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/* ---- Types & constants ---- */
type BodyType = "tall" | "medium" | "stocky" | "small" | "broad";
type Accessory = "hat" | "bandana" | "hair_long" | "hair_afro" | "beanie" | "none";
const N = 12; // figure count

interface FigureData {
  bodyType: BodyType; accessory: Accessory; heightScale: number;
  hueOffset: number; swayPhase: number; swayAmp: number;
  bobPhase: number; headTilt: number;
}

interface BodyDims {
  headR: number; neckH: number; shoulderW: number;
  torsoH: number; torsoNarrow: number; armLen: number;
}

const DIMS: Record<BodyType, BodyDims> = {
  tall:   { headR: 3.2, neckH: 2.2, shoulderW: 10, torsoH: 16, torsoNarrow: 0.62, armLen: 14 },
  medium: { headR: 3.5, neckH: 1.8, shoulderW: 11, torsoH: 14, torsoNarrow: 0.70, armLen: 12 },
  stocky: { headR: 3.8, neckH: 1.5, shoulderW: 13, torsoH: 12, torsoNarrow: 0.82, armLen: 11 },
  small:  { headR: 2.8, neckH: 1.6, shoulderW: 9,  torsoH: 11, torsoNarrow: 0.66, armLen: 10 },
  broad:  { headR: 3.6, neckH: 1.6, shoulderW: 14, torsoH: 14, torsoNarrow: 0.75, armLen: 13 },
};

const BODY_TYPES: BodyType[] = ["tall", "medium", "stocky", "small", "broad"];
const ACCS: Accessory[] = ["hat", "bandana", "hair_long", "hair_afro", "beanie", "none", "none", "none", "none", "none"];

/* ---- Deterministic generation ---- */
function generateFigures(seed: number): FigureData[] {
  const rng = seeded(seed);
  const pick = <T,>(a: T[]): T => a[Math.floor(rng() * a.length)];
  return Array.from({ length: N }, () => ({
    bodyType: pick(BODY_TYPES), accessory: pick(ACCS),
    heightScale: 0.85 + rng() * 0.35, hueOffset: (rng() - 0.5) * 80,
    swayPhase: rng() * Math.PI * 2, swayAmp: 0.3 + rng() * 0.6,
    bobPhase: rng() * Math.PI * 2, headTilt: (rng() - 0.5) * 6,
  }));
}

/* ---- SVG path builders ---- */
function bodyPath(d: BodyDims): string {
  const { headR: r, neckH, shoulderW, torsoH: th, torsoNarrow } = d;
  const sw = shoulderW / 2, ww = sw * torsoNarrow, hcy = -(neckH + r), nw = r * 0.42;
  return [
    `M${-ww},${th}`, `C${-ww - .8},${th * .5} ${-sw - 1},3 ${-sw},0`,
    `Q${-sw + 1.5},-1 ${-nw},-.8`, `L${-nw},${-(neckH * .6)}`,
    `Q${-nw - .4},${hcy + r * .3} ${-r * .88},${hcy + r * .12}`,
    `A${r},${r * 1.05} 0 1 1 ${r * .88},${hcy + r * .12}`,
    `Q${nw + .4},${hcy + r * .3} ${nw},${-(neckH * .6)}`, `L${nw},-.8`,
    `Q${sw - 1.5},-1 ${sw},0`, `C${sw + 1},3 ${ww + .8},${th * .5} ${ww},${th}Z`,
  ].join(" ");
}

function hatPath(r: number): string {
  const b = r * 1.5, h = r * .6, w = r * .8;
  return `M${-b},0 L${-b},-1 Q${-b},-2 ${-w},-2 L${-w},${-h} Q0,${-h - 2} ${w},${-h} L${w},-2 Q${b},-2 ${b},-1 L${b},0Z`;
}
function bandanaPath(r: number): string {
  const w = r * .95;
  return `M${-w},.5 Q${-w * .5},-2 0,-2.5 Q${w * .5},-2 ${w},.5 L${w * 1.2},2 L${w * 1.1},3.5 Q${w * .8},2 ${w},.5`;
}
function beaniePath(r: number): string {
  const w = r * .9, h = r * .5;
  return `M${-w},0 Q${-w},${-h * .8} ${-w * .55},${-h} Q0,${-h - 2} ${w * .55},${-h} Q${w},${-h * .8} ${w},0Z`;
}
function longHairPath(r: number): string {
  const w = r * 1.1, d = r * 1.5;
  return `M${-w},${-r * .15} Q${-w - 1},${d * .4} ${-w + 1},${d} L${-w + 3},${d} Q${-r * .4},${d * .5} ${-r * .4},0 M${w},${-r * .15} Q${w + 1},${d * .4} ${w - 1},${d} L${w - 3},${d} Q${r * .4},${d * .5} ${r * .4},0`;
}
function afroPath(r: number): string {
  const R = r * 1.35;
  return `M0,${-r * .1} m${-R},0 a${R},${R * 1.1} 0 1,0 ${R * 2},0 a${R},${R * 1.1} 0 1,0 ${-R * 2},0`;
}

function armPath(sx: number, sy: number, hx: number, hy: number): string {
  return `M${sx},${sy} Q${(sx + hx) * .5},${Math.min(sy, hy) - 3} ${hx},${hy}`;
}

function mandalaPetals(cx: number, cy: number, r: number, n: number): string {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, na = ((i + .5) / n) * Math.PI * 2;
    return `M${cx},${cy} Q${cx + Math.cos(na) * r * .5},${cy + Math.sin(na) * r * .5} ${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
  }).join(" ");
}

/* ---- Component ---- */
interface Props { frames: EnhancedFrameData[] }

export const CommunityCircle: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tf = useTempoFactor();
  const { energy, slowEnergy, beatDecay, chromaHue: hue, bass, musicalTime } = snap;
  const figures = React.useMemo(() => generateFigures(42_420), []);

  // Global params
  const opacity = interpolate(energy, [.02, .35], [.12, .40], clamp);
  const cR = interpolate(energy, [.02, .5], [67, 54], clamp); // circle radius in viewBox
  const rotation = (frame / 30) * 1.8 * tf;
  const breathe = interpolate(slowEnergy, [.02, .3], [.92, 1.08], clamp);
  const ripplePos = (musicalTime * .5) % N;
  const arcBright = interpolate(energy, [.02, .4], [.15, .65], clamp);
  const bobAmp = interpolate(bass, [.02, .25], [.3, 2.5], clamp);
  const orbR = interpolate(energy, [.02, .45], [6, 16], clamp) * (1 + beatDecay * .35);
  const sz = Math.min(width, height) * .34;
  const CX = 100, CY = 100; // viewBox center

  // Precompute positions
  const pos = figures.map((fig, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const d = DIMS[fig.bodyType], s = fig.heightScale;
    const fx = CX + Math.cos(a) * cR, fy = CY + Math.sin(a) * cR;
    const bob = Math.sin(frame * .04 * tf + fig.bobPhase) * bobAmp * s;
    const sway = Math.sin(frame * .02 * tf + fig.swayPhase) * fig.swayAmp * (1 - energy * .5);
    const la = a - (Math.PI / N) * .65, ra = a + (Math.PI / N) * .65;
    const hr = cR + d.armLen * s * .28;
    const lhx = CX + Math.cos(la) * hr, lhy = CY + Math.sin(la) * hr;
    const rhx = CX + Math.cos(ra) * hr, rhy = CY + Math.sin(ra) * hr;
    const ph = (hue + fig.hueOffset + 360) % 360;
    const dist = Math.abs(((i - ripplePos + N) % N));
    const ri = Math.max(0, 1 - Math.min(dist, N - dist) / 1.8) * beatDecay;
    return { fx, fy, a, lhx, lhy, rhx, rhy, bob, sway, d, fig, s, ph, ri };
  });

  // Connection arcs
  const arcs: React.ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const c = pos[i], n = pos[(i + 1) % N];
    const x1 = c.rhx, y1 = c.rhy + c.bob, x2 = n.lhx, y2 = n.lhy + n.bob;
    const ma = ((i + .5) / N) * Math.PI * 2 - Math.PI / 2;
    const bl = cR + 8 + beatDecay * 4;
    const cpx = CX + Math.cos(ma) * bl, cpy = CY + Math.sin(ma) * bl;
    const ri = Math.max(c.ri, n.ri), aa = arcBright + ri * .5;
    const ch = (hue + (c.fig.hueOffset + n.fig.hueOffset) * .5 + 360) % 360;
    const dp = `M${x1} ${y1} Q${cpx} ${cpy} ${x2} ${y2}`;
    arcs.push(
      <path key={`cg${i}`} d={dp} stroke={hsl(ch, .9, .7, aa * .4)} strokeWidth={2.5 + ri * 3}
        fill="none" strokeLinecap="round" style={{ filter: `blur(${1.5 + ri * 2}px)` }} />,
      <path key={`ci${i}`} d={dp} stroke={hsl(ch, .85, .75, aa * .8)} strokeWidth={.8 + ri * 1.2}
        fill="none" strokeLinecap="round" />,
    );
  }

  // Ripple dots (2 pulses 180deg apart)
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < 2; r++) {
    const rp = (ripplePos + r * (N / 2)) % N, rf = rp - Math.floor(rp);
    const ri = Math.floor(rp) % N, rn = (ri + 1) % N;
    const p1 = pos[ri], p2 = pos[rn];
    const da = ((ri + .5 + rf) / N) * Math.PI * 2 - Math.PI / 2;
    const db = cR + 6 + beatDecay * 3;
    const dx = (p1.rhx + (p2.lhx - p1.rhx) * rf) * .4 + (CX + Math.cos(da) * db) * .6;
    const dy = ((p1.rhy + p1.bob) + ((p2.lhy + p2.bob) - (p1.rhy + p1.bob)) * rf) * .4 + (CY + Math.sin(da) * db) * .6;
    const al = beatDecay * .9;
    if (al > .05) {
      dots.push(
        <circle key={`rg${r}`} cx={dx} cy={dy} r={3 + beatDecay * 2.5}
          fill={hsl(hue + r * 60, .95, .8, al * .4)} style={{ filter: `blur(${2 + beatDecay}px)` }} />,
        <circle key={`rc${r}`} cx={dx} cy={dy} r={1.2 + beatDecay}
          fill={hsl(hue + r * 60, .9, .95, al * .9)} />,
      );
    }
  }

  // Central mandala/orb
  const mRot = frame * .3 * tf;
  const mandala = (
    <g key="mandala">
      <circle cx={CX} cy={CY} r={orbR * 1.8} fill={hsl(hue, .7, .5, .08 + beatDecay * .06)}
        style={{ filter: `blur(${4 + beatDecay * 3}px)` }} />
      <circle cx={CX} cy={CY} r={orbR * 1.3} fill={hsl(hue, .85, .6, .12 + beatDecay * .1)}
        style={{ filter: `blur(${2 + beatDecay * 2}px)` }} />
      <circle cx={CX} cy={CY} r={orbR * .7} fill={hsl(hue, .9, .75, .25 + beatDecay * .2)} />
      <g transform={`rotate(${mRot},${CX},${CY})`}>
        <path d={mandalaPetals(CX, CY, orbR * 1.1, 8)} stroke={hsl(hue + 30, .8, .7, .15 + beatDecay * .15)} strokeWidth={.6} fill="none" />
        <path d={mandalaPetals(CX, CY, orbR * .8, 8)} stroke={hsl(hue + 60, .75, .65, .12 + beatDecay * .12)} strokeWidth={.4} fill="none"
          transform={`rotate(22.5,${CX},${CY})`} />
      </g>
      <circle cx={CX} cy={CY} r={orbR * 1.5} fill="none" stroke={hsl(hue + 180, .6, .6, .08 + beatDecay * .08)}
        strokeWidth={.4} strokeDasharray={`${orbR * .3} ${orbR * .15}`}
        transform={`rotate(${-mRot * .7},${CX},${CY})`} />
    </g>
  );

  // Figure silhouettes
  const figs = pos.map((p, i) => {
    const fa = p.a * (180 / Math.PI) + 90;
    const ga = Math.min(1, .2 + energy * .15 + p.ri * .6);
    const gc = hsl(p.ph, .9, .65, ga), fc = hsl(p.ph, .3, .08, .85);
    const gs = 2 + energy * 2 + p.ri * 5;
    const ta = p.a + Math.PI / 2;
    const px = p.fx + Math.cos(ta) * p.sway + Math.cos(p.a) * p.bob * .3;
    const py = p.fy + Math.sin(ta) * p.sway + Math.sin(p.a) * p.bob * .3 + p.bob * .7;
    // Transform hands to local coords
    const cf = Math.cos(-p.a - Math.PI / 2), sf = Math.sin(-p.a - Math.PI / 2);
    const toL = (wx: number, wy: number): [number, number] => {
      const dx = wx - px, dy = wy - py;
      return [(cf * dx - sf * dy) / p.s, (sf * dx + cf * dy) / p.s];
    };
    const [llx, lly] = toL(p.lhx, p.lhy + p.bob);
    const [rlx, rly] = toL(p.rhx, p.rhy + p.bob);
    const hcy = -(p.d.neckH + p.d.headR), htop = hcy - p.d.headR;
    const lsx = -p.d.shoulderW / 2, rsx = p.d.shoulderW / 2;

    return (
      <g key={`f${i}`} transform={`translate(${px.toFixed(1)},${py.toFixed(1)}) rotate(${fa.toFixed(1)}) scale(${p.s.toFixed(3)})`}
        style={{ filter: `drop-shadow(0 0 ${gs.toFixed(1)}px ${gc})` }}>
        <path d={bodyPath(p.d)} fill={fc} stroke={gc} strokeWidth={.5} strokeLinejoin="round" />
        <path d={armPath(lsx, 0, llx, lly)} stroke={gc} strokeWidth={.7} fill="none" strokeLinecap="round" />
        <path d={armPath(rsx, 0, rlx, rly)} stroke={gc} strokeWidth={.7} fill="none" strokeLinecap="round" />
        <circle cx={llx} cy={lly} r={.8} fill={gc} />
        <circle cx={rlx} cy={rly} r={.8} fill={gc} />
        {p.fig.accessory === "hat" && (
          <g transform={`translate(0,${htop + p.d.headR * .35}) rotate(${p.fig.headTilt * .4})`}>
            <path d={hatPath(p.d.headR)} fill={fc} stroke={gc} strokeWidth={.35} /></g>)}
        {p.fig.accessory === "beanie" && (
          <g transform={`translate(0,${htop + p.d.headR * .5})`}>
            <path d={beaniePath(p.d.headR)} fill={fc} stroke={gc} strokeWidth={.35} /></g>)}
        {p.fig.accessory === "bandana" && (
          <g transform={`translate(0,${hcy - p.d.headR * .1})`}>
            <path d={bandanaPath(p.d.headR)} fill="none" stroke={gc} strokeWidth={.4} opacity={.7} /></g>)}
        {p.fig.accessory === "hair_long" && (
          <g transform={`translate(0,${hcy})`}>
            <path d={longHairPath(p.d.headR)} fill="none" stroke={gc} strokeWidth={.5} opacity={.5} /></g>)}
        {p.fig.accessory === "hair_afro" && (
          <g transform={`translate(0,${hcy})`}>
            <path d={afroPath(p.d.headR)} fill={fc} stroke={gc} strokeWidth={.3} /></g>)}
        <ellipse cx={0} cy={p.d.torsoH * .3} rx={p.d.shoulderW * .55} ry={p.d.torsoH * .7 + p.d.headR}
          fill={hsl(p.ph, .8, .6, .04 + p.ri * .08)} style={{ filter: "blur(3px)" }} />
      </g>
    );
  });

  // Radial energy threads from center to each figure
  const threads = pos.map((p, i) => {
    const ta = .04 + energy * .04 + p.ri * .12;
    return ta < .02 ? null : (
      <line key={`t${i}`} x1={CX} y1={CY} x2={p.fx} y2={p.fy + p.bob}
        stroke={hsl(p.ph, .7, .6, ta)} strokeWidth={.3 + p.ri * .5} strokeDasharray="1.5 2.5" />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ transform: `rotate(${rotation}deg) scale(${breathe})`, opacity, willChange: "transform, opacity" }}>
        <svg width={sz} height={sz} viewBox="0 0 200 200" fill="none">
          {threads}
          {mandala}
          {arcs}
          {dots}
          {figs}
        </svg>
      </div>
    </div>
  );
};
