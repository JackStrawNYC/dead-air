/**
 * MatrixRain — Matrix-style green code rain falling down the screen.
 * Columns of characters scroll downward at varying speeds. Character
 * density and fall speed scale with energy. Lead characters are bright
 * white/green, trailing characters fade to dark green. Characters
 * randomize from a seeded pool (katakana-inspired glyphs).
 * Appears every 45s for 20s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
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

const CYCLE = 1350; // 45s at 30fps
const DURATION = 600; // 20s
const CHAR_SIZE = 14;
const TRAIL_LENGTH = 18;

// Matrix-style character set (ASCII subset that looks technical)
const GLYPHS = "0123456789ABCDEF<>{}[]|/\\=+*~@#$%&!?:.";

interface ColumnData {
  x: number;
  speed: number; // chars per frame
  startOffset: number; // vertical offset at frame 0
  charSeed: number;
  brightness: number; // base brightness multiplier
}

function generateColumns(seed: number, numCols: number): ColumnData[] {
  const rng = seeded(seed);
  return Array.from({ length: numCols }, (_, i) => ({
    x: i,
    speed: 0.08 + rng() * 0.15,
    startOffset: rng() * 60,
    charSeed: Math.floor(rng() * 100000),
    brightness: 0.6 + rng() * 0.4,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const MatrixRain: React.FC<Props> = ({ frames }) => {
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

  const numCols = Math.floor(width / CHAR_SIZE);
  const numRows = Math.floor(height / CHAR_SIZE) + TRAIL_LENGTH;

  const columns = React.useMemo(
    () => generateColumns(77777, numCols),
    [numCols],
  );

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.05], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const envelope = Math.min(fadeIn, fadeOut) * (0.35 + energy * 0.5);

  // Speed multiplier from energy
  const speedMult = 0.6 + energy * 2.0;

  // Density: how many columns are active (energy-gated)
  const activeCols = Math.max(
    3,
    Math.floor(numCols * (0.15 + energy * 0.7)),
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: envelope }}>
        <defs>
          <filter id="matrix-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {columns.slice(0, activeCols).map((col) => {
          // Current head position (scrolling down)
          const headPos =
            col.startOffset + cycleFrame * col.speed * speedMult;
          const headRow = headPos % (numRows + TRAIL_LENGTH);

          // Generate characters for this column's trail
          const charRng = seeded(col.charSeed + Math.floor(headPos));
          const chars: { row: number; char: string; alpha: number }[] = [];

          for (let t = 0; t < TRAIL_LENGTH; t++) {
            const row = headRow - t;
            if (row < 0 || row >= numRows) continue;

            // Character selection: deterministic per position
            const posRng = seeded(col.charSeed + Math.floor(row) * 31 + Math.floor(cycleFrame / 3));
            const charIdx = Math.floor(posRng() * GLYPHS.length);
            const char = GLYPHS[charIdx];

            // Alpha: bright at head, fading down the trail
            const trailFrac = t / TRAIL_LENGTH;
            const alpha = (1 - trailFrac * trailFrac) * col.brightness;

            chars.push({ row, char, alpha });
          }

          // Discard unused rng call to avoid lint
          void charRng;

          return (
            <g key={`col${col.x}`}>
              {chars.map((c, ci) => {
                const px = col.x * CHAR_SIZE + CHAR_SIZE * 0.5;
                const py = c.row * CHAR_SIZE;
                const isHead = ci === 0;

                const fill = isHead
                  ? "#ffffff"
                  : `rgba(0, ${Math.floor(180 + c.alpha * 75)}, ${Math.floor(c.alpha * 40)}, ${c.alpha})`;

                return (
                  <text
                    key={`c${ci}`}
                    x={px}
                    y={py}
                    fill={fill}
                    fontSize={CHAR_SIZE - 1}
                    fontFamily="monospace"
                    textAnchor="middle"
                    opacity={isHead ? 0.95 : c.alpha * 0.85}
                    filter={isHead ? "url(#matrix-glow)" : undefined}
                  >
                    {c.char}
                  </text>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
