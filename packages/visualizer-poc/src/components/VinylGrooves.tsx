/**
 * VinylGrooves — Close-up spinning vinyl record positioned bottom-right (150x150px).
 * Detailed grooves as concentric circles with varying spacing.
 * Tone arm SVG pivoting slightly. Label in center with "GRATEFUL DEAD" text.
 * RPM scales with energy. Groove highlight line rotates with the record.
 * Always visible at 40-60% opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
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

const RECORD_SIZE = 150;
const CX = 75;
const CY = 75;

interface GrooveRing {
  r: number;
  width: number;
  opacity: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const VinylGrooves: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Generate groove rings deterministically
  const grooves = React.useMemo(() => {
    const rng = seeded(33_45_78);
    const rings: GrooveRing[] = [];
    let r = 22; // start outside label
    while (r < 70) {
      const spacing = 1.2 + rng() * 1.8;
      r += spacing;
      if (r >= 70) break;
      rings.push({
        r,
        width: 0.3 + rng() * 0.5,
        opacity: 0.15 + rng() * 0.25,
      });
    }
    return rings;
  }, []);

  // RPM scales with energy: 33rpm base, up to 78rpm feel at peak
  const rpm = interpolate(energy, [0, 0.4], [1.0, 3.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Accumulated rotation (degrees per frame at 30fps)
  // 33rpm = 33 rev/min = 33*360/1800 deg/frame = 6.6 deg/frame
  const degreesPerFrame = 6.6 * rpm;
  const rotation = (frame * degreesPerFrame) % 360;

  // Tone arm pivot: slight wobble based on energy
  const armAngle = -32 + Math.sin(frame * 0.02) * 2 + energy * 5;

  // Master opacity: 40-60% based on energy
  const masterOpacity = interpolate(energy, [0, 0.3], [0.4, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Groove highlight angle follows rotation
  const highlightAngle = rotation;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        right: 20,
        width: RECORD_SIZE + 30,
        height: RECORD_SIZE + 10,
        pointerEvents: "none",
        opacity: masterOpacity,
        filter: "drop-shadow(0 0 8px rgba(200, 160, 255, 0.4))",
      }}
    >
      <svg
        width={RECORD_SIZE + 30}
        height={RECORD_SIZE + 10}
        viewBox={`0 0 ${RECORD_SIZE + 30} ${RECORD_SIZE + 10}`}
        fill="none"
      >
        {/* Record body */}
        <g transform={`rotate(${rotation} ${CX} ${CY})`}>
          {/* Outer edge */}
          <circle cx={CX} cy={CY} r={72} fill="#111" stroke="#333" strokeWidth={1.5} />

          {/* Grooves */}
          {grooves.map((g, i) => (
            <circle
              key={i}
              cx={CX}
              cy={CY}
              r={g.r}
              stroke={`rgba(180, 180, 200, ${g.opacity})`}
              strokeWidth={g.width}
              fill="none"
            />
          ))}

          {/* Groove highlight — a bright arc that rotates with the record */}
          <path
            d={`M ${CX + 22} ${CY} A 22 22 0 0 1 ${CX} ${CY - 22}`}
            stroke="rgba(255, 220, 255, 0.15)"
            strokeWidth={50}
            fill="none"
            strokeLinecap="round"
          />

          {/* Center label */}
          <circle cx={CX} cy={CY} r={18} fill="#B22222" />
          <circle cx={CX} cy={CY} r={16.5} fill="none" stroke="#D44" strokeWidth={0.5} />
          <circle cx={CX} cy={CY} r={3} fill="#222" />

          {/* Label text */}
          <text
            x={CX}
            y={CY - 4}
            textAnchor="middle"
            fill="#FFF8DC"
            fontSize={4.5}
            fontFamily="monospace"
            fontWeight="bold"
            opacity={0.9}
          >
            GRATEFUL
          </text>
          <text
            x={CX}
            y={CY + 2}
            textAnchor="middle"
            fill="#FFF8DC"
            fontSize={4.5}
            fontFamily="monospace"
            fontWeight="bold"
            opacity={0.9}
          >
            DEAD
          </text>
          <text
            x={CX}
            y={CY + 8}
            textAnchor="middle"
            fill="#FFF8DC"
            fontSize={3}
            fontFamily="monospace"
            opacity={0.6}
          >
            33 RPM
          </text>
        </g>

        {/* Tone arm — pivots from top-right of the record */}
        <g transform={`rotate(${armAngle} ${RECORD_SIZE + 15} 8)`}>
          {/* Arm pivot point */}
          <circle cx={RECORD_SIZE + 15} cy={8} r={4} fill="#555" stroke="#777" strokeWidth={1} />
          {/* Arm shaft */}
          <line
            x1={RECORD_SIZE + 15}
            y1={8}
            x2={CX + 30}
            y2={CY - 10}
            stroke="#888"
            strokeWidth={2}
            strokeLinecap="round"
          />
          {/* Headshell */}
          <line
            x1={CX + 30}
            y1={CY - 10}
            x2={CX + 20}
            y2={CY - 5}
            stroke="#AAA"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {/* Cartridge */}
          <rect
            x={CX + 17}
            y={CY - 7}
            width={5}
            height={3}
            fill="#CCC"
            rx={0.5}
          />
        </g>
      </svg>
    </div>
  );
};
