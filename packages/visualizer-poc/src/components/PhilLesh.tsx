/**
 * PhilLesh — A+++ overlay: Phil Lesh on stage with his Alembic bass.
 * Full stage scene with cool blue/purple low-end palette. Phil silhouette
 * with glasses, holding Alembic 4-string with shaped headstock and bridge.
 * Bass amp stack behind him. Subwoofer rumble visualized as ground vibration
 * lines. Mic stand. Stage lights overhead. Subtle finger-picking animation.
 *
 * Audio reactivity:
 *   slowEnergy → ambient stage glow
 *   energy → light fixture intensity
 *   bass → SUBWOOFER GROUND RUMBLE LINES, cabinet pulse, halo size
 *   beatDecay → finger pluck pulse + string vibration amplitude
 *   onsetEnvelope → low-end shockwave flash
 *   chromaHue → blue/purple palette tint shift
 *   tempoFactor → finger pluck rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const RUMBLE_LINE_COUNT = 28;
const STAR_COUNT = 60;
const BG_LIGHT_COUNT = 8;

interface RumbleLine { x: number; y0: number; len: number; phase: number; amp: number; }
interface Star { x: number; y: number; r: number; phase: number; speed: number; }

function buildRumble(): RumbleLine[] {
  const rng = seeded(60_881_233);
  return Array.from({ length: RUMBLE_LINE_COUNT }, () => ({
    x: rng(),
    y0: 0.78 + rng() * 0.18,
    len: 30 + rng() * 90,
    phase: rng() * Math.PI * 2,
    amp: 2 + rng() * 6,
  }));
}

function buildStars(): Star[] {
  const rng = seeded(11_209_338);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.5,
    r: 0.5 + rng() * 1.4,
    phase: rng() * Math.PI * 2,
    speed: 0.005 + rng() * 0.018,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const PhilLesh: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const rumbles = React.useMemo(buildRumble, []);
  const stars = React.useMemo(buildStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio drives
  const ambientGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.5, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fixtureBright = interpolate(snap.energy, [0.02, 0.30], [0.4, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subRumble = interpolate(snap.bass, [0.0, 0.7], [0.15, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pluckPulse = 1 + snap.beatDecay * 0.45;
  const shockwave = snap.onsetEnvelope > 0.55 && snap.bass > 0.3 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.7) : 0;

  // Cool blue/purple base, modulated by chromaHue
  const baseHue = 220; // deep blue
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.40) % 360 + 360) % 360;
  const tintLight = 58 + ambientGlow * 14;
  const tintColor = `hsl(${tintHue}, 72%, ${tintLight}%)`;
  const tintCore = `hsl(${(tintHue + 18) % 360}, 90%, ${Math.min(94, tintLight + 22)}%)`;
  const tintDeep = `hsl(${(tintHue - 10 + 360) % 360}, 80%, 16%)`;

  // Geometry
  const cx = width * 0.5;
  const stageY = height * 0.74;
  const horizonY = height * 0.50;
  const philX = cx + width * 0.08; // stage right
  const philBaseY = stageY - 12;
  const ampX = width * 0.18; // amp behind Phil

  const skyTop = `hsl(${(tintHue) % 360}, 60%, 4%)`;
  const skyMid = `hsl(${(tintHue + 8) % 360}, 50%, 7%)`;

  // Star nodes (overhead lights)
  const starNodes = stars.map((s, i) => {
    const t = frame * s.speed + s.phase;
    const flicker = 0.6 + Math.sin(t * 2.1) * 0.35;
    return (
      <circle key={`star-${i}`} cx={s.x * width} cy={s.y * height} r={s.r * (0.8 + ambientGlow * 0.4)}
        fill={tintCore} opacity={0.4 * flicker * ambientGlow} />
    );
  });

  // Rumble lines emanating from base
  const rumbleNodes = rumbles.map((r, i) => {
    const wave = Math.sin(frame * 0.32 + r.phase) * r.amp * subRumble;
    const rx = r.x * width;
    const ry = r.y0 * height;
    return (
      <g key={`rum-${i}`}>
        <path d={`M ${rx - r.len / 2} ${ry + wave} Q ${rx} ${ry + wave * 0.4 - 4} ${rx + r.len / 2} ${ry + wave}`}
          stroke={tintCore} strokeWidth={1.4} fill="none" opacity={0.18 + subRumble * 0.30} />
        <path d={`M ${rx - r.len / 2} ${ry + wave + 2} Q ${rx} ${ry + wave * 0.4 - 2} ${rx + r.len / 2} ${ry + wave + 2}`}
          stroke={tintColor} strokeWidth={0.6} fill="none" opacity={0.30 + subRumble * 0.30} />
      </g>
    );
  });

  // Phil silhouette
  const philBodyH = 132;
  const torsoTopY = philBaseY - philBodyH;
  const headR = 18;
  const headCY = torsoTopY - headR + 4;
  const pluckOffset = Math.sin(frame * 0.22 * tempoFactor) * 3 * pluckPulse;

  // Alembic bass — long, shaped body, single-cutaway-ish, ornate headstock
  const bassBodyCX = philX + 28;
  const bassBodyCY = philBaseY - 56;
  const bassRotate = -18;

  // String vibration (4 strings, low end)
  const stringVib = (s: number) => Math.sin(frame * 0.55 * tempoFactor + s * 1.6) * (2 + snap.beatDecay * 4 + subRumble * 1.5);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="pl-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={tintDeep} />
          </linearGradient>
          <linearGradient id="pl-stage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(8, 12, 22, 0.95)" />
            <stop offset="100%" stopColor="rgba(2, 4, 12, 0.99)" />
          </linearGradient>
          <radialGradient id="pl-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.85} />
            <stop offset="60%" stopColor={tintColor} stopOpacity={0.18} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="pl-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.6)" />
          </radialGradient>
          <linearGradient id="pl-bass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1a0f04" />
            <stop offset="40%" stopColor="#3a2414" />
            <stop offset="70%" stopColor="#5a3818" />
            <stop offset="100%" stopColor="#160a02" />
          </linearGradient>
          <linearGradient id="pl-shirt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0a18" />
            <stop offset="100%" stopColor="#020208" />
          </linearGradient>
          <linearGradient id="pl-cab" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#08080e" />
            <stop offset="100%" stopColor="#020206" />
          </linearGradient>
          <linearGradient id="pl-spot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.55} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </linearGradient>
          <filter id="pl-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width={width} height={height} fill="url(#pl-sky)" />

        {/* Distant stars / ambient lights */}
        <g style={{ mixBlendMode: "screen" }}>{starNodes}</g>

        {/* Truss + lights */}
        <rect x={width * 0.04} y={height * 0.07} width={width * 0.92} height={5} fill="rgba(0, 0, 0, 0.85)" />
        <rect x={width * 0.04} y={height * 0.07} width={5} height={height * 0.42} fill="rgba(0, 0, 0, 0.85)" />
        <rect x={width * 0.96 - 5} y={height * 0.07} width={5} height={height * 0.42} fill="rgba(0, 0, 0, 0.85)" />
        {Array.from({ length: BG_LIGHT_COUNT }).map((_, i) => {
          const px = 0.10 + (i / (BG_LIGHT_COUNT - 1)) * 0.80;
          return (
            <g key={`fix-${i}`}>
              <line x1={width * px} y1={height * 0.075} x2={width * px} y2={height * 0.12} stroke="rgba(0, 0, 0, 0.9)" strokeWidth={2} />
              <rect x={width * px - 5} y={height * 0.12} width={10} height={7} fill="rgba(0, 0, 0, 0.95)" />
              <circle cx={width * px} cy={height * 0.13} r={2.5 + fixtureBright * 1.5} fill={tintCore} opacity={0.55 + fixtureBright * 0.35} />
              {/* light cone */}
              <path d={`M ${width * px - 4} ${height * 0.13} L ${width * px - 36} ${height * 0.4} L ${width * px + 36} ${height * 0.4} L ${width * px + 4} ${height * 0.13} Z`}
                fill="url(#pl-spot)" opacity={0.18 * fixtureBright} style={{ mixBlendMode: "screen" }} />
            </g>
          );
        })}

        {/* Stage backdrop — dark cyc */}
        <rect x={0} y={horizonY} width={width} height={stageY - horizonY} fill="rgba(4, 6, 14, 0.85)" />
        {Array.from({ length: 18 }).map((_, i) => (
          <line key={`fold-${i}`} x1={(i / 18) * width} y1={horizonY} x2={(i / 18) * width + 6} y2={stageY}
            stroke="rgba(0, 0, 0, 0.55)" strokeWidth={1.2} />
        ))}

        {/* Stage floor */}
        <rect x={0} y={stageY} width={width} height={height - stageY} fill="url(#pl-stage)" />
        <rect x={0} y={stageY - 1} width={width} height={2} fill={tintColor} opacity={0.30 * ambientGlow} />
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={`plank-${i}`} x1={0} y1={stageY + 8 + i * 12} x2={width} y2={stageY + 8 + i * 12}
            stroke="rgba(0, 0, 0, 0.45)" strokeWidth={0.6} />
        ))}

        {/* Bass amp stack behind Phil */}
        <g transform={`translate(${ampX} ${stageY - 280}) translate(0 ${subRumble * 1.5 * Math.sin(frame * 0.6)})`}>
          {/* Top: Alembic preamp */}
          <rect x={-70} y={0} width={140} height={50} fill="url(#pl-cab)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.5} />
          <rect x={-62} y={6} width={124} height={38} fill="none" stroke="rgba(50, 60, 80, 0.45)" strokeWidth={0.8} />
          {Array.from({ length: 8 }).map((_, i) => (
            <circle key={`knob-${i}`} cx={-50 + i * 14} cy={26} r={2.2} fill="rgba(60, 60, 80, 0.85)" />
          ))}
          {Array.from({ length: 4 }).map((_, i) => (
            <circle key={`led-${i}`} cx={-50 + i * 30} cy={14} r={1.2} fill={tintCore} opacity={0.7} />
          ))}

          {/* Mid cabinet */}
          <rect x={-78} y={54} width={156} height={120} fill="url(#pl-cab)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.5} />
          <rect x={-70} y={62} width={140} height={104} fill="none" stroke="rgba(50, 60, 80, 0.45)" strokeWidth={0.8} />
          {[-36, 36].map((dx) => (
            <g key={`mid-${dx}`}>
              <circle cx={dx} cy={92} r={20} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(50, 60, 80, 0.55)" strokeWidth={0.8} />
              <circle cx={dx} cy={92} r={16} fill="none" stroke="rgba(40, 50, 70, 0.55)" strokeWidth={0.6} />
              <circle cx={dx} cy={92} r={5 + subRumble * 1.2} fill="rgba(20, 20, 30, 0.95)" />
              <circle cx={dx} cy={92} r={2} fill={tintCore} opacity={0.5 * subRumble} />
              <circle cx={dx} cy={138} r={20} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(50, 60, 80, 0.55)" strokeWidth={0.8} />
              <circle cx={dx} cy={138} r={16} fill="none" stroke="rgba(40, 50, 70, 0.55)" strokeWidth={0.6} />
              <circle cx={dx} cy={138} r={5 + subRumble * 1.2} fill="rgba(20, 20, 30, 0.95)" />
              <circle cx={dx} cy={138} r={2} fill={tintCore} opacity={0.5 * subRumble} />
            </g>
          ))}

          {/* Sub cabinet */}
          <rect x={-86} y={178} width={172} height={132} fill="url(#pl-cab)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.5} />
          <rect x={-78} y={186} width={156} height={116} fill="none" stroke="rgba(50, 60, 80, 0.45)" strokeWidth={0.8} />
          {/* Single 18" sub */}
          <circle cx={0} cy={244} r={48} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(50, 60, 80, 0.55)" strokeWidth={1.2} />
          <circle cx={0} cy={244} r={42} fill="none" stroke="rgba(40, 50, 70, 0.55)" strokeWidth={0.8} />
          <circle cx={0} cy={244} r={36} fill="none" stroke="rgba(30, 40, 60, 0.45)" strokeWidth={0.6} />
          {Array.from({ length: 24 }).map((_, i) => {
            const a = (i / 24) * Math.PI * 2;
            return (
              <line key={`sub-spoke-${i}`} x1={0 + Math.cos(a) * 14} y1={244 + Math.sin(a) * 14} x2={0 + Math.cos(a) * 36} y2={244 + Math.sin(a) * 36}
                stroke="rgba(40, 50, 70, 0.45)" strokeWidth={0.4} />
            );
          })}
          <circle cx={0} cy={244} r={12 + subRumble * 3} fill="rgba(20, 20, 30, 0.95)" />
          <circle cx={0} cy={244} r={5 + subRumble * 1.5} fill={tintCore} opacity={0.55 * subRumble} />
          <ellipse cx={0} cy={250} rx={50} ry={10} fill={tintCore} opacity={0.10 + subRumble * 0.18} filter="url(#pl-blur)" />
        </g>

        {/* Cable from Phil to amp */}
        <path d={`M ${philX - 14} ${philBaseY - 50} Q ${(philX + ampX) / 2} ${stageY + 14} ${ampX + 30} ${stageY - 100}`}
          stroke="rgba(0, 0, 0, 0.95)" strokeWidth={2.4} fill="none" />
        <path d={`M ${philX - 14} ${philBaseY - 50} Q ${(philX + ampX) / 2} ${stageY + 14} ${ampX + 30} ${stageY - 100}`}
          stroke="rgba(60, 70, 100, 0.55)" strokeWidth={0.7} fill="none" />

        {/* Mic stand */}
        <g transform={`translate(${philX + 70} ${philBaseY - 100})`}>
          <ellipse cx={0} cy={108} rx={18} ry={3} fill="rgba(2, 4, 10, 0.95)" />
          <line x1={0} y1={106} x2={0} y2={4} stroke="rgba(20, 22, 30, 0.95)" strokeWidth={2.2} />
          <line x1={0} y1={4} x2={-22} y2={-4} stroke="rgba(20, 22, 30, 0.95)" strokeWidth={2.2} />
          <ellipse cx={-26} cy={-6} rx={5} ry={9} fill="rgba(8, 10, 18, 0.98)" stroke="rgba(50, 60, 80, 0.7)" strokeWidth={0.8} />
          <ellipse cx={-26} cy={-10} rx={5} ry={4} fill="rgba(60, 70, 100, 0.55)" />
        </g>

        {/* Phil silhouette */}
        <g>
          {/* Legs */}
          <path d={`M ${philX - 14} ${philBaseY - 60} L ${philX - 18} ${philBaseY} L ${philX - 8} ${philBaseY} L ${philX - 4} ${philBaseY - 60} Z`}
            fill="rgba(8, 10, 22, 0.98)" />
          <path d={`M ${philX + 4} ${philBaseY - 60} L ${philX + 8} ${philBaseY} L ${philX + 18} ${philBaseY} L ${philX + 14} ${philBaseY - 60} Z`}
            fill="rgba(8, 10, 22, 0.98)" />

          {/* Torso */}
          <path d={`M ${philX - 30} ${torsoTopY + 12} Q ${philX - 34} ${philBaseY - 80} ${philX - 22} ${philBaseY - 60} L ${philX + 22} ${philBaseY - 60} Q ${philX + 34} ${philBaseY - 80} ${philX + 30} ${torsoTopY + 12} Q ${philX} ${torsoTopY + 4} ${philX - 30} ${torsoTopY + 12} Z`}
            fill="url(#pl-shirt)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1} />

          {/* Arms */}
          <path d={`M ${philX - 28} ${torsoTopY + 18} Q ${philX - 50} ${philBaseY - 80} ${philX - 38} ${philBaseY - 50}`}
            stroke="rgba(40, 50, 70, 0.65)" strokeWidth={9} fill="none" strokeLinecap="round" />
          <path d={`M ${philX + 28} ${torsoTopY + 18} Q ${philX + 38 + pluckOffset} ${philBaseY - 80} ${philX + 30 + pluckOffset} ${philBaseY - 56}`}
            stroke="rgba(40, 50, 70, 0.65)" strokeWidth={9} fill="none" strokeLinecap="round" />

          {/* Head */}
          <ellipse cx={philX} cy={headCY} rx={headR * 0.85} ry={headR} fill="rgba(50, 38, 28, 0.92)" />
          {/* Hair (short, slightly wavy) */}
          <path d={`M ${philX - headR + 1} ${headCY - 4} Q ${philX} ${headCY - headR - 2} ${philX + headR - 1} ${headCY - 4} Q ${philX + headR + 2} ${headCY + 4} ${philX + headR - 4} ${headCY + 8} L ${philX - headR + 4} ${headCY + 8} Q ${philX - headR - 2} ${headCY + 4} ${philX - headR + 1} ${headCY - 4} Z`}
            fill="rgba(40, 30, 18, 0.95)" />
          {/* Glasses (round, Phil's signature) */}
          <circle cx={philX - 6} cy={headCY + 1} r={4} fill="none" stroke="rgba(20, 14, 8, 1)" strokeWidth={1.2} />
          <circle cx={philX + 6} cy={headCY + 1} r={4} fill="none" stroke="rgba(20, 14, 8, 1)" strokeWidth={1.2} />
          <line x1={philX - 2} y1={headCY + 1} x2={philX + 2} y2={headCY + 1} stroke="rgba(20, 14, 8, 1)" strokeWidth={1.0} />
          {/* Lens reflection */}
          <circle cx={philX - 6} cy={headCY + 1} r={3.4} fill={tintCore} opacity={0.20 * ambientGlow} />
          <circle cx={philX + 6} cy={headCY + 1} r={3.4} fill={tintCore} opacity={0.20 * ambientGlow} />
        </g>

        {/* Alembic bass */}
        <g transform={`rotate(${bassRotate}, ${bassBodyCX}, ${bassBodyCY})`}>
          {/* Body — Alembic shape: angular, with point on lower bout */}
          <path d={`M ${bassBodyCX - 38} ${bassBodyCY - 24} Q ${bassBodyCX - 48} ${bassBodyCY - 30} ${bassBodyCX - 56} ${bassBodyCY - 18} Q ${bassBodyCX - 60} ${bassBodyCY} ${bassBodyCX - 50} ${bassBodyCY + 18} Q ${bassBodyCX - 38} ${bassBodyCY + 36} ${bassBodyCX - 14} ${bassBodyCY + 38} L ${bassBodyCX + 22} ${bassBodyCY + 30} Q ${bassBodyCX + 42} ${bassBodyCY + 22} ${bassBodyCX + 48} ${bassBodyCY + 6} Q ${bassBodyCX + 50} ${bassBodyCY - 12} ${bassBodyCX + 38} ${bassBodyCY - 22} Q ${bassBodyCX + 18} ${bassBodyCY - 30} ${bassBodyCX - 4} ${bassBodyCY - 26} Z`}
            fill="url(#pl-bass)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.4} />
          {/* Inner binding */}
          <path d={`M ${bassBodyCX - 36} ${bassBodyCY - 22} Q ${bassBodyCX - 54} ${bassBodyCY - 16} ${bassBodyCX - 56} ${bassBodyCY + 2} Q ${bassBodyCX - 36} ${bassBodyCY + 32} ${bassBodyCX - 12} ${bassBodyCY + 34} L ${bassBodyCX + 20} ${bassBodyCY + 26} Q ${bassBodyCX + 44} ${bassBodyCY + 18} ${bassBodyCX + 46} ${bassBodyCY + 4} Q ${bassBodyCX + 46} ${bassBodyCY - 14} ${bassBodyCX + 30} ${bassBodyCY - 22}`}
            fill="none" stroke="rgba(220, 180, 100, 0.45)" strokeWidth={0.8} />

          {/* Pickups (2 humbuckers — Alembic active) */}
          <rect x={bassBodyCX - 14} y={bassBodyCY - 4} width={28} height={7} rx={1} fill="rgba(40, 40, 50, 0.95)" stroke="rgba(0, 0, 0, 1)" strokeWidth={0.5} />
          <rect x={bassBodyCX - 14} y={bassBodyCY + 8} width={28} height={7} rx={1} fill="rgba(40, 40, 50, 0.95)" stroke="rgba(0, 0, 0, 1)" strokeWidth={0.5} />
          {Array.from({ length: 4 }).map((_, i) => (
            <circle key={`pole-n-${i}`} cx={bassBodyCX - 10 + i * 6} cy={bassBodyCY - 0.5} r={0.9} fill="rgba(180, 160, 120, 0.85)" />
          ))}
          {Array.from({ length: 4 }).map((_, i) => (
            <circle key={`pole-b-${i}`} cx={bassBodyCX - 10 + i * 6} cy={bassBodyCY + 11.5} r={0.9} fill="rgba(180, 160, 120, 0.85)" />
          ))}
          {/* Bridge */}
          <rect x={bassBodyCX + 18} y={bassBodyCY - 6} width={6} height={20} fill="rgba(180, 160, 120, 0.85)" />
          {Array.from({ length: 4 }).map((_, i) => (
            <rect key={`saddle-${i}`} x={bassBodyCX + 19} y={bassBodyCY - 4 + i * 4.5} width={4} height={2.5} fill="rgba(220, 200, 150, 0.85)" />
          ))}
          {/* Knobs (5 — Vol/blend/treble/mid/bass) */}
          {Array.from({ length: 5 }).map((_, i) => (
            <g key={`knob-${i}`}>
              <circle cx={bassBodyCX + 30 + (i % 3) * 6} cy={bassBodyCY + 18 + Math.floor(i / 3) * 7} r={2.4} fill="rgba(40, 40, 50, 0.9)" stroke="rgba(180, 160, 120, 0.55)" strokeWidth={0.4} />
              <circle cx={bassBodyCX + 30 + (i % 3) * 6} cy={bassBodyCY + 18 + Math.floor(i / 3) * 7} r={1.4} fill="rgba(180, 160, 120, 0.7)" />
            </g>
          ))}
          {/* Output jack */}
          <circle cx={bassBodyCX - 14} cy={bassBodyCY + 32} r={2} fill="rgba(180, 160, 120, 0.85)" />

          {/* Neck — long for bass */}
          <rect x={bassBodyCX - 130} y={bassBodyCY - 5} width={74} height={10} fill="rgba(50, 30, 12, 0.98)" stroke="rgba(0, 0, 0, 1)" strokeWidth={0.8} />
          {Array.from({ length: 18 }).map((_, i) => (
            <line key={`fret-${i}`} x1={bassBodyCX - 128 + i * 4.2} y1={bassBodyCY - 5} x2={bassBodyCX - 128 + i * 4.2} y2={bassBodyCY + 5}
              stroke="rgba(220, 200, 140, 0.65)" strokeWidth={0.4} />
          ))}
          {/* Inlays (block — Alembic style) */}
          {[-118, -106, -94, -82, -70, -60].map((dx, i) => (
            <rect key={`inlay-${i}`} x={bassBodyCX + dx} y={bassBodyCY - 1.5} width={3} height={3} fill="rgba(220, 200, 140, 0.85)" />
          ))}

          {/* Strings (4) — vibrating */}
          {Array.from({ length: 4 }).map((_, i) => {
            const y = bassBodyCY - 3 + i * 2;
            return (
              <g key={`s-${i}`}>
                <line x1={bassBodyCX - 130} y1={y + stringVib(i)} x2={bassBodyCX + 22} y2={y}
                  stroke="rgba(220, 200, 160, 0.75)" strokeWidth={0.7 + i * 0.18} />
                <line x1={bassBodyCX - 130} y1={y + stringVib(i)} x2={bassBodyCX + 22} y2={y}
                  stroke={tintCore} strokeWidth={0.3} opacity={0.4 * snap.beatDecay} />
              </g>
            );
          })}

          {/* Headstock — Alembic shaped (4 in line, scrolled) */}
          <path d={`M ${bassBodyCX - 130} ${bassBodyCY - 8} L ${bassBodyCX - 168} ${bassBodyCY - 16} L ${bassBodyCX - 178} ${bassBodyCY - 4} L ${bassBodyCX - 174} ${bassBodyCY + 8} L ${bassBodyCX - 130} ${bassBodyCY + 6} Z`}
            fill="rgba(40, 22, 8, 0.98)" stroke="rgba(0, 0, 0, 1)" strokeWidth={0.8} />
          {/* Tuners (4 in line) */}
          {Array.from({ length: 4 }).map((_, i) => (
            <g key={`tuner-${i}`}>
              <circle cx={bassBodyCX - 138 - i * 8} cy={bassBodyCY - 8 - i * 2} r={2.2} fill="rgba(60, 60, 80, 0.95)" />
              <rect x={bassBodyCX - 142 - i * 8} y={bassBodyCY - 6 - i * 2} width={6} height={2} fill="rgba(180, 160, 120, 0.85)" />
            </g>
          ))}
          {/* Alembic logo dot */}
          <circle cx={bassBodyCX - 134} cy={bassBodyCY + 2} r={1.2} fill={tintCore} opacity={0.7} />
        </g>

        {/* Subwoofer rumble lines (ground vibration visualizer) */}
        <g style={{ mixBlendMode: "screen" }}>{rumbleNodes}</g>

        {/* Phil halo (cool blue glow) */}
        <circle cx={philX} cy={philBaseY - 80} r={140 * (0.85 + ambientGlow * 0.35) * pluckPulse}
          fill="url(#pl-halo)" style={{ mixBlendMode: "screen" }} />

        {/* Bass shockwave */}
        {shockwave > 0 && (
          <>
            <circle cx={ampX} cy={stageY - 36} r={120 + shockwave * 80}
              fill="none" stroke={tintCore} strokeWidth={2 + shockwave * 2} opacity={shockwave * 0.6} style={{ mixBlendMode: "screen" }} />
            <circle cx={ampX} cy={stageY - 36} r={70 + shockwave * 60}
              fill="none" stroke={tintColor} strokeWidth={1.5} opacity={shockwave * 0.45} style={{ mixBlendMode: "screen" }} />
          </>
        )}

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#pl-vig)" />
      </svg>
    </div>
  );
};
