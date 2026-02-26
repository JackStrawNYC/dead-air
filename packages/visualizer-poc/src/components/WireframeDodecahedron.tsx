/**
 * WireframeDodecahedron — Rotating wireframe 3D polyhedron projected to 2D.
 * Uses the 20 vertices and 30 edges of a dodecahedron.
 * Apply rotation matrices (X, Y, Z axis rotation driven by frame).
 * Project to 2D with perspective divide. Render edges as SVG lines.
 * Neon color, slow rotation. Appears every 65s for 16s. Scale breathes with energy.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
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

const CYCLE = 1950;     // 65 seconds at 30fps
const DURATION = 480;   // 16 seconds

// Golden ratio for dodecahedron construction
const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;

// 20 vertices of a regular dodecahedron (centered at origin, edge length ~1.24)
const VERTICES: [number, number, number][] = [
  // 8 cube vertices
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
  // 4 on YZ plane
  [0, PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, INV_PHI], [0, -PHI, -INV_PHI],
  // 4 on XZ plane
  [INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, PHI], [-INV_PHI, 0, -PHI],
  // 4 on XY plane
  [PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, INV_PHI, 0], [-PHI, -INV_PHI, 0],
];

// 30 edges of a dodecahedron (vertex index pairs)
const EDGES: [number, number][] = [
  // Top face connections
  [0, 8], [0, 12], [0, 16],
  [1, 9], [1, 13], [1, 16],
  [2, 10], [2, 12], [2, 17],
  [3, 11], [3, 13], [3, 17],
  [4, 8], [4, 14], [4, 18],
  [5, 9], [5, 15], [5, 18],
  [6, 10], [6, 14], [6, 19],
  [7, 11], [7, 15], [7, 19],
  // Ring edges
  [8, 9], [10, 11], [12, 14], [13, 15], [16, 17], [18, 19],
];

type Vec3 = [number, number, number];

function rotateX(v: Vec3, a: number): Vec3 {
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [v[0], v[1] * cos - v[2] * sin, v[1] * sin + v[2] * cos];
}

function rotateY(v: Vec3, a: number): Vec3 {
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [v[0] * cos + v[2] * sin, v[1], -v[0] * sin + v[2] * cos];
}

function rotateZ(v: Vec3, a: number): Vec3 {
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos, v[2]];
}

function project(v: Vec3, focalLength: number, scale: number): [number, number, number] {
  const z = v[2] + 5; // push away from camera
  const factor = focalLength / Math.max(z, 0.1);
  return [v[0] * factor * scale, v[1] * factor * scale, z];
}

const NEON_COLORS = [
  "#00FFFF", "#FF00FF", "#FFFF00", "#00FF88",
  "#FF4488", "#88FF00", "#FF8800", "#8844FF",
];

interface Props {
  frames: EnhancedFrameData[];
}

export const WireframeDodecahedron: React.FC<Props> = ({ frames }) => {
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

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.7;

  const cx = width / 2;
  const cy = height / 2;

  // Slow rotation, slightly speed up with energy
  const baseSpeed = 0.008;
  const rx = frame * baseSpeed * 1.0;
  const ry = frame * baseSpeed * 1.3;
  const rz = frame * baseSpeed * 0.7;

  // Scale breathes with energy
  const breathe = 1 + Math.sin(frame * 0.04) * 0.08 * (1 + energy * 3);
  const scale = Math.min(width, height) * 0.15 * breathe;
  const focalLength = 4;

  // Project all vertices
  const projected = VERTICES.map((v) => {
    let rv = rotateX(v, rx);
    rv = rotateY(rv, ry);
    rv = rotateZ(rv, rz);
    return project(rv, focalLength, scale);
  });

  // Color cycles slowly
  const hueShift = Math.floor(frame * 0.015) % NEON_COLORS.length;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="dodec-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Edges */}
        {EDGES.map(([a, b], i) => {
          const pa = projected[a];
          const pb = projected[b];
          const avgZ = (pa[2] + pb[2]) / 2;
          const depthOpacity = interpolate(avgZ, [3, 7], [0.9, 0.3], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const color = NEON_COLORS[(hueShift + i) % NEON_COLORS.length];
          const strokeW = interpolate(avgZ, [3, 7], [2.5, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <line
              key={i}
              x1={cx + pa[0]}
              y1={cy + pa[1]}
              x2={cx + pb[0]}
              y2={cy + pb[1]}
              stroke={color}
              strokeWidth={strokeW}
              opacity={depthOpacity}
              filter="url(#dodec-glow)"
            />
          );
        })}
        {/* Vertices as small dots */}
        {projected.map((p, i) => {
          const depthOpacity = interpolate(p[2], [3, 7], [0.8, 0.2], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const color = NEON_COLORS[(hueShift + i) % NEON_COLORS.length];
          return (
            <circle
              key={`v${i}`}
              cx={cx + p[0]}
              cy={cy + p[1]}
              r={2 + energy * 2}
              fill={color}
              opacity={depthOpacity}
            />
          );
        })}
      </svg>
    </div>
  );
};
