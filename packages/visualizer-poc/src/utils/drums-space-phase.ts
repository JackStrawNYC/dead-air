/**
 * Drums→Space Phase Detection.
 *
 * Detects the characteristic Drums→Space arc within a single song:
 *   drums_tribal → transition → space_ambient → reemergence
 *
 * Uses audio features (onset density, energy, flatness) and coherence signals
 * to classify the current sub-phase.
 *
 * DETERMINISTIC: pure function of frame data (no module-level state).
 * Scans backward 30 frames and classifies each, using majority vote
 * for temporal stability. Safe for Remotion's out-of-order rendering.
 *
 * Per-phase visual treatment constants provide color/overlay guidance
 * to EnergyEnvelope, overlay-rotation, and CameraMotion.
 */

import type { EnhancedFrameData } from "../data/types";
import { computeRawScore } from "./coherence";

export type DrumsSpaceSubPhase =
  | "drums_tribal"    // heavy percussion, rhythmic
  | "transition"      // percussion thinning, space emerging
  | "space_ambient"   // full Space — minimal percussion, maximum atmosphere
  | "reemergence";    // band gradually re-entering

export interface DrumsSpaceState {
  /** Current sub-phase */
  subPhase: DrumsSpaceSubPhase;
  /** Progress within current sub-phase (0-1) */
  phaseProgress: number;
}

// ─── Per-Phase Visual Treatment Constants ───

export interface DrumsSpaceVisualTreatment {
  /** Additive contrast offset */
  contrastOffset: number;
  /** Additive saturation offset */
  saturationOffset: number;
  /** Additive brightness offset */
  brightnessOffset: number;
  /** Additive hue shift (degrees) */
  hueShift: number;
  /** Maximum overlay count allowed */
  maxOverlays: number;
  /** Overlay categories allowed (empty = none) */
  allowedOverlayCategories: string[];
}

export const DRUMS_SPACE_TREATMENTS: Record<DrumsSpaceSubPhase, DrumsSpaceVisualTreatment> = {
  drums_tribal: {
    contrastOffset: 0.10,
    saturationOffset: 0,
    brightnessOffset: 0,
    hueShift: 10,              // warmth
    maxOverlays: 1,
    allowedOverlayCategories: ["sacred"],
  },
  transition: {
    contrastOffset: 0,
    saturationOffset: -0.10,   // progressive desaturation
    brightnessOffset: -0.05,
    hueShift: 5,
    maxOverlays: 0,
    allowedOverlayCategories: [],
  },
  space_ambient: {
    contrastOffset: 0,
    saturationOffset: -0.20,   // deep desaturation
    brightnessOffset: -0.15,   // darkness
    hueShift: 20,              // blue shift
    maxOverlays: 0,
    allowedOverlayCategories: [],
  },
  reemergence: {
    contrastOffset: 0.05,
    saturationOffset: -0.05,   // progressive re-saturation
    brightnessOffset: 0,
    hueShift: 5,
    maxOverlays: 1,
    allowedOverlayCategories: ["atmospheric", "sacred"],
  },
};

// Phase detection thresholds
const TRIBAL_ONSET_MIN = 0.4;
const TRIBAL_ENERGY_MIN = 0.15;
const TRIBAL_FLATNESS_MAX = 0.3;

const SPACE_ONSET_MAX = 0.15;
const SPACE_FLATNESS_MIN = 0.4;
const SPACE_ENERGY_MAX = 0.10;

const TRANSITION_ONSET_MAX = 0.3;

// Coherence-enhanced thresholds
const TRIBAL_BEAT_REGULARITY_MIN = 0.5;
const SPACE_BEAT_REGULARITY_MAX = 0.2;
const REEMERGENCE_CHROMA_STABILITY_MIN = 0.5;
const REEMERGENCE_FLATNESS_MAX = 0.35;

const HISTORY_LEN = 30;

// ─── Stateless helpers ───

/**
 * Classify a single frame's raw phase based on audio features.
 * Pure function — no state dependencies.
 */
export function classifyRawPhase(
  onset: number,
  energy: number,
  flatness: number,
  drumBeat: number,
  recentlySpace: boolean,
  coherence: number,
): DrumsSpaceSubPhase {
  if (
    onset > TRIBAL_ONSET_MIN &&
    energy > TRIBAL_ENERGY_MIN &&
    flatness < TRIBAL_FLATNESS_MAX &&
    drumBeat > TRIBAL_BEAT_REGULARITY_MIN * 0.5
  ) {
    return "drums_tribal";
  }

  if (
    onset < SPACE_ONSET_MAX &&
    flatness > SPACE_FLATNESS_MIN &&
    energy < SPACE_ENERGY_MAX &&
    drumBeat < SPACE_BEAT_REGULARITY_MAX
  ) {
    return "space_ambient";
  }

  if (
    recentlySpace &&
    coherence > REEMERGENCE_CHROMA_STABILITY_MIN &&
    flatness < REEMERGENCE_FLATNESS_MAX
  ) {
    return "reemergence";
  }

  if (onset > 0.2 && recentlySpace) {
    return "reemergence";
  }

  if (onset < TRANSITION_ONSET_MAX && energy < TRIBAL_ENERGY_MIN) {
    return "transition";
  }

  if (onset > TRIBAL_ONSET_MIN * 0.7) {
    return "drums_tribal";
  }

  return "transition";
}

// ─── Main computation ───

/**
 * Detect current Drums/Space sub-phase from frame data.
 * Returns null if the song is not a Drums/Space segment.
 *
 * Pure function — scans backward 30 frames, classifies each,
 * and uses majority vote for temporal stability.
 *
 * @param frames Full frame array
 * @param frameIdx Current frame index
 * @param isDrumsSpace Whether this song is identified as Drums/Space
 */
export function computeDrumsSpacePhase(
  frames: EnhancedFrameData[],
  frameIdx: number,
  isDrumsSpace: boolean,
): DrumsSpaceState | null {
  if (!isDrumsSpace) return null;
  if (frames.length === 0) return null;

  const safeIdx = Math.min(Math.max(0, frameIdx), frames.length - 1);
  const lo = Math.max(0, safeIdx - HISTORY_LEN + 1);

  // Classify each frame in the window
  const classified: DrumsSpaceSubPhase[] = [];
  for (let i = lo; i <= safeIdx; i++) {
    const f = frames[i];
    const onset = f.onset;
    const energy = f.rms;
    const flatness = f.flatness;
    const drumBeat = (f.stemDrumBeat ? 1 : 0) || (f.beat ? 0.5 : 0);

    // Check if recent classifications include space_ambient
    const recentSlice = classified.slice(-15);
    const recentlySpace = classified.length >= 5 &&
      recentSlice.filter(p => p === "space_ambient").length > recentSlice.length * 0.4;

    // Use coherence raw score as proxy for chroma stability
    const coherence = computeRawScore(frames, i);

    const phase = classifyRawPhase(onset, energy, flatness, drumBeat, recentlySpace, coherence);
    classified.push(phase);
  }

  // Majority vote for stability
  const stablePhase = majorityPhase(classified);
  const phaseCount = countConsecutive(classified, stablePhase);
  const phaseProgress = Math.min(1, phaseCount / HISTORY_LEN);

  return {
    subPhase: stablePhase,
    phaseProgress,
  };
}

/** Find the most common phase in history */
function majorityPhase(history: DrumsSpaceSubPhase[]): DrumsSpaceSubPhase {
  const counts: Record<string, number> = {};
  for (const p of history) {
    counts[p] = (counts[p] ?? 0) + 1;
  }
  let best: DrumsSpaceSubPhase = history[history.length - 1] ?? "transition";
  let bestCount = 0;
  for (const [phase, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count;
      best = phase as DrumsSpaceSubPhase;
    }
  }
  return best;
}

/** Count consecutive frames of the same phase from the end */
function countConsecutive(history: DrumsSpaceSubPhase[], phase: DrumsSpaceSubPhase): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] === phase) count++;
    else break;
  }
  return count;
}
