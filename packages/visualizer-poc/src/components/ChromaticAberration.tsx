/**
 * ChromaticAberration — RGB split effect overlay.
 * Three slightly offset copies of a central geometric shape (large circle / stealie outline)
 * in pure R, G, B channels. Offset distance scales with energy (2px quiet -> 12px loud).
 * Mix-blend-mode: screen. Always visible at low opacity (8-20%).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const ChromaticAberration: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Rolling energy (151-frame window)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Always visible, 8-20% opacity
  const opacity = interpolate(energy, [0, 0.35], [0.08, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Offset distance: 2px quiet -> 12px loud
  const offset = interpolate(energy, [0, 0.4], [2, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow drift angle for the offset direction
  const angle = frame * 0.008;
  const redDx = Math.cos(angle) * offset;
  const redDy = Math.sin(angle) * offset;
  const blueDx = Math.cos(angle + Math.PI * 2 / 3) * offset;
  const blueDy = Math.sin(angle + Math.PI * 2 / 3) * offset;
  const greenDx = Math.cos(angle + Math.PI * 4 / 3) * offset;
  const greenDy = Math.sin(angle + Math.PI * 4 / 3) * offset;

  const cx = width / 2;
  const cy = height / 2;

  // Stealie-like shape: circle with inner "lightning bolt" motif
  const radius = Math.min(width, height) * 0.22;
  const innerR = radius * 0.6;

  // Gentle breathing scale
  const breathe = 1 + Math.sin(frame * 0.03) * 0.04;
  const r = radius * breathe;
  const ir = innerR * breathe;

  // Lightning bolt points (simplified stealie skull line)
  const boltPath = `M ${-ir * 0.15} ${-ir * 0.3} L ${ir * 0.1} ${0} L ${-ir * 0.1} ${0} L ${ir * 0.15} ${ir * 0.3}`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", mixBlendMode: "screen" }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity }}>
        {/* Red channel */}
        <g transform={`translate(${cx + redDx}, ${cy + redDy})`}>
          <circle r={r} fill="none" stroke="rgba(255, 0, 0, 0.7)" strokeWidth={3} />
          <circle r={ir} fill="none" stroke="rgba(255, 0, 0, 0.5)" strokeWidth={2} />
          <path d={boltPath} stroke="rgba(255, 0, 0, 0.6)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          {/* 13-point ring (Stealie reference) */}
          {Array.from({ length: 13 }, (_, i) => {
            const a = (i / 13) * Math.PI * 2 - Math.PI / 2;
            const px = Math.cos(a) * (r + 8);
            const py = Math.sin(a) * (r + 8);
            return <circle key={i} cx={px} cy={py} r={3} fill="rgba(255, 0, 0, 0.5)" />;
          })}
        </g>

        {/* Green channel */}
        <g transform={`translate(${cx + greenDx}, ${cy + greenDy})`}>
          <circle r={r} fill="none" stroke="rgba(0, 255, 0, 0.7)" strokeWidth={3} />
          <circle r={ir} fill="none" stroke="rgba(0, 255, 0, 0.5)" strokeWidth={2} />
          <path d={boltPath} stroke="rgba(0, 255, 0, 0.6)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          {Array.from({ length: 13 }, (_, i) => {
            const a = (i / 13) * Math.PI * 2 - Math.PI / 2;
            const px = Math.cos(a) * (r + 8);
            const py = Math.sin(a) * (r + 8);
            return <circle key={i} cx={px} cy={py} r={3} fill="rgba(0, 255, 0, 0.5)" />;
          })}
        </g>

        {/* Blue channel */}
        <g transform={`translate(${cx + blueDx}, ${cy + blueDy})`}>
          <circle r={r} fill="none" stroke="rgba(0, 0, 255, 0.7)" strokeWidth={3} />
          <circle r={ir} fill="none" stroke="rgba(0, 0, 255, 0.5)" strokeWidth={2} />
          <path d={boltPath} stroke="rgba(0, 0, 255, 0.6)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          {Array.from({ length: 13 }, (_, i) => {
            const a = (i / 13) * Math.PI * 2 - Math.PI / 2;
            const px = Math.cos(a) * (r + 8);
            const py = Math.sin(a) * (r + 8);
            return <circle key={i} cx={px} cy={py} r={3} fill="rgba(0, 0, 255, 0.5)" />;
          })}
        </g>
      </svg>
    </div>
  );
};
