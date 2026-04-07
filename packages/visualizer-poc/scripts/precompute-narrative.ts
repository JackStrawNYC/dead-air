#!/usr/bin/env npx tsx
/**
 * Pre-compute show-narrative state for each song position.
 *
 * Why this exists:
 *   Root.tsx used to call `loadTrackAnalysis()` for every song at module-init
 *   time, which forced Webpack to inline all 24 analysis JSONs (~250 MB) into
 *   the JS bundle. Each chrome render worker then parsed 240 MB on startup,
 *   creating massive memory pressure that progressively slowed rendering and
 *   caused browser crashes.
 *
 *   By precomputing the narrative states ahead of time and bundling only the
 *   small (~10 KB) result JSON, we eliminate the bundle bloat while keeping
 *   cross-song narrative awareness.
 *
 * Usage:
 *   npx tsx scripts/precompute-narrative.ts
 *
 * Output:
 *   data/narrative-states.json — array of PrecomputedNarrative entries.
 *   Maps are serialized as { entries: [[k, v], ...] } for round-trip safety.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";

import { precomputeNarrativeStates } from "../src/utils/show-narrative-precompute";
import type {
  PrecomputedNarrative,
  NarrativeFrameData,
  NarrativeSongInput,
} from "../src/utils/show-narrative-precompute";
import { resolveSongMode, setActiveShowDate } from "../src/data/song-identities";
import { isJamSegmentTitle } from "../src/data/band-config";
import { deriveShowSeed } from "../src/data/ShowContext";
import type { VisualMode } from "../src/data/types";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const TRACKS_DIR = join(DATA_DIR, "tracks");
const SETLIST_PATH = join(DATA_DIR, "setlist.json");
const OUTPUT_PATH = join(DATA_DIR, "narrative-states.json");

interface SetlistSong {
  trackId: string;
  title: string;
  set: number;
  defaultMode?: VisualMode;
}

interface Setlist {
  date: string;
  venue: string;
  showSeed?: number;
  songs: SetlistSong[];
}

/** Map → array-of-pairs for JSON round-trip */
function serializeMap<K, V>(m: Map<K, V>): [K, V][] {
  return Array.from(m.entries());
}

/** Convert Maps inside a PrecomputedNarrative to JSON-safe form */
function serialize(states: PrecomputedNarrative[]): unknown[] {
  return states.map((s) => ({
    songsCompleted: s.songsCompleted,
    songPeakEnergies: s.songPeakEnergies,
    showEnergyBaseline: s.showEnergyBaseline,
    showPhase: s.showPhase,
    hasDrumsSpace: s.hasDrumsSpace,
    postDrumsSpaceCount: s.postDrumsSpaceCount,
    hasHadCoherenceLock: s.hasHadCoherenceLock,
    itLockCount: s.itLockCount,
    usedShaderModes: serializeMap(s.usedShaderModes),
    shaderModeLastUsed: serializeMap(s.shaderModeLastUsed),
    songPeakScores: s.songPeakScores,
    peakOfShowFired: s.peakOfShowFired,
    suiteInfo: s.suiteInfo,
    prevSongContext: s.prevSongContext,
    predictedOverlayIds: s.predictedOverlayIds,
  }));
}

function main() {
  if (!existsSync(SETLIST_PATH)) {
    console.error(`ERROR: ${SETLIST_PATH} not found`);
    process.exit(1);
  }

  const setlist = JSON.parse(readFileSync(SETLIST_PATH, "utf-8")) as Setlist;
  setActiveShowDate(setlist.date);
  const showSeed = setlist.showSeed ?? deriveShowSeed(setlist.date, setlist.venue);

  // Cache frames per track so we read each file once
  const framesCache: Record<string, NarrativeFrameData[] | null> = {};

  function loadFrames(trackId: string): NarrativeFrameData[] | null {
    if (trackId in framesCache) return framesCache[trackId];
    const path = join(TRACKS_DIR, `${trackId}-analysis.json`);
    if (!existsSync(path)) {
      console.warn(`  ! missing analysis: ${trackId}`);
      framesCache[trackId] = null;
      return null;
    }
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8")) as {
        frames?: Array<{ rms?: number; flatness?: number }>;
      };
      const frames = raw.frames ?? [];
      // Slim to only the fields precomputeNarrativeStates needs
      const slim: NarrativeFrameData[] = frames.map((f) => ({
        rms: f.rms ?? 0,
        flatness: f.flatness,
      }));
      framesCache[trackId] = slim;
      return slim;
    } catch (e) {
      console.warn(`  ! parse error: ${trackId}: ${(e as Error).message}`);
      framesCache[trackId] = null;
      return null;
    }
  }

  const songs: NarrativeSongInput[] = setlist.songs.map((s) => ({
    trackId: s.trackId,
    title: s.title,
    set: s.set,
    defaultMode: s.defaultMode,
  }));

  console.log(`Precomputing narrative states for ${songs.length} songs ...`);
  const states = precomputeNarrativeStates(
    songs,
    loadFrames,
    (song) => resolveSongMode(song.title, song.defaultMode as VisualMode | undefined, showSeed),
    isJamSegmentTitle,
  );

  const serialized = serialize(states);
  writeFileSync(OUTPUT_PATH, JSON.stringify(serialized, null, 2));
  const sizeKb = (Buffer.byteLength(JSON.stringify(serialized)) / 1024).toFixed(1);
  console.log(`Wrote ${OUTPUT_PATH} (${songs.length} entries, ${sizeKb} KB)`);
}

main();
