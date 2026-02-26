/**
 * AsciiRain — Matrix-style falling characters with Dead symbols.
 * 15-20 columns of falling symbols. Energy drives speed and column count.
 * Always visible at 10-25% opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

const SYMBOLS = "☮✌⚡✿☠★♪♫∞☯△○⊕◇♠♦✦⌘∆◈⟐⊛";
const NUM_COLUMNS = 20;
const CHARS_PER_COLUMN = 18;

interface ColumnData {
  x: number;
  speed: number;
  offset: number;
  charSeed: number;
}

function generateColumns(seed: number): ColumnData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_COLUMNS }, () => ({
    x: rng(),
    speed: 1.5 + rng() * 3,
    offset: rng() * 1000,
    charSeed: Math.floor(rng() * 100000),
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const AsciiRain: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const columns = React.useMemo(() => generateColumns(ctx?.showSeed ?? 19770508), [ctx?.showSeed]);

  const opacity = interpolate(energy, [0.03, 0.2], [0.1, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const activeColumns = Math.floor(10 + energy * 10);
  const speedMult = 0.6 + energy * 1.5;

  const hueBase = (frame * 0.5) % 360;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", opacity }}>
      {columns.slice(0, activeColumns).map((col, ci) => {
        const x = col.x * width;
        const charHeight = 28;
        const scrollOffset = (frame * col.speed * speedMult + col.offset) % (CHARS_PER_COLUMN * charHeight + height);

        return (
          <div
            key={ci}
            style={{
              position: "absolute",
              left: x,
              top: -CHARS_PER_COLUMN * charHeight + scrollOffset,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {Array.from({ length: CHARS_PER_COLUMN }, (_, ri) => {
              const charRng = seeded(col.charSeed + ri * 7 + Math.floor(frame * 0.05));
              const charIdx = Math.floor(charRng() * SYMBOLS.length);
              const char = SYMBOLS[charIdx];
              const isHead = ri === CHARS_PER_COLUMN - 1;
              const fadeFromHead = interpolate(ri, [0, CHARS_PER_COLUMN - 1], [0.15, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const hue = (hueBase + ci * 18 + ri * 5) % 360;
              const color = isHead
                ? "#fff"
                : `hsl(${hue}, 85%, ${45 + fadeFromHead * 20}%)`;

              return (
                <div
                  key={ri}
                  style={{
                    fontSize: 18,
                    fontFamily: "monospace",
                    color,
                    opacity: fadeFromHead,
                    textShadow: isHead
                      ? `0 0 8px #fff, 0 0 15px hsl(${hue}, 100%, 60%)`
                      : `0 0 4px ${color}`,
                    lineHeight: `${charHeight}px`,
                    width: 20,
                    textAlign: "center",
                  }}
                >
                  {char}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
