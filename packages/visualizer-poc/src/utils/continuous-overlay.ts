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
import { computeSemanticProfile, extractSemanticScores } from "./semantic-router";
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
/** Jitter epoch: frames between jitter seed changes (stabilizes scoring).
 *  Used as a fallback when beat data is sparse — the primary epoch is BEAT-aligned. */
const JITTER_EPOCH_FRAMES = 15;
/** Beats per jitter epoch — score re-randomizes once every N beats so selection
 *  changes land on musical phrases instead of an arbitrary clock. 4 beats ≈ one
 *  bar in 4/4 time → overlays settle for the duration of a phrase. */
const JITTER_EPOCH_BEATS = 4;

/** Onset strength above which a frame is a "snap" event (forces rotation) */
const SNAP_ONSET_THRESHOLD = 0.60;
/** Drum onset strength above which a frame is a snap event */
const SNAP_DRUM_THRESHOLD = 0.55;
/** Minimum frames between consecutive snaps — prevents per-beat thrash */
const SNAP_MIN_GAP = 60; // 2 seconds at 30fps
/** Energy floor — no snaps fire below this RMS (silence/intro) */
const SNAP_ENERGY_FLOOR = 0.06;
/** Vocal-presence lookback for "vocal entry" detection */
const VOCAL_ENTRY_LOOKBACK = 30;
/** Max recent vocal frames in the lookback for it to count as a fresh entry */
const VOCAL_ENTRY_MAX_RECENT = 5;

/**
 * Build a list of frame indices where a "snap" event occurred. A snap is a
 * strong musical moment that should trigger immediate overlay re-selection
 * instead of waiting for the next 4-beat phrase epoch:
 *
 *   - Strong transient (frame.onset > 0.60)
 *   - Strong drum hit (frame.stemDrumOnset > 0.55, when stem data available)
 *   - Vocal entry (vocalPresence transitions from absent to present)
 *
 * Snaps are deduped by SNAP_MIN_GAP (2s) so consecutive drum hits don't
 * fire repeatedly — overlays still get to "land" between snaps. The first
 * snap in a long quiet passage will fire; subsequent ones inside the gap
 * window are ignored until 2s passes.
 *
 * Forward-pass O(n × VOCAL_ENTRY_LOOKBACK), called once per render frame.
 */
function buildSnapFrameArray(frames: EnhancedFrameData[]): number[] {
  const snaps: number[] = [];
  let lastSnap = -SNAP_MIN_GAP;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if ((f.rms ?? 0) < SNAP_ENERGY_FLOOR) continue;
    if (i - lastSnap < SNAP_MIN_GAP) continue;

    const onsetSnap = (f.onset ?? 0) > SNAP_ONSET_THRESHOLD;
    const drumSnap = (f.stemDrumOnset ?? 0) > SNAP_DRUM_THRESHOLD;

    // Vocal entry: this frame has vocal presence and the recent lookback has
    // very few. Catches the "voice enters after instrumental passage" moment.
    let vocalEntry = false;
    if (f.stemVocalPresence && i > VOCAL_ENTRY_LOOKBACK) {
      let recentVocals = 0;
      for (let j = i - VOCAL_ENTRY_LOOKBACK; j < i; j++) {
        if (frames[j].stemVocalPresence) recentVocals++;
      }
      if (recentVocals < VOCAL_ENTRY_MAX_RECENT) vocalEntry = true;
    }

    if (onsetSnap || drumSnap || vocalEntry) {
      snaps.push(i);
      lastSnap = i;
    }
  }
  return snaps;
}

/** Binary-search count of snap frames with index <= idx. */
function snapCountUpTo(snapArray: number[], idx: number): number {
  let lo = 0, hi = snapArray.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (snapArray[mid] <= idx) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ─── Auto-derived audio affinity ───
//
// 0 of 122 overlays declare an explicit audioAffinity field but the scoring
// at scoreOverlayLive consumes it as a per-overlay weighted dictionary
// mapping AudioSnapshot fields to score boosts. Auto-deriving sensible
// affinities from each overlay's existing metadata (category + tags +
// energyBand) gives all 122 overlays a per-frame audio fingerprint with
// zero per-overlay manual curation.
//
// The total contribution is clamped to ±0.3 in the scorer, so individual
// weights here can be slightly aggressive — the clamp protects against
// runaway scoring.

/** Per-category base audio affinity. */
const CATEGORY_AFFINITY: Record<string, Record<string, number>> = {
  atmospheric: { slowEnergy: 0.50, semanticAmbient: 0.40, semanticCosmic: 0.20 },
  nature:      { slowEnergy: 0.45, semanticTender: 0.30, semanticAmbient: 0.25 },
  sacred:      { slowEnergy: 0.40, semanticPsychedelic: 0.35, semanticCosmic: 0.30 },
  reactive:    { onsetEnvelope: 0.50, drumOnset: 0.45, fastEnergy: 0.40, energy: 0.20 },
  geometric:   { beatStability: 0.40, harmonicTension: 0.30, semanticRhythmic: 0.30 },
  distortion:  { spectralFlux: 0.50, semanticChaotic: 0.45, onsetEnvelope: 0.35 },
  character:   { vocalPresence: 0.40, otherEnergy: 0.35, energy: 0.20 },
  artifact:    { energy: 0.25, semanticTriumphant: 0.20 },
  hud:         {}, // text/HUD overlays — no audio coupling
  info:        {},
};

/** Per-tag audio affinity contributions (additive on top of category). */
const TAG_AFFINITY: Record<string, Record<string, number>> = {
  cosmic:        { semanticCosmic: 0.40, slowEnergy: 0.20 },
  psychedelic:   { semanticPsychedelic: 0.40, harmonicTension: 0.25 },
  intense:       { energy: 0.45, fastEnergy: 0.30, drumOnset: 0.25 },
  contemplative: { slowEnergy: 0.40, semanticTender: 0.30, vocalPresence: -0.20 },
  festival:      { semanticTriumphant: 0.40, semanticRhythmic: 0.30, energy: 0.25 },
  organic:       { slowEnergy: 0.30, semanticAmbient: 0.25 },
  mechanical:    { semanticRhythmic: 0.35, beatStability: 0.30 },
  aquatic:       { slowEnergy: 0.30, semanticAmbient: 0.25 },
  // Visual-style only — no audio coupling:
  retro:         {},
  "dead-culture":{},
};

/** Energy-band audio affinity contribution. */
const ENERGY_BAND_AFFINITY: Record<string, Record<string, number>> = {
  low:  { slowEnergy: 0.20 },
  mid:  {},
  high: { fastEnergy: 0.20, drumOnset: 0.15 },
  any:  {},
};

/** Cache: overlay name → derived affinity. Filled lazily on first lookup. */
const DERIVED_AFFINITY_CACHE = new Map<string, Record<string, number>>();

/** Cache: frames array → snap frame array. Avoids recomputing the O(n × lookback)
 *  scan on every frame — the snap array is immutable for a given frames array. */
const SNAP_ARRAY_CACHE = new WeakMap<EnhancedFrameData[], number[]>();

/** Cache: frames array → beat array. Same rationale as snap cache. */
const BEAT_ARRAY_CACHE = new WeakMap<EnhancedFrameData[], number[]>();

// ─── AudioSnapshot ring buffer ───
// Caches recent AudioSnapshots so the reference-frame lookup (30-120 frames back)
// hits the cache instead of recomputing 30+ gaussianSmooth passes with Math.exp().
// Ring buffer holds the last SNAPSHOT_RING_SIZE snapshots keyed by frameIdx.
const SNAPSHOT_RING_SIZE = 150; // covers the max LOCKED_LOOKBACK of 120 frames
const snapshotRingBuffer: { frameIdx: number; snapshot: AudioSnapshot }[] = [];
let snapshotRingHead = 0;
let snapshotRingFramesRef: WeakRef<EnhancedFrameData[]> | null = null; // reset ring when frames array changes

function getCachedSnapshot(frameIdx: number): AudioSnapshot | undefined {
  for (let i = 0; i < Math.min(snapshotRingBuffer.length, SNAPSHOT_RING_SIZE); i++) {
    const entry = snapshotRingBuffer[i];
    if (entry && entry.frameIdx === frameIdx) return entry.snapshot;
  }
  return undefined;
}

function putSnapshotInRing(frameIdx: number, snapshot: AudioSnapshot): void {
  if (snapshotRingBuffer.length < SNAPSHOT_RING_SIZE) {
    snapshotRingBuffer.push({ frameIdx, snapshot });
  } else {
    snapshotRingBuffer[snapshotRingHead] = { frameIdx, snapshot };
    snapshotRingHead = (snapshotRingHead + 1) % SNAPSHOT_RING_SIZE;
  }
}

// ─── Epoch-level score cache ───
// When the jitter epoch AND frameIdx haven't changed, overlay scores are identical
// (deterministic RNG seeded on epoch, same audioSnapshot). Cache both scoring
// passes and the reference selection to skip ~174 scoreOverlayLive calls on
// consecutive identical-epoch frames (e.g., re-renders, tests).
let cachedEpoch = -1;
let cachedEpochTrackHash = 0;
let cachedEpochFrameIdx = -1;
let cachedCurrentScores: { entry: OverlayEntry; score: number }[] = [];
let cachedRefSelectedNames: Set<string> = new Set();
let cachedRefTargetCount = 0;

// ─── Temporal opacity smoothing state ───
// Track previous frame's opacities to blend toward, preventing single-frame jumps.
let prevOverlayOpacities: Record<string, number> | null = null;
let prevOverlayFrameIdx = -1;
let prevOverlayFramesRef: WeakRef<EnhancedFrameData[]> | null = null;

/**
 * Compute the audio affinity dictionary for an overlay from its metadata.
 * Sums category base + half-weight tag contributions + energy band.
 * Tags contribute at 0.5x the table value because most overlays have 2-3
 * tags and we want the total to land in a sensible range, not dominate.
 */
function deriveAudioAffinity(entry: OverlayEntry): Record<string, number> {
  const result: Record<string, number> = {};

  // Category base
  const cat = CATEGORY_AFFINITY[entry.category] ?? {};
  for (const [k, v] of Object.entries(cat)) {
    result[k] = (result[k] ?? 0) + v;
  }

  // Per-tag contributions (half weight to avoid double-counting with category)
  for (const tag of entry.tags ?? []) {
    const tagWeights = TAG_AFFINITY[tag] ?? {};
    for (const [k, v] of Object.entries(tagWeights)) {
      result[k] = (result[k] ?? 0) + v * 0.5;
    }
  }

  // Energy band
  const band = ENERGY_BAND_AFFINITY[entry.energyBand] ?? {};
  for (const [k, v] of Object.entries(band)) {
    result[k] = (result[k] ?? 0) + v;
  }

  return result;
}

/**
 * Get the effective audio affinity for an overlay: explicit declaration if
 * present (overlays can opt-out of auto-derivation by declaring their own),
 * else the auto-derived one from category/tags/energyBand. Cached per name.
 */
function getEffectiveAudioAffinity(entry: OverlayEntry): Record<string, number> {
  if (entry.audioAffinity) {
    return entry.audioAffinity as Record<string, number>;
  }
  let cached = DERIVED_AFFINITY_CACHE.get(entry.name);
  if (cached === undefined) {
    cached = deriveAudioAffinity(entry);
    DERIVED_AFFINITY_CACHE.set(entry.name, cached);
  }
  return cached;
}
/** Quiet threshold for silence breathing */
const QUIET_THRESHOLD = 0.03;
/** Quiet window for silence breathing (frames) */
const QUIET_WINDOW = 90;
/** Intro breathing room: no overlays in first N frames */
const INTRO_BREATHING_FRAMES = 300;

/** Accent-eligible overlays from BandConfig */
const ACCENT_ELIGIBLE = new Set(BAND_CONFIG.accentEligibleOverlays);

/** Energy-dependent accent tuning */
const ACCENT_CONFIG: Record<string, { onsetThreshold: number; peakOpacity: number; decayFrames: number } | null> = {
  high: { onsetThreshold: 0.25, peakOpacity: 0.75, decayFrames: 20 },
  mid:  { onsetThreshold: 0.35, peakOpacity: 0.60, decayFrames: 15 },
  low:  { onsetThreshold: 0.45, peakOpacity: 0.40, decayFrames: 10 },
};

/** Energy count ranges — INVERTED: quiet=rich atmosphere, peak=clean impact */
const ENERGY_COUNTS: Record<string, { min: number; max: number }> = {
  low:  { min: 2, max: 3 },   // quiet: rich atmospheric depth
  mid:  { min: 1, max: 2 },   // moderate: balanced
  high: { min: 1, max: 1 },   // peaks: clean, shader owns the moment
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
 *
 * Optional `liveSemanticProfile` overrides the static `config.semanticProfile`
 * — when provided, scoring uses per-frame CLAP scores instead of the
 * song-averaged profile, so mood signals flow with the music inside a song.
 *
 * Optional `liveStemSection` similarly overrides `config.dominantStemSection`
 * to enable per-frame stem-driven routing (vocal verse vs guitar solo vs drums
 * picking different overlay categories even within the same song).
 */
export function scoreOverlayLive(
  entry: OverlayEntry,
  snapshot: AudioSnapshot,
  config: ContinuousOverlayConfig,
  rng: () => number,
  liveSemanticProfile?: SemanticProfile,
  liveStemSection?: import("./stem-features").StemSectionType,
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
    // Per-frame stem section if provided, else fall back to song-level dominant
    stemSectionType: liveStemSection ?? config.dominantStemSection,
    mode: config.mode,
    songIdentity: config.songIdentity,
    showArcModifiers: config.showArcModifiers,
    energyHints: config.energyHints,
    // Per-frame semantic profile if provided (live CLAP), else song-averaged fallback
    semanticProfile: liveSemanticProfile ?? config.semanticProfile,
    // Continuous RMS — replaces the discrete windowEnergy bucket comparison
    // with gaussian-distance scoring against each overlay's energy band.
    continuousEnergy: snapshot.energy,
  };

  let score = scoreOverlayForWindow(entry, ctx, rng);

  // Audio affinity: weighted sum of snapshot features × affinity weights.
  // Uses explicit entry.audioAffinity if declared, else falls back to the
  // auto-derived fingerprint from category/tags/energyBand. Every overlay
  // now has an audio fingerprint — drum-affined overlays surface on drum
  // hits, atmospheric overlays sustain on slowEnergy, vocal-affined ones
  // appear during vocal sections, etc. — without per-overlay manual curation.
  const affinity = getEffectiveAudioAffinity(entry);
  if (Object.keys(affinity).length > 0) {
    let affinityScore = 0;
    for (const [field, weight] of Object.entries(affinity)) {
      if (weight === undefined) continue;
      const val = (snapshot as unknown as Record<string, number>)[field];
      if (typeof val === "number") {
        affinityScore += val * weight;
      }
    }
    // Clamp affinity contribution to ±0.3
    score += Math.max(-0.3, Math.min(0.3, affinityScore));
  }

  // (Old weak ±0.05-0.10 stem-section adjustments removed — stem-section
  // routing is now a primary signal in scoreOverlayForWindow with ±0.40+ swings.)

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
  if (quietRatio > 0.5) {
    const t = Math.min(1, (quietRatio - 0.5) / 0.5);
    const eased = t * t * (3 - 2 * t);
    const withdrawMult = 1 - eased * 0.6;
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

  // Tempo-aware inertia: slow songs deserve longer-held overlays, fast songs
  // need faster turnover to feel music-driven. 60bpm → 1.41x inertia (sticky),
  // 120bpm → 1.0x (neutral), 180bpm → 0.82x (quick turnover). Sub-square-root
  // curve so the swing feels natural across the typical 60-180bpm range.
  const tempoForInertia = audioSnapshot.localTempo || 120;
  const tempoInertiaMult = Math.max(0.65, Math.min(1.55, Math.sqrt(120 / Math.max(40, tempoForInertia))));
  inertiaBonus *= tempoInertiaMult;

  // ─── Per-frame live profiles (Fix A & B) ───
  // Compute the live semantic profile and live stem section ONCE per frame
  // (not per overlay) so all scoring passes share consistent signals.
  //
  // semanticProfile flows from the audioSnapshot's smoothed CLAP fields, so
  // mood drifts as the song's character changes (e.g. He's Gone tender verse
  // → triumphant outro). Falls back to the song-averaged config profile when
  // per-frame CLAP data isn't available.
  //
  // liveStemSection comes from per-frame stem-feature classification — vocal
  // verse vs guitar solo vs drum break get different overlay categories even
  // when the energy is the same.
  const liveStemSection = classifyStemSection(audioSnapshot);
  const liveSemanticScores = extractSemanticScores(audioSnapshot);
  const liveSemanticProfile = liveSemanticScores
    ? computeSemanticProfile(liveSemanticScores)
    : config.semanticProfile;

  // Beat-aligned jitter epoch: count how many beats have happened up to frameIdx,
  // group every JITTER_EPOCH_BEATS into one epoch. Selection re-randomizes on
  // phrase boundaries instead of an arbitrary 0.5s clock — overlays settle for
  // the duration of a musical phrase rather than ticking on wall-clock.
  // Falls back to frame-based epochs when beat data is sparse (silence, drones).
  const beatArray = BEAT_ARRAY_CACHE.get(frames) ?? (() => {
    const arr = buildBeatArray(frames);
    BEAT_ARRAY_CACHE.set(frames, arr);
    return arr;
  })();
  const tempo = audioSnapshot.localTempo || 120;
  function beatEpoch(idx: number): number {
    // Binary search: count beats with index <= idx
    if (beatArray.length === 0) return Math.floor(idx / JITTER_EPOCH_FRAMES);
    let lo = 0, hi = beatArray.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (beatArray[mid] <= idx) lo = mid + 1;
      else hi = mid;
    }
    // lo = number of beats <= idx. Group into JITTER_EPOCH_BEATS-sized buckets.
    // If we ran out of beats (silent passage), interpolate via tempo so the
    // epoch keeps advancing rather than freezing.
    if (lo >= beatArray.length && beatArray.length > 0) {
      const lastBeat = beatArray[beatArray.length - 1];
      const framesPerBeat = (60 / tempo) * 30;
      const projectedBeats = lo + Math.floor((idx - lastBeat) / framesPerBeat);
      return Math.floor(projectedBeats / JITTER_EPOCH_BEATS);
    }
    return Math.floor(lo / JITTER_EPOCH_BEATS);
  }

  // Onset-snap rotation: strong transients/drum hits/vocal entries push the
  // jitter epoch forward IMMEDIATELY instead of waiting for the next 4-beat
  // phrase. The snap count is monotonic and only advances on snap frames, so
  // it's deterministic and stable. Combined with the existing inertia bonus,
  // this gives "settles on phrases, snaps on big musical events" behavior.
  // Cache per frames array — avoids O(n × lookback) recomputation every frame
  let snapArray = SNAP_ARRAY_CACHE.get(frames);
  if (!snapArray) {
    snapArray = buildSnapFrameArray(frames);
    SNAP_ARRAY_CACHE.set(frames, snapArray);
  }
  const fullEpoch = (idx: number) => beatEpoch(idx) + snapCountUpTo(snapArray, idx);
  const jitterEpoch = fullEpoch(frameIdx);

  // ─── Cache current snapshot in ring buffer ───
  // So future frames' reference lookback can hit the cache instead of
  // recomputing 30+ gaussianSmooth passes with Math.exp().
  // Reset when called with a different frames array (new song or test).
  const currentFramesRef = snapshotRingFramesRef?.deref();
  if (currentFramesRef !== frames) {
    snapshotRingBuffer.length = 0;
    snapshotRingHead = 0;
    snapshotRingFramesRef = new WeakRef(frames);
    cachedEpoch = -1;
    cachedEpochTrackHash = trackHash;
    cachedEpochFrameIdx = -1;
    prevOverlayOpacities = null;
    prevOverlayFrameIdx = -1;
    prevOverlayFramesRef = null;
  }
  putSnapshotInRing(frameIdx, audioSnapshot);

  // ─── Epoch-cached scoring ───
  // When the jitter epoch hasn't changed, overlay scores are deterministic
  // (RNG seeded on epoch). Skip both scoring passes and reuse the cached result.
  const epochChanged = jitterEpoch !== cachedEpoch || trackHash !== cachedEpochTrackHash || frameIdx !== cachedEpochFrameIdx;

  let currentScores: { entry: OverlayEntry; score: number }[];
  let refSelectedNames: Set<string>;
  let refTargetCount: number;

  if (epochChanged) {
    const rng = seededRandom(trackHash + jitterEpoch * 7);

    // ─── Pass 1: Score all pool overlays against current AudioSnapshot ───
    currentScores = config.pool.map((entry) => ({
      entry,
      score: scoreOverlayLive(entry, audioSnapshot, config, rng, liveSemanticProfile, liveStemSection),
    }));

    // ─── Pass 2: Score against reference snapshot (lookback frames ago) ───
    // Try ring buffer first — avoids recomputing 30+ gaussianSmooth passes.
    const refIdx = Math.max(0, frameIdx - lookback);
    let refSnapshot = getCachedSnapshot(refIdx);
    if (!refSnapshot) {
      refSnapshot = computeAudioSnapshot(frames, refIdx, beatArray, 30, tempo);
    }
    const refRng = seededRandom(trackHash + fullEpoch(refIdx) * 7);
    const refStemSection = classifyStemSection(refSnapshot);
    const refSemanticScores = extractSemanticScores(refSnapshot);
    const refSemanticProfile = refSemanticScores
      ? computeSemanticProfile(refSemanticScores)
      : config.semanticProfile;

    const refScores = config.pool.map((entry) => ({
      entry,
      score: scoreOverlayLive(entry, refSnapshot!, config, refRng, refSemanticProfile, refStemSection),
    }));

    // ─── Determine reference selection (what was showing) ───
    refTargetCount = computeTargetCount(refSnapshot, config);
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
    refSelectedNames = new Set(refSelected.map((e) => e.name));

    // Update epoch cache — store scores BEFORE inertia is applied
    // so repeated calls don't double-apply the inertia bonus.
    cachedEpoch = jitterEpoch;
    cachedEpochTrackHash = trackHash;
    cachedEpochFrameIdx = frameIdx;
    cachedCurrentScores = currentScores.map((cs) => ({ ...cs }));
    cachedRefSelectedNames = refSelectedNames;
    cachedRefTargetCount = refTargetCount;
  } else {
    // Epoch+frame unchanged — reuse cached scores (clone to avoid mutation)
    currentScores = cachedCurrentScores.map((cs) => ({ ...cs }));
    refSelectedNames = cachedRefSelectedNames;
    refTargetCount = cachedRefTargetCount;
  }

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

  // ─── Temporal opacity smoothing ───
  // Prevent single-frame opacity jumps at epoch boundaries. Blend current
  // opacities toward the previous frame's values with a 4-frame time constant.
  // Fade-in is slightly faster than fade-out so new overlays appear promptly
  // but departing overlays dissolve gracefully.
  if (prevOverlayOpacities && prevOverlayFrameIdx === frameIdx - 1 && prevOverlayFramesRef?.deref() === frames) {
    const FADE_IN_RATE = 0.35;  // 0→1 in ~3 frames
    const FADE_OUT_RATE = 0.25; // 1→0 in ~4 frames
    const allKeys = new Set([...Object.keys(result), ...Object.keys(prevOverlayOpacities)]);
    for (const name of allKeys) {
      const target = result[name] ?? 0;
      const prev = prevOverlayOpacities[name] ?? 0;
      const rate = target > prev ? FADE_IN_RATE : FADE_OUT_RATE;
      const smoothed = prev + (target - prev) * rate;
      if (smoothed < 0.005) {
        delete result[name]; // fully faded out — remove
      } else {
        result[name] = smoothed;
      }
    }
  }
  // Store for next frame's smoothing
  prevOverlayOpacities = { ...result };
  prevOverlayFrameIdx = frameIdx;
  prevOverlayFramesRef = new WeakRef(frames);

  return { opacities: result, alwaysActive: config.alwaysActive };
}
