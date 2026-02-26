/**
 * CrystalGrowth — Geometric crystal lattice growing from a seed point.
 * Hexagonal/cubic crystal faces appear one by one, building a cluster.
 * Faces are translucent polygons with bright edges. Crystal colors cycle:
 * amethyst purple, quartz clear, citrine gold. Growth speed driven by energy.
 * Facets catch light (bright highlight flashes).
 * Cycle: 65s, 20s visible.
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

const CYCLE = 1950;    // 65 seconds at 30fps
const DURATION = 600;  // 20 seconds
const NUM_FACETS = 22;

// Crystal color palettes that cycle
const CRYSTAL_PALETTES = [
  // Amethyst purple
  { fill: "rgba(156, 39, 176, 0.2)", edge: "#CE93D8", highlight: "#E1BEE7", glow: "#AB47BC" },
  // Quartz clear
  { fill: "rgba(255, 255, 255, 0.12)", edge: "#E0E0E0", highlight: "#FFFFFF", glow: "#B0BEC5" },
  // Citrine gold
  { fill: "rgba(255, 193, 7, 0.18)", edge: "#FFD54F", highlight: "#FFF9C4", glow: "#FFC107" },
];

interface FacetData {
  // Position relative to seed center
  offsetX: number;
  offsetY: number;
  // Shape: hexagonal or rectangular
  shape: "hex" | "rect";
  size: number;          // 15-50
  rotation: number;      // degrees
  paletteIdx: number;
  growOrder: number;      // 0-1, determines when this facet appears
  highlightPhase: number; // for light-catching flash
}

function generateFacets(seed: number): FacetData[] {
  const rng = seeded(seed);
  const facets: FacetData[] = [];

  for (let i = 0; i < NUM_FACETS; i++) {
    // Grow outward from center in layers
    const layer = Math.floor(i / 5);
    const angleInLayer = (i % 5) / 5 * Math.PI * 2 + rng() * 0.5;
    const dist = layer * 35 + rng() * 25;

    facets.push({
      offsetX: Math.cos(angleInLayer) * dist + (rng() - 0.5) * 15,
      offsetY: Math.sin(angleInLayer) * dist + (rng() - 0.5) * 15,
      shape: rng() > 0.4 ? "hex" : "rect",
      size: 18 + rng() * 35,
      rotation: rng() * 60,
      paletteIdx: Math.floor(rng() * CRYSTAL_PALETTES.length),
      growOrder: i / NUM_FACETS + rng() * 0.08,
      highlightPhase: rng() * Math.PI * 2,
    });
  }

  return facets;
}

function hexPoints(cx: number, cy: number, size: number, rotation: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 + rotation) * Math.PI / 180;
    points.push(`${cx + Math.cos(angle) * size},${cy + Math.sin(angle) * size}`);
  }
  return points.join(" ");
}

function rectPoints(cx: number, cy: number, size: number, rotation: number): string {
  const hw = size * 0.8;
  const hh = size * 0.5;
  const rad = rotation * Math.PI / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const corners = [
    [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh],
  ];
  return corners
    .map(([x, y]) => `${cx + x * cosR - y * sinR},${cy + x * sinR + y * cosR}`)
    .join(" ");
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CrystalGrowth: React.FC<Props> = ({ frames }) => {
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

  const facets = React.useMemo(() => generateFacets(8888_1977), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const globalOpacity = Math.min(fadeIn, fadeOut) * 0.7;

  // Crystal color palette cycles with each appearance
  const cycleIndex = Math.floor(frame / CYCLE);
  const paletteShift = cycleIndex % CRYSTAL_PALETTES.length;

  // Seed point (center of screen, slight offset)
  const seedX = width * 0.5;
  const seedY = height * 0.5;

  // Growth progress accelerated by energy
  const growthSpeed = 0.7 + energy * 0.8;
  const growthProgress = Math.min(1, progress * growthSpeed * 1.3);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: globalOpacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="crystal-growth-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {facets.map((facet, i) => {
          // Only show facet if growth has reached it
          if (growthProgress < facet.growOrder) return null;

          // Individual facet grow-in
          const facetProgress = interpolate(
            growthProgress,
            [facet.growOrder, Math.min(1, facet.growOrder + 0.12)],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          );

          const palette = CRYSTAL_PALETTES[(facet.paletteIdx + paletteShift) % CRYSTAL_PALETTES.length];
          const currentSize = facet.size * facetProgress;
          const fx = seedX + facet.offsetX * facetProgress;
          const fy = seedY + facet.offsetY * facetProgress;

          const points = facet.shape === "hex"
            ? hexPoints(fx, fy, currentSize, facet.rotation)
            : rectPoints(fx, fy, currentSize, facet.rotation);

          // Highlight flash -- light catching a facet
          const highlightIntensity = Math.max(0,
            Math.sin(frame * 0.05 + facet.highlightPhase) * 0.5 + 0.5
          ) * 0.4;

          return (
            <g key={i}>
              {/* Facet fill */}
              <polygon
                points={points}
                fill={palette.fill}
                opacity={facetProgress * 0.8}
              />
              {/* Facet edges */}
              <polygon
                points={points}
                fill="none"
                stroke={palette.edge}
                strokeWidth={1.5}
                opacity={facetProgress * 0.7}
                filter="url(#crystal-growth-glow)"
              />
              {/* Highlight flash */}
              {highlightIntensity > 0.15 && (
                <polygon
                  points={points}
                  fill={palette.highlight}
                  opacity={highlightIntensity * facetProgress}
                />
              )}
              {/* Inner facet lines (crystal structure) */}
              {facet.shape === "hex" && facetProgress > 0.5 && (
                <>
                  <line
                    x1={fx}
                    y1={fy - currentSize * 0.6}
                    x2={fx}
                    y2={fy + currentSize * 0.6}
                    stroke={palette.edge}
                    strokeWidth={0.4}
                    opacity={0.25}
                  />
                  <line
                    x1={fx - currentSize * 0.5}
                    y1={fy}
                    x2={fx + currentSize * 0.5}
                    y2={fy}
                    stroke={palette.edge}
                    strokeWidth={0.4}
                    opacity={0.25}
                  />
                </>
              )}
            </g>
          );
        })}

        {/* Central seed glow */}
        <circle
          cx={seedX}
          cy={seedY}
          r={8 + energy * 6}
          fill="white"
          opacity={0.15 + energy * 0.1}
          filter="url(#crystal-growth-glow)"
        />
      </svg>
    </div>
  );
};
