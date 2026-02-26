/**
 * Sextant — Nautical sextant arc instrument. Main graduated arc spans
 * 60 degrees. Index arm sweeps with energy (low energy = low angle,
 * high energy = high angle). Horizon mirror and index mirror indicated.
 * Telescope tube extends from body. Vernier scale detail near the arc.
 * Neon brass/blue-white colors. Positioned lower-left.
 * Appears every 80s for 12s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2400; // 80 seconds at 30fps
const DURATION = 360; // 12 seconds visible

interface Props {
  frames: EnhancedFrameData[];
}

export const Sextant: React.FC<Props> = ({ frames }) => {
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

  // Timing gate
  const cycleFrame = frame % CYCLE;
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
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.2, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const fd = frames[idx];

  // Position lower-left
  const cx = width * 0.22;
  const cy = height * 0.75;
  const arcRadius = Math.min(width, height) * 0.2;

  // Index arm angle driven by energy: 0-60 degrees on the sextant arc
  const beatJitter = fd.beat ? fd.onset * 8 : 0;
  const indexAngle = interpolate(energy, [0, 0.5], [5, 55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) + Math.sin(frame * 0.1) * 2 + beatJitter;

  // The sextant arc spans from -30 to +30 degrees (60 degree total)
  // We orient it so 0 degrees points right, arc curves downward
  const arcStartDeg = -30;
  const arcEndDeg = 30;

  const brass = "#CCAA44";
  const blueWhite = "#CCDDFF";
  const darkBrass = "#AA8833";
  const highlight = "#FFEEBB";

  const glowSize = interpolate(energy, [0.02, 0.3], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Arc helper: degree to arc point (arc opens downward from pivot)
  const arcPoint = (deg: number, r: number) => {
    const rad = ((deg + 90) * Math.PI) / 180; // +90 so 0 is down
    return { x: Math.cos(rad) * r, y: Math.sin(rad) * r };
  };

  // Build graduated arc path
  const arcStart = arcPoint(arcStartDeg, arcRadius);
  const arcEnd = arcPoint(arcEndDeg, arcRadius);

  // Index arm end point
  const indexDeg = arcStartDeg + indexAngle; // maps into arc range
  const indexEnd = arcPoint(indexDeg, arcRadius * 1.05);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px ${brass}) drop-shadow(0 0 ${glowSize * 1.2}px ${blueWhite})`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Main graduated arc */}
          <path
            d={`M ${arcStart.x} ${arcStart.y} A ${arcRadius} ${arcRadius} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
            fill="none"
            stroke={brass}
            strokeWidth={3}
            opacity={0.7}
          />

          {/* Inner arc */}
          {(() => {
            const innerR = arcRadius * 0.93;
            const iStart = arcPoint(arcStartDeg, innerR);
            const iEnd = arcPoint(arcEndDeg, innerR);
            return (
              <path
                d={`M ${iStart.x} ${iStart.y} A ${innerR} ${innerR} 0 0 1 ${iEnd.x} ${iEnd.y}`}
                fill="none"
                stroke={darkBrass}
                strokeWidth={1}
                opacity={0.35}
              />
            );
          })()}

          {/* Degree tick marks on the arc */}
          {Array.from({ length: 13 }, (_, i) => {
            const deg = arcStartDeg + i * 5; // every 5 degrees
            const isMajor = i % 2 === 0;
            const innerR = arcRadius * (isMajor ? 0.9 : 0.94);
            const outerR = arcRadius;
            const inner = arcPoint(deg, innerR);
            const outer = arcPoint(deg, outerR);
            const labelPt = arcPoint(deg, arcRadius * 1.08);
            return (
              <g key={`tick-${i}`}>
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={brass}
                  strokeWidth={isMajor ? 1.8 : 0.8}
                  opacity={isMajor ? 0.7 : 0.35}
                />
                {isMajor && (
                  <text
                    x={labelPt.x}
                    y={labelPt.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={highlight}
                    fontSize={9}
                    fontFamily="monospace"
                    opacity={0.5}
                  >
                    {i * 5}
                  </text>
                )}
              </g>
            );
          })}

          {/* Frame / body: two lines from pivot to arc ends */}
          <line x1={0} y1={0} x2={arcStart.x} y2={arcStart.y} stroke={brass} strokeWidth={2} opacity={0.5} />
          <line x1={0} y1={0} x2={arcEnd.x} y2={arcEnd.y} stroke={brass} strokeWidth={2} opacity={0.5} />

          {/* Telescope tube extending upward-left from pivot */}
          <line
            x1={0}
            y1={0}
            x2={-arcRadius * 0.7}
            y2={-arcRadius * 0.4}
            stroke={darkBrass}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.4}
          />
          {/* Eyepiece */}
          <circle
            cx={-arcRadius * 0.7}
            cy={-arcRadius * 0.4}
            r={5}
            fill="none"
            stroke={brass}
            strokeWidth={2}
            opacity={0.4}
          />

          {/* Horizon mirror indicator (small rectangle at one frame arm) */}
          <rect
            x={arcEnd.x * 0.5 - 4}
            y={arcEnd.y * 0.5 - 8}
            width={8}
            height={16}
            rx={1}
            fill="none"
            stroke={blueWhite}
            strokeWidth={1}
            opacity={0.3}
          />

          {/* Index arm (sweeps along the arc) */}
          <line
            x1={0}
            y1={0}
            x2={indexEnd.x}
            y2={indexEnd.y}
            stroke={highlight}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.85}
          />

          {/* Index mirror at pivot */}
          <rect
            x={-3}
            y={-10}
            width={6}
            height={12}
            rx={1}
            fill="none"
            stroke={blueWhite}
            strokeWidth={1.2}
            opacity={0.4}
          />

          {/* Pivot center */}
          <circle cx={0} cy={0} r={4} fill={brass} opacity={0.7} />
          <circle cx={0} cy={0} r={2} fill={highlight} opacity={0.5} />

          {/* Angle readout */}
          <text
            x={0}
            y={arcRadius * 0.35}
            textAnchor="middle"
            dominantBaseline="central"
            fill={highlight}
            fontSize={12}
            fontFamily="monospace"
            opacity={0.5}
          >
            {indexAngle.toFixed(1)}&deg;
          </text>
        </g>
      </svg>
    </div>
  );
};
