/**
 * TerrapinStation — The turtle approaches the grand temple.
 *
 * A+++ overlay: sea turtle swimming toward a grand classical temple,
 * surrounded by twinkling stars, ethereal mist, and shimmering ocean.
 *
 * Temple: 6 fluted columns with Ionic capitals, triangular pediment with
 * decorative tympanum sun motif, 4 wide steps, ethereal inner glow.
 * Turtle: domed shell with hexagonal scutes + inner detail, head with
 * eyes/beak, scaled neck, 4 flippers with fin ridges.
 * Environment: 12 stars with beat-synced twinkle, ocean waves with shimmer,
 * mist tendrils around temple base.
 *
 * Audio: slowEnergy -> temple glow + mist, beatDecay -> star pulse,
 * energy -> swim speed + breathe, chromaHue -> color tint,
 * bass -> wave amplitude, highs -> star sparkle, mids -> mist drift.
 *
 * Layer 6 Character, Tier A+++.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ── Color Utility ──────────────────────────────────────────────── */

function hueToHex(h: number, s = 0.85, l = 0.6): string {
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
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hueToRgba(h: number, s: number, l: number, a: number): string {
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
  const R = Math.round((r + m) * 255), G = Math.round((g + m) * 255), B = Math.round((b + m) * 255);
  return `rgba(${R},${G},${B},${a.toFixed(3)})`;
}

/* ── Geometry Helpers ────────────────────────────────────────────── */

/** 4-point star path */
function starPath(cx: number, cy: number, r: number): string {
  const ir = r * 0.3;
  let d = "";
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : ir;
    const px = cx + Math.cos(angle) * rad;
    const py = cy + Math.sin(angle) * rad;
    d += (i === 0 ? "M" : "L") + `${px.toFixed(1)} ${py.toFixed(1)} `;
  }
  return d + "Z";
}

/** Hexagonal scute path */
function hexPath(cx: number, cy: number, r: number): string {
  let d = "";
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    d += (i === 0 ? "M" : "L") + `${px.toFixed(1)} ${py.toFixed(1)} `;
  }
  return d + "Z";
}

/** Column fluting lines */
function flutePaths(x: number, y1: number, y2: number, w: number, n: number): string[] {
  const out: string[] = [];
  for (let i = 1; i < n; i++) {
    const fx = x - w / 2 + (w / n) * i;
    out.push(`M${fx.toFixed(1)} ${y1} L${fx.toFixed(1)} ${y2}`);
  }
  return out;
}

/* ── SVG Sub-Component ──────────────────────────────────────────── */

const TerrapinSVG: React.FC<{
  size: number; shellColor: string; bodyColor: string; templeColor: string;
  starColor: string; mistColor: string; waterColor: string; glowColor: string;
  chromaHue: number; frame: number; beatDecay: number; slowEnergy: number;
  bass: number; highs: number; mids: number; tempoFactor: number;
}> = ({ size, shellColor, bodyColor, templeColor, starColor, mistColor,
        waterColor, glowColor, chromaHue, frame, beatDecay, slowEnergy,
        bass, highs, mids, tempoFactor }) => {
  const t = frame * tempoFactor;
  const templeGlow = 0.08 + slowEnergy * 0.25;
  const innerGlow = 0.04 + slowEnergy * 0.15;

  /* 6 fluted columns */
  const cols = [
    { x: 98, w: 5.5 }, { x: 112, w: 5 }, { x: 126, w: 5 },
    { x: 154, w: 5 }, { x: 168, w: 5 }, { x: 182, w: 5.5 },
  ];
  const cT = 54, cB = 90;

  return (
    <svg width={size} height={size} viewBox="0 0 280 320" fill="none">
      <defs>
        <radialGradient id="tGlow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor={glowColor} stopOpacity={templeGlow} />
          <stop offset="60%" stopColor={glowColor} stopOpacity={templeGlow * 0.4} />
          <stop offset="100%" stopColor={glowColor} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="sGrad" cx="45%" cy="35%" r="55%">
          <stop offset="0%" stopColor={shellColor} stopOpacity={0.2} />
          <stop offset="50%" stopColor={shellColor} stopOpacity={0.1} />
          <stop offset="100%" stopColor={shellColor} stopOpacity={0.04} />
        </radialGradient>
        <linearGradient id="wShim" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={waterColor} stopOpacity={0} />
          <stop offset="30%" stopColor={waterColor} stopOpacity={0.3 + bass * 0.2} />
          <stop offset="50%" stopColor={waterColor} stopOpacity={0.15} />
          <stop offset="70%" stopColor={waterColor} stopOpacity={0.3 + bass * 0.2} />
          <stop offset="100%" stopColor={waterColor} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* ═══ STARS (12, beat-synced twinkle) ═══════════════════════ */}
      {[
        { x: 22, y: 18, r: 5, ph: 0 }, { x: 258, y: 14, r: 4.5, ph: 1.2 },
        { x: 55, y: 8, r: 3.5, ph: 2.4 }, { x: 210, y: 6, r: 4, ph: 0.8 },
        { x: 12, y: 50, r: 3.2, ph: 3.1 }, { x: 268, y: 55, r: 3.8, ph: 1.9 },
        { x: 40, y: 78, r: 4.2, ph: 0.5 }, { x: 240, y: 72, r: 3.5, ph: 2.7 },
        { x: 75, y: 30, r: 3, ph: 3.8 }, { x: 195, y: 22, r: 3.8, ph: 0.3 },
        { x: 148, y: 10, r: 2.8, ph: 4.2 }, { x: 8, y: 90, r: 2.5, ph: 1.5 },
      ].map((s, i) => {
        const pulse = beatDecay * (0.5 + (i % 3) * 0.25);
        const drift = Math.sin(t / 30 + s.ph) * 0.5;
        const tw = 0.2 + 0.5 * Math.abs(Math.sin(t / 18 + s.ph + pulse * 4)) + 0.3 * highs;
        return (
          <g key={`s${i}`}>
            <circle cx={s.x} cy={s.y + drift} r={s.r * 2.5} fill={starColor} opacity={tw * 0.12} />
            <path d={starPath(s.x, s.y + drift, s.r * (0.8 + pulse * 0.4))} fill={starColor} opacity={tw * 0.85} />
          </g>
        );
      })}

      {/* ═══ GRAND TEMPLE ═════════════════════════════════════════ */}

      {/* Ethereal glow behind temple */}
      <ellipse cx={140} cy={65} rx={55} ry={45} fill="url(#tGlow)" />

      {/* Pediment (triangular + tympanum) */}
      <path d="M88 50 L140 18 L192 50 Z" stroke={templeColor} strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      <path d="M88 50 L140 18 L192 50 Z" fill={templeColor} opacity={innerGlow} />
      {/* Tympanum sun motif */}
      <circle cx={140} cy={38} r={7} stroke={templeColor} strokeWidth="1.2" fill="none" opacity={0.6} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line key={`ray${i}`}
            x1={140 + Math.cos(rad) * 8} y1={38 + Math.sin(rad) * 8}
            x2={140 + Math.cos(rad) * 12} y2={38 + Math.sin(rad) * 12}
            stroke={templeColor} strokeWidth="0.8" opacity={0.45 + slowEnergy * 0.2} />
        );
      })}
      {/* Finial */}
      <circle cx={140} cy={16} r={3} stroke={templeColor} strokeWidth="1.3"
        fill={templeColor} fillOpacity={0.15 + slowEnergy * 0.1} />

      {/* Entablature (cornice + frieze) */}
      <rect x={85} y={49} width={110} height={3} fill={templeColor} opacity={0.5} rx={0.5} />
      <rect x={88} y={52} width={104} height={2.5} stroke={templeColor} strokeWidth="0.8" fill="none" opacity={0.4} />

      {/* 6 Fluted Columns with Ionic capitals and bases */}
      {cols.map((col, i) => {
        const fl = flutePaths(col.x, cT + 5, cB - 2, col.w, 4);
        return (
          <g key={`col${i}`}>
            {/* Shaft */}
            <rect x={col.x - col.w / 2} y={cT + 4} width={col.w} height={cB - cT - 4}
              stroke={templeColor} strokeWidth="1.5" fill="none" opacity={0.75} />
            <rect x={col.x - col.w / 2} y={cT + 4} width={col.w} height={cB - cT - 4}
              fill={templeColor} opacity={0.06} />
            {/* Fluting */}
            {fl.map((fd, fi) => (
              <path key={`fl${i}-${fi}`} d={fd} stroke={templeColor} strokeWidth="0.4" opacity={0.3} />
            ))}
            {/* Ionic capital with volute scrolls */}
            <rect x={col.x - col.w / 2 - 1.5} y={cT + 1} width={col.w + 3} height={3.5}
              fill={templeColor} opacity={0.5} rx={1} />
            <circle cx={col.x - col.w / 2 - 1} cy={cT + 2.5} r={1.5}
              stroke={templeColor} strokeWidth="0.6" fill="none" opacity={0.4} />
            <circle cx={col.x + col.w / 2 + 1} cy={cT + 2.5} r={1.5}
              stroke={templeColor} strokeWidth="0.6" fill="none" opacity={0.4} />
            {/* Attic base */}
            <rect x={col.x - col.w / 2 - 1} y={cB - 1} width={col.w + 2} height={2.5}
              fill={templeColor} opacity={0.45} rx={0.5} />
            <rect x={col.x - col.w / 2 - 2} y={cB + 1} width={col.w + 4} height={1.5}
              fill={templeColor} opacity={0.35} rx={0.5} />
          </g>
        );
      })}

      {/* 4 wide steps (stylobate) */}
      {[0, 1, 2, 3].map((step) => {
        const sy = 92 + step * 5, sw = 108 + step * 8, sx = 140 - sw / 2;
        return (
          <g key={`step${step}`}>
            <rect x={sx} y={sy} width={sw} height={4.5} stroke={templeColor}
              strokeWidth="1" fill="none" opacity={0.5 - step * 0.06} rx={0.5} />
            <rect x={sx} y={sy} width={sw} height={4.5}
              fill={templeColor} opacity={0.04 + (3 - step) * 0.015} rx={0.5} />
          </g>
        );
      })}

      {/* Temple interior glow between columns */}
      <rect x={100} y={56} width={80} height={34} fill={glowColor} opacity={innerGlow * 0.8} rx={2} />

      {/* ═══ ETHEREAL MIST around temple base ═════════════════════ */}
      {[
        { cx: 80, rx: 35, ry: 8, ph: 0 }, { cx: 140, rx: 45, ry: 10, ph: 1.5 },
        { cx: 200, rx: 35, ry: 8, ph: 3.0 }, { cx: 110, rx: 28, ry: 6, ph: 2.2 },
        { cx: 170, rx: 30, ry: 7, ph: 0.8 },
      ].map((m, i) => {
        const drift = Math.sin(t / 50 + m.ph) * 6 * (0.5 + mids * 0.5);
        const br = 1 + Math.sin(t / 70 + m.ph * 2) * 0.15;
        return (
          <ellipse key={`mist${i}`} cx={m.cx + drift} cy={112}
            rx={m.rx * br} ry={m.ry * br} fill={mistColor} opacity={0.1 + slowEnergy * 0.12} />
        );
      })}

      {/* ═══ TERRAPIN TURTLE ══════════════════════════════════════ */}

      {/* Shell (domed, hex scutes with inner detail) */}
      <ellipse cx={140} cy={195} rx={48} ry={33} stroke={shellColor} strokeWidth="2.8" fill="url(#sGrad)" />
      <ellipse cx={140} cy={192} rx={44} ry={28} stroke={shellColor} strokeWidth="0.6" fill="none" opacity={0.3} />

      {/* Central hex scute */}
      <path d={hexPath(140, 192, 14)} stroke={shellColor} strokeWidth="1.6" fill="none" />
      {/* Radiating inner lines */}
      {[0, 60, 120, 180, 240, 300].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line key={`cl${i}`}
            x1={140 + Math.cos(rad) * 4} y1={192 + Math.sin(rad) * 4}
            x2={140 + Math.cos(rad) * 10} y2={192 + Math.sin(rad) * 10}
            stroke={shellColor} strokeWidth="0.5" opacity={0.35} />
        );
      })}

      {/* 6 surrounding scutes with cross detail */}
      {[
        { cx: 122, cy: 182, r: 11 }, { cx: 158, cy: 182, r: 11 },
        { cx: 114, cy: 198, r: 10 }, { cx: 166, cy: 198, r: 10 },
        { cx: 128, cy: 210, r: 10 }, { cx: 152, cy: 210, r: 10 },
      ].map((s, i) => (
        <g key={`sc${i}`}>
          <path d={hexPath(s.cx, s.cy, s.r)} stroke={shellColor} strokeWidth="1.1" fill="none" opacity={0.65} />
          <line x1={s.cx - 4} y1={s.cy} x2={s.cx + 4} y2={s.cy} stroke={shellColor} strokeWidth="0.4" opacity={0.25} />
          <line x1={s.cx} y1={s.cy - 4} x2={s.cx} y2={s.cy + 4} stroke={shellColor} strokeWidth="0.4" opacity={0.25} />
        </g>
      ))}

      {/* Marginal scutes (shell edge) */}
      {[
        "M92 192 L102 186", "M92 200 L104 202", "M96 184 L108 178",
        "M188 192 L178 186", "M188 200 L176 202", "M184 184 L172 178",
        "M115 222 L125 216", "M165 222 L155 216", "M138 226 L140 220",
      ].map((d, i) => (
        <path key={`ms${i}`} d={d} stroke={shellColor} strokeWidth="0.9" opacity={0.4} />
      ))}

      {/* Head + scaled neck */}
      <path d="M132 168 C130 158 131 148 134 140 L146 140 C149 148 150 158 148 168"
        stroke={bodyColor} strokeWidth="2" fill="none" />
      <path d="M132 168 C130 158 131 148 134 140 L146 140 C149 148 150 158 148 168"
        fill={bodyColor} opacity={0.06} />
      {/* Neck scale lines */}
      {[145, 150, 155, 160, 165].map((ny, i) => (
        <path key={`ns${i}`}
          d={`M${133 + (168 - ny) * 0.1} ${ny} Q140 ${ny - 2} ${147 - (168 - ny) * 0.1} ${ny}`}
          stroke={bodyColor} strokeWidth="0.5" opacity={0.3} />
      ))}

      {/* Head shape */}
      <ellipse cx={140} cy={135} rx={11} ry={8.5} stroke={bodyColor} strokeWidth="2.2" fill="none" />
      <ellipse cx={140} cy={135} rx={11} ry={8.5} fill={bodyColor} opacity={0.08} />

      {/* Left eye */}
      <ellipse cx={136} cy={132.5} rx={2.5} ry={2} fill={bodyColor} opacity={0.55} />
      <circle cx={136.5} cy={132} r={1} fill={bodyColor} opacity={0.8} />
      <circle cx={135.5} cy={131.5} r={0.5} fill="white" opacity={0.4} />
      {/* Right eye */}
      <ellipse cx={144} cy={132.5} rx={2.5} ry={2} fill={bodyColor} opacity={0.55} />
      <circle cx={143.5} cy={132} r={1} fill={bodyColor} opacity={0.8} />
      <circle cx={144.5} cy={131.5} r={0.5} fill="white" opacity={0.4} />

      {/* Beak */}
      <path d="M136 139 Q138 142.5 140 143 Q142 142.5 144 139"
        stroke={bodyColor} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M140 143 L140.5 144.5" stroke={bodyColor} strokeWidth="0.8" opacity={0.5} />

      {/* Front left flipper + fin ridges */}
      <path d="M94 188 C78 176 60 172 52 180 C46 188 56 196 72 192 L90 192"
        stroke={bodyColor} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M94 188 C78 176 60 172 52 180 C46 188 56 196 72 192 L90 192"
        fill={bodyColor} opacity={0.04} />
      <path d="M70 180 L62 176" stroke={bodyColor} strokeWidth="0.8" opacity={0.4} />
      <path d="M66 184 L57 182" stroke={bodyColor} strokeWidth="0.8" opacity={0.35} />
      <path d="M63 188 L54 188" stroke={bodyColor} strokeWidth="0.7" opacity={0.3} />
      <path d="M52 180 L46 175 M52 180 L48 183" stroke={bodyColor} strokeWidth="1" opacity={0.5} />

      {/* Front right flipper + fin ridges */}
      <path d="M186 188 C202 176 220 172 228 180 C234 188 224 196 208 192 L190 192"
        stroke={bodyColor} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M186 188 C202 176 220 172 228 180 C234 188 224 196 208 192 L190 192"
        fill={bodyColor} opacity={0.04} />
      <path d="M210 180 L218 176" stroke={bodyColor} strokeWidth="0.8" opacity={0.4} />
      <path d="M214 184 L223 182" stroke={bodyColor} strokeWidth="0.8" opacity={0.35} />
      <path d="M217 188 L226 188" stroke={bodyColor} strokeWidth="0.7" opacity={0.3} />
      <path d="M228 180 L234 175 M228 180 L232 183" stroke={bodyColor} strokeWidth="1" opacity={0.5} />

      {/* Rear left flipper */}
      <path d="M100 218 C88 228 78 234 74 228 C70 222 78 216 90 215"
        stroke={bodyColor} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M78 226 L72 230 M78 226 L74 222" stroke={bodyColor} strokeWidth="0.7" opacity={0.4} />

      {/* Rear right flipper */}
      <path d="M180 218 C192 228 202 234 206 228 C210 222 202 216 190 215"
        stroke={bodyColor} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M202 226 L208 230 M202 226 L206 222" stroke={bodyColor} strokeWidth="0.7" opacity={0.4} />

      {/* Tail */}
      <path d="M140 226 Q141 236 139 242 Q137 240 138 236"
        stroke={bodyColor} strokeWidth="1.3" fill="none" strokeLinecap="round" />

      {/* ═══ OCEAN / WATER ════════════════════════════════════════ */}
      {[
        { y: 268, amp: 4, freq: 0.04, ph: 0, sw: 1.2, op: 0.3 },
        { y: 278, amp: 3.5, freq: 0.035, ph: 1.5, sw: 1, op: 0.25 },
        { y: 288, amp: 3, freq: 0.045, ph: 3.0, sw: 0.8, op: 0.2 },
        { y: 296, amp: 2.5, freq: 0.03, ph: 2.2, sw: 0.7, op: 0.15 },
      ].map((w, i) => {
        const bAmp = w.amp * (1 + bass * 1.5);
        let d = `M10 ${w.y}`;
        for (let x = 10; x <= 270; x += 5) {
          const wy = w.y + Math.sin(x * w.freq + t / 25 + w.ph) * bAmp
            + Math.sin(x * w.freq * 2.3 + t / 18 + w.ph) * bAmp * 0.3;
          d += ` L${x} ${wy.toFixed(1)}`;
        }
        return <path key={`wv${i}`} d={d} stroke={waterColor} strokeWidth={w.sw} fill="none" opacity={w.op} />;
      })}

      {/* Water shimmer highlights */}
      {[
        { x: 60, y: 272, w: 20 }, { x: 130, y: 275, w: 25 }, { x: 200, y: 270, w: 18 },
        { x: 95, y: 284, w: 15 }, { x: 170, y: 282, w: 22 },
      ].map((sh, i) => {
        const shim = 0.08 + 0.12 * Math.abs(Math.sin(t / 22 + i * 1.7));
        return (
          <line key={`sh${i}`}
            x1={sh.x} y1={sh.y + Math.sin(t / 30 + i) * 2}
            x2={sh.x + sh.w} y2={sh.y + Math.sin(t / 30 + i + 1) * 2}
            stroke={starColor} strokeWidth="0.6" opacity={shim} strokeLinecap="round" />
        );
      })}

      {/* Water surface gradient */}
      <rect x={10} y={264} width={260} height={40} fill="url(#wShim)" opacity={0.08} />
    </svg>
  );
};

/* ── Main Component ─────────────────────────────────────────────── */

interface Props {
  frames: EnhancedFrameData[];
}

export const TerrapinStation: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const bass = snap.bass;
  const mids = snap.mids;
  const highs = snap.highs;
  const beatDecay = snap.beatDecay;

  const baseSize = Math.min(width, height) * 0.45;
  const breathe = interpolate(energy, [0.03, 0.35], [0.92, 1.08], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  /* Gentle swimming motion */
  const bobY = Math.sin((frame / 45) * tempoFactor) * 7;
  const bobX = Math.cos((frame / 65) * tempoFactor) * 3.5;
  const tilt = Math.sin((frame / 60) * tempoFactor) * 1.2;
  /* Slow vertical drift — approaching the temple */
  const approach = Math.sin((frame / 200) * tempoFactor) * 3 - energy * 2;

  const opacity = interpolate(energy, [0.02, 0.35], [0.28, 0.68], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  /* Colors — chromaHue tints everything */
  const shellColor = hueToHex((chromaHue + 0.08) % 1, 0.6, 0.52);
  const bodyColor = hueToHex((chromaHue + 0.04) % 1, 0.5, 0.48);
  const templeColor = hueToHex((chromaHue + 0.18) % 1, 0.45, 0.68);
  const starColor = hueToHex((chromaHue + 0.5) % 1, 0.65, 0.78);
  const mistColor = hueToRgba((chromaHue + 0.2) % 1, 0.3, 0.75, 0.15 + slowEnergy * 0.1);
  const waterColor = hueToHex((chromaHue + 0.55) % 1, 0.5, 0.6);
  const glowColor = hueToHex((chromaHue + 0.15) % 1, 0.6, 0.75);

  /* Glow driven by slowEnergy + bass */
  const bassGlow = 0.6 + bass * 0.9;
  const glowRadius = interpolate(slowEnergy, [0.05, 0.3], [5, 28], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  }) * bassGlow;

  const onsetScale = 1 + snap.onsetEnvelope * 0.025;
  const size = baseSize * breathe;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        transform: `translate(${bobX}px, ${bobY + approach}px) rotate(${tilt}deg) scale(${breathe * onsetScale})`,
        opacity,
        filter: `drop-shadow(0 0 ${glowRadius}px ${templeColor}) drop-shadow(0 0 ${glowRadius * 0.6}px ${shellColor}) drop-shadow(0 0 ${glowRadius * 1.6}px ${glowColor})`,
        willChange: "transform, opacity, filter",
      }}>
        <TerrapinSVG
          size={size} shellColor={shellColor} bodyColor={bodyColor}
          templeColor={templeColor} starColor={starColor} mistColor={mistColor}
          waterColor={waterColor} glowColor={glowColor} chromaHue={chromaHue}
          frame={frame} beatDecay={beatDecay} slowEnergy={slowEnergy}
          bass={bass} highs={highs} mids={mids} tempoFactor={tempoFactor}
        />
      </div>
    </div>
  );
};
