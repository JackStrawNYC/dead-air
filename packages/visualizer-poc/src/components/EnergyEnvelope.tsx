/**
 * EnergyEnvelope — continuous visual modulation based on audio energy.
 *
 * Drives brightness, saturation, and hue via GLSL uniforms (EnvelopeContext).
 * Stripped to essentials: energy-driven brightness with real dynamic range,
 * drums/space hue shifts, IT coherence lock saturation surge.
 *
 * Quiet passages: dark (30% brightness)
 * Loud passages:  bright (100%+), with climax boost
 */

import React from "react";
import { energyToFactor } from "../utils/energy";
import type { EnergyCalibration } from "../utils/energy";
import type { AudioSnapshot } from "../utils/audio-reactive";
import type { ClimaxModulation } from "../utils/climax-state";
import { EnvelopeProvider } from "../data/EnvelopeContext";

interface Props {
  /** Pre-computed audio snapshot from SongVisualizer (shared, not recomputed) */
  snapshot: AudioSnapshot;
  children: React.ReactNode;
  climaxMod?: ClimaxModulation;
  /** Per-song energy calibration (auto-derived from recording percentiles) */
  calibration?: EnergyCalibration;
  /** Drums/Space sub-phase for phase-specific color adjustments */
  drumsSpacePhase?: string;
  /** IT response luminance lift (additive brightness) */
  itLuminanceLift?: number;
  /** IT saturation surge multiplier (1.0 = normal, up to 2.5 at transcendent lock) */
  itSaturationSurge?: number;
  /** IT vignette pull (0 = normal, 0.3 = tight tunnel focus) */
  itVignettePull?: number;
  /** Dead air factor (0 = music playing, 1 = fully in dead air/applause) */
  deadAirFactor?: number;
  /** Intro factor 0-1: 0 = intro period (suppress reactive brightness), 1 = engine fully open */
  introFactor?: number;
}

export const EnergyEnvelope: React.FC<Props> = ({ snapshot, children, climaxMod, calibration, drumsSpacePhase, itLuminanceLift = 0, itSaturationSurge = 1, itVignettePull = 0, deadAirFactor = 0, introFactor = 1 }) => {
  const energy = snapshot.energy;
  const low = calibration?.quietThreshold;
  const high = calibration?.loudThreshold;
  const factor = energyToFactor(energy, low, high); // 0 (quiet) → 1 (loud)

  // Intro damping: suppress ALL reactive brightness during intro so art/text shines
  // In OVERLAY_ONLY mode, bypass all dimming — overlays composite over shader video
  const isOverlayOnly = process.env.OVERLAY_ONLY === "true";
  const reactivity = introFactor;

  // ── One brightness knob. Wide dynamic range. ──
  // 0.55 (quiet) → 1.05 (loud): 50% swing instead of old 20%.
  // sqrt curve preserves gentle ramp-up from silence without harsh dark.
  const brightness = 0.55 + Math.sqrt(factor) * 0.50 * reactivity;

  // Drums/Space phase adjustments
  let dsBrightOffset = 0;
  let dsHueOffset = 0;
  if (drumsSpacePhase === "space_ambient") {
    dsBrightOffset = -0.10;
    dsHueOffset = 15;       // blue shift
  } else if (drumsSpacePhase === "drums_tribal") {
    dsBrightOffset = +0.06;
    dsHueOffset = 12;       // warmth shift
  }

  // Dead air dims the shader so applause/tuning is visually quiet. 60% dimming
  // keeps the shader perceptibly alive during quiet songs like Goodnight (which
  // reads as dead air regardless of threshold because RMS is genuinely ~0.05).
  // 85% was tested and found too aggressive — Goodnight went to 5% brightness
  // which is effectively invisible. 60% → floor of ~30% brightness.
  const baseBrightness = deadAirFactor > 0.5
    ? brightness  // no minimum floor during heavy dead air
    : Math.max(0.50, brightness);
  const finalBrightness = deadAirFactor > 0
    ? Math.max(0.15, baseBrightness * (1 - deadAirFactor * 0.60))
    : baseBrightness;

  // Palette sovereignty: only drums/space hue + dead air warmth
  // Chroma hue breathing: dominant pitch class modulates hue ±5 degrees (chill calibration).
  // Was ±15° — too noticeable on long renders. Now subtle enough to be felt-not-seen.
  const chromaHueShift = (snapshot.chromaHue ?? 0) * (5 / 360) * Math.min(1, energy * 4);
  const totalHueShift = (dsHueOffset + chromaHueShift + deadAirFactor * 20) * (1 - deadAirFactor * 0.5);

  // Saturation: only IT surge (coherence lock is worth honoring)
  const combinedSatMult = itSaturationSurge;

  // Envelope values passed to GLSL via EnvelopeContext
  const envelopeValues = {
    brightness: finalBrightness,
    saturation: combinedSatMult,
    hue: totalHueShift * (Math.PI / 180),
  };

  // IT vignette tunnel focus
  const vignetteStyle = itVignettePull > 0.01
    ? { boxShadow: `inset 0 0 ${Math.round(80 + itVignettePull * 200)}px ${Math.round(itVignettePull * 120)}px rgba(0,0,0,${(itVignettePull * 1.5).toFixed(2)})` }
    : undefined;

  return (
    <EnvelopeProvider value={envelopeValues}>
    <div style={{ position: "absolute", inset: 0, ...vignetteStyle }}>
      {children}
    </div>
    </EnvelopeProvider>
  );
};
