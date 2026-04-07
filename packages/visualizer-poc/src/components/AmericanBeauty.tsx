/**
 * AmericanBeauty — A+++ tribute to the Grateful Dead's American Beauty album cover.
 *
 * Single oversized hero rose centered in the frame, occupying ~50% of the width,
 * against a vintage cream parchment background with a subtle floral pattern,
 * gold leaf borders, and warm sepia vignette. The rose has 5 concentric rings of
 * crimson velvet petals with per-petal radial gradients, dark thorns and
 * leaves, dewdrops, and a subtle pulse on the beat.
 *
 * Audio reactivity:
 *   slowEnergy → bloom warmth + sepia richness
 *   energy     → petal saturation + glow
 *   bass       → rose subtle expansion
 *   beatDecay  → dewdrop sparkle + gentle pulse
 *   onsetEnvelope → background vignette flash
 *   chromaHue  → palette shift between crimson / burgundy / coral
 *   tempoFactor → rose drift sway
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

interface FloralStamp { x: number; y: number; size: number; rot: number; }

function buildFloralStamps(): FloralStamp[] {
  const rng = seeded(19_701_101);
  return Array.from({ length: 38 }, () => ({
    x: rng(),
    y: rng(),
    size: 18 + rng() * 22,
    rot: rng() * 360,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const AmericanBeauty: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const stamps = React.useMemo(buildFloralStamps, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const warmth = interpolate(snap.slowEnergy, [0.0, 0.32], [0.55, 1.10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glow = interpolate(snap.energy, [0.0, 0.30], [0.55, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = 1 + snap.beatDecay * 0.04 + snap.bass * 0.02;
  const sway = Math.sin(frame * 0.012 * tempoFactor) * 4;
  const sparkle = snap.onsetEnvelope > 0.4 ? Math.min(1, (snap.onsetEnvelope - 0.3) * 1.6) : 0;

  // Hue rotation: crimson -> burgundy -> coral
  const baseHue = 350;
  const hueShift = ((snap.chromaHue - 180) * 0.18);
  const roseHue = ((baseHue + hueShift) % 360 + 360) % 360;

  // Rose dimensions
  const cx = width * 0.5 + sway;
  const cy = height * 0.50;
  const roseSize = Math.min(width * 0.45, height * 0.62) * 0.5 * pulse;

  // ─── PETAL BUILDER ──
  // 5 rings of petals: outer huge, middle medium, inner tight, plus bud spiral
  function petalRing(count: number, radius: number, petalLen: number, petalWid: number,
    rot: number, ringHue: number, lightness: number): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rot;
      const px = cx + Math.cos(a) * radius;
      const py = cy + Math.sin(a) * radius;
      const tipX = cx + Math.cos(a) * (radius + petalLen);
      const tipY = cy + Math.sin(a) * (radius + petalLen);
      const wxN = -Math.sin(a) * petalWid;
      const wyN = Math.cos(a) * petalWid;
      // Curl
      const curlX = -Math.sin(a) * petalLen * 0.20;
      const curlY = Math.cos(a) * petalLen * 0.20;

      // Gradient unique per petal
      const gid = `petal-${ringHue.toFixed(0)}-${count}-${i}-${lightness.toFixed(0)}`;
      out.push(
        <g key={gid}>
          <defs>
            <radialGradient id={gid} cx="35%" cy="65%" r="80%">
              <stop offset="0%" stopColor={`hsl(${ringHue}, 75%, ${lightness - 12}%)`} />
              <stop offset="55%" stopColor={`hsl(${ringHue}, 92%, ${lightness}%)`} />
              <stop offset="100%" stopColor={`hsl(${ringHue}, 88%, ${Math.min(85, lightness + 14)}%)`} />
            </radialGradient>
          </defs>
          {/* Petal body */}
          <path d={`M ${px + wxN * 0.4} ${py + wyN * 0.4}
            Q ${px + wxN * 1.2 + curlX * 0.5} ${py + wyN * 1.2 + curlY * 0.5}
              ${tipX + curlX} ${tipY + curlY}
            Q ${px - wxN * 1.2 + curlX * 0.5} ${py - wyN * 1.2 + curlY * 0.5}
              ${px - wxN * 0.4} ${py - wyN * 0.4} Z`}
            fill={`url(#${gid})`}
            stroke={`hsl(${ringHue}, 85%, ${lightness - 22}%)`}
            strokeWidth={1.2}
            opacity={0.92} />
          {/* Vein highlight */}
          <line x1={px} y1={py} x2={tipX + curlX * 0.7} y2={tipY + curlY * 0.7}
            stroke={`hsl(${ringHue}, 60%, ${lightness + 18}%)`}
            strokeWidth={0.8} opacity={0.45} />
        </g>,
      );
    }
    return out;
  }

  // Sepals (green, behind petals)
  const sepals: React.ReactNode[] = [];
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * Math.PI * 2 + 0.4;
    const sx = cx + Math.cos(a) * roseSize * 0.55;
    const sy = cy + Math.sin(a) * roseSize * 0.55;
    const tx = cx + Math.cos(a) * roseSize * 1.20;
    const ty = cy + Math.sin(a) * roseSize * 1.20;
    const px = -Math.sin(a) * roseSize * 0.18;
    const py = Math.cos(a) * roseSize * 0.18;
    sepals.push(
      <path key={`sep-${s}`}
        d={`M ${cx} ${cy} Q ${sx + px} ${sy + py} ${tx} ${ty} Q ${sx - px} ${sy - py} ${cx} ${cy} Z`}
        fill="hsl(125, 45%, 28%)" stroke="hsl(125, 45%, 18%)" strokeWidth={1.4} opacity={0.85} />,
    );
  }

  // Stem & leaves (extending below the rose)
  const stemPath = `M ${cx - 4} ${cy + roseSize * 0.7}
    Q ${cx - 8} ${cy + roseSize * 1.4} ${cx} ${cy + roseSize * 2.0}
    Q ${cx + 8} ${cy + roseSize * 2.6} ${cx - 4} ${cy + roseSize * 3.4}`;

  // ─── FLORAL BACKGROUND STAMPS ──
  const stampNodes = stamps.map((s, i) => {
    const sx = s.x * width;
    const sy = s.y * height;
    return (
      <g key={`stamp-${i}`} transform={`translate(${sx} ${sy}) rotate(${s.rot})`} opacity={0.18 * warmth}>
        {/* Stamp: simple 5-petal rosette outline */}
        {[0, 1, 2, 3, 4].map((p) => {
          const pa = (p / 5) * Math.PI * 2;
          const ex = Math.cos(pa) * s.size;
          const ey = Math.sin(pa) * s.size;
          return (
            <ellipse key={p} cx={ex * 0.5} cy={ey * 0.5}
              rx={s.size * 0.32} ry={s.size * 0.18}
              fill="none" stroke="hsl(28, 45%, 38%)" strokeWidth={0.8}
              transform={`rotate(${(pa * 180) / Math.PI} ${ex * 0.5} ${ey * 0.5})`} />
          );
        })}
        <circle cx={0} cy={0} r={s.size * 0.18} fill="none" stroke="hsl(28, 45%, 38%)" strokeWidth={0.7} />
      </g>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <radialGradient id="ab-bg" cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="hsl(40, 55%, 92%)" />
            <stop offset="50%" stopColor="hsl(36, 45%, 84%)" />
            <stop offset="100%" stopColor="hsl(28, 35%, 56%)" />
          </radialGradient>
          <radialGradient id="ab-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(40, 18, 6, 0.85)" />
          </radialGradient>
          <filter id="ab-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id="ab-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <linearGradient id="ab-stem" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(125, 50%, 32%)" />
            <stop offset="100%" stopColor="hsl(125, 45%, 18%)" />
          </linearGradient>
          <radialGradient id="ab-glow">
            <stop offset="0%" stopColor={`hsla(${roseHue}, 90%, 70%, ${0.4 * glow})`} />
            <stop offset="100%" stopColor={`hsla(${roseHue}, 90%, 50%, 0)`} />
          </radialGradient>
        </defs>

        {/* Cream parchment background */}
        <rect width={width} height={height} fill="url(#ab-bg)" />

        {/* Floral stamps in the background */}
        {stampNodes}

        {/* Vintage gold leaf border */}
        <rect x={width * 0.02} y={height * 0.02}
          width={width * 0.96} height={height * 0.96}
          fill="none" stroke="hsl(38, 65%, 48%)" strokeWidth={4} opacity={0.7} />
        <rect x={width * 0.025} y={height * 0.025}
          width={width * 0.95} height={height * 0.95}
          fill="none" stroke="hsl(38, 75%, 56%)" strokeWidth={1.4} opacity={0.85} />
        <rect x={width * 0.035} y={height * 0.035}
          width={width * 0.93} height={height * 0.93}
          fill="none" stroke="hsl(38, 65%, 38%)" strokeWidth={0.8} opacity={0.55} />

        {/* Gold corner flourishes */}
        {[
          [width * 0.04, height * 0.04, 1, 1],
          [width * 0.96, height * 0.04, -1, 1],
          [width * 0.04, height * 0.96, 1, -1],
          [width * 0.96, height * 0.96, -1, -1],
        ].map(([x, y, fx, fy], i) => (
          <g key={`fl-${i}`} transform={`translate(${x} ${y}) scale(${fx} ${fy})`}>
            <path d="M 0 0 L 60 0 Q 36 6 24 24 Q 12 12 0 60 Z"
              fill="hsl(38, 75%, 50%)" opacity={0.6} />
            <circle cx={32} cy={32} r={8} fill="none" stroke="hsl(38, 75%, 60%)" strokeWidth={1.4} />
            <circle cx={32} cy={32} r={4} fill="hsl(38, 75%, 60%)" />
          </g>
        ))}

        {/* "AMERICAN BEAUTY" banner along the top */}
        <text x={width / 2} y={height * 0.10}
          textAnchor="middle"
          fontFamily="Georgia, serif"
          fontSize={Math.min(width * 0.04, 56)}
          fontWeight="bold"
          letterSpacing="6"
          fill="hsl(28, 65%, 32%)"
          opacity={0.85}>
          AMERICAN BEAUTY
        </text>
        <line x1={width * 0.30} y1={height * 0.115} x2={width * 0.70} y2={height * 0.115}
          stroke="hsl(38, 65%, 42%)" strokeWidth={2} opacity={0.7} />

        {/* Soft glow halo behind the rose */}
        <ellipse cx={cx} cy={cy} rx={roseSize * 1.8} ry={roseSize * 1.8}
          fill="url(#ab-glow)" filter="url(#ab-soft)" />

        {/* Stem (behind rose) */}
        <path d={stemPath} stroke="url(#ab-stem)" strokeWidth={10} fill="none" strokeLinecap="round" />
        {/* Stem highlight */}
        <path d={stemPath} stroke="hsl(125, 60%, 50%)" strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.6} />

        {/* Stem leaves (2 large veined leaves) */}
        {[
          { side: -1, t: 0.30 },
          { side: 1, t: 0.55 },
        ].map((leaf, li) => {
          const lt = leaf.t;
          const ly = cy + roseSize * 0.7 + lt * roseSize * 2.7;
          const lx = cx + (lt < 0.5 ? -8 : 8);
          const lw = roseSize * 0.55;
          const lh = roseSize * 0.22;
          const tipX = lx + leaf.side * lw;
          const tipY = ly - lh * 0.6;
          return (
            <g key={`leaf-${li}`}>
              <path d={`M ${lx} ${ly}
                Q ${lx + leaf.side * lw * 0.5} ${ly - lh * 1.2} ${tipX} ${tipY}
                Q ${lx + leaf.side * lw * 0.5} ${ly + lh * 0.4} ${lx} ${ly} Z`}
                fill="hsl(125, 50%, 32%)" stroke="hsl(125, 50%, 18%)" strokeWidth={1.4} />
              <line x1={lx} y1={ly} x2={tipX} y2={tipY}
                stroke="hsl(125, 60%, 22%)" strokeWidth={1.2} opacity={0.6} />
              {[0.3, 0.5, 0.7].map((vt, vi) => {
                const vx = lx + (tipX - lx) * vt;
                const vy = ly + (tipY - ly) * vt;
                return (
                  <line key={`v-${li}-${vi}`} x1={vx} y1={vy}
                    x2={vx - leaf.side * lw * 0.10} y2={vy + lh * 0.18}
                    stroke="hsl(125, 50%, 22%)" strokeWidth={0.8} opacity={0.5} />
                );
              })}
            </g>
          );
        })}

        {/* Sepals (green pointed leaves behind the rose) */}
        {sepals}

        {/* Outer petal ring (12 large petals) */}
        {petalRing(12, roseSize * 0.55, roseSize * 0.65, roseSize * 0.32, 0.0, roseHue, 38)}

        {/* Mid-outer petal ring (10) */}
        {petalRing(10, roseSize * 0.42, roseSize * 0.55, roseSize * 0.28, Math.PI / 12, roseHue, 42)}

        {/* Mid petal ring (8) */}
        {petalRing(8, roseSize * 0.32, roseSize * 0.45, roseSize * 0.24, Math.PI / 8, roseHue, 46)}

        {/* Inner ring (6) */}
        {petalRing(6, roseSize * 0.20, roseSize * 0.35, roseSize * 0.18, Math.PI / 6, roseHue, 50)}

        {/* Innermost tight ring (5) */}
        {petalRing(5, roseSize * 0.10, roseSize * 0.25, roseSize * 0.14, Math.PI / 5, roseHue, 54)}

        {/* Bud spiral (concentric circles for the heart) */}
        <circle cx={cx} cy={cy} r={roseSize * 0.10}
          fill={`hsl(${roseHue}, 92%, 32%)`} stroke={`hsl(${roseHue}, 95%, 22%)`} strokeWidth={1.6} />
        <circle cx={cx + roseSize * 0.02} cy={cy - roseSize * 0.018} r={roseSize * 0.06}
          fill={`hsl(${roseHue}, 88%, 42%)`} />
        <circle cx={cx + roseSize * 0.012} cy={cy - roseSize * 0.012} r={roseSize * 0.025}
          fill={`hsl(${roseHue}, 80%, 56%)`} />

        {/* Dewdrops on petals */}
        {[
          { ax: -0.30, ay: -0.20, sz: 0.020 },
          { ax: 0.18, ay: -0.32, sz: 0.016 },
          { ax: 0.34, ay: 0.10, sz: 0.018 },
          { ax: -0.10, ay: 0.30, sz: 0.014 },
        ].map((d, di) => {
          const dx = cx + d.ax * roseSize * 1.6;
          const dy = cy + d.ay * roseSize * 1.6;
          const dr = roseSize * d.sz * (1 + snap.beatDecay * 0.4);
          return (
            <g key={`dew-${di}`}>
              <ellipse cx={dx} cy={dy} rx={dr * 1.2} ry={dr * 0.85}
                fill="rgba(255, 255, 255, 0.65)" filter="url(#ab-blur)" />
              <ellipse cx={dx - dr * 0.3} cy={dy - dr * 0.4} rx={dr * 0.4} ry={dr * 0.25}
                fill="rgba(255, 255, 255, 0.95)" />
            </g>
          );
        })}

        {/* "GRATEFUL DEAD" footer */}
        <line x1={width * 0.30} y1={height * 0.93} x2={width * 0.70} y2={height * 0.93}
          stroke="hsl(38, 65%, 42%)" strokeWidth={1.5} opacity={0.7} />
        <text x={width / 2} y={height * 0.96}
          textAnchor="middle"
          fontFamily="Georgia, serif"
          fontSize={Math.min(width * 0.022, 32)}
          fontStyle="italic"
          letterSpacing="4"
          fill="hsl(28, 55%, 30%)"
          opacity={0.8}>
          THE GRATEFUL DEAD
        </text>

        {/* Sparkle on onset */}
        {sparkle > 0.05 && (
          <ellipse cx={cx} cy={cy} rx={roseSize * 1.4} ry={roseSize * 1.4}
            fill={`hsla(${roseHue}, 90%, 80%, ${sparkle * 0.18})`} filter="url(#ab-soft)" />
        )}

        {/* Sepia vignette */}
        <rect width={width} height={height} fill="url(#ab-vig)" />
      </svg>
    </div>
  );
};
