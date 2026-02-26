/**
 * CuckooClockOverlay — Ornate cuckoo clock face with a bird that pops out
 * on beat accents. Clock hands move with time. Decorative carved wood frame.
 * Bird extension driven by onset/beat detection. Warm wood tones.
 * Cycle: 60s, 16s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1800; // 60s at 30fps
const DURATION = 480; // 16s visible

interface LeafData {
  x: number;
  y: number;
  size: number;
  angle: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CuckooClockOverlay: React.FC<Props> = ({ frames }) => {
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

  // Pre-generate decorative leaf positions
  const leaves = React.useMemo(() => {
    const rng = seeded(88442211);
    const pts: LeafData[] = [];
    for (let i = 0; i < 12; i++) {
      pts.push({
        x: (rng() - 0.5) * 120,
        y: (rng() - 0.5) * 160,
        size: 6 + rng() * 8,
        angle: rng() * 360,
      });
    }
    return pts;
  }, []);

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
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Position: upper right area
  const cx = width * 0.78;
  const cy = height * 0.32;
  const clockSize = Math.min(width, height) * 0.14;

  // Wood tones
  const woodDark = "#5D3A1A";
  const woodMid = "#8B5E3C";
  const woodLight = "#A67B5B";
  const faceColor = "#FAF0D7";
  const goldAccent = "#D4A850";

  // Clock hands
  const hourAngle = frame * 0.015;
  const minuteAngle = frame * 0.18;

  // Bird pop-out: driven by beat/onset
  const currentOnset = frames[idx]?.onset ?? 0;
  const isBeat = frames[idx]?.beat ?? false;
  const birdTrigger = isBeat ? 1.0 : currentOnset > 0.4 ? currentOnset : 0;
  // Smooth bird extension with decay
  const birdExtension = interpolate(birdTrigger, [0, 0.4, 1], [0, 0.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pendulum below
  const pendulumAngle = Math.sin(frame * 0.07) * (12 + energy * 18);

  const glowSize = interpolate(energy, [0.03, 0.3], [1, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const birdX = -clockSize * 0.15 + birdExtension * clockSize * 0.45;
  const doorOpenAngle = birdExtension * -35;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px rgba(139, 94, 60, 0.4))`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Roof (pointed gable) */}
          <polygon
            points={`${-clockSize * 0.7},0 0,${-clockSize * 0.7} ${clockSize * 0.7},0`}
            fill={woodDark}
            opacity={0.6}
            stroke={woodMid}
            strokeWidth={1.5}
          />

          {/* Main body */}
          <rect
            x={-clockSize * 0.6}
            y={0}
            width={clockSize * 1.2}
            height={clockSize * 1.4}
            rx={4}
            fill={woodMid}
            opacity={0.5}
            stroke={woodDark}
            strokeWidth={2}
          />

          {/* Decorative leaves */}
          {leaves.map((leaf, li) => (
            <ellipse
              key={`leaf-${li}`}
              cx={leaf.x * (clockSize / 80)}
              cy={leaf.y * (clockSize / 100) + clockSize * 0.4}
              rx={leaf.size * (clockSize / 120)}
              ry={leaf.size * (clockSize / 120) * 0.4}
              fill={woodLight}
              opacity={0.3}
              transform={`rotate(${leaf.angle}, ${leaf.x * (clockSize / 80)}, ${leaf.y * (clockSize / 100) + clockSize * 0.4})`}
            />
          ))}

          {/* Clock face */}
          <circle cx={0} cy={clockSize * 0.55} r={clockSize * 0.4} fill={faceColor} opacity={0.15} stroke={goldAccent} strokeWidth={1.5} />

          {/* Hour markers */}
          {Array.from({ length: 12 }).map((_, hi) => {
            const a = ((hi * 30 - 90) * Math.PI) / 180;
            const r1 = clockSize * 0.32;
            const r2 = clockSize * 0.37;
            return (
              <line
                key={`hm-${hi}`}
                x1={Math.cos(a) * r1}
                y1={clockSize * 0.55 + Math.sin(a) * r1}
                x2={Math.cos(a) * r2}
                y2={clockSize * 0.55 + Math.sin(a) * r2}
                stroke={woodDark}
                strokeWidth={hi % 3 === 0 ? 2 : 1}
                opacity={0.5}
              />
            );
          })}

          {/* Hour hand */}
          <line
            x1={0} y1={clockSize * 0.55}
            x2={Math.cos(((hourAngle - 90) * Math.PI) / 180) * clockSize * 0.2}
            y2={clockSize * 0.55 + Math.sin(((hourAngle - 90) * Math.PI) / 180) * clockSize * 0.2}
            stroke={woodDark} strokeWidth={3} strokeLinecap="round" opacity={0.7}
          />
          {/* Minute hand */}
          <line
            x1={0} y1={clockSize * 0.55}
            x2={Math.cos(((minuteAngle - 90) * Math.PI) / 180) * clockSize * 0.3}
            y2={clockSize * 0.55 + Math.sin(((minuteAngle - 90) * Math.PI) / 180) * clockSize * 0.3}
            stroke={woodDark} strokeWidth={2} strokeLinecap="round" opacity={0.6}
          />
          <circle cx={0} cy={clockSize * 0.55} r={3} fill={goldAccent} opacity={0.6} />

          {/* Bird door */}
          <rect
            x={-clockSize * 0.12}
            y={clockSize * 0.05}
            width={clockSize * 0.24}
            height={clockSize * 0.2}
            rx={2}
            fill={woodDark}
            opacity={0.5}
          />
          {/* Door flap (opens when bird pops out) */}
          <line
            x1={-clockSize * 0.12} y1={clockSize * 0.05}
            x2={-clockSize * 0.12 + Math.cos(doorOpenAngle * Math.PI / 180) * clockSize * 0.24}
            y2={clockSize * 0.05 + Math.sin(doorOpenAngle * Math.PI / 180) * clockSize * 0.24}
            stroke={woodLight} strokeWidth={2} opacity={birdExtension > 0.1 ? 0.5 : 0}
          />

          {/* Bird (pops out from door) */}
          {birdExtension > 0.05 && (
            <g transform={`translate(${birdX}, ${clockSize * 0.12})`} opacity={birdExtension * 0.8}>
              {/* Body */}
              <ellipse cx={0} cy={0} rx={8} ry={6} fill="#C7A030" />
              {/* Head */}
              <circle cx={8} cy={-3} r={5} fill="#D4A850" />
              {/* Beak */}
              <polygon points="13,-4 18,-3 13,-2" fill="#E8A020" />
              {/* Eye */}
              <circle cx={9} cy={-4} r={1.5} fill="#2C1810" />
            </g>
          )}

          {/* Pendulum */}
          <g transform={`translate(0, ${clockSize * 1.4}) rotate(${pendulumAngle}, 0, 0)`}>
            <line x1={0} y1={0} x2={0} y2={clockSize * 0.6} stroke={woodDark} strokeWidth={1.5} opacity={0.5} />
            <circle cx={0} cy={clockSize * 0.6} r={clockSize * 0.1} fill="none" stroke={goldAccent} strokeWidth={2} opacity={0.5} />
            <circle cx={0} cy={clockSize * 0.6} r={clockSize * 0.04} fill={goldAccent} opacity={0.4} />
          </g>
        </g>
      </svg>
    </div>
  );
};
