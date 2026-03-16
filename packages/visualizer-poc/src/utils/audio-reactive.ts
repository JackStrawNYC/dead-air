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
import { energyGate } from "./math";

export interface AudioSnapshot {
  /** Gaussian-smoothed RMS energy (window=60, ~2s) */
  energy: number;
  /** Slow-moving energy for ambient modulation (window=180, ~6s) — drifts, doesn't pulse */
  slowEnergy: number;
  /** Bass: (sub+low)/2, smoothed (window=10) */
  bass: number;
  /** Mids: smoothed (window=8) */
  mids: number;
  /** Highs: smoothed (window=5) */
  highs: number;
  /** Fast-attack / slow-decay onset transient envelope (release=18 frames) */
  onsetEnvelope: number;
  /** Exponential falloff from last beat (halfLife=15) */
  beatDecay: number;
  /** Dominant pitch class as hue 0-360 (circular mean, window=15) */
  chromaHue: number;
  /** Smoothed spectral brightness (window=18) */
  centroid: number;
  /** Smoothed tonal-vs-noise (window=15) */
  flatness: number;
  /** Spectral flux: L2 norm of consecutive contrast vector differences, Gaussian-smoothed (window=8) */
  spectralFlux: number;
  /** Fast-responding energy: 8-frame Gaussian (~0.27s) for transient punch */
  fastEnergy: number;
  /** Stem-separated drum onset transient envelope (release=12) */
  drumOnset: number;
  /** Stem-separated drum beat decay (halfLife=12) */
  drumBeat: number;
  /** Musical time: beat count + fractional interpolation, phase-locked to detected tempo */
  musicalTime: number;
  /** Coherence: 0-1 band lock-in score (undefined when not computed) */
  coherence?: number;
  /** Whether band is in "locked in" state */
  isLocked?: boolean;
  /** Smoothed vocal energy from stem separation (0-1, fallback 0) */
  vocalEnergy: number;
  /** Smoothed vocal presence from stem separation (0-1, fallback 0) */
  vocalPresence: number;
  /** Smoothed other (guitar/keys) energy from stem separation (0-1, fallback (mid+high)/2) */
  otherEnergy: number;
  /** Smoothed other spectral centroid (guitar brightness) from stem separation (0-1, fallback overall centroid) */
  otherCentroid: number;
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
 * Generic fast-attack / slow-release transient envelope.
 * Like onsetEnvelope but takes an accessor for any numeric field.
 */
export function onsetEnvelopeGeneric(
  frames: EnhancedFrameData[],
  idx: number,
  accessor: (f: EnhancedFrameData) => number,
  releaseFrames = 12,
): number {
  let peak = 0;
  for (let ago = 0; ago <= releaseFrames; ago++) {
    if (idx - ago < 0) break;
    const val = accessor(frames[idx - ago]);
    const decay = Math.exp((-ago * 3.0) / releaseFrames);
    peak = Math.max(peak, val * decay);
  }
  return peak;
}

/**
 * Generic exponential decay from last truthy frame.
 * Like beatDecay but takes an accessor for any boolean-ish field.
 */
export function beatDecayGeneric(
  frames: EnhancedFrameData[],
  idx: number,
  accessor: (f: EnhancedFrameData) => boolean,
  halfLife = 12,
): number {
  for (let ago = 0; ago < 45; ago++) {
    if (idx - ago < 0) break;
    if (accessor(frames[idx - ago])) return Math.pow(0.5, ago / halfLife);
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
 * Compute spectral flux — rate of spectral change over a window.
 * L2 norm of consecutive contrast vector differences, Gaussian-smoothed.
 * High values indicate rapid timbral changes (transitions, drum hits).
 */
export function computeSpectralFlux(
  frames: EnhancedFrameData[],
  idx: number,
  window = 8,
): number {
  let sum = 0;
  let weightSum = 0;
  const sigma = window * 0.5;
  const lo = Math.max(1, idx - window);
  const hi = Math.min(frames.length - 1, idx + window);

  for (let i = lo; i <= hi; i++) {
    const curr = frames[i].contrast;
    const prev = frames[i - 1].contrast;
    let l2 = 0;
    for (let b = 0; b < 7; b++) {
      const diff = curr[b] - prev[b];
      l2 += diff * diff;
    }
    const dist = i - idx;
    const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));
    sum += Math.sqrt(l2) * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? sum / weightSum : 0;
}

/**
 * Pre-compute cumulative beat indices for O(1) musical time lookups.
 * Returns array of frame indices where beat=true.
 */
export function buildBeatArray(frames: EnhancedFrameData[]): number[] {
  const beats: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].beat) beats.push(i);
  }
  return beats;
}

/**
 * Compute musical time: beat count + fractional interpolation between beats.
 * Phase-locks to detected tempo so visuals breathe with the music.
 * Returns a continuously incrementing value where integer crossings = beat hits.
 */
export function computeMusicalTime(
  beatArray: number[],
  frameIdx: number,
  fps: number,
  tempo: number,
): number {
  if (beatArray.length === 0) {
    return (frameIdx / fps) * (tempo / 60);
  }

  let lo = 0;
  let hi = beatArray.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (beatArray[mid] <= frameIdx) lo = mid;
    else hi = mid - 1;
  }

  if (beatArray[lo] > frameIdx) {
    const expectedSpacing = (fps * 60) / tempo;
    return frameIdx / expectedSpacing;
  }

  const beatCount = lo;
  const beatFrame = beatArray[lo];
  const nextBeatFrame = lo + 1 < beatArray.length
    ? beatArray[lo + 1]
    : beatFrame + (fps * 60) / tempo;

  const spacing = nextBeatFrame - beatFrame;
  const fraction = spacing > 0 ? (frameIdx - beatFrame) / spacing : 0;

  return beatCount + Math.min(fraction, 1);
}

/**
 * Compute all audio snapshot fields in one call.
 * Two-pass loop strategy for performance:
 *   - Wide pass (window=60) for energy
 *   - Narrow passes for everything else (window=5-18)
 *
 * Optional beatArray/fps/tempo params enable musicalTime computation.
 * Existing callers passing only (frames, idx) get musicalTime: 0.
 */
export function computeAudioSnapshot(
  frames: EnhancedFrameData[],
  idx: number,
  beatArray?: number[],
  fps?: number,
  tempo?: number,
): AudioSnapshot {
  const energy = gaussianSmooth(frames, idx, (f) => f.rms, 60);
  const egate = energyGate(energy);

  return {
    energy,
    slowEnergy: gaussianSmooth(frames, idx, (f) => f.rms, 180),
    bass: gaussianSmooth(frames, idx, (f) => (f.sub + f.low) * 0.5, 10),
    mids: gaussianSmooth(frames, idx, (f) => f.mid, 8),
    highs: gaussianSmooth(frames, idx, (f) => f.high, 5),
    onsetEnvelope: onsetEnvelope(frames, idx, 18) * egate,
    beatDecay: beatDecay(frames, idx, 15) * egate,
    chromaHue: smoothedChromaHue(frames, idx, 15),
    centroid: gaussianSmooth(frames, idx, (f) => f.centroid, 18),
    flatness: gaussianSmooth(frames, idx, (f) => f.flatness, 15),
    spectralFlux: computeSpectralFlux(frames, idx, 8),
    fastEnergy: gaussianSmooth(frames, idx, (f) => f.rms, 8),
    drumOnset: onsetEnvelopeGeneric(frames, idx, (f) => f.stemDrumOnset ?? 0, 12) * egate,
    drumBeat: beatDecayGeneric(frames, idx, (f) => f.stemDrumBeat ?? false, 12) * egate,
    musicalTime: (beatArray && fps && tempo) ? computeMusicalTime(beatArray, idx, fps, tempo) : 0,
    vocalEnergy: gaussianSmooth(frames, idx, (f) => f.stemVocalRms ?? 0, 12),
    vocalPresence: gaussianSmooth(frames, idx, (f) => f.stemVocalPresence ? 1 : 0, 20),
    otherEnergy: frames[idx].stemOtherRms != null
      ? gaussianSmooth(frames, idx, (f) => f.stemOtherRms ?? 0, 10)
      : gaussianSmooth(frames, idx, (f) => (f.mid + f.high) * 0.5, 10),
    otherCentroid: frames[idx].stemOtherCentroid != null
      ? gaussianSmooth(frames, idx, (f) => f.stemOtherCentroid ?? 0, 15)
      : gaussianSmooth(frames, idx, (f) => f.centroid, 15),
  };
}
