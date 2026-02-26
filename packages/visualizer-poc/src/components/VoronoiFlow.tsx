/**
 * VoronoiFlow — Animated Voronoi tessellation overlay.
 * 15-25 seed points drift slowly across the canvas. Voronoi cells are
 * approximated by drawing polygon edges computed from seed-point adjacency.
 * Each cell is colored from a psychedelic palette based on distance to its
 * centroid. Seed point drift speed scales with energy. Cell hues shift
 * with chroma data. Cycle: 60s (1800 frames), 20s visible (600 frames).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 1800;    // 60 seconds at 30fps
const DURATION = 600;  // 20 seconds visible
const NUM_SEEDS = 20;
const STAGGER_OFFSET = 210; // 7s offset

interface SeedPoint {
  baseX: number;
  baseY: number;
  driftAngle: number;
  driftSpeed: number;
  hueOffset: number;
}

function generateSeeds(seed: number): SeedPoint[] {
  const rng = mulberry32(seed);
  return Array.from({ length: NUM_SEEDS }, () => ({
    baseX: rng(),
    baseY: rng(),
    driftAngle: rng() * Math.PI * 2,
    driftSpeed: 0.3 + rng() * 0.7,
    hueOffset: rng() * 360,
  }));
}

/**
 * Compute Voronoi edges via Delaunay triangulation (brute-force for small N).
 * For N=20 points, O(N^3) is fine.
 */
function computeVoronoiEdges(
  pts: Array<{ x: number; y: number }>,
  w: number,
  h: number,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const edges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const n = pts.length;

  // For each pair of points, find the perpendicular bisector segment
  // clipped to the bounding box. This gives Voronoi edges.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const mx = (pts[i].x + pts[j].x) / 2;
      const my = (pts[i].y + pts[j].y) / 2;
      const dx = pts[j].x - pts[i].x;
      const dy = pts[j].y - pts[i].y;
      // Perpendicular direction
      const px = -dy;
      const py = dx;
      const len = Math.sqrt(px * px + py * py);
      if (len < 0.001) continue;
      const nx = px / len;
      const ny = py / len;

      // Find extent: walk along bisector, check if i and j are still
      // the closest pair to the midpoint along this line.
      // For simplicity, extend line by a fixed amount and clip to bounds.
      const ext = Math.max(w, h);
      let x1 = mx - nx * ext;
      let y1 = my - ny * ext;
      let x2 = mx + nx * ext;
      let y2 = my + ny * ext;

      // Clip to bounding box
      const clip = clipLineToRect(x1, y1, x2, y2, -10, -10, w + 10, h + 10);
      if (!clip) continue;

      // For a true Voronoi edge, we need to find the portion of the bisector
      // where i and j are actually the two nearest seeds. Sample along the edge.
      const samples = 12;
      let validStart = -1;
      let validEnd = -1;
      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        const sx = clip.x1 + (clip.x2 - clip.x1) * t;
        const sy = clip.y1 + (clip.y2 - clip.y1) * t;
        // Check the two nearest points
        const dists = pts
          .map((p, idx) => ({ idx, d: (p.x - sx) ** 2 + (p.y - sy) ** 2 }))
          .sort((a, b) => a.d - b.d);
        const nearest2 = new Set([dists[0].idx, dists[1].idx]);
        if (nearest2.has(i) && nearest2.has(j)) {
          if (validStart === -1) validStart = s;
          validEnd = s;
        }
      }
      if (validStart === -1) continue;

      const t1 = validStart / samples;
      const t2 = validEnd / samples;
      edges.push({
        x1: clip.x1 + (clip.x2 - clip.x1) * t1,
        y1: clip.y1 + (clip.y2 - clip.y1) * t1,
        x2: clip.x1 + (clip.x2 - clip.x1) * t2,
        y2: clip.y1 + (clip.y2 - clip.y1) * t2,
      });
    }
  }

  return edges;
}

function clipLineToRect(
  x1: number, y1: number, x2: number, y2: number,
  xmin: number, ymin: number, xmax: number, ymax: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  // Cohen-Sutherland line clipping
  const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;
  function code(x: number, y: number): number {
    let c = INSIDE;
    if (x < xmin) c |= LEFT;
    else if (x > xmax) c |= RIGHT;
    if (y < ymin) c |= BOTTOM;
    else if (y > ymax) c |= TOP;
    return c;
  }

  let c1 = code(x1, y1);
  let c2 = code(x2, y2);

  for (let iter = 0; iter < 20; iter++) {
    if (!(c1 | c2)) return { x1, y1, x2, y2 };
    if (c1 & c2) return null;
    const cOut = c1 || c2;
    let x = 0, y = 0;
    const dx = x2 - x1, dy = y2 - y1;
    if (cOut & TOP) { x = x1 + dx * (ymax - y1) / dy; y = ymax; }
    else if (cOut & BOTTOM) { x = x1 + dx * (ymin - y1) / dy; y = ymin; }
    else if (cOut & RIGHT) { y = y1 + dy * (xmax - x1) / dx; x = xmax; }
    else if (cOut & LEFT) { y = y1 + dy * (xmin - x1) / dx; x = xmin; }
    if (cOut === c1) { x1 = x; y1 = y; c1 = code(x1, y1); }
    else { x2 = x; y2 = y; c2 = code(x2, y2); }
  }
  return null;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const VoronoiFlow: React.FC<Props> = ({ frames }) => {
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

  const seeds = React.useMemo(() => generateSeeds(7718281), []);

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
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const visibility = Math.min(fadeIn, fadeOut);

  const energyOpacity = interpolate(energy, [0.04, 0.25], [0.12, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = visibility * energyOpacity;
  if (masterOpacity < 0.01) return null;

  const fd = frames[idx];

  // Drift speed scaled by energy
  const speedMult = interpolate(energy, [0.03, 0.3], [0.5, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Compute current seed positions
  const currentPts = seeds.map((s) => {
    const drift = cycleFrame * 0.0008 * s.driftSpeed * speedMult;
    return {
      x: (s.baseX + Math.cos(s.driftAngle + drift * 0.3) * drift * 0.15 + 10) % 1 * width,
      y: (s.baseY + Math.sin(s.driftAngle + drift * 0.3) * drift * 0.15 + 10) % 1 * height,
    };
  });

  // Compute Voronoi edges
  const voronoiEdges = computeVoronoiEdges(currentPts, width, height);

  // Chroma-driven hue
  let maxChromaIdx = 0;
  let maxChromaVal = 0;
  for (let c = 0; c < 12; c++) {
    if (fd.chroma[c] > maxChromaVal) {
      maxChromaVal = fd.chroma[c];
      maxChromaIdx = c;
    }
  }
  const baseHue = (maxChromaIdx / 12) * 360 + cycleFrame * 0.3;

  const glowSize = interpolate(energy, [0.03, 0.3], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
        {/* Voronoi edges */}
        {voronoiEdges.map((edge, i) => {
          const hue = (baseHue + i * 17) % 360;
          const color = `hsl(${hue}, 90%, 65%)`;
          return (
            <line
              key={`e-${i}`}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke={color}
              strokeWidth={1.5 + energy * 1.5}
              opacity={0.6}
              style={{
                filter: `drop-shadow(0 0 ${glowSize}px ${color})`,
              }}
            />
          );
        })}

        {/* Seed point glows */}
        {currentPts.map((pt, i) => {
          const hue = (baseHue + seeds[i].hueOffset) % 360;
          const color = `hsl(${hue}, 100%, 75%)`;
          return (
            <circle
              key={`s-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={3 + energy * 6}
              fill={color}
              opacity={0.5 + energy * 0.3}
              style={{
                filter: `drop-shadow(0 0 ${6 + energy * 10}px ${color})`,
              }}
            />
          );
        })}

        {/* Cell center decorations — small rings at midpoints between adjacent seeds */}
        {voronoiEdges
          .filter((_, i) => i % 3 === 0)
          .map((edge, i) => {
            const mx = (edge.x1 + edge.x2) / 2;
            const my = (edge.y1 + edge.y2) / 2;
            const hue = (baseHue + i * 31 + 180) % 360;
            return (
              <circle
                key={`m-${i}`}
                cx={mx}
                cy={my}
                r={2 + energy * 3}
                fill="none"
                stroke={`hsl(${hue}, 100%, 70%)`}
                strokeWidth={0.8}
                opacity={0.35}
              />
            );
          })}
      </svg>
    </div>
  );
};
