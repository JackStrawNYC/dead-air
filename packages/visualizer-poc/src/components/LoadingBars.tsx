/**
 * LoadingBars -- 5-7 retro-style progress bars stacked vertically.
 * Each bar fills to a different audio parameter (rms, bass, mids, highs,
 * centroid, onset, energy).  Chunky pixel-style segments.  Each bar labeled.
 * Colors: green for low, yellow for mid, red for high values.
 * 8-bit aesthetic.  Always visible at 0.15-0.3 opacity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface BarDef {
  label: string;
  getValue: (f: EnhancedFrameData, energy: number) => number;
}

const BARS: BarDef[] = [
  { label: "RMS    ", getValue: (f) => f.rms },
  { label: "BASS   ", getValue: (f) => f.low },
  { label: "MIDS   ", getValue: (f) => f.mid },
  { label: "HIGHS  ", getValue: (f) => f.high },
  { label: "CNTR   ", getValue: (f) => f.centroid },
  { label: "ONSET  ", getValue: (f) => f.onset },
  { label: "ENERGY ", getValue: (_f, e) => e },
];

const NUM_SEGMENTS = 20;

interface Props {
  frames: EnhancedFrameData[];
}

export const LoadingBars: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  /* ----- energy ----- */
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  /* stable memo before conditionals */
  const _stable = React.useMemo(() => 1, []);

  /* master opacity: always visible 0.15-0.3 */
  const masterOpacity = interpolate(energy, [0.03, 0.25], [0.15, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* fade in */
  const masterFade = interpolate(frame, [30, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const finalOpacity = masterOpacity * masterFade;
  if (finalOpacity < 0.01) return null;

  const currentFrame = frames[idx];

  /* Layout */
  const barWidth = Math.min(280, width * 0.2);
  const barHeight = 14;
  const barGap = 6;
  const segmentGap = 2;
  const segmentWidth = (barWidth - segmentGap * (NUM_SEGMENTS - 1)) / NUM_SEGMENTS;
  const labelWidth = 65;
  const totalWidth = labelWidth + barWidth + 50; // +50 for value text
  const totalHeight = BARS.length * (barHeight + barGap);
  const panelX = 30;
  const panelY = height - totalHeight - 60;

  /** Segment color based on position within bar */
  function segmentColor(segIdx: number, filled: boolean): string {
    if (!filled) return "rgba(40, 40, 40, 0.6)";
    const t = segIdx / (NUM_SEGMENTS - 1);
    if (t < 0.45) return "#00FF00"; // green
    if (t < 0.7) return "#AAFF00";  // yellow-green
    if (t < 0.85) return "#FFAA00"; // orange
    return "#FF3300"; // red
  }

  return (
    <div
      style={{
        position: "absolute",
        left: panelX,
        top: panelY,
        width: totalWidth,
        opacity: finalOpacity,
        pointerEvents: "none",
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: 11,
      }}
    >
      {/* Panel background */}
      <div
        style={{
          position: "absolute",
          left: -10,
          top: -10,
          width: totalWidth + 20,
          height: totalHeight + 30,
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          border: "2px solid rgba(0, 255, 0, 0.25)",
          borderRadius: 2,
        }}
      />
      {/* Title */}
      <div
        style={{
          position: "relative",
          color: "#00FF00",
          textShadow: "0 0 4px #00FF00",
          marginBottom: 6,
          letterSpacing: 2,
        }}
      >
        AUDIO LEVELS
      </div>
      {/* Bars */}
      {BARS.map((bar, bi) => {
        const value = Math.min(1, Math.max(0, bar.getValue(currentFrame, energy)));
        const filledSegments = Math.round(value * NUM_SEGMENTS);
        const pctText = `${(value * 100).toFixed(0)}%`;

        return (
          <div
            key={bi}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              marginBottom: barGap,
            }}
          >
            {/* Label */}
            <div
              style={{
                width: labelWidth,
                color: "#00CC33",
                textShadow: "0 0 2px #00CC33",
                whiteSpace: "nowrap",
                letterSpacing: 1,
              }}
            >
              {bar.label}
            </div>
            {/* Segments */}
            <div style={{ display: "flex", gap: segmentGap }}>
              {Array.from({ length: NUM_SEGMENTS }, (_, si) => {
                const filled = si < filledSegments;
                const color = segmentColor(si, filled);
                /* Pixel shimmer on active segments */
                const shimmer = filled
                  ? 0.8 + Math.sin(frame * 0.2 + bi * 1.3 + si * 0.5) * 0.2
                  : 1;
                return (
                  <div
                    key={si}
                    style={{
                      width: segmentWidth,
                      height: barHeight,
                      backgroundColor: color,
                      opacity: shimmer,
                      boxShadow: filled
                        ? `0 0 3px ${color}, inset 0 1px 0 rgba(255,255,255,0.2)`
                        : "none",
                    }}
                  />
                );
              })}
            </div>
            {/* Percentage value */}
            <div
              style={{
                marginLeft: 8,
                color: filledSegments > NUM_SEGMENTS * 0.7 ? "#FF6600" : "#00FF00",
                textShadow: `0 0 3px ${filledSegments > NUM_SEGMENTS * 0.7 ? "#FF6600" : "#00FF00"}`,
                width: 36,
                textAlign: "right",
              }}
            >
              {pctText}
            </div>
          </div>
        );
      })}
    </div>
  );
};
