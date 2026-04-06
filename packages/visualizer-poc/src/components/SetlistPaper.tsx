/**
 * SetlistPaper — A+++ handwritten setlist on aged parchment paper.
 * Layer 7, tier A, tags: dead-culture, retro, immersive.
 *
 * Yellowed parchment with torn/ragged bottom edge, dog-eared top-right corner,
 * coffee stain ring (radial gradient), pushpin (chromaHue-tinted head + shaft +
 * cast shadow), faint blue ruled lines, red margin line, handwritten song titles
 * from ShowContext setlist with per-letter Y-wobble + X-jitter, song numbers in
 * margin, set break headers underlined, checkmarks next to played songs
 * (progressing with frame), margin doodles (stealie, peace sign, dancing bear).
 * Audio: paper rustle jitter on beat, energy-driven warm glow, chromaHue tints pin.
 * Opacity 0.10-0.28. Position: offset right, slightly rotated.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

// ─── Layout constants ───

const PL = 12;    // paper left
const PR = 138;   // paper right
const PT = 14;    // paper top
const PB = 200;   // paper bottom
const PW = PR - PL;
const PH = PB - PT;
const ML = PL + 18;  // text margin left (after red line)
const RULE_Y0 = PT + 28;  // first ruled line Y
const RULE_DY = 9.5;      // ruled line spacing
const RULE_N = 17;         // max ruled lines
const EAR = 14;            // dog-ear fold size
const VBW = 155;
const VBH = 218;
const INK = "#1a1a3a";
const DOODLE_INK = "#3a3a5a";
const FONT = "'Georgia','Times New Roman',serif";

// ─── Helpers ───

/** Map 0-1 hue to HSL string */
const hueToHSL = (h: number, s = 70, l = 55) =>
  `hsl(${Math.round(((h % 1) + 1) % 1 * 360)},${s}%,${l}%)`;

/** Generate wavy torn bottom edge via quadratic curves with seeded randomness */
function tornEdge(rng: () => number): string {
  const pts: [number, number][] = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const x = PL + (PW / steps) * i;
    const yOff = (rng() - 0.5) * 5 + Math.sin(i * 0.7) * 2;
    pts.push([x, PB + yOff]);
  }
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const mx = (cx + nx) / 2;
    const my = (cy + ny) / 2;
    d += ` Q ${cx.toFixed(1)},${cy.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${last[0].toFixed(1)},${last[1].toFixed(1)}`;
}

/** Per-character jitter for handwriting feel: X/Y wobble + rotation */
function charJitter(ch: string, bx: number, by: number, rng: () => number, fs: number) {
  const dx = ch === " " ? fs * 0.3 : fs * 0.42 + (rng() - 0.5) * 0.4;
  return {
    x: bx + (rng() - 0.5) * 1.8,
    y: by + (rng() - 0.5) * 1.4,
    rot: (rng() - 0.5) * 4,
    dx,
  };
}

// ─── Margin doodles (mini Dead iconography) ───

type DoodleProps = { cx: number; cy: number; size: number; opacity: number };

/** Mini stealie skull with lightning bolt */
function Stealie({ cx, cy, size: sz, opacity: op }: DoodleProps) {
  const r = sz / 2;
  return (
    <g opacity={op} transform={`translate(${cx},${cy})`}>
      <circle r={r} fill="none" stroke={DOODLE_INK} strokeWidth={0.4} />
      <path
        d={`M${-r * 0.15},${-r * 0.6} L${r * 0.15},${-r * 0.1} L${-r * 0.1},${-r * 0.1} L${r * 0.15},${r * 0.5}`}
        fill="none" stroke={DOODLE_INK} strokeWidth={0.35} strokeLinecap="round"
      />
      <circle cx={-r * 0.3} cy={-r * 0.15} r={r * 0.15} fill={DOODLE_INK} />
      <circle cx={r * 0.3} cy={-r * 0.15} r={r * 0.15} fill={DOODLE_INK} />
    </g>
  );
}

/** Mini peace sign */
function PeaceSign({ cx, cy, size: sz, opacity: op }: DoodleProps) {
  const r = sz / 2;
  return (
    <g opacity={op} transform={`translate(${cx},${cy})`}>
      <circle r={r} fill="none" stroke={DOODLE_INK} strokeWidth={0.4} />
      <line x1={0} y1={-r} x2={0} y2={r} stroke={DOODLE_INK} strokeWidth={0.35} />
      <line x1={0} y1={0} x2={-r * 0.7} y2={r * 0.7} stroke={DOODLE_INK} strokeWidth={0.35} />
      <line x1={0} y1={0} x2={r * 0.7} y2={r * 0.7} stroke={DOODLE_INK} strokeWidth={0.35} />
    </g>
  );
}

/** Mini dancing bear (arms raised) */
function DancingBear({ cx, cy, size: sz, opacity: op }: DoodleProps) {
  const s = sz / 6;
  const sw = 0.35;
  return (
    <g opacity={op} transform={`translate(${cx},${cy})`}>
      {/* Body */}
      <ellipse cy={s * 0.5} rx={s * 1.5} ry={s * 2} fill="none" stroke={DOODLE_INK} strokeWidth={0.4} />
      {/* Head */}
      <circle cy={-s * 2} r={s * 1.1} fill="none" stroke={DOODLE_INK} strokeWidth={0.4} />
      {/* Ears */}
      <circle cx={-s * 0.8} cy={-s * 3} r={s * 0.4} fill="none" stroke={DOODLE_INK} strokeWidth={sw} />
      <circle cx={s * 0.8} cy={-s * 3} r={s * 0.4} fill="none" stroke={DOODLE_INK} strokeWidth={sw} />
      {/* Arms raised (dancing pose) */}
      <path d={`M${-s * 1.5},${-s * 0.2} Q${-s * 2.5},${-s * 2} ${-s * 2},${-s * 2.8}`}
        fill="none" stroke={DOODLE_INK} strokeWidth={sw} strokeLinecap="round" />
      <path d={`M${s * 1.5},${-s * 0.2} Q${s * 2.5},${-s * 2} ${s * 2},${-s * 2.8}`}
        fill="none" stroke={DOODLE_INK} strokeWidth={sw} strokeLinecap="round" />
      {/* Legs */}
      <line x1={-s * 0.6} y1={s * 2.5} x2={-s * 1.2} y2={s * 3.8} stroke={DOODLE_INK} strokeWidth={sw} />
      <line x1={s * 0.6} y1={s * 2.5} x2={s * 1.2} y2={s * 3.8} stroke={DOODLE_INK} strokeWidth={sw} />
    </g>
  );
}

const DOODLE_TYPES = [Stealie, PeaceSign, DancingBear];

// ─── Main Component ───

interface Props {
  frames: EnhancedFrameData[];
}

export const SetlistPaper: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const ctx = useShowContext();

  const { energy, slowEnergy, beatDecay } = snap;
  const chromaHue = snap.chromaHue / 360;
  const showSeed = ctx?.showSeed ?? 42;

  // ─── Build setlist items from ShowContext ───
  const setlistData = useMemo(() => {
    if (!ctx?.setlistSets) return null;
    const rng = seeded(showSeed + 3333);
    const items: { type: "header" | "song"; text: string; idx?: number }[] = [];
    let songCount = 0;
    for (const set of ctx.setlistSets) {
      // Add set header (skip for first set — just start writing songs)
      if (items.length > 0) {
        items.push({ type: "header", text: set.label.toUpperCase() });
      }
      for (const song of set.songs) {
        songCount++;
        items.push({ type: "song", text: song, idx: songCount });
      }
    }
    // Seeded doodle placement slots
    const doodleSlots = [0, 1, 2].map(() => Math.floor(rng() * Math.max(1, items.length)));
    return { items, totalSongs: songCount, doodleSlots };
  }, [ctx, showSeed]);

  // How many songs have been "played" — checkmarks progress through the show
  const totalFrames = frames.length || 1;
  const playedCount = Math.floor((frame / totalFrames) * (setlistData?.totalSongs ?? 0));

  // ─── Audio-reactive transforms ───
  const rustleX = Math.sin(frame * 0.13) * beatDecay * 1.2;
  const rustleY = Math.cos(frame * 0.11) * beatDecay * 0.8;
  const CL = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const opacity = interpolate(energy, [0.02, 0.35], [0.10, 0.28], CL);
  const rotation = 2.5 + Math.sin(frame * 0.05) * beatDecay * 2;
  const breathe = interpolate(slowEnergy, [0.02, 0.2], [0.98, 1.02], CL);
  const glowPx = interpolate(energy, [0.05, 0.4], [0, 8], CL);
  const pinColor = hueToHSL(chromaHue, 65, 45);
  const pinHighlight = hueToHSL(chromaHue, 50, 70);
  const baseSize = Math.min(width, height) * 0.32;

  // ─── Paper geometry (memoized torn edge) ───
  const tornPath = useMemo(() => tornEdge(seeded(showSeed + 9999)), [showSeed]);
  const earX = PR - EAR;
  const earY = PT + EAR;
  const paperBody = `M${PL},${PT} L${earX},${PT} L${PR},${earY} L${PR},${PB} ${tornPath} L${PL},${PB} Z`;
  const dogEar = `M${earX},${PT} L${PR},${earY} L${earX},${earY} Z`;
  const pinX = (PL + PR) / 2;
  const pinY = PT - 1;

  // ─── Build ruled lines ───
  const ruledLines: React.ReactNode[] = [];
  for (let i = 0; i < RULE_N; i++) {
    const y = RULE_Y0 + i * RULE_DY;
    if (y > PB - 10) break;
    ruledLines.push(
      <line key={`r${i}`} x1={PL + 5} y1={y} x2={PR - 5} y2={y}
        stroke="#a8b8d0" strokeWidth={0.25} opacity={0.35} />,
    );
  }

  // ─── Build handwritten text elements ───
  const textEls: React.ReactNode[] = [];
  if (setlistData) {
    const rng = seeded(showSeed + 5555);
    let lineRow = 0;
    const fs = 5.2;
    const hfs = 5.8;

    for (const item of setlistData.items) {
      const y = RULE_Y0 + lineRow * RULE_DY - 1.5;
      if (y > PB - 15) break;

      if (item.type === "header") {
        // Set break header — bold italic, underlined
        let curX = ML + 8;
        for (let c = 0; c < item.text.length; c++) {
          const j = charJitter(item.text[c], curX, y, rng, hfs);
          textEls.push(
            <text key={`h${lineRow}c${c}`} x={j.x} y={j.y} fontSize={hfs}
              fontFamily={FONT} fontWeight="bold" fontStyle="italic" fill={INK}
              transform={`rotate(${j.rot},${j.x},${j.y})`} opacity={0.75}>
              {item.text[c]}
            </text>,
          );
          curX += j.dx;
        }
        // Hand-drawn underline (slightly wavy)
        textEls.push(
          <line key={`hu${lineRow}`} x1={ML + 6} y1={y + 2} x2={curX + 2}
            y2={y + 2 + (rng() - 0.5) * 0.5}
            stroke={INK} strokeWidth={0.4} opacity={0.5} />,
        );
        lineRow += 1.5; // extra vertical space after header
      } else {
        // Song number in left margin
        const numStr = `${item.idx}.`;
        textEls.push(
          <text key={`n${lineRow}`} x={ML - 1 - numStr.length * 2.8}
            y={y + (rng() - 0.5) * 0.6} fontSize={fs * 0.85}
            fontFamily={FONT} fill={INK} textAnchor="end" opacity={0.55}>
            {numStr}
          </text>,
        );

        // Song title — per-letter jitter for handwriting feel
        let curX = ML + 1;
        const display = item.text.length > 22 ? item.text.slice(0, 20) + ".." : item.text;
        for (let c = 0; c < display.length; c++) {
          const j = charJitter(display[c], curX, y, rng, fs);
          textEls.push(
            <text key={`s${lineRow}c${c}`} x={j.x} y={j.y} fontSize={fs}
              fontFamily={FONT} fill={INK}
              transform={`rotate(${j.rot},${j.x},${j.y})`} opacity={0.7}>
              {display[c]}
            </text>,
          );
          curX += j.dx;
        }

        // Checkmark next to played songs (progresses with frame)
        if ((item.idx ?? 0) <= playedCount) {
          const cx = curX + 2, cy = y - 2, cs = 4;
          textEls.push(
            <path key={`ck${lineRow}`}
              d={`M${cx},${cy} L${cx + cs * 0.35},${cy + cs * 0.5} L${cx + cs},${cy - cs * 0.3}`}
              fill="none" stroke="#2a5a2a" strokeWidth={0.6}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />,
          );
        }
        lineRow++;
      }
    }
  }

  // ─── Build margin doodles ───
  const doodleEls: React.ReactNode[] = [];
  if (setlistData) {
    const drng = seeded(showSeed + 1234);
    for (let i = 0; i < 3; i++) {
      const slot = setlistData.doodleSlots[i];
      const dy = Math.min(RULE_Y0 + slot * RULE_DY + drng() * 4, PB - 15);
      const inLeft = drng() > 0.5;
      const dx = inLeft ? PL + 6 + drng() * 3 : PR - 6 - drng() * 3;
      const Doodle = DOODLE_TYPES[i];
      doodleEls.push(
        <Doodle key={`d${i}`} cx={dx} cy={dy}
          size={5 + drng() * 2} opacity={0.25 + drng() * 0.15} />,
      );
    }
  }

  // Coffee stain ring position
  const stainX = PL + PW * 0.65;
  const stainY = PT + PH * 0.7;
  const stainR = 11;

  // ─── Render ───
  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none",
      display: "flex", alignItems: "center", justifyContent: "flex-end",
      paddingRight: width * 0.07,
    }}>
      <div style={{
        transform: `rotate(${rotation}deg) scale(${breathe}) translate(${rustleX}px,${rustleY}px)`,
        transformOrigin: "top center",
        opacity,
        filter: `drop-shadow(3px 5px 8px rgba(0,0,0,.35)) drop-shadow(0 0 ${glowPx}px rgba(255,220,160,.3))`,
        willChange: "transform,opacity,filter",
      }}>
        <svg width={baseSize * 0.62} height={baseSize} viewBox={`0 0 ${VBW} ${VBH}`} fill="none">
          <defs>
            {/* Coffee stain — radial ring gradient */}
            <radialGradient id="stainGrad" cx="50%" cy="50%" r="50%">
              <stop offset="60%" stopColor="#c4a060" stopOpacity={0} />
              <stop offset="75%" stopColor="#b8945a" stopOpacity={0.08} />
              <stop offset="88%" stopColor="#a07840" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#b8945a" stopOpacity={0.05} />
              <stop offset="100%" stopColor="#c4a060" stopOpacity={0} />
            </radialGradient>

            {/* Paper texture — fractal noise multiplied onto parchment */}
            <filter id="paperTex" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4"
                seed={showSeed % 100} result="noise" />
              <feColorMatrix type="saturate" values="0" in="noise" result="gray" />
              <feBlend in="SourceGraphic" in2="gray" mode="multiply" />
            </filter>

            {/* Dog-ear fold gradient (lighter → darker toward interior) */}
            <linearGradient id="earGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d4c4a0" />
              <stop offset="100%" stopColor="#b8a080" />
            </linearGradient>

            {/* Pushpin head — radial metallic with chromaHue tint */}
            <radialGradient id="pinGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor={pinHighlight} />
              <stop offset="60%" stopColor={pinColor} />
              <stop offset="100%" stopColor="#333" />
            </radialGradient>

            {/* Clip path matching paper body (torn edge + dog ear) */}
            <clipPath id="paperClip">
              <path d={paperBody} />
            </clipPath>
          </defs>

          {/* ═══ Paper drop shadow ═══ */}
          <path d={paperBody} fill="#1a1a1a" opacity={0.18} transform="translate(3,4)" />

          {/* ═══ Paper body — yellowed parchment with noise texture ═══ */}
          <path d={paperBody} fill="#f0deb4" stroke="#c4a97d" strokeWidth={0.5}
            filter="url(#paperTex)" />

          {/* ═══ All interior details clipped to paper shape ═══ */}
          <g clipPath="url(#paperClip)">
            {/* Foxing / age spots */}
            <circle cx={PL + 25} cy={PT + 40} r={3} fill="#d4b896" opacity={0.06} />
            <circle cx={PR - 20} cy={PB - 40} r={2} fill="#d4b896" opacity={0.05} />
            <circle cx={PL + 60} cy={PT + 80} r={1.5} fill="#c4a97d" opacity={0.04} />
            <ellipse cx={PL + 45} cy={PB - 60} rx={4} ry={3} fill="#d4b896" opacity={0.04} />
            <circle cx={PR - 35} cy={PT + 55} r={1.8} fill="#c4a97d" opacity={0.03} />

            {/* Coffee stain ring (overlapping circles for organic feel) */}
            <circle cx={stainX} cy={stainY} r={stainR} fill="url(#stainGrad)" />
            <circle cx={stainX} cy={stainY} r={stainR * 0.85}
              fill="none" stroke="#b8945a" strokeWidth={0.6} opacity={0.07} />
            <circle cx={stainX} cy={stainY} r={stainR}
              fill="none" stroke="#a07840" strokeWidth={0.4} opacity={0.09} />
            <circle cx={stainX + 1} cy={stainY - 0.5} r={stainR * 0.78}
              fill="none" stroke="#b8945a" strokeWidth={0.3} opacity={0.05} />

            {/* Horizontal fold crease (paper was folded once) */}
            <line x1={PL + 3} y1={(PT + PB) / 2} x2={PR - 3} y2={(PT + PB) / 2 + 0.5}
              stroke="#c4a97d" strokeWidth={0.3} opacity={0.2} />

            {/* Red margin line (like notebook paper) */}
            <line x1={ML - 3} y1={PT + 5} x2={ML - 3} y2={PB - 5}
              stroke="#c46a6a" strokeWidth={0.3} opacity={0.3} />

            {/* Faint blue ruled lines */}
            {ruledLines}

            {/* Header — show date or fallback "SETLIST" */}
            <text x={(PL + PR) / 2} y={RULE_Y0 - 6} fontSize={6.5}
              fontFamily={FONT} fontWeight="bold" fill={INK}
              textAnchor="middle" opacity={0.7} letterSpacing={0.8}>
              {ctx ? ctx.dateShort : "SETLIST"}
            </text>

            {/* Handwritten song titles with jitter */}
            {textEls}

            {/* Margin doodles — stealie, peace sign, dancing bear */}
            {doodleEls}
          </g>

          {/* ═══ Dog-eared corner (top-right) ═══ */}
          <path d={dogEar} fill="#00000015" transform="translate(1.5,1.5)" />
          <path d={dogEar} fill="url(#earGrad)" stroke="#b8a080" strokeWidth={0.3} />
          <line x1={earX} y1={PT} x2={PR} y2={earY}
            stroke="#e8d8c0" strokeWidth={0.4} opacity={0.5} />

          {/* ═══ Pushpin at top center ═══ */}
          {/* Cast shadow on paper */}
          <ellipse cx={pinX + 2} cy={pinY + 7} rx={4.5} ry={2} fill="#000" opacity={0.1} />
          {/* Metallic shaft */}
          <line x1={pinX} y1={pinY + 1} x2={pinX} y2={pinY + 6}
            stroke="#888" strokeWidth={0.8} />
          {/* Colored head (tinted by chromaHue) */}
          <circle cx={pinX} cy={pinY} r={4.5}
            fill="url(#pinGrad)" stroke="#555" strokeWidth={0.5} />
          {/* Specular highlight */}
          <circle cx={pinX - 1.2} cy={pinY - 1.2} r={1.8} fill="white" opacity={0.35} />
          {/* Secondary glint */}
          <circle cx={pinX + 0.5} cy={pinY + 0.8} r={0.8} fill="white" opacity={0.15} />
        </svg>
      </div>
    </div>
  );
};
