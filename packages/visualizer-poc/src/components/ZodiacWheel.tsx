/**
 * ZodiacWheel — Circular zodiac constellation wheel. 12 segments with
 * constellation dot patterns connected by lines. Wheel slowly rotates.
 * Current "active" constellation glows brighter (cycles through them).
 * Starry dots twinkle. Deep indigo/purple background ring with silver/white
 * constellation lines. Energy drives twinkle rate and glow.
 * Cycle: 80s, 22s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2400; // 80s at 30fps
const DURATION = 660; // 22s visible
const NUM_CONSTELLATIONS = 12;

/** Constellation: stars as [x,y] in local coords, edges as index pairs */
interface ZodiacConstellation {
  name: string;
  stars: [number, number][];
  edges: [number, number][];
}

// Simplified constellation patterns for each zodiac sign
const ZODIAC: ZodiacConstellation[] = [
  { // Aries
    name: "Aries",
    stars: [[0, -12], [5, -6], [8, 0], [4, 6], [-2, 10]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  { // Taurus
    name: "Taurus",
    stars: [[-8, -8], [-3, -4], [0, 0], [6, -3], [10, -6], [0, 6], [-4, 8]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6]],
  },
  { // Gemini
    name: "Gemini",
    stars: [[-5, -10], [-5, -3], [-5, 4], [-5, 10], [5, -10], [5, -3], [5, 4], [5, 10]],
    edges: [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [1, 5], [2, 6]],
  },
  { // Cancer
    name: "Cancer",
    stars: [[-6, -6], [-2, -2], [2, 2], [6, 6], [-4, 4], [4, -4]],
    edges: [[0, 1], [1, 2], [2, 3], [1, 4], [2, 5]],
  },
  { // Leo
    name: "Leo",
    stars: [[0, -10], [6, -6], [8, 0], [4, 6], [-2, 8], [-6, 4], [-4, -2], [0, -4]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0]],
  },
  { // Virgo
    name: "Virgo",
    stars: [[-6, -10], [-2, -5], [2, -8], [0, 0], [-4, 3], [4, 3], [0, 8], [6, 10]],
    edges: [[0, 1], [1, 2], [1, 3], [3, 4], [3, 5], [4, 6], [5, 7]],
  },
  { // Libra
    name: "Libra",
    stars: [[-8, 0], [0, 0], [8, 0], [-4, 8], [4, 8], [0, -6]],
    edges: [[0, 1], [1, 2], [0, 3], [2, 4], [1, 5]],
  },
  { // Scorpio
    name: "Scorpio",
    stars: [[-8, -4], [-4, -2], [0, 0], [4, 2], [8, 0], [10, -4], [12, -2]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  { // Sagittarius
    name: "Sagittarius",
    stars: [[-8, 8], [-4, 4], [0, 0], [4, -4], [8, -8], [2, 4], [-2, -4]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [2, 6]],
  },
  { // Capricorn
    name: "Capricorn",
    stars: [[-6, -6], [-2, -2], [2, 0], [6, -2], [8, 2], [4, 6], [0, 8]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  { // Aquarius
    name: "Aquarius",
    stars: [[-8, -4], [-4, 0], [0, -4], [4, 0], [8, -4], [0, 6], [4, 8]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [5, 6]],
  },
  { // Pisces
    name: "Pisces",
    stars: [[-6, -8], [-4, -3], [-6, 2], [-4, 7], [6, -8], [4, -3], [6, 2], [4, 7], [0, -3]],
    edges: [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [1, 8], [5, 8]],
  },
];

interface TwinkleStar {
  x: number;
  y: number;
  size: number;
  freq: number;
  phase: number;
}

function generateTwinkleStars(seed: number, count: number): TwinkleStar[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: rng(),
    y: rng(),
    size: 0.5 + rng() * 1.5,
    freq: 0.02 + rng() * 0.06,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const ZodiacWheel: React.FC<Props> = ({ frames }) => {
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

  const twinkleStars = React.useMemo(() => generateTwinkleStars(2718281, 40), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * (0.4 + energy * 0.35);

  if (masterOpacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const wheelRadius = Math.min(width, height) * 0.32;
  const constellationRadius = 14; // size of each constellation pattern

  // Slow rotation
  const rotation = frame * 0.08;

  // Active constellation cycles: one lights up at a time
  const activeIdx = Math.floor((cycleFrame / DURATION) * NUM_CONSTELLATIONS * 2) % NUM_CONSTELLATIONS;

  // Twinkle rate driven by energy
  const twinkleSpeedMult = 1 + energy * 2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 6px rgba(100, 100, 200, 0.3))`,
        }}
      >
        <defs>
          <filter id="zodiac-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="zodiac-bright">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background indigo ring */}
        <circle
          cx={cx}
          cy={cy}
          r={wheelRadius + 20}
          stroke="rgba(60, 50, 120, 0.25)"
          strokeWidth={40}
          fill="none"
        />
        <circle
          cx={cx}
          cy={cy}
          r={wheelRadius + 20}
          stroke="rgba(80, 70, 160, 0.15)"
          strokeWidth={2}
          fill="none"
        />
        <circle
          cx={cx}
          cy={cy}
          r={wheelRadius - 20}
          stroke="rgba(80, 70, 160, 0.15)"
          strokeWidth={1}
          fill="none"
        />

        {/* Segment divider lines */}
        {Array.from({ length: NUM_CONSTELLATIONS }, (_, i) => {
          const angle = (i / NUM_CONSTELLATIONS) * Math.PI * 2 + (rotation * Math.PI) / 180;
          const innerR = wheelRadius - 22;
          const outerR = wheelRadius + 22;
          return (
            <line
              key={`div-${i}`}
              x1={cx + Math.cos(angle) * innerR}
              y1={cy + Math.sin(angle) * innerR}
              x2={cx + Math.cos(angle) * outerR}
              y2={cy + Math.sin(angle) * outerR}
              stroke="rgba(100, 90, 180, 0.15)"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Constellation patterns arranged in wheel */}
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
          {ZODIAC.map((zodiac, zi) => {
            const segAngle = (zi / NUM_CONSTELLATIONS) * Math.PI * 2;
            const isActive = zi === activeIdx;
            const activeGlow = isActive
              ? interpolate(
                  (Math.sin(frame * 0.08) + 1) * 0.5,
                  [0, 1],
                  [0.6, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                )
              : 0;

            // Position constellation at center of its segment
            const constellationX = Math.cos(segAngle) * wheelRadius;
            const constellationY = Math.sin(segAngle) * wheelRadius;

            const starColor = isActive
              ? `rgba(220, 230, 255, ${0.7 + activeGlow * 0.3})`
              : `rgba(180, 190, 220, ${0.4 + energy * 0.2})`;

            const lineColor = isActive
              ? `rgba(200, 210, 255, ${0.5 + activeGlow * 0.3})`
              : `rgba(140, 150, 190, ${0.25 + energy * 0.1})`;

            const filterRef = isActive ? "url(#zodiac-bright)" : "url(#zodiac-glow)";

            return (
              <g
                key={zi}
                transform={`translate(${constellationX}, ${constellationY})`}
              >
                {/* Active glow background */}
                {isActive && (
                  <circle
                    cx={0}
                    cy={0}
                    r={constellationRadius * 2}
                    fill={`rgba(100, 120, 255, ${0.08 + activeGlow * 0.08})`}
                    style={{ filter: "blur(6px)" }}
                  />
                )}

                {/* Constellation lines */}
                {zodiac.edges.map(([a, b], ei) => (
                  <line
                    key={`edge-${ei}`}
                    x1={zodiac.stars[a][0]}
                    y1={zodiac.stars[a][1]}
                    x2={zodiac.stars[b][0]}
                    y2={zodiac.stars[b][1]}
                    stroke={lineColor}
                    strokeWidth={isActive ? 1.2 : 0.7}
                    strokeLinecap="round"
                  />
                ))}

                {/* Star dots */}
                {zodiac.stars.map(([sx, sy], si) => {
                  const twinkle =
                    (Math.sin(frame * (0.05 + si * 0.01) * twinkleSpeedMult + si * 2.3 + zi * 1.7) + 1) * 0.5;
                  const r = isActive
                    ? 1.5 + twinkle * 1.5 + energy * 1
                    : 1 + twinkle * 0.8;

                  return (
                    <g key={`star-${si}`}>
                      {/* Twinkle glow */}
                      <circle
                        cx={sx}
                        cy={sy}
                        r={r * 2.5}
                        fill={starColor}
                        opacity={0.15 + twinkle * 0.15}
                        style={{ filter: "blur(2px)" }}
                      />
                      {/* Core star */}
                      <circle
                        cx={sx}
                        cy={sy}
                        r={r}
                        fill={starColor}
                        filter={filterRef}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>

        {/* Ambient twinkle stars in background (outside wheel) */}
        {twinkleStars.map((star, si) => {
          const sx = star.x * width;
          const sy = star.y * height;

          // Skip stars that would be inside the wheel
          const dx = sx - cx;
          const dy = sy - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < wheelRadius + 30 && dist > wheelRadius - 30) return null;

          const twinkle = (Math.sin(frame * star.freq * twinkleSpeedMult + star.phase) + 1) * 0.5;
          const alpha = 0.15 + twinkle * 0.35;

          return (
            <circle
              key={`twinkle-${si}`}
              cx={sx}
              cy={sy}
              r={star.size * (0.7 + twinkle * 0.3)}
              fill={`rgba(200, 210, 240, ${alpha})`}
            />
          );
        })}

        {/* Center point of wheel */}
        <circle
          cx={cx}
          cy={cy}
          r={3 + energy * 3}
          fill={`rgba(180, 190, 255, ${0.4 + energy * 0.3})`}
          filter="url(#zodiac-glow)"
        />
      </svg>
    </div>
  );
};
