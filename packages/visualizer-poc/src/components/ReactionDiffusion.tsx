/**
 * ReactionDiffusion — Organic Turing pattern visualization.
 * Simulate a simplified reaction-diffusion on a coarse grid (30x17).
 * Render each cell as a circle with radius proportional to chemical concentration.
 * Colors shift between two states (neon cyan and magenta).
 * Pattern evolves slowly (update every 4 frames). Energy drives diffusion rate.
 * Appears every 80s for 16s. Organic, biological feel.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 2400; // 80 seconds at 30fps
const DURATION = 480; // 16 seconds visible
const COLS = 30;
const ROWS = 17;
const UPDATE_INTERVAL = 4; // frames between simulation steps

interface Props {
  frames: EnhancedFrameData[];
}

export const ReactionDiffusion: React.FC<Props> = ({ frames }) => {
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

  // Simulate reaction-diffusion grid. Must be BEFORE any return null.
  const gridState = React.useMemo(() => {
    const cycleStart = Math.floor(frame / CYCLE) * CYCLE;
    const cycleFrame = frame - cycleStart;
    if (cycleFrame >= DURATION) return null;

    const rng = seeded(cycleStart + 54321);

    // Gray-Scott model simplified:
    // u = activator, v = inhibitor
    // du/dt = Du * laplacian(u) - u*v^2 + f*(1-u)
    // dv/dt = Dv * laplacian(v) + u*v^2 - (f+k)*v

    // Initialize grids
    let u: number[][] = [];
    let v: number[][] = [];
    for (let r = 0; r < ROWS; r++) {
      u[r] = [];
      v[r] = [];
      for (let c = 0; c < COLS; c++) {
        u[r][c] = 1.0;
        v[r][c] = 0.0;
      }
    }

    // Seed some initial spots of v activator
    const numSeeds = 5 + Math.floor(rng() * 4);
    for (let s = 0; s < numSeeds; s++) {
      const sr = Math.floor(rng() * (ROWS - 4)) + 2;
      const sc = Math.floor(rng() * (COLS - 4)) + 2;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = sr + dr;
          const nc = sc + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
            u[nr][nc] = 0.5;
            v[nr][nc] = 0.25 + rng() * 0.1;
          }
        }
      }
    }

    // Parameters (classic coral/mitosis patterns)
    const f = 0.055; // feed rate
    const k = 0.062; // kill rate

    // Number of simulation steps
    const numSteps = Math.floor(cycleFrame / UPDATE_INTERVAL);

    for (let step = 0; step < numSteps; step++) {
      // Energy drives diffusion rate
      const stepFrameIdx = Math.min(cycleStart + step * UPDATE_INTERVAL, frames.length - 1);
      const stepEnergy = stepFrameIdx >= 0 ? frames[Math.max(0, stepFrameIdx)].rms : 0.1;
      const Du = 0.2 + stepEnergy * 0.15;
      const Dv = 0.1 + stepEnergy * 0.05;
      const dt = 1.0;

      const newU: number[][] = [];
      const newV: number[][] = [];

      for (let r = 0; r < ROWS; r++) {
        newU[r] = [];
        newV[r] = [];
        for (let c = 0; c < COLS; c++) {
          // Laplacian with wrapping
          const up = (r - 1 + ROWS) % ROWS;
          const down = (r + 1) % ROWS;
          const left = (c - 1 + COLS) % COLS;
          const right = (c + 1) % COLS;

          const lapU = u[up][c] + u[down][c] + u[r][left] + u[r][right] - 4 * u[r][c];
          const lapV = v[up][c] + v[down][c] + v[r][left] + v[r][right] - 4 * v[r][c];

          const uvv = u[r][c] * v[r][c] * v[r][c];

          newU[r][c] = Math.max(0, Math.min(1,
            u[r][c] + (Du * lapU - uvv + f * (1 - u[r][c])) * dt
          ));
          newV[r][c] = Math.max(0, Math.min(1,
            v[r][c] + (Dv * lapV + uvv - (f + k) * v[r][c]) * dt
          ));
        }
      }

      u = newU;
      v = newV;
    }

    return { u, v };
  }, [frame, frames]);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION || !gridState) return null;

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
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.3, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cellW = width / COLS;
  const cellH = height / ROWS;
  const maxRadius = Math.min(cellW, cellH) * 0.45;

  const { v } = gridState;

  const glowSize = interpolate(energy, [0.03, 0.3], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Build cell data for rendering
  const cells: Array<{
    x: number;
    y: number;
    radius: number;
    color: string;
    cellOpacity: number;
  }> = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const concentration = v[r][c];
      if (concentration < 0.02) continue; // skip nearly-dead cells

      const x = c * cellW + cellW * 0.5;
      const y = r * cellH + cellH * 0.5;
      const radius = concentration * maxRadius;

      // Color shifts between cyan (low concentration) and magenta (high concentration)
      const hue = interpolate(concentration, [0, 0.5, 1], [180, 300, 320], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const sat = interpolate(concentration, [0, 0.5], [80, 100], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const light = interpolate(concentration, [0, 0.5], [50, 65], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

      const color = `hsl(${hue}, ${sat}%, ${light}%)`;
      const cellOpacity = interpolate(concentration, [0.02, 0.2], [0.2, 0.8], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

      cells.push({ x, y, radius, color, cellOpacity });
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
          <filter id="rd-glow">
            <feGaussianBlur stdDeviation={glowSize} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {cells.map((cell, ci) => (
          <circle
            key={ci}
            cx={cell.x}
            cy={cell.y}
            r={cell.radius}
            fill={cell.color}
            opacity={cell.cellOpacity}
            filter="url(#rd-glow)"
          />
        ))}
      </svg>
    </div>
  );
};
