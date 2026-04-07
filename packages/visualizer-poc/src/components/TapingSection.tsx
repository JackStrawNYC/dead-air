/**
 * TapingSection — A+++ taper-section homage scene.
 *
 * The taper section behind the soundboard at a Dead show: 8 tall mic stands
 * holding condenser microphones at varying heights, all aimed at a glowing
 * stage in the distance. Cassette decks and reel-to-reel decks on a folding
 * table, headphones, patch cables snaking everywhere, dead-stealie tape
 * labels, level meters, glowing "RECORD" lights. Audiophile reverence.
 *
 * Audio reactivity:
 *   slowEnergy   → stage backlight
 *   energy       → meter needle deflection + record light intensity
 *   bass         → cable sway
 *   beatDecay    → record light pulse
 *   onsetEnvelope→ peak meter flash
 *   chromaHue    → mic LED hue tint
 *   tempoFactor  → reel rotation
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

interface MicStand {
  bx: number;
  height: number;
  micType: "condenser" | "dynamic" | "ribbon";
  swayOffset: number;
}

interface CableSpec {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  hue: number;
}

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

export const TapingSection: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const stands = React.useMemo<MicStand[]>(() => {
    const rng = seeded(54_113_887);
    const positions = [0.10, 0.20, 0.32, 0.42, 0.54, 0.64, 0.76, 0.88];
    const types: ("condenser" | "dynamic" | "ribbon")[] = ["condenser", "dynamic", "ribbon"];
    return positions.map((bx) => ({
      bx,
      height: 0.42 + rng() * 0.18,
      micType: types[Math.floor(rng() * 3)],
      swayOffset: rng() * Math.PI * 2,
    }));
  }, []);

  const cables = React.useMemo<CableSpec[]>(() => {
    const rng = seeded(33_887_991);
    return Array.from({ length: 12 }, () => ({
      startX: rng(),
      startY: 0.66 + rng() * 0.20,
      endX: rng(),
      endY: 0.74 + rng() * 0.20,
      hue: rng() * 360,
    }));
  }, []);

  const dust = React.useMemo<DustMote[]>(() => {
    const rng = seeded(91_558_001);
    return Array.from({ length: 60 }, () => ({
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

  const stageGlow = 0.55 + slowEnergy * 0.45;
  const recordPulse = 0.4 + beatDecay * 0.5 + onsetEnv * 0.6;
  const meterDeflect = 0.3 + energy * 0.65;
  const cableSway = bass * 1.5;
  const reelRot = (frame * 4 * tempoFactor) % 360;

  const baseHue = 200;
  const tintHue = ((baseHue + (chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const tintCore = `hsl(${tintHue}, 95%, 88%)`;
  const tintColor = `hsl(${tintHue}, 80%, 65%)`;

  const horizonY = height * 0.55;
  const tableY = height * 0.74;

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
        fill={`hsla(${tintHue}, 60%, 75%, ${op * stageGlow})`}
      />
    );
  });

  /* Render a mic stand + microphone */
  function renderMicStand(s: MicStand, idx: number): React.ReactNode {
    const sx = s.bx * width;
    const baseY = tableY + 6;
    const topY = height * (1 - s.height);
    const sway = Math.sin(frame * 0.018 + s.swayOffset) * cableSway * 0.8;

    return (
      <g key={`mic-${idx}`}>
        {/* Tripod base */}
        <line x1={sx - 12} y1={baseY + 6} x2={sx} y2={baseY} stroke="rgba(40, 40, 36, 0.95)" strokeWidth={2.4} />
        <line x1={sx + 12} y1={baseY + 6} x2={sx} y2={baseY} stroke="rgba(40, 40, 36, 0.95)" strokeWidth={2.4} />
        <line x1={sx} y1={baseY + 8} x2={sx} y2={baseY} stroke="rgba(40, 40, 36, 0.95)" strokeWidth={2.4} />
        <ellipse cx={sx} cy={baseY + 8} rx={14} ry={2} fill="rgba(20, 20, 18, 0.85)" />

        {/* Vertical pole (sectional) */}
        <line x1={sx} y1={baseY} x2={sx + sway * 0.3} y2={topY + 22} stroke="rgba(140, 140, 130, 0.85)" strokeWidth={2.6} />
        {/* Lower pole join collar */}
        <rect x={sx - 3} y={baseY - 18} width={6} height={3} fill="rgba(60, 60, 56, 0.95)" />
        {/* Upper pole join collar */}
        <rect x={sx - 3 + sway * 0.2} y={topY + 36} width={6} height={3} fill="rgba(60, 60, 56, 0.95)" />

        {/* Boom arm extending forward at top */}
        <line x1={sx + sway * 0.3} y1={topY + 22} x2={sx + sway + 18} y2={topY + 8} stroke="rgba(140, 140, 130, 0.85)" strokeWidth={2.2} />
        <circle cx={sx + sway * 0.3} cy={topY + 22} r={3} fill="rgba(60, 60, 56, 0.95)" />

        {/* Microphone (varies by type) */}
        {s.micType === "condenser" && (
          <g>
            {/* Cylindrical body */}
            <rect x={sx + sway + 14} y={topY - 4} width={8} height={20} rx={2} fill="rgba(220, 220, 210, 0.95)" stroke="rgba(40, 40, 36, 0.95)" strokeWidth={1} />
            <rect x={sx + sway + 14} y={topY - 4} width={8} height={3} fill="rgba(160, 160, 150, 0.95)" />
            {/* Capsule grille on top */}
            <ellipse cx={sx + sway + 18} cy={topY - 6} rx={5} ry={4} fill="rgba(60, 60, 56, 0.95)" stroke="rgba(20, 20, 18, 0.95)" strokeWidth={0.8} />
            {/* Grille mesh */}
            {Array.from({ length: 4 }, (_, k) => (
              <line key={k} x1={sx + sway + 14} y1={topY - 8 + k * 1.2} x2={sx + sway + 22} y2={topY - 8 + k * 1.2} stroke="rgba(120, 120, 110, 0.95)" strokeWidth={0.4} />
            ))}
            {/* LED indicator */}
            <circle cx={sx + sway + 18} cy={topY + 12} r={1.4} fill={tintCore} opacity={0.85 + recordPulse * 0.15} />
            {/* Brand label */}
            <rect x={sx + sway + 15} y={topY + 4} width={6} height={3} fill="rgba(20, 20, 18, 0.95)" />
          </g>
        )}
        {s.micType === "dynamic" && (
          <g>
            <ellipse cx={sx + sway + 18} cy={topY} rx={5} ry={3} fill="rgba(40, 40, 36, 0.95)" stroke="rgba(20, 20, 18, 0.95)" strokeWidth={0.8} />
            <ellipse cx={sx + sway + 18} cy={topY} rx={4} ry={2.5} fill="rgba(80, 80, 76, 0.95)" />
            <rect x={sx + sway + 14} y={topY + 2} width={8} height={14} rx={3} fill="rgba(40, 40, 36, 0.95)" stroke="rgba(20, 20, 18, 0.95)" strokeWidth={0.8} />
          </g>
        )}
        {s.micType === "ribbon" && (
          <g>
            <rect x={sx + sway + 13} y={topY - 6} width={10} height={20} rx={1.5} fill="rgba(140, 140, 130, 0.95)" stroke="rgba(40, 40, 36, 0.95)" strokeWidth={1} />
            <rect x={sx + sway + 14} y={topY - 4} width={8} height={2} fill="rgba(220, 220, 210, 0.85)" />
            <rect x={sx + sway + 14} y={topY + 2} width={8} height={4} fill="rgba(60, 60, 56, 0.95)" />
            {/* Ribbon vertical strips */}
            {Array.from({ length: 3 }, (_, k) => (
              <line key={k} x1={sx + sway + 16 + k * 1.5} y1={topY + 2} x2={sx + sway + 16 + k * 1.5} y2={topY + 6} stroke="rgba(220, 220, 210, 0.85)" strokeWidth={0.4} />
            ))}
            <circle cx={sx + sway + 18} cy={topY + 12} r={1.2} fill={tintCore} opacity={0.85 + recordPulse * 0.15} />
          </g>
        )}

        {/* Cable trailing down from mic */}
        <path
          d={`M ${sx + sway + 18} ${topY + 14}
              Q ${sx + sway + 22} ${(topY + tableY) / 2} ${sx + 8} ${tableY - 4}`}
          stroke={`hsl(${(idx * 40 + tintHue) % 360}, 70%, 50%)`}
          strokeWidth={1.6}
          fill="none"
        />

        {/* Tape label on stand (writing on it) */}
        <rect x={sx - 10} y={tableY - 14} width={20} height={6} fill="rgba(255, 250, 235, 0.92)" stroke="rgba(40, 40, 36, 0.95)" strokeWidth={0.6} />
        <line x1={sx - 8} y1={tableY - 12} x2={sx + 8} y2={tableY - 12} stroke="rgba(20, 20, 18, 0.85)" strokeWidth={0.4} />
        <line x1={sx - 8} y1={tableY - 10} x2={sx + 6} y2={tableY - 10} stroke="rgba(20, 20, 18, 0.85)" strokeWidth={0.4} />
      </g>
    );
  }

  /* Cassette deck rendering */
  function renderCassetteDeck(dx: number, dy: number, label: string): React.ReactNode {
    const w = 90;
    const h = 38;
    return (
      <g>
        {/* Body */}
        <rect x={dx} y={dy} width={w} height={h} rx={2} fill="rgba(40, 40, 36, 0.95)" stroke="rgba(20, 20, 18, 0.95)" strokeWidth={1.4} />
        <rect x={dx} y={dy} width={w} height={4} fill="rgba(60, 60, 56, 0.95)" />
        {/* Cassette window */}
        <rect x={dx + 8} y={dy + 8} width={50} height={18} rx={1} fill="rgba(20, 24, 30, 0.95)" stroke="rgba(120, 120, 110, 0.85)" strokeWidth={0.6} />
        {/* Cassette tape behind window */}
        <rect x={dx + 10} y={dy + 10} width={46} height={14} fill="rgba(180, 130, 70, 0.85)" />
        {/* Reel windows */}
        <circle cx={dx + 18} cy={dy + 17} r={4.5} fill="rgba(20, 18, 14, 0.95)" />
        <circle cx={dx + 48} cy={dy + 17} r={4.5} fill="rgba(20, 18, 14, 0.95)" />
        {/* Spinning reels */}
        <g transform={`rotate(${reelRot}, ${dx + 18}, ${dy + 17})`}>
          <line x1={dx + 14} y1={dy + 17} x2={dx + 22} y2={dy + 17} stroke="rgba(180, 130, 70, 0.85)" strokeWidth={1} />
          <line x1={dx + 18} y1={dy + 13} x2={dx + 18} y2={dy + 21} stroke="rgba(180, 130, 70, 0.85)" strokeWidth={1} />
        </g>
        <g transform={`rotate(${reelRot}, ${dx + 48}, ${dy + 17})`}>
          <line x1={dx + 44} y1={dy + 17} x2={dx + 52} y2={dy + 17} stroke="rgba(180, 130, 70, 0.85)" strokeWidth={1} />
          <line x1={dx + 48} y1={dy + 13} x2={dx + 48} y2={dy + 21} stroke="rgba(180, 130, 70, 0.85)" strokeWidth={1} />
        </g>
        {/* VU meter */}
        <rect x={dx + 62} y={dy + 8} width={22} height={12} rx={0.5} fill="rgba(15, 20, 30, 0.95)" stroke="rgba(140, 140, 130, 0.85)" strokeWidth={0.4} />
        <rect x={dx + 64} y={dy + 18} width={18} height={1} fill="rgba(60, 60, 56, 0.85)" />
        {/* VU needle */}
        <line
          x1={dx + 73}
          y1={dy + 18}
          x2={dx + 73 + Math.cos(-Math.PI / 2 + meterDeflect * 1.2 - 0.6) * 9}
          y2={dy + 18 + Math.sin(-Math.PI / 2 + meterDeflect * 1.2 - 0.6) * 9}
          stroke="rgba(255, 240, 220, 0.95)"
          strokeWidth={0.8}
        />
        {/* Meter scale */}
        {Array.from({ length: 5 }, (_, k) => {
          const a = -Math.PI / 2 + (k - 2) * 0.3;
          return (
            <line
              key={k}
              x1={dx + 73 + Math.cos(a) * 7.5}
              y1={dy + 18 + Math.sin(a) * 7.5}
              x2={dx + 73 + Math.cos(a) * 9}
              y2={dy + 18 + Math.sin(a) * 9}
              stroke="rgba(220, 220, 200, 0.85)"
              strokeWidth={0.4}
            />
          );
        })}
        {/* Buttons (transport row) */}
        {[0, 1, 2, 3, 4].map((k) => (
          <rect
            key={k}
            x={dx + 8 + k * 10}
            y={dy + 28}
            width={8}
            height={6}
            rx={0.5}
            fill="rgba(80, 80, 76, 0.95)"
            stroke="rgba(20, 20, 18, 0.95)"
            strokeWidth={0.5}
          />
        ))}
        {/* RECORD light (red) */}
        <circle cx={dx + 78} cy={dy + 31} r={1.8} fill={`rgba(255, 60, 50, ${recordPulse})`} />
        <circle cx={dx + 78} cy={dy + 31} r={4} fill="rgba(255, 60, 50, 0.4)" opacity={recordPulse * 0.6} />
        {/* Label */}
        <text x={dx + w / 2} y={dy + 4} fontSize="3" fontFamily="Arial" fontWeight="700" textAnchor="middle" fill="rgba(220, 220, 200, 0.85)">{label}</text>
      </g>
    );
  }

  /* Reel-to-reel deck rendering */
  function renderReelDeck(dx: number, dy: number): React.ReactNode {
    const w = 130;
    const h = 70;
    return (
      <g>
        <rect x={dx} y={dy} width={w} height={h} rx={2} fill="rgba(50, 40, 30, 0.95)" stroke="rgba(20, 18, 12, 0.95)" strokeWidth={1.4} />
        <rect x={dx} y={dy} width={w} height={4} fill="rgba(80, 60, 40, 0.95)" />
        {/* Two reels */}
        <g transform={`rotate(${reelRot}, ${dx + 32}, ${dy + 32})`}>
          <circle cx={dx + 32} cy={dy + 32} r={20} fill="rgba(20, 18, 12, 0.95)" stroke="rgba(220, 220, 200, 0.85)" strokeWidth={1} />
          <circle cx={dx + 32} cy={dy + 32} r={6} fill="rgba(220, 220, 200, 0.95)" />
          {Array.from({ length: 6 }, (_, k) => {
            const a = (k / 6) * Math.PI * 2;
            return (
              <line
                key={k}
                x1={dx + 32 + Math.cos(a) * 6}
                y1={dy + 32 + Math.sin(a) * 6}
                x2={dx + 32 + Math.cos(a) * 18}
                y2={dy + 32 + Math.sin(a) * 18}
                stroke="rgba(220, 220, 200, 0.85)"
                strokeWidth={0.8}
              />
            );
          })}
          {/* Tape wound on reel */}
          <circle cx={dx + 32} cy={dy + 32} r={14} fill="none" stroke="rgba(180, 140, 70, 0.85)" strokeWidth={5} />
        </g>
        <g transform={`rotate(${reelRot * 0.95}, ${dx + 98}, ${dy + 32})`}>
          <circle cx={dx + 98} cy={dy + 32} r={20} fill="rgba(20, 18, 12, 0.95)" stroke="rgba(220, 220, 200, 0.85)" strokeWidth={1} />
          <circle cx={dx + 98} cy={dy + 32} r={6} fill="rgba(220, 220, 200, 0.95)" />
          {Array.from({ length: 6 }, (_, k) => {
            const a = (k / 6) * Math.PI * 2;
            return (
              <line
                key={k}
                x1={dx + 98 + Math.cos(a) * 6}
                y1={dy + 32 + Math.sin(a) * 6}
                x2={dx + 98 + Math.cos(a) * 18}
                y2={dy + 32 + Math.sin(a) * 18}
                stroke="rgba(220, 220, 200, 0.85)"
                strokeWidth={0.8}
              />
            );
          })}
          <circle cx={dx + 98} cy={dy + 32} r={10} fill="none" stroke="rgba(180, 140, 70, 0.85)" strokeWidth={3} />
        </g>
        {/* Tape path */}
        <path
          d={`M ${dx + 50} ${dy + 32}
              Q ${dx + 65} ${dy + 50} ${dx + 80} ${dy + 32}`}
          stroke="rgba(180, 140, 70, 0.95)"
          strokeWidth={1.4}
          fill="none"
        />
        {/* Heads (record/play) */}
        <rect x={dx + 60} y={dy + 50} width={4} height={6} fill="rgba(220, 220, 200, 0.95)" />
        <rect x={dx + 66} y={dy + 50} width={4} height={6} fill="rgba(220, 220, 200, 0.95)" />
        <rect x={dx + 72} y={dy + 50} width={4} height={6} fill="rgba(220, 220, 200, 0.95)" />
        {/* Knobs */}
        <circle cx={dx + 12} cy={dy + 60} r={3} fill="rgba(120, 120, 110, 0.95)" stroke="rgba(20, 18, 12, 0.95)" strokeWidth={0.5} />
        <circle cx={dx + 22} cy={dy + 60} r={3} fill="rgba(120, 120, 110, 0.95)" stroke="rgba(20, 18, 12, 0.95)" strokeWidth={0.5} />
        <circle cx={dx + 108} cy={dy + 60} r={3} fill="rgba(120, 120, 110, 0.95)" stroke="rgba(20, 18, 12, 0.95)" strokeWidth={0.5} />
        <circle cx={dx + 118} cy={dy + 60} r={3} fill="rgba(120, 120, 110, 0.95)" stroke="rgba(20, 18, 12, 0.95)" strokeWidth={0.5} />
        {/* RECORD light */}
        <circle cx={dx + 65} cy={dy + 8} r={2} fill={`rgba(255, 60, 50, ${recordPulse})`} />
      </g>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="ts-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(8, 4, 12, 1)" />
            <stop offset="55%" stopColor="rgba(14, 10, 22, 1)" />
            <stop offset="100%" stopColor="rgba(6, 4, 12, 1)" />
          </linearGradient>
          <radialGradient id="ts-stage" cx="50%" cy="100%" r="80%">
            <stop offset="0%" stopColor={`hsla(${tintHue + 14}, 95%, 70%, ${0.85 * stageGlow})`} />
            <stop offset="40%" stopColor={`hsla(${tintHue}, 80%, 50%, ${0.45 * stageGlow})`} />
            <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
          </radialGradient>
          <linearGradient id="ts-table" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a2415" />
            <stop offset="100%" stopColor="#1a0f08" />
          </linearGradient>
          <filter id="ts-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* DARK BACKGROUND */}
        <rect width={width} height={height} fill="url(#ts-bg)" />

        {/* DISTANT STAGE GLOW */}
        <ellipse cx={width * 0.5} cy={horizonY + 40} rx={width * 0.55} ry={height * 0.35} fill="url(#ts-stage)" />

        {/* STAGE STRUCTURE (silhouette) */}
        <rect x={width * 0.20} y={horizonY - 8} width={width * 0.60} height={6} fill="rgba(20, 14, 8, 0.95)" />
        <rect x={width * 0.18} y={horizonY - 14} width={6} height={20} fill="rgba(20, 14, 8, 0.95)" />
        <rect x={width * 0.82 - 6} y={horizonY - 14} width={6} height={20} fill="rgba(20, 14, 8, 0.95)" />

        {/* Stage lights */}
        {Array.from({ length: 5 }, (_, i) => {
          const lx = width * 0.25 + i * width * 0.125;
          return (
            <g key={`sl-${i}`} style={{ mixBlendMode: "screen" }}>
              <circle cx={lx} cy={horizonY - 8} r={3} fill={`hsl(${(tintHue + i * 30) % 360}, 95%, 75%)`} />
              <circle cx={lx} cy={horizonY - 8} r={12} fill={`hsla(${(tintHue + i * 30) % 360}, 95%, 75%, 0.4)`} filter="url(#ts-blur)" />
            </g>
          );
        })}

        {/* Stage band silhouettes */}
        {[0.36, 0.46, 0.54, 0.64].map((bx, i) => (
          <ellipse key={`b-${i}`} cx={bx * width} cy={horizonY + 8} rx={8} ry={14} fill="rgba(20, 14, 8, 0.95)" />
        ))}

        {/* AUDIENCE silhouette (lower bank) */}
        {Array.from({ length: 60 }, (_, i) => {
          const ax = (i / 59) * width;
          const ay = horizonY + 26 + ((i * 13) % 12);
          return <circle key={`au-${i}`} cx={ax} cy={ay} r={3} fill="rgba(8, 6, 12, 0.95)" />;
        })}

        {/* DUST in spotlight beams */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes.slice(0, 30)}</g>

        {/* === FOLDING TABLE WITH GEAR === */}
        <rect x={width * 0.05} y={tableY} width={width * 0.90} height={height * 0.05} fill="url(#ts-table)" stroke="rgba(20, 12, 4, 0.95)" strokeWidth={1.4} />
        <line x1={width * 0.05} y1={tableY + 2} x2={width * 0.95} y2={tableY + 2} stroke="rgba(80, 50, 20, 0.6)" strokeWidth={0.8} />
        {/* Table legs */}
        <line x1={width * 0.10} y1={tableY + height * 0.05} x2={width * 0.10} y2={height * 0.95} stroke="rgba(40, 24, 8, 0.95)" strokeWidth={2} />
        <line x1={width * 0.90} y1={tableY + height * 0.05} x2={width * 0.90} y2={height * 0.95} stroke="rgba(40, 24, 8, 0.95)" strokeWidth={2} />

        {/* CASSETTE DECKS */}
        {renderCassetteDeck(width * 0.12, tableY - 38, "TDK SA-90")}
        {renderCassetteDeck(width * 0.30, tableY - 38, "MAXELL XL-II")}
        {/* REEL-TO-REEL */}
        {renderReelDeck(width * 0.50, tableY - 70)}
        {renderCassetteDeck(width * 0.78, tableY - 38, "NAKAMICHI")}

        {/* MIC STANDS */}
        {stands.map((s, i) => renderMicStand(s, i))}

        {/* HEADPHONES on the table */}
        <g>
          <ellipse cx={width * 0.18} cy={tableY + 4} rx={14} ry={3} fill="rgba(0,0,0,0.4)" />
          <path
            d={`M ${width * 0.18 - 12} ${tableY + 4}
                Q ${width * 0.18} ${tableY - 14} ${width * 0.18 + 12} ${tableY + 4}`}
            stroke="rgba(40, 40, 36, 0.95)"
            strokeWidth={2.5}
            fill="none"
          />
          <ellipse cx={width * 0.18 - 12} cy={tableY + 4} rx={5} ry={6} fill="rgba(40, 40, 36, 0.95)" stroke="rgba(20, 18, 14, 0.95)" strokeWidth={0.8} />
          <ellipse cx={width * 0.18 + 12} cy={tableY + 4} rx={5} ry={6} fill="rgba(40, 40, 36, 0.95)" stroke="rgba(20, 18, 14, 0.95)" strokeWidth={0.8} />
          <ellipse cx={width * 0.18 - 12} cy={tableY + 4} rx={3} ry={4} fill="rgba(80, 80, 76, 0.95)" />
          <ellipse cx={width * 0.18 + 12} cy={tableY + 4} rx={3} ry={4} fill="rgba(80, 80, 76, 0.95)" />
        </g>

        {/* PATCH CABLES snaking on table */}
        {cables.map((c, i) => (
          <path
            key={`cab-${i}`}
            d={`M ${c.startX * width} ${tableY + 6}
                Q ${(c.startX + c.endX) * width * 0.5} ${tableY + 12 + Math.sin(frame * 0.04 + i) * cableSway}
                ${c.endX * width} ${tableY + 6}`}
            stroke={`hsl(${(c.hue + tintHue) % 360}, 70%, 50%)`}
            strokeWidth={1.4}
            fill="none"
          />
        ))}

        {/* DEAD STEALIE TAPE LABELS scattered (small dead skull lightning bolt) */}
        {Array.from({ length: 4 }, (_, i) => {
          const lx = width * 0.20 + i * width * 0.18;
          const ly = tableY + 2;
          return (
            <g key={`stl-${i}`}>
              <rect x={lx} y={ly} width={14} height={10} rx={1} fill="rgba(255, 250, 235, 0.92)" stroke="rgba(40, 40, 36, 0.95)" strokeWidth={0.5} />
              <circle cx={lx + 7} cy={ly + 5} r={3.5} fill="rgba(20, 18, 14, 0.95)" />
              <path d={`M ${lx + 6} ${ly + 3} L ${lx + 8} ${ly + 5} L ${lx + 6.5} ${ly + 5.5} L ${lx + 8} ${ly + 7}`} stroke="hsl(45, 90%, 60%)" strokeWidth={0.6} fill="none" />
            </g>
          );
        })}

        {/* DUST in front spotlight */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes.slice(30)}</g>

        {/* OVERALL VIGNETTE */}
        <radialGradient id="ts-vign" cx="50%" cy="55%" r="70%">
          <stop offset="40%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.7)" />
        </radialGradient>
        <rect width={width} height={height} fill="url(#ts-vign)" />

        {/* WARM TINT WASH */}
        <rect width={width} height={height} fill={`hsla(${tintHue + 10}, 70%, 55%, ${0.04 + slowEnergy * 0.04})`} />
      </svg>
    </div>
  );
};
