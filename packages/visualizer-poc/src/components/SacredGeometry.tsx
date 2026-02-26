/**
 * SacredGeometry — Flower of Life / Metatron's Cube overlay.
 * Rotating sacred geometry pattern that breathes with energy.
 * Neon color cycling. Appears during sustained passages.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1500;    // 50 seconds between appearances
const DURATION = 540;  // 18 seconds visible

interface Props {
  frames: EnhancedFrameData[];
}

export const SacredGeometry: React.FC<Props> = ({ frames }) => {
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

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.04, 0.25], [0.15, 0.45], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const cx = width / 2;
  const cy = height / 2;
  const baseR = Math.min(width, height) * 0.25;
  const breathe = 1 + (energy - 0.1) * 0.4;
  const r = baseR * breathe;

  const rotation = frame * 0.3;
  const innerRotation = -frame * 0.15;

  const hue1 = (frame * 0.7) % 360;
  const hue2 = (hue1 + 120) % 360;
  const hue3 = (hue1 + 240) % 360;
  const color1 = `hsl(${hue1}, 100%, 65%)`;
  const color2 = `hsl(${hue2}, 100%, 65%)`;
  const color3 = `hsl(${hue3}, 100%, 65%)`;

  // Generate Flower of Life: 7 overlapping circles
  const flowerCircles: Array<{ cx: number; cy: number; r: number }> = [
    { cx: 0, cy: 0, r }, // center
  ];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    flowerCircles.push({
      cx: Math.cos(angle) * r,
      cy: Math.sin(angle) * r,
      r,
    });
  }

  // Outer ring of 12
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    flowerCircles.push({
      cx: Math.cos(angle) * r * 1.73,
      cy: Math.sin(angle) * r * 1.73,
      r,
    });
  }

  // Metatron's cube: lines connecting centers of the 7 inner circles
  const metatronLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const innerCenters = flowerCircles.slice(0, 7);
  for (let i = 0; i < innerCenters.length; i++) {
    for (let j = i + 1; j < innerCenters.length; j++) {
      metatronLines.push({
        x1: innerCenters[i].cx,
        y1: innerCenters[i].cy,
        x2: innerCenters[j].cx,
        y2: innerCenters[j].cy,
      });
    }
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 8px ${color1}) drop-shadow(0 0 20px ${color2})`,
        }}
      >
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
          {/* Flower of Life circles */}
          {flowerCircles.map((c, i) => (
            <circle
              key={`flower-${i}`}
              cx={c.cx}
              cy={c.cy}
              r={c.r}
              stroke={i < 7 ? color1 : color2}
              strokeWidth={i < 7 ? 1.5 : 1}
              fill="none"
              opacity={i < 7 ? 0.6 : 0.3}
            />
          ))}

          {/* Metatron's Cube lines (inner rotation) */}
          <g transform={`rotate(${innerRotation})`}>
            {metatronLines.map((l, i) => (
              <line
                key={`meta-${i}`}
                x1={l.x1} y1={l.y1}
                x2={l.x2} y2={l.y2}
                stroke={color3}
                strokeWidth={1}
                opacity={0.35}
              />
            ))}
          </g>

          {/* Center hexagon */}
          <polygon
            points={Array.from({ length: 6 }, (_, i) => {
              const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
              return `${Math.cos(angle) * r * 0.58},${Math.sin(angle) * r * 0.58}`;
            }).join(" ")}
            stroke={color1}
            strokeWidth={1.5}
            fill="none"
            opacity={0.5}
          />

          {/* Inner triangle */}
          <polygon
            points={Array.from({ length: 3 }, (_, i) => {
              const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
              return `${Math.cos(angle) * r * 0.95},${Math.sin(angle) * r * 0.95}`;
            }).join(" ")}
            stroke={color2}
            strokeWidth={1.5}
            fill="none"
            opacity={0.4}
          />

          {/* Inverted triangle */}
          <polygon
            points={Array.from({ length: 3 }, (_, i) => {
              const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
              return `${Math.cos(angle) * r * 0.95},${Math.sin(angle) * r * 0.95}`;
            }).join(" ")}
            stroke={color3}
            strokeWidth={1.5}
            fill="none"
            opacity={0.4}
          />

          {/* Center dot */}
          <circle cx={0} cy={0} r={4 + energy * 8} fill={color1} opacity={0.6} />
        </g>
      </svg>
    </div>
  );
};
