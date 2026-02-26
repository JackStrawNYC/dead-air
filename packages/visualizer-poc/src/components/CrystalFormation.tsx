/**
 * CrystalFormation — Geometric crystals growing from screen edges.
 * 8-10 crystal shards (elongated hexagonal prism shapes rendered as SVG polygons).
 * Grow inward from edges during energy buildups.
 * Crystal facets have gradient fills suggesting refraction.
 * Colors shift with chroma. Appears every 50s for 14s when energy > 0.12.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1500;     // 50 seconds at 30fps
const DURATION = 420;   // 14 seconds
const NUM_CRYSTALS = 9;

type Edge = "top" | "bottom" | "left" | "right";

interface CrystalData {
  edge: Edge;
  posAlongEdge: number;   // 0..1
  angle: number;          // growth angle inward (radians)
  length: number;         // base length
  width: number;          // base width
  facets: number;         // 5 or 6 facets per crystal
  hueOffset: number;
  growDelay: number;      // 0..0.3 staggered growth start
}

function generateCrystals(seed: number): CrystalData[] {
  const rng = seeded(seed);
  const edges: Edge[] = ["top", "bottom", "left", "right"];
  return Array.from({ length: NUM_CRYSTALS }, () => {
    const edge = edges[Math.floor(rng() * edges.length)];
    // Angle points inward from edge with some variance
    let baseAngle: number;
    switch (edge) {
      case "top": baseAngle = Math.PI / 2; break;
      case "bottom": baseAngle = -Math.PI / 2; break;
      case "left": baseAngle = 0; break;
      case "right": baseAngle = Math.PI; break;
    }
    return {
      edge,
      posAlongEdge: 0.1 + rng() * 0.8,
      angle: baseAngle + (rng() - 0.5) * 0.6,
      length: 80 + rng() * 140,
      width: 15 + rng() * 25,
      facets: 5 + Math.floor(rng() * 2),
      hueOffset: rng() * 360,
      growDelay: rng() * 0.3,
    };
  });
}

function getCrystalOrigin(
  crystal: CrystalData,
  width: number,
  height: number,
): [number, number] {
  switch (crystal.edge) {
    case "top": return [crystal.posAlongEdge * width, 0];
    case "bottom": return [crystal.posAlongEdge * width, height];
    case "left": return [0, crystal.posAlongEdge * height];
    case "right": return [width, crystal.posAlongEdge * height];
  }
}

function buildCrystalPolygon(
  ox: number,
  oy: number,
  angle: number,
  length: number,
  crystalWidth: number,
): string {
  // Elongated hexagonal prism shape
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const perpCos = Math.cos(angle + Math.PI / 2);
  const perpSin = Math.sin(angle + Math.PI / 2);

  const hw = crystalWidth / 2;
  const tipLen = length;
  const midLen = length * 0.6;
  const baseLen = length * 0.15;

  // 6 points: base-left, mid-left, tip, mid-right, base-right, notch-back
  const points = [
    [ox - perpCos * hw, oy - perpSin * hw],                                          // base-left
    [ox + cos * midLen - perpCos * hw * 0.7, oy + sin * midLen - perpSin * hw * 0.7], // mid-left
    [ox + cos * tipLen, oy + sin * tipLen],                                            // tip
    [ox + cos * midLen + perpCos * hw * 0.7, oy + sin * midLen + perpSin * hw * 0.7], // mid-right
    [ox + perpCos * hw, oy + perpSin * hw],                                            // base-right
    [ox - cos * baseLen, oy - sin * baseLen],                                          // notch-back
  ];

  return points.map((p) => `${p[0]},${p[1]}`).join(" ");
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CrystalFormation: React.FC<Props> = ({ frames }) => {
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

  const crystals = React.useMemo(() => generateCrystals(6789), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;
  if (energy < 0.12) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.65;

  // Chroma-driven hue
  const chromaData = frames[idx].chroma;
  let maxChromaIdx = 0;
  let maxChromaVal = 0;
  for (let c = 0; c < 12; c++) {
    if (chromaData[c] > maxChromaVal) {
      maxChromaVal = chromaData[c];
      maxChromaIdx = c;
    }
  }
  const chromaHue = (maxChromaIdx / 12) * 360;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}
      >
        <defs>
          <filter id="crystal-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {crystals.map((_, i) => {
            const hue = (chromaHue + i * 40) % 360;
            return (
              <linearGradient key={`cg${i}`} id={`crystal-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={`hsl(${hue}, 80%, 70%)`} stopOpacity="0.7" />
                <stop offset="40%" stopColor={`hsl(${(hue + 30) % 360}, 90%, 80%)`} stopOpacity="0.5" />
                <stop offset="100%" stopColor={`hsl(${(hue + 60) % 360}, 70%, 60%)`} stopOpacity="0.4" />
              </linearGradient>
            );
          })}
        </defs>
        {crystals.map((crystal, i) => {
          // Staggered growth
          const growStart = crystal.growDelay;
          const growProgress = interpolate(progress, [growStart, growStart + 0.4, 0.8, 1], [0, 1, 1, 0.5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });

          if (growProgress < 0.01) return null;

          const [ox, oy] = getCrystalOrigin(crystal, width, height);
          const currentLength = crystal.length * growProgress * (0.8 + energy * 0.5);
          const currentWidth = crystal.width * growProgress;

          const polyPoints = buildCrystalPolygon(ox, oy, crystal.angle, currentLength, currentWidth);
          const hue = (chromaHue + crystal.hueOffset) % 360;
          const edgeColor = `hsl(${hue}, 80%, 65%)`;

          return (
            <g key={i}>
              <polygon
                points={polyPoints}
                fill={`url(#crystal-grad-${i})`}
                stroke={edgeColor}
                strokeWidth={1.5}
                opacity={0.7}
                filter="url(#crystal-glow)"
              />
              {/* Highlight edge (refraction line) */}
              <polygon
                points={polyPoints}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={0.5}
                opacity={0.2 + energy * 0.2}
                strokeDasharray="4 8"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
