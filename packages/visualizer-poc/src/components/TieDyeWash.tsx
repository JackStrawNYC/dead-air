/**
 * TieDyeWash — full-screen tie-dye spiral overlay.
 * Slowly rotating radial gradient with psychedelic color bands.
 * Colors shift with chroma data, opacity with energy.
 * Uses CSS conic-gradient for zero-cost GPU rendering.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Convert hue (0-1) + saturation + lightness to CSS hsl string */
function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(((h % 1) + 1) % 1 * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const TieDyeWash: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Smooth energy
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Smooth chroma hue
  let chromaSum = 0;
  let chromaCount = 0;
  for (let i = Math.max(0, idx - 20); i <= Math.min(frames.length - 1, idx + 20); i++) {
    const ch = frames[i].chroma;
    let maxI = 0;
    for (let j = 1; j < 12; j++) {
      if (ch[j] > ch[maxI]) maxI = j;
    }
    chromaSum += maxI / 12;
    chromaCount++;
  }
  const hueBase = chromaCount > 0 ? chromaSum / chromaCount : 0;

  // Slow rotation (0.5 degrees per frame = 15 deg/sec)
  const rotation = frame * 0.5;

  // Generate 6 color stops for the tie-dye spiral
  const timeShift = frame * 0.002; // very slow color drift
  const stops = [];
  for (let i = 0; i < 6; i++) {
    const h = hueBase + (i / 6) + timeShift + Math.sin(frame * 0.01 + i) * 0.08;
    const s = 0.8 + energy * 0.2;
    const l = 0.4 + energy * 0.15;
    const pct = Math.round((i / 6) * 100);
    stops.push(`${hsl(h, s, l)} ${pct}%`);
  }
  // Close the loop
  stops.push(`${stops[0].split(" ")[0]} 100%`);

  const conicGradient = `conic-gradient(from ${rotation}deg at 50% 50%, ${stops.join(", ")})`;

  // Opacity: subtle but visible, more during peaks
  const opacity = interpolate(energy, [0.03, 0.3], [0.06, 0.18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Scale slightly larger than viewport for edge coverage during rotation
  const scale = 1.5;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: Math.max(width, height) * scale,
          height: Math.max(width, height) * scale,
          background: conicGradient,
          opacity,
          mixBlendMode: "screen",
          transform: `rotate(${rotation}deg)`,
          willChange: "transform, opacity",
          borderRadius: "50%",
          filter: "blur(30px)",
        }}
      />
    </div>
  );
};
