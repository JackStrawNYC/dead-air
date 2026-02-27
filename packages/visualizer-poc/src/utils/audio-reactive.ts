/**
 * Audio Reactivity — pure functions for multi-field audio snapshot computation.
 *
 * Extracts smoothed audio features from EnhancedFrameData for use by both
 * EnergyEnvelope (global modulation) and individual overlay components.
 *
 * Algorithms match AudioReactiveCanvas.tsx exactly (same Gaussian sigma,
 * same decay curves). Performance: two loops per call — one wide (energy,
 * window=150), one narrow (all other fields, window=20).
 */

import type { EnhancedFrameData } from "../data/types";

export interface AudioSnapshot {
  /** Gaussian-smoothed RMS energy (window=150, ~5s) */
  energy: number;
  /** Bass: (sub+low)/2, smoothed (window=20) */
  bass: number;
  /** Mids: smoothed (window=12) */
  mids: number;
  /** Highs: smoothed (window=8) */
  highs: number;
  /** Fast-attack / slow-decay onset transient envelope (release=12 frames) */
  onsetEnvelope: number;
  /** Exponential falloff from last beat (halfLife=20) */
  beatDecay: number;
  /** Dominant pitch class as hue 0-360 (circular mean, window=15) */
  chromaHue: number;
  /** Smoothed spectral brightness (window=18) */
  centroid: number;
  /** Smoothed tonal-vs-noise (window=15) */
  flatness: number;
}

/**
 * Gaussian-weighted average of a single field over +-window frames.
 * Sigma = window * 0.5 (matches AudioReactiveCanvas.tsx smoothValue).
 */
export function gaussianSmooth(
  frames: EnhancedFrameData[],
  idx: number,
  accessor: (f: EnhancedFrameData) => number,
  window: number,
): number {
  let sum = 0;
  let weightSum = 0;
  const sigma = window * 0.5;
  const lo = Math.max(0, idx - window);
  const hi = Math.min(frames.length - 1, idx + window);

  for (let i = lo; i <= hi; i++) {
    const dist = i - idx;
    const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));
    sum += accessor(frames[i]) * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? sum / weightSum : 0;
}

/**
 * Fast-attack / slow-release transient envelope.
 * Current frame passes at full strength; previous frames decay exponentially.
 * Matches AudioReactiveCanvas.tsx transientEnvelope().
 */
export function onsetEnvelope(
  frames: EnhancedFrameData[],
  idx: number,
  releaseFrames = 12,
): number {
  let peak = 0;
  for (let ago = 0; ago <= releaseFrames; ago++) {
    if (idx - ago < 0) break;
    const val = frames[idx - ago].onset;
    const decay = Math.exp((-ago * 3.0) / releaseFrames);
    peak = Math.max(peak, val * decay);
  }
  return peak;
}

/**
 * Exponential decay from last beat.
 * Looks back up to 45 frames; halfLife=20 gives ~0.67s breathing pulse.
 * Matches AudioReactiveCanvas.tsx beatDecay().
 */
export function beatDecay(
  frames: EnhancedFrameData[],
  idx: number,
  halfLife = 20,
): number {
  for (let ago = 0; ago < 45; ago++) {
    if (idx - ago < 0) break;
    if (frames[idx - ago].beat) return Math.pow(0.5, ago / halfLife);
  }
  return 0;
}

/**
 * Smoothed dominant pitch class as hue 0-360.
 * Uses circular mean of dominant chroma bin indices over +-window frames.
 * Matches AudioReactiveCanvas.tsx chromaHue computation.
 */
export function smoothedChromaHue(
  frames: EnhancedFrameData[],
  idx: number,
  window = 15,
): number {
  let sinSum = 0;
  let cosSum = 0;
  const lo = Math.max(0, idx - window);
  const hi = Math.min(frames.length - 1, idx + window);

  for (let i = lo; i <= hi; i++) {
    const ch = frames[i].chroma;
    let maxIdx = 0;
    for (let j = 1; j < 12; j++) {
      if (ch[j] > ch[maxIdx]) maxIdx = j;
    }
    const angle = (maxIdx / 12) * Math.PI * 2;
    sinSum += Math.sin(angle);
    cosSum += Math.cos(angle);
  }

  const meanAngle = Math.atan2(sinSum, cosSum);
  // Convert radians back to 0-360 degrees
  return ((meanAngle / (Math.PI * 2)) * 360 + 360) % 360;
}

/**
 * Smoothstep range mapping: maps value from [inLow, inHigh] to [outLow, outHigh]
 * with Hermite smoothstep interpolation. Clamped at both ends.
 */
export function audioMap(
  value: number,
  inLow: number,
  inHigh: number,
  outLow: number,
  outHigh: number,
): number {
  const t = Math.max(0, Math.min(1, (value - inLow) / (inHigh - inLow)));
  const s = t * t * (3 - 2 * t); // Hermite smoothstep
  return outLow + s * (outHigh - outLow);
}

/**
 * Compute all audio snapshot fields in one call.
 * Two-pass loop strategy for performance:
 *   - Wide pass (window=150) for energy
 *   - Narrow passes for everything else (window=8-20)
 */
export function computeAudioSnapshot(
  frames: EnhancedFrameData[],
  idx: number,
): AudioSnapshot {
  return {
    energy: gaussianSmooth(frames, idx, (f) => f.rms, 150),
    bass: gaussianSmooth(frames, idx, (f) => (f.sub + f.low) * 0.5, 20),
    mids: gaussianSmooth(frames, idx, (f) => f.mid, 12),
    highs: gaussianSmooth(frames, idx, (f) => f.high, 8),
    onsetEnvelope: onsetEnvelope(frames, idx, 12),
    beatDecay: beatDecay(frames, idx, 20),
    chromaHue: smoothedChromaHue(frames, idx, 15),
    centroid: gaussianSmooth(frames, idx, (f) => f.centroid, 18),
    flatness: gaussianSmooth(frames, idx, (f) => f.flatness, 15),
  };
}
