/**
 * SacredGeometryOverlay — Flower of life from interlocking circles.
 *
 * Rings appear one at a time as energy builds. Pulses with beatDecay.
 * Slow rotation with time. Glows brighter at high energy.
 * Thin stroked circles, not filled. Chroma-hue tinted.
 *
 * Audio reactivity:
 *   energy       -> ring count (1-7)
 *   beatDecay    -> radius pulse
 *   slowEnergy   -> glow intensity
 *   chromaHue    -> palette tint
 *   tempoFactor  -> rotation speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

interface Props {
  frames: EnhancedFrameData[];
}

export const SacredGeometryOverlay: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.4;
  if (masterOpacity < 0.01) return null;

  const baseSize = Math.min(width, height) * 0.7;
  const cx = 200;
  const cy = 200;
  const baseR = 36;

  const ringCount = 1 + Math.floor(snap.energy * 6);
  const pulse = 1 + snap.beatDecay * 0.12;
  const rotation = (frame / 30) * 0.6 * tempoFactor;
  const hue = snap.chromaHue;
  const glowStd = interpolate(snap.slowEnergy, [0.02, 0.4], [2, 8], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const strokeColor = `hsla(${hue}, 55%, 65%, 0.7)`;
  const glowColor = `hsla(${hue}, 60%, 50%, 0.4)`;

  // Flower of life: center circle + 6 surrounding at same radius, then outer ring of 12
  const circles: { x: number; y: number; r: number }[] = [];

  // Center
  circles.push({ x: cx, y: cy, r: baseR * pulse });

  // Inner ring of 6
  if (ringCount >= 2) {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const reveal = interpolate(ringCount, [2, 4], [Math.max(1, i + 1) / 6, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      if (reveal > i / 6) {
        circles.push({
          x: cx + Math.cos(angle) * baseR * pulse,
          y: cy + Math.sin(angle) * baseR * pulse,
          r: baseR * pulse,
        });
      }
    }
  }

  // Outer ring of 12
  if (ringCount >= 5) {
    const outerR = baseR * 2;
    const count = Math.min(12, (ringCount - 4) * 4);
    for (let i = 0; i < count; i++) {
      const angle = (i / 12) * Math.PI * 2 + Math.PI / 12;
      circles.push({
        x: cx + Math.cos(angle) * outerR * pulse,
        y: cy + Math.sin(angle) * outerR * pulse,
        r: baseR * pulse,
      });
    }
  }

  // Outer bounding circle
  if (ringCount >= 3) {
    circles.push({ x: cx, y: cy, r: baseR * 2 * pulse });
  }
  if (ringCount >= 6) {
    circles.push({ x: cx, y: cy, r: baseR * 3 * pulse });
  }

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
          <filter id="sg-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={glowStd} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#sg-glow)">
          {circles.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={c.r}
              stroke={i < 2 ? strokeColor : glowColor}
              strokeWidth={i < 2 ? 1.2 : 0.8}
              fill="none"
              opacity={interpolate(i, [0, circles.length], [1, 0.5], { extrapolateRight: "clamp" })}
            />
          ))}
          {/* Seed of life inner petals — vesica piscis intersections */}
          {ringCount >= 3 && Array.from({ length: 6 }, (_, i) => {
            const a1 = (i / 6) * Math.PI * 2;
            const a2 = ((i + 1) / 6) * Math.PI * 2;
            const x1 = cx + Math.cos(a1) * baseR * pulse * 0.5;
            const y1 = cy + Math.sin(a1) * baseR * pulse * 0.5;
            const x2 = cx + Math.cos(a2) * baseR * pulse * 0.5;
            const y2 = cy + Math.sin(a2) * baseR * pulse * 0.5;
            return (
              <line key={`v-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={glowColor} strokeWidth={0.5} />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
