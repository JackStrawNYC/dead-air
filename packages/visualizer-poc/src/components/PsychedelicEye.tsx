/**
 * PsychedelicEye — A+++ overlay.
 * A surreal psychedelic eye — large central iris with kaleidoscopic patterns,
 * multiple colors swirling, fractal pupil, geometric eyelashes. ~60% of frame.
 * Trippy backdrop with concentric color rings.
 *
 * Audio reactivity:
 *   slowEnergy → backdrop shimmer
 *   energy     → iris brightness + lashes
 *   bass       → pupil pulse
 *   beatDecay  → kaleidoscope rotation
 *   onsetEnvelope → ring flash
 *   chromaHue  → all-color tint
 *   tempoFactor → swirl speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const KALEIDO_SLICES = 16;
const IRIS_PATTERN_RINGS = 12;
const LASH_COUNT = 32;
const BG_RING_COUNT = 16;
const PARTICLE_COUNT = 60;

interface Particle {
  baseAngle: number;
  baseRadius: number;
  speed: number;
  size: number;
  phase: number;
  hueOffset: number;
}

function buildParticles(): Particle[] {
  const rng = seeded(38_119_447);
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    baseAngle: rng() * Math.PI * 2,
    baseRadius: 100 + rng() * 360,
    speed: 0.004 + rng() * 0.012,
    size: 1.2 + rng() * 3.2,
    phase: rng() * Math.PI * 2,
    hueOffset: rng() * 360,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PsychedelicEye: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const particles = React.useMemo(buildParticles, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const bgGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const irisBright = interpolate(snap.energy, [0.02, 0.32], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pupilPulse = 1 + snap.bass * 0.45;
  const kaleidoSpin = (frame * 0.4 * tempoFactor + snap.beatDecay * 30) % 360;
  const ringFlash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Trippy palette — multi-hue
  const baseHue = snap.chromaHue;
  const baseHueShifted = (baseHue + frame * 0.4) % 360;

  const c1 = `hsl(${baseHueShifted}, 90%, 55%)`;
  const c2 = `hsl(${(baseHueShifted + 60) % 360}, 90%, 60%)`;
  const c3 = `hsl(${(baseHueShifted + 120) % 360}, 90%, 65%)`;
  const c4 = `hsl(${(baseHueShifted + 180) % 360}, 90%, 60%)`;
  const c5 = `hsl(${(baseHueShifted + 240) % 360}, 90%, 55%)`;
  const c6 = `hsl(${(baseHueShifted + 300) % 360}, 90%, 65%)`;
  const skyTop = `hsl(${(baseHueShifted + 220) % 360}, 60%, 8%)`;
  const skyBot = `hsl(${(baseHueShifted + 160) % 360}, 60%, 14%)`;

  // Hero geometry
  const cx = width / 2;
  const cy = height / 2;
  const eyeR = Math.min(width, height) * 0.30;
  const irisR = eyeR * 0.85;
  const pupilR = irisR * 0.30 * pupilPulse;

  // Background concentric rings
  const bgRings: React.ReactNode[] = [];
  for (let r = 0; r < BG_RING_COUNT; r++) {
    const t = r / BG_RING_COUNT;
    const ringR = eyeR * (1.4 + t * 3.0);
    const hue = (baseHueShifted + r * 30 + frame * 0.6) % 360;
    bgRings.push(
      <circle key={`bgr-${r}`} cx={cx} cy={cy} r={ringR}
        fill="none" stroke={`hsl(${hue}, 80%, 55%)`}
        strokeWidth={3 + Math.sin(frame * 0.04 + r) * 1.8}
        opacity={(0.30 - t * 0.18) * bgGlow} />
    );
  }

  // Floating particles
  const particleNodes = particles.map((p, i) => {
    const t = frame * p.speed + p.phase;
    const a = p.baseAngle + t * 0.5;
    const rad = p.baseRadius + Math.sin(t * 1.4) * 24;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    const flicker = 0.55 + Math.sin(t * 2) * 0.4;
    const hue = (baseHueShifted + p.hueOffset + frame * 0.8) % 360;
    return (
      <circle key={`p-${i}`} cx={px} cy={py} r={p.size * (0.7 + irisBright * 0.5)}
        fill={`hsl(${hue}, 90%, 75%)`} opacity={0.65 * flicker * irisBright} />
    );
  });

  // Kaleidoscope iris slices
  const kaleidoSlices: React.ReactNode[] = [];
  for (let s = 0; s < KALEIDO_SLICES; s++) {
    const a0 = (s / KALEIDO_SLICES) * Math.PI * 2;
    const a1 = ((s + 1) / KALEIDO_SLICES) * Math.PI * 2;
    const x0 = Math.cos(a0) * irisR;
    const y0 = Math.sin(a0) * irisR;
    const x1 = Math.cos(a1) * irisR;
    const y1 = Math.sin(a1) * irisR;
    const hue = (baseHueShifted + s * (360 / KALEIDO_SLICES)) % 360;
    const fill = s % 2 === 0
      ? `hsl(${hue}, 95%, 55%)`
      : `hsl(${hue}, 85%, 70%)`;
    kaleidoSlices.push(
      <path key={`ks-${s}`} d={`M 0 0 L ${x0} ${y0} A ${irisR} ${irisR} 0 0 1 ${x1} ${y1} Z`}
        fill={fill} opacity={0.85} />
    );
  }

  // Iris pattern rings (concentric stylized petals)
  const patternRings: React.ReactNode[] = [];
  for (let r = 0; r < IRIS_PATTERN_RINGS; r++) {
    const ringR = irisR * (0.95 - r / IRIS_PATTERN_RINGS);
    const numPetals = 8 + r * 2;
    const petals: React.ReactNode[] = [];
    for (let p = 0; p < numPetals; p++) {
      const a = (p / numPetals) * Math.PI * 2 + r * 0.1;
      const px = Math.cos(a) * ringR;
      const py = Math.sin(a) * ringR;
      const hue = (baseHueShifted + r * 30 + p * 12 + frame * 0.5) % 360;
      petals.push(
        <circle key={`pr-${r}-${p}`} cx={px} cy={py} r={2 + r * 0.4}
          fill={`hsl(${hue}, 95%, 75%)`} opacity={0.85} />
      );
    }
    patternRings.push(<g key={`prg-${r}`}>{petals}</g>);
  }

  // Eyelashes (geometric)
  const lashNodes: React.ReactNode[] = [];
  for (let l = 0; l < LASH_COUNT; l++) {
    const a = (l / LASH_COUNT) * Math.PI * 2;
    const x0 = Math.cos(a) * eyeR;
    const y0 = Math.sin(a) * eyeR;
    const lashLen = 30 + Math.sin(l * 0.5) * 12;
    const x1 = Math.cos(a) * (eyeR + lashLen);
    const y1 = Math.sin(a) * (eyeR + lashLen);
    const hue = (baseHueShifted + l * 12) % 360;
    lashNodes.push(
      <g key={`lash-${l}`}>
        <line x1={x0} y1={y0} x2={x1} y2={y1}
          stroke={`hsl(${hue}, 90%, 70%)`} strokeWidth={3.4} strokeLinecap="round" opacity={0.5 * irisBright} />
        <line x1={x0} y1={y0} x2={x1} y2={y1}
          stroke={`hsl(${hue}, 90%, 85%)`} strokeWidth={1.4} strokeLinecap="round" />
      </g>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="pe-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <radialGradient id="pe-bg-glow">
            <stop offset="0%" stopColor={c1} stopOpacity={0.5} />
            <stop offset="50%" stopColor={c3} stopOpacity={0.25} />
            <stop offset="100%" stopColor={c5} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="pe-pupil-grad">
            <stop offset="0%" stopColor="#000" />
            <stop offset="60%" stopColor="#080406" />
            <stop offset="80%" stopColor={c4} />
            <stop offset="100%" stopColor={c2} />
          </radialGradient>
          <radialGradient id="pe-iris-base">
            <stop offset="0%" stopColor={c1} />
            <stop offset="50%" stopColor={c3} />
            <stop offset="100%" stopColor={c5} />
          </radialGradient>
        </defs>

        <rect width={width} height={height} fill="url(#pe-sky)" />
        <ellipse cx={cx} cy={cy} rx={width * 0.6} ry={height * 0.6}
          fill="url(#pe-bg-glow)" />

        {bgRings}

        {/* Floating particles */}
        <g style={{ mixBlendMode: "screen" }}>{particleNodes}</g>

        {/* Eye sclera (huge color disc) */}
        <circle cx={cx} cy={cy} r={eyeR + 8} fill={c2} opacity={0.4} />
        <circle cx={cx} cy={cy} r={eyeR} fill="rgba(245, 245, 250, 0.95)" />

        {/* Lashes */}
        <g transform={`translate(${cx}, ${cy})`}>{lashNodes}</g>

        {/* Iris with kaleidoscope */}
        <g transform={`translate(${cx}, ${cy}) rotate(${kaleidoSpin})`}>
          <circle r={irisR} fill="url(#pe-iris-base)" />
          {kaleidoSlices}
          {patternRings}
        </g>

        {/* Outer iris ring */}
        <circle cx={cx} cy={cy} r={irisR} fill="none" stroke={c1} strokeWidth={4} opacity={0.85} />
        <circle cx={cx} cy={cy} r={irisR + 4} fill="none" stroke={c4} strokeWidth={2} opacity={0.6} />

        {/* Pupil */}
        <circle cx={cx} cy={cy} r={pupilR} fill="url(#pe-pupil-grad)" />
        {/* Fractal pupil — small pattern inside */}
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2 + frame * 0.02;
          const r = pupilR * 0.6;
          const hue = (baseHueShifted + i * 45 + frame * 2) % 360;
          return (
            <circle key={`fp-${i}`} cx={cx + Math.cos(a) * r} cy={cy + Math.sin(a) * r} r={pupilR * 0.10}
              fill={`hsl(${hue}, 95%, 78%)`} opacity={0.85} />
          );
        })}
        <circle cx={cx} cy={cy} r={pupilR * 0.25} fill={`hsl(${(baseHueShifted + 180) % 360}, 95%, 80%)`} opacity={0.95} />

        {/* Specular highlight */}
        <circle cx={cx - pupilR * 0.4} cy={cy - pupilR * 0.4} r={pupilR * 0.2} fill="rgba(255, 255, 255, 0.95)" />

        {/* Ring flash burst */}
        {ringFlash > 0.1 && (
          <>
            <circle cx={cx} cy={cy} r={eyeR * (1.4 + ringFlash * 0.6)}
              fill="none" stroke={c1} strokeWidth={4} opacity={ringFlash * 0.9} />
            <circle cx={cx} cy={cy} r={eyeR * (1.7 + ringFlash * 0.8)}
              fill="none" stroke={c4} strokeWidth={2.4} opacity={ringFlash * 0.6} />
          </>
        )}
      </svg>
    </div>
  );
};
