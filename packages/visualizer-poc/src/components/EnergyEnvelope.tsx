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
import type { ClimaxModulation } from "../utils/climax-state";

interface Props {
  /** Pre-computed audio snapshot from SongVisualizer (shared, not recomputed) */
  snapshot: AudioSnapshot;
  children: React.ReactNode;
  climaxMod?: ClimaxModulation;
}

export const EnergyEnvelope: React.FC<Props> = ({ snapshot, children, climaxMod }) => {
  const energy = snapshot.energy;
  const factor = energyToFactor(energy); // 0 (quiet) → 1 (loud)

  // ── Multi-field modulations (added to energy-based values) ──
  // Centroid: low centroid (bass-heavy) = cooler, high centroid (treble) = warmer
  const centroidHueOffset = (snapshot.centroid - 0.5) * 8; // ±4deg
  // Onset: percussive attacks create brief brightness pulse
  const onsetBrightness = snapshot.onsetEnvelope * 0.04;   // +0-4%
  // Flatness: tonal passages slightly richer, noisy passages slightly flatter
  const flatnessSaturation = 0.02 - snapshot.flatness * 0.06; // +2% to -4%

  // Modulation ranges (all subtle), now with multi-field + climax additions
  const saturation = 0.92 + factor * 0.16 + flatnessSaturation + (climaxMod?.saturationOffset ?? 0);
  const brightness = 0.97 + factor * 0.06 + onsetBrightness + (climaxMod?.brightnessOffset ?? 0);
  const contrast = 0.98 + factor * 0.06;                        // 0.98 → 1.04
  const hueRotate = 3 - factor * 6 + centroidHueOffset;         // ±7deg
  const vignetteOpacity = 0.05 + factor * 0.17 + (climaxMod?.vignetteOffset ?? 0);
  const bloomOpacity = factor * 0.08 + (climaxMod?.bloomOffset ?? 0);

  const filterStr = `saturate(${saturation.toFixed(3)}) brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) hue-rotate(${hueRotate.toFixed(1)}deg)`;

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

      {/* Bloom — warm glow at high energy */}
      {bloomOpacity > 0.001 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at center, rgba(255,220,180,0.15) 0%, transparent 70%)",
            mixBlendMode: "screen",
            opacity: bloomOpacity,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};
