/**
 * GameOfLife — Conway's Game of Life grid.
 * 40x22 cell grid (covering full screen). Initial state seeded from energy peaks
 * in the audio data. Cells evolve every 6 frames. Live cells rendered as small
 * neon squares. Dead cells invisible. Energy above threshold seeds new random cells
 * to prevent die-off. Neon green classic color with glow.
 * Appears every 55s for 18s at 15-25% opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1650; // 55 seconds at 30fps
const DURATION = 540; // 18 seconds visible
const COLS = 40;
const ROWS = 22;
const EVOLVE_INTERVAL = 6; // frames between generations

interface Props {
  frames: EnhancedFrameData[];
}

export const GameOfLife: React.FC<Props> = ({ frames }) => {
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

  // Simulate the grid state for the current cycle frame.
  // Must be BEFORE any return null.
  const gridState = React.useMemo(() => {
    const cycleStart = Math.floor(frame / CYCLE) * CYCLE;
    const cycleFrame = frame - cycleStart;
    if (cycleFrame >= DURATION) return null;

    const rng = seeded(cycleStart + 12345);

    // Initialize grid seeded from audio energy peaks
    let grid: boolean[][] = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        // Use energy from audio data around cycle start for initial seeding
        const fIdx = Math.min(cycleStart + r * COLS + c, frames.length - 1);
        const fEnergy = fIdx >= 0 ? frames[Math.max(0, fIdx)].rms : 0;
        grid[r][c] = rng() < 0.25 + fEnergy * 0.3;
      }
    }

    // Evolve the grid up to current generation
    const generation = Math.floor(cycleFrame / EVOLVE_INTERVAL);

    const countNeighbors = (g: boolean[][], r: number, c: number): number => {
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = (r + dr + ROWS) % ROWS;
          const nc = (c + dc + COLS) % COLS;
          if (g[nr][nc]) count++;
        }
      }
      return count;
    };

    for (let gen = 0; gen < generation; gen++) {
      const newGrid: boolean[][] = [];
      for (let r = 0; r < ROWS; r++) {
        newGrid[r] = [];
        for (let c = 0; c < COLS; c++) {
          const n = countNeighbors(grid, r, c);
          if (grid[r][c]) {
            newGrid[r][c] = n === 2 || n === 3;
          } else {
            newGrid[r][c] = n === 3;
          }
        }
      }

      // Energy above threshold seeds new random cells to prevent die-off
      const genFrameIdx = Math.min(cycleStart + gen * EVOLVE_INTERVAL, frames.length - 1);
      const genEnergy = genFrameIdx >= 0 ? frames[Math.max(0, genFrameIdx)].rms : 0;
      if (genEnergy > 0.15) {
        const seedCount = Math.floor(genEnergy * 8);
        const genRng = seeded(cycleStart + gen * 31);
        for (let s = 0; s < seedCount; s++) {
          const sr = Math.floor(genRng() * ROWS);
          const sc = Math.floor(genRng() * COLS);
          newGrid[sr][sc] = true;
        }
      }

      grid = newGrid;
    }

    return grid;
  }, [frame, frames]);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION || !gridState) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  // 15-25% opacity range
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.15, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cellW = width / COLS;
  const cellH = height / ROWS;
  const cellSize = Math.min(cellW, cellH) * 0.75;

  // Neon green
  const primaryColor = "#00FF41";
  const glowColor = "#00FF41";

  const glowSize = interpolate(energy, [0.03, 0.3], [2, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Collect live cells for rendering
  const liveCells: Array<{ x: number; y: number; r: number; c: number }> = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (gridState[r][c]) {
        liveCells.push({
          x: c * cellW + cellW * 0.5,
          y: r * cellH + cellH * 0.5,
          r,
          c,
        });
      }
    }
  }

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
        <defs>
          <filter id="gol-glow">
            <feGaussianBlur stdDeviation={glowSize} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {liveCells.map((cell) => (
          <rect
            key={`${cell.r}-${cell.c}`}
            x={cell.x - cellSize * 0.5}
            y={cell.y - cellSize * 0.5}
            width={cellSize}
            height={cellSize}
            fill={primaryColor}
            opacity={0.7}
            rx={2}
            filter="url(#gol-glow)"
          />
        ))}
      </svg>
    </div>
  );
};
