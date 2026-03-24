/**
 * Continuous Overlay Engine — per-frame overlay scoring with inertia.
 *
 * Replaces the pre-baked window scheduling (buildRotationSchedule + getOverlayOpacities)
 * with a per-frame continuous engine that scores all pool overlays against the live
 * AudioSnapshot, selects top-N with smooth transitions, and feeds the same
 * Record<string, number> to DynamicOverlayStack.
 *
 * Core algorithm: Two-pass scoring with inertia
 *   1. Score all pool overlays against current AudioSnapshot
 *   2. Score all against reference snapshot (30 frames back) for "previous selection"
 *   3. Overlays in both current and previous top-N get inertia bonus (+0.08)
 *   4. During coherence lock: boost inertia to +0.20, lookback to 120 frames
 *   5. Select top-N with hero guarantee + layer diversity (reuses selectOverlaysForWindow)
 *   6. Convert score → opacity via smoothstep threshold
 *   7. Apply post-processing: energy response, silence breathing, accent flashes,
 *      reactive injection, beat anticipation
 *
 * Deterministic: pure function of frames[0..frameIdx]. Same frameIdx → identical result.
 */

import type { OverlayEntry, EnhancedFrameData, OverlayPhaseHint } from "../data/types";
import type { SongIdentity } from "../data/song-identities";
import type { ShowArcModifiers } from "../data/show-arc";
import type { DrumsSpaceSubPhase } from "./drums-space-phase";
import { DRUMS_SPACE_TREATMENTS } from "./drums-space-phase";
import type { StemSectionType } from "./stem-features";
import type { ReactiveState } from "./reactive-triggers";
import type { AudioSnapshot } from "./audio-reactive";
import type { SemanticProfile } from "./semantic-router";
import { computeAudioSnapshot, buildBeatArray } from "./audio-reactive";
import { computeSmoothedEnergy } from "./energy";
import { detectTexture } from "./climax-state";
import { seededLCG as seededRandom } from "./seededRandom";
import { hashString } from "./hash";
import { OVERLAY_BY_NAME } from "../data/overlay-registry";
import { scoreOverlayForWindow, type ScoringContext } from "../data/overlay-scoring";
import { selectOverlaysForWindow } from "../data/overlay-selection";
import { BAND_CONFIG } from "../data/band-config";
import { ERA_PRESETS } from "../data/era-presets";
import { classifyStemSection } from "./stem-features";

// ─── Constants ───

/** Inertia bonus for overlays in both current and previous selection */
const INERTIA_BONUS = 0.08;
/** Elevated inertia during coherence lock */
const LOCKED_INERTIA_BONUS = 0.20;
/** Default lookback frames for reference snapshot */
const DEFAULT_LOOKBACK = 30;
/** Lookback frames during coherence lock */
const LOCKED_LOOKBACK = 120;
/** Smoothstep lower edge for score→opacity */
const OPACITY_EDGE_LOW = 0.35;
/** Smoothstep upper edge for score→opacity */
const OPACITY_EDGE_HIGH = 0.55;
/** Jitter epoch: frames between jitter seed changes (stabilizes scoring) */
const JITTER_EPOCH_FRAMES = 15;
/** Quiet threshold for silence breathing */
const QUIET_THRESHOLD = 0.03;
/** Quiet window for silence breathing (frames) */
const QUIET_WINDOW = 90;
/** Intro breathing room: no overlays in first N frames (20s — let the shader establish) */
const INTRO_BREATHING_FRAMES = 600;

/** Accent-eligible overlays from BandConfig */
const ACCENT_ELIGIBLE = new Set(BAND_CONFIG.accentEligibleOverlays);

/** Energy-dependent accent tuning */
const ACCENT_CONFIG: Record<string, { onsetThreshold: number; peakOpacity: number; decayFrames: number } | null> = {
  high: { onsetThreshold: 0.25, peakOpacity: 0.75, decayFrames: 20 },
  mid:  { onsetThreshold: 0.35, peakOpacity: 0.60, decayFrames: 15 },
  low:  { onsetThreshold: 0.45, peakOpacity: 0.40, decayFrames: 10 },
};

/** Energy count ranges — "Music Leads" philosophy: shader leads, overlays support */
const ENERGY_COUNTS: Record<string, { min: number; max: number }> = {
  low:  { min: 0, max: 1 },   // quiet: maybe one subtle layer — bears can breathe here
  mid:  { min: 1, max: 2 },   // moderate: one or two for texture depth
  high: { min: 1, max: 3 },   // peaks: overlays earn their moment
};

// ─── Types ───

export interface ContinuousOverlayConfig {
  pool: OverlayEntry[];
  alwaysActive: string[];
  trackId: string;
  showSeed: number;
  songIdentity?: SongIdentity;
  showArcModifiers?: ShowArcModifiers;
  energyHints?: Record<string, OverlayPhaseHint>;
  isDrumsSpace: boolean;
  drumsSpacePhase?: DrumsSpaceSubPhase;
  dominantStemSection?: StemSectionType;
  mode?: string;
  songHero?: string;
  songsCompleted?: number;
  setNumber: number;
  era?: string;
  semanticProfile?: SemanticProfile;
}

export interface ContinuousOverlayResult {
  opacities: Record<string, number>;
  alwaysActive: string[];
}

// ─── Helpers ───

/** Smoothstep: maps x from [edge0, edge1] → [0, 1] with cubic interpolation */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Classify energy into bucket */
function energyBucket(energy: number): "low" | "mid" | "high" {
  if (energy < 0.08) return "low";
  if (energy > 0.25) return "high";
  return "mid";
}

// ─── Core: Score an overlay against live audio ───

/**
 * Score an overlay against live AudioSnapshot.
 * Adapted from scoreOverlayForWindow but uses AudioSnapshot directly
 * for energy level and texture detection.
 */
export function scoreOverlayLive(
  entry: OverlayEntry,
  snapshot: AudioSnapshot,
  config: ContinuousOverlayConfig,
  rng: () => number,
): number {
  const energy = snapshot.energy;
  const smoothedEnergy = energy;
  const windowEnergy = energyBucket(smoothedEnergy);
  const windowTexture = detectTexture(snapshot, smoothedEnergy);

  // Build a ScoringContext compatible with the existing scorer
  const ctx: ScoringContext = {
    windowEnergy,
    windowTexture,
    isDropout: false,
    // Empty previous window — inertia handled externally
    previousWindowOverlays: new Set<string>(),
    previousWindowFrames: JITTER_EPOCH_FRAMES * 30, // >MIN_WINDOW_FOR_ROTATION to avoid carryover
    previousWindowEnergy: null,
    setNumber: config.setNumber,
    isDrumsSpace: config.isDrumsSpace,
    stemSectionType: config.dominantStemSection,
    mode: config.mode,
    songIdentity: config.songIdentity,
    showArcModifiers: config.showArcModifiers,
    energyHints: config.energyHints,
    semanticProfile: config.semanticProfile,
  };

  let score = scoreOverlayForWindow(entry, ctx, rng);

  // Audio affinity: weighted sum of snapshot features × affinity weights
  if (entry.audioAffinity) {
    let affinityScore = 0;
    for (const [field, weight] of Object.entries(entry.audioAffinity)) {
      if (weight === undefined) continue;
      const val = (snapshot as unknown as Record<string, number>)[field];
      if (typeof val === "number") {
        affinityScore += val * weight;
      }
    }
    // Clamp affinity contribution to ±0.3
    score += Math.max(-0.3, Math.min(0.3, affinityScore));
  }

  // Live stem section from current snapshot (not dominant)
  const liveStemSection = classifyStemSection(snapshot);
  if (liveStemSection === "vocal" && entry.category === "character") {
    score -= 0.10;
  } else if (liveStemSection === "solo" && entry.category === "reactive") {
    score -= 0.05;
  }

  return score;
}

// ─── Target count computation ───

/**
 * Compute target overlay count from live audio.
 * Same logic as buildRotationSchedule lines 253-306 but from live AudioSnapshot.
 */
export function computeTargetCount(
  snapshot: AudioSnapshot,
  config: ContinuousOverlayConfig,
): number {
  const eb = energyBucket(snapshot.energy);
  const range = ENERGY_COUNTS[eb] ?? ENERGY_COUNTS.mid;

  // Deterministic count within range
  const rng = seededRandom(hashString(config.trackId) + (config.showSeed ?? 0) + 42);
  let targetCount = range.min + Math.floor(rng() * (range.max - range.min + 1));

  // Texture-aware boost
  const texture = detectTexture(snapshot, snapshot.energy);
  if (texture === "peak") {
    targetCount += 1;
  }

  // Song identity density
  if (config.songIdentity?.overlayDensity) {
    targetCount = Math.round(targetCount * config.songIdentity.overlayDensity);
  }

  // Narrative arc modulation
  const arc = config.songIdentity?.narrativeArc;
  if (arc === "meditative_journey" || arc === "elegy") {
    targetCount = Math.max(0, targetCount - 1);
  } else if (arc === "celebration") {
    targetCount = targetCount + 1;
  }

  // Show arc density
  if (config.showArcModifiers?.densityMult) {
    targetCount = Math.round(targetCount * config.showArcModifiers.densityMult);
  }

  // Era density
  if (config.era) {
    const eraPreset = ERA_PRESETS[config.era];
    if (eraPreset?.overlayDensityMult) {
      targetCount = Math.round(targetCount * eraPreset.overlayDensityMult);
    }
  }

  // Drums/Space cap
  if (config.isDrumsSpace) {
    const dsMax = config.drumsSpacePhase
      ? DRUMS_SPACE_TREATMENTS[config.drumsSpacePhase]?.maxOverlays ?? 1
      : 1;
    targetCount = Math.min(targetCount, dsMax);
  }

  // Stem section modulation
  const stemSection = config.dominantStemSection;
  if (stemSection === "vocal") {
    targetCount = Math.max(0, targetCount - 1);
  } else if (stemSection === "solo") {
    targetCount = Math.min(targetCount, 1);
  } else if (stemSection === "quiet") {
    targetCount = Math.max(0, targetCount - 2);
  } else if (stemSection === "jam") {
    targetCount = Math.min(targetCount + 1, config.pool.length);
  }

  // Cap at pool size
  return Math.min(Math.max(0, targetCount), config.pool.length);
}

// ─── Post-processing ───

/** Apply accent flashes: beat-synced onset pulses */
function applyAccentFlashes(
  result: Record<string, number>,
  frames: EnhancedFrameData[],
  frameIdx: number,
  energyLevel: string,
): void {
  const config = ACCENT_CONFIG[energyLevel];
  if (!config) return;

  for (const name of Object.keys(result)) {
    if (!ACCENT_ELIGIBLE.has(name)) continue;
    let accentOpacity = 0;
    for (let f = frameIdx; f >= Math.max(0, frameIdx - config.decayFrames); f--) {
      if (f < frames.length && frames[f].onset > config.onsetThreshold) {
        const age = frameIdx - f;
        const t = Math.min(1, age / config.decayFrames);
        accentOpacity = config.peakOpacity * (1 - t * t * (3 - 2 * t));
        break;
      }
    }
    if (accentOpacity > 0) {
      result[name] = Math.max(result[name] ?? 0, accentOpacity);
    }
  }
}

/** Apply energy response curves: per-overlay modulation */
function applyEnergyResponse(
  result: Record<string, number>,
  frames: EnhancedFrameData[],
  frameIdx: number,
): void {
  const energy = computeSmoothedEnergy(frames, frameIdx);
  for (const name of Object.keys(result)) {
    const entry = OVERLAY_BY_NAME.get(name);
    if (!entry?.energyResponse) continue;
    const [threshold, peak, falloff] = entry.energyResponse;
    let response: number;
    if (energy <= threshold) {
      response = 0;
    } else if (energy <= peak) {
      const t = (energy - threshold) / (peak - threshold);
      response = t * t * (3 - 2 * t);
    } else {
      const overshoot = (energy - peak) * falloff;
      response = Math.max(0.3, 1 - overshoot);
    }
    const smoothedResponse = Math.sqrt(response);
    result[name] = (result[name] ?? 0) * (0.5 + smoothedResponse * 0.5);
  }
}

/** Apply silence breathing: progressive quiet withdrawal */
function applySilenceBreathing(
  result: Record<string, number>,
  frames: EnhancedFrameData[],
  frameIdx: number,
  alwaysActive: string[],
): void {
  let quietFrames = 0;
  for (let f = Math.max(0, frameIdx - QUIET_WINDOW); f <= frameIdx; f++) {
    if (frames[f].rms < QUIET_THRESHOLD) quietFrames++;
  }
  const quietRatio = quietFrames / QUIET_WINDOW;
  if (quietRatio > 0.3) {
    const t = Math.min(1, (quietRatio - 0.3) / 0.7);
    const eased = t * t * (3 - 2 * t);
    const withdrawMult = 1 - eased * 0.85; // near full suppression
    const alwaysSet = new Set(alwaysActive);
    for (const name of Object.keys(result)) {
      if (alwaysSet.has(name)) continue;
      result[name] = (result[name] ?? 0) * Math.max(0.1, withdrawMult);
    }
  }
}

/** Apply reactive trigger overlay injection */
function applyReactiveInjection(
  result: Record<string, number>,
  reactiveState: ReactiveState,
): void {
  if (!reactiveState.isTriggered || reactiveState.overlayInjections.length === 0) return;
  const FADE_IN = 10;
  const HOLD = 120;
  const FADE_OUT = 15;
  const age = reactiveState.triggerAge;
  let opacity: number;
  if (age < FADE_IN) {
    opacity = age / FADE_IN;
  } else if (age < FADE_IN + HOLD) {
    opacity = 1;
  } else if (age < FADE_IN + HOLD + FADE_OUT) {
    opacity = 1 - (age - FADE_IN - HOLD) / FADE_OUT;
  } else {
    opacity = 0;
  }
  opacity *= reactiveState.triggerStrength;
  for (const name of reactiveState.overlayInjections) {
    result[name] = Math.max(result[name] ?? 0, opacity);
  }
}

/** Apply beat anticipation builds */
function applyBeatAnticipation(
  result: Record<string, number>,
  frames: EnhancedFrameData[],
  frameIdx: number,
): void {
  if (frameIdx <= 8 || frameIdx >= frames.length - 1) return;
  const avg = (a: number, b: number, c: number) => (a + b + c) / 3;
  const e_early = avg(
    frames[Math.max(0, frameIdx - 5)]?.rms ?? 0,
    frames[Math.max(0, frameIdx - 4)]?.rms ?? 0,
    frames[Math.max(0, frameIdx - 3)]?.rms ?? 0,
  );
  const e_late = avg(
    frames[Math.max(0, frameIdx - 1)]?.rms ?? 0,
    frames[frameIdx]?.rms ?? 0,
    frames[Math.min(frames.length - 1, frameIdx + 1)]?.rms ?? 0,
  );
  const slope = e_late - e_early;
  if (slope > 0.06) {
    const rawBoost = Math.min(0.10, slope * 0.5);
    const t = Math.min(1, (slope - 0.06) / 0.12);
    const anticipationBoost = rawBoost * t * t * (3 - 2 * t);
    for (const name of Object.keys(result)) {
      result[name] = Math.min(1, (result[name] ?? 0) + anticipationBoost);
    }
  }
}

/** Apply peak anticipation: pre-boost overlay opacity when peakApproaching > 0.2 */
function applyPeakAnticipation(
  result: Record<string, number>,
  snapshot: AudioSnapshot,
): void {
  if (snapshot.peakApproaching <= 0.2) return;
  // Smoothstep ramp: 0 at 0.2, 0.15 at 1.0
  const t = Math.min(1, (snapshot.peakApproaching - 0.2) / 0.8);
  const boost = t * t * (3 - 2 * t) * 0.15;
  for (const name of Object.keys(result)) {
    result[name] = Math.min(1, (result[name] ?? 0) + boost);
  }
}

// ─── Main Engine ───

/**
 * Compute continuous overlay opacities for a single frame.
 * Replaces both buildRotationSchedule + getOverlayOpacities.
 *
 * Deterministic: pure function of config + frames[0..frameIdx] + audioSnapshot.
 */
export function computeContinuousOverlays(
  config: ContinuousOverlayConfig,
  frames: EnhancedFrameData[],
  frameIdx: number,
  audioSnapshot: AudioSnapshot,
  reactiveState?: ReactiveState,
): ContinuousOverlayResult {
  const result: Record<string, number> = {};

  // Always-active at 1.0
  for (const name of config.alwaysActive) {
    result[name] = 1;
  }

  // No rotation overlays during intro breathing room
  if (frameIdx < INTRO_BREATHING_FRAMES) {
    return { opacities: result, alwaysActive: config.alwaysActive };
  }

  if (config.pool.length === 0) {
    return { opacities: result, alwaysActive: config.alwaysActive };
  }

  const trackHash = hashString(config.trackId) + (config.showSeed ?? 0);
  const isLocked = audioSnapshot.isLocked ?? false;
  const lookback = isLocked ? LOCKED_LOOKBACK : DEFAULT_LOOKBACK;
  let inertiaBonus = isLocked ? LOCKED_INERTIA_BONUS : INERTIA_BONUS;

  // Narrative arc inertia modulation
  const narrativeArc = config.songIdentity?.narrativeArc;
  if (narrativeArc === "meditative_journey" || narrativeArc === "elegy") {
    inertiaBonus *= 1.5; // slower overlay turnover
  } else if (narrativeArc === "jam_vehicle" || narrativeArc === "energy_cycle") {
    inertiaBonus *= 0.7; // faster overlay turnover
  }

  // Jitter seed quantized to 15-frame epochs for stability
  const jitterEpoch = Math.floor(frameIdx / JITTER_EPOCH_FRAMES);
  const rng = seededRandom(trackHash + jitterEpoch * 7);

  // ─── Pass 1: Score all pool overlays against current AudioSnapshot ───
  const currentScores = config.pool.map((entry) => ({
    entry,
    score: scoreOverlayLive(entry, audioSnapshot, config, rng),
  }));

  // ─── Pass 2: Score against reference snapshot (lookback frames ago) ───
  const refIdx = Math.max(0, frameIdx - lookback);
  const beatArray = buildBeatArray(frames);
  const tempo = audioSnapshot.localTempo || 120;
  const refSnapshot = computeAudioSnapshot(frames, refIdx, beatArray, 30, tempo);
  const refRng = seededRandom(trackHash + Math.floor(refIdx / JITTER_EPOCH_FRAMES) * 7);

  const refScores = config.pool.map((entry) => ({
    entry,
    score: scoreOverlayLive(entry, refSnapshot, config, refRng),
  }));

  // ─── Determine reference selection (what was showing) ───
  const refTargetCount = computeTargetCount(refSnapshot, config);
  const refSorted = [...refScores].sort((a, b) => b.score - a.score);
  const refSelected = selectOverlaysForWindow(
    refSorted,
    refTargetCount,
    config.isDrumsSpace,
    false,
    config.pool,
    config.songHero,
    energyBucket(refSnapshot.energy),
  );
  const refSelectedNames = new Set(refSelected.map((e) => e.name));

  // ─── Apply inertia bonus to current scores ───
  const currentTargetCount = computeTargetCount(audioSnapshot, config);
  for (const cs of currentScores) {
    if (refSelectedNames.has(cs.entry.name)) {
      cs.score += inertiaBonus;
    }
  }

  // ─── Select top-N with hero guarantee + diversity ───
  const currentSorted = [...currentScores].sort((a, b) => b.score - a.score);
  const selected = selectOverlaysForWindow(
    currentSorted,
    currentTargetCount,
    config.isDrumsSpace,
    false,
    config.pool,
    config.songHero,
    energyBucket(audioSnapshot.energy),
  );

  // ─── Convert score → opacity via smoothstep ───
  // Build a score map for selected overlays
  const scoreMap = new Map<string, number>();
  for (const cs of currentScores) {
    scoreMap.set(cs.entry.name, cs.score);
  }

  for (const entry of selected) {
    const score = scoreMap.get(entry.name) ?? 0;
    const opacity = smoothstep(OPACITY_EDGE_LOW, OPACITY_EDGE_HIGH, score);
    result[entry.name] = opacity;
  }

  // ─── Post-processing (same pipeline as getOverlayOpacities) ───

  // Accent flashes
  const el = energyBucket(audioSnapshot.energy);
  applyAccentFlashes(result, frames, frameIdx, el);

  // Energy response curves
  applyEnergyResponse(result, frames, frameIdx);

  // Silence breathing
  applySilenceBreathing(result, frames, frameIdx, config.alwaysActive);

  // Reactive trigger injection
  if (reactiveState) {
    applyReactiveInjection(result, reactiveState);
  }

  // Beat anticipation
  applyBeatAnticipation(result, frames, frameIdx);

  // Peak anticipation: pre-boost overlays when peakApproaching is significant
  applyPeakAnticipation(result, audioSnapshot);

  return { opacities: result, alwaysActive: config.alwaysActive };
}
