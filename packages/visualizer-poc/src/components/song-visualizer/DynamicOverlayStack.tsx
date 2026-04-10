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


const OVERLAY_GATE_END = 60;  // 2s — Dead iconography should be present almost immediately

interface OverlayComponentEntry {
  Component: React.ComponentType<{ frames: EnhancedFrameData[] }>;
  layer: number;
  renderContext?: 'dom' | 'glsl';
  blendMode?: "screen" | "overlay" | "multiply" | "soft-light" | "color-dodge" | "luminosity";
}

/** Max concurrent overlays by energy level.
 *  Dead iconography should be PROMINENT — bears, stealies, bolts visible always. */
const MAX_CONCURRENT: Record<string, number> = {
  quiet: 3,
  mid: 5,
  peak: 7,
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
  /** Dead air factor (0 = music playing, 1 = fully in dead air/applause). Suppresses overlays. */
  deadAirFactor?: number;
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
  deadAirFactor = 0,
}) => {
  const frame = useCurrentFrame();

  // Enhanced beat-synced overlay opacity pulse with drum-stem and section awareness
  const frameIdx = Math.min(frame, frames.length - 1);
  const currentFrameData = frames[frameIdx];
  const sectionType = currentFrameData?.sectionType ?? "verse";
  // Section-aware pulse intensity: jams get bigger pulses, space gets minimal
  // CALM MODE: pulse intensities reduced ~70% to eliminate "weird pulsing light".
  // Overlays should breathe gently with the music, not strobe.
  const pulseScale = sectionType === "jam" || sectionType === "solo" ? 1.1
    : sectionType === "space" ? 1.0
    : sectionType === "chorus" ? 1.05
    : 1.0;
  const beatPulse = currentFrameData?.beat ? 0.025 * pulseScale : 0;
  const drumPulse = (currentFrameData?.stemDrumOnset ?? 0) > 0.3
    ? (currentFrameData.stemDrumOnset ?? 0) * 0.015 * pulseScale : 0;
  const onsetPulse = (currentFrameData?.onset ?? 0) > 0.5
    ? (currentFrameData.onset ?? 0) * 0.012 * pulseScale : 0;
  const overlayPulse = 1.0 + beatPulse + Math.max(drumPulse, onsetPulse);

  // Compute opacities and apply hard cap on concurrent overlays
  // DEAD AIR: drop the overlay cap aggressively as music ends. Crowd noise should
  // be visually QUIET — no fireflies-and-neural-web swarms during applause.
  // At full dead air (>0.8): 0 rotation overlays, only always-active (SongTitle,
  // FilmGrain) remain. Ramps from full count → 0 as deadAirFactor rises.
  const baseMaxConcurrent = MAX_CONCURRENT[energyLevel] ?? 4;
  const maxConcurrent = deadAirFactor > 0.8 ? 0
    : deadAirFactor > 0.3 ? Math.max(0, Math.floor(baseMaxConcurrent * (1 - deadAirFactor * 1.2)))
    : baseMaxConcurrent;
  const inversionMult = 1 - counterpointOverlayInversion;
  // Overlay visibility: allow overlays to go subtle when suppressed.
  // DEAD AIR: bypass the 0.12 floor — when applause is detected, overlays
  // should be allowed to fully fade out, not stick at 12%.
  const deadAirSuppress = 1 - deadAirFactor * 0.92; // 100% live → 8% during full dead air
  const rawMult = mediaSuppression * focusSuppression * itOverlayOverride * inversionMult * overlayPulse * deadAirSuppress;
  const minFloor = deadAirFactor > 0.5 ? 0 : 0.12; // remove floor during heavy dead air
  const baseMult = Math.min(1.0, Math.max(minFloor, rawMult));

  // Single-pass: compute opacity, filter, sort, split DOM/GLSL in one loop
  const scored: { name: string; entry: OverlayComponentEntry; opacity: number }[] = [];
  for (let i = 0; i < activeEntries.length; i++) {
    const [name, entry] = activeEntries[i];
    let op = Math.min(1, (opacityMap ? (opacityMap[name] ?? 0) : 1) * baseMult);
    if (usedOverlayIds && usedOverlayIds.has(name)) op *= 0.4;
    if (op > 0.01) scored.push({ name, entry, opacity: op });
  }
  scored.sort((a, b) => b.opacity - a.opacity);

  // ─── Anti-clutter layer distribution ───
  // Pure top-N-by-opacity selection lets 5-7 overlays at peaks all stack on
  // the same layer (e.g. 5 atmospheric layer-1 overlays piling up). Instead,
  // walk the sorted list and prefer items on FRESH layers when their score
  // is within 10% of the top — clearly-winning overlays still win, but ties
  // are broken by spreading across layers for visually balanced composition.
  //
  // Falls back to pure score order if no fresh-layer candidate exists within
  // the gap threshold or if the layer set is exhausted.
  const SCORE_GAP_THRESHOLD = 0.10;
  const pickedLayers = new Set<number>();
  const withOpacity: typeof scored = [];
  const queue = [...scored];
  while (withOpacity.length < maxConcurrent && queue.length > 0) {
    const topScore = queue[0].opacity;
    // Find the first item within the score gap that's on a fresh layer
    let chosenIdx = 0;
    for (let i = 0; i < queue.length; i++) {
      if ((topScore - queue[i].opacity) > SCORE_GAP_THRESHOLD) break;
      if (!pickedLayers.has(queue[i].entry.layer)) {
        chosenIdx = i;
        break;
      }
    }
    const item = queue.splice(chosenIdx, 1)[0];
    withOpacity.push(item);
    pickedLayers.add(item.entry.layer);
  }

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
    ? `saturate(${(1 - climaxDesaturation * 0.40).toFixed(3)})`
    : undefined;

  // ─── Slow audio-reactive breathing filter ───
  // Engine-level CSS modulation that makes ALL overlays gently breathe with
  // the music's slow envelope WITHOUT touching any individual overlay
  // component. Driven by a 90-frame (3-second) backward-window average of
  // RMS so changes happen over seconds — guaranteed smooth, no jitter, no
  // flash, no flicker. CSS filter is GPU-accelerated and frame-perfect.
  //
  // Bounded ranges:
  //   brightness: 0.90-1.10 (±10%) — quiet feels dimmer, loud feels brighter
  //   saturate:   0.85-1.10 (±12.5%) — quiet feels muted, loud feels vivid
  //
  // The change rate is dominated by the 90-frame window so even a sudden
  // dynamic shift (e.g. a chorus drop) takes ~3 seconds to reach the new
  // steady state — well below any flash/flicker perception threshold.
  let slowEnergySum = 0;
  let slowCount = 0;
  for (let i = Math.max(0, frameIdx - 90); i <= frameIdx; i++) {
    slowEnergySum += frames[i]?.rms ?? 0;
    slowCount++;
  }
  const slowEnergy = slowCount > 0 ? slowEnergySum / slowCount : 0.2;
  const breathBrightness = 0.90 + Math.min(1, slowEnergy) * 0.20;
  const breathSaturate = 0.85 + Math.min(1, slowEnergy) * 0.25;
  const breathFilter = `brightness(${breathBrightness.toFixed(3)}) saturate(${breathSaturate.toFixed(3)})`;

  // ─── Slow audio-reactive hue drift (warm-on-loud, cool-on-quiet) ───
  // A tiny ±4° shift on top of the per-song palette hueRotation. Driven by
  // slowEnergy with the same 3-second smoothing as the breathing filter, so
  // changes happen over seconds — well below any "color shifted" perception
  // threshold. Composed into the same CSS filter chain alongside the existing
  // segue-blend hueRotation, so per-song palette identity stays intact and
  // this just adds a gentle dynamic warm/cool drift on top.
  //
  // 0.5 of slowEnergy maps to neutral, lower → cool shift, higher → warm.
  // Bounded to ±4° so even at extreme energies it's a subtle tint, not a
  // color shift.
  const energyHueDrift = (Math.min(1, slowEnergy) - 0.30) * 8; // -2.4 to +5.6
  const energyHueClamp = Math.max(-4, Math.min(4, energyHueDrift));

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
            filter: [
              breathFilter,
              energyHueClamp !== 0 ? `hue-rotate(${energyHueClamp.toFixed(1)}deg)` : "",
              desatFilter ?? "",
            ].filter(Boolean).join(" "),
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

      {/* DOM overlays — rendered above GLSL overlays, scaled up for prominence */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: gateOpacity,
          filter: [
            breathFilter,
            // Combine palette-driven segue rotation with slow audio drift.
            // Both are degrees and additive, applied as a single hue-rotate.
            (hueRotation + energyHueClamp) !== 0
              ? `hue-rotate(${(hueRotation + energyHueClamp).toFixed(1)}deg)`
              : "",
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
          const parallaxX = applyParallax ? Math.sin(parallaxTime * 0.06) * 3 * layerDriftFactor : 0;
          const parallaxY = applyParallax ? Math.cos(parallaxTime * 0.04 + 1.3) * 2 * layerDriftFactor : 0;
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
