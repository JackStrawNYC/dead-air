/**
 * EnergyEnvelope — continuous visual modulation based on audio energy.
 *
 * Wraps children inside EraGrade and applies per-frame CSS filters + vignette
 * + bloom based on Gaussian-smoothed energy. All modulations are subtle (10-20%
 * range) so they compose cleanly with EraGrade's per-era color grading.
 *
 * Quiet passages: cooler, slightly desaturated, minimal vignette
 * Loud passages:  warmer, saturated, focused vignette + warm bloom
 */

import React, { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { computeSmoothedEnergy, energyToFactor } from "../utils/energy";

interface Props {
  frames: EnhancedFrameData[];
  children: React.ReactNode;
}

export const EnergyEnvelope: React.FC<Props> = ({ frames, children }) => {
  const frame = useCurrentFrame();
  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  const energy = useMemo(
    () => computeSmoothedEnergy(frames, idx),
    [frames, idx],
  );

  const factor = energyToFactor(energy); // 0 (quiet) → 1 (loud)

  // Modulation ranges (all subtle)
  const saturation = 0.92 + factor * 0.16;    // 0.92 → 1.08
  const brightness = 0.97 + factor * 0.06;    // 0.97 → 1.03
  const contrast = 0.98 + factor * 0.06;      // 0.98 → 1.04
  const hueRotate = 3 - factor * 6;           // +3deg (cool) → -3deg (warm)
  const vignetteOpacity = 0.05 + factor * 0.17; // 0.05 → 0.22
  const bloomOpacity = factor * 0.08;           // 0 → 0.08

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
