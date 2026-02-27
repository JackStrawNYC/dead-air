/**
 * Energy Envelope — shared energy computation for visual modulation.
 *
 * Pure functions (no React hooks) for Gaussian-weighted energy smoothing.
 * Used by EnergyEnvelope (color/bloom) and overlay-rotation (opacity breathing).
 *
 * Algorithm matches AudioReactiveCanvas.tsx smoothValue() — Gaussian bell curve
 * weighting over ±window frames. Thresholds calibrated from observed energy
 * ranges: quiet ~0.03-0.05, mid jams ~0.12-0.20, peak climaxes ~0.30-0.45.
 */

import type { EnhancedFrameData } from "../data/types";

/**
 * Gaussian-weighted RMS energy over ±window frames (~5s at default 150).
 * Returns smoothed energy value (typically 0.01 – 0.45).
 */
export function computeSmoothedEnergy(
  frames: EnhancedFrameData[],
  idx: number,
  window = 150,
): number {
  let sum = 0;
  let weightSum = 0;
  const sigma = window * 0.5;
  const lo = Math.max(0, idx - window);
  const hi = Math.min(frames.length - 1, idx + window);

  for (let i = lo; i <= hi; i++) {
    const dist = i - idx;
    const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));
    sum += frames[i].rms * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? sum / weightSum : 0;
}

/**
 * Hermite smoothstep: maps x from [edge0, edge1] to [0, 1].
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Map smoothed energy to a 0–1 factor via smoothstep.
 * low/high thresholds define the quiet→loud transition band.
 */
export function energyToFactor(
  energy: number,
  low = 0.05,
  high = 0.35,
): number {
  return smoothstep(low, high, energy);
}

/**
 * Map smoothed energy to overlay opacity multiplier (0.10–1.0).
 * 10x dynamic range: quiet passages nearly vanish (10% density),
 * peaks flood to full intensity. Matches the Dead's visual philosophy —
 * restraint during Space earns the climax.
 *
 * The smoothstep transition band (0.04–0.30) is calibrated so:
 *   - Quiet tuning (energy ~0.03) → 10% (almost invisible)
 *   - Mid jam (energy ~0.15)      → ~45% (present but not dominant)
 *   - Peak climax (energy ~0.30+) → 100% (full flood)
 */
export function overlayEnergyFactor(energy: number): number {
  const factor = energyToFactor(energy, 0.04, 0.30);
  return 0.10 + factor * 0.90;
}
