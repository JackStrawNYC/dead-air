/**
 * CassetteReels — A+++ vintage cassette tape close-up.
 *
 * A massive cassette tape ~50% of frame, photo-realistic SVG: clear plastic
 * shell, two reels with brown tape spooling between them, hand-written label
 * area pulled from ShowContext (band initials + date + venue) in blue ink,
 * square clear window, brand logo, screw holes, copyright text. Spinning
 * reels reveal the tape moving.
 * Background: warm wood-paneled stereo cabinet with vintage knobs visible
 * to either side, soft amber light from a tube amp.
 *
 * Audio reactivity:
 *   slowEnergy   → cabinet warm light
 *   energy       → reel spin speed
 *   bass         → tape vibration
 *   beatDecay    → label highlight pulse
 *   onsetEnvelope→ tube amp bloom
 *   chromaHue    → warmth tint
 *   tempoFactor  → reel rotation rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { useShowContext } from "../data/ShowContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

interface DustMote {
  bx: number;
  by: number;
  r: number;
  speed: number;
  phase: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CassetteReels: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);
  const showCtx = useShowContext();
  const showVenueShort = (showCtx?.venueShort ?? "Concert").toUpperCase();
  const showDateShort = showCtx?.dateShort ?? "";
  const showBand = showCtx?.bandName ?? "Grateful Dead";
  const bandInitials = showBand
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();

  const dust = React.useMemo<DustMote[]>(() => {
    const rng = seeded(72_558_887);
    return Array.from({ length: 50 }, () => ({
      bx: rng(),
      by: rng(),
      r: 0.4 + rng() * 1.4,
      speed: 0.001 + rng() * 0.003,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const energy = snap.energy;
  const bass = snap.bass;
  const slowEnergy = snap.slowEnergy;
  const beatDecay = snap.beatDecay;
  const onsetEnv = snap.onsetEnvelope;
  const chromaHue = snap.chromaHue;

  const cabinetWarm = 0.5 + slowEnergy * 0.4;
  const reelSpeed = (3 + energy * 12) * tempoFactor;
  const tapeWobble = Math.sin(frame * 0.4) * bass * 0.6;
  const labelPulse = 1 + beatDecay * 0.15;
  const ampBloom = 0.4 + onsetEnv * 0.6;

  const baseHue = 36;
  const tintHue = ((baseHue + (chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const tintCore = `hsl(${tintHue}, 95%, 80%)`;
  const tintColor = `hsl(${tintHue}, 80%, 60%)`;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const cassetteW = width * 0.50;
  const cassetteH = cassetteW * 0.62;
  const cassetteX = cx - cassetteW / 2;
  const cassetteY = cy - cassetteH / 2 + tapeWobble;

  /* Reel positions (within the cassette) */
  const reelLcx = cassetteX + cassetteW * 0.30;
  const reelRcx = cassetteX + cassetteW * 0.70;
  const reelCy = cassetteY + cassetteH * 0.42;
  const reelR = cassetteW * 0.13;
  const reelRot = (frame * reelSpeed) % 360;

  const dustNodes = dust.map((d, i) => {
    const t = frame * d.speed + d.phase;
    const px = ((d.bx + Math.sin(t) * 0.02) * width);
    const py = (d.by * height) + Math.cos(t * 1.3) * 4;
    const op = 0.18 + Math.sin(t * 2 + i) * 0.08;
    return (
      <circle
        key={`d-${i}`}
        cx={px}
        cy={py}
        r={d.r}
        fill={`hsla(${tintHue}, 60%, 75%, ${op * cabinetWarm})`}
      />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="cr-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a0f08" />
            <stop offset="50%" stopColor="#2a1808" />
            <stop offset="100%" stopColor="#0e0804" />
          </linearGradient>
          <linearGradient id="cr-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a3818" />
            <stop offset="50%" stopColor="#7a4e22" />
            <stop offset="100%" stopColor="#3a200d" />
          </linearGradient>
          <linearGradient id="cr-shell" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="50%" stopColor="#2a2a2a" />
            <stop offset="100%" stopColor="#0e0e0e" />
          </linearGradient>
          <linearGradient id="cr-clear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a3a3a" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#1a1a1a" stopOpacity={0.85} />
          </linearGradient>
          <linearGradient id="cr-tape" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a3a18" />
            <stop offset="50%" stopColor="#7a4e22" />
            <stop offset="100%" stopColor="#3a200d" />
          </linearGradient>
          <linearGradient id="cr-label" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F8F2E8" />
            <stop offset="50%" stopColor="#F0E8D4" />
            <stop offset="100%" stopColor="#D8CFB8" />
          </linearGradient>
          <radialGradient id="cr-ampglow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`hsla(${tintHue + 6}, 95%, 75%, ${0.85 * ampBloom})`} />
            <stop offset="60%" stopColor={`hsla(${tintHue}, 80%, 55%, ${0.4 * ampBloom})`} />
            <stop offset="100%" stopColor={`hsla(${tintHue}, 70%, 40%, 0)`} />
          </radialGradient>
          <filter id="cr-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* DARK BACKGROUND */}
        <rect width={width} height={height} fill="url(#cr-bg)" />

        {/* WOOD-PANELED STEREO CABINET */}
        <rect x={0} y={height * 0.16} width={width} height={height * 0.84} fill="url(#cr-wood)" />
        {/* Wood grain horizontal lines */}
        {Array.from({ length: 22 }, (_, i) => (
          <line
            key={`wg-${i}`}
            x1={0}
            y1={height * 0.16 + i * (height * 0.84 / 22)}
            x2={width}
            y2={height * 0.16 + i * (height * 0.84 / 22) + (i % 2 === 0 ? 1 : -1)}
            stroke="rgba(20, 12, 4, 0.45)"
            strokeWidth={0.6}
          />
        ))}
        {/* Wood grain vertical streaks */}
        {Array.from({ length: 28 }, (_, i) => (
          <line
            key={`wgv-${i}`}
            x1={(i / 27) * width}
            y1={height * 0.16}
            x2={(i / 27) * width + Math.sin(i) * 4}
            y2={height}
            stroke="rgba(20, 12, 4, 0.20)"
            strokeWidth={0.4}
          />
        ))}

        {/* TUBE AMP GLOW (left and right of cassette) */}
        <ellipse cx={width * 0.10} cy={height * 0.55} rx={width * 0.08} ry={height * 0.18} fill="url(#cr-ampglow)" filter="url(#cr-blur)" />
        <ellipse cx={width * 0.90} cy={height * 0.55} rx={width * 0.08} ry={height * 0.18} fill="url(#cr-ampglow)" filter="url(#cr-blur)" />

        {/* AMP CABINET FRONT (left) — knobs and meter */}
        <g>
          <rect x={width * 0.04} y={height * 0.40} width={width * 0.08} height={height * 0.30} rx={4} fill="rgba(20, 12, 8, 0.95)" stroke="rgba(80, 50, 20, 0.85)" strokeWidth={1.4} />
          {/* VU meter on amp */}
          <rect x={width * 0.05} y={height * 0.42} width={width * 0.06} height={height * 0.06} fill="rgba(15, 20, 30, 0.95)" stroke="rgba(120, 120, 110, 0.85)" strokeWidth={0.6} />
          <line x1={width * 0.08} y1={height * 0.48} x2={width * 0.08 + Math.cos(-Math.PI / 2 + energy * 1.3 - 0.65) * 14} y2={height * 0.48 + Math.sin(-Math.PI / 2 + energy * 1.3 - 0.65) * 14} stroke={tintCore} strokeWidth={0.8} />
          {/* Knobs */}
          {[0.52, 0.58, 0.64].map((ky, k) => (
            <g key={`kn-${k}`}>
              <circle cx={width * 0.065} cy={height * ky} r={6} fill="rgba(60, 40, 16, 0.95)" stroke="rgba(20, 12, 4, 0.95)" strokeWidth={0.8} />
              <line
                x1={width * 0.065}
                y1={height * ky}
                x2={width * 0.065 + Math.cos(-Math.PI / 2 + (k + 1) * 0.5) * 5}
                y2={height * ky + Math.sin(-Math.PI / 2 + (k + 1) * 0.5) * 5}
                stroke="rgba(220, 200, 160, 0.85)"
                strokeWidth={1}
              />
              <circle cx={width * 0.095} cy={height * ky} r={6} fill="rgba(60, 40, 16, 0.95)" stroke="rgba(20, 12, 4, 0.95)" strokeWidth={0.8} />
              <line
                x1={width * 0.095}
                y1={height * ky}
                x2={width * 0.095 + Math.cos(-Math.PI / 2 - 0.4 + k * 0.3) * 5}
                y2={height * ky + Math.sin(-Math.PI / 2 - 0.4 + k * 0.3) * 5}
                stroke="rgba(220, 200, 160, 0.85)"
                strokeWidth={1}
              />
            </g>
          ))}
          {/* Tube glow at bottom */}
          <circle cx={width * 0.08} cy={height * 0.685} r={4} fill={`hsla(${tintHue + 6}, 95%, 80%, ${ampBloom})`} />
        </g>

        {/* AMP CABINET FRONT (right) — same */}
        <g>
          <rect x={width * 0.88} y={height * 0.40} width={width * 0.08} height={height * 0.30} rx={4} fill="rgba(20, 12, 8, 0.95)" stroke="rgba(80, 50, 20, 0.85)" strokeWidth={1.4} />
          <rect x={width * 0.89} y={height * 0.42} width={width * 0.06} height={height * 0.06} fill="rgba(15, 20, 30, 0.95)" stroke="rgba(120, 120, 110, 0.85)" strokeWidth={0.6} />
          <line x1={width * 0.92} y1={height * 0.48} x2={width * 0.92 + Math.cos(-Math.PI / 2 + energy * 1.3 - 0.65) * 14} y2={height * 0.48 + Math.sin(-Math.PI / 2 + energy * 1.3 - 0.65) * 14} stroke={tintCore} strokeWidth={0.8} />
          {[0.52, 0.58, 0.64].map((ky, k) => (
            <g key={`knr-${k}`}>
              <circle cx={width * 0.905} cy={height * ky} r={6} fill="rgba(60, 40, 16, 0.95)" stroke="rgba(20, 12, 4, 0.95)" strokeWidth={0.8} />
              <line
                x1={width * 0.905}
                y1={height * ky}
                x2={width * 0.905 + Math.cos(-Math.PI / 2 + (k + 1) * 0.5) * 5}
                y2={height * ky + Math.sin(-Math.PI / 2 + (k + 1) * 0.5) * 5}
                stroke="rgba(220, 200, 160, 0.85)"
                strokeWidth={1}
              />
              <circle cx={width * 0.935} cy={height * ky} r={6} fill="rgba(60, 40, 16, 0.95)" stroke="rgba(20, 12, 4, 0.95)" strokeWidth={0.8} />
            </g>
          ))}
          <circle cx={width * 0.92} cy={height * 0.685} r={4} fill={`hsla(${tintHue + 6}, 95%, 80%, ${ampBloom})`} />
        </g>

        {/* DUST FLOATING in warm light */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* === CASSETTE === */}
        <g transform={`translate(0, ${tapeWobble})`}>
          {/* Cassette shadow */}
          <rect x={cassetteX + 8} y={cassetteY + 8} width={cassetteW} height={cassetteH} rx={4} fill="rgba(0, 0, 0, 0.55)" filter="url(#cr-blur)" />

          {/* Cassette shell base */}
          <rect x={cassetteX} y={cassetteY} width={cassetteW} height={cassetteH} rx={4} fill="url(#cr-shell)" stroke="rgba(0, 0, 0, 0.95)" strokeWidth={2.5} />

          {/* Top edge highlight */}
          <rect x={cassetteX + 2} y={cassetteY + 2} width={cassetteW - 4} height={3} rx={1.5} fill="rgba(80, 80, 76, 0.85)" />

          {/* === LABEL AREA (top half) === */}
          <rect
            x={cassetteX + cassetteW * 0.04}
            y={cassetteY + cassetteH * 0.05}
            width={cassetteW * 0.92}
            height={cassetteH * 0.33}
            rx={1.5}
            fill="url(#cr-label)"
            stroke="rgba(80, 60, 30, 0.85)"
            strokeWidth={1.2}
          />
          {/* Label rule lines (where you write) */}
          {Array.from({ length: 4 }, (_, i) => (
            <line
              key={`ll-${i}`}
              x1={cassetteX + cassetteW * 0.06}
              y1={cassetteY + cassetteH * 0.10 + i * (cassetteH * 0.06)}
              x2={cassetteX + cassetteW * 0.94}
              y2={cassetteY + cassetteH * 0.10 + i * (cassetteH * 0.06)}
              stroke="rgba(80, 60, 30, 0.45)"
              strokeWidth={0.6}
            />
          ))}
          {/* Hand-written text */}
          <text
            x={cassetteX + cassetteW * 0.08}
            y={cassetteY + cassetteH * 0.16}
            fontSize={cassetteW * 0.05}
            fontFamily="cursive"
            fontWeight="700"
            fill="rgba(20, 40, 120, 0.85)"
          >
            {bandInitials}{showDateShort ? ` ${showDateShort}` : ""}
          </text>
          <text
            x={cassetteX + cassetteW * 0.08}
            y={cassetteY + cassetteH * 0.22}
            fontSize={cassetteW * 0.035}
            fontFamily="cursive"
            fill="rgba(20, 40, 120, 0.85)"
          >
            {showVenueShort}
          </text>
          <text
            x={cassetteX + cassetteW * 0.08}
            y={cassetteY + cassetteH * 0.28}
            fontSize={cassetteW * 0.030}
            fontFamily="cursive"
            fill="rgba(20, 40, 120, 0.85)"
          >
            Set 1 - Side A
          </text>

          {/* SIDE A indicator (label flag in corner) */}
          <rect
            x={cassetteX + cassetteW * 0.84}
            y={cassetteY + cassetteH * 0.08}
            width={cassetteW * 0.08}
            height={cassetteH * 0.08}
            fill={`hsla(${tintHue + 14}, 90%, 60%, ${labelPulse * 0.85})`}
            stroke="rgba(80, 60, 30, 0.95)"
            strokeWidth={0.6}
          />
          <text
            x={cassetteX + cassetteW * 0.88}
            y={cassetteY + cassetteH * 0.135}
            fontSize={cassetteW * 0.04}
            fontFamily="Arial"
            fontWeight="900"
            textAnchor="middle"
            fill="rgba(80, 30, 8, 0.95)"
          >
            A
          </text>

          {/* === CLEAR WINDOW (where the tape is visible) === */}
          <rect
            x={cassetteX + cassetteW * 0.10}
            y={cassetteY + cassetteH * 0.40}
            width={cassetteW * 0.80}
            height={cassetteH * 0.28}
            rx={2}
            fill="url(#cr-clear)"
            stroke="rgba(220, 220, 210, 0.6)"
            strokeWidth={1}
          />

          {/* Tape visible behind clear plastic (across window) */}
          <rect
            x={cassetteX + cassetteW * 0.16}
            y={cassetteY + cassetteH * 0.52}
            width={cassetteW * 0.68}
            height={cassetteH * 0.04}
            fill="url(#cr-tape)"
          />

          {/* === LEFT REEL === */}
          <g>
            <circle cx={reelLcx} cy={reelCy} r={reelR} fill="rgba(20, 18, 14, 0.95)" stroke="rgba(40, 40, 36, 0.85)" strokeWidth={1.2} />
            {/* Tape wound around reel */}
            <circle cx={reelLcx} cy={reelCy} r={reelR * 0.85} fill="url(#cr-tape)" />
            {/* Reel hub */}
            <circle cx={reelLcx} cy={reelCy} r={reelR * 0.30} fill="rgba(220, 220, 200, 0.95)" stroke="rgba(40, 40, 36, 0.95)" strokeWidth={0.8} />
            {/* Reel teeth (rotating) */}
            <g transform={`rotate(${reelRot}, ${reelLcx}, ${reelCy})`}>
              {Array.from({ length: 6 }, (_, k) => {
                const a = (k / 6) * Math.PI * 2;
                return (
                  <rect
                    key={k}
                    x={reelLcx + Math.cos(a) * reelR * 0.20 - 1.2}
                    y={reelCy + Math.sin(a) * reelR * 0.20 - 1.2}
                    width={2.4}
                    height={2.4}
                    fill="rgba(40, 40, 36, 0.95)"
                  />
                );
              })}
              {/* Drive holes */}
              {Array.from({ length: 6 }, (_, k) => {
                const a = (k / 6) * Math.PI * 2;
                return (
                  <ellipse
                    key={`dh-${k}`}
                    cx={reelLcx + Math.cos(a) * reelR * 0.55}
                    cy={reelCy + Math.sin(a) * reelR * 0.55}
                    rx={3}
                    ry={2}
                    fill="rgba(60, 40, 16, 0.85)"
                  />
                );
              })}
            </g>
          </g>

          {/* === RIGHT REEL === */}
          <g>
            <circle cx={reelRcx} cy={reelCy} r={reelR} fill="rgba(20, 18, 14, 0.95)" stroke="rgba(40, 40, 36, 0.85)" strokeWidth={1.2} />
            <circle cx={reelRcx} cy={reelCy} r={reelR * 0.65} fill="url(#cr-tape)" />
            <circle cx={reelRcx} cy={reelCy} r={reelR * 0.30} fill="rgba(220, 220, 200, 0.95)" stroke="rgba(40, 40, 36, 0.95)" strokeWidth={0.8} />
            <g transform={`rotate(${reelRot * 0.95}, ${reelRcx}, ${reelCy})`}>
              {Array.from({ length: 6 }, (_, k) => {
                const a = (k / 6) * Math.PI * 2;
                return (
                  <rect
                    key={k}
                    x={reelRcx + Math.cos(a) * reelR * 0.20 - 1.2}
                    y={reelCy + Math.sin(a) * reelR * 0.20 - 1.2}
                    width={2.4}
                    height={2.4}
                    fill="rgba(40, 40, 36, 0.95)"
                  />
                );
              })}
              {Array.from({ length: 6 }, (_, k) => {
                const a = (k / 6) * Math.PI * 2;
                return (
                  <ellipse
                    key={`dh-${k}`}
                    cx={reelRcx + Math.cos(a) * reelR * 0.55}
                    cy={reelCy + Math.sin(a) * reelR * 0.55}
                    rx={3}
                    ry={2}
                    fill="rgba(60, 40, 16, 0.85)"
                  />
                );
              })}
            </g>
          </g>

          {/* === BOTTOM SECTION (capstan / pinch roller area) === */}
          <rect
            x={cassetteX}
            y={cassetteY + cassetteH * 0.82}
            width={cassetteW}
            height={cassetteH * 0.18}
            rx={2}
            fill="url(#cr-shell)"
            stroke="rgba(0, 0, 0, 0.95)"
            strokeWidth={1.5}
          />
          {/* Tape head openings */}
          <rect x={cassetteX + cassetteW * 0.30} y={cassetteY + cassetteH * 0.86} width={cassetteW * 0.06} height={cassetteH * 0.10} fill="rgba(0, 0, 0, 0.95)" />
          <rect x={cassetteX + cassetteW * 0.46} y={cassetteY + cassetteH * 0.86} width={cassetteW * 0.08} height={cassetteH * 0.10} fill="rgba(0, 0, 0, 0.95)" />
          <rect x={cassetteX + cassetteW * 0.64} y={cassetteY + cassetteH * 0.86} width={cassetteW * 0.06} height={cassetteH * 0.10} fill="rgba(0, 0, 0, 0.95)" />
          {/* Capstan circle */}
          <circle cx={cassetteX + cassetteW * 0.42} cy={cassetteY + cassetteH * 0.91} r={1.4} fill="rgba(220, 220, 200, 0.85)" />
          <circle cx={cassetteX + cassetteW * 0.58} cy={cassetteY + cassetteH * 0.91} r={1.4} fill="rgba(220, 220, 200, 0.85)" />

          {/* === SCREW HOLES (5 of them) === */}
          {[
            [0.06, 0.06], [0.94, 0.06],
            [0.06, 0.92], [0.94, 0.92],
            [0.50, 0.06],
          ].map(([fx, fy], k) => (
            <g key={`sc-${k}`}>
              <circle
                cx={cassetteX + fx * cassetteW}
                cy={cassetteY + fy * cassetteH}
                r={2.4}
                fill="rgba(20, 18, 14, 0.95)"
              />
              <circle
                cx={cassetteX + fx * cassetteW}
                cy={cassetteY + fy * cassetteH}
                r={1.8}
                fill="rgba(80, 80, 76, 0.85)"
              />
              <line
                x1={cassetteX + fx * cassetteW - 1.4}
                y1={cassetteY + fy * cassetteH}
                x2={cassetteX + fx * cassetteW + 1.4}
                y2={cassetteY + fy * cassetteH}
                stroke="rgba(20, 18, 14, 0.95)"
                strokeWidth={0.5}
              />
            </g>
          ))}

          {/* === BRAND LOGO bottom edge === */}
          <text
            x={cassetteX + cassetteW * 0.5}
            y={cassetteY + cassetteH * 0.97}
            fontSize={cassetteW * 0.025}
            fontFamily="Arial"
            fontWeight="900"
            textAnchor="middle"
            fill="rgba(180, 180, 170, 0.85)"
          >
            MAXELL XL-II 90
          </text>

          {/* TINY "FERRO" / chrome marker */}
          <text
            x={cassetteX + cassetteW * 0.04}
            y={cassetteY + cassetteH * 0.97}
            fontSize={cassetteW * 0.02}
            fontFamily="Arial"
            fill="rgba(220, 220, 200, 0.7)"
          >
            CrO2
          </text>

          {/* === SHELL HIGHLIGHT (top edge) === */}
          <rect
            x={cassetteX + cassetteW * 0.05}
            y={cassetteY + 1}
            width={cassetteW * 0.90}
            height={1.5}
            fill="rgba(180, 180, 170, 0.55)"
          />
          {/* Shell side highlight */}
          <rect
            x={cassetteX + 1}
            y={cassetteY + cassetteH * 0.05}
            width={1.5}
            height={cassetteH * 0.90}
            fill="rgba(180, 180, 170, 0.55)"
          />
        </g>

        {/* HAND placing the cassette (silhouette finger from bottom-right) */}
        <g opacity={0.85}>
          <path
            d={`M ${cassetteX + cassetteW + 20} ${cassetteY + cassetteH * 0.6}
                Q ${cassetteX + cassetteW + 40} ${cassetteY + cassetteH * 0.4}
                  ${cassetteX + cassetteW + 60} ${cassetteY + cassetteH * 0.5}
                Q ${cassetteX + cassetteW + 70} ${cassetteY + cassetteH * 0.7}
                  ${cassetteX + cassetteW + 50} ${cassetteY + cassetteH * 0.85}
                L ${cassetteX + cassetteW + 30} ${cassetteY + cassetteH * 0.9}
                Q ${cassetteX + cassetteW + 12} ${cassetteY + cassetteH * 0.85}
                  ${cassetteX + cassetteW + 12} ${cassetteY + cassetteH * 0.7} Z`}
            fill="rgba(220, 180, 140, 0.55)"
            stroke="rgba(80, 50, 24, 0.65)"
            strokeWidth={0.8}
          />
        </g>

        {/* WARM LIGHT WASH OVER CASSETTE */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={cassetteW * 0.65}
          ry={cassetteH * 0.85}
          fill={`hsla(${tintHue + 6}, 95%, 70%, ${0.20 * cabinetWarm})`}
          style={{ mixBlendMode: "screen" }}
        />

        {/* TINT WASH */}
        <rect width={width} height={height} fill={`hsla(${tintHue}, 70%, 55%, ${0.05 + slowEnergy * 0.05})`} />

        {/* VIGNETTE */}
        <radialGradient id="cr-vign" cx="50%" cy="50%" r="65%">
          <stop offset="50%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
        </radialGradient>
        <rect width={width} height={height} fill="url(#cr-vign)" />
      </svg>
    </div>
  );
};
