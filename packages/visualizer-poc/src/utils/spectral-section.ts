/**
 * Spectral Section Analysis — classifies audio sections by timbral character.
 *
 * Computes average spectral centroid, flatness, and bass ratio for a frame range,
 * then maps to a SpectralFamily for shader routing. This breaks the convergence
 * where two high-energy sections with different timbral character (e.g., driving
 * rock vs. spacey jam) get the same shader pool.
 */

import type { EnhancedFrameData } from "../data/types";
import type { SpectralFamily } from "../scenes/scene-registry";

export interface SectionSpectralStats {
  avgCentroid: number;
  avgFlatness: number;
  bassRatio: number;
}

/**
 * Compute average spectral statistics for a frame range.
 * Returns normalized centroid (0-1), flatness (0-1), and bass ratio (sub+low / total energy).
 */
export function computeSectionSpectral(
  frames: EnhancedFrameData[],
  frameStart: number,
  frameEnd: number,
): SectionSpectralStats {
  const lo = Math.max(0, frameStart);
  const hi = Math.min(frames.length, frameEnd);
  if (hi <= lo) return { avgCentroid: 0.4, avgFlatness: 0.3, bassRatio: 0.3 };

  let centroidSum = 0;
  let flatnessSum = 0;
  let bassSum = 0;
  let totalSum = 0;
  let count = 0;

  for (let i = lo; i < hi; i++) {
    const f = frames[i];
    centroidSum += f.centroid;
    flatnessSum += f.flatness;
    // Bass ratio: sub + low relative to total spectral energy
    const bass = f.sub + f.low;
    const total = f.sub + f.low + f.mid + f.high;
    bassSum += total > 0 ? bass / total : 0.3;
    totalSum += total;
    count++;
  }

  return {
    avgCentroid: centroidSum / count,
    avgFlatness: flatnessSum / count,
    bassRatio: bassSum / count,
  };
}

/**
 * Classify a section's spectral stats into a SpectralFamily.
 * Returns undefined when no family matches clearly (backwards-compatible: no filtering).
 *
 * Thresholds tuned for Grateful Dead analysis data:
 * - warm: bass-heavy, dark (Wall of Sound, drums-heavy passages)
 * - bright: high centroid, punchy (electric peaks, vocal-forward)
 * - textural: high flatness, complex spectra (Space, feedback, noise)
 * - tonal: low flatness, harmonic (clean melodies, acoustic passages)
 * - cosmic: mid-range, wide spread (ambient jams, ethereal passages)
 */
export function classifySpectralFamily(
  centroid: number,
  flatness: number,
  bassRatio: number,
): SpectralFamily | undefined {
  // Order matters: more specific conditions first
  if (bassRatio > 0.45 && centroid < 0.35) return "warm";
  if (centroid > 0.55 && flatness < 0.3) return "bright";
  if (flatness > 0.4) return "textural";
  if (flatness < 0.2 && centroid >= 0.3 && centroid <= 0.55) return "tonal";
  if (centroid >= 0.3 && centroid <= 0.55 && flatness >= 0.2 && flatness <= 0.4) return "cosmic";
  return undefined; // no clear match — don't filter
}

/**
 * Compute the dominant spectral family for a section's frame range.
 * Combines computeSectionSpectral + classifySpectralFamily.
 */
export function getSectionSpectralFamily(
  frames: EnhancedFrameData[],
  frameStart: number,
  frameEnd: number,
): SpectralFamily | undefined {
  const stats = computeSectionSpectral(frames, frameStart, frameEnd);
  return classifySpectralFamily(stats.avgCentroid, stats.avgFlatness, stats.bassRatio);
}
