/**
 * DNAHelix — Double helix rotating.
 * Two intertwined sine-wave paths (180deg offset) with horizontal "rungs"
 * connecting them. 20 rungs visible. Helix rotates by advancing phase each
 * frame. Rungs light up mapped to 7 frequency bands (contrast array).
 * Neon blue + magenta for the two strands. Positioned center-left.
 * Appears every 60s for 14s.
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

const CYCLE = 1800; // 60s at 30fps
const DURATION = 420; // 14s
const NUM_RUNGS = 20;
const HELIX_AMPLITUDE = 60; // horizontal swing in pixels
const RUNG_SPACING = 28; // vertical pixels between rungs

// Band colors mapped to 7 contrast bands (low to high freq)
const BAND_COLORS = [
  "#FF0044", // sub-bass: deep red
  "#FF4400", // bass: orange-red
  "#FFAA00", // low-mid: amber
  "#00FF88", // mid: green
  "#00CCFF", // high-mid: cyan
  "#4400FF", // high: blue
  "#AA00FF", // brilliance: violet
];

interface Props {
  frames: EnhancedFrameData[];
}

export const DNAHelix: React.FC<Props> = ({ frames }) => {
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

  // useMemo for deterministic rung data (none needed here, but keep pattern)
  const _rng = React.useMemo(() => seeded(6789), []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.55 + energy * 0.35);

  // Helix center position (center-left)
  const cx = width * 0.3;
  const helixTop = height * 0.15;
  const helixHeight = NUM_RUNGS * RUNG_SPACING;

  // Phase advances each frame for rotation effect
  const phase = frame * 0.06;

  // Current contrast data for rung colors
  const contrast = frames[idx].contrast;

  // Build helix points for both strands
  const strandAPoints: { x: number; y: number }[] = [];
  const strandBPoints: { x: number; y: number }[] = [];
  const rungs: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    bandIndex: number;
    depth: number;
  }[] = [];

  for (let r = 0; r < NUM_RUNGS; r++) {
    const t = r / NUM_RUNGS;
    const y = helixTop + t * helixHeight;
    const angle = phase + t * Math.PI * 4; // 2 full turns across the helix

    const sinVal = Math.sin(angle);
    const cosVal = Math.cos(angle);
    const amplitude = HELIX_AMPLITUDE * (1 + energy * 0.3);

    const xA = cx + sinVal * amplitude;
    const xB = cx - sinVal * amplitude;

    strandAPoints.push({ x: xA, y });
    strandBPoints.push({ x: xB, y });

    // Depth for this rung (cosVal > 0 means strand A is "in front")
    rungs.push({
      x1: xA,
      y1: y,
      x2: xB,
      y2: y,
      bandIndex: r % 7,
      depth: cosVal,
    });
  }

  // Build SVG path strings for smooth strands
  const buildPath = (points: { x: number; y: number }[]): string => {
    if (points.length < 2) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpY = (prev.y + curr.y) / 2;
      d += ` C ${prev.x} ${cpY}, ${curr.x} ${cpY}, ${curr.x} ${curr.y}`;
    }
    return d;
  };

  const pathA = buildPath(strandAPoints);
  const pathB = buildPath(strandBPoints);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <filter id="helix-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Back rungs (depth < 0 means behind) */}
        {rungs.map((rung, i) => {
          if (rung.depth >= 0) return null;
          const bandVal = contrast[rung.bandIndex];
          const brightness = 0.2 + bandVal * 0.8;
          const color = BAND_COLORS[rung.bandIndex];
          return (
            <line
              key={`rungb${i}`}
              x1={rung.x1}
              y1={rung.y1}
              x2={rung.x2}
              y2={rung.y2}
              stroke={color}
              strokeWidth={2}
              opacity={brightness * 0.4}
              strokeLinecap="round"
            />
          );
        })}

        {/* Strand A (neon blue) */}
        <path
          d={pathA}
          fill="none"
          stroke="#00AAFF"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.8}
          filter="url(#helix-glow)"
        />

        {/* Strand B (magenta) */}
        <path
          d={pathB}
          fill="none"
          stroke="#FF00AA"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.8}
          filter="url(#helix-glow)"
        />

        {/* Front rungs (depth >= 0 means in front) */}
        {rungs.map((rung, i) => {
          if (rung.depth < 0) return null;
          const bandVal = contrast[rung.bandIndex];
          const brightness = 0.3 + bandVal * 0.7;
          const color = BAND_COLORS[rung.bandIndex];
          return (
            <line
              key={`rungf${i}`}
              x1={rung.x1}
              y1={rung.y1}
              x2={rung.x2}
              y2={rung.y2}
              stroke={color}
              strokeWidth={2.5}
              opacity={brightness * 0.8}
              strokeLinecap="round"
              filter="url(#helix-glow)"
            />
          );
        })}

        {/* Node dots at strand intersections */}
        {strandAPoints.map((p, i) => (
          <circle
            key={`na${i}`}
            cx={p.x}
            cy={p.y}
            r={2.5 + energy * 1.5}
            fill="#00CCFF"
            opacity={0.7}
          />
        ))}
        {strandBPoints.map((p, i) => (
          <circle
            key={`nb${i}`}
            cx={p.x}
            cy={p.y}
            r={2.5 + energy * 1.5}
            fill="#FF44CC"
            opacity={0.7}
          />
        ))}
      </svg>
    </div>
  );
};
