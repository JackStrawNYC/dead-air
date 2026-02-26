/**
 * NixieTubes — Warm orange nixie tube display showing elapsed time (MM:SS).
 * 4 digit tubes + colon separator. Each digit rendered in a glass tube shape
 * with warm orange glow. Positioned top-left corner, small and subtle.
 * Always visible at 30-50% opacity. Warm amber color (#FF8C00).
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

// 7-segment display paths for digits 0-9
// Each segment: [x1, y1, x2, y2] relative to a 20x32 cell
const SEGMENTS: Record<string, boolean[]> = {
  //                 top, topR, botR, bot, botL, topL, mid
  "0": [true,  true,  true,  true,  true,  true,  false],
  "1": [false, true,  true,  false, false, false, false],
  "2": [true,  true,  false, true,  true,  false, true],
  "3": [true,  true,  true,  true,  false, false, true],
  "4": [false, true,  true,  false, false, true,  true],
  "5": [true,  false, true,  true,  false, true,  true],
  "6": [true,  false, true,  true,  true,  true,  true],
  "7": [true,  true,  true,  false, false, false, false],
  "8": [true,  true,  true,  true,  true,  true,  true],
  "9": [true,  true,  true,  true,  false, true,  true],
};

// Segment geometry: [x1, y1, x2, y2] within a 20x32 grid
const SEG_COORDS: [number, number, number, number][] = [
  [3, 2, 17, 2],     // top
  [17, 3, 17, 15],   // top-right
  [17, 17, 17, 29],  // bottom-right
  [3, 30, 17, 30],   // bottom
  [3, 17, 3, 29],    // bottom-left
  [3, 3, 3, 15],     // top-left
  [3, 16, 17, 16],   // middle
];

const AMBER = "#FF8C00";
const AMBER_DIM = "rgba(255, 140, 0, 0.08)";
const TUBE_BG = "rgba(40, 25, 10, 0.6)";

/** Single nixie tube displaying one digit */
const NixieTube: React.FC<{ digit: string; flicker: number }> = ({ digit, flicker }) => {
  const segs = SEGMENTS[digit] || SEGMENTS["0"];
  const glowOpacity = 0.8 + flicker * 0.2;

  return (
    <svg width={28} height={44} viewBox="0 0 28 44">
      {/* Glass tube envelope */}
      <rect x={1} y={1} width={26} height={42} rx={8} ry={8} fill={TUBE_BG} />
      <rect
        x={1}
        y={1}
        width={26}
        height={42}
        rx={8}
        ry={8}
        fill="none"
        stroke="rgba(255, 160, 40, 0.15)"
        strokeWidth={1}
      />

      {/* Cathode glow background */}
      <ellipse
        cx={14}
        cy={22}
        rx={10}
        ry={14}
        fill={`rgba(255, 140, 0, ${0.06 * glowOpacity})`}
      />

      {/* Segments */}
      <g transform="translate(4, 6)">
        {SEG_COORDS.map(([x1, y1, x2, y2], i) => (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={segs[i] ? AMBER : AMBER_DIM}
            strokeWidth={segs[i] ? 2.2 : 0.8}
            strokeLinecap="round"
            opacity={segs[i] ? glowOpacity : 0.15}
            style={
              segs[i]
                ? { filter: `drop-shadow(0 0 3px ${AMBER})` }
                : undefined
            }
          />
        ))}
      </g>
    </svg>
  );
};

/** Colon separator between MM and SS */
const NixieColon: React.FC<{ blink: boolean }> = ({ blink }) => (
  <svg width={12} height={44} viewBox="0 0 12 44">
    <rect x={0} y={1} width={12} height={42} rx={4} ry={4} fill={TUBE_BG} />
    <circle cx={6} cy={17} r={2} fill={AMBER} opacity={blink ? 0.9 : 0.2} />
    <circle cx={6} cy={29} r={2} fill={AMBER} opacity={blink ? 0.9 : 0.2} />
  </svg>
);

interface Props {
  frames: EnhancedFrameData[];
}

export const NixieTubes: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Elapsed time from frame count at 30fps
  const totalSeconds = Math.floor(frame / 30);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const m1 = Math.floor(mins / 10).toString();
  const m2 = (mins % 10).toString();
  const s1 = Math.floor(secs / 10).toString();
  const s2 = (secs % 10).toString();

  // Colon blinks every second
  const colonBlink = Math.floor(frame / 15) % 2 === 0;

  // Subtle per-tube flicker from seeded PRNG
  const rng = seeded(frame * 3 + 7777);
  const f1 = rng() * 0.15;
  const f2 = rng() * 0.15;
  const f3 = rng() * 0.15;
  const f4 = rng() * 0.15;

  // Opacity: 30-50% based on energy
  const masterOpacity = interpolate(energy, [0, 0.3], [0.3, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 18,
        left: 18,
        pointerEvents: "none",
        opacity: masterOpacity,
        display: "flex",
        alignItems: "center",
        gap: 2,
        filter: `drop-shadow(0 0 6px rgba(255, 140, 0, 0.5))`,
      }}
    >
      <NixieTube digit={m1} flicker={f1} />
      <NixieTube digit={m2} flicker={f2} />
      <NixieColon blink={colonBlink} />
      <NixieTube digit={s1} flicker={f3} />
      <NixieTube digit={s2} flicker={f4} />
    </div>
  );
};
