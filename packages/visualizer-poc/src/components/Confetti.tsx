/**
 * Confetti — 40-60 small rectangular/square confetti pieces falling from top.
 * Each piece rotates (simulated via scaleX oscillation), has random bright color
 * (red, blue, green, yellow, pink, orange). Fall speed varies per piece.
 * Energy drives confetti count and fall speed. Pieces flutter side-to-side as
 * they fall. Cycle: 40s, 12s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CONFETTI_COLORS = [
  "hsl(0, 90%, 60%)",    // red
  "hsl(220, 90%, 60%)",  // blue
  "hsl(130, 80%, 50%)",  // green
  "hsl(50, 95%, 55%)",   // yellow
  "hsl(320, 85%, 60%)",  // pink
  "hsl(25, 95%, 55%)",   // orange
  "hsl(280, 80%, 60%)",  // purple
  "hsl(180, 80%, 50%)",  // cyan
];

interface ConfettiPiece {
  /** X position as fraction (0-1) */
  x: number;
  /** Initial Y offset (stagger start) */
  yOffset: number;
  /** Fall speed (px per frame) */
  fallSpeed: number;
  /** Flutter frequency (horizontal oscillation) */
  flutterFreq: number;
  /** Flutter amplitude in px */
  flutterAmp: number;
  /** Flutter phase */
  flutterPhase: number;
  /** Rotation frequency (scaleX oscillation to simulate tumbling) */
  rotFreq: number;
  /** Rotation phase */
  rotPhase: number;
  /** Width of confetti piece in px */
  pieceW: number;
  /** Height of confetti piece in px */
  pieceH: number;
  /** Color index */
  colorIdx: number;
  /** Tilt angle (static) */
  tilt: number;
}

const NUM_CONFETTI = 55;
const CYCLE_FRAMES = 40 * 30; // 40s
const VISIBLE_FRAMES = 12 * 30; // 12s
const FADE_FRAMES = 45;
const FALL_CYCLE = 240; // how many frames for a confetti to fall full screen + wrap

function generateConfetti(seed: number): ConfettiPiece[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_CONFETTI }, () => ({
    x: rng(),
    yOffset: rng() * FALL_CYCLE,
    fallSpeed: 1.5 + rng() * 3.5,
    flutterFreq: 0.02 + rng() * 0.04,
    flutterAmp: 15 + rng() * 40,
    flutterPhase: rng() * Math.PI * 2,
    rotFreq: 0.06 + rng() * 0.1,
    rotPhase: rng() * Math.PI * 2,
    pieceW: 4 + rng() * 6,
    pieceH: 3 + rng() * 5,
    colorIdx: Math.floor(rng() * CONFETTI_COLORS.length),
    tilt: (rng() - 0.5) * 40,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Confetti: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const confetti = React.useMemo(() => generateConfetti(40197708), []);

  // Cycle timing
  const cyclePos = frame % CYCLE_FRAMES;
  const inShowWindow = cyclePos < VISIBLE_FRAMES;

  if (!inShowWindow) return null;

  // Fade envelope
  const fadeIn = interpolate(cyclePos, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cyclePos, [VISIBLE_FRAMES - FADE_FRAMES, VISIBLE_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const envelope = Math.min(fadeIn, fadeOut);

  // Energy drives count and speed
  const visibleCount = Math.round(interpolate(energy, [0.05, 0.3], [20, NUM_CONFETTI], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  const speedMult = interpolate(energy, [0.05, 0.3], [0.6, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = envelope * 0.7;

  if (masterOpacity < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        {confetti.slice(0, visibleCount).map((piece, ci) => {
          // Fall position with wrapping
          const rawY =
            (cyclePos * piece.fallSpeed * speedMult + piece.yOffset * piece.fallSpeed) %
            (height + 40);
          const py = rawY - 20; // start above screen

          // Horizontal flutter
          const flutter =
            Math.sin(frame * piece.flutterFreq + piece.flutterPhase) * piece.flutterAmp;
          const px = piece.x * width + flutter;

          // Wrap X
          const wx = ((px % width) + width) % width;

          // Tumble: simulate 3D rotation via scaleX oscillation
          const scaleX = Math.cos(frame * piece.rotFreq + piece.rotPhase);

          // Tilt for visual variety
          const tilt = piece.tilt + Math.sin(frame * 0.03 + ci) * 10;

          const color = CONFETTI_COLORS[piece.colorIdx];

          return (
            <rect
              key={ci}
              x={wx - piece.pieceW / 2}
              y={py - piece.pieceH / 2}
              width={piece.pieceW}
              height={piece.pieceH}
              fill={color}
              rx={0.5}
              transform={`rotate(${tilt}, ${wx}, ${py}) scale(${scaleX}, 1)`}
              style={{ transformOrigin: `${wx}px ${py}px` }}
              opacity={0.8}
            />
          );
        })}
      </svg>
    </div>
  );
};
