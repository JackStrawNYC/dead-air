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
import type { ClimaxModulation } from "../utils/climax-state";
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
  /** Vocal warmth factor 0-1 (from stem-features) */
  vocalWarmth?: number;
  /** Guitar color temperature -1 (cool) to +1 (warm) */
  guitarColorTemp?: number;
  /** Dead air factor (0 = music playing, 1 = fully in dead air/applause) */
  deadAirFactor?: number;
  /** Narrative brightness offset (-0.2 to +0.2) from visual narrator */
  narrativeBrightness?: number;
  /** Narrative color temperature (-1 cool to +1 warm) from visual narrator */
  narrativeTemperature?: number;
  /** Intro factor 0-1: 0 = intro period (suppress reactive brightness), 1 = engine fully open */
  introFactor?: number;
  /** Whether a solo is detected */
  isSolo?: boolean;
  /** Solo intensity (0-1) */
  soloIntensity?: number;
  /** Harmonic response brightness offset (-0.04 to +0.06) */
  harmonicBrightness?: number;
  /** Harmonic response saturation multiplier (0.92-1.08) */
  harmonicSatMult?: number;
  /** Modal analysis hue shift in degrees (-40 to +25) */
  modalHueShift?: number;
  /** Modal analysis saturation offset (-0.10 to +0.08) */
  modalSatOffset?: number;
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

export const EnergyEnvelope: React.FC<Props> = ({ snapshot, children, climaxMod, jamColorTemp, calibration, counterpointSatMult = 1, drumsSpacePhase, showPhase, songIdentity, showArcModifiers, itLuminanceLift, vocalWarmth, guitarColorTemp, deadAirFactor = 0, narrativeBrightness = 0, narrativeTemperature = 0, introFactor = 1, isSolo = false, soloIntensity = 0, harmonicBrightness = 0, harmonicSatMult = 1, modalHueShift = 0, modalSatOffset = 0 }) => {
  const energy = snapshot.energy;
  const low = calibration?.quietThreshold;
  const high = calibration?.loudThreshold;
  const factor = energyToFactor(energy, low, high); // 0 (quiet) → 1 (loud)
  const showCtx = useShowContext();

  // Slow-moving energy for bloom — drifts, doesn't pulse
  const slowFactor = energyToFactor(snapshot.slowEnergy, low, high);

  // Intro damping: suppress ALL reactive brightness during intro so art/text shines
  // introFactor 0 = full intro (no reactivity), 1 = engine fully open
  const reactivity = introFactor;

  // ── Multi-field modulations (gentle — felt, not seen) ──
  // Onset brightness: DISABLED — was a major strobe source even at low values.
  // The onset energy still drives GLSL onset saturation (much more subtle).
  const onsetBrightness = 0;

  // Era-specific color adjustments (hue shift only — saturation handled by GLSL)
  const eraPreset = getEraPreset(showCtx?.era ?? "");
  const eraColorTempShift = eraPreset?.colorTempShift ?? 0;

  // GLSL owns color grading (saturation + contrast via cinematicGrade).
  // CSS handles brightness + hue only to avoid compound color crushing.
  // Previous CSS saturate/contrast compounded with GLSL tone mapping:
  //   0.70 × 0.75 = 0.525 effective saturation — too muted.
  const cssGate = factor; // 0 during quiet, 1 during loud (already smoothstep-based)
  const isClimaxPhase = (climaxMod?.brightnessOffset ?? 0) > 0.04;
  const brightCap = isClimaxPhase ? 1.40 : 1.25;
  // Gate all energy-reactive brightness by reactivity (0 during intro, 1 when engine open)
  const brightness = Math.min(brightCap, 0.96 + factor * 0.16 * reactivity + (climaxMod?.brightnessOffset ?? 0) * reactivity + (snapshot.fastEnergy ?? 0) * 0.12 * cssGate * reactivity);

  // Drums/Space phase adjustments (brightness + hue only — saturation/contrast handled by GLSL)
  let dsBrightOffset = 0;
  let dsHueOffset = 0;
  if (drumsSpacePhase === "space_ambient") {
    dsBrightOffset = -0.10; // darkness
    dsHueOffset = 15;       // blue shift
  } else if (drumsSpacePhase === "drums_tribal") {
    dsBrightOffset = +0.06;  // primal energy glow
    dsHueOffset = 12;        // warmth shift
  }

  // Show narrative phase adjustments
  let showBrightOffset = 0;
  if (showPhase === "opening") {
    showBrightOffset = 0.03;  // show is fresh
  }

  // Song identity modifiers
  const siHueShift = songIdentity?.hueShift ?? 0;
  const siPaletteBright = songIdentity?.palette?.brightness != null ? (songIdentity.palette.brightness - 1) * 0.2 : 0;

  // Show arc modifiers
  const arcBrightOffset = showArcModifiers?.brightnessOffset ?? 0;
  const arcHueShift = showArcModifiers?.hueShift ?? 0;

  // IT luminance lift
  const itBrightLift = itLuminanceLift ?? 0;

  // Vocal warmth: +25deg hue shift + brightness (saturation boost now handled by GLSL)
  const vocalHueShift = (vocalWarmth ?? 0) * 25;

  // Solo brightness + vocal brightness
  const soloBrightLift = isSolo ? (soloIntensity * 0.10) : 0;
  const vocalBrightLift = (vocalWarmth ?? 0) * 0.06;

  // Apply phase offsets + song identity + show arc + IT + narrative + solo + vocal + harmonic
  const baseBrightness = Math.min(brightCap, Math.max(0.55, brightness + dsBrightOffset + showBrightOffset + siPaletteBright + arcBrightOffset + itBrightLift + narrativeBrightness + soloBrightLift + vocalBrightLift + harmonicBrightness));
  // During dead air, dim brightness toward 0.55 (minimum floor) and suppress bloom
  const finalBrightness = deadAirFactor > 0
    ? baseBrightness * (1 - deadAirFactor * 0.40)  // dim by up to 40% during dead air
    : baseBrightness;

  // Guitar color temp: ±12deg hue shift based on Jerry's neck position
  const guitarHueShift = (guitarColorTemp ?? 0) * 12;

  // Chroma-based harmonic color: dominant pitch class modulates hue
  // chromaHue (0-360) maps the 12 pitch classes to the color wheel.
  // We offset from the song identity's primary hue (or 0) so the shift is relative.
  // Scaled to ±10 degrees — subtle harmonic color breathing.
  const songPrimaryHue = songIdentity?.palette?.primary ?? 0;
  const chromaDelta = snapshot.chromaHue - (songPrimaryHue % 360);
  // Normalize to [-180, 180] range, then scale to ±10 degrees
  const chromaNorm = ((chromaDelta + 540) % 360) - 180;
  // Extra chroma shift during jams/solos (20deg vs 10deg)
  const isJamOrSolo = jamColorTemp != null; // jamColorTemp only set for long jams
  const chromaMaxDeg = isJamOrSolo ? 20 : 10;
  const chromaHueShift = chromaNorm * (chromaMaxDeg / 180) * Math.min(1, energy * 5); // gate by energy to avoid drift in silence

  // Jam color temperature: warm shifts yellow, cool shifts blue (max ±12deg)
  // Only applied during long jams. EraGrade + SongPalette handle base color character.
  const jamHueShift = jamColorTemp != null ? jamColorTemp * 50 : 0; // ±40 degrees max
  // Narrative temperature: ±20deg hue shift (warm = positive, cool = negative)
  const narrativeHueShift = narrativeTemperature * 20;
  // Solo hue warmth: +20deg shift when solo is active
  const soloHueShift = isSolo ? soloIntensity * 20 : 0;
  // Suppress hue shift during dead air so applause is neutral
  const totalHueShift = (jamHueShift + eraColorTempShift + dsHueOffset + siHueShift + arcHueShift + vocalHueShift + guitarHueShift + chromaHueShift + narrativeHueShift + soloHueShift + modalHueShift) * (1 - deadAirFactor);
  // Combined saturation: counterpoint * harmonic * modal (convert modalSatOffset to multiplier)
  const combinedSatMult = counterpointSatMult * harmonicSatMult * (1 + modalSatOffset);
  const satFilter = Math.abs(combinedSatMult - 1) > 0.01 ? ` saturate(${combinedSatMult.toFixed(3)})` : "";
  const filterStr = totalHueShift !== 0
    ? `brightness(${finalBrightness.toFixed(3)}) hue-rotate(${totalHueShift.toFixed(1)}deg)${satFilter}`
    : `brightness(${finalBrightness.toFixed(3)})${satFilter}`;

  return (
    <div style={{ position: "absolute", inset: 0, filter: filterStr }}>
      {children}

      {/* CSS backdrop bloom removed — was a major strobe source.
          GLSL bloom + halation provide sufficient glow without the
          frame-to-frame brightness pulsation that CSS backdrop-filter caused. */}
    </div>
  );
};
