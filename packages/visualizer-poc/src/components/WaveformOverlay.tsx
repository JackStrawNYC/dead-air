/**
 * WaveformOverlay — subtle 64-bar frequency visualization in the bottom 13%.
 *
 * Mapped to sub/low/mid/high bands with 8-frame rolling average.
 * Chroma data adds per-bar phase offset for organic feel.
 * Master opacity: 0.10 (quiet) to 0.22 (loud).
 * Palette-locked gradient colors.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useSongPalette } from "../data/SongPaletteContext";

const BAR_COUNT = 128;
const SMOOTHING_FRAMES = 6;
const HEIGHT_PCT = 25; // bottom 25% of screen
const MIN_OPACITY = 0.20;
const MAX_OPACITY = 0.50;

interface Props {
  frames: EnhancedFrameData[];
}

/** Map bar index to frequency band with smooth distribution */
function barToBand(barIndex: number): "sub" | "low" | "mid" | "high" {
  const norm = barIndex / BAR_COUNT;
  if (norm < 0.125) return "sub";
  if (norm < 0.375) return "low";
  if (norm < 0.75) return "mid";
  return "high";
}

export const WaveformOverlay: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const palette = useSongPalette();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // 8-frame rolling average per band for smooth motion
  const smoothBands = useMemo(() => {
    const result = { sub: 0, low: 0, mid: 0, high: 0 };
    let count = 0;
    for (let i = Math.max(0, idx - SMOOTHING_FRAMES); i <= Math.min(frames.length - 1, idx); i++) {
      result.sub += frames[i].sub;
      result.low += frames[i].low;
      result.mid += frames[i].mid;
      result.high += frames[i].high;
      count++;
    }
    if (count > 0) {
      result.sub /= count;
      result.low /= count;
      result.mid /= count;
      result.high /= count;
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, idx]);

  // Master opacity based on overall energy
  const rms = frames[idx]?.rms ?? 0;
  const masterOpacity = interpolate(rms, [0.02, 0.25], [MIN_OPACITY, MAX_OPACITY], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (masterOpacity < 0.01) return null;

  const primaryHue = palette?.primary ?? 210;
  const secondaryHue = palette?.secondary ?? 270;

  // Chroma data for per-bar phase offsets
  const chroma = frames[idx]?.chroma ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  const barWidth = width / BAR_COUNT;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: `${HEIGHT_PCT}%`,
        opacity: masterOpacity,
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        gap: 1,
        padding: "0 2px",
      }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const band = barToBand(i);
        const bandValue = smoothBands[band];

        // Chroma phase offset for organic feel
        const chromaIdx = i % 12;
        const chromaOffset = chroma[chromaIdx] * 0.3;

        const height = Math.max(2, (bandValue + chromaOffset) * 100);
        const hue = interpolate(i, [0, BAR_COUNT - 1], [primaryHue, secondaryHue], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        // Per-band brightness: sub darker, highs brighter
        const bandLightness = band === "sub" ? 40 : band === "low" ? 50 : band === "mid" ? 60 : 70;

        return (
          <div
            key={i}
            style={{
              width: barWidth - 1,
              height: `${Math.min(100, height)}%`,
              background: `linear-gradient(to top, hsla(${hue}, 70%, ${bandLightness}%, 0.85), hsla(${hue}, 60%, ${bandLightness}%, 0.1))`,
              borderRadius: "1px 1px 0 0",
              transition: "height 0.1s ease-out",
            }}
          />
        );
      })}
    </div>
  );
};
