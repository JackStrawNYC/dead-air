/**
 * Drums->Space Phase Detection.
 *
 * Detects the characteristic Drums->Space arc within a single song:
 *   drums_tribal -> transition -> space_ambient/space_textural/space_melodic -> reemergence
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
  | "space_ambient"   // full Space -- minimal percussion, maximum atmosphere
  | "space_textural"  // percussive Space effects (onset + flatness)
  | "space_melodic"   // guitar/keys returning in Space (tonal, low energy)
  | "reemergence";    // band gradually re-entering

export interface DrumsSpaceState {
  /** Current sub-phase */
  subPhase: DrumsSpaceSubPhase;
  /** Progress within current sub-phase (0-1) */
  phaseProgress: number;
  /** Reemergence progress (0-1): time spent in reemergence, for progressive brightening */
  reemergenceProgress: number;
}

// --- Per-Phase Visual Treatment Constants ---

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

const NEUTRAL_TREATMENT: DrumsSpaceVisualTreatment = {
  contrastOffset: 0,
  saturationOffset: 0,
  brightnessOffset: 0,
  hueShift: 0,
  maxOverlays: 3,
  allowedOverlayCategories: ["atmospheric", "sacred", "reactive", "character"],
};

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
  space_textural: {
    contrastOffset: 0,
    saturationOffset: -0.15,   // slightly brighter than space_ambient
    brightnessOffset: -0.10,
    hueShift: 18,              // blue shift
    maxOverlays: 1,
    allowedOverlayCategories: ["reactive"],
  },
  space_melodic: {
    contrastOffset: 0,
    saturationOffset: -0.08,   // warmer than ambient
    brightnessOffset: -0.05,
    hueShift: 8,               // warm shift (guitar/keys returning)
    maxOverlays: 1,
    allowedOverlayCategories: ["sacred"],
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

/**
 * Get interpolated visual treatment based on phase progress.
 * Early in a phase (progress < 0.3): blend 70% neutral + 30% phase treatment.
 * Late in a phase (progress >= 0.7): full phase treatment.
 * In between: linear interpolation.
 *
 * Reemergence has enhanced treatment: brightness ramps from -0.10 to +0.10
 * and maxOverlays ramps from 1 to 3 over reemergenceProgress.
 */
export function getDrumsSpaceTreatment(state: DrumsSpaceState): DrumsSpaceVisualTreatment {
  const phaseTreatment = DRUMS_SPACE_TREATMENTS[state.subPhase];
  const progress = state.phaseProgress;

  // Compute blend factor: 0-0.3 maps to 0.3, 0.3-0.7 interpolates, 0.7+ maps to 1.0
  let blendFactor: number;
  if (progress < 0.3) {
    blendFactor = 0.3;
  } else if (progress >= 0.7) {
    blendFactor = 1.0;
  } else {
    blendFactor = 0.3 + (progress - 0.3) / 0.4 * 0.7;
  }

  const lerp = (neutral: number, phase: number) => neutral + (phase - neutral) * blendFactor;

  const treatment: DrumsSpaceVisualTreatment = {
    contrastOffset: lerp(NEUTRAL_TREATMENT.contrastOffset, phaseTreatment.contrastOffset),
    saturationOffset: lerp(NEUTRAL_TREATMENT.saturationOffset, phaseTreatment.saturationOffset),
    brightnessOffset: lerp(NEUTRAL_TREATMENT.brightnessOffset, phaseTreatment.brightnessOffset),
    hueShift: lerp(NEUTRAL_TREATMENT.hueShift, phaseTreatment.hueShift),
    maxOverlays: Math.round(lerp(NEUTRAL_TREATMENT.maxOverlays, phaseTreatment.maxOverlays)),
    allowedOverlayCategories: blendFactor > 0.5 ? phaseTreatment.allowedOverlayCategories : NEUTRAL_TREATMENT.allowedOverlayCategories,
  };

  // Reemergence enhancement: progressive brightening + overlay ramp
  if (state.subPhase === "reemergence" && state.reemergenceProgress > 0) {
    const rp = state.reemergenceProgress;
    // Brightness ramps from -0.10 to +0.10 over reemergence
    treatment.brightnessOffset = -0.10 + 0.20 * rp;
    // maxOverlays ramps from 1 to 3
    treatment.maxOverlays = Math.round(1 + 2 * rp);
  }

  // ─── SPACE_AMBIENT TRANSCENDENT APEX (audit Tier 1 #5) ───
  // The audit identified the deepest Space passage as suppressed (-0.15
  // brightness, -0.20 saturation) when it should feel transcendent — the
  // "still point" of the show. After 70% of the way into space_ambient
  // (the band has held the void for several seconds), gently LIFT both
  // brightness and saturation so the moment glows like a "transcendent
  // void" instead of crushing to near-black.
  //
  // Curve over phaseProgress 0.7 → 1.0:
  //   brightness: -0.15 → +0.05 (gold-warm lift, ~+20% across the apex)
  //   saturation: -0.20 → -0.05 (colors return to near-neutral)
  //   maxOverlays: 0 → 1 (one iconic atmospheric overlay surfaces)
  //   hueShift:   +20° → +35° (warmer toward the apex peak)
  if (state.subPhase === "space_ambient" && progress > 0.7) {
    const apex = (progress - 0.7) / 0.3; // 0..1 across the apex window
    const apexLift = apex * apex * (3 - 2 * apex); // smoothstep
    treatment.brightnessOffset = -0.15 + 0.20 * apexLift;
    treatment.saturationOffset = -0.20 + 0.15 * apexLift;
    treatment.hueShift = 20 + 15 * apexLift;
    treatment.maxOverlays = apex > 0.5 ? 1 : 0;
  }

  return treatment;
}

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
const REEMERGENCE_RAMP_FRAMES = 150; // 5 seconds to full reemergence

// --- Stateless helpers ---

/**
 * Classify a single frame's raw phase based on audio features.
 * Pure function -- no state dependencies.
 */
export function classifyRawPhase(
  onset: number,
  energy: number,
  flatness: number,
  drumBeat: number,
  recentlySpace: boolean,
  coherence: number,
  centroid?: number,
): DrumsSpaceSubPhase {
  if (
    onset > TRIBAL_ONSET_MIN &&
    energy > TRIBAL_ENERGY_MIN &&
    flatness < TRIBAL_FLATNESS_MAX &&
    drumBeat > TRIBAL_BEAT_REGULARITY_MIN * 0.5
  ) {
    return "drums_tribal";
  }

  // Space sub-types: textural vs melodic vs pure ambient
  if (
    onset < SPACE_ONSET_MAX &&
    energy < SPACE_ENERGY_MAX &&
    drumBeat < SPACE_BEAT_REGULARITY_MAX
  ) {
    // Space textural: percussive effects in Space
    if (onset > 0.08 && flatness > 0.3) {
      return "space_textural";
    }
    // Space melodic: tonal content returning (guitar/keys)
    if (flatness < 0.3 && energy < 0.15 && (centroid ?? 0) > 0.35) {
      return "space_melodic";
    }
    // Pure ambient Space
    if (flatness > SPACE_FLATNESS_MIN) {
      return "space_ambient";
    }
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

// --- Main computation ---

/**
 * Detect current Drums/Space sub-phase from frame data.
 * Returns null if the song is not a Drums/Space segment.
 *
 * Pure function -- scans backward 30 frames, classifies each,
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
    const centroid = f.centroid;

    // Check if recent classifications include any space sub-type
    const recentSlice = classified.slice(-15);
    const spacePhases: DrumsSpaceSubPhase[] = ["space_ambient", "space_textural", "space_melodic"];
    const recentlySpace = classified.length >= 5 &&
      recentSlice.filter(p => spacePhases.includes(p)).length > recentSlice.length * 0.4;

    // Use coherence raw score as proxy for chroma stability
    const coherence = computeRawScore(frames, i);

    const phase = classifyRawPhase(onset, energy, flatness, drumBeat, recentlySpace, coherence, centroid);
    classified.push(phase);
  }

  // Majority vote for stability
  const stablePhase = majorityPhase(classified);
  const phaseCount = countConsecutive(classified, stablePhase);
  const phaseProgress = Math.min(1, phaseCount / HISTORY_LEN);

  // Compute reemergence progress: scan backward for consecutive reemergence frames
  let reemergenceProgress = 0;
  if (stablePhase === "reemergence") {
    let reemergenceFrames = 0;
    for (let i = safeIdx; i >= 0; i--) {
      // Re-classify each frame to check for reemergence
      const f = frames[i];
      const onset = f.onset;
      const energy = f.rms;
      const flatness = f.flatness;
      // If energy/onset suggest we're no longer in reemergence territory, stop
      if (onset < 0.05 && flatness > SPACE_FLATNESS_MIN && energy < SPACE_ENERGY_MAX) break;
      if (onset > TRIBAL_ONSET_MIN && energy > TRIBAL_ENERGY_MIN) break;
      reemergenceFrames++;
      if (reemergenceFrames >= REEMERGENCE_RAMP_FRAMES) break;
    }
    reemergenceProgress = Math.min(1, reemergenceFrames / REEMERGENCE_RAMP_FRAMES);
  }

  return {
    subPhase: stablePhase,
    phaseProgress,
    reemergenceProgress,
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
