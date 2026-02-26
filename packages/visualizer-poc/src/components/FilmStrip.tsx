/**
 * FilmStrip — Vertical 35mm film strip scrolling along right edge.
 * Film strip has sprocket holes (small rounded rectangles) on both sides.
 * "Frames" between sprockets filled with gradient colors that shift with energy.
 * Strip scrolls downward continuously. Width ~60px.
 * Always visible at 15-25% opacity. Scroll speed driven by energy.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const STRIP_WIDTH = 60;
const FRAME_HEIGHT = 50; // each film "frame" cell
const SPROCKET_W = 6;
const SPROCKET_H = 4;
const SPROCKET_MARGIN = 4;
const BORDER_WIDTH = 10; // sprocket area width on each side

// Cycle stagger: ~37s
const HUE_CYCLE = 37 * 30;

interface Props {
  frames: EnhancedFrameData[];
}

export const FilmStrip: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Generate frame colors deterministically
  const numCells = Math.ceil(height / FRAME_HEIGHT) + 4; // extra for scroll buffer
  const frameCells = React.useMemo(() => {
    const rng = seeded(35_1977);
    return Array.from({ length: numCells * 2 }, (_, i) => ({
      baseHue: rng() * 360,
      saturation: 40 + rng() * 40,
      lightness: 20 + rng() * 25,
    }));
  }, [numCells]);

  // Scroll speed: base + energy-driven
  const scrollSpeed = interpolate(energy, [0, 0.35], [0.8, 3.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Accumulated scroll offset
  const scrollOffset = (frame * scrollSpeed) % (FRAME_HEIGHT * numCells);

  // Opacity: 15-25% based on energy
  const masterOpacity = interpolate(energy, [0, 0.3], [0.15, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Hue shift cycles
  const hueShift = (frame / HUE_CYCLE) * 360;

  // How many cells to render (enough to fill screen + buffer)
  const renderCells = numCells + 2;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: STRIP_WIDTH,
        height: "100%",
        pointerEvents: "none",
        opacity: masterOpacity,
        overflow: "hidden",
        filter: "drop-shadow(-2px 0 6px rgba(180, 120, 255, 0.3))",
      }}
    >
      <svg
        width={STRIP_WIDTH}
        height={height + FRAME_HEIGHT * 4}
        style={{
          position: "absolute",
          top: -FRAME_HEIGHT * 2,
          transform: `translateY(${scrollOffset}px)`,
        }}
      >
        {/* Film strip background */}
        <rect x={0} y={0} width={STRIP_WIDTH} height={height + FRAME_HEIGHT * 4} fill="#1A1A1A" />

        {Array.from({ length: renderCells }, (_, i) => {
          const cellY = i * FRAME_HEIGHT;
          const cellData = frameCells[i % frameCells.length];
          const hue = (cellData.baseHue + hueShift + energy * 60) % 360;

          return (
            <g key={i}>
              {/* Film frame cell (the "image" area) */}
              <rect
                x={BORDER_WIDTH}
                y={cellY + 3}
                width={STRIP_WIDTH - BORDER_WIDTH * 2}
                height={FRAME_HEIGHT - 6}
                rx={1}
                fill={`hsl(${hue}, ${cellData.saturation}%, ${cellData.lightness}%)`}
                opacity={0.8}
              />

              {/* Left sprocket hole */}
              <rect
                x={SPROCKET_MARGIN - 1}
                y={cellY + (FRAME_HEIGHT - SPROCKET_H) / 2}
                width={SPROCKET_W}
                height={SPROCKET_H}
                rx={1}
                fill="#0A0A0A"
                stroke="#333"
                strokeWidth={0.5}
              />

              {/* Right sprocket hole */}
              <rect
                x={STRIP_WIDTH - SPROCKET_MARGIN - SPROCKET_W + 1}
                y={cellY + (FRAME_HEIGHT - SPROCKET_H) / 2}
                width={SPROCKET_W}
                height={SPROCKET_H}
                rx={1}
                fill="#0A0A0A"
                stroke="#333"
                strokeWidth={0.5}
              />

              {/* Frame border lines */}
              <line
                x1={BORDER_WIDTH - 1}
                y1={cellY}
                x2={BORDER_WIDTH - 1}
                y2={cellY + FRAME_HEIGHT}
                stroke="#333"
                strokeWidth={0.5}
              />
              <line
                x1={STRIP_WIDTH - BORDER_WIDTH + 1}
                y1={cellY}
                x2={STRIP_WIDTH - BORDER_WIDTH + 1}
                y2={cellY + FRAME_HEIGHT}
                stroke="#333"
                strokeWidth={0.5}
              />
            </g>
          );
        })}

        {/* Edge borders of the strip */}
        <line x1={0.5} y1={0} x2={0.5} y2={height + FRAME_HEIGHT * 4} stroke="#444" strokeWidth={1} />
        <line
          x1={STRIP_WIDTH - 0.5}
          y1={0}
          x2={STRIP_WIDTH - 0.5}
          y2={height + FRAME_HEIGHT * 4}
          stroke="#444"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
};
