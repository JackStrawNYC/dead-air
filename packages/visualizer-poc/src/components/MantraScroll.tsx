/**
 * MantraScroll — "What a long strange trip it's been" endlessly scrolling.
 * Large neon rainbow text scrolling right-to-left.
 * Speed driven by energy. Always visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const MANTRA = "WHAT A LONG STRANGE TRIP IT'S BEEN";
const SEPARATOR = "   ★   ";
const REPEAT_COUNT = 4;

interface Props {
  frames: EnhancedFrameData[];
}

export const MantraScroll: React.FC<Props> = ({ frames }) => {
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

  const opacity = interpolate(energy, [0.02, 0.15], [0.2, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Scroll speed: slow when quiet, fast when loud
  const baseSpeed = 1.5 + energy * 4;
  const scrollOffset = frame * baseSpeed;

  // Build the full repeated text
  const fullText = Array(REPEAT_COUNT).fill(MANTRA).join(SEPARATOR);
  const chars = fullText.split("");

  // Approximate text width (each char ~28px at font-size 40)
  const charWidth = 28;
  const totalWidth = chars.length * charWidth;

  // Wrap the scroll position
  const xOffset = -(scrollOffset % totalWidth);

  const hueBase = (frame * 0.8) % 360;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          bottom: "6%",
          left: 0,
          whiteSpace: "nowrap",
          transform: `translateX(${xOffset}px)`,
          opacity,
        }}
      >
        {/* Render twice for seamless loop */}
        {[0, 1].map((copy) => (
          <span key={copy} style={{ display: "inline" }}>
            {chars.map((char, i) => {
              const globalIdx = copy * chars.length + i;
              const hue = (hueBase + globalIdx * 8) % 360;
              const color = `hsl(${hue}, 100%, 65%)`;
              return (
                <span
                  key={globalIdx}
                  style={{
                    fontSize: 40,
                    fontWeight: 900,
                    fontFamily: "'Georgia', serif",
                    color,
                    textShadow: `
                      0 0 8px ${color},
                      0 0 16px ${color},
                      0 0 32px ${color}
                    `,
                    letterSpacing: 4,
                  }}
                >
                  {char}
                </span>
              );
            })}
          </span>
        ))}
      </div>
    </div>
  );
};
