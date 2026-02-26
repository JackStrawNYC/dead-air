/**
 * Hieroglyphs — Egyptian hieroglyphic symbols scrolling vertically in 3-4 columns.
 * Simple geometric representations: eye of Horus, ankh, bird, snake, scarab, pyramid, wave.
 * Gold on dark blue. Symbols appear one by one, scrolling upward.
 * Energy drives scroll speed. Glow on symbols as they pass center.
 * Cycle: 55s, 16s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1650; // 55 seconds at 30fps
const DURATION = 480; // 16 seconds visible

const NUM_COLUMNS = 4;
const SYMBOLS_PER_COLUMN = 10;
const SYMBOL_SIZE = 36;
const SYMBOL_SPACING = 52;

// Gold/blue palette
const GOLD = "#FFD700";
const PALE_GOLD = "#ECD67E";
const EGYPTIAN_BLUE = "#1034A6";
const WARM_WHITE = "#FFF8DC";

// SVG glyph paths for hieroglyphics (simplified geometric)
// Each is drawn in a ~30x30 viewBox centered on 0,0
const GLYPHS: { name: string; path: string }[] = [
  {
    // Eye of Horus
    name: "eye",
    path: "M -12,0 Q -6,-8 0,-6 Q 6,-8 12,0 Q 6,5 0,3 Q -6,5 -12,0 Z M -2,-2 A 3,3 0 1,1 4,-2 A 3,3 0 1,1 -2,-2 M 2,3 L 5,10 M 5,10 L 8,8",
  },
  {
    // Ankh
    name: "ankh",
    path: "M 0,-12 A 5,6 0 1,1 0,-1 M 0,-1 L 0,12 M -7,3 L 7,3",
  },
  {
    // Bird (simplified ibis)
    name: "bird",
    path: "M -10,2 Q -6,-6 0,-8 Q 4,-7 6,-4 L 12,-6 M 6,-4 Q 8,0 4,4 Q 0,6 -4,4 L -6,10 M -4,4 L -2,10",
  },
  {
    // Snake (cobra)
    name: "snake",
    path: "M -4,12 Q -4,0 0,-4 Q 4,-8 2,-12 Q 0,-10 -2,-12 Q -6,-8 -2,-4 M 0,-4 Q 2,-2 4,2 Q 3,6 0,8",
  },
  {
    // Scarab
    name: "scarab",
    path: "M 0,-4 A 8,6 0 1,1 0,-3.9 Z M -10,-2 L -14,-8 M 10,-2 L 14,-8 M -8,2 Q -12,6 -10,10 M 8,2 Q 12,6 10,10",
  },
  {
    // Pyramid
    name: "pyramid",
    path: "M 0,-12 L -14,10 L 14,10 Z M 0,-12 L 0,10",
  },
  {
    // Wave (water)
    name: "wave",
    path: "M -14,0 Q -10,-6 -6,0 Q -2,6 2,0 Q 6,-6 10,0 Q 14,6 14,0 M -14,6 Q -10,0 -6,6 Q -2,12 2,6 Q 6,0 10,6",
  },
];

interface Props {
  frames: EnhancedFrameData[];
}

export const Hieroglyphs: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Pre-generate symbol assignments per column
  const columnSymbols = React.useMemo(() => {
    const r = seeded(5519);
    return Array.from({ length: NUM_COLUMNS }).map(() =>
      Array.from({ length: SYMBOLS_PER_COLUMN }).map(() =>
        Math.floor(r() * GLYPHS.length)
      )
    );
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
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.25, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Scroll speed driven by energy
  const scrollSpeed = 0.6 + energy * 2.0;
  const totalScrollHeight = SYMBOLS_PER_COLUMN * SYMBOL_SPACING;

  // Column X positions
  const columnXPositions = [0.08, 0.30, 0.70, 0.92];

  const glowSize = interpolate(energy, [0.02, 0.25], [2, 10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const centerY = height * 0.5;

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
        {/* Column backgrounds */}
        {columnXPositions.map((xFrac, ci) => (
          <rect
            key={`col-bg-${ci}`}
            x={xFrac * width - 24}
            y={0}
            width={48}
            height={height}
            fill={EGYPTIAN_BLUE}
            opacity={0.08}
            rx={4}
          />
        ))}

        {/* Scrolling symbol columns */}
        {columnXPositions.map((xFrac, ci) => {
          const colX = xFrac * width;
          // Each column scrolls at slightly different phase
          const scrollOffset = (cycleFrame * scrollSpeed + ci * 80) % totalScrollHeight;

          return (
            <g key={`col-${ci}`}>
              {columnSymbols[ci].map((glyphIdx, si) => {
                const baseY = si * SYMBOL_SPACING - scrollOffset + height * 0.3;
                // Wrap around
                let symY = baseY % totalScrollHeight;
                if (symY < -SYMBOL_SPACING) symY += totalScrollHeight;
                if (symY > height + SYMBOL_SPACING) return null;

                const glyph = GLYPHS[glyphIdx];

                // Distance from center for glow effect
                const distFromCenter = Math.abs(symY - centerY) / (height * 0.5);
                const centerGlow = Math.max(0, 1 - distFromCenter * 1.5);
                const symbolOpacity = 0.4 + centerGlow * 0.5;

                const symbolGlow = centerGlow > 0.3
                  ? `drop-shadow(0 0 ${glowSize * centerGlow}px ${GOLD})`
                  : "none";

                const color = centerGlow > 0.5 ? WARM_WHITE : PALE_GOLD;

                return (
                  <g
                    key={`sym-${ci}-${si}`}
                    transform={`translate(${colX}, ${symY}) scale(${SYMBOL_SIZE / 30})`}
                    style={{ filter: symbolGlow }}
                  >
                    <path
                      d={glyph.path}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={symbolOpacity}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
