/**
 * Supervised decision-tree section type classifier.
 *
 * Uses (energy, flatness, beatConfidence, vocalPresence, songProgress) to
 * classify section types more reliably than the unsupervised MFCC clustering
 * in analyze.py. Decision tree thresholds are tuned for Grateful Dead musical
 * structure (long jams, spacey passages, vocal verses/choruses).
 *
 * Feature-flagged — defaults OFF. This module is standalone; integration into
 * the rendering pipeline comes later.
 */

/** Valid section type labels */
export type SectionType =
  | "verse"
  | "chorus"
  | "jam"
  | "space"
  | "solo"
  | "bridge"
  | "intro"
  | "outro";

/** Classification result with confidence score */
export interface SectionClassification {
  sectionType: SectionType;
  confidence: number; // 0-1
}

/**
 * Classify a single frame's section type using a decision tree.
 *
 * Rules are ordered from most specific (intro/outro positional) to most general
 * (jam default). Each rule computes a confidence score based on how far the
 * input features exceed the rule's thresholds — features well past a threshold
 * produce higher confidence than those barely crossing it.
 *
 * @param energy        RMS energy, normalized 0-1
 * @param flatness      Spectral flatness 0-1 (0=tonal, 1=noise)
 * @param beatConfidence Beat clarity 0-1
 * @param vocalPresence  Vocal presence 0-1 (boolean-ish from stems)
 * @param songProgress   Position in song 0-1
 */
export function classifySectionType(
  energy: number,
  flatness: number,
  beatConfidence: number,
  vocalPresence: number,
  songProgress: number,
): SectionClassification {
  // Rule 1: Intro — very low energy at the start of the song
  if (energy < 0.05 && songProgress < 0.1) {
    const conf = computeConfidence([
      [energy, 0.05, "below"],
      [songProgress, 0.1, "below"],
    ]);
    return { sectionType: "intro", confidence: conf };
  }

  // Rule 2: Outro — very low energy at the end of the song
  if (energy < 0.05 && songProgress > 0.85) {
    const conf = computeConfidence([
      [energy, 0.05, "below"],
      [songProgress, 0.85, "above"],
    ]);
    return { sectionType: "outro", confidence: conf };
  }

  // Rule 3: Space — low energy, high noise, no beat structure
  if (energy < 0.08 && flatness > 0.4 && beatConfidence < 0.3) {
    const conf = computeConfidence([
      [energy, 0.08, "below"],
      [flatness, 0.4, "above"],
      [beatConfidence, 0.3, "below"],
    ]);
    return { sectionType: "space", confidence: conf };
  }

  // Rule 4: Chorus — high energy, strong beat, vocals present
  if (energy > 0.25 && beatConfidence > 0.6 && vocalPresence > 0.5) {
    const conf = computeConfidence([
      [energy, 0.25, "above"],
      [beatConfidence, 0.6, "above"],
      [vocalPresence, 0.5, "above"],
    ]);
    return { sectionType: "chorus", confidence: conf };
  }

  // Rule 5: Jam — high energy, strong beat, no vocals (Grateful Dead signature)
  if (energy > 0.20 && beatConfidence > 0.5 && vocalPresence < 0.3) {
    const conf = computeConfidence([
      [energy, 0.20, "above"],
      [beatConfidence, 0.5, "above"],
      [vocalPresence, 0.3, "below"],
    ]);
    return { sectionType: "jam", confidence: conf };
  }

  // Rule 6: Solo — melodic energy without strong rhythm or vocals
  if (energy > 0.15 && beatConfidence < 0.4 && vocalPresence < 0.3) {
    const conf = computeConfidence([
      [energy, 0.15, "above"],
      [beatConfidence, 0.4, "below"],
      [vocalPresence, 0.3, "below"],
    ]);
    return { sectionType: "solo", confidence: conf };
  }

  // Rule 7: Verse — vocals present, moderate energy
  if (vocalPresence > 0.5 && energy < 0.20) {
    const conf = computeConfidence([
      [vocalPresence, 0.5, "above"],
      [energy, 0.20, "below"],
    ]);
    return { sectionType: "verse", confidence: conf };
  }

  // Rule 8: Bridge — transitional mid-energy passage
  if (energy > 0.10 && energy < 0.25) {
    const conf = computeConfidence([
      [energy, 0.175, "near"], // peak confidence near midpoint of 0.10-0.25
    ]);
    return { sectionType: "bridge", confidence: conf };
  }

  // Default: jam (Grateful Dead's most common section type)
  return { sectionType: "jam", confidence: 0.3 };
}

// ─── Confidence Computation ───

type ThresholdDirection = "above" | "below" | "near";
type ThresholdEntry = [value: number, threshold: number, direction: ThresholdDirection];

/**
 * Compute confidence from how strongly features exceed their thresholds.
 * Each entry contributes a 0-1 sub-score:
 *   - "above": confidence grows as value exceeds threshold (capped at threshold+0.3)
 *   - "below": confidence grows as value falls below threshold (capped at threshold-0.3)
 *   - "near":  confidence peaks at threshold, decays as value moves away
 * Final confidence is the geometric mean of all sub-scores, clamped to [0.3, 0.95].
 */
function computeConfidence(entries: ThresholdEntry[]): number {
  if (entries.length === 0) return 0.5;

  let product = 1;
  for (const [value, threshold, direction] of entries) {
    let score: number;
    const RANGE = 0.3; // full-confidence range beyond threshold
    if (direction === "above") {
      const excess = Math.max(0, value - threshold);
      score = Math.min(1, excess / RANGE);
    } else if (direction === "below") {
      const deficit = Math.max(0, threshold - value);
      score = Math.min(1, deficit / RANGE);
    } else {
      // "near" — peak at threshold, decay over +-0.15
      const dist = Math.abs(value - threshold);
      score = Math.max(0, 1 - dist / 0.15);
    }
    // Floor each sub-score at 0.1 to avoid zeroing out the product
    product *= Math.max(0.1, score);
  }

  const geoMean = Math.pow(product, 1 / entries.length);
  return clamp(geoMean, 0.3, 0.95);
}

// ─── Hysteresis Engine ───

/**
 * Stateful section classifier with hysteresis to prevent oscillation.
 *
 * Holds the current classification for a minimum number of frames before
 * allowing a change. This prevents rapid flickering at section boundaries
 * where features hover near thresholds.
 *
 * Usage:
 *   const classifier = createHysteresisClassifier();
 *   for (let frame = 0; frame < totalFrames; frame++) {
 *     const result = classifier(energy, flatness, beatConfidence, vocalPresence, progress);
 *   }
 */
export interface HysteresisClassifier {
  (
    energy: number,
    flatness: number,
    beatConfidence: number,
    vocalPresence: number,
    songProgress: number,
  ): SectionClassification;

  /** Reset internal state (for testing or song boundaries) */
  reset(): void;
}

/**
 * Create a stateful classifier with hysteresis.
 *
 * @param holdFrames Minimum frames to hold a classification before allowing
 *                   change. Default 90 (~3s at 30fps). Higher values produce
 *                   more stable labels but may lag real transitions.
 */
export function createHysteresisClassifier(holdFrames = 90): HysteresisClassifier {
  let currentType: SectionType | null = null; // null = uninitialized
  let framesSinceChange = 0;
  let currentConfidence = 0.3;

  const classify = (
    energy: number,
    flatness: number,
    beatConfidence: number,
    vocalPresence: number,
    songProgress: number,
  ): SectionClassification => {
    const raw = classifySectionType(energy, flatness, beatConfidence, vocalPresence, songProgress);
    framesSinceChange++;

    if (currentType === null) {
      // First call: accept whatever the raw classifier says
      currentType = raw.sectionType;
      currentConfidence = raw.confidence;
      framesSinceChange = 0;
    } else if (framesSinceChange >= holdFrames && raw.sectionType !== currentType) {
      // Allow transition: held long enough and new classification differs
      currentType = raw.sectionType;
      currentConfidence = raw.confidence;
      framesSinceChange = 0;
    } else if (raw.sectionType === currentType) {
      // Same type — update confidence, don't reset counter
      currentConfidence = raw.confidence;
    }
    // Otherwise: hold current type (hysteresis)

    return { sectionType: currentType, confidence: currentConfidence };
  };

  classify.reset = () => {
    currentType = null;
    framesSinceChange = 0;
    currentConfidence = 0.3;
  };

  return classify;
}

// ─── Batch Classification ───

/**
 * Classify all frames in a song, applying hysteresis.
 * Convenience wrapper for offline batch processing.
 *
 * @param frames Array of per-frame features: [energy, flatness, beatConfidence, vocalPresence]
 * @param holdFrames Hysteresis hold duration (default 90)
 * @returns Array of SectionClassification, one per frame
 */
export function classifyAllFrames(
  frames: Array<{
    energy: number;
    flatness: number;
    beatConfidence: number;
    vocalPresence: number;
  }>,
  holdFrames = 90,
): SectionClassification[] {
  const classifier = createHysteresisClassifier(holdFrames);
  const totalFrames = frames.length;
  const results: SectionClassification[] = new Array(totalFrames);

  for (let i = 0; i < totalFrames; i++) {
    const progress = totalFrames > 1 ? i / (totalFrames - 1) : 0.5;
    const { energy, flatness, beatConfidence, vocalPresence } = frames[i];
    results[i] = classifier(energy, flatness, beatConfidence, vocalPresence, progress);
  }

  return results;
}

// ─── Helpers ───

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
