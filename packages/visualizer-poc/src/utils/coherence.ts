/**
 * Coherence Detection — "IT" Detector.
 *
 * Detects when the band "locks in" — the musical coherence that
 * Deadheads call "IT." Pure functions, no state.
 *
 * 4 signals averaged:
 *   1. Chroma stability (cosine similarity ±30 frames) — weight 0.30
 *   2. Beat regularity (inverse std dev of intervals ±60 frames) — weight 0.25
 *   3. Spectral density (mean 7-band contrast) — weight 0.25
 *   4. Energy sustain (inverse spectral flux) — weight 0.20
 *
 * Lock detection: score > 0.65 for 90 consecutive frames (3s).
 * Hysteresis: stays locked until score < 0.45 for 60 frames.
 *
 * DETERMINISTIC: pure function of frame data (no module-level state).
 * Remotion renders frames out of order, so lock state is derived by
 * scanning backward from the current frame and simulating hysteresis.
 */

import type { EnhancedFrameData } from "../data/types";
import { computeSpectralFlux } from "./audio-reactive";

export interface CoherenceScore {
  /** Composite coherence score (0-1) */
  score: number;
  /** Whether the band is in a "locked in" state */
  isLocked: boolean;
  /** Frames since lock began (0 if not locked) */
  lockDuration: number;
}

// ─── Signal computations ───

/**
 * Chroma stability: cosine similarity of chroma vectors over ±window frames.
 * Stable key center = high value.
 */
function chromaStability(
  frames: EnhancedFrameData[],
  idx: number,
  window = 30,
): number {
  if (frames.length === 0) return 0;
  const lo = Math.max(0, idx - window);
  const hi = Math.min(frames.length - 1, idx + window);
  if (lo >= hi) return 0;

  // Current frame's chroma vector
  const current = frames[Math.min(idx, frames.length - 1)].chroma;

  let totalSim = 0;
  let count = 0;

  for (let i = lo; i <= hi; i++) {
    if (i === idx) continue;
    const other = frames[i].chroma;

    // Cosine similarity
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let j = 0; j < 12; j++) {
      dot += current[j] * other[j];
      magA += current[j] * current[j];
      magB += other[j] * other[j];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    if (denom > 0) {
      totalSim += dot / denom;
    }
    count++;
  }

  return count > 0 ? totalSim / count : 0;
}

/**
 * Beat regularity: inverse of std dev of inter-beat intervals over ±window frames.
 * Tight groove = high value.
 */
function beatRegularity(
  frames: EnhancedFrameData[],
  idx: number,
  window = 60,
): number {
  const lo = Math.max(0, idx - window);
  const hi = Math.min(frames.length - 1, idx + window);

  // Collect beat positions in window
  const beatPositions: number[] = [];
  for (let i = lo; i <= hi; i++) {
    if (frames[i].beat) beatPositions.push(i);
  }

  if (beatPositions.length < 3) return 0;

  // Compute inter-beat intervals
  const intervals: number[] = [];
  for (let i = 1; i < beatPositions.length; i++) {
    intervals.push(beatPositions[i] - beatPositions[i - 1]);
  }

  // Mean and std dev
  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  if (mean === 0) return 0;

  const variance =
    intervals.reduce((s, v) => s + (v - mean) * (v - mean), 0) /
    intervals.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation (normalized std dev)
  const cv = stdDev / mean;

  // Invert and clamp: cv=0 → 1.0, cv≥0.5 → 0.0
  return Math.max(0, Math.min(1, 1 - cv * 2));
}

/**
 * Spectral density: mean of 7-band contrast.
 * Full-band saturation = high.
 */
function spectralDensity(
  frames: EnhancedFrameData[],
  idx: number,
): number {
  if (frames.length === 0 || idx < 0 || idx >= frames.length) return 0;

  const contrast = frames[idx].contrast;
  if (!contrast) return 0;

  const mean = contrast.reduce((s, v) => s + v, 0) / contrast.length;
  // Normalize: typical contrast values are 0-1 range
  return Math.min(1, mean);
}

/**
 * Energy sustain: inverse of spectral flux.
 * Low flux = steady state = high coherence.
 */
function energySustain(
  frames: EnhancedFrameData[],
  idx: number,
): number {
  const flux = computeSpectralFlux(frames, idx, 8);
  // Invert: flux=0 → 1.0, flux≥2.0 → 0.0
  return Math.max(0, Math.min(1, 1 - flux * 0.5));
}

// ─── Lock detection constants ───

const LOCK_ENTER_THRESHOLD = 0.65;
const LOCK_EXIT_THRESHOLD = 0.45;
const LOCK_ENTER_FRAMES = 90;  // 3 seconds at 30fps
const LOCK_EXIT_FRAMES = 60;   // 2 seconds at 30fps

/** Max frames to scan backward for lock state determination */
const LOCK_SCAN_WINDOW = 300;

// ─── Stateless helpers ───

/**
 * Compute raw coherence score for a single frame (weighted average of 4 signals).
 * Pure function — no lock detection, no state.
 */
export function computeRawScore(
  frames: EnhancedFrameData[],
  idx: number,
): number {
  if (frames.length === 0) return 0;
  const safeIdx = Math.min(Math.max(0, idx), frames.length - 1);

  const chroma = chromaStability(frames, safeIdx, 30);
  const beat = beatRegularity(frames, safeIdx, 60);
  const density = spectralDensity(frames, safeIdx);
  const sustain = energySustain(frames, safeIdx);

  return chroma * 0.30 + beat * 0.25 + density * 0.25 + sustain * 0.20;
}

// ─── Main computation ───

/**
 * Compute coherence score for a single frame.
 *
 * DETERMINISTIC: pure function of frame data (no module-level state).
 * Scans backward from current frame to determine lock state via hysteresis
 * simulation. Safe for Remotion's out-of-order frame rendering.
 */
export function computeCoherence(
  frames: EnhancedFrameData[],
  idx: number,
): CoherenceScore {
  if (frames.length === 0) {
    return { score: 0, isLocked: false, lockDuration: 0 };
  }

  const safeIdx = Math.min(Math.max(0, idx), frames.length - 1);
  const score = computeRawScore(frames, safeIdx);

  // Scan backward to determine lock state via hysteresis simulation
  const scanStart = Math.max(0, safeIdx - LOCK_SCAN_WINDOW);

  let locked = false;
  let framesAbove = 0;
  let framesBelow = 0;
  let lockStart = -1;

  for (let i = scanStart; i <= safeIdx; i++) {
    const s = computeRawScore(frames, i);

    if (s > LOCK_ENTER_THRESHOLD) {
      framesAbove++;
      framesBelow = 0;
    } else if (s < LOCK_EXIT_THRESHOLD) {
      framesBelow++;
      framesAbove = 0;
    } else {
      framesAbove = 0;
      framesBelow = 0;
    }

    if (!locked && framesAbove >= LOCK_ENTER_FRAMES) {
      locked = true;
      lockStart = i - LOCK_ENTER_FRAMES + 1;
    }

    if (locked && framesBelow >= LOCK_EXIT_FRAMES) {
      locked = false;
      lockStart = -1;
    }
  }

  const lockDuration = locked && lockStart >= 0 ? safeIdx - lockStart : 0;

  return {
    score: Math.max(0, Math.min(1, score)),
    isLocked: locked,
    lockDuration: Math.max(0, lockDuration),
  };
}

// Export individual signals for testing
export { chromaStability, beatRegularity, spectralDensity, energySustain };
