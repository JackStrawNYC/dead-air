/**
 * SpiralGalaxyOverlay — 3 logarithmic spiral arms with star dots.
 *
 * Slow rotation. Star count/brightness from energy. Arm brightness
 * pulses with beatDecay. Color from palette. Vast, cosmic feel.
 *
 * Audio reactivity:
 *   energy       -> star count/brightness
 *   beatDecay    -> arm glow pulse
 *   slowEnergy   -> core glow
 *   bass         -> arm thickness
 *   chromaHue    -> color palette
 *   tempoFactor  -> rotation speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const ARM_COUNT = 3;
const STARS_PER_ARM = 28;
const FIELD_STARS = 40;

interface Props {
  frames: EnhancedFrameData[];
}

export const SpiralGalaxyOverlay: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.38;
  if (masterOpacity < 0.01) return null;

  const baseSize = Math.min(width, height) * 0.65;
  const cx = 200;
  const cy = 200;
  const hue = snap.chromaHue;
  const rotation = (frame / 30) * 0.25 * tempoFactor;

  // Cosmic palette
  const armHue = ((240 + (hue - 180) * 0.2) % 360 + 360) % 360;
  const coreColor = `hsla(${(armHue + 30) % 360}, 60%, 80%, ${0.4 + snap.slowEnergy * 0.4})`;
  const armColor = `hsla(${armHue}, 50%, 60%, `;
  const starColor = `hsla(${(armHue + 60) % 360}, 30%, 85%, `;

  const armPulse = 0.6 + snap.beatDecay * 0.4;
  const armThick = 1.0 + snap.bass * 1.5;
  const starBright = interpolate(snap.energy, [0, 0.3], [0.3, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const coreGlow = interpolate(snap.slowEnergy, [0, 0.3], [6, 18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Build spiral arm paths
  const arms = Array.from({ length: ARM_COUNT }, (_, armIdx) => {
    const armOffset = (armIdx / ARM_COUNT) * Math.PI * 2;
    const points: string[] = [];
    const stars: { x: number; y: number; r: number; alpha: number }[] = [];
    const segments = 80;
    const maxR = 160;
    const tightness = 0.18; // logarithmic spiral tightness

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = armOffset + t * Math.PI * 3.5; // ~1.75 turns
      const r = 8 + maxR * (Math.exp(tightness * t * 10) - 1) / (Math.exp(tightness * 10) - 1);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      points.push(i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `L ${x.toFixed(1)} ${y.toFixed(1)}`);

      // Place stars along arm
      if (i % Math.max(1, Math.floor(segments / STARS_PER_ARM)) === 0) {
        // Scatter slightly off the arm path
        const scatter = 3 + t * 8;
        const sx = x + Math.sin(i * 7.3 + armIdx * 11) * scatter;
        const sy = y + Math.cos(i * 5.1 + armIdx * 13) * scatter;
        const sr = (0.5 + t * 1.5) * starBright;
        const sa = (1 - t * 0.4) * starBright;
        stars.push({ x: sx, y: sy, r: sr, alpha: sa });
      }
    }

    return { path: points.join(" "), stars };
  });

  // Background field stars
  const fieldStarNodes = Array.from({ length: FIELD_STARS }, (_, i) => {
    const seed = i * 97.31;
    const x = (Math.sin(seed * 1.1) * 0.5 + 0.5) * 400;
    const y = (Math.cos(seed * 1.7) * 0.5 + 0.5) * 400;
    const r = 0.3 + (seed % 3) * 0.3;
    const twinkle = 0.3 + Math.sin(frame * 0.04 + seed) * 0.3;
    return (
      <circle key={`fs-${i}`} cx={x} cy={y} r={r} fill={`${starColor}${(twinkle * starBright).toFixed(2)})`} />
    );
  });

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
          <radialGradient id="sg-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={coreColor} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="sg-arm-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Field stars */}
        {fieldStarNodes}

        {/* Core glow */}
        <circle cx={cx} cy={cy} r={coreGlow} fill="url(#sg-core)" />

        {/* Spiral arms */}
        <g filter="url(#sg-arm-glow)">
          {arms.map((arm, ai) => (
            <g key={`arm-${ai}`}>
              {/* Arm path — thin glowing line */}
              <path
                d={arm.path}
                stroke={`${armColor}${(armPulse * 0.5).toFixed(2)})`}
                strokeWidth={armThick}
                fill="none"
                strokeLinecap="round"
              />
              {/* Stars along arm */}
              {arm.stars.map((s, si) => (
                <circle
                  key={`as-${ai}-${si}`}
                  cx={s.x}
                  cy={s.y}
                  r={s.r}
                  fill={`${starColor}${(s.alpha * armPulse).toFixed(2)})`}
                />
              ))}
            </g>
          ))}
        </g>

        {/* Bright core dot */}
        <circle cx={cx} cy={cy} r={3} fill={coreColor} opacity={0.9} />
      </svg>
    </div>
  );
};
