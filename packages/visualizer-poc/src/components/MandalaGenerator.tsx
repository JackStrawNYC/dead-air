/**
 * MandalaGenerator — Procedural mandalas that build outward ring by ring.
 * 6-fold symmetry with concentric rings of geometric shapes (circles, petals, triangles).
 * Each ring appears sequentially during the visible period.
 * Pattern complexity scales with energy. Neon rainbow colors per ring.
 * Slow rotation. Appears every 55s for 16s. 5-7 rings building out from center.
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

const CYCLE = 1650; // 55 seconds at 30fps
const DURATION = 480; // 16 seconds visible
const SYMMETRY = 6;
const TWO_PI = Math.PI * 2;

type ShapeKind = "circle" | "petal" | "triangle" | "diamond" | "dot";

interface RingDef {
  radius: number; // 0-1 normalized
  shapeKind: ShapeKind;
  shapeCount: number; // how many shapes around this ring
  shapeSize: number; // relative size
  hue: number;
  rotationDir: number; // +1 or -1
  rotationSpeed: number;
}

function generateRings(seed: number): RingDef[] {
  const rng = seeded(seed);
  const kinds: ShapeKind[] = ["circle", "petal", "triangle", "diamond", "dot"];
  const count = 7;
  const rings: RingDef[] = [];
  for (let i = 0; i < count; i++) {
    rings.push({
      radius: 0.1 + (i / (count - 1)) * 0.85,
      shapeKind: kinds[Math.floor(rng() * kinds.length)],
      shapeCount: SYMMETRY * (1 + Math.floor(rng() * 3)), // 6, 12, or 18
      shapeSize: 8 + rng() * 16,
      hue: (i / count) * 360,
      rotationDir: rng() > 0.5 ? 1 : -1,
      rotationSpeed: 0.1 + rng() * 0.3,
    });
  }
  return rings;
}

function renderShape(kind: ShapeKind, size: number, color: string, key: string): React.ReactElement {
  switch (kind) {
    case "circle":
      return <circle key={key} cx={0} cy={0} r={size * 0.5} stroke={color} strokeWidth={1.5} fill="none" opacity={0.8} />;
    case "petal":
      return (
        <ellipse
          key={key}
          cx={0}
          cy={0}
          rx={size * 0.25}
          ry={size * 0.6}
          stroke={color}
          strokeWidth={1.5}
          fill={color}
          fillOpacity={0.15}
          opacity={0.8}
        />
      );
    case "triangle": {
      const pts = Array.from({ length: 3 }, (_, i) => {
        const a = (i / 3) * TWO_PI - Math.PI / 2;
        return `${Math.cos(a) * size * 0.45},${Math.sin(a) * size * 0.45}`;
      }).join(" ");
      return <polygon key={key} points={pts} stroke={color} strokeWidth={1.5} fill="none" opacity={0.8} />;
    }
    case "diamond": {
      const s = size * 0.45;
      const pts = `0,${-s} ${s * 0.6},0 0,${s} ${-s * 0.6},0`;
      return <polygon key={key} points={pts} stroke={color} strokeWidth={1.5} fill="none" opacity={0.8} />;
    }
    case "dot":
      return <circle key={key} cx={0} cy={0} r={size * 0.2} fill={color} opacity={0.9} />;
  }
}

interface Props {
  frames: EnhancedFrameData[];
}

export const MandalaGenerator: React.FC<Props> = ({ frames }) => {
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

  const rings = React.useMemo(() => generateRings(42042), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity =
    Math.min(fadeIn, fadeOut) *
    interpolate(energy, [0.03, 0.25], [0.2, 0.55], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  if (opacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.4;
  const breathe = 1 + (energy - 0.1) * 0.3;

  // Energy drives how many rings are visible (5-7)
  const visibleRingCount = Math.round(
    interpolate(energy, [0.03, 0.3], [5, 7], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  const baseHue = (frame * 0.5) % 360;
  const rotation = frame * 0.2;
  const glowColor = `hsl(${baseHue}, 100%, 65%)`;
  const glowColor2 = `hsl(${(baseHue + 180) % 360}, 100%, 65%)`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 10px ${glowColor}) drop-shadow(0 0 22px ${glowColor2})`,
        }}
      >
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
          {/* Center dot */}
          <circle cx={0} cy={0} r={4 + energy * 10} fill={`hsl(${baseHue}, 100%, 75%)`} opacity={0.8} />

          {rings.slice(0, visibleRingCount).map((ring, ri) => {
            // Each ring appears sequentially: ring 0 at progress 0, last ring at progress ~0.7
            const ringAppear = (ri / rings.length) * 0.7;
            const ringOpacity = interpolate(progress, [ringAppear, ringAppear + 0.15], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            if (ringOpacity < 0.01) return null;

            const r = ring.radius * maxRadius * breathe;
            const ringRotation = frame * ring.rotationSpeed * ring.rotationDir;
            const hue = (baseHue + ring.hue) % 360;
            const color = `hsl(${hue}, 100%, 65%)`;

            return (
              <g key={ri} opacity={ringOpacity} transform={`rotate(${ringRotation})`}>
                {/* Ring guide circle */}
                <circle cx={0} cy={0} r={r} stroke={color} strokeWidth={0.5} fill="none" opacity={0.2} />

                {/* Shapes distributed around the ring */}
                {Array.from({ length: ring.shapeCount }, (_, si) => {
                  const angle = (si / ring.shapeCount) * TWO_PI;
                  const sx = Math.cos(angle) * r;
                  const sy = Math.sin(angle) * r;
                  const shapeRotDeg = (angle * 180) / Math.PI;
                  return (
                    <g key={si} transform={`translate(${sx}, ${sy}) rotate(${shapeRotDeg})`}>
                      {renderShape(ring.shapeKind, ring.shapeSize, color, `r${ri}s${si}`)}
                    </g>
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
