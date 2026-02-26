/**
 * GodRays — Volumetric light beam cones radiating from top of screen downward.
 * 5-8 beams with soft edges (gradient opacity). Beams slowly sweep left/right.
 * Energy drives beam brightness and width. Warm golden color during quiet,
 * shifts to white/blue during peaks.
 * Cycle: 60s (1800 frames), 20s (600 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface RayData {
  /** X origin position (0-1 across top of screen) */
  originX: number;
  /** Sweep frequency (how fast beam moves left/right) */
  sweepFreq: number;
  /** Sweep amplitude (fraction of width) */
  sweepAmp: number;
  /** Sweep phase */
  sweepPhase: number;
  /** Base cone angle (radians, width of beam spread) */
  coneAngle: number;
  /** Beam length as fraction of height (0.6-1.0) */
  length: number;
  /** Base opacity multiplier */
  opacityMult: number;
}

const NUM_RAYS = 7;
const CYCLE = 1800;     // 60s
const DURATION = 600;   // 20s

function generateRays(seed: number): RayData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_RAYS }, () => ({
    originX: 0.1 + rng() * 0.8,
    sweepFreq: 0.003 + rng() * 0.008,
    sweepAmp: 0.03 + rng() * 0.06,
    sweepPhase: rng() * Math.PI * 2,
    coneAngle: 0.04 + rng() * 0.06,
    length: 0.65 + rng() * 0.35,
    opacityMult: 0.5 + rng() * 0.5,
  }));
}

function buildRayPath(
  originX: number,
  originY: number,
  coneAngle: number,
  beamLength: number,
  sweepOffset: number,
  width: number,
): string {
  // Triangle cone from origin point spreading downward
  const adjustedX = originX + sweepOffset * width;
  const halfSpread = beamLength * Math.tan(coneAngle);

  const bottomLeftX = adjustedX - halfSpread;
  const bottomRightX = adjustedX + halfSpread;
  const bottomY = originY + beamLength;

  return `M ${adjustedX} ${originY} L ${bottomLeftX} ${bottomY} L ${bottomRightX} ${bottomY} Z`;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const GodRays: React.FC<Props> = ({ frames }) => {
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

  const rays = React.useMemo(() => generateRays(19775508), []);

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
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.45;

  if (masterOpacity < 0.01) return null;

  // Energy drives beam brightness boost
  const brightnessMult = interpolate(energy, [0.05, 0.35], [0.5, 1.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Energy drives beam width
  const widthMult = interpolate(energy, [0.05, 0.35], [0.7, 1.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Color shift: warm golden when quiet, white/blue during peaks
  const hue = interpolate(energy, [0.05, 0.35], [42, 210], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const saturation = interpolate(energy, [0.05, 0.35], [80, 30], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lightness = interpolate(energy, [0.05, 0.35], [65, 90], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const originY = -10; // Just above screen

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: masterOpacity, pointerEvents: "none" }}
      >
        <defs>
          {rays.map((ray, ri) => {
            const gradId = `godray-grad-${ri}`;
            return (
              <linearGradient key={gradId} id={gradId} x1="0.5" y1="0" x2="0.5" y2="1">
                <stop
                  offset="0%"
                  stopColor={`hsl(${hue}, ${saturation}%, ${lightness}%)`}
                  stopOpacity={0.3 * ray.opacityMult * brightnessMult}
                />
                <stop
                  offset="50%"
                  stopColor={`hsl(${hue}, ${saturation}%, ${lightness}%)`}
                  stopOpacity={0.12 * ray.opacityMult * brightnessMult}
                />
                <stop
                  offset="100%"
                  stopColor={`hsl(${hue}, ${saturation}%, ${lightness}%)`}
                  stopOpacity="0"
                />
              </linearGradient>
            );
          })}
          <filter id="godray-blur">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        {rays.map((ray, ri) => {
          const sweepOffset = Math.sin(frame * ray.sweepFreq + ray.sweepPhase) * ray.sweepAmp;
          const beamLength = height * ray.length;
          const adjustedConeAngle = ray.coneAngle * widthMult;
          const originX = ray.originX * width;

          const path = buildRayPath(originX, originY, adjustedConeAngle, beamLength, sweepOffset, width);

          return (
            <path
              key={ri}
              d={path}
              fill={`url(#godray-grad-${ri})`}
              filter="url(#godray-blur)"
            />
          );
        })}
      </svg>
    </div>
  );
};
