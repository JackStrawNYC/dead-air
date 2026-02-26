/**
 * TunnelVision — Infinite tunnel zoom with neon rings.
 * 15-20 concentric circles/rectangles centered on screen.
 * Scale increases each frame (zoom effect). Rings cycle colors through rainbow.
 * Ring stroke width and spacing pulse with energy.
 * Always visible at 15-40% opacity. Hypnotic inward pull effect.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUM_RINGS = 18;
const RAINBOW = [
  "#FF0040", "#FF4000", "#FF8000", "#FFC000",
  "#FFFF00", "#80FF00", "#00FF40", "#00FFBF",
  "#00BFFF", "#0040FF", "#8000FF", "#FF00BF",
];

interface RingData {
  isRect: boolean;
  baseStroke: number;
  colorOffset: number;
  phaseOffset: number;
}

function generateRings(seed: number): RingData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_RINGS }, () => ({
    isRect: rng() > 0.6,
    baseStroke: 1.5 + rng() * 2.5,
    colorOffset: Math.floor(rng() * RAINBOW.length),
    phaseOffset: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const TunnelVision: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const rings = React.useMemo(() => generateRings(7771), []);

  // Always visible, opacity scales with energy
  const opacity = interpolate(energy, [0, 0.15, 0.35], [0.15, 0.25, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.max(width, height) * 0.55;

  // Zoom speed: rings scroll inward at constant rate, energy speeds it up
  const zoomSpeed = 0.015 + energy * 0.025;
  const zoomPhase = (frame * zoomSpeed) % 1;

  // Spacing pulse with energy
  const spacingPulse = 1 + Math.sin(frame * 0.04) * 0.1 * (1 + energy * 2);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="tunnel-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {rings.map((ring, i) => {
          // Each ring has a normalized position 0..1 that scrolls inward
          const normalizedPos = ((i / NUM_RINGS) + zoomPhase) % 1;
          const radius = normalizedPos * maxRadius * spacingPulse;

          if (radius < 5) return null;

          // Color cycles through rainbow based on ring index + time
          const colorIdx = (ring.colorOffset + Math.floor(frame * 0.03 + i * 0.7)) % RAINBOW.length;
          const color = RAINBOW[colorIdx];

          // Stroke width pulses with energy
          const strokePulse = 1 + Math.sin(frame * 0.06 + ring.phaseOffset) * 0.4 * energy;
          const strokeW = ring.baseStroke * strokePulse * (0.5 + normalizedPos * 0.8);

          // Inner rings brighter (closer = more intense)
          const ringOpacity = interpolate(normalizedPos, [0, 0.3, 1], [0.9, 0.7, 0.3], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          if (ring.isRect) {
            const halfW = radius * (width / height);
            const halfH = radius;
            return (
              <rect
                key={i}
                x={cx - halfW}
                y={cy - halfH}
                width={halfW * 2}
                height={halfH * 2}
                rx={8}
                fill="none"
                stroke={color}
                strokeWidth={strokeW}
                opacity={ringOpacity}
                filter="url(#tunnel-glow)"
              />
            );
          }

          return (
            <ellipse
              key={i}
              cx={cx}
              cy={cy}
              rx={radius * (width / height) * 0.7}
              ry={radius * 0.7}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
              opacity={ringOpacity}
              filter="url(#tunnel-glow)"
            />
          );
        })}
      </svg>
    </div>
  );
};
