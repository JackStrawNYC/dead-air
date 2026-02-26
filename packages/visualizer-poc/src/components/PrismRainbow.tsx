/**
 * PrismRainbow — A triangular prism with a white beam entering and splitting
 * into a full rainbow spectrum. Pink Floyd meets the Dead. Rainbow bands spread
 * wider with energy. Prism rotates slightly. Each color band's brightness maps
 * to a frequency band. Cycle: 55s (1650 frames), visible 16s (480 frames).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1650; // 55s at 30fps
const DURATION = 480; // 16s visible

interface Props {
  frames: EnhancedFrameData[];
}

// Rainbow bands mapped to frequency fields
const RAINBOW_BANDS: { color: string; field: keyof EnhancedFrameData }[] = [
  { color: "#FF0000", field: "sub" },
  { color: "#FF6600", field: "low" },
  { color: "#FFFF00", field: "low" },
  { color: "#00FF00", field: "mid" },
  { color: "#0088FF", field: "mid" },
  { color: "#4400FF", field: "high" },
  { color: "#8800FF", field: "high" },
];

export const PrismRainbow: React.FC<Props> = ({ frames }) => {
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

  // Cycle gating
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
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.02, 0.2], [0.4, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  // Prism position and geometry
  const prismCx = width * 0.38;
  const prismCy = height * 0.5;
  const prismSize = Math.min(width, height) * 0.15;

  // Slight rotation driven by energy
  const prismRotation = Math.sin(frame * 0.008) * 3 + energy * 5;

  // Triangle points (equilateral)
  const triPoints = [
    { x: 0, y: -prismSize },
    { x: prismSize * 0.866, y: prismSize * 0.5 },
    { x: -prismSize * 0.866, y: prismSize * 0.5 },
  ];
  const triPath = `M ${triPoints[0].x} ${triPoints[0].y} L ${triPoints[1].x} ${triPoints[1].y} L ${triPoints[2].x} ${triPoints[2].y} Z`;

  // White beam enters from left
  const beamStartX = -prismCx;
  const beamEndX = -prismSize * 0.866;
  const beamY = 0;

  // Rainbow spread driven by energy
  const spreadAngle = interpolate(energy, [0.03, 0.3], [8, 28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Rainbow beam exit point (right side of prism)
  const exitX = prismSize * 0.866;
  const exitY = 0;
  const beamLength = width * 0.55;

  const currentFrame = frames[idx];

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: "drop-shadow(0 0 15px rgba(255, 255, 255, 0.3))",
          willChange: "opacity",
        }}
      >
        <defs>
          <linearGradient id="prism-face" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(200, 220, 255, 0.15)" />
            <stop offset="50%" stopColor="rgba(150, 180, 255, 0.08)" />
            <stop offset="100%" stopColor="rgba(100, 140, 255, 0.12)" />
          </linearGradient>
          <filter id="prism-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="rainbow-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${prismCx}, ${prismCy}) rotate(${prismRotation})`}>
          {/* White beam entering from left */}
          <line
            x1={beamStartX}
            y1={beamY}
            x2={beamEndX}
            y2={beamY}
            stroke="rgba(255, 255, 255, 0.9)"
            strokeWidth={3}
            filter="url(#prism-glow)"
          />
          {/* Wider glow on beam */}
          <line
            x1={beamStartX}
            y1={beamY}
            x2={beamEndX}
            y2={beamY}
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth={10}
          />

          {/* Prism body */}
          <path
            d={triPath}
            fill="url(#prism-face)"
            stroke="rgba(180, 200, 255, 0.6)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {/* Prism internal refraction highlight */}
          <path
            d={`M ${triPoints[0].x * 0.5} ${triPoints[0].y * 0.5} L ${triPoints[1].x * 0.5} ${triPoints[1].y * 0.5} L ${triPoints[2].x * 0.5} ${triPoints[2].y * 0.5} Z`}
            fill="none"
            stroke="rgba(200, 220, 255, 0.15)"
            strokeWidth={1}
          />

          {/* Rainbow bands exiting right side */}
          {RAINBOW_BANDS.map((band, i) => {
            const bandAngle = ((i - (RAINBOW_BANDS.length - 1) / 2) / RAINBOW_BANDS.length) * spreadAngle;
            const rad = (bandAngle * Math.PI) / 180;
            const endX = exitX + Math.cos(rad) * beamLength;
            const endY = exitY + Math.sin(rad) * beamLength;

            // Get band brightness from frequency data
            const fieldValue = currentFrame[band.field] as number;
            const bandOpacity = interpolate(fieldValue, [0, 0.5], [0.3, 1.0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            return (
              <React.Fragment key={i}>
                {/* Main band line */}
                <line
                  x1={exitX}
                  y1={exitY}
                  x2={endX}
                  y2={endY}
                  stroke={band.color}
                  strokeWidth={interpolate(energy, [0.03, 0.3], [2, 4.5], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })}
                  opacity={bandOpacity}
                  filter="url(#rainbow-glow)"
                />
                {/* Wide glow behind each band */}
                <line
                  x1={exitX}
                  y1={exitY}
                  x2={endX}
                  y2={endY}
                  stroke={band.color}
                  strokeWidth={interpolate(energy, [0.03, 0.3], [6, 14], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })}
                  opacity={bandOpacity * 0.15}
                />
              </React.Fragment>
            );
          })}

          {/* Refraction point glow at exit */}
          <circle
            cx={exitX}
            cy={exitY}
            r={4}
            fill="rgba(255, 255, 255, 0.8)"
            filter="url(#prism-glow)"
          />
        </g>
      </svg>
    </div>
  );
};
