/**
 * KaleidoscopeFilter — Kaleidoscope-style repeating geometric patterns.
 * 8-fold symmetry with mirrored SVG wedges containing small geometric shapes
 * (circles, triangles, diamonds). Patterns rotate slowly, scale with energy.
 * Appears every 60s for 12s. Neon rainbow colors cycling.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

// ── SHAPE DATA ──────────────────────────────────────────────────

const CYCLE = 1800; // 60 seconds
const DURATION = 360; // 12 seconds
const FOLDS = 8;

interface ShapeData {
  type: "circle" | "triangle" | "diamond";
  dist: number; // distance from center (0-1)
  angle: number; // angle within wedge
  size: number;
  hueOffset: number;
}

const NUM_SHAPES_PER_WEDGE = 7;

function generateWedgeShapes(seed: number): ShapeData[] {
  const rng = seeded(seed);
  const types: ShapeData["type"][] = ["circle", "triangle", "diamond"];
  return Array.from({ length: NUM_SHAPES_PER_WEDGE }, () => ({
    type: types[Math.floor(rng() * types.length)],
    dist: 0.15 + rng() * 0.75,
    angle: rng() * (Math.PI * 2 / FOLDS) * 0.8,
    size: 4 + rng() * 12,
    hueOffset: rng() * 120,
  }));
}

function renderShape(
  type: ShapeData["type"],
  x: number,
  y: number,
  size: number,
  color: string,
  opacity: number,
  key: string
): React.ReactElement {
  switch (type) {
    case "circle":
      return <circle key={key} cx={x} cy={y} r={size} fill={color} opacity={opacity} />;
    case "triangle": {
      const h = size * 1.5;
      return (
        <polygon
          key={key}
          points={`${x},${y - h / 2} ${x - size},${y + h / 2} ${x + size},${y + h / 2}`}
          fill={color}
          opacity={opacity}
        />
      );
    }
    case "diamond":
      return (
        <polygon
          key={key}
          points={`${x},${y - size} ${x + size * 0.7},${y} ${x},${y + size} ${x - size * 0.7},${y}`}
          fill={color}
          opacity={opacity}
        />
      );
  }
}

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const KaleidoscopeFilter: React.FC<Props> = ({ frames }) => {
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

  const cycleIdx = Math.floor(frame / CYCLE);
  const wedgeShapes = React.useMemo(() => generateWedgeShapes(cycleIdx * 23 + 1965), [cycleIdx]);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const envelope = Math.min(fadeIn, fadeOut);

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.4;

  // Slow rotation
  const rotation = frame * 0.15;
  // Scale with energy
  const scale = 0.7 + energy * 1.5;
  // Rainbow hue cycling
  const baseHue = (frame * 1.2) % 360;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          opacity: envelope * 0.55,
          filter: `drop-shadow(0 0 8px hsla(${baseHue}, 100%, 60%, 0.5))`,
        }}
      >
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation}) scale(${scale})`}>
          {Array.from({ length: FOLDS }, (_, foldIdx) => {
            const foldAngle = (foldIdx / FOLDS) * 360;
            const mirror = foldIdx % 2 === 1;

            return (
              <g
                key={foldIdx}
                transform={`rotate(${foldAngle})${mirror ? " scale(-1, 1)" : ""}`}
              >
                {wedgeShapes.map((shape, si) => {
                  const dist = shape.dist * maxRadius;
                  const sx = Math.cos(shape.angle) * dist;
                  const sy = Math.sin(shape.angle) * dist;
                  const hue = (baseHue + shape.hueOffset + foldIdx * 20) % 360;
                  const color = `hsl(${hue}, 100%, 60%)`;
                  const pulseSize = shape.size * (1 + Math.sin(frame * 0.06 + si * 0.8) * 0.3);

                  return renderShape(
                    shape.type,
                    sx,
                    sy,
                    pulseSize,
                    color,
                    0.7,
                    `fold-${foldIdx}-shape-${si}`
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
