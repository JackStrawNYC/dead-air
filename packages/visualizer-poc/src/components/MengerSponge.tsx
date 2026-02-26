/**
 * MengerSponge — 2D cross-section of a Menger sponge fractal.
 * A square with squares removed recursively (3 levels). The fractal
 * slowly rotates (simulated by phase-shifting which sub-cells render).
 * Glowing edges in cyan/magenta. Energy drives glow intensity and
 * rotation speed. Fractal detail level increases with energy.
 * Cycle: 55s (1650 frames), 16s visible (480 frames).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1650;    // 55 seconds at 30fps
const DURATION = 480;  // 16 seconds visible
const STAGGER_OFFSET = 150; // 5s offset

interface MengerCell {
  x: number;
  y: number;
  size: number;
  level: number;
  isSolid: boolean;
}

/**
 * Generate Menger sponge cells recursively.
 * At each level, a 3x3 grid subdivides, removing the center cell.
 * Returns filled cells (solid portions) with their level.
 */
function generateMengerCells(
  x: number,
  y: number,
  size: number,
  level: number,
  maxLevel: number,
): MengerCell[] {
  if (level >= maxLevel) {
    return [{ x, y, size, level, isSolid: true }];
  }

  const cells: MengerCell[] = [];
  const subSize = size / 3;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      // Remove center cell (and its cross in classic Menger carpet)
      if (row === 1 && col === 1) {
        // This is a hole — record it for rendering as empty
        cells.push({
          x: x + col * subSize,
          y: y + row * subSize,
          size: subSize,
          level,
          isSolid: false,
        });
        continue;
      }

      const sub = generateMengerCells(
        x + col * subSize,
        y + row * subSize,
        subSize,
        level + 1,
        maxLevel,
      );
      cells.push(...sub);
    }
  }

  return cells;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const MengerSponge: React.FC<Props> = ({ frames }) => {
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

  // Detail level increases with energy: 2 at low, 3 at medium, 4 at high
  const detailLevel = energy > 0.2 ? 4 : energy > 0.1 ? 3 : 2;

  const cells = React.useMemo(
    () => generateMengerCells(0, 0, 1, 0, detailLevel),
    [detailLevel],
  );

  // Periodic visibility
  const effectiveFrame = Math.max(0, frame - STAGGER_OFFSET);
  const cycleFrame = effectiveFrame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.87, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const visibility = Math.min(fadeIn, fadeOut);

  const energyOpacity = interpolate(energy, [0.04, 0.25], [0.15, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = visibility * energyOpacity;
  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const spongeSize = Math.min(width, height) * 0.55;

  // Rotation speed driven by energy
  const speedMult = interpolate(energy, [0.03, 0.3], [0.3, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rotation = cycleFrame * 0.2 * speedMult;

  // Color: cyan/magenta cycling
  const hue1 = (180 + cycleFrame * 0.5) % 360; // cyan range
  const hue2 = (300 + cycleFrame * 0.3) % 360; // magenta range

  const glowSize = interpolate(energy, [0.03, 0.3], [3, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Separate solid cells and holes
  const solidCells = cells.filter((c) => c.isSolid);
  const holeCells = cells.filter((c) => !c.isSolid);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          mixBlendMode: "screen",
        }}
      >
        <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
          {/* Solid cells with gradient edges */}
          {solidCells
            .filter((_, i) => i % 3 === 0) // render subset for performance
            .map((cell, i) => {
              const px = (cell.x - 0.5) * spongeSize;
              const py = (cell.y - 0.5) * spongeSize;
              const s = cell.size * spongeSize;
              const hue = cell.level % 2 === 0 ? hue1 : hue2;
              const color = `hsl(${hue}, 90%, ${60 + cell.level * 5}%)`;

              return (
                <rect
                  key={`s-${i}`}
                  x={px}
                  y={py}
                  width={s}
                  height={s}
                  fill={color}
                  fillOpacity={0.06 + energy * 0.06}
                  stroke={color}
                  strokeWidth={0.5 + energy * 0.5}
                  opacity={0.5}
                />
              );
            })}

          {/* Holes — rendered as glowing outlines */}
          {holeCells.map((cell, i) => {
            const px = (cell.x - 0.5) * spongeSize;
            const py = (cell.y - 0.5) * spongeSize;
            const s = cell.size * spongeSize;
            const hue = cell.level % 2 === 0 ? hue2 : hue1;
            const color = `hsl(${hue}, 100%, 70%)`;

            return (
              <rect
                key={`h-${i}`}
                x={px}
                y={py}
                width={s}
                height={s}
                fill="none"
                stroke={color}
                strokeWidth={1.5 + energy * 1.5}
                opacity={0.6}
                style={{
                  filter: `drop-shadow(0 0 ${glowSize}px ${color})`,
                }}
              />
            );
          })}

          {/* Outer frame */}
          <rect
            x={-spongeSize / 2}
            y={-spongeSize / 2}
            width={spongeSize}
            height={spongeSize}
            fill="none"
            stroke={`hsl(${hue1}, 100%, 65%)`}
            strokeWidth={2}
            opacity={0.5}
            style={{
              filter: `drop-shadow(0 0 ${glowSize * 1.5}px hsl(${hue1}, 100%, 65%))`,
            }}
          />

          {/* Cross-hair alignment lines */}
          <line
            x1={-spongeSize / 2}
            y1={0}
            x2={spongeSize / 2}
            y2={0}
            stroke={`hsl(${hue2}, 80%, 60%)`}
            strokeWidth={0.5}
            opacity={0.15}
            strokeDasharray="4 8"
          />
          <line
            x1={0}
            y1={-spongeSize / 2}
            x2={0}
            y2={spongeSize / 2}
            stroke={`hsl(${hue2}, 80%, 60%)`}
            strokeWidth={0.5}
            opacity={0.15}
            strokeDasharray="4 8"
          />
        </g>
      </svg>
    </div>
  );
};
