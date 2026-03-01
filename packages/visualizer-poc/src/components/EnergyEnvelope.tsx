/**
 * EnergyEnvelope — continuous visual modulation based on audio energy.
 *
 * Wraps children inside EraGrade and applies per-frame CSS filters + vignette
 * + bloom based on the pre-computed AudioSnapshot. All modulations are subtle
 * (10-20% range) so they compose cleanly with EraGrade's per-era color grading.
 *
 * Quiet passages: cooler, slightly desaturated, minimal vignette
 * Loud passages:  warmer, saturated, focused vignette + warm bloom
 */

import React from "react";
import { energyToFactor } from "../utils/energy";
import type { AudioSnapshot } from "../utils/audio-reactive";
import { detectTexture, type ClimaxModulation } from "../utils/climax-state";
import { useShowContext } from "../data/ShowContext";

interface Props {
  /** Pre-computed audio snapshot from SongVisualizer (shared, not recomputed) */
  snapshot: AudioSnapshot;
  children: React.ReactNode;
  climaxMod?: ClimaxModulation;
  /** Jam evolution color temperature (-1 cool to +1 warm). Only set for long jams. */
  jamColorTemp?: number;
}

// Per-era bloom color — matches era grade for visual cohesion
const ERA_BLOOM: Record<string, string> = {
  primal:        "rgba(200,150,80,0.18)",    // amber warmth, 16mm film
  classic:       "rgba(255,220,180,0.15)",   // golden-era warm
  hiatus:        "rgba(120,160,220,0.12)",   // cool blue, restrained
  touch_of_grey: "rgba(255,245,230,0.20)",   // bright white, stadium punch
  revival:       "rgba(220,200,170,0.14)",   // neutral warm
};
const DEFAULT_BLOOM = ERA_BLOOM.classic;

export const EnergyEnvelope: React.FC<Props> = ({ snapshot, children, climaxMod, jamColorTemp }) => {
  const energy = snapshot.energy;
  const factor = energyToFactor(energy); // 0 (quiet) → 1 (loud)
  const showCtx = useShowContext();

  // Slow-moving energy for ambient systems (vignette, bloom) — drifts, doesn't pulse
  const slowFactor = energyToFactor(snapshot.slowEnergy);

  // ── Multi-field modulations (gentle — felt, not seen) ──
  // Onset: percussive attacks create mild brightness punch
  const onsetBrightness = snapshot.onsetEnvelope * 0.04;    // +0-4%
  // Flatness: tonal passages richer, noisy passages flatter
  const flatnessSaturation = 0.02 - snapshot.flatness * 0.04; // +2% to -2%

  // Texture-aware vignette bonus (minimal — atmosphere, not tunnel)
  const texture = detectTexture(snapshot, energy);
  const textureVignetteBonus =
    texture === "ambient" ? 0.03 :    // hint of focus during Space
    texture === "sparse" ? 0.02 :     // barely-there focus during ballad intro
    texture === "peak" ? -0.02 : 0;   // wide open, let the flood breathe

  // Texture-aware saturation offset (gentle — Space subdued, not grayscale)
  const textureSaturationOffset =
    texture === "ambient" ? -0.03 :   // Space: slightly subdued
    texture === "sparse" ? -0.02 :    // ballad intros: barely restrained
    texture === "peak" ? +0.02 : 0;   // peaks: touch of saturation

  // Tight modulation ranges — no visible pumping, no pulsing black
  // Saturation + brightness use fast energy (responsive to dynamics)
  const saturation = 0.92 + factor * 0.12 + flatnessSaturation + textureSaturationOffset + (climaxMod?.saturationOffset ?? 0);
  const brightness = 0.96 + factor * 0.06 + onsetBrightness + (climaxMod?.brightnessOffset ?? 0);
  const contrast = 0.97 + factor * 0.06;                        // 0.97 → 1.03
  // Vignette + bloom use slow energy (drift, not pulse) — staggered from sat/brightness
  const vignetteOpacity = 0.02 + slowFactor * 0.10 + textureVignetteBonus + (climaxMod?.vignetteOffset ?? 0);
  const bloomOpacity = slowFactor * 0.10 + (climaxMod?.bloomOffset ?? 0);

  // Jam color temperature: warm shifts yellow, cool shifts blue (very subtle — max ±8deg)
  // Only applied during long jams. EraGrade + SongPalette handle base color character.
  const jamHueShift = jamColorTemp != null ? jamColorTemp * 8 : 0; // ±8 degrees max
  const filterStr = jamHueShift !== 0
    ? `saturate(${saturation.toFixed(3)}) brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) hue-rotate(${jamHueShift.toFixed(1)}deg)`
    : `saturate(${saturation.toFixed(3)}) brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)})`;

  return (
    <div style={{ position: "absolute", inset: 0, filter: filterStr }}>
      {children}

      {/* Vignette — focus tightens with energy */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
          opacity: vignetteOpacity,
          pointerEvents: "none",
        }}
      />

      {/* Bloom — era-aware glow at high energy */}
      {bloomOpacity > 0.001 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              `radial-gradient(ellipse at center, ${ERA_BLOOM[showCtx?.era ?? ""] ?? DEFAULT_BLOOM} 0%, transparent 70%)`,
            mixBlendMode: "screen",
            opacity: bloomOpacity,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};
