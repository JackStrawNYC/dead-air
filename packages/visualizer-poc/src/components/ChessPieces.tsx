/**
 * ChessPieces — 6-8 chess piece silhouettes (king, queen, bishop, knight, rook, pawn)
 * arranged across screen. Classic Staunton piece profiles.
 * Pieces slide forward/back on an invisible board grid.
 * Knight pieces "jump" on beats. Alternating black and white pieces.
 * Elegant, strategic feel. Energy drives movement speed.
 * Cycle: 60s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/* ---- seeded PRNG (mulberry32) ---- */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 1800; // 60 seconds at 30fps
const DURATION = 540; // 18 seconds visible

// Chess piece SVG paths (silhouette style, ~50x70 viewBox)
const PIECE_PATHS: Record<string, string> = {
  king: "M 25,5 L 25,12 M 20,8.5 L 30,8.5 M 19,15 Q 25,10 31,15 L 33,30 Q 33,35 30,38 L 35,55 Q 35,60 25,60 Q 15,60 15,55 L 20,38 Q 17,35 17,30 Z",
  queen: "M 25,5 A 3,3 0 1,1 25,5.01 M 15,15 L 20,28 L 13,18 L 22,30 M 35,15 L 30,28 L 37,18 L 28,30 M 25,12 L 25,28 M 17,30 Q 17,35 20,38 L 15,55 Q 15,60 25,60 Q 35,60 35,55 L 30,38 Q 33,35 33,30 Z",
  bishop: "M 25,5 A 2,2 0 1,1 25,5.01 M 22,10 Q 25,7 28,10 L 30,25 Q 32,32 28,35 L 33,55 Q 33,60 25,60 Q 17,60 17,55 L 22,35 Q 18,32 20,25 Z M 22,20 L 28,26",
  knight: "M 18,55 Q 16,60 25,60 Q 34,60 32,55 L 33,40 Q 35,32 30,25 Q 32,18 28,12 Q 26,8 22,10 Q 18,12 16,18 Q 14,22 18,28 L 15,25 Q 12,28 16,32 Q 18,36 18,42 Z",
  rook: "M 15,10 L 15,15 L 19,15 L 19,10 L 23,10 L 23,15 L 27,15 L 27,10 L 31,10 L 31,15 L 35,15 L 35,10 L 35,18 L 15,18 L 15,10 M 17,18 L 17,38 L 15,55 Q 15,60 25,60 Q 35,60 35,55 L 33,38 L 33,18 Z",
  pawn: "M 25,12 A 6,6 0 1,1 25,12.01 M 21,20 Q 18,25 20,30 L 17,50 Q 17,58 25,58 Q 33,58 33,50 L 30,30 Q 32,25 29,20 Z",
};

// Piece definitions with positions and colors
interface PieceDef {
  type: string;
  xFrac: number;
  yFrac: number;
  isWhite: boolean;
  moveDir: number; // 1 = forward, -1 = backward
  moveSpeed: number;
}

const PIECES: PieceDef[] = [
  { type: "king", xFrac: 0.5, yFrac: 0.35, isWhite: true, moveDir: 1, moveSpeed: 0.4 },
  { type: "queen", xFrac: 0.38, yFrac: 0.4, isWhite: false, moveDir: -1, moveSpeed: 0.6 },
  { type: "bishop", xFrac: 0.62, yFrac: 0.45, isWhite: true, moveDir: 1, moveSpeed: 0.5 },
  { type: "knight", xFrac: 0.22, yFrac: 0.5, isWhite: false, moveDir: 1, moveSpeed: 0.7 },
  { type: "rook", xFrac: 0.78, yFrac: 0.42, isWhite: true, moveDir: -1, moveSpeed: 0.45 },
  { type: "pawn", xFrac: 0.3, yFrac: 0.6, isWhite: false, moveDir: 1, moveSpeed: 0.35 },
  { type: "knight", xFrac: 0.7, yFrac: 0.55, isWhite: true, moveDir: -1, moveSpeed: 0.65 },
  { type: "pawn", xFrac: 0.55, yFrac: 0.65, isWhite: false, moveDir: -1, moveSpeed: 0.3 },
];

interface Props {
  frames: EnhancedFrameData[];
}

export const ChessPieces: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-generate subtle offsets
  const pieceOffsets = React.useMemo(() => {
    const r = seeded(4251);
    return PIECES.map(() => ({
      wobblePhase: r() * Math.PI * 2,
      wobbleSpeed: 0.02 + r() * 0.03,
      scaleBase: 0.9 + r() * 0.3,
    }));
  }, []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Beat detection for knight jump
  const fd = frames[idx];
  const onBeat = fd.beat;

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

  // Movement speed driven by energy
  const moveMult = 0.3 + energy * 2.0;

  const glowSize = interpolate(energy, [0.02, 0.25], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Colors
  const whiteColor = "#E8E4DF";
  const blackColor = "#2C2C2C";
  const whiteStroke = "#C8C0B4";
  const blackStroke = "#555555";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          willChange: "opacity",
        }}
      >
        {/* Subtle board grid lines */}
        {Array.from({ length: 9 }).map((_, gi) => {
          const gridOpacity = 0.06;
          const xLine = width * (gi / 8);
          const yLine = height * (gi / 8);
          return (
            <g key={`grid-${gi}`}>
              <line
                x1={xLine}
                y1={0}
                x2={xLine}
                y2={height}
                stroke={whiteColor}
                strokeWidth={0.5}
                opacity={gridOpacity}
              />
              <line
                x1={0}
                y1={yLine}
                x2={width}
                y2={yLine}
                stroke={whiteColor}
                strokeWidth={0.5}
                opacity={gridOpacity}
              />
            </g>
          );
        })}

        {/* Chess pieces */}
        {PIECES.map((piece, pi) => {
          const po = pieceOffsets[pi];
          const path = PIECE_PATHS[piece.type];

          // Sliding movement
          const slideOffset =
            Math.sin(cycleFrame * piece.moveSpeed * moveMult * 0.01 + po.wobblePhase) *
            60 *
            piece.moveDir;

          // Knight jump on beat
          const isKnight = piece.type === "knight";
          const jumpOffset = isKnight && onBeat ? -35 : 0;

          // Subtle wobble
          const wobble = Math.sin(frame * po.wobbleSpeed + po.wobblePhase) * 3;

          const px = piece.xFrac * width + slideOffset;
          const py = piece.yFrac * height + jumpOffset + wobble;
          const scale = po.scaleBase * (1 + energy * 0.05);

          const fillColor = piece.isWhite ? whiteColor : blackColor;
          const strokeColor = piece.isWhite ? whiteStroke : blackStroke;
          const glowColor = piece.isWhite ? "#FFFFFF" : "#888888";

          return (
            <g
              key={`piece-${pi}`}
              transform={`translate(${px - 25 * scale}, ${py - 35 * scale}) scale(${scale})`}
              style={{
                filter: `drop-shadow(0 0 ${glowSize}px ${glowColor})`,
              }}
            >
              <path
                d={path}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.75}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
