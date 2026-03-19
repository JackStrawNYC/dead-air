/**
 * Stem Interplay Detection — cross-correlate stem energies to detect
 * how instruments interact within a musical moment.
 *
 * Uses a 30-frame (~1s) sliding window over per-frame audio features
 * to classify 4 interplay modes:
 *
 *   tight-lock     — all stems moving together (high cross-correlation)
 *   call-response  — stems alternating (negative/low cross-correlation, high variance)
 *   textural-wash  — all stems low + flat (ambient/textural, low variance)
 *   solo-spotlight  — one stem dominant, others suppressed
 *
 * Visual modulations per mode:
 *   tight-lock     → higher overlay density, steadier camera, converged palette
 *   call-response  → moderate density, camera follows lead, palette shifts
 *   textural-wash  → low density, drifting camera, desaturated palette
 *   solo-spotlight  → focused density, tight camera, spotlight color temp
 */

import type { EnhancedFrameData } from "../data/types";

export type InterplayMode = "tight-lock" | "call-response" | "textural-wash" | "solo-spotlight";

export interface StemInterplay {
  mode: InterplayMode;
  /** Confidence in the detected mode (0-1) */
  confidence: number;
  /** Overlay density multiplier (0.7-1.3) */
  densityMult: number;
  /** Camera motion multiplier (0.6-1.2) */
  motionMult: number;
  /** Color convergence factor: 1 = all stems pull palette together, 0 = spread */
  colorConvergence: number;
  /** Which stem is dominant in solo-spotlight mode (null otherwise) */
  spotlightStem: "vocal" | "guitar" | "bass" | "drums" | null;
}

const WINDOW = 30; // ~1 second at 30fps

/** Extract stem energies from a frame (raw EnhancedFrameData field names) */
function stemVector(frame: EnhancedFrameData): [number, number, number, number] {
  return [
    frame.stemVocalRms ?? 0,
    frame.stemDrumOnset ?? 0,
    frame.stemBassRms ?? frame.sub ?? 0,
    frame.stemOtherRms ?? ((frame.mid + frame.high) / 2),
  ];
}

/** Compute mean of an array */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

/** Compute variance of an array */
function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    sum += d * d;
  }
  return sum / arr.length;
}

/** Pearson correlation between two arrays (clamped to [-1, 1]) */
function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da2 = 0;
  let db2 = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    num += da * db;
    da2 += da * da;
    db2 += db * db;
  }
  const denom = Math.sqrt(da2 * db2);
  if (denom < 1e-10) return 0;
  return Math.max(-1, Math.min(1, num / denom));
}

/**
 * Detect stem interplay mode from a window of frames.
 *
 * @param frames - Full frame array
 * @param frameIdx - Current frame index
 * @returns StemInterplay classification with visual modulations
 */
export function detectStemInterplay(frames: EnhancedFrameData[], frameIdx: number): StemInterplay {
  // Collect window of stem vectors
  const start = Math.max(0, frameIdx - WINDOW + 1);
  const end = Math.min(frames.length, frameIdx + 1);
  const windowLen = end - start;

  if (windowLen < 5) {
    return { mode: "textural-wash", confidence: 0, densityMult: 1, motionMult: 1, colorConvergence: 0.5, spotlightStem: null };
  }

  const vocals: number[] = [];
  const drums: number[] = [];
  const bass: number[] = [];
  const guitar: number[] = [];

  for (let i = start; i < end; i++) {
    const [v, d, b, g] = stemVector(frames[i]);
    vocals.push(v);
    drums.push(d);
    bass.push(b);
    guitar.push(g);
  }

  // Cross-correlations between all stem pairs
  const corr_vd = correlation(vocals, drums);
  const corr_vb = correlation(vocals, bass);
  const corr_vg = correlation(vocals, guitar);
  const corr_db = correlation(drums, bass);
  const corr_dg = correlation(drums, guitar);
  const corr_bg = correlation(bass, guitar);
  const avgCorr = (corr_vd + corr_vb + corr_vg + corr_db + corr_dg + corr_bg) / 6;

  // Variance per stem (activity level)
  const varV = variance(vocals);
  const varD = variance(drums);
  const varB = variance(bass);
  const varG = variance(guitar);
  const totalVar = varV + varD + varB + varG;

  // Mean energy per stem
  const meanV = mean(vocals);
  const meanD = mean(drums);
  const meanB = mean(bass);
  const meanG = mean(guitar);
  const totalMean = meanV + meanD + meanB + meanG;

  // --- Solo-spotlight: one stem >> others ---
  if (totalMean > 0.05) {
    const stems: Array<{ name: "vocal" | "guitar" | "bass" | "drums"; energy: number }> = [
      { name: "vocal", energy: meanV },
      { name: "guitar", energy: meanG },
      { name: "bass", energy: meanB },
      { name: "drums", energy: meanD },
    ];
    stems.sort((a, b) => b.energy - a.energy);
    const dominance = stems[0].energy / totalMean;
    if (dominance > 0.55 && stems[0].energy > 0.1) {
      const conf = Math.min(1, (dominance - 0.55) * 4);
      return {
        mode: "solo-spotlight",
        confidence: conf,
        densityMult: 0.85,       // Focus: fewer overlays
        motionMult: 0.75,        // Tight, focused camera
        colorConvergence: 0.3,   // Spotlight color diverges from pack
        spotlightStem: stems[0].name,
      };
    }
  }

  // --- Textural-wash: low overall activity, flat ---
  if (totalVar < 0.002 && totalMean < 0.2) {
    const conf = Math.min(1, (0.2 - totalMean) * 5);
    return {
      mode: "textural-wash",
      confidence: conf,
      densityMult: 0.75,        // Sparse overlays for breathing room
      motionMult: 1.15,         // Drifty, contemplative camera
      colorConvergence: 0.2,    // Desaturated, spread palette
      spotlightStem: null,
    };
  }

  // --- Tight-lock: high average positive correlation ---
  if (avgCorr > 0.4) {
    const conf = Math.min(1, (avgCorr - 0.4) * 2.5);
    return {
      mode: "tight-lock",
      confidence: conf,
      densityMult: 1.2,         // Dense: band is locked in, visuals lock in
      motionMult: 0.85,         // Steady camera: locked groove
      colorConvergence: 0.9,    // All pulling palette same direction
      spotlightStem: null,
    };
  }

  // --- Call-response: moderate-to-low correlation + high variance ---
  if (avgCorr < 0.2 && totalVar > 0.003) {
    const conf = Math.min(1, (0.2 - avgCorr) * 2.5 + (totalVar - 0.003) * 50);
    conf; // use in return
    return {
      mode: "call-response",
      confidence: Math.min(1, conf),
      densityMult: 1.0,         // Moderate: visual conversation
      motionMult: 1.05,         // Slightly active camera following leads
      colorConvergence: 0.5,    // Palette shifts between responders
      spotlightStem: null,
    };
  }

  // --- Default fallback (ambiguous) ---
  return {
    mode: "textural-wash",
    confidence: 0.2,
    densityMult: 1.0,
    motionMult: 1.0,
    colorConvergence: 0.5,
    spotlightStem: null,
  };
}
