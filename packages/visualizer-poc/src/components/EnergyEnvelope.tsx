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
import type { SongIdentity } from "../data/song-identities";
import type { ShowArcModifiers } from "../data/show-arc";

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
  /** Drums/Space sub-phase for phase-specific color adjustments */
  drumsSpacePhase?: string;
  /** Show narrative phase for show-level arc modulation */
  showPhase?: string;
  /** Per-song visual identity for hue/saturation modifiers */
  songIdentity?: SongIdentity;
  /** Show arc modifiers for phase-level color modulation */
  showArcModifiers?: ShowArcModifiers;
  /** IT response luminance lift (additive brightness) */
  itLuminanceLift?: number;
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

export const EnergyEnvelope: React.FC<Props> = ({ snapshot, children, climaxMod, jamColorTemp, calibration, counterpointSatMult = 1, setNumber, drumsSpacePhase, showPhase, songIdentity, showArcModifiers, itLuminanceLift }) => {
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
  const onsetBrightness = snapshot.onsetEnvelope * 0.15;    // +0-15%
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

  // Psychedelic color strategy: saturate hard, brighten gently.
  // Vivid colors come from high saturation + contrast, NOT high brightness.
  // Saturation: 0.75 (quiet) → 1.25 (loud), capped at 1.40.
  // Higher CSS saturation crushes dark-pixel non-dominant channels toward zero,
  // making dark areas blacker and colors monochromatic (green-only at high energy).
  // Keep saturation moderate; shaders provide color richness internally.
  // Brightness: 0.92 (quiet) → 1.20 (loud) — fills the frame, never washes out
  // Contrast:   0.95 (quiet) → 1.15 (loud) — punchy but not crushing
  // Gate reactive CSS terms during quiet to prevent frame-to-frame jitter
  const cssGate = factor; // 0 during quiet, 1 during loud (already smoothstep-based)
  const saturation = Math.min(1.40, (0.75 + factor * 0.50 + flatnessSaturation * cssGate + textureSaturationOffset * cssGate + (climaxMod?.saturationOffset ?? 0) + eraSatOffset + (snapshot.drumOnset ?? 0) * 0.06 * cssGate) * counterpointSatMult * setTheme.saturationMult);
  const isClimaxPhase = (climaxMod?.brightnessOffset ?? 0) > 0.04;
  const brightCap = isClimaxPhase ? 1.50 : 1.25;
  const brightness = Math.min(brightCap, 0.92 + factor * 0.28 + onsetBrightness * 0.4 * cssGate + (climaxMod?.brightnessOffset ?? 0) + setTheme.brightnessOffset + (snapshot.fastEnergy ?? 0) * 0.12 * cssGate);
  // Contrast: restrained range (0.97-1.10) to preserve GLSL stage flood + lifted blacks.
  // High CSS contrast crushes dark values back toward black, undoing shader color work.
  const contrast = Math.min(1.15, 0.95 + factor * 0.20 + (climaxMod?.contrastOffset ?? 0) * 0.5);
  // Bloom uses slow energy (drift, not pulse) — reduced to prevent white wash
  const bloomOpacity = slowFactor * 0.35 + (climaxMod?.bloomOffset ?? 0) * 0.5 + (snapshot.fastEnergy ?? 0) * 0.05;

  // Drums/Space phase adjustments
  let dsSatOffset = 0;
  let dsBrightOffset = 0;
  let dsHueOffset = 0;
  let dsContrastOffset = 0;
  if (drumsSpacePhase === "space_ambient") {
    dsSatOffset = -0.15;    // desaturated void
    dsBrightOffset = -0.10; // darkness
    dsHueOffset = 15;       // blue shift
  } else if (drumsSpacePhase === "drums_tribal") {
    dsContrastOffset = 0.08; // primal punch
    dsHueOffset = 8;         // warmth shift
  }

  // Show narrative phase adjustments
  let showSatOffset = 0;
  let showBrightOffset = 0;
  if (showPhase === "opening") {
    showBrightOffset = 0.03;  // show is fresh
    showSatOffset = 0.05;
  } else if (showPhase === "closing") {
    showSatOffset = -0.05;    // bittersweet ending
  }

  // Song identity modifiers
  const siSatOffset = songIdentity?.saturationOffset ?? 0;
  const siHueShift = songIdentity?.hueShift ?? 0;
  const siPaletteSat = songIdentity?.palette?.saturation != null ? (songIdentity.palette.saturation - 1) * 0.2 : 0;
  const siPaletteBright = songIdentity?.palette?.brightness != null ? (songIdentity.palette.brightness - 1) * 0.2 : 0;

  // Show arc modifiers
  const arcSatOffset = showArcModifiers?.saturationOffset ?? 0;
  const arcBrightOffset = showArcModifiers?.brightnessOffset ?? 0;
  const arcHueShift = showArcModifiers?.hueShift ?? 0;

  // IT luminance lift
  const itBrightLift = itLuminanceLift ?? 0;

  // Apply phase offsets + song identity + show arc + IT
  const finalSaturation = Math.min(1.40, Math.max(0.5, saturation + dsSatOffset + showSatOffset + siSatOffset + siPaletteSat + arcSatOffset));
  const finalBrightness = Math.min(brightCap, Math.max(0.55, brightness + dsBrightOffset + showBrightOffset + siPaletteBright + arcBrightOffset + itBrightLift));
  const finalContrast = Math.min(1.20, Math.max(0.90, contrast + dsContrastOffset));

  // Jam color temperature: warm shifts yellow, cool shifts blue (max ±12deg)
  // Only applied during long jams. EraGrade + SongPalette handle base color character.
  const jamHueShift = jamColorTemp != null ? jamColorTemp * 35 : 0; // ±28 degrees max
  // Set-level warmth shift: Set 1 warm (+5deg), Set 2 cool (-8deg), Encore neutral (0)
  const totalHueShift = jamHueShift + setTheme.warmthShift + eraColorTempShift + dsHueOffset + siHueShift + arcHueShift;
  const filterStr = totalHueShift !== 0
    ? `saturate(${finalSaturation.toFixed(3)}) brightness(${finalBrightness.toFixed(3)}) contrast(${finalContrast.toFixed(3)}) hue-rotate(${totalHueShift.toFixed(1)}deg)`
    : `saturate(${finalSaturation.toFixed(3)}) brightness(${finalBrightness.toFixed(3)}) contrast(${finalContrast.toFixed(3)})`;

  return (
    <div style={{ position: "absolute", inset: 0, filter: filterStr }}>
      {children}

      {/* Spatial bloom — backdrop-filter blurs bright pixels, screen blend adds glow */}
      {!process.env.SKIP_BLOOM && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backdropFilter: `blur(${(8 + slowFactor * 16).toFixed(1)}px) brightness(${(0.9 + factor * 0.3).toFixed(2)})`,
            WebkitBackdropFilter: `blur(${(8 + slowFactor * 16).toFixed(1)}px) brightness(${(0.9 + factor * 0.3).toFixed(2)})`,
            mixBlendMode: "screen",
            opacity: 0.08 + slowFactor * 0.12,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};
