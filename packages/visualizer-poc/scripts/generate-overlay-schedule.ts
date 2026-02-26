#!/usr/bin/env npx tsx
/**
 * Generate Overlay Schedule — pre-builds which overlays each song gets.
 *
 * Reads setlist.json + audio analysis files, runs the scoring/selection
 * algorithm, and writes data/overlay-schedule.json.
 *
 * Usage:
 *   npx tsx scripts/generate-overlay-schedule.ts
 *   npx tsx scripts/generate-overlay-schedule.ts --verbose
 *   npx tsx scripts/generate-overlay-schedule.ts --mock   # use synthetic profiles when no analysis
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import type { SetlistEntry, ShowSetlist, TrackAnalysis, OverlaySchedule } from "../src/data/types";
import { buildSongProfile, selectOverlays, emptyHistory, pushHistory } from "../src/data/overlay-selector";
import { OVERLAY_REGISTRY } from "../src/data/overlay-registry";
import { getShowSeed } from "../src/data/ShowContext";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const useMock = args.includes("--mock");

// ─── Load setlist ───
const setlist = JSON.parse(
  readFileSync(join(DATA_DIR, "setlist.json"), "utf-8"),
) as ShowSetlist;

const showSeed = getShowSeed(setlist);

console.log(`Overlay schedule generator`);
console.log(`  ${setlist.songs.length} songs in setlist`);
console.log(`  ${OVERLAY_REGISTRY.length} overlays in registry`);
console.log(`  Show seed: ${showSeed}`);
console.log();

// ─── Analysis file discovery ───
// Try multiple naming conventions for analysis files
function findAnalysisFile(song: SetlistEntry): string | null {
  const candidates = [
    join(DATA_DIR, `${song.trackId}-analysis.json`),
    join(DATA_DIR, `tracks`, `${song.trackId}-analysis.json`),
    // Morning Dew has a special name
    ...(song.trackId === "s2t08" ? [join(DATA_DIR, "morning-dew-analysis.json")] : []),
    // Try by audio file name (strip .mp3, add -analysis.json)
    join(DATA_DIR, song.audioFile.replace(/\.mp3$/, "-analysis.json")),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Build a synthetic analysis for songs without real analysis data.
 * Uses the song's position in the show to estimate energy characteristics.
 */
function buildMockAnalysis(song: SetlistEntry): TrackAnalysis {
  // Rough heuristics based on set position
  const isSet2 = song.set === 2;
  const baseEnergy = isSet2 ? 0.18 : 0.14;
  const trackFactor = song.trackNumber / 12; // position within set

  const totalFrames = 10000; // ~5.5 min placeholder
  const frames = [];
  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    const energy = baseEnergy + Math.sin(t * Math.PI * 4) * 0.05 + trackFactor * 0.03;
    frames.push({
      rms: Math.max(0, Math.min(1, energy)),
      centroid: 0.3 + trackFactor * 0.1,
      onset: Math.random() > 0.9 ? 0.5 : 0,
      beat: i % 15 === 0,
      sub: 0.05 + (isSet2 ? 0.02 : 0),
      low: 0.08,
      mid: energy * 2,
      high: 0.15 + trackFactor * 0.05,
      chroma: [0.5, 0.3, 0.4, 0.3, 0.5, 0.4, 0.3, 0.5, 0.3, 0.4, 0.3, 0.5] as [number, number, number, number, number, number, number, number, number, number, number, number],
      contrast: [0.1, 0.2, 0.15, 0.18, 0.12, 0.1, 0.08] as [number, number, number, number, number, number, number],
      flatness: 0.05 + trackFactor * 0.02,
    });
  }

  return {
    meta: {
      source: song.audioFile,
      duration: totalFrames / 30,
      fps: 30,
      sr: 22050,
      hopLength: 735,
      totalFrames,
      tempo: isSet2 ? 130 : 115,
      sections: [
        { frameStart: 0, frameEnd: totalFrames, label: "section_0", energy: isSet2 ? "mid" : "low", avgEnergy: baseEnergy },
      ],
    },
    frames,
  };
}

// ─── Run selection ───
const schedule: OverlaySchedule = {
  generatedAt: new Date().toISOString(),
  songs: {},
};

let history = emptyHistory();
let songsWithAnalysis = 0;
let songsWithMock = 0;

for (const song of setlist.songs) {
  const analysisPath = findAnalysisFile(song);
  let analysis: TrackAnalysis;

  if (analysisPath) {
    analysis = JSON.parse(readFileSync(analysisPath, "utf-8")) as TrackAnalysis;
    songsWithAnalysis++;
  } else if (useMock) {
    analysis = buildMockAnalysis(song);
    songsWithMock++;
  } else {
    console.log(`  SKIP ${song.trackId} "${song.title}" — no analysis file`);
    continue;
  }

  const profile = buildSongProfile(song, analysis);
  const result = selectOverlays(profile, history, song.overlayOverrides, showSeed);

  schedule.songs[song.trackId] = {
    title: song.title,
    activeOverlays: result.activeOverlays,
    totalCount: result.totalCount,
  };

  if (verbose) {
    console.log(`  ${song.trackId} "${song.title}"`);
    console.log(`    Energy: ${profile.avgEnergy.toFixed(3)} (${profile.dominantEnergyBand})`);
    console.log(`    Centroid: ${profile.avgCentroid.toFixed(3)}, Flatness: ${profile.avgFlatness.toFixed(3)}`);
    console.log(`    Selected: ${result.totalCount} overlays (weight: ${result.totalWeight})`);
    console.log(`    Overlays: ${result.activeOverlays.slice(0, 10).join(", ")}...`);
    console.log();
  } else {
    console.log(`  ${song.trackId} "${song.title}" → ${result.totalCount} overlays (weight: ${result.totalWeight})`);
  }

  history = pushHistory(history, result.activeOverlays);
}

// ─── Write output ───
const outPath = join(DATA_DIR, "overlay-schedule.json");
writeFileSync(outPath, JSON.stringify(schedule, null, 2));

console.log();
console.log(`Written: ${outPath}`);
console.log(`  Songs with analysis: ${songsWithAnalysis}`);
if (songsWithMock > 0) console.log(`  Songs with mock data: ${songsWithMock}`);
console.log(`  Songs in schedule: ${Object.keys(schedule.songs).length}`);
