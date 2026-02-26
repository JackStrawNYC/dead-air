/**
 * Turntable -- Spinning vinyl record viewed from above.
 * Large circle with grooves (concentric thin rings), label in center
 * (colored circle with text). Tonearm extending from corner. Record rotates
 * at 33rpm equivalent. Grooves shimmer as they pass under virtual stylus.
 * Energy drives subtle wobble. Cycle: 55s, 16s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 1650;   // 55 seconds at 30fps
const DURATION = 480;  // 16 seconds visible

// 33 RPM = 33 rotations per 60 seconds = 33/60 rotations per second
// At 30fps: degrees per frame = (33/60) * 360 / 30 = 6.6 degrees/frame
const DEGREES_PER_FRAME = 6.6;

const LABEL_COLOR = "#C0392B"; // deep red label
const VINYL_COLOR = "#1A1A1A";
const GROOVE_COLOR = "#2A2A2A";
const SHIMMER_COLOR = "#555555";

interface Props {
  frames: EnhancedFrameData[];
}

export const Turntable: React.FC<Props> = ({ frames }) => {
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

  // Groove ring radii (deterministic)
  const grooveRadii = React.useMemo(() => {
    const rng = seeded(33770);
    const radii: number[] = [];
    for (let i = 0; i < 40; i++) {
      radii.push(0.34 + (i / 40) * 0.58 + (rng() - 0.5) * 0.005);
    }
    return radii;
  }, []);

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
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.03, 0.2], [0.2, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  const cx = width * 0.45;
  const cy = height * 0.5;
  const recordRadius = Math.min(width, height) * 0.32;
  const labelRadius = recordRadius * 0.28;

  // Rotation: continuous spin
  const rotation = cycleFrame * DEGREES_PER_FRAME;

  // Wobble driven by energy
  const wobbleX = Math.sin(frame * 0.07) * energy * 3;
  const wobbleY = Math.cos(frame * 0.09) * energy * 2;

  // Tonearm: from top-right corner, angled toward record
  const armPivotX = width * 0.82;
  const armPivotY = height * 0.12;
  const armAngle = -32 + Math.sin(frame * 0.01) * energy * 2; // slight sway
  const armLength = Math.min(width, height) * 0.42;

  // Stylus position on record (where tonearm tip would be)
  const armRad = (armAngle * Math.PI) / 180;
  const stylusX = armPivotX + Math.sin(armRad) * armLength;
  const stylusY = armPivotY + Math.cos(armRad) * armLength;

  // Shimmer angle: where stylus is relative to record center
  const shimmerAngle = Math.atan2(stylusY - cy, stylusX - cx);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity }}
      >
        <defs>
          {/* Radial gradient for vinyl sheen */}
          <radialGradient id="tt-vinyl-grad" cx="40%" cy="40%">
            <stop offset="0%" stopColor="#333" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#111" stopOpacity={0} />
          </radialGradient>
          {/* Shimmer highlight along stylus angle */}
          <linearGradient
            id="tt-shimmer"
            x1={cx + Math.cos(shimmerAngle) * recordRadius}
            y1={cy + Math.sin(shimmerAngle) * recordRadius}
            x2={cx - Math.cos(shimmerAngle) * recordRadius}
            y2={cy - Math.sin(shimmerAngle) * recordRadius}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={SHIMMER_COLOR} stopOpacity={0.4} />
            <stop offset="40%" stopColor={SHIMMER_COLOR} stopOpacity={0} />
            <stop offset="60%" stopColor={SHIMMER_COLOR} stopOpacity={0} />
            <stop offset="100%" stopColor={SHIMMER_COLOR} stopOpacity={0.2} />
          </linearGradient>
        </defs>

        {/* Record body */}
        <g transform={`translate(${cx + wobbleX}, ${cy + wobbleY})`}>
          {/* Main disc */}
          <circle cx={0} cy={0} r={recordRadius} fill={VINYL_COLOR} />
          <circle cx={0} cy={0} r={recordRadius} fill="url(#tt-vinyl-grad)" />

          {/* Grooves rotate with the record */}
          <g transform={`rotate(${rotation})`}>
            {grooveRadii.map((rFrac, gi) => {
              const r = recordRadius * rFrac;
              return (
                <circle
                  key={`groove-${gi}`}
                  cx={0}
                  cy={0}
                  r={r}
                  fill="none"
                  stroke={GROOVE_COLOR}
                  strokeWidth={0.5}
                  opacity={0.6}
                />
              );
            })}
          </g>

          {/* Shimmer overlay (doesn't rotate -- light reflection is fixed) */}
          <circle cx={0} cy={0} r={recordRadius} fill="url(#tt-shimmer)" />

          {/* Outer rim */}
          <circle cx={0} cy={0} r={recordRadius} fill="none" stroke="#333" strokeWidth={2} />

          {/* Label (rotates with record) */}
          <g transform={`rotate(${rotation})`}>
            <circle cx={0} cy={0} r={labelRadius} fill={LABEL_COLOR} />
            <circle cx={0} cy={0} r={labelRadius * 0.9} fill="none" stroke="#A0302A" strokeWidth={0.5} />
            <circle cx={0} cy={0} r={labelRadius * 0.2} fill="#1A1A1A" /> {/* spindle hole */}
            {/* Label text */}
            <text
              x={0}
              y={-labelRadius * 0.45}
              textAnchor="middle"
              fill="#F5E6C8"
              fontSize={labelRadius * 0.18}
              fontFamily="Georgia, serif"
              fontWeight="bold"
              opacity={0.8}
            >
              GRATEFUL DEAD
            </text>
            <text
              x={0}
              y={labelRadius * 0.35}
              textAnchor="middle"
              fill="#F5E6C8"
              fontSize={labelRadius * 0.14}
              fontFamily="Georgia, serif"
              opacity={0.6}
            >
              CORNELL 5/8/77
            </text>
          </g>
        </g>

        {/* Tonearm */}
        <g transform={`translate(${armPivotX}, ${armPivotY}) rotate(${armAngle})`}>
          {/* Pivot base */}
          <circle cx={0} cy={0} r={8} fill="#444" stroke="#666" strokeWidth={1} opacity={0.7} />
          {/* Arm body */}
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={armLength}
            stroke="#888"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.6}
          />
          {/* Headshell */}
          <line
            x1={0}
            y1={armLength}
            x2={-8}
            y2={armLength + 15}
            stroke="#999"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.6}
          />
          {/* Stylus tip */}
          <circle cx={-8} cy={armLength + 15} r={2} fill="#DDD" opacity={0.8} />
          {/* Counterweight */}
          <circle cx={0} cy={-15} r={6} fill="#555" stroke="#777" strokeWidth={0.5} opacity={0.5} />
        </g>
      </svg>
    </div>
  );
};
