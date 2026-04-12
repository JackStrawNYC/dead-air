/**
 * SpiralHypnoDisc — A+++ overlay.
 * A large hypnotic spinning spiral disc (~60% of frame), black/white spiral
 * that rotates with optical illusion zoom. Subtle color shifts. Background
 * goes dark. The spiral is THE focus.
 *
 * Audio reactivity:
 *   slowEnergy → vignette warmth
 *   energy     → rim glow
 *   bass       → zoom pulse
 *   beatDecay  → rotation acceleration
 *   onsetEnvelope → flash burst
 *   chromaHue  → subtle color shift in spiral
 *   tempoFactor → spin rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const SPIRAL_ARMS = 8;
const ARM_SEGMENTS = 60;
const RIM_DOTS = 36;

interface Props {
  frames: EnhancedFrameData[];
}

export const SpiralHypnoDisc: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const vignetteWarmth = interpolate(snap.slowEnergy, [0.02, 0.32], [0.55, 1.15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rimBright = interpolate(snap.energy, [0.02, 0.32], [0.20, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const zoomPulse = 1 + snap.bass * 0.15;
  const spinAccel = 1 + snap.beatDecay * 0.45;
  const flashBurst = snap.onsetEnvelope > 0.5 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Subtle color modulation
  const tintHue = ((snap.chromaHue + frame * 0.5) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 70%, 65%)`;
  const tintBright = `hsl(${tintHue}, 90%, 80%)`;

  // Hero geometry — large
  const cx = width / 2;
  const cy = height / 2;
  const discR = Math.min(width, height) * 0.34 * zoomPulse;
  const spinAngle = (frame * 0.6 * tempoFactor * spinAccel) % 360;

  // Spiral arms — Archimedean
  const armNodes: React.ReactNode[] = [];
  for (let arm = 0; arm < SPIRAL_ARMS; arm++) {
    const armOffset = (arm / SPIRAL_ARMS) * Math.PI * 2;
    const points: string[] = [];
    for (let s = 0; s < ARM_SEGMENTS; s++) {
      const t = s / (ARM_SEGMENTS - 1);
      const r = t * discR;
      const a = armOffset + t * Math.PI * 4;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      points.push(`${s === 0 ? "M" : "L"} ${x} ${y}`);
    }
    const armPath = points.join(" ");
    armNodes.push(
      <g key={`arm-${arm}`}>
        <path d={armPath} stroke="rgba(0, 0, 0, 0.95)" strokeWidth={discR * 0.10} fill="none" strokeLinecap="round" />
        <path d={armPath} stroke="rgba(255, 255, 255, 0.96)" strokeWidth={discR * 0.06} fill="none" strokeLinecap="round" />
        <path d={armPath} stroke={tintColor} strokeWidth={discR * 0.015} fill="none" strokeLinecap="round" opacity={0.55} />
      </g>
    );
  }

  // Counter-rotating rings
  const counterRings: React.ReactNode[] = [];
  for (let r = 0; r < 8; r++) {
    const t = r / 8;
    const ringR = discR * (0.15 + t * 0.85);
    counterRings.push(
      <circle key={`cr-${r}`} cx={0} cy={0} r={ringR}
        fill="none" stroke="rgba(255, 255, 255, 0.4)" strokeWidth={1.0}
        strokeDasharray={`${ringR * 0.04} ${ringR * 0.10}`}
        opacity={0.55} />
    );
  }

  // Rim ornament dots
  const rimNodes: React.ReactNode[] = [];
  for (let r = 0; r < RIM_DOTS; r++) {
    const a = (r / RIM_DOTS) * Math.PI * 2;
    const ringR = discR * 1.05;
    const dx = Math.cos(a) * ringR;
    const dy = Math.sin(a) * ringR;
    rimNodes.push(
      <circle key={`rim-${r}`} cx={dx} cy={dy} r={r % 4 === 0 ? 4 : 2}
        fill={tintBright} opacity={0.85 * rimBright} />
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <radialGradient id="shd-vignette">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="60%" stopColor="rgba(0,0,0,0.55)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.95)" />
          </radialGradient>
          <radialGradient id="shd-warm">
            <stop offset="0%" stopColor={tintColor} stopOpacity={0.35 * vignetteWarmth} />
            <stop offset="40%" stopColor={tintColor} stopOpacity={0.10 * vignetteWarmth} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="shd-rim-glow">
            <stop offset="80%" stopColor="rgba(0,0,0,0)" />
            <stop offset="92%" stopColor={tintColor} stopOpacity={0.6 * rimBright} />
            <stop offset="100%" stopColor={tintBright} stopOpacity={0.95 * rimBright} />
          </radialGradient>
        </defs>

        <rect width={width} height={height} fill="#000" />
        <circle cx={cx} cy={cy} r={discR * 1.6} fill="url(#shd-warm)" />

        <g transform={`translate(${cx}, ${cy}) rotate(${spinAngle})`}>
          <circle r={discR} fill="rgba(245, 245, 250, 0.96)" stroke="#000" strokeWidth={3} />
          {armNodes}
          <g transform={`rotate(${-spinAngle * 1.6})`}>
            {counterRings}
          </g>
          <circle r={discR * 0.06} fill="#000" />
          <circle r={discR * 0.04} fill={tintBright} opacity={0.85} />
        </g>

        <circle cx={cx} cy={cy} r={discR + 4} fill="url(#shd-rim-glow)" />

        <g transform={`translate(${cx}, ${cy})`}>
          {rimNodes}
        </g>

        <circle cx={cx} cy={cy} r={discR + 22} fill="none"
          stroke={tintColor} strokeWidth={1.6} opacity={0.55} strokeDasharray="2 8" />
        <circle cx={cx} cy={cy} r={discR + 36} fill="none"
          stroke={tintColor} strokeWidth={1.0} opacity={0.30} strokeDasharray="1 12" />

        <rect width={width} height={height} fill="url(#shd-vignette)" />

        {flashBurst > 0.1 && (
          <>
            <circle cx={cx} cy={cy} r={discR * (1.4 + flashBurst * 0.6)}
              fill="none" stroke={tintBright} strokeWidth={3} opacity={flashBurst * 0.9} />
            <circle cx={cx} cy={cy} r={discR * (1.7 + flashBurst * 0.8)}
              fill="none" stroke={tintColor} strokeWidth={1.6} opacity={flashBurst * 0.6} />
          </>
        )}
      </svg>
    </div>
  );
};
