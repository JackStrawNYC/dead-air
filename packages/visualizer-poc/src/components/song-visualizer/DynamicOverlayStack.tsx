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


const OVERLAY_GATE_END = 180;  // 6s — overlays hidden until intro elements clear

interface OverlayComponentEntry {
  Component: React.ComponentType<{ frames: EnhancedFrameData[] }>;
  layer: number;
  renderContext?: 'dom' | 'glsl';
  blendMode?: "screen" | "overlay" | "multiply" | "soft-light" | "color-dodge" | "luminosity";
}

/** Max concurrent overlays by energy level.
 *  Dead iconography should be PROMINENT — bears, stealies, bolts visible always. */
const MAX_CONCURRENT: Record<string, number> = {
  quiet: 5,
  mid: 8,
  peak: 10,
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
  /** Counterpoint overlay inversion (0-1): 0.8 = multiply opacities by 0.2 during bass isolation */
  counterpointOverlayInversion?: number;
  /** Climax desaturation (0-1): 1.0 = full monochrome overlays during climax so shader owns color */
  climaxDesaturation?: number;
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
  counterpointOverlayInversion = 0,
  climaxDesaturation = 0,
}) => {
  const frame = useCurrentFrame();

  // Enhanced beat-synced overlay opacity pulse with drum-stem and section awareness
  const frameIdx = Math.min(frame, frames.length - 1);
  const currentFrameData = frames[frameIdx];
  const sectionType = currentFrameData?.sectionType ?? "verse";
  // Section-aware pulse intensity: jams get bigger pulses, space gets minimal
  const pulseScale = sectionType === "jam" || sectionType === "solo" ? 1.5
    : sectionType === "space" ? 0.3
    : sectionType === "chorus" ? 1.2
    : 1.0;
  const beatPulse = currentFrameData?.beat ? 0.18 * pulseScale : 0;
  // Drum-stem pulse: more responsive to actual drum hits vs generic onset
  const drumPulse = (currentFrameData?.stemDrumOnset ?? 0) > 0.3
    ? (currentFrameData.stemDrumOnset ?? 0) * 0.12 * pulseScale : 0;
  const onsetPulse = (currentFrameData?.onset ?? 0) > 0.5
    ? (currentFrameData.onset ?? 0) * 0.10 * pulseScale : 0;
  const overlayPulse = 1.0 + beatPulse + Math.max(drumPulse, onsetPulse);

  // Compute opacities and apply hard cap on concurrent overlays
  const maxConcurrent = MAX_CONCURRENT[energyLevel] ?? 4;
  const inversionMult = 1 - counterpointOverlayInversion;
  // Boost overlay visibility: Dead icons must be clearly visible, not ghosted
  const baseMult = Math.min(1.0, mediaSuppression * focusSuppression * itOverlayOverride * inversionMult * overlayPulse * 1.8);

  // Single-pass: compute opacity, filter, sort, split DOM/GLSL in one loop
  const scored: { name: string; entry: OverlayComponentEntry; opacity: number }[] = [];
  for (let i = 0; i < activeEntries.length; i++) {
    const [name, entry] = activeEntries[i];
    // Minimum 0.08 opacity for all scheduled overlays — Dead icons always faintly visible
    let op = Math.min(1, (opacityMap ? Math.max(0.08, opacityMap[name] ?? 0) : 1) * baseMult);
    if (usedOverlayIds && usedOverlayIds.has(name)) op *= 0.4;
    if (op > 0.01) scored.push({ name, entry, opacity: op });
  }
  scored.sort((a, b) => b.opacity - a.opacity);
  const withOpacity = scored.length > maxConcurrent ? scored.slice(0, maxConcurrent) : scored;

  // Single-pass DOM/GLSL split (avoids two .filter() calls)
  const domOverlays: typeof withOpacity = [];
  const glslOverlays: typeof withOpacity = [];
  for (const item of withOpacity) {
    ((item.entry.renderContext ?? 'dom') === 'dom' ? domOverlays : glslOverlays).push(item);
  }

  const gateOpacity = interpolate(
    frame,
    [OVERLAY_GATE_END, OVERLAY_GATE_END + 90],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  // Climax desaturation: during peak moments, overlays go monochrome so shader owns color
  const desatFilter = climaxDesaturation > 0.01
    ? `saturate(${(1 - climaxDesaturation * 0.85).toFixed(3)})`
    : undefined;

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
            filter: desatFilter,
            contain: "layout style paint",
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
                contain: "layout style paint",
                willChange: "opacity",
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
          filter: [
            hueRotation !== 0 ? `hue-rotate(${hueRotation.toFixed(1)}deg)` : "",
            desatFilter ?? "",
          ].filter(Boolean).join(" ") || undefined,
          contain: "layout style paint",
        }}
      >
        {domOverlays.map(({ name, entry: { Component, blendMode, layer }, opacity }) => {
          // Per-layer parallax drift: deeper layers drift slower, surface layers faster
          const layerDriftFactor = 0.5 + (layer / 10) * 1.0;
          const parallaxTime = frame / 30;
          // Skip parallax transform for barely-visible overlays (saves composite cost)
          const applyParallax = opacity >= 0.3;
          const parallaxX = applyParallax ? Math.sin(parallaxTime * 0.08) * 3 * layerDriftFactor : 0;
          const parallaxY = applyParallax ? Math.cos(parallaxTime * 0.06 + 1.3) * 2 * layerDriftFactor : 0;
          return (
          <div
            key={name}
            style={{
              position: "absolute",
              inset: 0,
              opacity,
              pointerEvents: "none",
              mixBlendMode: blendMode ?? "screen",
              transform: applyParallax ? `translate(${parallaxX.toFixed(2)}px, ${parallaxY.toFixed(2)}px)` : undefined,
              contain: "layout style paint",
              willChange: "opacity, transform",
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
