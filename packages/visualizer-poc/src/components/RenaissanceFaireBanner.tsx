/**
 * RenaissanceFaireBanner — Veneta 8/27/72 Sunshine Daydream specific overlay.
 *
 * The Old Renaissance Faire Grounds in Veneta still had its medieval banner
 * infrastructure standing the day the Dead played. This overlay renders 5
 * heraldic banners on wooden poles waving in the Oregon afternoon breeze:
 * stealie (Dead heraldry), rose, sun, lightning bolt, peace sign — rendered
 * in deep medieval pageantry colors (burgundy, gold, royal blue, forest
 * green, sable). The intersection of feudal pageantry and hippie freak
 * culture is uniquely Veneta '72.
 *
 * Audio reactivity:
 *   energy → wave amplitude   slowEnergy → opacity / dust drift
 *   bass   → wind gusts        chromaHue  → subtle banner palette tint
 *   beatDecay → device glow    tempoFactor → wind oscillation speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Banner definitions                                                 */
/* ------------------------------------------------------------------ */

type DeviceKind = "stealie" | "rose" | "sun" | "bolt" | "peace";

interface BannerDef {
  xFrac: number; yFrac: number;
  baseW: number; baseH: number; poleExtra: number;
  field: string; trim: string; deviceColor: string;
  device: DeviceKind; phase: number; freqMul: number; pennant: string;
}

const BANNERS: BannerDef[] = [
  { xFrac: 0.08, yFrac: 0.72, baseW: 150, baseH: 320, poleExtra: 60,
    field: "#1a1014", trim: "#d4a23a", deviceColor: "#f4e4b8",
    device: "stealie", phase: 0.0, freqMul: 1.00, pennant: "#c0392b" },
  { xFrac: 0.27, yFrac: 0.78, baseW: 130, baseH: 280, poleExtra: 55,
    field: "#5b1024", trim: "#e0b94a", deviceColor: "#f0d9a0",
    device: "rose",    phase: 1.7, freqMul: 1.18, pennant: "#2c5e3f" },
  { xFrac: 0.49, yFrac: 0.66, baseW: 170, baseH: 360, poleExtra: 70,
    field: "#1a3a78", trim: "#f1c84a", deviceColor: "#fce8a8",
    device: "sun",     phase: 3.2, freqMul: 0.86, pennant: "#d4a23a" },
  { xFrac: 0.71, yFrac: 0.74, baseW: 140, baseH: 300, poleExtra: 58,
    field: "#1f4a2e", trim: "#e6c060", deviceColor: "#fdf2c8",
    device: "bolt",    phase: 4.8, freqMul: 1.08, pennant: "#702c1c" },
  { xFrac: 0.90, yFrac: 0.76, baseW: 135, baseH: 290, poleExtra: 52,
    field: "#3a1a52", trim: "#d8b34a", deviceColor: "#f5e6c0",
    device: "peace",   phase: 6.1, freqMul: 1.25, pennant: "#1a3a78" },
];

/* ------------------------------------------------------------------ */
/*  Color helpers (HSL hue rotation for chroma tinting)                */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const conv = (t: number): number => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [conv(h + 1 / 3) * 255, conv(h) * 255, conv(h - 1 / 3) * 255];
}
function tintHex(hex: string, hueShift: number, lightenBy = 0): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(h + hueShift, s, Math.min(0.92, l + lightenBy));
  const toHex = (v: number): string => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}

/* ------------------------------------------------------------------ */
/*  Heraldic device renderers                                          */
/* ------------------------------------------------------------------ */

function renderDevice(kind: DeviceKind, cx: number, cy: number, size: number, color: string, glow: number, key: string): React.ReactNode {
  const fid = `dev-glow-${key}`;
  const filterDef = (
    <defs>
      <filter id={fid} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={1.2 + glow * 2.8} result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  );

  if (kind === "stealie") {
    const r = size * 0.55;
    return (
      <g filter={`url(#${fid})`}>{filterDef}
        <ellipse cx={cx} cy={cy - r * 0.15} rx={r} ry={r * 0.95} fill={color} />
        <rect x={cx - r * 0.45} y={cy + r * 0.55} width={r * 0.9} height={r * 0.35} fill={color} rx={r * 0.1} />
        <ellipse cx={cx - r * 0.32} cy={cy - r * 0.05} rx={r * 0.18} ry={r * 0.22} fill="#1a0a14" />
        <ellipse cx={cx + r * 0.32} cy={cy - r * 0.05} rx={r * 0.18} ry={r * 0.22} fill="#1a0a14" />
        <polygon points={`${cx},${cy + r * 0.05} ${cx - r * 0.08},${cy + r * 0.3} ${cx + r * 0.08},${cy + r * 0.3}`} fill="#1a0a14" />
        <polygon
          points={`${cx - r * 0.7},${cy - r * 0.55} ${cx - r * 0.05},${cy - r * 0.18} ${cx - r * 0.18},${cy - r * 0.18} ${cx + r * 0.7},${cy + r * 0.25} ${cx + r * 0.05},${cy - r * 0.18} ${cx + r * 0.18},${cy - r * 0.18}`}
          fill="#c8334a" stroke="#1a0a14" strokeWidth={0.6}
        />
      </g>
    );
  }
  if (kind === "rose") {
    const r = size * 0.55, petals = 5;
    return (
      <g filter={`url(#${fid})`}>{filterDef}
        {Array.from({ length: petals }, (_, i) => {
          const a = (i / petals) * Math.PI * 2 - Math.PI / 2;
          const px = cx + Math.cos(a) * r * 0.45, py = cy + Math.sin(a) * r * 0.45;
          return <ellipse key={`o${i}`} cx={px} cy={py} rx={r * 0.55} ry={r * 0.38}
            fill={color} stroke="#5b1024" strokeWidth={0.8}
            transform={`rotate(${(a * 180) / Math.PI + 90}, ${px}, ${py})`} />;
        })}
        {Array.from({ length: petals }, (_, i) => {
          const a = (i / petals) * Math.PI * 2 + Math.PI / petals - Math.PI / 2;
          const px = cx + Math.cos(a) * r * 0.22, py = cy + Math.sin(a) * r * 0.22;
          return <ellipse key={`i${i}`} cx={px} cy={py} rx={r * 0.32} ry={r * 0.22}
            fill={tintHex(color, 0, -0.05)}
            transform={`rotate(${(a * 180) / Math.PI + 90}, ${px}, ${py})`} />;
        })}
        <circle cx={cx} cy={cy} r={r * 0.16} fill="#7a1a30" />
        <circle cx={cx} cy={cy} r={r * 0.08} fill="#c8334a" />
      </g>
    );
  }
  if (kind === "sun") {
    const r = size * 0.32, rays = 12;
    return (
      <g filter={`url(#${fid})`}>{filterDef}
        {Array.from({ length: rays }, (_, i) => {
          const a = (i / rays) * Math.PI * 2;
          const long = i % 2 === 0;
          const len = long ? r * 1.6 : r * 1.1;
          const half = long ? 0.18 : 0.13;
          return <polygon key={`ray${i}`}
            points={`${cx + Math.cos(a) * r * 0.95},${cy + Math.sin(a) * r * 0.95} ${cx + Math.cos(a + half) * (r + len)},${cy + Math.sin(a + half) * (r + len)} ${cx + Math.cos(a - half) * (r + len)},${cy + Math.sin(a - half) * (r + len)}`}
            fill={color} stroke="#a87a18" strokeWidth={0.5} />;
        })}
        <circle cx={cx} cy={cy} r={r} fill={color} stroke="#a87a18" strokeWidth={1.1} />
        <circle cx={cx - r * 0.35} cy={cy - r * 0.18} r={r * 0.08} fill="#5a3a08" />
        <circle cx={cx + r * 0.35} cy={cy - r * 0.18} r={r * 0.08} fill="#5a3a08" />
        <path d={`M ${cx - r * 0.32} ${cy + r * 0.22} Q ${cx} ${cy + r * 0.5} ${cx + r * 0.32} ${cy + r * 0.22}`}
          fill="none" stroke="#5a3a08" strokeWidth={1.2} strokeLinecap="round" />
      </g>
    );
  }
  if (kind === "bolt") {
    const w = size * 0.55, h = size * 0.85;
    return (
      <g filter={`url(#${fid})`}>{filterDef}
        <polygon
          points={`${cx - w * 0.15},${cy - h * 0.5} ${cx + w * 0.45},${cy - h * 0.5} ${cx + w * 0.05},${cy - h * 0.05} ${cx + w * 0.5},${cy - h * 0.05} ${cx - w * 0.2},${cy + h * 0.5} ${cx + w * 0.1},${cy + h * 0.05} ${cx - w * 0.35},${cy + h * 0.05}`}
          fill={color} stroke="#a87a18" strokeWidth={1.2} strokeLinejoin="round" />
        <polygon
          points={`${cx - w * 0.05},${cy - h * 0.42} ${cx + w * 0.32},${cy - h * 0.42} ${cx},${cy - h * 0.05} ${cx + w * 0.18},${cy - h * 0.05} ${cx - w * 0.05},${cy + h * 0.18}`}
          fill={tintHex(color, 0, 0.1)} opacity={0.7} />
      </g>
    );
  }
  // peace
  const r = size * 0.5;
  return (
    <g filter={`url(#${fid})`}>{filterDef}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={r * 0.15} />
      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={color} strokeWidth={r * 0.15} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx - r * 0.7} y2={cy + r * 0.7} stroke={color} strokeWidth={r * 0.15} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx + r * 0.7} y2={cy + r * 0.7} stroke={color} strokeWidth={r * 0.15} strokeLinecap="round" />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props { frames: EnhancedFrameData[]; }

export const RenaissanceFaireBanner: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  // Subtle ±18° hue rotation around the chroma wheel — keeps the medieval
  // palette readable while letting the song's tonal center color the cloth.
  const hueShift = ((snap.chromaHue ?? 0) - 180) * 0.1;
  // Wind speed locks to song tempo so wave cadence matches playing
  const windSpeed = 0.045 * Math.max(0.6, Math.min(1.6, tempoFactor || 1));
  // Bass-driven gust: occasional bumps in amplitude when bass spikes
  const gust = Math.max(0, snap.bass - 0.32) * 1.6;
  // Wave amplitude in pixels — energy + gust
  const baseAmp = 4 + (snap.energy ?? 0) * 18 + gust * 14;
  // SlowEnergy controls overall opacity breathe
  const opacity = interpolate(snap.slowEnergy ?? 0.05, [0.0, 0.06, 0.22], [0.55, 0.78, 0.92], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  // BeatDecay drives device glow flicker (0..1)
  const glow = (snap.beatDecay ?? 0) * 0.85;
  const sunlight = "rgba(255, 218, 150, 0.08)";

  // Dust mote layer — deterministic positions, drifts on slowEnergy
  const dustMotes = React.useMemo(() => {
    const rng = seeded(827721);
    return Array.from({ length: 70 }, () => ({
      x: rng(), y: rng(), r: 0.6 + rng() * 1.6,
      phase: rng() * Math.PI * 2, speed: 0.4 + rng() * 1.1,
    }));
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", opacity }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <pattern id="rfWoodGrain" x="0" y="0" width="10" height="40" patternUnits="userSpaceOnUse">
            <rect width="10" height="40" fill="#5a3a1c" />
            <line x1="2" y1="0" x2="2" y2="40" stroke="#3a2410" strokeWidth="0.6" />
            <line x1="6" y1="0" x2="6" y2="40" stroke="#4a2e16" strokeWidth="0.4" />
            <line x1="8" y1="0" x2="8" y2="40" stroke="#3a2410" strokeWidth="0.5" />
          </pattern>
          <linearGradient id="rfClothShade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity="0" />
            <stop offset="0.55" stopColor="#000" stopOpacity="0.05" />
            <stop offset="1" stopColor="#000" stopOpacity="0.28" />
          </linearGradient>
          <linearGradient id="rfAfternoonLight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe0a0" stopOpacity="0.18" />
            <stop offset="1" stopColor="#ffb060" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Soft warm afternoon wash behind everything */}
        <rect x="0" y="0" width={width} height={height} fill="url(#rfAfternoonLight)" opacity={0.5} />

        {/* Dust motes drifting through the air */}
        <g opacity={0.5}>
          {dustMotes.map((m, i) => {
            const drift = Math.sin(frame * 0.012 * m.speed + m.phase) * 18 + frame * 0.18 * m.speed;
            const dx = (m.x * width + drift) % width;
            const dy = (m.y * height + Math.cos(frame * 0.009 * m.speed + m.phase) * 8) % height;
            const flick = 0.35 + 0.25 * Math.sin(frame * 0.05 + m.phase);
            return <circle key={`d${i}`} cx={dx} cy={dy} r={m.r} fill="#fff3c8"
              opacity={flick * (0.4 + (snap.slowEnergy ?? 0) * 1.2)} />;
          })}
        </g>

        {/* Banners */}
        {BANNERS.map((b, bi) => {
          const poleX = b.xFrac * width;
          const poleBaseY = b.yFrac * height;
          const bannerW = b.baseW * (width / 1920);
          const bannerH = b.baseH * (height / 1080);
          const poleExtra = b.poleExtra * (height / 1080);
          const bannerTopY = poleBaseY - bannerH;
          const poleTopY = bannerTopY - poleExtra;
          const poleW = 9 * (width / 1920);

          const phase = b.phase + frame * windSpeed * b.freqMul;
          const amp = baseAmp * (0.85 + bi * 0.07);
          const segments = 12;

          // Build cloth path: top edge undulation, side ripple, swallowtail bottom
          const topPts: { x: number; y: number }[] = [];
          const bottomPts: { x: number; y: number }[] = [];
          for (let s = 0; s <= segments; s++) {
            const t = s / segments;
            const x = poleX + t * bannerW;
            // Cloth more free at the trailing right edge (away from pole)
            const lateral = 0.25 + t * 0.95;
            const topWave = Math.sin(phase + t * 4.2) * amp * 0.35 * lateral;
            const sideSag = Math.sin(phase * 0.7 + t * 1.4) * amp * 0.18 * lateral;
            topPts.push({ x, y: bannerTopY + topWave });
            bottomPts.push({ x, y: bannerTopY + bannerH + topWave + sideSag });
          }

          // Swallowtail notch in middle of bottom edge
          const midIdx = Math.floor(segments / 2);
          const swallowDepth = bannerH * 0.18;
          const leftSwallow = bottomPts[midIdx - 1];
          const rightSwallow = bottomPts[midIdx + 1];
          const notchTip = { x: bottomPts[midIdx].x, y: bottomPts[midIdx].y - swallowDepth };

          let pathD = `M ${topPts[0].x},${topPts[0].y}`;
          for (let i = 1; i < topPts.length; i++) pathD += ` L ${topPts[i].x},${topPts[i].y}`;
          pathD += ` L ${bottomPts[bottomPts.length - 1].x},${bottomPts[bottomPts.length - 1].y}`;
          for (let i = bottomPts.length - 2; i > midIdx + 1; i--) pathD += ` L ${bottomPts[i].x},${bottomPts[i].y}`;
          pathD += ` L ${rightSwallow.x},${rightSwallow.y}`;
          pathD += ` Q ${(rightSwallow.x + notchTip.x) / 2},${notchTip.y - 4} ${notchTip.x},${notchTip.y}`;
          pathD += ` Q ${(leftSwallow.x + notchTip.x) / 2},${notchTip.y - 4} ${leftSwallow.x},${leftSwallow.y}`;
          for (let i = midIdx - 2; i >= 0; i--) pathD += ` L ${bottomPts[i].x},${bottomPts[i].y}`;
          pathD += " Z";

          const tField = tintHex(b.field, hueShift, 0);
          const tTrim = tintHex(b.trim, hueShift, 0);
          const tDevice = tintHex(b.deviceColor, hueShift, glow * 0.05);
          const tPennant = tintHex(b.pennant, hueShift, 0);

          // Pennant flag at top of pole
          const pennantW = poleW * 5;
          const pennantH = poleExtra * 0.55;
          const pWave = Math.sin(phase * 1.3) * amp * 0.4;
          const pennantPath = `M ${poleX} ${poleTopY} L ${poleX + pennantW + pWave} ${poleTopY + pennantH * 0.5} L ${poleX} ${poleTopY + pennantH} Z`;

          // Device anchor — center above swallowtail, drifting with cloth
          const deviceCx = poleX + bannerW * 0.5;
          const deviceCy = bannerTopY + bannerH * 0.42 + Math.sin(phase + 1.0) * amp * 0.18;
          const deviceSize = Math.min(bannerW * 0.62, bannerH * 0.36);

          // Heraldic trim border — follows cloth wave loosely
          const trimInset = bannerW * 0.06;
          let trimPath = `M ${topPts[0].x + trimInset},${topPts[0].y + bannerH * 0.05}`;
          for (let i = 1; i < topPts.length - 1; i++) trimPath += ` L ${topPts[i].x},${topPts[i].y + bannerH * 0.05}`;
          trimPath += ` L ${topPts[topPts.length - 1].x - trimInset},${topPts[topPts.length - 1].y + bannerH * 0.05}`;
          const trimBottomY = bannerTopY + bannerH * 0.78;
          trimPath += ` L ${topPts[topPts.length - 1].x - trimInset},${trimBottomY}`;
          for (let i = topPts.length - 2; i >= 1; i--) trimPath += ` L ${topPts[i].x},${trimBottomY + Math.sin(phase + i * 0.6) * amp * 0.08}`;
          trimPath += ` L ${topPts[0].x + trimInset},${trimBottomY} Z`;

          return (
            <g key={`b${bi}`}>
              {/* Pole shadow on the ground */}
              <ellipse cx={poleX} cy={poleBaseY + 6} rx={poleW * 2.4} ry={poleW * 0.7} fill="#000" opacity={0.18} />
              {/* Wooden pole */}
              <rect x={poleX - poleW / 2} y={poleTopY} width={poleW} height={poleBaseY - poleTopY + 8}
                fill="url(#rfWoodGrain)" stroke="#2a1808" strokeWidth={0.6} />
              {/* Pole finial sphere on top */}
              <circle cx={poleX} cy={poleTopY - poleW * 0.6} r={poleW * 1.0} fill="#c9a03c" stroke="#5a3a08" strokeWidth={0.7} />
              <circle cx={poleX - poleW * 0.25} cy={poleTopY - poleW * 0.85} r={poleW * 0.32} fill="#f0d670" opacity={0.9} />
              {/* Triangular pennant flag at very top */}
              <path d={pennantPath} fill={tPennant} stroke="#1a0a08" strokeWidth={0.6} opacity={0.92} />
              {/* Banner cloth body */}
              <path d={pathD} fill={tField} stroke="#1a0a08" strokeWidth={0.8} strokeOpacity={0.6} />
              {/* Cloth shading overlay (darker on flowing edge) */}
              <path d={pathD} fill="url(#rfClothShade)" />
              {/* Warm sunlight wash on banner */}
              <path d={pathD} fill={sunlight} />
              {/* Heraldic trim border */}
              <path d={trimPath} fill="none" stroke={tTrim} strokeWidth={2.6} strokeOpacity={0.85} strokeLinejoin="round" />
              {/* Inner thinner trim line */}
              <path d={trimPath} fill="none" stroke={tintHex(tTrim, 0, 0.12)} strokeWidth={1.0}
                strokeOpacity={0.7} strokeLinejoin="round" transform={`translate(0, ${bannerH * 0.012})`} />
              {/* Decorative star accents at trim corners */}
              {[
                { x: topPts[0].x + trimInset + 6, y: topPts[0].y + bannerH * 0.05 + 6 },
                { x: topPts[topPts.length - 1].x - trimInset - 6, y: topPts[topPts.length - 1].y + bannerH * 0.05 + 6 },
              ].map((pt, ai) => (
                <polygon key={`a${ai}`} transform={`translate(${pt.x}, ${pt.y})`}
                  points="0,-4 1.2,-1.2 4,-1.2 1.6,0.8 2.5,4 0,1.8 -2.5,4 -1.6,0.8 -4,-1.2 -1.2,-1.2"
                  fill={tTrim} opacity={0.85} />
              ))}
              {/* Heraldic device — beat-flickering glow */}
              <g opacity={0.92 + glow * 0.08}>
                {renderDevice(b.device, deviceCx, deviceCy, deviceSize, tDevice, glow, `${bi}`)}
              </g>
              {/* Bottom trim band along swallowtail */}
              <path
                d={`M ${bottomPts[0].x},${bottomPts[0].y - bannerH * 0.04} L ${leftSwallow.x},${leftSwallow.y - bannerH * 0.04} L ${notchTip.x},${notchTip.y - bannerH * 0.04} L ${rightSwallow.x},${rightSwallow.y - bannerH * 0.04} L ${bottomPts[bottomPts.length - 1].x},${bottomPts[bottomPts.length - 1].y - bannerH * 0.04}`}
                fill="none" stroke={tTrim} strokeWidth={1.6} strokeOpacity={0.75} strokeLinejoin="round" />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
