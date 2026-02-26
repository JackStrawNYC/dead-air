/**
 * PenroseTiling — Non-repeating aperiodic tiling using thick and thin
 * rhombus shapes (P3 Penrose tiling via subdivision). Tiles grow outward
 * from center, each colored by type and radial position. Gold/teal/purple
 * palette. Tiles appear one by one, building the infinite pattern. Energy
 * drives tile appearance rate. Cycle: 75s (2250 frames), 25s visible (750 frames).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2250;    // 75 seconds at 30fps
const DURATION = 750;  // 25 seconds visible
const STAGGER_OFFSET = 300; // 10s offset

const PHI = (1 + Math.sqrt(5)) / 2;

interface Triangle {
  type: 0 | 1; // 0 = thick (36-108-36), 1 = thin (72-36-72)
  a: [number, number];
  b: [number, number];
  c: [number, number];
}

/** Subdivide a list of Robinson triangles one level */
function subdivide(triangles: Triangle[]): Triangle[] {
  const result: Triangle[] = [];
  for (const tri of triangles) {
    const { type, a, b, c } = tri;
    if (type === 0) {
      // Thick triangle: split into 2 thick + 1 thin
      const p: [number, number] = [
        a[0] + (b[0] - a[0]) / PHI,
        a[1] + (b[1] - a[1]) / PHI,
      ];
      result.push({ type: 0, a: c, b: p, c: a });
      result.push({ type: 0, a: p, b: c, c: b });
      result.push({ type: 1, a: p, b: b, c: a }); // thin
    } else {
      // Thin triangle: split into 1 thick + 1 thin
      const q: [number, number] = [
        b[0] + (a[0] - b[0]) / PHI,
        a[1] + (c[1] - a[1]) / PHI,
      ];
      // Corrected subdivision for thin Robinson triangle
      const r: [number, number] = [
        a[0] + (c[0] - a[0]) / PHI,
        a[1] + (c[1] - a[1]) / PHI,
      ];
      result.push({ type: 1, a: r, b: c, c: b });
      result.push({ type: 0, a: r, b: b, c: a });
    }
  }
  return result;
}

/** Generate initial decagon of Robinson triangles */
function generateInitialTriangles(): Triangle[] {
  const triangles: Triangle[] = [];
  for (let i = 0; i < 10; i++) {
    const angle1 = ((2 * Math.PI) / 10) * i;
    const angle2 = ((2 * Math.PI) / 10) * (i + 1);
    const a: [number, number] = [0, 0];
    const b: [number, number] = [Math.cos(angle1), Math.sin(angle1)];
    const c: [number, number] = [Math.cos(angle2), Math.sin(angle2)];
    if (i % 2 === 0) {
      triangles.push({ type: 0, a, b, c });
    } else {
      triangles.push({ type: 0, a, b: c, c: b }); // mirror
    }
  }
  return triangles;
}

/** Generate Penrose tiles by subdividing 4 times */
function generateTiles(): Triangle[] {
  let tris = generateInitialTriangles();
  for (let i = 0; i < 4; i++) {
    tris = subdivide(tris);
  }
  // Sort by distance from center for reveal order
  tris.sort((a, b) => {
    const da = (a.a[0] + a.b[0] + a.c[0]) ** 2 + (a.a[1] + a.b[1] + a.c[1]) ** 2;
    const db = (b.a[0] + b.b[0] + b.c[0]) ** 2 + (b.a[1] + b.b[1] + b.c[1]) ** 2;
    return da - db;
  });
  return tris;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PenroseTiling: React.FC<Props> = ({ frames }) => {
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

  const tiles = React.useMemo(() => generateTiles(), []);

  // Periodic visibility
  const effectiveFrame = Math.max(0, frame - STAGGER_OFFSET);
  const cycleFrame = effectiveFrame % CYCLE;
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
  const visibility = Math.min(fadeIn, fadeOut);

  const energyOpacity = interpolate(energy, [0.04, 0.25], [0.12, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = visibility * energyOpacity;
  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const scale = Math.min(width, height) * 0.42;

  // Energy drives how many tiles are visible
  const speedMult = interpolate(energy, [0.03, 0.3], [0.5, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const maxTiles = Math.min(
    tiles.length,
    Math.floor(progress * tiles.length * speedMult * 0.8) + 5,
  );

  // Color palette: gold, teal, purple
  const hueShift = cycleFrame * 0.2;
  const thickHue = (45 + hueShift) % 360;  // gold
  const thinHue = (175 + hueShift) % 360;  // teal

  const glowSize = interpolate(energy, [0.03, 0.3], [2, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Slow rotation
  const rotation = cycleFrame * 0.08;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          mixBlendMode: "screen",
        }}
      >
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
          {tiles.slice(0, maxTiles).map((tri, i) => {
            const hue = tri.type === 0 ? thickHue : thinHue;
            const lightness = 55 + (i / tiles.length) * 15;
            const sat = 70 + energy * 30;
            const color = `hsl(${hue}, ${sat}%, ${lightness}%)`;
            const glowColor = `hsla(${hue}, 100%, 70%, 0.5)`;

            const points = `${tri.a[0] * scale},${tri.a[1] * scale} ${tri.b[0] * scale},${tri.b[1] * scale} ${tri.c[0] * scale},${tri.c[1] * scale}`;

            // Per-tile fade-in based on reveal order
            const tileProgress = i / Math.max(1, maxTiles);
            const tileOpacity = interpolate(
              tileProgress,
              [0.8, 1],
              [1, 0.3],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );

            return (
              <polygon
                key={i}
                points={points}
                fill={color}
                fillOpacity={0.15 + energy * 0.15}
                stroke={color}
                strokeWidth={1 + energy * 0.8}
                opacity={tileOpacity}
                style={{
                  filter: `drop-shadow(0 0 ${glowSize}px ${glowColor})`,
                }}
              />
            );
          })}

          {/* Center ornament */}
          <circle
            cx={0}
            cy={0}
            r={4 + energy * 8}
            fill={`hsl(${(280 + hueShift) % 360}, 100%, 75%)`}
            opacity={0.6}
          />
        </g>
      </svg>
    </div>
  );
};
