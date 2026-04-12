/**
 * Show Narrative Precompute — derives cross-song state from analysis + setlist.
 *
 * Since Remotion CLI renders each Composition independently (separate processes),
 * React context can't persist across songs. This module pre-computes the narrative
 * state that WOULD have accumulated if songs rendered in a single process.
 *
 * Called at module scope in Root.tsx (runs once at bundle load time).
 * Returns one PrecomputedNarrative per song: the accumulated state from all
 * songs that render BEFORE it.
 */

import type { VisualMode } from "../data/types";
import type { ShowPhase } from "../data/ShowNarrativeContext";
import { detectSuite } from "./suite-detector";
import type { SuiteInfo } from "./suite-detector";
import { SELECTABLE_REGISTRY } from "../data/overlay-registry";
import { lookupSongIdentity, getOrGenerateSongIdentity } from "../data/song-identities";
import { TRANSITION_AFFINITY } from "../scenes/transition-affinity";
import { seededLCG as seededRandom } from "./seededRandom";
import { hashString } from "./hash";
import { computeShowVisualSeed, type ShowVisualSeed } from "./show-visual-seed";
import { SCENE_REGISTRY } from "../scenes/scene-registry";

export interface PrecomputedNarrative {
  /** Songs completed before this one */
  songsCompleted: number;
  /** Peak energies from songs rendered so far */
  songPeakEnergies: number[];
  /** Running average of peak energies */
  showEnergyBaseline: number;
  /** Show phase based on position */
  showPhase: ShowPhase;
  /** Whether Drums/Space has been encountered */
  hasDrumsSpace: boolean;
  /** Songs since Drums/Space ended */
  postDrumsSpaceCount: number;
  /** Whether any song has had high coherence (IT lock) */
  hasHadCoherenceLock: boolean;
  /** Count of songs that had coherence locks (for transcendence frequency gating) */
  itLockCount: number;
  /** Shader modes used by previous songs (for variety enforcement) */
  usedShaderModes: Map<VisualMode, number>;
  /** Song index when each shader mode was last used (for recency decay) */
  shaderModeLastUsed: Map<VisualMode, number>;
  /** Composite peak-of-show scores from previous songs (for peak recognition) */
  songPeakScores: number[];
  /** Whether peak-of-show has already fired in this show */
  peakOfShowFired: boolean;
  /** Suite info for this song (multi-song continuity) */
  suiteInfo: SuiteInfo;
  /** Context about the previous song (for after-jam silence quality) */
  prevSongContext: PrevSongContext | null;
  /** Predicted overlay IDs from previous songs (for cross-song dedup) */
  predictedOverlayIds: string[];
  /** Show-level visual fingerprint derived from audio analysis */
  showVisualSeed: ShowVisualSeed | null;
  /** Curated 25-35 shaders for this show based on spectral family */
  showShaderPool: VisualMode[];
}

export interface PrevSongContext {
  /** Title of the previous song */
  title: string;
  /** Peak energy of the previous song */
  peakEnergy: number;
  /** Average energy of the previous song */
  avgEnergy: number;
  /** Whether the previous song had high coherence (IT lock) */
  hadCoherenceLock: boolean;
  /** Whether the previous song was a jam segment */
  wasJamSegment: boolean;
  /** Duration in frames of the previous song */
  durationFrames: number;
}

/** Minimal song info needed for precomputation */
export interface NarrativeSongInput {
  trackId: string;
  title: string;
  set: number;
  defaultMode?: string;
}

/** Frame data slice needed for peak energy computation */
export interface NarrativeFrameData {
  rms: number;
  flatness?: number;
}

/** Determine show phase from position */
export function computeShowPhase(songsCompleted: number, totalSongs: number): ShowPhase {
  if (totalSongs <= 0) return "opening";
  if (songsCompleted <= 1) return "opening";
  const midpoint = Math.floor(totalSongs / 2);
  if (songsCompleted < midpoint) return "deepening";
  if (songsCompleted < totalSongs - 2) return "peak_show";
  return "closing";
}

/**
 * Pre-compute narrative state for each song position.
 *
 * @param songs - Setlist entries in render order
 * @param loadFrames - Function that loads frame data for a trackId (returns null if unavailable)
 * @param resolveMode - Function that returns the visual mode for a song
 * @param isJamSegment - Function that checks if a song title is a jam segment (e.g., Drums/Space)
 * @returns Array of PrecomputedNarrative, one per song (state BEFORE that song renders)
 */
export function precomputeNarrativeStates(
  songs: NarrativeSongInput[],
  loadFrames: (trackId: string) => NarrativeFrameData[] | null,
  resolveMode: (song: NarrativeSongInput) => VisualMode,
  isJamSegment: (title: string) => boolean,
): PrecomputedNarrative[] {
  const states: PrecomputedNarrative[] = [];

  // Pre-detect suites from the full setlist
  const songTitles = songs.map((s) => s.title);

  // ─── Show Visual Seed: aggregate all song frames for show-level fingerprint ───
  const allSongFrames: { rms: number; centroid?: number; flatness?: number }[][] = [];
  for (const song of songs) {
    const frames = loadFrames(song.trackId);
    if (frames && frames.length > 0) {
      allSongFrames.push(frames.map((f) => ({
        rms: f.rms,
        centroid: undefined, // NarrativeFrameData only has rms + flatness
        flatness: f.flatness,
      })));
    }
  }
  const showDateHash = hashString(songs.map((s) => s.trackId).join("::"));
  const showVisualSeed = allSongFrames.length > 0
    ? computeShowVisualSeed(allSongFrames, showDateHash)
    : null;

  // ─── Show Shader Pool: curated 25-35 shaders based on spectral family ───
  const showShaderPool: VisualMode[] = buildShowShaderPool(showVisualSeed, songs);

  // Accumulating state
  const songPeakEnergies: number[] = [];
  const songPeakScores: number[] = [];
  let peakOfShowFired = false;
  let hasDrumsSpace = false;
  let postDrumsSpaceCount = 0;
  let hasHadCoherenceLock = false;
  let itLockCount = 0;
  const usedShaderModes = new Map<VisualMode, number>();
  const shaderModeLastUsed = new Map<VisualMode, number>();
  let prevSongContext: PrevSongContext | null = null;
  const accumulatedOverlayIds = new Set<string>();

  for (let i = 0; i < songs.length; i++) {
    // Suite detection for this song position
    const suiteInfo = detectSuite(songTitles, i);

    // Snapshot state BEFORE this song renders
    states.push({
      songsCompleted: i,
      songPeakEnergies: [...songPeakEnergies],
      showEnergyBaseline: songPeakEnergies.length > 0
        ? songPeakEnergies.reduce((a, b) => a + b, 0) / songPeakEnergies.length
        : 0,
      showPhase: computeShowPhase(i, songs.length),
      hasDrumsSpace,
      postDrumsSpaceCount,
      hasHadCoherenceLock,
      itLockCount,
      usedShaderModes: new Map(usedShaderModes),
      shaderModeLastUsed: new Map(shaderModeLastUsed),
      songPeakScores: [...songPeakScores],
      peakOfShowFired,
      suiteInfo,
      prevSongContext,
      predictedOverlayIds: [...accumulatedOverlayIds],
      showVisualSeed,
      showShaderPool,
    });

    // --- Compute this song's contribution for the NEXT song ---

    // Peak energy from analysis frames
    const frames = loadFrames(songs[i].trackId);
    let thisSongPeakRms = 0;
    let thisSongAvgRms = 0;
    let thisSongHadCoherence = false;
    if (frames && frames.length > 0) {
      let peakRms = 0;
      let rmsSum = 0;
      for (let j = 0; j < frames.length; j++) {
        if (frames[j].rms > peakRms) peakRms = frames[j].rms;
        rmsSum += frames[j].rms;
      }
      thisSongPeakRms = peakRms;
      thisSongAvgRms = rmsSum / frames.length;
      songPeakEnergies.push(peakRms);

      // Composite peak score: energy × coherence proxy
      // Used by peak-of-show detector to compare across songs
      let maxScore = 0;
      for (let j = 0; j < frames.length; j += 10) {
        const rms = frames[j].rms;
        const flatness = frames[j].flatness ?? 0.5;
        const score = rms * Math.max(0, 1 - flatness * 2);
        if (score > maxScore) maxScore = score;
      }
      songPeakScores.push(maxScore);

      // If this song's peak exceeds all previous by 10%+ AND we're past 40%,
      // mark peak-of-show as potentially fired (used to prevent re-triggering)
      if (!peakOfShowFired && i >= songs.length * 0.4) {
        const prevMax = songPeakScores.length > 1
          ? Math.max(...songPeakScores.slice(0, -1))
          : 0;
        if (maxScore > prevMax * 1.1 && maxScore > 0.08) {
          peakOfShowFired = true;
        }
      }

      // Coherence lock heuristic: sustained high energy + low flatness
      // (rough proxy — actual coherence computation is per-frame and expensive)
      let highCoherenceFrames = 0;
      for (let j = 0; j < frames.length; j += 30) {
        if (frames[j].rms > 0.15 && (frames[j].flatness ?? 1) < 0.25) {
          highCoherenceFrames++;
        }
      }
      // If >10% of sampled frames show high coherence, consider it a lock
      if (highCoherenceFrames > frames.length / 30 * 0.1) {
        hasHadCoherenceLock = true;
        thisSongHadCoherence = true;
        itLockCount++;
      }
    }

    // Drums/Space tracking
    const isDrums = isJamSegment(songs[i].title);
    if (isDrums) {
      hasDrumsSpace = true;
      postDrumsSpaceCount = 0;
    } else if (hasDrumsSpace) {
      postDrumsSpaceCount++;
    }

    // Shader mode tracking: predict multiple modes per song from energy profile + affinity
    const primaryMode = resolveMode(songs[i]);
    usedShaderModes.set(primaryMode, (usedShaderModes.get(primaryMode) ?? 0) + 1);
    shaderModeLastUsed.set(primaryMode, i);
    // Simulate section-based mode variation: songs with higher energy or longer duration
    // are likely to use affinity-pool modes in addition to the primary mode
    const affinityPool = TRANSITION_AFFINITY[primaryMode];
    if (affinityPool && affinityPool.length > 0 && frames && frames.length > 0) {
      // Estimate how many sections this song will have (longer songs = more modes)
      const durationSec = frames.length / 30;
      const estimatedSections = Math.max(1, Math.min(5, Math.floor(durationSec / 60)));
      // Pick seeded affinity modes for variety tracking
      const songSeed = hashString(songs[i].trackId + songs[i].title);
      const rng = seededRandom(songSeed);
      const availableAffinity = affinityPool.filter((m) => m !== primaryMode);
      for (let s = 0; s < Math.min(estimatedSections - 1, availableAffinity.length); s++) {
        const pick = availableAffinity[Math.floor(rng() * availableAffinity.length)];
        usedShaderModes.set(pick, (usedShaderModes.get(pick) ?? 0) + 1);
        shaderModeLastUsed.set(pick, i);
      }
    }

    // Predict overlays for cross-song dedup: score each overlay by tag match
    const songIdentity = frames && frames.length > 0
      ? getOrGenerateSongIdentity(songs[i].trackId, songs[i].title, { tempo: 120, totalFrames: frames.length, duration: frames.length / 30, sections: [] } as never, frames as never)
      : lookupSongIdentity(songs[i].title);
    if (songIdentity) {
      const moodTags = new Set(songIdentity.moodKeywords ?? []);
      const scored: { name: string; score: number }[] = [];
      for (const entry of SELECTABLE_REGISTRY) {
        let score = 0;
        if (entry.energyBand === (songIdentity.overlayDensity != null && songIdentity.overlayDensity > 1 ? "high" : "low")) {
          score += 2;
        }
        for (const tag of entry.tags) {
          if (moodTags.has(tag as never)) score += 1;
        }
        if (songIdentity.overlayBoost?.includes(entry.name)) score += 3;
        scored.push({ name: entry.name, score });
      }
      scored.sort((a, b) => b.score - a.score);
      const top20 = scored.slice(0, 20);
      for (const { name } of top20) {
        accumulatedOverlayIds.add(name);
      }
    }

    // Build prev song context for the next song
    prevSongContext = {
      title: songs[i].title,
      peakEnergy: thisSongPeakRms,
      avgEnergy: thisSongAvgRms,
      hadCoherenceLock: thisSongHadCoherence,
      wasJamSegment: isJamSegment(songs[i].title),
      durationFrames: frames?.length ?? 0,
    };
  }

  return states;
}

/**
 * Build a curated shader pool for this show based on spectral family.
 * 12-15 from dominant family, 8-10 from secondary, 5-8 wildcards.
 * Song identity preferred modes are always included.
 */
function buildShowShaderPool(
  seed: ShowVisualSeed | null,
  songs: NarrativeSongInput[],
): VisualMode[] {
  if (!seed) return []; // empty = no filtering downstream

  const allModes = Object.keys(SCENE_REGISTRY) as VisualMode[];
  const byFamily = new Map<string, VisualMode[]>();
  const versatile: VisualMode[] = [];

  for (const mode of allModes) {
    const entry = SCENE_REGISTRY[mode];
    const family = entry?.spectralFamily;
    if (!family) {
      versatile.push(mode);
    } else {
      if (!byFamily.has(family)) byFamily.set(family, []);
      byFamily.get(family)!.push(mode);
    }
  }

  const pool = new Set<VisualMode>();

  // Primary family: 12-15 shaders
  const primaryModes = byFamily.get(seed.dominantSpectralFamily) ?? [];
  const primaryTarget = Math.min(15, primaryModes.length);
  // Deterministic shuffle using showHash
  const shuffledPrimary = deterministicShuffle(primaryModes, seed.showHash);
  for (let i = 0; i < primaryTarget; i++) pool.add(shuffledPrimary[i]);

  // Secondary family: 8-10 shaders
  const secondaryModes = byFamily.get(seed.secondarySpectralFamily) ?? [];
  const secondaryTarget = Math.min(10, secondaryModes.length);
  const shuffledSecondary = deterministicShuffle(secondaryModes, seed.showHash + 1);
  for (let i = 0; i < secondaryTarget; i++) pool.add(shuffledSecondary[i]);

  // Wildcards: 5-8 from remaining families + versatile
  const wildcardCandidates: VisualMode[] = [...versatile];
  for (const [family, modes] of byFamily) {
    if (family !== seed.dominantSpectralFamily && family !== seed.secondarySpectralFamily) {
      wildcardCandidates.push(...modes);
    }
  }
  const shuffledWild = deterministicShuffle(wildcardCandidates, seed.showHash + 2);
  const wildcardTarget = Math.min(8, shuffledWild.length);
  for (let i = 0; i < wildcardTarget; i++) pool.add(shuffledWild[i]);

  // Always include song-identity preferred modes
  for (const song of songs) {
    const identity = lookupSongIdentity(song.title);
    if (identity?.preferredModes) {
      for (const m of identity.preferredModes) pool.add(m as VisualMode);
    }
  }

  return Array.from(pool);
}

/** Deterministic shuffle using a simple LCG seeded from hash */
function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  const rng = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
