/**
 * Improvisation Detector — estimates how "improvisational" a passage is.
 *
 * Composite score (0-1) from:
 *   - Tempo variance (25%): high variance = less structured = more improv
 *   - Harmonic novelty (25%): frequent chord changes vs baseline
 *   - Beat instability × energy (30%): unstable rhythm at high energy = improv
 *   - Harmonic tension (20%): sustained high tension = exploratory
 *
 * Calibration (May 2026): divisors recalibrated to match observed Dead-jam
 * ranges (tempo_std/8 BPM, changes_per_sec/2). Prior values (15, 4) were
 * unreachable — real jams maxed at ~0.5 and never crossed the 0.6/0.65
 * trigger thresholds. KEEP IN SYNC with analyze.py improv_arr computation.
 *
 * Used as fallback when Python-side improvisationScore is unavailable.
 * When Python score IS available, it takes precedence (computed from
 * librosa features with better temporal resolution).
 */

import type { EnhancedFrameData } from "../data/types";

/**
 * Estimate improvisation score for a window of frames.
 * @param frames Full frame array
 * @param centerIdx Current frame index
 * @param windowSize Window in frames (default 90 = 3s at 30fps)
 * @returns Score 0-1 (0 = structured, 1 = highly improvisational)
 */
export function estimateImprovisationScore(
  frames: EnhancedFrameData[],
  centerIdx: number,
  windowSize = 90,
): number {
  const halfWindow = Math.floor(windowSize / 2);
  const start = Math.max(0, centerIdx - halfWindow);
  const end = Math.min(frames.length, centerIdx + halfWindow);
  const count = end - start;

  if (count < 10) return 0;

  // 1. Tempo variance (25%)
  const tempos: number[] = [];
  for (let i = start; i < end; i++) {
    const tempo = frames[i].localTempo;
    if (tempo != null && tempo > 0) tempos.push(tempo);
  }
  let tempoVariance = 0;
  if (tempos.length > 2) {
    const mean = tempos.reduce((a, b) => a + b, 0) / tempos.length;
    const variance = tempos.reduce((sum, t) => sum + (t - mean) ** 2, 0) / tempos.length;
    // Typical Dead jam tempo drift is 4-8 BPM std. /8 saturates at the
    // realistic upper end; the prior /15 needed unrealistic drift and
    // never saturated.
    tempoVariance = Math.min(1, Math.sqrt(variance) / 8);
  }

  // 2. Harmonic novelty (25%)
  let chordChanges = 0;
  let prevChord = -1;
  for (let i = start; i < end; i++) {
    const chord = frames[i].chordIndex;
    if (chord != null) {
      const quantized = Math.round(chord * 23);
      if (prevChord >= 0 && quantized !== prevChord) chordChanges++;
      prevChord = quantized;
    }
  }
  // Realistic ceiling is ~2 changes/sec (any faster is template noise).
  // Prior /4 made novelty unreachable in real Dead progressions where
  // 1.5/sec is already a busy jam.
  const changesPerSecond = chordChanges / (count / 30);
  const harmonicNovelty = Math.min(1, changesPerSecond / 2);

  // 3. Beat instability × energy (30%)
  let beatStabilitySum = 0;
  let energySum = 0;
  for (let i = start; i < end; i++) {
    beatStabilitySum += frames[i].beatConfidence ?? 0.5;
    energySum += frames[i].rms;
  }
  const avgBeatStability = beatStabilitySum / count;
  const avgEnergy = energySum / count;
  // Improv = unstable beats at high energy (not just quiet/sparse)
  const beatInstability = (1 - avgBeatStability) * Math.min(1, avgEnergy * 3);

  // 4. Harmonic tension (20%)
  let tensionSum = 0;
  for (let i = start; i < end; i++) {
    tensionSum += frames[i].harmonicTension ?? 0;
  }
  const avgTension = tensionSum / count;

  // Composite
  return (
    tempoVariance * 0.25 +
    harmonicNovelty * 0.25 +
    beatInstability * 0.30 +
    avgTension * 0.20
  );
}
