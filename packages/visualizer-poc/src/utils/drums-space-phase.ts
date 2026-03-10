/**
 * Drums→Space Phase Detection.
 *
 * Detects the characteristic Drums→Space arc within a single song:
 *   drums_tribal → transition → space_ambient → reemergence
 *
 * Uses audio features (onset density, energy, flatness) already available
 * from computeAudioSnapshot() to classify the current sub-phase.
 */

import type { AudioSnapshot } from "./audio-reactive";

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

// Phase detection thresholds
const TRIBAL_ONSET_MIN = 0.4;
const TRIBAL_ENERGY_MIN = 0.15;
const TRIBAL_FLATNESS_MAX = 0.3;

const SPACE_ONSET_MAX = 0.15;
const SPACE_FLATNESS_MIN = 0.4;
const SPACE_ENERGY_MAX = 0.10;

const TRANSITION_ONSET_MAX = 0.3;

// Smoothing: track recent phase history for stability
let phaseHistory: DrumsSpaceSubPhase[] = [];
const HISTORY_LEN = 30;

/** Reset phase tracking between songs */
export function resetDrumsSpacePhase(): void {
  phaseHistory = [];
}

/**
 * Detect current Drums/Space sub-phase from audio snapshot.
 * Returns null if the song is not a Drums/Space segment.
 *
 * @param snapshot - Current frame's audio snapshot
 * @param isDrumsSpace - Whether this song is identified as Drums/Space
 */
export function computeDrumsSpacePhase(
  snapshot: AudioSnapshot,
  isDrumsSpace: boolean,
): DrumsSpaceState | null {
  if (!isDrumsSpace) return null;

  const onset = snapshot.onsetEnvelope;
  const energy = snapshot.energy;
  const flatness = snapshot.flatness;

  // Classify raw phase
  let rawPhase: DrumsSpaceSubPhase;

  if (onset > TRIBAL_ONSET_MIN && energy > TRIBAL_ENERGY_MIN && flatness < TRIBAL_FLATNESS_MAX) {
    rawPhase = "drums_tribal";
  } else if (onset < SPACE_ONSET_MAX && flatness > SPACE_FLATNESS_MIN && energy < SPACE_ENERGY_MAX) {
    rawPhase = "space_ambient";
  } else if (onset < TRANSITION_ONSET_MAX && energy < TRIBAL_ENERGY_MIN) {
    // Onset dropping but not yet full space
    rawPhase = "transition";
  } else if (onset > 0.2 && phaseHistory.length > 0 && recentPhaseIs("space_ambient")) {
    // Onset rising from space — band re-entering
    rawPhase = "reemergence";
  } else if (onset > TRIBAL_ONSET_MIN * 0.7) {
    rawPhase = "drums_tribal";
  } else {
    rawPhase = "transition";
  }

  // Push to history for smoothing
  phaseHistory.push(rawPhase);
  if (phaseHistory.length > HISTORY_LEN) {
    phaseHistory.shift();
  }

  // Use majority vote from recent history for stability
  const stablePhase = majorityPhase(phaseHistory);

  // Compute phase progress based on how deep we are into the current phase
  const phaseCount = countConsecutive(phaseHistory, stablePhase);
  const phaseProgress = Math.min(1, phaseCount / HISTORY_LEN);

  return {
    subPhase: stablePhase,
    phaseProgress,
  };
}

/** Check if recent history has been predominantly a given phase */
function recentPhaseIs(phase: DrumsSpaceSubPhase): boolean {
  if (phaseHistory.length < 5) return false;
  const recent = phaseHistory.slice(-15);
  const count = recent.filter((p) => p === phase).length;
  return count > recent.length * 0.4;
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
