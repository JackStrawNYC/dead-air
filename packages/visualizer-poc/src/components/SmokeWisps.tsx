/**
 * SmokeWisps — Flowing incense/smoke trails drifting across the frame.
 * SVG paths with animated cubic bezier control points that drift horizontally.
 * 4-6 wisps with different speeds. Semi-transparent white/purple tinted.
 * More visible during quieter passages (inverse energy).
 * Wisps use sine waves for vertical undulation.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface WispData {
  /** Starting y position as fraction of height */
  baseY: number;
  /** Horizontal drift speed (px per frame) */
  driftSpeed: number;
  /** Vertical undulation frequency */
  undulateFreq: number;
  /** Vertical undulation amplitude (px) */
  undulateAmp: number;
  /** Phase offset */
  phase: number;
  /** Stroke width */
  strokeWidth: number;
  /** Hue: white-ish to purple-ish */
  hue: number;
  /** Saturation */
  saturation: number;
  /** Control point spread (px) */
  cpSpread: number;
  /** Length of the wisp trail in px */
  trailLength: number;
}

const NUM_WISPS = 5;

function generateWisps(seed: number): WispData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_WISPS }, () => ({
    baseY: 0.2 + rng() * 0.6,
    driftSpeed: 0.3 + rng() * 0.8,
    undulateFreq: 0.008 + rng() * 0.015,
    undulateAmp: 30 + rng() * 80,
    phase: rng() * Math.PI * 2,
    strokeWidth: 2 + rng() * 5,
    hue: 260 + rng() * 40, // purple range: 260-300
    saturation: 20 + rng() * 40,
    cpSpread: 60 + rng() * 120,
    trailLength: 300 + rng() * 400,
  }));
}

// Stagger timing: appears at frame 180 (6 seconds in)
const STAGGER_START = 180;

interface Props {
  frames: EnhancedFrameData[];
}

export const SmokeWisps: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const wisps = React.useMemo(() => generateWisps(19690815), []);

  // Inverse energy: more visible when quiet
  const quietness = 1 - interpolate(energy, [0.04, 0.28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const opacity = interpolate(quietness, [0, 1], [0.03, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * masterFade;

  if (opacity < 0.01) return null;

  // Speed: wisps move slower in loud passages, more languid in quiet
  const speedMult = interpolate(energy, [0.03, 0.3], [1.2, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `blur(3px) drop-shadow(0 0 12px rgba(200, 180, 255, 0.4))`,
        }}
      >
        <defs>
          {wisps.map((wisp, i) => (
            <linearGradient key={`grad-${i}`} id={`smoke-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={`hsla(${wisp.hue}, ${wisp.saturation}%, 85%, 0)`} />
              <stop offset="20%" stopColor={`hsla(${wisp.hue}, ${wisp.saturation}%, 85%, 0.6)`} />
              <stop offset="50%" stopColor={`hsla(${wisp.hue}, ${wisp.saturation}%, 90%, 0.8)`} />
              <stop offset="80%" stopColor={`hsla(${wisp.hue}, ${wisp.saturation}%, 85%, 0.5)`} />
              <stop offset="100%" stopColor={`hsla(${wisp.hue}, ${wisp.saturation}%, 85%, 0)`} />
            </linearGradient>
          ))}
        </defs>
        {wisps.map((wisp, i) => {
          // Stagger each wisp's entrance
          const wispFade = interpolate(
            frame,
            [STAGGER_START + i * 30, STAGGER_START + i * 30 + 90],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          );
          if (wispFade < 0.01) return null;

          const t = frame * speedMult;

          // Head position drifts right then wraps
          const headX = ((t * wisp.driftSpeed + i * (width / NUM_WISPS)) % (width + wisp.trailLength)) - wisp.trailLength * 0.3;
          const tailX = headX - wisp.trailLength;
          const midX1 = tailX + wisp.trailLength * 0.33;
          const midX2 = tailX + wisp.trailLength * 0.66;

          const baseYpx = wisp.baseY * height;

          // Undulating Y positions using sine at different phases along the wisp
          const tailY = baseYpx + Math.sin(t * wisp.undulateFreq + wisp.phase) * wisp.undulateAmp;
          const cp1Y = baseYpx + Math.sin(t * wisp.undulateFreq + wisp.phase + 1.2) * wisp.undulateAmp * 1.3;
          const cp2Y = baseYpx + Math.sin(t * wisp.undulateFreq + wisp.phase + 2.4) * wisp.undulateAmp * 0.9;
          const headY = baseYpx + Math.sin(t * wisp.undulateFreq + wisp.phase + 3.6) * wisp.undulateAmp * 1.1;

          // Control points that add curvature
          const cpOffY1 = Math.cos(t * wisp.undulateFreq * 0.7 + wisp.phase + i) * wisp.cpSpread;
          const cpOffY2 = Math.sin(t * wisp.undulateFreq * 0.5 + wisp.phase * 1.5 + i) * wisp.cpSpread;

          const path = `M ${tailX} ${tailY} C ${midX1} ${cp1Y + cpOffY1}, ${midX2} ${cp2Y + cpOffY2}, ${headX} ${headY}`;

          return (
            <path
              key={i}
              d={path}
              stroke={`url(#smoke-grad-${i})`}
              strokeWidth={wisp.strokeWidth * (0.8 + quietness * 0.5)}
              fill="none"
              strokeLinecap="round"
              opacity={wispFade}
            />
          );
        })}
      </svg>
    </div>
  );
};
