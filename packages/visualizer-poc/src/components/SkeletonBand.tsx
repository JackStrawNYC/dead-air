/**
 * SkeletonBand — A+++ overlay: Stealie iconography come to life.
 * Five skeleton musicians on stage in iconic Dead poses: lead guitarist,
 * bassist, drummer, keyboardist, and rhythm guitarist. Stage with lights,
 * roses + bones decorations, tie-dye color palette.
 *
 * Audio reactivity:
 *   slowEnergy → ambient stage glow
 *   energy → skeleton motion intensity
 *   bass → bassist sway
 *   beatDecay → drummer arm beat + glow
 *   onsetEnvelope → cymbal flash
 *   chromaHue → tie-dye palette tint shift
 *   tempoFactor → motion speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const ROSE_COUNT = 14;
const PARTICLE_COUNT = 50;

interface Rose { x: number; y: number; r: number; angle: number; }
interface Particle { x: number; y: number; r: number; speed: number; phase: number; }

function buildRoses(): Rose[] {
  const rng = seeded(20_771_339);
  return Array.from({ length: ROSE_COUNT }, () => ({
    x: 0.05 + rng() * 0.9,
    y: 0.85 + rng() * 0.1,
    r: 6 + rng() * 8,
    angle: rng() * Math.PI,
  }));
}

function buildParticles(): Particle[] {
  const rng = seeded(38_990_445);
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.85,
    r: 0.6 + rng() * 1.6,
    speed: 0.0007 + rng() * 0.0018,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const SkeletonBand: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const roses = React.useMemo(buildRoses, []);
  const particles = React.useMemo(buildParticles, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const stageBright = interpolate(snap.slowEnergy, [0.02, 0.32], [0.5, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const motion = interpolate(snap.energy, [0.02, 0.30], [0.4, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bassRock = interpolate(snap.bass, [0.0, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const drumPulse = 1 + snap.beatDecay * 0.5;
  const cymbalFlash = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Tie-dye palette — base hue cycles with chromaHue
  const baseHue = 280;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.50) % 360 + 360) % 360;
  const tintLight = 60 + stageBright * 16;
  const tintColor = `hsl(${tintHue}, 78%, ${tintLight}%)`;
  const tintCore = `hsl(${tintHue}, 92%, ${Math.min(96, tintLight + 22)}%)`;
  const tintAlt = `hsl(${(tintHue + 60) % 360}, 78%, ${tintLight}%)`;
  const tintAlt2 = `hsl(${(tintHue + 120) % 360}, 78%, ${tintLight}%)`;
  const boneColor = "rgba(240, 230, 200, 0.95)";
  const boneShadow = "rgba(140, 130, 100, 0.65)";

  // Stage layout
  const stageY = height * 0.78;
  const horizonY = height * 0.50;

  // Skeleton band positions (5 figures)
  const positions = [
    { x: width * 0.50, type: "lead", scale: 1.0 },
    { x: width * 0.30, type: "rhythm", scale: 1.0 },
    { x: width * 0.70, type: "bass", scale: 1.0 },
    { x: width * 0.85, type: "drums", scale: 0.95 },
    { x: width * 0.15, type: "keys", scale: 0.95 },
  ];

  // Skeleton renderer
  const renderSkeleton = (sx: number, baseY: number, type: string, scale: number, idx: number) => {
    const sway = Math.sin(frame * 0.05 * tempoFactor + idx * 1.3) * 3 * motion;
    const headR = 14 * scale;
    const headCY = baseY - 110 * scale;
    const ribTopY = headCY + headR + 4;
    const ribBotY = ribTopY + 36 * scale;
    const pelvisY = ribBotY + 12 * scale;
    const legBotY = baseY;

    return (
      <g key={`skel-${idx}`} transform={`translate(${sway} 0)`}>
        {/* Skull */}
        <ellipse cx={sx} cy={headCY} rx={headR} ry={headR * 1.05} fill={boneColor} stroke={boneShadow} strokeWidth={0.8} />
        <path d={`M ${sx - headR + 2} ${headCY + headR * 0.4} Q ${sx} ${headCY + headR + 4} ${sx + headR - 2} ${headCY + headR * 0.4}`}
          fill="none" stroke={boneShadow} strokeWidth={1} />
        {/* Eye sockets */}
        <ellipse cx={sx - headR * 0.35} cy={headCY - 1} rx={headR * 0.25} ry={headR * 0.30} fill="rgba(20, 8, 30, 0.95)" />
        <ellipse cx={sx + headR * 0.35} cy={headCY - 1} rx={headR * 0.25} ry={headR * 0.30} fill="rgba(20, 8, 30, 0.95)" />
        <circle cx={sx - headR * 0.35} cy={headCY - 1} r={1.2} fill={tintCore} opacity={0.7 + motion * 0.3} />
        <circle cx={sx + headR * 0.35} cy={headCY - 1} r={1.2} fill={tintCore} opacity={0.7 + motion * 0.3} />
        {/* Nose */}
        <path d={`M ${sx} ${headCY + 2} L ${sx - 1.5} ${headCY + 5} L ${sx + 1.5} ${headCY + 5} Z`} fill="rgba(20, 8, 30, 0.85)" />
        {/* Teeth */}
        <line x1={sx - 6} y1={headCY + 8} x2={sx + 6} y2={headCY + 8} stroke={boneShadow} strokeWidth={0.6} />
        {Array.from({ length: 5 }).map((_, i) => (
          <line key={`tooth-${i}`} x1={sx - 5 + i * 2.5} y1={headCY + 8} x2={sx - 5 + i * 2.5} y2={headCY + 11} stroke={boneShadow} strokeWidth={0.4} />
        ))}

        {/* Spine */}
        <line x1={sx} y1={ribTopY} x2={sx} y2={pelvisY} stroke={boneColor} strokeWidth={2} strokeLinecap="round" />
        {Array.from({ length: 6 }).map((_, i) => (
          <circle key={`vert-${i}`} cx={sx} cy={ribTopY + 4 + i * 6} r={1.2} fill={boneShadow} />
        ))}

        {/* Ribcage */}
        {Array.from({ length: 5 }).map((_, i) => {
          const ry = ribTopY + 4 + i * 6;
          const widthAtY = (16 - Math.abs(i - 2) * 2) * scale;
          return (
            <path key={`rib-${i}`}
              d={`M ${sx} ${ry} Q ${sx - widthAtY} ${ry + 1} ${sx - widthAtY} ${ry + 4} M ${sx} ${ry} Q ${sx + widthAtY} ${ry + 1} ${sx + widthAtY} ${ry + 4}`}
              stroke={boneColor} strokeWidth={1.3} fill="none" strokeLinecap="round" />
          );
        })}

        {/* Pelvis */}
        <path d={`M ${sx - 14 * scale} ${pelvisY} Q ${sx} ${pelvisY + 6 * scale} ${sx + 14 * scale} ${pelvisY} L ${sx + 10 * scale} ${pelvisY + 12 * scale} L ${sx - 10 * scale} ${pelvisY + 12 * scale} Z`}
          fill="rgba(220, 210, 180, 0.85)" stroke={boneShadow} strokeWidth={0.8} />

        {/* Legs */}
        <line x1={sx - 7 * scale} y1={pelvisY + 12 * scale} x2={sx - 9 * scale} y2={legBotY - 6} stroke={boneColor} strokeWidth={2.4} strokeLinecap="round" />
        <line x1={sx + 7 * scale} y1={pelvisY + 12 * scale} x2={sx + 9 * scale} y2={legBotY - 6} stroke={boneColor} strokeWidth={2.4} strokeLinecap="round" />
        <ellipse cx={sx - 9 * scale} cy={legBotY - 2} rx={5 * scale} ry={2.4} fill={boneColor} stroke={boneShadow} strokeWidth={0.6} />
        <ellipse cx={sx + 9 * scale} cy={legBotY - 2} rx={5 * scale} ry={2.4} fill={boneColor} stroke={boneShadow} strokeWidth={0.6} />
        <circle cx={sx - 8 * scale} cy={pelvisY + 30 * scale} r={2} fill={boneColor} stroke={boneShadow} strokeWidth={0.5} />
        <circle cx={sx + 8 * scale} cy={pelvisY + 30 * scale} r={2} fill={boneColor} stroke={boneShadow} strokeWidth={0.5} />

        {/* Type-specific arms + instruments */}
        {type === "lead" && (
          <g>
            <line x1={sx + 14 * scale} y1={ribTopY + 4} x2={sx + 28 * scale + Math.sin(frame * 0.4) * 3} y2={ribBotY + 4} stroke={boneColor} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={sx + 28 * scale + Math.sin(frame * 0.4) * 3} y1={ribBotY + 4} x2={sx + 22 * scale + Math.sin(frame * 0.4) * 3} y2={ribBotY + 22} stroke={boneColor} strokeWidth={2} strokeLinecap="round" />
            <line x1={sx - 14 * scale} y1={ribTopY + 4} x2={sx - 26 * scale} y2={ribBotY + 2} stroke={boneColor} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={sx - 26 * scale} y1={ribBotY + 2} x2={sx - 36 * scale} y2={ribBotY - 6} stroke={boneColor} strokeWidth={2} strokeLinecap="round" />
            <ellipse cx={sx + 6 * scale} cy={ribBotY + 8} rx={20 * scale} ry={14 * scale} fill={tintAlt} stroke="rgba(0, 0, 0, 0.85)" strokeWidth={1} opacity={0.8} />
            <ellipse cx={sx + 6 * scale} cy={ribBotY + 8} rx={4} ry={3} fill="rgba(0, 0, 0, 0.85)" />
            <rect x={sx - 36 * scale} y={ribBotY + 5} width={36 * scale} height={4} fill={tintColor} opacity={0.85} />
          </g>
        )}

        {type === "rhythm" && (
          <g>
            <line x1={sx + 14 * scale} y1={ribTopY + 4} x2={sx + 26 * scale + Math.sin(frame * 0.3) * 2} y2={ribBotY + 4} stroke={boneColor} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={sx + 26 * scale + Math.sin(frame * 0.3) * 2} y1={ribBotY + 4} x2={sx + 22 * scale} y2={ribBotY + 22} stroke={boneColor} strokeWidth={2} strokeLinecap="round" />
            <line x1={sx - 14 * scale} y1={ribTopY + 4} x2={sx - 26 * scale} y2={ribBotY + 2} stroke={boneColor} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={sx - 26 * scale} y1={ribBotY + 2} x2={sx - 36 * scale} y2={ribBotY - 4} stroke={boneColor} strokeWidth={2} strokeLinecap="round" />
            <ellipse cx={sx + 6 * scale} cy={ribBotY + 8} rx={18 * scale} ry={12 * scale} fill={tintAlt2} stroke="rgba(0, 0, 0, 0.85)" strokeWidth={1} opacity={0.8} />
            <rect x={sx - 36 * scale} y={ribBotY + 5} width={36 * scale} height={3.5} fill={tintColor} opacity={0.85} />
          </g>
        )}

        {type === "bass" && (
          <g transform={`translate(0 ${bassRock * 2 * Math.sin(frame * 0.3)})`}>
            <line x1={sx + 14 * scale} y1={ribTopY + 4} x2={sx + 24 * scale} y2={ribBotY + 6} stroke={boneColor} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={sx + 24 * scale} y1={ribBotY + 6} x2={sx + 18 * scale} y2={ribBotY + 24} stroke={boneColor} strokeWidth={2} strokeLinecap="round" />
            <line x1={sx - 14 * scale} y1={ribTopY + 4} x2={sx - 28 * scale} y2={ribBotY} stroke={boneColor} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={sx - 28 * scale} y1={ribBotY} x2={sx - 42 * scale} y2={ribBotY - 10} stroke={boneColor} strokeWidth={2} strokeLinecap="round" />
            <ellipse cx={sx + 4 * scale} cy={ribBotY + 12} rx={22 * scale} ry={14 * scale} fill={tintColor} stroke="rgba(0, 0, 0, 0.85)" strokeWidth={1} opacity={0.8} />
            <rect x={sx - 42 * scale} y={ribBotY + 5} width={46 * scale} height={4} fill={tintAlt} opacity={0.85} />
          </g>
        )}

        {type === "drums" && (
          <g>
            <line x1={sx - 10 * scale} y1={ribTopY + 6} x2={sx - 24 * scale + Math.sin(frame * 0.7) * 4} y2={ribBotY + 14} stroke={boneColor} strokeWidth={2} strokeLinecap="round" />
            <line x1={sx + 10 * scale} y1={ribTopY + 6} x2={sx + 24 * scale + Math.cos(frame * 0.7) * 4} y2={ribBotY + 14} stroke={boneColor} strokeWidth={2} strokeLinecap="round" />
            <ellipse cx={sx} cy={ribBotY + 30} rx={20 * scale} ry={6} fill="rgba(220, 200, 160, 0.85)" stroke="rgba(80, 60, 30, 0.85)" strokeWidth={1} />
            <ellipse cx={sx} cy={ribBotY + 30} rx={20 * scale} ry={6} fill={tintAlt} opacity={0.4 * drumPulse} />
            <rect x={sx - 20 * scale} y={ribBotY + 30} width={40 * scale} height={14} fill="rgba(80, 60, 30, 0.85)" />
            <ellipse cx={sx + 22 * scale} cy={ribBotY - 6} rx={14 * scale} ry={2} fill="rgba(220, 180, 80, 0.95)" stroke="rgba(120, 90, 20, 0.85)" strokeWidth={0.6} />
            {cymbalFlash > 0 && (
              <ellipse cx={sx + 22 * scale} cy={ribBotY - 6} rx={20 * scale} ry={4} fill={tintCore} opacity={cymbalFlash * 0.6} style={{ mixBlendMode: "screen" }} />
            )}
          </g>
        )}

        {type === "keys" && (
          <g>
            <line x1={sx - 14 * scale} y1={ribTopY + 4} x2={sx - 22 * scale + Math.sin(frame * 0.5) * 2} y2={ribBotY + 14} stroke={boneColor} strokeWidth={2.4} strokeLinecap="round" />
            <line x1={sx + 14 * scale} y1={ribTopY + 4} x2={sx + 22 * scale + Math.cos(frame * 0.5) * 2} y2={ribBotY + 14} stroke={boneColor} strokeWidth={2.4} strokeLinecap="round" />
            <rect x={sx - 32 * scale} y={ribBotY + 14} width={64 * scale} height={10} fill="rgba(20, 14, 8, 0.95)" stroke="rgba(0, 0, 0, 1)" strokeWidth={0.8} />
            {Array.from({ length: 14 }).map((_, i) => (
              <rect key={`wk-${i}`} x={sx - 32 * scale + i * (64 * scale / 14)} y={ribBotY + 16} width={64 * scale / 14 - 0.5} height={8} fill="rgba(240, 230, 200, 0.95)" stroke="rgba(20, 14, 8, 0.7)" strokeWidth={0.3} />
            ))}
            {[1, 2, 4, 5, 6, 8, 9, 11, 12, 13].map((i) => (
              <rect key={`bk-${i}`} x={sx - 32 * scale + i * (64 * scale / 14) - 1} y={ribBotY + 16} width={1.6} height={5} fill="rgba(20, 14, 8, 0.95)" />
            ))}
          </g>
        )}
      </g>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="sb-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#08020e" />
            <stop offset="50%" stopColor="#100a1c" />
            <stop offset="100%" stopColor="#020108" />
          </linearGradient>
          <linearGradient id="sb-stage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(14, 10, 22, 0.95)" />
            <stop offset="100%" stopColor="rgba(2, 1, 6, 0.99)" />
          </linearGradient>
          <linearGradient id="sb-tiedye" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={tintColor} stopOpacity={0.18} />
            <stop offset="50%" stopColor={tintAlt} stopOpacity={0.18} />
            <stop offset="100%" stopColor={tintAlt2} stopOpacity={0.18} />
          </linearGradient>
          <radialGradient id="sb-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
          <radialGradient id="sb-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.6} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <filter id="sb-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Background */}
        <rect width={width} height={height} fill="url(#sb-bg)" />
        {/* Tie-dye wash */}
        <rect width={width} height={height} fill="url(#sb-tiedye)" />

        {/* Truss + lights */}
        <rect x={width * 0.04} y={height * 0.06} width={width * 0.92} height={5} fill="rgba(0, 0, 0, 0.85)" />
        {[0.15, 0.30, 0.42, 0.50, 0.58, 0.70, 0.85].map((px, i) => {
          const lightHue = (tintHue + i * 50) % 360;
          return (
            <g key={`fix-${i}`}>
              <line x1={width * px} y1={height * 0.065} x2={width * px} y2={height * 0.11} stroke="rgba(0, 0, 0, 0.9)" strokeWidth={2} />
              <rect x={width * px - 6} y={height * 0.11} width={12} height={7} fill="rgba(0, 0, 0, 0.95)" />
              <circle cx={width * px} cy={height * 0.12} r={3 + motion * 1.5} fill={`hsl(${lightHue}, 85%, 70%)`} opacity={0.6 + motion * 0.35} />
              <path d={`M ${width * px - 4} ${height * 0.13} L ${width * px - 30} ${height * 0.42} L ${width * px + 30} ${height * 0.42} L ${width * px + 4} ${height * 0.13} Z`}
                fill={`hsl(${lightHue}, 85%, 70%)`} opacity={0.10 * motion} style={{ mixBlendMode: "screen" }} />
            </g>
          );
        })}

        {/* Backdrop */}
        <rect x={0} y={horizonY} width={width} height={stageY - horizonY} fill="rgba(8, 4, 14, 0.8)" />

        {/* Stage floor */}
        <rect x={0} y={stageY} width={width} height={height - stageY} fill="url(#sb-stage)" />
        <rect x={0} y={stageY - 1} width={width} height={2} fill={tintColor} opacity={0.35 * stageBright} />

        {/* Roses on stage edge */}
        {roses.map((r, i) => (
          <g key={`rose-${i}`} transform={`translate(${r.x * width} ${r.y * height}) rotate(${(r.angle * 180) / Math.PI})`}>
            <circle cx={0} cy={0} r={r.r} fill={tintAlt} stroke="rgba(80, 20, 30, 0.85)" strokeWidth={0.8} />
            <circle cx={0} cy={0} r={r.r * 0.7} fill={tintColor} opacity={0.85} />
            <circle cx={0} cy={0} r={r.r * 0.4} fill="rgba(80, 20, 30, 0.85)" />
            <circle cx={-r.r * 0.5} cy={-r.r * 0.3} r={r.r * 0.4} fill={tintAlt} opacity={0.7} />
            <circle cx={r.r * 0.5} cy={-r.r * 0.3} r={r.r * 0.4} fill={tintAlt} opacity={0.7} />
            <line x1={0} y1={r.r} x2={r.r * 0.3} y2={r.r * 3} stroke="rgba(20, 50, 20, 0.85)" strokeWidth={1.2} />
            <ellipse cx={r.r * 0.15} cy={r.r * 2} rx={r.r * 0.3} ry={r.r * 0.7} fill="rgba(20, 50, 20, 0.85)" />
          </g>
        ))}

        {/* Bones strewn between roses */}
        {Array.from({ length: 8 }).map((_, i) => {
          const bx = width * (0.10 + (i * 0.12));
          const by = height * 0.94;
          return (
            <g key={`bone-${i}`} transform={`translate(${bx} ${by}) rotate(${i * 23})`}>
              <line x1={-12} y1={0} x2={12} y2={0} stroke={boneColor} strokeWidth={3} strokeLinecap="round" />
              <circle cx={-12} cy={-2} r={3} fill={boneColor} stroke={boneShadow} strokeWidth={0.5} />
              <circle cx={-12} cy={2} r={3} fill={boneColor} stroke={boneShadow} strokeWidth={0.5} />
              <circle cx={12} cy={-2} r={3} fill={boneColor} stroke={boneShadow} strokeWidth={0.5} />
              <circle cx={12} cy={2} r={3} fill={boneColor} stroke={boneShadow} strokeWidth={0.5} />
            </g>
          );
        })}

        {/* Skeletons */}
        {positions.map((p, i) => renderSkeleton(p.x, stageY - 12, p.type, p.scale, i))}

        {/* Glow halos behind skeletons */}
        {positions.map((p, i) => (
          <circle key={`halo-${i}`} cx={p.x} cy={stageY - 70} r={80 * (0.85 + stageBright * 0.3) * drumPulse}
            fill="url(#sb-halo)" style={{ mixBlendMode: "screen" }} />
        ))}

        {/* Particles */}
        <g style={{ mixBlendMode: "screen" }}>
          {particles.map((p, i) => {
            const t = frame * p.speed * tempoFactor + p.phase;
            const px = (p.x + Math.sin(t * 1.2) * 0.04) * width;
            const py = (p.y + Math.sin(t * 0.6) * 0.02) * height;
            const flicker = 0.5 + Math.sin(t * 2.4) * 0.4;
            const hueOffset = (i * 60) % 360;
            return (
              <circle key={`p-${i}`} cx={px} cy={py} r={p.r * (0.8 + stageBright * 0.4)}
                fill={`hsl(${(tintHue + hueOffset) % 360}, 90%, 80%)`} opacity={0.4 * flicker * stageBright} />
            );
          })}
        </g>

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#sb-vig)" />
      </svg>
    </div>
  );
};
