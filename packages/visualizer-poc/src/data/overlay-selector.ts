/**
 * Overlay Selector — scores and selects overlays per song based on audio analysis.
 *
 * Algorithm:
 * 1. Build a SongProfile from audio analysis frames (avg energy, centroid, flatness, etc.)
 * 2. Score each overlay 0-1 against the profile (energy band match, tag affinity, weight, variety)
 * 3. Select top overlays per layer within min/max targets
 * 4. Cap total visual weight at 18
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
import type { SongIdentity } from "./song-identities";
import { BAND_CONFIG } from "./band-config";
import type { ShowArcModifiers } from "./show-arc";

// ─── Per-layer selection targets (sparse — let each visual moment breathe) ───
const LAYER_TARGETS: Record<number, { min: number; max: number }> = {
  1:  { min: 0, max: 1 },   // Atmospheric
  2:  { min: 0, max: 1 },   // Sacred
  3:  { min: 0, max: 1 },   // Reactive
  4:  { min: 0, max: 1 },   // Geometric
  5:  { min: 0, max: 1 },   // Nature/Cosmic
  6:  { min: 0, max: 1 },   // Characters
  7:  { min: 0, max: 1 },   // Frame/Info
  8:  { min: 0, max: 1 },   // Typography
  9:  { min: 0, max: 1 },   // HUD — music visualization
  10: { min: 0, max: 1 },   // Distortion
};

const MAX_TOTAL_WEIGHT = 10;

// ─── Cross-Song Memory ───

/** How many previous songs to remember for variety penalties.
 *  Increased from 4 → 8 to cover a full set and prevent mid-show repetition. */
const LOOKBACK_DEPTH = 8;

/** Graduated recency penalties: stronger for recent songs, gentle for older.
 *  N-1 raised from 0.50 → 0.70 to prevent adjacent-song overlay repeats. */
const RECENCY_PENALTIES = [0.70, 0.55, 0.40, 0.30, 0.20, 0.12, 0.06, 0.03];

/** No overlay should appear in more than this fraction of songs.
 *  Reduced from 0.40 → 0.25 so an overlay appears in at most ~3 out of 12 songs. */
const MAX_FREQUENCY_RATIO = 0.25;

/** Score penalty when an overlay exceeds the frequency cap */
const FREQUENCY_CAP_PENALTY = 0.50;

/**
 * Cross-song memory for variety enforcement.
 * Tracks recent song selections + show-wide frequency to prevent
 * the same overlays appearing in every song. Used by selectOverlays().
 */
export interface OverlayHistory {
  /** Recent song overlays, most recent first (up to LOOKBACK_DEPTH) */
  recentSongs: Set<string>[];
  /** Total appearances per overlay across all songs so far */
  frequency: Map<string, number>;
  /** Total songs processed so far */
  songCount: number;
}

/** Create an empty overlay history for the first song in a show. */
export function emptyHistory(): OverlayHistory {
  return { recentSongs: [], frequency: new Map(), songCount: 0 };
}

/** Push a song's selected overlays into history, maintaining a sliding window of recent songs. */
export function pushHistory(history: OverlayHistory, overlays: string[]): OverlayHistory {
  const recentSongs = [new Set(overlays), ...history.recentSongs].slice(0, LOOKBACK_DEPTH);
  const frequency = new Map(history.frequency);
  for (const name of overlays) {
    frequency.set(name, (frequency.get(name) ?? 0) + 1);
  }
  return { recentSongs, frequency, songCount: history.songCount + 1 };
}

// ─── Deterministic PRNG + Hashing (shared utils) ───
import { seededLCG as seededRandom } from "../utils/seededRandom";
import { hashString } from "../utils/hash";

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
      avgVocalPresence: 0,
      avgDrumEnergy: 0,
      avgOtherCentroid: 0,
    };
  }

  // Accumulate sums
  let sumRms = 0, sumCentroid = 0, sumFlatness = 0, sumSub = 0;
  let sumLow = 0, sumMid = 0, sumHigh = 0;
  let peakCount = 0;
  let sumVocalPresence = 0, sumDrumEnergy = 0, sumOtherCentroid = 0;
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
    sumVocalPresence += f.stemVocalPresence ? 1 : 0;
    sumDrumEnergy += f.stemDrumOnset ?? 0;
    sumOtherCentroid += f.stemOtherCentroid ?? 0;
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
    avgVocalPresence: sumVocalPresence / n,
    avgDrumEnergy: sumDrumEnergy / n,
    avgOtherCentroid: sumOtherCentroid / n,
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
      // Low tempo, mid energy, high sub-bass + vocal presence boost
      // Songs with strong vocals feel more organic/human
      return (
        ((1 - Math.min(profile.tempo / 200, 1)) * 0.25 +
          (1 - Math.abs(profile.avgEnergy - 0.15) * 4) * 0.25 +
          profile.avgSub * 0.3 +
          profile.avgVocalPresence * 0.2) *
        0.15
      );
    case "mechanical":
      // High tempo, strong beats + drum energy from stems
      return (
        (Math.min(profile.tempo / 160, 1) * 0.4 +
          profile.peakEnergyRatio * 0.3 +
          Math.min(profile.avgDrumEnergy * 4, 1) * 0.3) *
        0.15
      );
    case "psychedelic":
      // High flatness (noisy), high energy variance + high guitar centroid (bright/effects-laden)
      return (
        (profile.avgFlatness * 0.35 +
          Math.min(profile.energyVariance * 10, 1) * 0.35 +
          profile.avgOtherCentroid * 0.3) *
        0.15
      );
    case "festival":
      // High energy, set 2 bonus
      return (
        (profile.avgEnergy * 3 * 0.6 + (profile.set === 2 ? 0.4 : 0)) * 0.15
      );
    case "contemplative":
      // Low energy, low tempo + high vocal presence (ballads)
      return (
        ((1 - profile.avgEnergy * 3) * 0.4 +
          (1 - Math.min(profile.tempo / 160, 1)) * 0.35 +
          profile.avgVocalPresence * 0.25) *
        0.15
      );
    case "intense":
      // High peak energy ratio + drum energy
      return (
        (profile.peakEnergyRatio * 0.6 +
          Math.min(profile.avgDrumEnergy * 4, 1) * 0.4) *
        0.15
      );
    case "retro":
      // Slight positive for variety
      return 0.05;
    case "aquatic":
      // High sub-bass, mid energy
      return (profile.avgSub * 0.6 + (1 - Math.abs(profile.avgEnergy - 0.12) * 5) * 0.4) * 0.15;
    default:
      if (tag === BAND_CONFIG.overlayTags.culture) return 0.08;
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
  songIdentity?: SongIdentity,
  showArcModifiers?: ShowArcModifiers,
): number {
  if (entry.alwaysActive) return 1; // Always selected

  let score = 0.5; // Base score

  // Tier bonus: A-tier overlays get a scoring edge
  if (entry.tier === "A") score += 0.15;

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

  // Energy response curve match: overlays whose peak aligns with song energy score higher
  if (entry.energyResponse) {
    const [threshold, peak] = entry.energyResponse;
    const dist = Math.abs(profile.avgEnergy - peak);
    score += 0.10 - dist * 0.3;
    if (profile.avgEnergy < threshold) {
      score -= 0.15;
    }
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

  // Song identity overlay boost/suppress
  if (songIdentity) {
    if (songIdentity.overlayBoost?.includes(entry.name)) {
      score += 0.25;
    }
    if (songIdentity.overlaySuppress?.includes(entry.name)) {
      score -= 0.35;
    }
  }

  // Show arc overlay category bias
  if (showArcModifiers?.overlayBias) {
    const bias = showArcModifiers.overlayBias[entry.category];
    if (bias) score += bias;
  }

  // Surprise rarity gate: overlays with rarity < 1.0 have a random chance of suppression
  if (entry.rarity !== undefined && entry.rarity < 1.0) {
    if (rng() > entry.rarity) {
      score *= 0.1;
    }
  }

  // Deterministic jitter (0-0.15) — wider spread for more per-song randomization
  score += rng() * 0.15;

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
  songIdentity?: SongIdentity,
  showArcModifiers?: ShowArcModifiers,
): SelectionResult {
  // Backwards compat: wrap bare Set in a single-song history
  const resolvedHistory: OverlayHistory = history instanceof Set
    ? { recentSongs: [history], frequency: new Map(), songCount: 1 }
    : history;

  const rng = seededRandom(hashString(profile.trackId) + (showSeed ?? 0));

  // Score all overlays
  const scored: ScoredOverlay[] = SELECTABLE_REGISTRY.map((entry) => ({
    entry,
    score: scoreOverlay(entry, profile, resolvedHistory, rng, songIdentity, showArcModifiers),
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

  // Dead culture guarantee: at least 1 culture-tagged overlay per song
  const hasCulture = Array.from(selected).some((name) => {
    const entry = SELECTABLE_REGISTRY.find((e) => e.name === name);
    return entry?.tags.includes(BAND_CONFIG.overlayTags.culture);
  });
  if (!hasCulture) {
    const cultureCandidate = scored
      .filter(
        (s) =>
          s.entry.tags.includes(BAND_CONFIG.overlayTags.culture) &&
          !selected.has(s.entry.name) &&
          !excludeSet.has(s.entry.name),
      )
      .sort((a, b) => b.score - a.score)[0];
    if (cultureCandidate) {
      selected.add(cultureCandidate.entry.name);
      totalWeight += cultureCandidate.entry.weight;
    }
  }

  // Force-include top-1 boosted overlay from song identity (if not already present)
  if (songIdentity?.overlayBoost?.length) {
    const boostedScored = songIdentity.overlayBoost
      .map((name) => {
        const s = scored.find((sc) => sc.entry.name === name);
        return s ? { name, score: s.score } : null;
      })
      .filter((x): x is { name: string; score: number } => x !== null && !selected.has(x.name) && !excludeSet.has(x.name))
      .sort((a, b) => b.score - a.score);
    if (boostedScored.length > 0) {
      selected.add(boostedScored[0].name);
      const entry = SELECTABLE_REGISTRY.find((e) => e.name === boostedScored[0].name);
      if (entry) totalWeight += entry.weight;
    }
  }

  // Remove excludes (safety — shouldn't have been added)
  for (const name of excludeSet) {
    selected.delete(name);
  }

  // Complexity cap: prevent visual overload from too many busy overlays
  const MAX_COMPLEXITY = 18;
  const forceIncluded = new Set(overrides?.include ?? []);
  let totalComplexity = 0;
  for (const name of selected) {
    const entry = SELECTABLE_REGISTRY.find((e) => e.name === name);
    totalComplexity += entry?.complexity ?? entry?.weight ?? 2;
  }
  while (totalComplexity > MAX_COMPLEXITY && selected.size > 2) {
    // Find lowest-scoring removable overlay (not always-active, not force-included)
    let worstName: string | null = null;
    let worstScore = Infinity;
    for (const name of selected) {
      const entry = SELECTABLE_REGISTRY.find((e) => e.name === name);
      if (entry?.alwaysActive || forceIncluded.has(name)) continue;
      const s = scored.find((sc) => sc.entry.name === name);
      if (s && s.score < worstScore) {
        worstScore = s.score;
        worstName = name;
      }
    }
    if (!worstName) break;
    const removedEntry = SELECTABLE_REGISTRY.find((e) => e.name === worstName);
    totalComplexity -= removedEntry?.complexity ?? removedEntry?.weight ?? 2;
    totalWeight -= removedEntry?.weight ?? 0;
    selected.delete(worstName);
  }

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
  songIdentities?: Map<string, SongIdentity>,
  showArcModifiers?: ShowArcModifiers,
): Record<string, SelectionResult & { title: string }> {
  const results: Record<string, SelectionResult & { title: string }> = {};
  let history = emptyHistory();

  for (const { song, analysis } of songs) {
    const profile = buildSongProfile(song, analysis);
    const overrides = song.overlayOverrides;
    const identity = songIdentities?.get(song.title);
    const result = selectOverlays(profile, history, overrides, showSeed, identity, showArcModifiers);

    results[song.trackId] = {
      ...result,
      title: song.title,
    };

    history = pushHistory(history, result.activeOverlays);
  }

  return results;
}
