/**
 * Overlay Selector — scores and selects overlays per song based on audio analysis.
 *
 * Algorithm:
 * 1. Build a SongProfile from audio analysis frames (avg energy, centroid, flatness, etc.)
 * 2. Score each overlay 0-1 against the profile (energy band match, tag affinity, weight, variety)
 * 3. Select top overlays per layer within min/max targets
 * 4. Cap total visual weight at 60
 */
import type {
  EnhancedFrameData,
  OverlayEntry,
  OverlayTag,
  SongProfile,
  TrackAnalysis,
  SetlistEntry,
  OverlayOverrides,
} from "./types";
import { SELECTABLE_REGISTRY, ALWAYS_ACTIVE } from "./overlay-registry";

// ─── Per-layer selection targets ───
const LAYER_TARGETS: Record<number, { min: number; max: number }> = {
  1:  { min: 3, max: 6 },   // Atmospheric
  2:  { min: 2, max: 5 },   // Sacred/Center
  3:  { min: 3, max: 6 },   // Reactive
  4:  { min: 2, max: 5 },   // Geometric
  5:  { min: 3, max: 7 },   // Nature/Cosmic
  6:  { min: 2, max: 5 },   // Characters
  7:  { min: 2, max: 5 },   // Frame/Info
  8:  { min: 1, max: 3 },   // Typography
  9:  { min: 1, max: 3 },   // HUD
  10: { min: 1, max: 3 },   // Distortion
};

const MAX_TOTAL_WEIGHT = 60;

// ─── Cross-Song Memory ───

/** How many previous songs to remember for variety penalties */
const LOOKBACK_DEPTH = 4;

/** Graduated recency penalties: N-1 = 50%, N-2 = 35%, N-3 = 20%, N-4 = 10% */
const RECENCY_PENALTIES = [0.50, 0.35, 0.20, 0.10];

/** No overlay should appear in more than this fraction of songs */
const MAX_FREQUENCY_RATIO = 0.40;

/** Score penalty when an overlay exceeds the frequency cap */
const FREQUENCY_CAP_PENALTY = 0.35;

/**
 * Cross-song memory for variety enforcement.
 * Tracks recent song selections + show-wide frequency.
 */
export interface OverlayHistory {
  /** Recent song overlays, most recent first (up to LOOKBACK_DEPTH) */
  recentSongs: Set<string>[];
  /** Total appearances per overlay across all songs so far */
  frequency: Map<string, number>;
  /** Total songs processed so far */
  songCount: number;
}

/** Create an empty history (for the first song in a show) */
export function emptyHistory(): OverlayHistory {
  return { recentSongs: [], frequency: new Map(), songCount: 0 };
}

/** Push a song's selected overlays into history, maintaining LOOKBACK_DEPTH window */
export function pushHistory(history: OverlayHistory, overlays: string[]): OverlayHistory {
  const recentSongs = [new Set(overlays), ...history.recentSongs].slice(0, LOOKBACK_DEPTH);
  const frequency = new Map(history.frequency);
  for (const name of overlays) {
    frequency.set(name, (frequency.get(name) ?? 0) + 1);
  }
  return { recentSongs, frequency, songCount: history.songCount + 1 };
}

// ─── Deterministic PRNG ───
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ─── Song Profiling ───

export function buildSongProfile(
  song: SetlistEntry,
  analysis: TrackAnalysis,
): SongProfile {
  const frames = analysis.frames;
  const n = frames.length;
  if (n === 0) {
    return {
      trackId: song.trackId,
      title: song.title,
      set: song.set,
      avgEnergy: 0,
      energyVariance: 0,
      dominantEnergyBand: "low",
      peakEnergyRatio: 0,
      avgCentroid: 0,
      avgFlatness: 0,
      avgSub: 0,
      chromaSpread: 0,
      tempo: analysis.meta.tempo ?? 120,
      sectionCount: analysis.meta.sections?.length ?? 1,
    };
  }

  // Accumulate sums
  let sumRms = 0, sumCentroid = 0, sumFlatness = 0, sumSub = 0;
  let sumLow = 0, sumMid = 0, sumHigh = 0;
  let peakCount = 0;
  const chromaSums = new Array(12).fill(0);

  for (const f of frames) {
    sumRms += f.rms;
    sumCentroid += f.centroid;
    sumFlatness += f.flatness;
    sumSub += f.sub;
    sumLow += f.low;
    sumMid += f.mid;
    sumHigh += f.high;
    if (f.rms > 0.25) peakCount++;
    for (let c = 0; c < 12; c++) {
      chromaSums[c] += f.chroma[c];
    }
  }

  const avgEnergy = sumRms / n;
  const avgCentroid = sumCentroid / n;
  const avgFlatness = sumFlatness / n;
  const avgSub = sumSub / n;
  const avgLow = sumLow / n;
  const avgMid = sumMid / n;
  const avgHigh = sumHigh / n;

  // Energy variance
  let varianceSum = 0;
  for (const f of frames) {
    const diff = f.rms - avgEnergy;
    varianceSum += diff * diff;
  }
  const energyVariance = varianceSum / n;

  // Dominant energy band (which band has highest average)
  const bands = { low: avgLow, mid: avgMid, high: avgHigh };
  const dominantEnergyBand = (
    Object.entries(bands) as [string, number][]
  ).sort((a, b) => b[1] - a[1])[0][0] as "low" | "mid" | "high";

  // Chroma spread: standard deviation of averaged chroma values
  const chromaAvgs = chromaSums.map((s) => s / n);
  const chromaMean = chromaAvgs.reduce((a, b) => a + b, 0) / 12;
  const chromaVariance =
    chromaAvgs.reduce((acc, v) => acc + (v - chromaMean) ** 2, 0) / 12;
  const chromaSpread = Math.sqrt(chromaVariance);

  return {
    trackId: song.trackId,
    title: song.title,
    set: song.set,
    avgEnergy,
    energyVariance,
    dominantEnergyBand,
    peakEnergyRatio: peakCount / n,
    avgCentroid,
    avgFlatness,
    avgSub,
    chromaSpread,
    tempo: analysis.meta.tempo ?? 120,
    sectionCount: analysis.meta.sections?.length ?? 1,
  };
}

// ─── Tag Affinity Scoring ───

/**
 * Score how well a tag matches the song profile (0-0.15).
 * Each tag has a different signal it responds to.
 */
function tagAffinity(tag: OverlayTag, profile: SongProfile): number {
  switch (tag) {
    case "cosmic":
      // High centroid, high chroma spread
      return (profile.avgCentroid * 0.5 + profile.chromaSpread * 0.5) * 0.15;
    case "organic":
      // Low tempo, mid energy, high sub-bass
      return (
        ((1 - Math.min(profile.tempo / 200, 1)) * 0.3 +
          (1 - Math.abs(profile.avgEnergy - 0.15) * 4) * 0.3 +
          profile.avgSub * 0.4) *
        0.15
      );
    case "mechanical":
      // High tempo, strong beats
      return (Math.min(profile.tempo / 160, 1) * 0.6 + profile.peakEnergyRatio * 0.4) * 0.15;
    case "psychedelic":
      // High flatness (noisy), high energy variance
      return (profile.avgFlatness * 0.5 + Math.min(profile.energyVariance * 10, 1) * 0.5) * 0.15;
    case "festival":
      // High energy, set 2 bonus
      return (
        (profile.avgEnergy * 3 * 0.6 + (profile.set === 2 ? 0.4 : 0)) * 0.15
      );
    case "contemplative":
      // Low energy, low tempo
      return (
        ((1 - profile.avgEnergy * 3) * 0.5 +
          (1 - Math.min(profile.tempo / 160, 1)) * 0.5) *
        0.15
      );
    case "dead-culture":
      // Always mild positive
      return 0.08;
    case "intense":
      // High peak energy ratio
      return profile.peakEnergyRatio * 0.15;
    case "retro":
      // Slight positive for variety
      return 0.05;
    case "aquatic":
      // High sub-bass, mid energy
      return (profile.avgSub * 0.6 + (1 - Math.abs(profile.avgEnergy - 0.12) * 5) * 0.4) * 0.15;
    default:
      return 0;
  }
}

// ─── Overlay Scoring ───

interface ScoredOverlay {
  entry: OverlayEntry;
  score: number;
}

function scoreOverlay(
  entry: OverlayEntry,
  profile: SongProfile,
  history: OverlayHistory,
  rng: () => number,
): number {
  if (entry.alwaysActive) return 1; // Always selected

  let score = 0.5; // Base score

  // Energy band match (+0.3 match, -0.2 opposite, 0 for "any")
  if (entry.energyBand !== "any") {
    if (entry.energyBand === profile.dominantEnergyBand) {
      score += 0.3;
    } else if (
      (entry.energyBand === "low" && profile.dominantEnergyBand === "high") ||
      (entry.energyBand === "high" && profile.dominantEnergyBand === "low")
    ) {
      score -= 0.2;
    }
  }

  // Tag affinity (sum of tag scores)
  for (const tag of entry.tags) {
    score += tagAffinity(tag, profile);
  }

  // Weight penalty: heavy overlays slightly penalized, subtle slightly boosted
  if (entry.weight === 3) score -= 0.1;
  if (entry.weight === 1) score += 0.05;

  // Graduated recency penalty: strongest for N-1, decaying over LOOKBACK_DEPTH songs
  for (let i = 0; i < history.recentSongs.length; i++) {
    if (history.recentSongs[i].has(entry.name)) {
      score *= (1 - RECENCY_PENALTIES[i]);
      break; // Apply only the strongest (most recent) penalty
    }
  }

  // Show-level frequency cap: penalize overlays appearing in >40% of songs
  if (history.songCount >= 3) {
    const appearances = history.frequency.get(entry.name) ?? 0;
    const ratio = appearances / history.songCount;
    if (ratio > MAX_FREQUENCY_RATIO) {
      score -= FREQUENCY_CAP_PENALTY * (ratio - MAX_FREQUENCY_RATIO) / (1 - MAX_FREQUENCY_RATIO);
    }
  }

  // Deterministic jitter (0-0.08)
  score += rng() * 0.08;

  return Math.max(0, Math.min(1, score));
}

// ─── Selection Algorithm ───

export interface SelectionResult {
  activeOverlays: string[];
  totalCount: number;
  totalWeight: number;
}

/**
 * Select overlays for a single song.
 * @param profile — Audio summary stats for this song
 * @param history — Cross-song memory (recent selections + frequency). Accepts legacy Set<string> for backwards compat.
 * @param overrides — Manual include/exclude/targetCount from setlist
 * @param showSeed — Show-level seed to salt the PRNG (same trackId, different show = different selection)
 */
export function selectOverlays(
  profile: SongProfile,
  history: OverlayHistory | Set<string>,
  overrides?: OverlayOverrides,
  showSeed?: number,
): SelectionResult {
  // Backwards compat: wrap bare Set in a single-song history
  const resolvedHistory: OverlayHistory = history instanceof Set
    ? { recentSongs: [history], frequency: new Map(), songCount: 1 }
    : history;

  const rng = seededRandom(hashString(profile.trackId) + (showSeed ?? 0));

  // Score all overlays
  const scored: ScoredOverlay[] = SELECTABLE_REGISTRY.map((entry) => ({
    entry,
    score: scoreOverlay(entry, profile, resolvedHistory, rng),
  }));

  // Group by layer
  const byLayer = new Map<number, ScoredOverlay[]>();
  for (const s of scored) {
    const list = byLayer.get(s.entry.layer) ?? [];
    list.push(s);
    byLayer.set(s.entry.layer, list);
  }

  // Select per layer
  const selected = new Set<string>();
  let totalWeight = 0;

  // Always-active overlays first
  for (const name of ALWAYS_ACTIVE) {
    selected.add(name);
    const entry = SELECTABLE_REGISTRY.find((e) => e.name === name);
    if (entry) totalWeight += entry.weight;
  }

  // Force includes from overrides
  if (overrides?.include) {
    for (const name of overrides.include) {
      selected.add(name);
      const entry = SELECTABLE_REGISTRY.find((e) => e.name === name);
      if (entry) totalWeight += entry.weight;
    }
  }

  const excludeSet = new Set(overrides?.exclude ?? []);

  for (let layer = 1; layer <= 10; layer++) {
    const candidates = byLayer.get(layer) ?? [];
    const target = LAYER_TARGETS[layer] ?? { min: 1, max: 3 };

    // Sort by score descending
    const sortedCandidates = candidates
      .filter((s) => !s.entry.alwaysActive && !excludeSet.has(s.entry.name))
      .sort((a, b) => b.score - a.score);

    let layerCount = 0;
    // Count already-selected items in this layer
    for (const name of selected) {
      const entry = SELECTABLE_REGISTRY.find((e) => e.name === name);
      if (entry?.layer === layer) layerCount++;
    }

    for (const candidate of sortedCandidates) {
      if (layerCount >= target.max) break;
      if (totalWeight >= MAX_TOTAL_WEIGHT) break;
      if (selected.has(candidate.entry.name)) continue;

      selected.add(candidate.entry.name);
      totalWeight += candidate.entry.weight;
      layerCount++;
    }

    // If we haven't hit minimum, force add top remaining
    if (layerCount < target.min) {
      for (const candidate of sortedCandidates) {
        if (layerCount >= target.min) break;
        if (selected.has(candidate.entry.name)) continue;

        selected.add(candidate.entry.name);
        totalWeight += candidate.entry.weight;
        layerCount++;
      }
    }
  }

  // Remove excludes (safety — shouldn't have been added)
  for (const name of excludeSet) {
    selected.delete(name);
  }

  // Apply targetCount override if specified
  const activeOverlays = Array.from(selected);

  return {
    activeOverlays,
    totalCount: activeOverlays.length,
    totalWeight,
  };
}

/**
 * Run full-show selection with cross-song variety enforcement.
 * Uses deep history (LOOKBACK_DEPTH songs) + show-level frequency cap.
 * @param showSeed — Show-level seed to salt the PRNG
 */
export function selectOverlaysForShow(
  songs: { song: SetlistEntry; analysis: TrackAnalysis }[],
  showSeed?: number,
): Record<string, SelectionResult & { title: string }> {
  const results: Record<string, SelectionResult & { title: string }> = {};
  let history = emptyHistory();

  for (const { song, analysis } of songs) {
    const profile = buildSongProfile(song, analysis);
    const overrides = song.overlayOverrides;
    const result = selectOverlays(profile, history, overrides, showSeed);

    results[song.trackId] = {
      ...result,
      title: song.title,
    };

    history = pushHistory(history, result.activeOverlays);
  }

  return results;
}
