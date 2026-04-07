/**
 * PrismRainbow — A+++ overlay.
 * A glass prism (large, central) with white light entering one side and split
 * into rainbow colors exiting the other. Detailed prism with internal
 * reflections. Backdrop: dark with light rays.
 *
 * Audio reactivity:
 *   slowEnergy → ambient warmth
 *   energy     → beam brightness
 *   bass       → red band thickness
 *   mids       → green band thickness
 *   highs      → blue/violet thickness
 *   beatDecay  → caustic shimmer
 *   onsetEnvelope → flash
 *   chromaHue  → prism tint
 *   tempoFactor → drift
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const PARTICLE_COUNT = 70;
const STAR_COUNT = 60;

interface Particle {
  baseX: number;
  baseY: number;
  speed: number;
  size: number;
  phase: number;
  hueOffset: number;
}
interface BgStar {
  x: number;
  y: number;
  r: number;
  twinkleSpeed: number;
  phase: number;
}

function buildParticles(): Particle[] {
  const rng = seeded(91_553_119);
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    baseX: rng(),
    baseY: rng(),
    speed: 0.0008 + rng() * 0.0024,
    size: 0.8 + rng() * 2.4,
    phase: rng() * Math.PI * 2,
    hueOffset: rng() * 360,
  }));
}

function buildBgStars(): BgStar[] {
  const rng = seeded(33_447_881);
  return Array.from({ length: STAR_COUNT }, () => ({
    x: rng(),
    y: rng(),
    r: 0.4 + rng() * 1.2,
    twinkleSpeed: 0.02 + rng() * 0.05,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PrismRainbow: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const particles = React.useMemo(buildParticles, []);
  const bgStars = React.useMemo(buildBgStars, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const ambientWarmth = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const beamBright = interpolate(snap.energy, [0.02, 0.32], [0.45, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const redThick = 1 + snap.bass * 0.5;
  const greenThick = 1 + snap.mids * 0.5;
  const blueThick = 1 + snap.highs * 0.5;
  const causticShim = 0.5 + snap.beatDecay * 0.5;
  const flashBurst = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Palette
  const tintHue = ((snap.chromaHue) % 360 + 360) % 360;
  const skyTop = `hsl(${(tintHue + 220) % 360}, 50%, 4%)`;
  const skyMid = `hsl(${(tintHue + 230) % 360}, 50%, 8%)`;
  const skyBot = `hsl(${(tintHue + 200) % 360}, 50%, 12%)`;

  // Hero geometry — central prism (~30% of frame)
  const cx = width / 2;
  const cy = height / 2;
  const prismSize = Math.min(width, height) * 0.32;
  const drift = Math.sin(frame * 0.005 * tempoFactor) * 4;
  const prismRotation = drift * 0.3;

  // Triangle vertices (equilateral)
  const tx0 = cx - prismSize * 0.5;
  const ty0 = cy + prismSize * 0.3;
  const tx1 = cx + prismSize * 0.5;
  const ty1 = cy + prismSize * 0.3;
  const tx2 = cx;
  const ty2 = cy - prismSize * 0.55;

  const trianglePath = `M ${tx0} ${ty0} L ${tx1} ${ty1} L ${tx2} ${ty2} Z`;

  // Incoming white light beam
  const lightStartX = 0;
  const lightStartY = cy + prismSize * 0.0;
  const lightEndX = (tx0 + tx2) / 2;
  const lightEndY = (ty0 + ty2) / 2;

  // Outgoing rainbow beams
  const beamStartX = (tx1 + tx2) / 2;
  const beamStartY = (ty1 + ty2) / 2;
  const beamColors = [
    { color: `hsl(${(tintHue + 0) % 360}, 95%, 60%)`, angle: 0.10, thick: redThick },
    { color: `hsl(${(tintHue + 25) % 360}, 95%, 62%)`, angle: 0.16, thick: redThick * 0.95 },
    { color: `hsl(${(tintHue + 50) % 360}, 95%, 65%)`, angle: 0.22, thick: greenThick * 0.95 },
    { color: `hsl(${(tintHue + 100) % 360}, 90%, 55%)`, angle: 0.28, thick: greenThick },
    { color: `hsl(${(tintHue + 200) % 360}, 90%, 60%)`, angle: 0.34, thick: blueThick },
    { color: `hsl(${(tintHue + 240) % 360}, 80%, 60%)`, angle: 0.40, thick: blueThick * 0.95 },
    { color: `hsl(${(tintHue + 280) % 360}, 80%, 65%)`, angle: 0.46, thick: blueThick * 0.9 },
  ];

  // Background stars
  const starNodes = bgStars.map((s, i) => {
    const t = frame * s.twinkleSpeed + s.phase;
    const tw = 0.55 + Math.sin(t) * 0.4;
    return (
      <circle key={`bs-${i}`} cx={s.x * width} cy={s.y * height}
        r={s.r * (0.85 + tw * 0.3)}
        fill="rgba(255, 255, 255, 0.85)" opacity={0.6 * tw} />
    );
  });

  // Light particles drifting
  const particleNodes = particles.map((p, i) => {
    const t = frame * p.speed + p.phase;
    const drift2 = Math.sin(t * 1.4) * 12;
    const px = p.baseX * width + drift2;
    const py = p.baseY * height + Math.cos(t) * 8;
    const flicker = 0.55 + Math.sin(t * 2.1) * 0.4;
    const hue = (tintHue + p.hueOffset) % 360;
    return (
      <circle key={`p-${i}`} cx={px} cy={py} r={p.size * (0.7 + beamBright * 0.5)}
        fill={`hsl(${hue}, 90%, 78%)`} opacity={0.55 * flicker * ambientWarmth} />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="pr-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <linearGradient id="pr-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.35)" />
            <stop offset="50%" stopColor="rgba(180, 200, 230, 0.20)" />
            <stop offset="100%" stopColor="rgba(80, 100, 130, 0.30)" />
          </linearGradient>
          <linearGradient id="pr-white-beam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0)" />
            <stop offset="50%" stopColor="rgba(255, 255, 255, 0.8)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.95)" />
          </linearGradient>
        </defs>

        <rect width={width} height={height} fill="url(#pr-sky)" />

        {starNodes}

        {/* Floating particles */}
        <g style={{ mixBlendMode: "screen" }}>{particleNodes}</g>

        {/* Incoming white light beam — multi-layer */}
        <g>
          <line x1={lightStartX} y1={lightStartY} x2={lightEndX} y2={lightEndY}
            stroke="rgba(255, 255, 255, 0.10)" strokeWidth={32} strokeLinecap="round"
            opacity={beamBright} />
          <line x1={lightStartX} y1={lightStartY} x2={lightEndX} y2={lightEndY}
            stroke="rgba(255, 255, 255, 0.30)" strokeWidth={14} strokeLinecap="round"
            opacity={beamBright} />
          <line x1={lightStartX} y1={lightStartY} x2={lightEndX} y2={lightEndY}
            stroke="rgba(255, 255, 255, 0.95)" strokeWidth={5} strokeLinecap="round"
            opacity={beamBright} />
        </g>

        {/* Outgoing rainbow beams */}
        {beamColors.map((b, i) => {
          const ang = b.angle;
          const len = width * 0.6;
          const ex = beamStartX + Math.cos(ang) * len;
          const ey = beamStartY + Math.sin(ang) * len;
          const tw = 18 * b.thick;
          return (
            <g key={`beam-${i}`} style={{ mixBlendMode: "screen" }}>
              <line x1={beamStartX} y1={beamStartY} x2={ex} y2={ey}
                stroke={b.color} strokeWidth={tw * 1.4} strokeLinecap="round" opacity={0.10 * beamBright} />
              <line x1={beamStartX} y1={beamStartY} x2={ex} y2={ey}
                stroke={b.color} strokeWidth={tw * 0.8} strokeLinecap="round" opacity={0.40 * beamBright} />
              <line x1={beamStartX} y1={beamStartY} x2={ex} y2={ey}
                stroke={b.color} strokeWidth={tw * 0.3} strokeLinecap="round" opacity={0.85 * beamBright} />
            </g>
          );
        })}

        {/* Prism */}
        <g transform={`rotate(${prismRotation}, ${cx}, ${cy})`}>
          {/* Prism shadow */}
          <path d={trianglePath} fill="rgba(20, 30, 50, 0.25)"
            transform="translate(4, 6)" />

          {/* Glass body */}
          <path d={trianglePath} fill="url(#pr-glass)"
            stroke="rgba(255, 255, 255, 0.6)" strokeWidth={2} />

          {/* Internal caustics — thin diagonal lines */}
          {Array.from({ length: 8 }).map((_, i) => {
            const t = (i / 8 + Math.sin(frame * 0.02 + i) * 0.05) * causticShim;
            const x0 = tx0 + (tx1 - tx0) * t;
            const y0 = ty0 + (ty1 - ty0) * t;
            const x1 = tx2 + (tx1 - tx2) * t;
            const y1 = ty2 + (ty1 - ty2) * t;
            return (
              <line key={`caustic-${i}`} x1={x0} y1={y0} x2={x1} y2={y1}
                stroke={`hsl(${(tintHue + i * 40) % 360}, 80%, 78%)`} strokeWidth={0.8}
                opacity={0.35 + Math.sin(frame * 0.04 + i) * 0.20} />
            );
          })}

          {/* Internal reflections */}
          <line x1={tx0 + 12} y1={ty0 - 4} x2={tx2 + 8} y2={ty2 + 12}
            stroke="rgba(255, 255, 255, 0.4)" strokeWidth={1.8} />
          <line x1={tx1 - 12} y1={ty1 - 4} x2={tx2 - 8} y2={ty2 + 12}
            stroke="rgba(255, 255, 255, 0.4)" strokeWidth={1.8} />

          {/* Beveled edges */}
          <line x1={tx0} y1={ty0} x2={tx1} y2={ty1}
            stroke="rgba(255, 255, 255, 0.85)" strokeWidth={2.4} strokeLinecap="round" />
          <line x1={tx0} y1={ty0} x2={tx2} y2={ty2}
            stroke="rgba(255, 255, 255, 0.85)" strokeWidth={2.4} strokeLinecap="round" />
          <line x1={tx1} y1={ty1} x2={tx2} y2={ty2}
            stroke="rgba(255, 255, 255, 0.85)" strokeWidth={2.4} strokeLinecap="round" />
        </g>

        {/* Refraction point bloom */}
        <circle cx={beamStartX} cy={beamStartY} r={20 + beamBright * 14}
          fill="rgba(255, 255, 255, 0.55)" style={{ mixBlendMode: "screen" }} />
        <circle cx={beamStartX} cy={beamStartY} r={6}
          fill="rgba(255, 255, 255, 1)" />

        {/* Entry point glow */}
        <circle cx={lightEndX} cy={lightEndY} r={14 + beamBright * 10}
          fill="rgba(255, 255, 255, 0.55)" style={{ mixBlendMode: "screen" }} />
        <circle cx={lightEndX} cy={lightEndY} r={5}
          fill="rgba(255, 255, 255, 1)" />

        {/* Flash burst */}
        {flashBurst > 0.1 && (
          <rect x={0} y={0} width={width} height={height}
            fill="rgba(255, 255, 255, 1)" opacity={flashBurst * 0.10} style={{ mixBlendMode: "screen" }} />
        )}
      </svg>
    </div>
  );
};
