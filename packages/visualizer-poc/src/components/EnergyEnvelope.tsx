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

export const EnergyEnvelope: React.FC<Props> = ({ snapshot, children, climaxMod }) => {
  const energy = snapshot.energy;
  const factor = energyToFactor(energy); // 0 (quiet) → 1 (loud)
  const showCtx = useShowContext();

  // ── Multi-field modulations (perceptible, not subtle) ──
  // Centroid: low centroid (bass-heavy) = cooler, high centroid (treble) = warmer
  const centroidHueOffset = (snapshot.centroid - 0.5) * 24; // ±12deg (was ±4)
  // Onset: percussive attacks create brightness punch
  const onsetBrightness = snapshot.onsetEnvelope * 0.12;    // +0-12% (was 4%)
  // Flatness: tonal passages richer, noisy passages flatter
  const flatnessSaturation = 0.04 - snapshot.flatness * 0.12; // +4% to -8% (was +2/-4)

  // Texture-aware vignette bonus
  const texture = detectTexture(snapshot, energy);
  const textureVignetteBonus =
    texture === "ambient" ? 0.15 :    // tunnel/portal during Space
    texture === "sparse" ? 0.08 :     // gentle focus during ballad intro
    texture === "peak" ? -0.05 : 0;   // wide open, let the flood breathe

  // Texture-aware saturation offset — Space→grayscale void, peaks→oversaturated ecstasy
  const textureSaturationOffset =
    texture === "ambient" ? -0.10 :   // Space: push toward grayscale void
    texture === "sparse" ? -0.05 :    // ballad intros: restrained
    texture === "peak" ? +0.08 : 0;   // peaks: oversaturated ecstasy

  // Widened modulation ranges — quiet feels void, peaks feel radiant
  const saturation = 0.45 + factor * 0.85 + flatnessSaturation + textureSaturationOffset + (climaxMod?.saturationOffset ?? 0);
  const brightness = 0.82 + factor * 0.24 + onsetBrightness + (climaxMod?.brightnessOffset ?? 0);
  const contrast = 0.94 + factor * 0.14;                        // 0.94 → 1.08
  const hueRotate = 5 - factor * 10 + centroidHueOffset;        // ±17deg (was ±7)
  const vignetteOpacity = 0.08 + factor * 0.42 + textureVignetteBonus + (climaxMod?.vignetteOffset ?? 0);
  const bloomOpacity = factor * 0.35 + (climaxMod?.bloomOffset ?? 0);

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
