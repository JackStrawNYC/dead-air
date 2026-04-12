/**
 * EgyptianEye — A+++ overlay.
 * The Eye of Horus / Ra at LARGE scale (~50% of frame). Detailed iris with
 * patterns, pupil with glow, eyebrow markings, winged motif. Egyptian
 * gold/lapis/turquoise palette. Hieroglyphic background.
 *
 * Audio reactivity:
 *   slowEnergy → divine glow
 *   energy     → iris brightness
 *   bass       → pupil pulse
 *   beatDecay  → wing flutter
 *   onsetEnvelope → eye flash
 *   chromaHue  → palette tint
 *   tempoFactor → glyph drift
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const HIEROGLYPH_COUNT = 36;
const SUNRAY_COUNT = 16;
const IRIS_RING_COUNT = 8;

interface Glyph {
  x: number;
  y: number;
  size: number;
  rotation: number;
  type: number;
  driftSpeed: number;
  phase: number;
}

function buildGlyphs(): Glyph[] {
  const rng = seeded(64_119_553);
  return Array.from({ length: HIEROGLYPH_COUNT }, () => ({
    x: rng(),
    y: rng(),
    size: 14 + rng() * 22,
    rotation: rng() * 360,
    type: Math.floor(rng() * 6),
    driftSpeed: 0.0002 + rng() * 0.0005,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const EgyptianEye: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const glyphs = React.useMemo(buildGlyphs, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const divineGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const irisBright = interpolate(snap.energy, [0.02, 0.32], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pupilPulse = 1 + snap.bass * 0.30;
  const wingFlutter = Math.sin(frame * 0.04 * tempoFactor) * (3 + snap.beatDecay * 6);
  const eyeFlash = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Egyptian palette — gold + lapis + turquoise
  const baseHue = 44;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const goldColor = `hsl(${tintHue}, 88%, 60%)`;
  const goldBright = `hsl(${tintHue}, 95%, 78%)`;
  const goldDeep = `hsl(${(tintHue - 6 + 360) % 360}, 70%, 38%)`;
  const lapisColor = `hsl(${(tintHue + 180) % 360}, 70%, 32%)`;
  const lapisDeep = `hsl(${(tintHue + 200) % 360}, 80%, 18%)`;
  const turquoise = `hsl(${(tintHue + 130) % 360}, 60%, 50%)`;
  const skyTop = `hsl(${(tintHue + 220) % 360}, 50%, 6%)`;
  const skyMid = `hsl(${(tintHue + 200) % 360}, 50%, 12%)`;
  const skyBot = `hsl(${(tintHue - 10 + 360) % 360}, 40%, 16%)`;

  // Hero geometry
  const cx = width / 2;
  const cy = height / 2;
  const eyeW = width * 0.50;
  const eyeH = height * 0.30;
  const irisR = Math.min(eyeW, eyeH * 1.2) * 0.42;
  const pupilR = irisR * 0.34 * pupilPulse;

  // Sun rays
  const sunRays: React.ReactNode[] = [];
  for (let r = 0; r < SUNRAY_COUNT; r++) {
    const a = (r / SUNRAY_COUNT) * Math.PI * 2;
    const x2 = Math.cos(a) * width * 0.7;
    const y2 = Math.sin(a) * height * 0.7;
    const w0 = 14 + irisBright * 18;
    sunRays.push(
      <g key={`sr-${r}`}>
        <path d={`M 0 0 L ${x2 - w0 * 0.6} ${y2} L ${x2 + w0 * 0.6} ${y2} Z`} fill={goldColor} opacity={0.07 * irisBright * divineGlow} />
        <path d={`M 0 0 L ${x2 - w0 * 0.32} ${y2} L ${x2 + w0 * 0.32} ${y2} Z`} fill={goldColor} opacity={0.14 * irisBright * divineGlow} />
        <path d={`M 0 0 L ${x2 - w0 * 0.12} ${y2} L ${x2 + w0 * 0.12} ${y2} Z`} fill={goldBright} opacity={0.30 * irisBright * divineGlow} />
      </g>
    );
  }

  // Hieroglyph background
  const glyphNodes = glyphs.map((g, i) => {
    const drift = (g.x + frame * g.driftSpeed * tempoFactor) % 1;
    const gx = drift * width;
    const gy = g.y * height;
    const t = frame * 0.003 + g.phase;
    const op = (0.18 + Math.sin(t) * 0.06) * divineGlow;
    return (
      <g key={`gl-${i}`} transform={`translate(${gx}, ${gy}) rotate(${g.rotation})`} opacity={op}>
        {g.type === 0 && (
          <g stroke={goldColor} strokeWidth={1.6} fill="none">
            <circle cx={0} cy={-g.size * 0.4} r={g.size * 0.3} />
            <line x1={0} y1={-g.size * 0.1} x2={0} y2={g.size * 0.5} />
            <line x1={-g.size * 0.3} y1={g.size * 0.1} x2={g.size * 0.3} y2={g.size * 0.1} />
          </g>
        )}
        {g.type === 1 && (
          <g fill={goldColor} stroke={goldDeep} strokeWidth={0.8}>
            <ellipse cx={0} cy={0} rx={g.size * 0.4} ry={g.size * 0.3} />
            <line x1={-g.size * 0.4} y1={0} x2={-g.size * 0.6} y2={-g.size * 0.4} stroke={goldColor} strokeWidth={1.2} />
            <line x1={g.size * 0.4} y1={0} x2={g.size * 0.6} y2={-g.size * 0.4} stroke={goldColor} strokeWidth={1.2} />
          </g>
        )}
        {g.type === 2 && (
          <path d={`M ${-g.size * 0.4} ${g.size * 0.3} L 0 ${-g.size * 0.4} L ${g.size * 0.4} ${g.size * 0.3} Z`}
            fill="none" stroke={goldColor} strokeWidth={1.4} />
        )}
        {g.type === 3 && (
          <g>
            <circle cx={0} cy={0} r={g.size * 0.25} fill={goldColor} />
            <circle cx={0} cy={0} r={g.size * 0.4} fill="none" stroke={goldColor} strokeWidth={1.2} />
          </g>
        )}
        {g.type === 4 && (
          <path d={`M ${-g.size * 0.3} ${g.size * 0.4} Q 0 0 ${g.size * 0.2} ${-g.size * 0.4}`}
            stroke={goldColor} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        )}
        {g.type === 5 && (
          <path d={`M ${-g.size * 0.4} 0 Q 0 ${-g.size * 0.25} ${g.size * 0.4} 0 Q 0 ${g.size * 0.25} ${-g.size * 0.4} 0 Z`}
            fill="none" stroke={goldColor} strokeWidth={1.2} />
        )}
      </g>
    );
  });

  // Eye outline path (wedjat shape)
  const eyePath = `M ${cx - eyeW * 0.5} ${cy + 6}
    Q ${cx - eyeW * 0.25} ${cy - eyeH * 0.6} ${cx} ${cy - eyeH * 0.5}
    Q ${cx + eyeW * 0.4} ${cy - eyeH * 0.3} ${cx + eyeW * 0.55} ${cy + 4}
    Q ${cx + eyeW * 0.3} ${cy + eyeH * 0.55} ${cx} ${cy + eyeH * 0.5}
    Q ${cx - eyeW * 0.3} ${cy + eyeH * 0.4} ${cx - eyeW * 0.5} ${cy + 6} Z`;

  // Iris rings
  const irisRings: React.ReactNode[] = [];
  for (let r = 0; r < IRIS_RING_COUNT; r++) {
    const ringR = irisR * (1 - r / IRIS_RING_COUNT);
    const sat = 60 + r * 5;
    const lite = 40 + r * 4;
    irisRings.push(
      <circle key={`ir-${r}`} cx={cx} cy={cy} r={ringR}
        fill="none" stroke={`hsl(${(tintHue + 130 + r * 4) % 360}, ${sat}%, ${lite}%)`}
        strokeWidth={1.2} opacity={0.7 + Math.sin(frame * 0.02 + r) * 0.15} />
    );
  }

  // Iris radial spokes
  const spokeNodes: React.ReactNode[] = [];
  for (let s = 0; s < 24; s++) {
    const a = (s / 24) * Math.PI * 2;
    const x0 = cx + Math.cos(a) * pupilR * 1.05;
    const y0 = cy + Math.sin(a) * pupilR * 1.05;
    const x1 = cx + Math.cos(a) * irisR * 0.95;
    const y1 = cy + Math.sin(a) * irisR * 0.95;
    spokeNodes.push(
      <line key={`spoke-${s}`} x1={x0} y1={y0} x2={x1} y2={y1}
        stroke={turquoise} strokeWidth={0.8} opacity={0.55 + Math.sin(frame * 0.02 + s * 0.6) * 0.2} />
    );
  }

  // Eyebrow
  const browPath = `M ${cx - eyeW * 0.55} ${cy - eyeH * 0.55}
    Q ${cx - eyeW * 0.1} ${cy - eyeH * 0.95} ${cx + eyeW * 0.5} ${cy - eyeH * 0.65}`;

  // Wedjat tail
  const tailPath = `M ${cx + eyeW * 0.15} ${cy + eyeH * 0.25}
    Q ${cx + eyeW * 0.10} ${cy + eyeH * 0.55} ${cx + eyeW * 0.0} ${cy + eyeH * 0.65}
    Q ${cx - eyeW * 0.10} ${cy + eyeH * 0.65} ${cx - eyeW * 0.05} ${cy + eyeH * 0.55}`;
  const markPath = `M ${cx - eyeW * 0.05} ${cy + eyeH * 0.22}
    Q ${cx - eyeW * 0.18} ${cy + eyeH * 0.50} ${cx - eyeW * 0.30} ${cy + eyeH * 0.65}`;

  // Wings
  const wingLeft = `M ${cx - eyeW * 0.5} ${cy - eyeH * 0.45 + wingFlutter}
    Q ${cx - eyeW * 0.85} ${cy - eyeH * 0.5} ${cx - eyeW * 1.0} ${cy - eyeH * 0.1 + wingFlutter}
    Q ${cx - eyeW * 0.75} ${cy - eyeH * 0.2} ${cx - eyeW * 0.5} ${cy - eyeH * 0.3} Z`;
  const wingRight = `M ${cx + eyeW * 0.55} ${cy - eyeH * 0.4 + wingFlutter}
    Q ${cx + eyeW * 0.9} ${cy - eyeH * 0.5} ${cx + eyeW * 1.05} ${cy - eyeH * 0.1 + wingFlutter}
    Q ${cx + eyeW * 0.78} ${cy - eyeH * 0.2} ${cx + eyeW * 0.55} ${cy - eyeH * 0.3} Z`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="ee-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="55%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <radialGradient id="ee-iris-grad">
            <stop offset="0%" stopColor={goldBright} />
            <stop offset="40%" stopColor={turquoise} />
            <stop offset="80%" stopColor={lapisColor} />
            <stop offset="100%" stopColor={lapisDeep} />
          </radialGradient>
          <radialGradient id="ee-pupil-grad">
            <stop offset="0%" stopColor="#000" />
            <stop offset="80%" stopColor="#080406" />
            <stop offset="100%" stopColor={lapisDeep} />
          </radialGradient>
          <radialGradient id="ee-divine-glow">
            <stop offset="0%" stopColor={goldBright} stopOpacity={0.6} />
            <stop offset="40%" stopColor={goldColor} stopOpacity={0.20} />
            <stop offset="100%" stopColor={goldColor} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="ee-wing-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={goldBright} />
            <stop offset="100%" stopColor={goldDeep} />
          </linearGradient>
          <linearGradient id="ee-frame-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={goldBright} />
            <stop offset="50%" stopColor={goldColor} />
            <stop offset="100%" stopColor={goldDeep} />
          </linearGradient>
        </defs>

        <rect width={width} height={height} fill="url(#ee-sky)" />
        {glyphNodes}

        <g transform={`translate(${cx}, ${cy})`} style={{ mixBlendMode: "screen" }}>
          {sunRays}
        </g>

        <ellipse cx={cx} cy={cy} rx={eyeW * 0.85} ry={eyeH * 1.0}
          fill="url(#ee-divine-glow)" style={{ mixBlendMode: "screen" }} />

        <path d={wingLeft} fill="url(#ee-wing-grad)" stroke={goldDeep} strokeWidth={1.4} />
        <path d={wingRight} fill="url(#ee-wing-grad)" stroke={goldDeep} strokeWidth={1.4} />
        {Array.from({ length: 7 }).map((_, i) => {
          const t = i / 6;
          return (
            <g key={`wf-${i}`}>
              <line x1={cx - eyeW * 0.5 + t * (-eyeW * 0.45)} y1={cy - eyeH * 0.35 + wingFlutter}
                x2={cx - eyeW * 0.55 + t * (-eyeW * 0.50)} y2={cy - eyeH * 0.05 + wingFlutter * 0.8}
                stroke={goldDeep} strokeWidth={1.2} />
              <line x1={cx + eyeW * 0.55 + t * (eyeW * 0.45)} y1={cy - eyeH * 0.35 + wingFlutter}
                x2={cx + eyeW * 0.60 + t * (eyeW * 0.50)} y2={cy - eyeH * 0.05 + wingFlutter * 0.8}
                stroke={goldDeep} strokeWidth={1.2} />
            </g>
          );
        })}

        <path d={eyePath} fill="rgba(245, 240, 220, 0.95)" stroke={goldDeep} strokeWidth={3.4} />
        <path d={eyePath} fill="none" stroke="url(#ee-frame-grad)" strokeWidth={5} opacity={0.85} />

        <circle cx={cx} cy={cy} r={irisR} fill="url(#ee-iris-grad)" stroke={goldDeep} strokeWidth={2} />
        {irisRings}
        {spokeNodes}

        <circle cx={cx} cy={cy} r={pupilR} fill="url(#ee-pupil-grad)" />
        <circle cx={cx} cy={cy} r={pupilR} fill="none" stroke={goldBright} strokeWidth={1.4} opacity={0.85} />
        <circle cx={cx - pupilR * 0.35} cy={cy - pupilR * 0.35} r={pupilR * 0.28}
          fill="rgba(255, 250, 220, 0.85)" />

        <path d={browPath} stroke={goldDeep} strokeWidth={12} fill="none" strokeLinecap="round" />
        <path d={browPath} stroke={goldColor} strokeWidth={6} fill="none" strokeLinecap="round" />
        <path d={browPath} stroke={goldBright} strokeWidth={2} fill="none" strokeLinecap="round" />

        <path d={tailPath} stroke={goldDeep} strokeWidth={8} fill="none" strokeLinecap="round" />
        <path d={tailPath} stroke={goldColor} strokeWidth={4} fill="none" strokeLinecap="round" />
        <path d={markPath} stroke={goldDeep} strokeWidth={6} fill="none" strokeLinecap="round" />
        <path d={markPath} stroke={goldColor} strokeWidth={3} fill="none" strokeLinecap="round" />

        {eyeFlash > 0.1 && (
          <>
            <circle cx={cx} cy={cy} r={irisR * (1.4 + eyeFlash * 0.6)}
              fill="none" stroke={goldBright} strokeWidth={3} opacity={eyeFlash * 0.9} />
            <circle cx={cx} cy={cy} r={irisR * (1.7 + eyeFlash * 0.8)}
              fill="none" stroke={goldColor} strokeWidth={1.8} opacity={eyeFlash * 0.6} />
          </>
        )}
      </svg>
    </div>
  );
};
