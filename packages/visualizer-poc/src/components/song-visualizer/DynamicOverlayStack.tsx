/**
 * DynamicOverlayStack — renders the 5-20 active overlay components
 * with per-frame opacity control, media suppression, and palette context.
 *
 * Extracted from SongVisualizer to isolate the overlay rendering loop.
 */

import React, { Suspense } from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
import { SilentErrorBoundary } from "../SilentErrorBoundary";
import { SongPaletteProvider } from "../../data/SongPaletteContext";
import { TempoProvider } from "../../data/TempoContext";
import type { EnhancedFrameData, ColorPalette } from "../../data/types";

const OVERLAY_GATE_END = 420;  // 14s — overlays hidden until intro elements clear

interface OverlayComponentEntry {
  Component: React.ComponentType<{ frames: EnhancedFrameData[] }>;
  layer: number;
}

interface Props {
  activeEntries: [string, OverlayComponentEntry][];
  opacityMap: Record<string, number> | null;
  mediaSuppression: number;
  hueRotation: number;
  tempo: number;
  palette?: ColorPalette;
  frames: EnhancedFrameData[];
}

export const DynamicOverlayStack: React.FC<Props> = ({
  activeEntries,
  opacityMap,
  mediaSuppression,
  hueRotation,
  tempo,
  palette,
  frames,
}) => {
  const frame = useCurrentFrame();

  return (
    <TempoProvider tempo={tempo}>
    <SongPaletteProvider palette={palette}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(
            frame,
            [OVERLAY_GATE_END, OVERLAY_GATE_END + 90],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
          ),
          filter: hueRotation !== 0 ? `hue-rotate(${hueRotation.toFixed(1)}deg)` : undefined,
        }}
      >
        {activeEntries.map(([name, { Component }]) => {
          const overlayOpacity = Math.min(1, (opacityMap ? (opacityMap[name] ?? 0) : 1) * mediaSuppression);
          if (overlayOpacity < 0.01) return null;
          return (
            <div
              key={name}
              style={{
                position: "absolute",
                inset: 0,
                opacity: overlayOpacity,
                pointerEvents: "none",
              }}
            >
              <Suspense fallback={null}>
                <SilentErrorBoundary name={name}>
                  <Component frames={frames} />
                </SilentErrorBoundary>
              </Suspense>
            </div>
          );
        })}
      </div>
    </SongPaletteProvider>
    </TempoProvider>
  );
};
