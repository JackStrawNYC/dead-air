/**
 * Modal Color Detection — detects musical mode during jams/solos and
 * returns hue/saturation modifiers for mode-driven color shifts.
 *
 * Analyzes a 60-frame chroma window to identify the root note and match
 * against 7 church mode templates via cosine similarity. Each mode maps
 * to a distinct hue shift and saturation offset, scaled by confidence.
 *
 * Only active during jam/solo/space/drums sections — structured sections
 * (verse, chorus, intro, outro, bridge) return neutral.
 */

import type { EnhancedFrameData } from "../data/types";

export interface ModalColorResult {
  hueShift: number; // degrees (-40 to +25)
  satOffset: number; // -0.10 to +0.08
  mode: string | null; // detected mode name or null
  confidence: number; // 0-1
}

const NEUTRAL: ModalColorResult = {
  hueShift: 0,
  satOffset: 0,
  mode: null,
  confidence: 0,
};

/** Sections where modal color is active */
const ACTIVE_SECTIONS = new Set(["jam", "solo", "space", "drums"]);

/** 7 church mode templates — binary pitch class profiles starting from root */
const MODE_TEMPLATES: Record<string, readonly number[]> = {
  ionian: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1],
  dorian: [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0],
  phrygian: [1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0],
  lydian: [1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1],
  mixolydian: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0],
  aeolian: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0],
  locrian: [1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0],
};

/** Mode → visual color mapping */
const MODE_COLORS: Record<string, { hueShift: number; satOffset: number }> = {
  ionian: { hueShift: 10, satOffset: 0.05 },
  dorian: { hueShift: -20, satOffset: 0.03 },
  phrygian: { hueShift: -40, satOffset: 0.05 },
  lydian: { hueShift: 25, satOffset: 0.06 },
  mixolydian: { hueShift: 15, satOffset: 0.08 },
  aeolian: { hueShift: -30, satOffset: -0.03 },
  locrian: { hueShift: 0, satOffset: -0.1 },
};

/**
 * Pearson correlation between two equal-length vectors.
 * Centers both vectors (subtracts mean) before computing cosine similarity,
 * which gives much better discrimination between mode templates that share
 * most of their scale tones (e.g. Mixolydian vs Ionian differ by one note).
 * Returns 0 if either vector has zero variance.
 */
function pearsonCorrelation(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    dot += da * db;
    magA += da * da;
    magB += db * db;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Detect musical mode from chroma content and return visual color modifiers.
 * Only active during jam/solo/space/drums sections.
 *
 * @param frames Full frame array
 * @param idx Current frame index
 * @param sectionType Current section type (from analysis)
 */
export function detectModalColor(
  frames: EnhancedFrameData[],
  idx: number,
  sectionType?: string,
): ModalColorResult {
  // Gate: only active for jam/solo/space/drums sections
  if (!sectionType || !ACTIVE_SECTIONS.has(sectionType)) {
    return { ...NEUTRAL };
  }

  // Bail on empty frames
  if (frames.length === 0) {
    return { ...NEUTRAL };
  }

  // 60-frame window centered on idx
  const halfWindow = 30;
  const start = Math.max(0, idx - halfWindow);
  const end = Math.min(frames.length, idx + halfWindow);

  // Average chroma across the window
  const avgChroma = new Float64Array(12);
  let count = 0;

  for (let i = start; i < end; i++) {
    const chroma = frames[i].chroma;
    if (chroma) {
      for (let c = 0; c < 12; c++) {
        avgChroma[c] += chroma[c];
      }
      count++;
    }
  }

  if (count === 0) {
    return { ...NEUTRAL };
  }

  for (let c = 0; c < 12; c++) {
    avgChroma[c] /= count;
  }

  // Root detection: pitch class with highest averaged energy
  let rootIdx = 0;
  let rootEnergy = avgChroma[0];
  for (let c = 1; c < 12; c++) {
    if (avgChroma[c] > rootEnergy) {
      rootEnergy = avgChroma[c];
      rootIdx = c;
    }
  }

  // Transpose chroma so root = index 0
  const transposed: number[] = new Array(12);
  for (let c = 0; c < 12; c++) {
    transposed[c] = avgChroma[(c + rootIdx) % 12];
  }

  // Match against all 7 mode templates via cosine similarity
  const scores: { mode: string; score: number }[] = [];
  for (const [modeName, template] of Object.entries(MODE_TEMPLATES)) {
    scores.push({
      mode: modeName,
      score: pearsonCorrelation(transposed, template),
    });
  }

  // Sort descending by score
  scores.sort((a, b) => b.score - a.score);

  const bestScore = scores[0].score;
  const secondBestScore = scores[1].score;

  // Confidence gating: require significant absolute margin between best and second-best.
  // Using absolute margin (not relative) since Pearson scores can be small or negative.
  // Threshold 0.15 means the best mode must clearly stand out from the runner-up.
  const margin = bestScore - secondBestScore;
  if (bestScore <= 0 || margin <= 0.15) {
    return { ...NEUTRAL };
  }

  // Confidence: margin scaled into 0-1 range (margin of 0.15-1.0 → confidence 0-1)
  const confidence = Math.min(1, margin / 1.0);

  const bestMode = scores[0].mode;
  const colors = MODE_COLORS[bestMode];

  return {
    hueShift: colors.hueShift * confidence,
    satOffset: colors.satOffset * confidence,
    mode: bestMode,
    confidence,
  };
}
