/**
 * EnergyEnvelope — continuous visual modulation based on audio energy.
 *
 * Wraps children inside EraGrade and applies per-frame CSS filters + bloom
 * based on the pre-computed AudioSnapshot. All modulations are subtle
 * (10-20% range) so they compose cleanly with EraGrade's per-era color grading.
 * Vignette is handled exclusively by GLSL shaders to avoid double-vignette.
 *
 * Quiet passages: cooler, slightly desaturated
 * Loud passages:  warmer, saturated, warm bloom
 */

import React from "react";
import { energyToFactor } from "../utils/energy";
import type { EnergyCalibration } from "../utils/energy";
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
  /** Per-song energy calibration (auto-derived from recording percentiles) */
  calibration?: EnergyCalibration;
  /** Counterpoint saturation multiplier (0.4-1.3) */
  counterpointSatMult?: number;
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

export const EnergyEnvelope: React.FC<Props> = ({ snapshot, children, climaxMod, jamColorTemp, calibration, counterpointSatMult = 1 }) => {
  const energy = snapshot.energy;
  const low = calibration?.quietThreshold;
  const high = calibration?.loudThreshold;
  const factor = energyToFactor(energy, low, high); // 0 (quiet) → 1 (loud)
  const showCtx = useShowContext();

  // Slow-moving energy for bloom — drifts, doesn't pulse
  const slowFactor = energyToFactor(snapshot.slowEnergy, low, high);

  // ── Multi-field modulations (gentle — felt, not seen) ──
  // Onset: percussive attacks create mild brightness punch
  const onsetBrightness = snapshot.onsetEnvelope * 0.10;    // +0-10%
  // Flatness: tonal passages richer, noisy passages flatter
  const flatnessSaturation = 0.02 - snapshot.flatness * 0.04; // +2% to -2%

  const texture = detectTexture(snapshot, energy);

  // Texture-aware saturation offset (gentle — Space subdued, not grayscale)
  const textureSaturationOffset =
    texture === "ambient" ? -0.03 :   // Space: slightly subdued
    texture === "sparse" ? -0.02 :    // ballad intros: barely restrained
    texture === "peak" ? +0.02 : 0;   // peaks: touch of saturation

  // Tight modulation ranges — no visible pumping, no pulsing black
  // Saturation + brightness use fast energy (responsive to dynamics)
  const saturation = (0.85 + factor * 0.30 + flatnessSaturation + textureSaturationOffset + (climaxMod?.saturationOffset ?? 0)) * counterpointSatMult;
  const brightness = 0.92 + factor * 0.12 + onsetBrightness + (climaxMod?.brightnessOffset ?? 0);
  const contrast = 0.93 + factor * 0.12 + (climaxMod?.contrastOffset ?? 0);  // 0.93 → 1.05
  // Bloom uses slow energy (drift, not pulse) — staggered from sat/brightness
  const bloomOpacity = slowFactor * 0.15 + (climaxMod?.bloomOffset ?? 0);

  // Jam color temperature: warm shifts yellow, cool shifts blue (max ±12deg)
  // Only applied during long jams. EraGrade + SongPalette handle base color character.
  const jamHueShift = jamColorTemp != null ? jamColorTemp * 15 : 0; // ±12 degrees max
  const filterStr = jamHueShift !== 0
    ? `saturate(${saturation.toFixed(3)}) brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) hue-rotate(${jamHueShift.toFixed(1)}deg)`
    : `saturate(${saturation.toFixed(3)}) brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)})`;

  return (
    <div style={{ position: "absolute", inset: 0, filter: filterStr }}>
      {children}

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
