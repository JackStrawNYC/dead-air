/**
 * MountainRange -- Layered parallax mountain silhouettes.
 * 3-4 layers of mountain ridgeline at different depths across bottom 40% of screen.
 * Each layer moves at different parallax speed (back layer slowest).
 * Dark blue/purple/black gradient layers. Stars twinkle above mountains.
 * Moon or sun circle. Cycle: 70s (2100 frames), 22s (660 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface MountainLayer {
  /** Points defining the ridgeline (x, y pairs normalized 0-1) */
  points: [number, number][];
  /** Fill color */
  color: string;
  /** Parallax speed multiplier (smaller = slower = farther away) */
  parallaxSpeed: number;
  /** Base height from bottom (0-1) */
  baseHeight: number;
}

interface StarData {
  x: number;
  y: number;
  size: number;
  twinkleFreq: number;
  twinklePhase: number;
  brightness: number;
}

function generateRidgeline(rng: () => number, numPeaks: number, heightRange: [number, number]): [number, number][] {
  const points: [number, number][] = [];
  const numPoints = numPeaks * 3 + 2;

  for (let i = 0; i <= numPoints; i++) {
    const x = i / numPoints;
    // Create peaks and valleys
    const isPeak = i % 3 === 1;
    const baseH = heightRange[0];
    const maxH = heightRange[1];
    const h = isPeak
      ? baseH + (maxH - baseH) * (0.6 + rng() * 0.4)
      : baseH + (maxH - baseH) * (rng() * 0.3);
    points.push([x, h]);
  }
  return points;
}

function generateLayers(seed: number): MountainLayer[] {
  const rng = seeded(seed);
  return [
    {
      points: generateRidgeline(rng, 5, [0.15, 0.38]),
      color: "rgba(25, 20, 50, 0.6)",
      parallaxSpeed: 0.15,
      baseHeight: 0.38,
    },
    {
      points: generateRidgeline(rng, 4, [0.2, 0.35]),
      color: "rgba(20, 15, 45, 0.7)",
      parallaxSpeed: 0.3,
      baseHeight: 0.32,
    },
    {
      points: generateRidgeline(rng, 6, [0.12, 0.28]),
      color: "rgba(12, 8, 30, 0.8)",
      parallaxSpeed: 0.5,
      baseHeight: 0.25,
    },
    {
      points: generateRidgeline(rng, 7, [0.08, 0.2]),
      color: "rgba(5, 3, 15, 0.9)",
      parallaxSpeed: 0.8,
      baseHeight: 0.18,
    },
  ];
}

function generateStars(seed: number, count: number): StarData[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: rng(),
    y: rng() * 0.55, // upper 55% of screen
    size: 0.5 + rng() * 2,
    twinkleFreq: 0.015 + rng() * 0.06,
    twinklePhase: rng() * Math.PI * 2,
    brightness: 0.3 + rng() * 0.7,
  }));
}

const CYCLE = 2100; // 70s
const VISIBLE_DURATION = 660; // 22s

interface Props {
  frames: EnhancedFrameData[];
}

export const MountainRange: React.FC<Props> = ({ frames }) => {
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

  const layers = React.useMemo(() => generateLayers(70197708), []);
  const stars = React.useMemo(() => generateStars(70317708, 60), []);

  const cycleFrame = frame % CYCLE;
  const isVisible = cycleFrame < VISIBLE_DURATION;

  const fadeIn = isVisible
    ? interpolate(cycleFrame, [0, 75], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  const fadeOut = isVisible
    ? interpolate(cycleFrame, [VISIBLE_DURATION - 75, VISIBLE_DURATION], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const masterOpacity = Math.min(fadeIn, fadeOut);

  if (!isVisible || masterOpacity < 0.01) return null;

  // Moon glow
  const moonGlow = interpolate(energy, [0.05, 0.25], [0.4, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const moonX = width * 0.78;
  const moonY = height * 0.15;
  const moonRadius = 30;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <radialGradient id="moon-glow-grad">
            <stop offset="0%" stopColor={`rgba(220, 230, 255, ${moonGlow})`} />
            <stop offset="40%" stopColor={`rgba(180, 200, 240, ${moonGlow * 0.4})`} />
            <stop offset="100%" stopColor="rgba(150, 170, 220, 0)" />
          </radialGradient>
        </defs>

        {/* Stars */}
        {stars.map((star, si) => {
          const twinkle = (Math.sin(frame * star.twinkleFreq + star.twinklePhase) + 1) * 0.5;
          const alpha = star.brightness * (0.2 + twinkle * 0.8) * 0.6;
          return (
            <circle
              key={`s${si}`}
              cx={star.x * width}
              cy={star.y * height}
              r={star.size + twinkle * 0.5}
              fill={`rgba(200, 215, 255, ${alpha})`}
            />
          );
        })}

        {/* Moon */}
        <circle
          cx={moonX}
          cy={moonY}
          r={moonRadius * 3}
          fill="url(#moon-glow-grad)"
        />
        <circle
          cx={moonX}
          cy={moonY}
          r={moonRadius}
          fill={`rgba(230, 235, 255, ${moonGlow * 0.9})`}
          style={{ filter: `drop-shadow(0 0 15px rgba(200, 220, 255, ${moonGlow * 0.6}))` }}
        />

        {/* Mountain layers (back to front) */}
        {layers.map((layer, li) => {
          // Parallax horizontal drift
          const drift = Math.sin(frame * 0.003 * layer.parallaxSpeed) * 40 * layer.parallaxSpeed;

          // Build SVG path from ridgeline points
          const pathPoints = layer.points.map(([px, py]) => {
            const screenX = (px * width * 1.3 - width * 0.15) + drift;
            const screenY = height - py * height;
            return `${screenX},${screenY}`;
          });

          const pathD = `M ${-20 + drift},${height} L ${pathPoints.join(" L ")} L ${width + 20 + drift},${height} Z`;

          return (
            <path
              key={`layer${li}`}
              d={pathD}
              fill={layer.color}
            />
          );
        })}
      </svg>
    </div>
  );
};
