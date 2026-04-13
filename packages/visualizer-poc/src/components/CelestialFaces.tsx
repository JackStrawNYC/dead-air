/**
 * CelestialFaces — Art nouveau sun face and crescent moon face.
 *
 * Sun dominates at energy > 0.2, moon at energy < 0.1, crossfade between.
 * Sun beams pulse with beatDecay. Moon gets tiny star dots at low energy.
 * Slow rotation. Ancient, celestial art nouveau feel.
 *
 * Audio reactivity:
 *   energy       -> sun/moon crossfade
 *   beatDecay    -> sun beam pulse
 *   slowEnergy   -> atmosphere glow
 *   chromaHue    -> palette shift
 *   tempoFactor  -> rotation speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const BEAM_COUNT = 16;

interface Props {
  frames: EnhancedFrameData[];
}

export const CelestialFaces: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.40;
  if (masterOpacity < 0.01) return null;

  const baseSize = Math.min(width, height) * 0.55;
  const cx = 200;
  const cy = 200;
  const hue = snap.chromaHue;

  // Crossfade: sun vs moon
  const sunOpacity = interpolate(snap.energy, [0.05, 0.25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const moonOpacity = interpolate(snap.energy, [0.05, 0.20], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const rotation = (frame / 30) * 0.4 * tempoFactor;

  // Sun colors
  const sunHue = ((40 + (hue - 180) * 0.2) % 360 + 360) % 360;
  const sunFill = `hsl(${sunHue}, 70%, 55%)`;
  const sunGlow = `hsla(${sunHue}, 80%, 65%, ${0.3 + snap.slowEnergy * 0.3})`;
  const beamColor = `hsl(${sunHue + 5}, 75%, 60%)`;

  // Moon colors
  const moonHue = ((220 + (hue - 180) * 0.15) % 360 + 360) % 360;
  const moonFill = `hsl(${moonHue}, 15%, 75%)`;
  const moonGlow = `hsla(${moonHue}, 20%, 80%, ${0.25 + snap.slowEnergy * 0.2})`;
  const starColor = `hsla(${moonHue + 40}, 25%, 85%, `;

  const beamPulse = 1 + snap.beatDecay * 0.25;
  const sunR = 40;
  const moonR = 36;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg
        width={baseSize}
        height={baseSize}
        viewBox="0 0 400 400"
        fill="none"
        style={{ opacity: masterOpacity, transform: `rotate(${rotation}deg)`, willChange: "transform, opacity" }}
      >
        <defs>
          <radialGradient id="cf-sun-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={sunGlow} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="cf-moon-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={moonGlow} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="cf-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ===== Sun ===== */}
        <g opacity={sunOpacity} filter="url(#cf-glow)">
          {/* Glow */}
          <circle cx={cx} cy={cy} r={sunR * 2.5} fill="url(#cf-sun-glow)" />

          {/* Radiating beams — triangular */}
          {Array.from({ length: BEAM_COUNT }, (_, i) => {
            const angle = (i / BEAM_COUNT) * Math.PI * 2;
            const innerR = sunR + 4;
            const outerR = (sunR + 30 + (i % 2) * 15) * beamPulse;
            const halfAng = (Math.PI / BEAM_COUNT) * 0.45;
            const x1 = cx + Math.cos(angle - halfAng) * innerR;
            const y1 = cy + Math.sin(angle - halfAng) * innerR;
            const x2 = cx + Math.cos(angle) * outerR;
            const y2 = cy + Math.sin(angle) * outerR;
            const x3 = cx + Math.cos(angle + halfAng) * innerR;
            const y3 = cy + Math.sin(angle + halfAng) * innerR;
            return (
              <path
                key={`beam-${i}`}
                d={`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} Z`}
                fill={beamColor}
                opacity={0.6 + Math.sin(frame * 0.04 + i) * 0.15}
              />
            );
          })}

          {/* Sun disc */}
          <circle cx={cx} cy={cy} r={sunR} fill={sunFill} />

          {/* Face features — art nouveau style */}
          {/* Eyes — almond shapes */}
          <ellipse cx={cx - 14} cy={cy - 6} rx={6} ry={3.5} fill="none" stroke={`hsl(${sunHue}, 50%, 35%)`} strokeWidth={1.2} />
          <ellipse cx={cx + 14} cy={cy - 6} rx={6} ry={3.5} fill="none" stroke={`hsl(${sunHue}, 50%, 35%)`} strokeWidth={1.2} />
          <circle cx={cx - 13} cy={cy - 5.5} r={1.8} fill={`hsl(${sunHue}, 50%, 30%)`} />
          <circle cx={cx + 15} cy={cy - 5.5} r={1.8} fill={`hsl(${sunHue}, 50%, 30%)`} />
          {/* Nose */}
          <path d={`M ${cx} ${cy - 2} L ${cx - 3} ${cy + 5} Q ${cx} ${cy + 6} ${cx + 3} ${cy + 5}`} stroke={`hsl(${sunHue}, 45%, 40%)`} strokeWidth={0.8} fill="none" />
          {/* Serene smile */}
          <path d={`M ${cx - 10} ${cy + 10} Q ${cx} ${cy + 16} ${cx + 10} ${cy + 10}`} stroke={`hsl(${sunHue}, 50%, 35%)`} strokeWidth={1} fill="none" />
        </g>

        {/* ===== Moon ===== */}
        <g opacity={moonOpacity} filter="url(#cf-glow)">
          {/* Glow */}
          <circle cx={cx} cy={cy} r={moonR * 2} fill="url(#cf-moon-glow)" />

          {/* Crescent — circle minus inner circle offset */}
          <circle cx={cx} cy={cy} r={moonR} fill={moonFill} />
          <circle cx={cx + 12} cy={cy - 4} r={moonR - 4} fill="rgba(0,0,0,0.85)" />

          {/* Moon face on visible crescent */}
          <circle cx={cx - 10} cy={cy - 4} r={2} fill={`hsl(${moonHue}, 12%, 55%)`} />
          <path d={`M ${cx - 16} ${cy + 6} Q ${cx - 12} ${cy + 10} ${cx - 8} ${cy + 7}`} stroke={`hsl(${moonHue}, 12%, 55%)`} strokeWidth={0.8} fill="none" />

          {/* Stars around moon at low energy */}
          {snap.energy < 0.15 && Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * Math.PI * 2 + frame * 0.002;
            const dist = moonR * 1.6 + (i % 3) * 15;
            const sx = cx + Math.cos(angle) * dist;
            const sy = cy + Math.sin(angle) * dist;
            const twinkle = 0.4 + Math.sin(frame * 0.06 + i * 2.1) * 0.4;
            return (
              <circle
                key={`star-${i}`}
                cx={sx}
                cy={sy}
                r={1 + (i % 2) * 0.5}
                fill={`${starColor}${twinkle.toFixed(2)})`}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
