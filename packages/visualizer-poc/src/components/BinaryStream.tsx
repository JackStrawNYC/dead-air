/**
 * BinaryStream — Columns of 0s and 1s flowing downward.
 * 12-15 columns of binary digits. Each digit is small monospace text.
 * Green-on-black matrix aesthetic but with warm amber highlights on
 * "active" digits. Speed varies per column. Energy drives column count
 * and flow speed. Always visible at 0.08-0.2 opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const MAX_COLUMNS = 15;
const CHARS_PER_COLUMN = 22;

interface ColumnData {
  x: number;
  speed: number;
  offset: number;
  charSeed: number;
  fontSize: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const BinaryStream: React.FC<Props> = ({ frames }) => {
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

  const columns = React.useMemo(() => {
    const rng = seeded(1_100_111);
    return Array.from({ length: MAX_COLUMNS }, (): ColumnData => ({
      x: rng() * 1920,
      speed: 1.0 + rng() * 3.0,
      offset: rng() * 2000,
      charSeed: Math.floor(rng() * 100000),
      fontSize: 14 + Math.floor(rng() * 6),
    }));
  }, []);

  // Always visible -- no cycle gating
  const opacity = interpolate(energy, [0.03, 0.25], [0.08, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const activeColumns = Math.floor(8 + energy * 7);
  const speedMult = 0.5 + energy * 2.0;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        opacity,
      }}
    >
      {columns.slice(0, activeColumns).map((col, ci) => {
        const x = col.x * (width / 1920);
        const charHeight = col.fontSize + 4;
        const totalHeight = CHARS_PER_COLUMN * charHeight;
        const scrollOffset =
          (frame * col.speed * speedMult + col.offset) %
          (totalHeight + height);

        return (
          <div
            key={ci}
            style={{
              position: "absolute",
              left: x,
              top: -totalHeight + scrollOffset,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {Array.from({ length: CHARS_PER_COLUMN }, (_, ri) => {
              // Deterministic binary digit that changes slowly
              const charRng = seeded(col.charSeed + ri * 13 + Math.floor(frame * 0.08));
              const digit = charRng() > 0.5 ? "1" : "0";
              const isActive = charRng() > 0.7;
              const isHead = ri === CHARS_PER_COLUMN - 1;

              // Fade trail from head
              const fadeFromHead = interpolate(
                ri,
                [0, CHARS_PER_COLUMN - 1],
                [0.1, 1],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }
              );

              // Color: green base, amber for active digits, white for head
              let color: string;
              let shadow: string;
              if (isHead) {
                color = "#FFFFFF";
                shadow = "0 0 8px #fff, 0 0 15px #00FF41";
              } else if (isActive) {
                color = "#FFB347"; // warm amber
                shadow = `0 0 4px #FFB347, 0 0 8px rgba(255, 179, 71, 0.5)`;
              } else {
                color = `rgba(0, 255, 65, ${0.4 + fadeFromHead * 0.6})`;
                shadow = `0 0 3px rgba(0, 255, 65, ${fadeFromHead * 0.5})`;
              }

              return (
                <div
                  key={ri}
                  style={{
                    fontSize: col.fontSize,
                    fontFamily: "monospace",
                    color,
                    opacity: fadeFromHead,
                    textShadow: shadow,
                    lineHeight: `${charHeight}px`,
                    width: col.fontSize + 4,
                    textAlign: "center",
                    fontWeight: isActive ? 700 : 400,
                  }}
                >
                  {digit}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
