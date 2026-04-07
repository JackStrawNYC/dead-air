/**
 * MicStandSilhouette — A+++ overlay: vintage mic stand on an empty stage.
 * Reverent pre-show shot. Round base, telescoping pole, boom arm, vintage
 * SM7-style mic, coiled XLR cable on the floor, monitor wedge nearby.
 * Spotlight from above with halo, dust motes, intimate venue.
 *
 * Audio reactivity:
 *   slowEnergy → spotlight warmth + dust motes
 *   energy → mic glow + cable shimmer
 *   bass → subtle stand vibration
 *   beatDecay → halo pulse
 *   onsetEnvelope → mic flash
 *   chromaHue → warm/cool tint shift
 *   tempoFactor → particle drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const DUST_COUNT = 80;

interface DustMote { x: number; y: number; r: number; speed: number; phase: number; }

function buildDust(): DustMote[] {
  const rng = seeded(94_172_088);
  return Array.from({ length: DUST_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.85,
    r: 0.5 + rng() * 1.6,
    speed: 0.0006 + rng() * 0.0018,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const MicStandSilhouette: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const dust = React.useMemo(buildDust, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const spotWarmth = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const micGlow = interpolate(snap.energy, [0.02, 0.30], [0.4, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stagebreath = interpolate(snap.bass, [0.0, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const haloPulse = 1 + snap.beatDecay * 0.35;
  const micFlash = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Warm hue base
  const baseHue = 38;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const tintLight = 64 + spotWarmth * 16;
  const tintColor = `hsl(${tintHue}, 76%, ${tintLight}%)`;
  const tintCore = `hsl(${tintHue}, 92%, ${Math.min(96, tintLight + 22)}%)`;
  const tintDeep = `hsl(${(tintHue + 10) % 360}, 60%, 22%)`;

  // Geometry
  const cx = width * 0.5;
  const stageY = height * 0.78;
  const horizonY = height * 0.50;
  const standBaseY = stageY + 4;
  const standTopY = stageY - 220;
  const standBreath = stagebreath * 0.6 * Math.sin(frame * 0.4);

  const skyTop = "hsl(0, 0%, 2%)";
  const skyMid = "hsl(0, 0%, 5%)";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="ms-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={tintDeep} />
          </linearGradient>
          <linearGradient id="ms-stage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(12, 8, 4, 0.95)" />
            <stop offset="100%" stopColor="rgba(2, 1, 0, 0.99)" />
          </linearGradient>
          <linearGradient id="ms-spot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.55} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </linearGradient>
          <radialGradient id="ms-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.85} />
            <stop offset="60%" stopColor={tintColor} stopOpacity={0.20} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="ms-floorPool">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.40} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="ms-stand" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0a0a0a" />
            <stop offset="40%" stopColor="#2a2a2a" />
            <stop offset="60%" stopColor="#3a3a3a" />
            <stop offset="100%" stopColor="#080808" />
          </linearGradient>
          <linearGradient id="ms-mic" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="40%" stopColor="#2c2c2c" />
            <stop offset="100%" stopColor="#080808" />
          </linearGradient>
          <radialGradient id="ms-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
          <filter id="ms-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Background */}
        <rect width={width} height={height} fill="url(#ms-sky)" />

        {/* Backstage curtain */}
        <rect x={0} y={horizonY} width={width} height={stageY - horizonY} fill="rgba(8, 6, 4, 0.85)" />
        {Array.from({ length: 22 }).map((_, i) => (
          <line key={`fold-${i}`} x1={(i / 22) * width} y1={horizonY} x2={(i / 22) * width + 6} y2={stageY}
            stroke="rgba(0, 0, 0, 0.55)" strokeWidth={1.4} />
        ))}

        {/* Truss with single hanging spotlight */}
        <rect x={width * 0.10} y={height * 0.06} width={width * 0.80} height={5} fill="rgba(0, 0, 0, 0.85)" />
        <rect x={cx - 14} y={height * 0.06} width={28} height={20} fill="rgba(0, 0, 0, 0.95)" />
        <line x1={cx - 8} y1={height * 0.06 + 20} x2={cx - 12} y2={height * 0.06 + 28} stroke="rgba(0, 0, 0, 0.95)" strokeWidth={1.4} />
        <line x1={cx + 8} y1={height * 0.06 + 20} x2={cx + 12} y2={height * 0.06 + 28} stroke="rgba(0, 0, 0, 0.95)" strokeWidth={1.4} />
        <ellipse cx={cx} cy={height * 0.06 + 28} rx={14} ry={4} fill={tintCore} opacity={0.85 * spotWarmth} />

        {/* Spotlight cone */}
        <path d={`M ${cx - 28} ${height * 0.07 + 28} L ${cx + 28} ${height * 0.07 + 28} L ${cx + width * 0.18} ${stageY} L ${cx - width * 0.18} ${stageY} Z`}
          fill="url(#ms-spot)" style={{ mixBlendMode: "screen" }} />
        <path d={`M ${cx - 12} ${height * 0.07 + 28} L ${cx + 12} ${height * 0.07 + 28} L ${cx + width * 0.10} ${stageY} L ${cx - width * 0.10} ${stageY} Z`}
          fill={tintCore} opacity={0.18 * spotWarmth} style={{ mixBlendMode: "screen" }} />

        {/* Stage floor */}
        <rect x={0} y={stageY} width={width} height={height - stageY} fill="url(#ms-stage)" />
        <rect x={0} y={stageY - 1} width={width} height={2} fill={tintColor} opacity={0.30 * spotWarmth} />
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={`plank-${i}`} x1={0} y1={stageY + 8 + i * 12} x2={width} y2={stageY + 8 + i * 12}
            stroke="rgba(0, 0, 0, 0.45)" strokeWidth={0.6} />
        ))}

        {/* Pool of light on floor */}
        <ellipse cx={cx} cy={stageY + 24} rx={140 * (0.85 + spotWarmth * 0.3)} ry={26} fill="url(#ms-floorPool)" style={{ mixBlendMode: "screen" }} />

        {/* Monitor wedge nearby (left of mic) */}
        <g transform={`translate(${cx - 130} ${stageY + 6})`}>
          <path d="M -38 0 L 38 0 L 28 24 L -28 24 Z" fill="rgba(6, 4, 2, 0.95)" stroke="rgba(40, 32, 22, 0.7)" strokeWidth={1.2} />
          <ellipse cx={-12} cy={12} rx={8} ry={6} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(60, 50, 40, 0.55)" strokeWidth={0.5} />
          <ellipse cx={12} cy={12} rx={8} ry={6} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(60, 50, 40, 0.55)" strokeWidth={0.5} />
          <circle cx={-12} cy={12} r={2} fill={tintCore} opacity={0.4 * micGlow} />
          <circle cx={12} cy={12} r={2} fill={tintCore} opacity={0.4 * micGlow} />
          {/* Cable from monitor */}
          <path d="M 28 22 Q 60 30 90 24" stroke="rgba(0, 0, 0, 0.95)" strokeWidth={1.6} fill="none" />
        </g>

        {/* Distant PA stack hint (left edge) */}
        <g transform={`translate(${width * 0.06} ${stageY - 180})`}>
          <rect x={-30} y={0} width={60} height={180} fill="rgba(4, 4, 4, 0.92)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.2} />
          <rect x={-26} y={6} width={52} height={168} fill="none" stroke="rgba(40, 30, 20, 0.55)" strokeWidth={0.6} />
          {Array.from({ length: 5 }).map((_, r) => (
            <g key={`pa-${r}`}>
              <circle cx={-12} cy={20 + r * 32} r={9} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(40, 30, 20, 0.55)" strokeWidth={0.5} />
              <circle cx={-12} cy={20 + r * 32} r={3} fill="rgba(20, 14, 8, 0.95)" />
              <circle cx={12} cy={20 + r * 32} r={9} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(40, 30, 20, 0.55)" strokeWidth={0.5} />
              <circle cx={12} cy={20 + r * 32} r={3} fill="rgba(20, 14, 8, 0.95)" />
            </g>
          ))}
          <ellipse cx={0} cy={184} rx={34} ry={4} fill="rgba(0, 0, 0, 0.85)" />
        </g>

        {/* Distant PA stack hint (right edge) */}
        <g transform={`translate(${width * 0.94} ${stageY - 180})`}>
          <rect x={-30} y={0} width={60} height={180} fill="rgba(4, 4, 4, 0.92)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.2} />
          <rect x={-26} y={6} width={52} height={168} fill="none" stroke="rgba(40, 30, 20, 0.55)" strokeWidth={0.6} />
          {Array.from({ length: 5 }).map((_, r) => (
            <g key={`pa2-${r}`}>
              <circle cx={-12} cy={20 + r * 32} r={9} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(40, 30, 20, 0.55)" strokeWidth={0.5} />
              <circle cx={-12} cy={20 + r * 32} r={3} fill="rgba(20, 14, 8, 0.95)" />
              <circle cx={12} cy={20 + r * 32} r={9} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(40, 30, 20, 0.55)" strokeWidth={0.5} />
              <circle cx={12} cy={20 + r * 32} r={3} fill="rgba(20, 14, 8, 0.95)" />
            </g>
          ))}
          <ellipse cx={0} cy={184} rx={34} ry={4} fill="rgba(0, 0, 0, 0.85)" />
        </g>

        {/* Setlist taped to stand */}
        <g transform={`translate(${cx + 10} ${stageY - 88})`}>
          <rect x={-8} y={-12} width={16} height={20} fill="rgba(220, 210, 180, 0.85)" stroke="rgba(20, 14, 8, 0.55)" strokeWidth={0.4} />
          <line x1={-6} y1={-8} x2={6} y2={-8} stroke="rgba(20, 14, 8, 0.65)" strokeWidth={0.4} />
          <line x1={-6} y1={-5} x2={6} y2={-5} stroke="rgba(20, 14, 8, 0.65)" strokeWidth={0.4} />
          <line x1={-6} y1={-2} x2={4} y2={-2} stroke="rgba(20, 14, 8, 0.65)" strokeWidth={0.4} />
          <line x1={-6} y1={1} x2={6} y2={1} stroke="rgba(20, 14, 8, 0.65)" strokeWidth={0.4} />
          <line x1={-6} y1={4} x2={3} y2={4} stroke="rgba(20, 14, 8, 0.65)" strokeWidth={0.4} />
        </g>

        {/* Coiled XLR cable on floor (right of stand) */}
        <g transform={`translate(${cx + 80} ${stageY + 22})`}>
          {Array.from({ length: 7 }).map((_, i) => (
            <ellipse key={`coil-${i}`} cx={0} cy={i * 3} rx={28 - i * 1.2} ry={6 - i * 0.4} fill="none" stroke="rgba(0, 0, 0, 0.95)" strokeWidth={2.2} />
          ))}
          {Array.from({ length: 7 }).map((_, i) => (
            <ellipse key={`coil-h-${i}`} cx={0} cy={i * 3 - 1} rx={28 - i * 1.2} ry={6 - i * 0.4} fill="none" stroke="rgba(60, 50, 40, 0.45)" strokeWidth={0.6} />
          ))}
          {/* Cable end */}
          <rect x={-32} y={-2} width={6} height={3} fill="rgba(40, 32, 22, 0.85)" />
        </g>

        {/* Mic stand */}
        <g transform={`translate(${cx} 0) translate(0 ${standBreath})`}>
          {/* Round base */}
          <ellipse cx={0} cy={standBaseY} rx={36} ry={6} fill="rgba(8, 8, 8, 0.98)" stroke="rgba(40, 40, 40, 0.7)" strokeWidth={1.2} />
          <ellipse cx={0} cy={standBaseY - 1} rx={36} ry={5} fill="url(#ms-stand)" />
          <ellipse cx={0} cy={standBaseY - 2} rx={28} ry={3.5} fill="rgba(60, 60, 60, 0.55)" />
          <ellipse cx={0} cy={standBaseY - 2} rx={6} ry={1.4} fill="rgba(120, 120, 120, 0.65)" />
          {/* Base highlight */}
          <ellipse cx={-12} cy={standBaseY - 2} rx={4} ry={1} fill={tintCore} opacity={0.5 * spotWarmth} />

          {/* Pole — telescoping segments */}
          <rect x={-2.5} y={standTopY + 60} width={5} height={standBaseY - standTopY - 60} fill="url(#ms-stand)" />
          <rect x={-2.5} y={standTopY + 60} width={5} height={standBaseY - standTopY - 60} fill="none" stroke="rgba(0, 0, 0, 0.85)" strokeWidth={0.6} />
          {/* Telescoping joint */}
          <rect x={-3.5} y={standTopY + 110} width={7} height={4} fill="rgba(60, 60, 60, 0.95)" />
          <rect x={-3.5} y={standTopY + 110} width={7} height={4} fill="none" stroke="rgba(20, 20, 20, 0.85)" strokeWidth={0.4} />
          {/* Lower pole highlight */}
          <line x1={-1} y1={standTopY + 116} x2={-1} y2={standBaseY - 4} stroke={tintCore} strokeWidth={0.5} opacity={0.25 * spotWarmth} />

          {/* Upper pole */}
          <rect x={-2} y={standTopY} width={4} height={62} fill="url(#ms-stand)" />
          <line x1={-0.5} y1={standTopY} x2={-0.5} y2={standTopY + 62} stroke={tintCore} strokeWidth={0.4} opacity={0.30 * spotWarmth} />

          {/* Boom arm joint */}
          <circle cx={0} cy={standTopY} r={4.5} fill="rgba(40, 40, 40, 0.95)" stroke="rgba(20, 20, 20, 0.85)" strokeWidth={0.6} />
          <circle cx={0} cy={standTopY} r={2} fill="rgba(80, 80, 80, 0.85)" />

          {/* Boom arm */}
          <line x1={0} y1={standTopY} x2={48} y2={standTopY - 28} stroke="rgba(40, 40, 40, 0.95)" strokeWidth={4.5} strokeLinecap="round" />
          <line x1={0} y1={standTopY} x2={48} y2={standTopY - 28} stroke="rgba(60, 60, 60, 0.7)" strokeWidth={2.0} strokeLinecap="round" />
          <line x1={0} y1={standTopY} x2={48} y2={standTopY - 28} stroke={tintCore} strokeWidth={0.4} opacity={0.30 * spotWarmth} />

          {/* Counterweight on the back of boom */}
          <line x1={0} y1={standTopY} x2={-18} y2={standTopY + 10} stroke="rgba(40, 40, 40, 0.95)" strokeWidth={3.5} strokeLinecap="round" />
          <ellipse cx={-22} cy={standTopY + 12} rx={4} ry={6} fill="rgba(20, 20, 20, 0.95)" stroke="rgba(60, 60, 60, 0.65)" strokeWidth={0.6} />

          {/* Mic clip + mic */}
          <g transform={`translate(48 ${standTopY - 28})`}>
            {/* Clip */}
            <rect x={-3} y={-2} width={6} height={4} fill="rgba(40, 40, 40, 0.95)" stroke="rgba(20, 20, 20, 0.85)" strokeWidth={0.4} />
            {/* SM7-style mic body */}
            <rect x={-6} y={2} width={12} height={28} rx={2} fill="url(#ms-mic)" stroke="rgba(0, 0, 0, 1)" strokeWidth={0.8} />
            {/* Mic body bands */}
            <rect x={-6} y={6} width={12} height={1} fill="rgba(60, 60, 60, 0.85)" />
            <rect x={-6} y={12} width={12} height={1} fill="rgba(60, 60, 60, 0.85)" />
            <rect x={-6} y={20} width={12} height={1} fill="rgba(60, 60, 60, 0.85)" />
            {/* Grille (top end) */}
            <ellipse cx={0} cy={2} rx={6} ry={3} fill="rgba(20, 20, 20, 0.95)" stroke="rgba(60, 60, 60, 0.7)" strokeWidth={0.5} />
            <ellipse cx={0} cy={1.5} rx={5} ry={2.5} fill="rgba(40, 40, 40, 0.9)" />
            {/* Grille mesh dots */}
            {Array.from({ length: 9 }).map((_, i) => (
              <circle key={`mesh-${i}`} cx={-4 + (i % 3) * 4} cy={0 + Math.floor(i / 3) * 1.4} r={0.4} fill="rgba(80, 80, 80, 0.85)" />
            ))}
            {/* Mic LED / brand mark */}
            <circle cx={0} cy={26} r={0.9} fill={tintCore} opacity={0.7 * micGlow} />
            {/* Onset flash */}
            {micFlash > 0 && (
              <circle cx={0} cy={2} r={10 + micFlash * 6} fill={tintCore} opacity={micFlash * 0.6} style={{ mixBlendMode: "screen" }} />
            )}
          </g>

          {/* XLR cable from mic going down */}
          <path d={`M 50 ${standTopY - 4} Q 60 ${standTopY + 30} 50 ${standTopY + 80} Q 38 ${standTopY + 130} 64 ${standBaseY - 8} Q 80 ${standBaseY - 4} 110 ${standBaseY - 2}`}
            stroke="rgba(0, 0, 0, 0.95)" strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <path d={`M 50 ${standTopY - 4} Q 60 ${standTopY + 30} 50 ${standTopY + 80} Q 38 ${standTopY + 130} 64 ${standBaseY - 8} Q 80 ${standBaseY - 4} 110 ${standBaseY - 2}`}
            stroke="rgba(50, 50, 50, 0.55)" strokeWidth={0.8} fill="none" strokeLinecap="round" />
        </g>

        {/* Halo around mic */}
        <circle cx={cx + 48} cy={standTopY - 28} r={70 * (0.85 + spotWarmth * 0.3) * haloPulse}
          fill="url(#ms-halo)" style={{ mixBlendMode: "screen" }} />

        {/* Dust motes in spotlight */}
        <g style={{ mixBlendMode: "screen" }}>
          {dust.map((d, i) => {
            const t = frame * d.speed * tempoFactor + d.phase;
            const px = (d.x + Math.sin(t * 1.2) * 0.04) * width;
            const py = (d.y + Math.sin(t * 0.6) * 0.02) * height;
            const flicker = 0.5 + Math.sin(t * 2.4) * 0.4;
            return (
              <circle key={`dust-${i}`} cx={px} cy={py} r={d.r * (0.8 + spotWarmth * 0.5)}
                fill={tintCore} opacity={0.4 * flicker * spotWarmth} />
            );
          })}
        </g>

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#ms-vig)" />
      </svg>
    </div>
  );
};
