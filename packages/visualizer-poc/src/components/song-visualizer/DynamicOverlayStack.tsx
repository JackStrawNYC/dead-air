/**
 * DynamicOverlayStack — renders the 5-20 active overlay components
 * with per-frame opacity control, media suppression, and palette context.
 *
 * Separates DOM overlays from GLSL overlays:
 * - DOM overlays render as positioned divs (HTML/CSS/SVG)
 * - GLSL overlays render inside a Three.js Canvas (shader-based)
 * Both receive the same opacity values from the rotation engine.
 *
 * Extracted from SongVisualizer to isolate the overlay rendering loop.
 */

import React, { Suspense } from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
import { SilentErrorBoundary } from "../SilentErrorBoundary";
import { SongPaletteProvider } from "../../data/SongPaletteContext";
import { TempoProvider } from "../../data/TempoContext";
import type { EnhancedFrameData, ColorPalette } from "../../data/types";
import { A_TIER_OVERLAY_NAMES } from "../../data/overlay-rotation";

const OVERLAY_GATE_END = 180;  // 6s — overlays hidden until intro elements clear

interface OverlayComponentEntry {
  Component: React.ComponentType<{ frames: EnhancedFrameData[] }>;
  layer: number;
  renderContext?: 'dom' | 'glsl';
  blendMode?: "screen" | "overlay" | "multiply" | "soft-light" | "color-dodge" | "luminosity";
}

/** Max concurrent overlays by energy level (hard cap after opacity sorting).
 *  Pre-peak dropout strips to void → peaks flood with A-tier density.
 *  The contrast between silence and flood creates the visceral impact. */
const MAX_CONCURRENT: Record<string, number> = {
  quiet: 2,
  mid: 3,
  peak: 4,
};

interface Props {
  activeEntries: [string, OverlayComponentEntry][];
  opacityMap: Record<string, number> | null;
  mediaSuppression: number;
  hueRotation: number;
  tempo: number;
  palette?: ColorPalette;
  frames: EnhancedFrameData[];
  /** Focus system suppression multiplier (0-1), applied to all overlay opacities */
  focusSuppression?: number;
  /** Current energy level hint for hard cap determination */
  energyLevel?: "quiet" | "mid" | "peak";
  /** Overlay IDs already used in previous songs (for cross-song variety) */
  usedOverlayIds?: Set<string>;
  /** IT response overlay opacity multiplier (1.0 = normal, 0.05 = locked) */
  itOverlayOverride?: number;
}

export const DynamicOverlayStack: React.FC<Props> = ({
  activeEntries,
  opacityMap,
  mediaSuppression,
  hueRotation,
  tempo,
  palette,
  frames,
  focusSuppression = 1,
  energyLevel = "mid",
  usedOverlayIds,
  itOverlayOverride = 1,
}) => {
  const frame = useCurrentFrame();

  // Compute opacities and apply hard cap on concurrent overlays
  const maxConcurrent = MAX_CONCURRENT[energyLevel] ?? 4;
  const withOpacity = activeEntries
    .map(([name, entry]) => {
      let op = Math.min(1, (opacityMap ? (opacityMap[name] ?? 0) : 1) * mediaSuppression * focusSuppression * itOverlayOverride);
      // Cross-song dedup: deprioritize overlays already shown earlier in the show
      if (usedOverlayIds && usedOverlayIds.has(name)) {
        op *= 0.4; // reduce but don't eliminate — variety, not exclusion
      }
      return { name, entry, opacity: op };
    })
    .filter((o) => o.opacity > 0.01)
    // At peak energy, only A-tier overlays (iconic Dead imagery) are allowed
    .filter((o) => energyLevel !== "peak" || A_TIER_OVERLAY_NAMES.has(o.name))
    .sort((a, b) => b.opacity - a.opacity)
    .slice(0, maxConcurrent);

  // Separate DOM overlays from GLSL overlays
  const domOverlays = withOpacity.filter((o) => (o.entry.renderContext ?? 'dom') === 'dom');
  const glslOverlays = withOpacity.filter((o) => o.entry.renderContext === 'glsl');

  const gateOpacity = interpolate(
    frame,
    [OVERLAY_GATE_END, OVERLAY_GATE_END + 90],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  return (
    <TempoProvider tempo={tempo}>
    <SongPaletteProvider palette={palette}>
      {/* GLSL overlays — rendered as regular components (they wrap OverlayQuad internally) */}
      {glslOverlays.length > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: gateOpacity,
            pointerEvents: "none",
            mixBlendMode: "screen",
          }}
        >
          {glslOverlays.map(({ name, entry: { Component }, opacity }) => (
            <div
              key={name}
              style={{
                position: "absolute",
                inset: 0,
                opacity,
                pointerEvents: "none",
              }}
            >
              <Suspense fallback={null}>
                <SilentErrorBoundary name={name}>
                  <Component frames={frames} />
                </SilentErrorBoundary>
              </Suspense>
            </div>
          ))}
        </div>
      )}

      {/* DOM overlays — rendered above GLSL overlays */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: gateOpacity,
          filter: hueRotation !== 0 ? `hue-rotate(${hueRotation.toFixed(1)}deg)` : undefined,
        }}
      >
        {domOverlays.map(({ name, entry: { Component, blendMode }, opacity }) => (
          <div
            key={name}
            style={{
              position: "absolute",
              inset: 0,
              opacity,
              pointerEvents: "none",
              mixBlendMode: blendMode ?? "screen",
            }}
          >
            <Suspense fallback={null}>
              <SilentErrorBoundary name={name}>
                <Component frames={frames} />
              </SilentErrorBoundary>
            </Suspense>
          </div>
        ))}
      </div>
    </SongPaletteProvider>
    </TempoProvider>
  );
};
