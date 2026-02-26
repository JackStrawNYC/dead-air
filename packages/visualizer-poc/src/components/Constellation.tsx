/**
 * Constellation — Connect-the-dots star patterns forming Dead icons.
 * 5 constellation patterns: Bear, Stealie, Lightning Bolt, Rose, Terrapin.
 * Each is 8-15 star points connected by thin lines. One constellation appears
 * every 50s for 12s. Stars twinkle (opacity sine). Lines draw in sequentially
 * (1 line per 10 frames). Faint background star field. White/ice-blue stars.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

// Constellation point data: normalized 0-1 coordinates
// Each constellation has points and edges (index pairs)
interface ConstellationDef {
  name: string;
  points: [number, number][];
  edges: [number, number][];
}

const CONSTELLATIONS: ConstellationDef[] = [
  {
    // Bear (dancing bear silhouette)
    name: "Bear",
    points: [
      [0.5, 0.15], [0.42, 0.22], [0.58, 0.22], // head, ears
      [0.5, 0.35], // neck
      [0.4, 0.45], [0.6, 0.45], // shoulders
      [0.35, 0.6], [0.65, 0.6], // elbows
      [0.3, 0.75], [0.7, 0.75], // hands
      [0.45, 0.65], [0.55, 0.65], // hips
      [0.4, 0.85], [0.6, 0.85], // feet
    ],
    edges: [
      [0, 1], [0, 2], [0, 3], [3, 4], [3, 5],
      [4, 6], [5, 7], [6, 8], [7, 9],
      [4, 10], [5, 11], [10, 12], [11, 13],
    ],
  },
  {
    // Stealie (skull circle)
    name: "Stealie",
    points: [
      [0.5, 0.12], [0.7, 0.2], [0.82, 0.38], [0.82, 0.58],
      [0.7, 0.76], [0.5, 0.84], [0.3, 0.76], [0.18, 0.58],
      [0.18, 0.38], [0.3, 0.2],
      [0.4, 0.45], [0.6, 0.45], // eyes
      [0.5, 0.6], // nose
    ],
    edges: [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
      [6, 7], [7, 8], [8, 9], [9, 0],
      [10, 11], [10, 12], [11, 12],
    ],
  },
  {
    // Lightning Bolt
    name: "Lightning Bolt",
    points: [
      [0.45, 0.1], [0.6, 0.1], [0.48, 0.35], [0.62, 0.35],
      [0.42, 0.65], [0.58, 0.65], [0.35, 0.9], [0.5, 0.9],
      [0.55, 0.5], // center flash point
    ],
    edges: [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
      [0, 2], [3, 8], [8, 5],
    ],
  },
  {
    // Rose
    name: "Rose",
    points: [
      [0.5, 0.15], [0.62, 0.22], [0.68, 0.36], [0.6, 0.48],
      [0.5, 0.42], [0.4, 0.48], [0.32, 0.36], [0.38, 0.22],
      [0.5, 0.55], // center
      [0.5, 0.7], [0.5, 0.88], // stem
      [0.38, 0.75], [0.62, 0.75], // leaves
    ],
    edges: [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
      [4, 8], [8, 9], [9, 10], [9, 11], [9, 12],
    ],
  },
  {
    // Terrapin (turtle top-down)
    name: "Terrapin",
    points: [
      [0.5, 0.12], // head
      [0.4, 0.25], [0.6, 0.25], // front flippers
      [0.35, 0.35], [0.65, 0.35], // shell top
      [0.3, 0.5], [0.7, 0.5], // shell mid
      [0.35, 0.65], [0.65, 0.65], // shell bottom
      [0.5, 0.5], // shell center
      [0.4, 0.75], [0.6, 0.75], // rear flippers
      [0.5, 0.85], // tail
    ],
    edges: [
      [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6],
      [5, 7], [6, 8], [7, 10], [8, 11], [10, 12], [11, 12],
      [3, 9], [4, 9], [7, 9], [8, 9],
    ],
  },
];

interface BgStar {
  x: number;
  y: number;
  size: number;
  twinkleFreq: number;
  twinklePhase: number;
  brightness: number;
}

function generateBgStars(seed: number, count: number): BgStar[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: rng(),
    y: rng(),
    size: 0.5 + rng() * 1.5,
    twinkleFreq: 0.02 + rng() * 0.06,
    twinklePhase: rng() * Math.PI * 2,
    brightness: 0.3 + rng() * 0.7,
  }));
}

const CYCLE = 1500; // 50s at 30fps
const DURATION = 360; // 12s
const LINE_DRAW_FRAMES = 10; // frames per line segment

interface Props {
  frames: EnhancedFrameData[];
}

export const Constellation: React.FC<Props> = ({ frames }) => {
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

  const bgStars = React.useMemo(() => generateBgStars(3141592, 80), []);

  // Determine which constellation is active
  const cycleFrame = frame % CYCLE;
  const constellationIndex = Math.floor(frame / CYCLE) % CONSTELLATIONS.length;
  const constellation = CONSTELLATIONS[constellationIndex];
  const isActive = cycleFrame < DURATION;

  // Constellation position offset (centered, scaled)
  const scale = Math.min(width, height) * 0.3;
  const offsetX = width * 0.5 - scale * 0.5;
  const offsetY = height * 0.5 - scale * 0.5;

  // Fade for constellation
  const constFadeIn = isActive
    ? interpolate(cycleFrame, [0, 45], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  const constFadeOut = isActive
    ? interpolate(cycleFrame, [DURATION - 60, DURATION], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const constOpacity = Math.min(constFadeIn, constFadeOut) * (0.6 + energy * 0.3);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height}>
        <defs>
          <filter id="star-glow-const">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background star field — always visible */}
        {bgStars.map((star, i) => {
          const twinkle =
            (Math.sin(frame * star.twinkleFreq + star.twinklePhase) + 1) * 0.5;
          const alpha = star.brightness * (0.3 + twinkle * 0.7) * 0.25;
          return (
            <circle
              key={`bg${i}`}
              cx={star.x * width}
              cy={star.y * height}
              r={star.size}
              fill={`rgba(200, 220, 255, ${alpha})`}
            />
          );
        })}

        {/* Active constellation */}
        {isActive && constOpacity > 0.01 && (
          <g opacity={constOpacity}>
            {/* Draw lines sequentially */}
            {constellation.edges.map(([a, b], lineIdx) => {
              const lineStart = lineIdx * LINE_DRAW_FRAMES;
              const lineProgress = interpolate(
                cycleFrame,
                [lineStart, lineStart + LINE_DRAW_FRAMES],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
              if (lineProgress <= 0) return null;

              const pA = constellation.points[a];
              const pB = constellation.points[b];
              const x1 = offsetX + pA[0] * scale;
              const y1 = offsetY + pA[1] * scale;
              const x2Full = offsetX + pB[0] * scale;
              const y2Full = offsetY + pB[1] * scale;

              // Partially drawn line
              const x2 = x1 + (x2Full - x1) * lineProgress;
              const y2 = y1 + (y2Full - y1) * lineProgress;

              return (
                <line
                  key={`line${lineIdx}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(180, 210, 255, 0.5)"
                  strokeWidth={1}
                  strokeLinecap="round"
                />
              );
            })}

            {/* Star points */}
            {constellation.points.map(([px, py], pi) => {
              const twinkle =
                (Math.sin(frame * 0.08 + pi * 1.7) + 1) * 0.5;
              const sx = offsetX + px * scale;
              const sy = offsetY + py * scale;
              const r = 2 + twinkle * 1.5 + energy * 1;

              return (
                <g key={`star${pi}`}>
                  <circle
                    cx={sx}
                    cy={sy}
                    r={r * 2.5}
                    fill={`rgba(180, 210, 255, ${0.15 * twinkle})`}
                    style={{ filter: "blur(3px)" }}
                  />
                  <circle
                    cx={sx}
                    cy={sy}
                    r={r}
                    fill={`rgba(220, 235, 255, ${0.7 + twinkle * 0.3})`}
                    filter="url(#star-glow-const)"
                  />
                </g>
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
};
