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
import { smoothstep } from "./math";

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
 * Map smoothed energy to overlay opacity multiplier (0.40–1.0).
 * 2.5x dynamic range: quiet passages still have clear presence (40%),
 * peaks reach full opacity. Overlays should always be visible.
 *
 * When calibration is provided, thresholds are derived from the recording's
 * own percentile analysis, so every show maps its full dynamic range.
 */
export function overlayEnergyFactor(energy: number, calibration?: EnergyCalibration): number {
  const low = calibration ? calibration.quietThreshold * 0.8 : 0.04;
  const high = calibration ? calibration.loudThreshold * 0.85 : 0.30;
  const factor = energyToFactor(energy, low, high);
  return 0.40 + factor * 0.60;
}

// ─── Per-show energy calibration ───

export interface EnergyCalibration {
  /** 10th percentile RMS — defines "quiet" threshold */
  quietThreshold: number;
  /** 90th percentile RMS — defines "loud" threshold */
  loudThreshold: number;
}

/**
 * Auto-calibrate energy thresholds from a song's frame data.
 * Uses percentile analysis so the full dynamic range of the recording
 * maps to the full visual range, regardless of absolute levels.
 *
 * Call once per song via useMemo. Falls back to hardcoded defaults
 * if frame data is too short.
 */
export function calibrateEnergy(frames: EnhancedFrameData[]): EnergyCalibration {
  if (frames.length < 60) {
    return { quietThreshold: 0.05, loudThreshold: 0.35 };
  }

  // Sample every 10th frame for performance (still ~900 samples for a 5-min song)
  const samples: number[] = [];
  for (let i = 0; i < frames.length; i += 10) {
    samples.push(frames[i].rms);
  }
  samples.sort((a, b) => a - b);

  const p10 = samples[Math.floor(samples.length * 0.10)];
  const p90 = samples[Math.floor(samples.length * 0.90)];

  // Clamp to reasonable range — don't let a very quiet recording
  // map silence to "loud" or a very loud recording compress everything
  const quietThreshold = Math.max(0.02, Math.min(0.10, p10));
  const loudThreshold = Math.max(0.15, Math.min(0.50, p90));

  return { quietThreshold, loudThreshold };
}

/**
 * Show-level energy calibration — aggregates RMS across all songs
 * so every song in the show uses the same energy scale.
 *
 * Use this when you want Morning Dew's climax and Mama Tried's
 * gentle verses to be calibrated relative to each other, not just
 * to themselves. Pass the result as calibration to per-song consumers.
 *
 * @param allFrameSets - Array of per-song EnhancedFrameData arrays
 */
export function calibrateEnergyGlobal(allFrameSets: EnhancedFrameData[][]): EnergyCalibration {
  const samples: number[] = [];
  for (const frames of allFrameSets) {
    for (let i = 0; i < frames.length; i += 10) {
      samples.push(frames[i].rms);
    }
  }

  if (samples.length < 100) {
    return { quietThreshold: 0.05, loudThreshold: 0.35 };
  }

  samples.sort((a, b) => a - b);
  const p10 = samples[Math.floor(samples.length * 0.10)];
  const p90 = samples[Math.floor(samples.length * 0.90)];

  const quietThreshold = Math.max(0.02, Math.min(0.10, p10));
  const loudThreshold = Math.max(0.15, Math.min(0.50, p90));

  return { quietThreshold, loudThreshold };
}
