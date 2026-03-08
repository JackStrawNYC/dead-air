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
import { getSetTheme } from "../utils/set-theme";
import { useShowContext } from "../data/ShowContext";
import { getEraPreset } from "../data/era-presets";

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
  /** Set number (1, 2, or 3=encore) for set-level color theming */
  setNumber?: number;
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

export const EnergyEnvelope: React.FC<Props> = ({ snapshot, children, climaxMod, jamColorTemp, calibration, counterpointSatMult = 1, setNumber }) => {
  const energy = snapshot.energy;
  const setTheme = getSetTheme(setNumber ?? 1);
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

  // Era-specific color adjustments
  const eraPreset = getEraPreset(showCtx?.era ?? "");
  const eraColorTempShift = eraPreset?.colorTempShift ?? 0;
  const eraSatOffset = eraPreset?.saturationOffset ?? 0;

  // Wide dynamic range — quiet passages are darker/desaturated, peaks vivid.
  // Saturation: 0.65 (quiet) → 1.25 (loud)
  // Brightness: 0.50 (quiet) → 1.25 (loud) — expanded range for more punch
  // Contrast:   0.85 (quiet) → 1.15 (loud)
  // Safety clamp at 1.50 prevents edge-case stacking blowout
  const saturation = (0.65 + factor * 0.60 + flatnessSaturation + textureSaturationOffset + (climaxMod?.saturationOffset ?? 0) + eraSatOffset) * counterpointSatMult * setTheme.saturationMult;
  const brightness = Math.min(1.50, 0.50 + factor * 0.75 + onsetBrightness + (climaxMod?.brightnessOffset ?? 0) + setTheme.brightnessOffset);
  const contrast = 0.85 + factor * 0.30 + (climaxMod?.contrastOffset ?? 0);
  // Bloom uses slow energy (drift, not pulse)
  const bloomOpacity = slowFactor * 0.30 + (climaxMod?.bloomOffset ?? 0);

  // Jam color temperature: warm shifts yellow, cool shifts blue (max ±12deg)
  // Only applied during long jams. EraGrade + SongPalette handle base color character.
  const jamHueShift = jamColorTemp != null ? jamColorTemp * 15 : 0; // ±12 degrees max
  // Set-level warmth shift: Set 1 warm (+5deg), Set 2 cool (-8deg), Encore neutral (0)
  const totalHueShift = jamHueShift + setTheme.warmthShift + eraColorTempShift;
  const filterStr = totalHueShift !== 0
    ? `saturate(${saturation.toFixed(3)}) brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) hue-rotate(${totalHueShift.toFixed(1)}deg)`
    : `saturate(${saturation.toFixed(3)}) brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)})`;

  return (
    <div style={{ position: "absolute", inset: 0, filter: filterStr }}>
      {children}

      {/* Bloom — era-aware glow at high energy (skipped in draft preset) */}
      {bloomOpacity > 0.001 && !process.env.SKIP_BLOOM && (
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
