/**
 * LotusBloom — Procedural flower that opens and closes with energy.
 *
 * 14 petals drawn as bezier curves from center. At low energy petals
 * close into bud shape; at high energy full bloom. Individual petals
 * sway with bass. Center glows with vocal presence. Beautiful during
 * ballads. Chroma-hue tinted palette.
 *
 * Audio reactivity:
 *   energy       -> bloom openness
 *   slowEnergy   -> breathing scale
 *   bass         -> petal sway
 *   beatDecay    -> center glow pulse
 *   onsetEnvelope-> petal flutter
 *   chromaHue    -> palette color
 *   tempoFactor  -> rotation speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const PETAL_COUNT = 14;

interface Props {
  frames: EnhancedFrameData[];
}

function petalPath(
  cx: number, cy: number, length: number, width: number, openness: number, sway: number,
): string {
  // openness: 0 = closed bud (petals pointing up), 1 = full bloom (petals spreading out)
  const spread = openness * length * 0.9;
  const tipY = cy - length + spread * 0.4;
  const tipX = cx + sway;
  const cpSpread = width * (0.4 + openness * 0.6);
  return [
    `M ${cx} ${cy}`,
    `C ${cx - cpSpread} ${cy - length * 0.4} ${tipX - width * 0.3} ${tipY + length * 0.1} ${tipX} ${tipY}`,
    `C ${tipX + width * 0.3} ${tipY + length * 0.1} ${cx + cpSpread} ${cy - length * 0.4} ${cx} ${cy}`,
    "Z",
  ].join(" ");
}

export const LotusBloom: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.42;
  if (masterOpacity < 0.01) return null;

  const baseSize = Math.min(width, height) * 0.55;
  const cx = 200;
  const cy = 200;
  const hue = snap.chromaHue;

  // Lotus palette — pinks, magentas, shifting with chroma
  const petalHue = ((hue + 320) % 360);
  const outerColor = `hsl(${petalHue}, 60%, 55%)`;
  const innerColor = `hsl(${(petalHue + 15) % 360}, 70%, 70%)`;
  const centerColor = `hsl(${(petalHue + 40) % 360}, 80%, 75%)`;
  const centerGlow = `hsla(${(petalHue + 40) % 360}, 90%, 85%, ${0.3 + snap.beatDecay * 0.5})`;

  const openness = interpolate(snap.energy, [0.02, 0.35], [0.1, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const breathe = 1 + Math.sin(frame * 0.018 * tempoFactor) * 0.04 * snap.slowEnergy;
  const rotation = (frame / 30) * 0.3 * tempoFactor;

  const glowR = interpolate(snap.beatDecay, [0, 0.5], [8, 24], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg
        width={baseSize}
        height={baseSize}
        viewBox="0 0 400 400"
        fill="none"
        style={{ opacity: masterOpacity, transform: `rotate(${rotation}deg) scale(${breathe})`, willChange: "transform, opacity" }}
      >
        <defs>
          <radialGradient id="lb-center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={centerGlow} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="lb-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={glowR * 0.3} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="lb-petal-outer" cx="50%" cy="90%" r="80%">
            <stop offset="0%" stopColor={outerColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor={innerColor} stopOpacity="0.6" />
          </radialGradient>
          <radialGradient id="lb-petal-inner" cx="50%" cy="85%" r="75%">
            <stop offset="0%" stopColor={innerColor} stopOpacity="0.85" />
            <stop offset="100%" stopColor={centerColor} stopOpacity="0.6" />
          </radialGradient>
        </defs>

        {/* Center glow */}
        <circle cx={cx} cy={cy} r={glowR} fill="url(#lb-center-glow)" />

        <g filter="url(#lb-glow)">
          {/* Outer petals — 8 */}
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * 360;
            const sway = Math.sin(frame * 0.025 + i * 0.8) * snap.bass * 6;
            const flutter = snap.onsetEnvelope > 0.4 ? Math.sin(frame * 0.1 + i) * 2 : 0;
            const pp = petalPath(cx, cy, 75, 24, openness, sway + flutter);
            return (
              <path
                key={`op-${i}`}
                d={pp}
                fill="url(#lb-petal-outer)"
                transform={`rotate(${angle} ${cx} ${cy})`}
                opacity={0.85}
              />
            );
          })}

          {/* Inner petals — 6, shorter, offset rotation */}
          {Array.from({ length: 6 }, (_, i) => {
            const angle = (i / 6) * 360 + 30;
            const sway = Math.sin(frame * 0.03 + i * 1.1) * snap.bass * 4;
            const pp = petalPath(cx, cy, 50, 18, openness * 0.85, sway);
            return (
              <path
                key={`ip-${i}`}
                d={pp}
                fill="url(#lb-petal-inner)"
                transform={`rotate(${angle} ${cx} ${cy})`}
                opacity={0.8}
              />
            );
          })}

          {/* Center pistil dots */}
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const r = 6 + openness * 4;
            const dx = Math.cos(angle) * r;
            const dy = Math.sin(angle) * r;
            return (
              <circle
                key={`pst-${i}`}
                cx={cx + dx}
                cy={cy + dy}
                r={1.5}
                fill={centerColor}
                opacity={0.7 + snap.beatDecay * 0.3}
              />
            );
          })}

          {/* Center dot */}
          <circle cx={cx} cy={cy} r={4} fill={centerColor} opacity={0.9} />
        </g>
      </svg>
    </div>
  );
};
