#!/usr/bin/env npx tsx
/**
 * align-show.ts — Per-show CLI for WhisperX forced lyric alignment.
 *
 * Reads a show's setlist, automatically resolves lyrics from the database,
 * runs WhisperX alignment on each song.
 *
 * Usage:
 *   npx tsx packages/pipeline/src/align-show.ts --show=1977-05-08
 *   npx tsx packages/pipeline/src/align-show.ts --show=1977-05-08 --track=s2t03
 *   npx tsx packages/pipeline/src/align-show.ts --show=1977-05-08 --force
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { alignLyrics } from './audio/whisperx-sidecar.js';
import { loadLyrics, findCatalogEntry } from './audio/lyrics-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..', '..');
const VISUALIZER_DIR = resolve(ROOT_DIR, 'visualizer-poc');
const LYRICS_DIR = resolve(ROOT_DIR, '..', 'data', 'lyrics');
const OUTPUT_DIR = resolve(VISUALIZER_DIR, 'data', 'lyrics');

interface SetlistEntry {
  trackId: string;
  title: string;
  audioFile: string;
}

interface Setlist {
  date: string;
  venue: string;
  songs: SetlistEntry[];
}

// ─── CLI args ───

const args = process.argv.slice(2);
const showArg = args.find(a => a.startsWith('--show='))?.slice(7);
const trackArg = args.find(a => a.startsWith('--track='))?.slice(8);
const force = args.includes('--force');

if (!showArg) {
  console.error('Usage: align-show.ts --show=1977-05-08 [--track=s2t03] [--force]');
  process.exit(1);
}

// ─── Main ───

async function main() {
  const setlistPath = resolve(VISUALIZER_DIR, 'data', 'setlist.json');
  if (!existsSync(setlistPath)) {
    console.error(`Setlist not found: ${setlistPath}`);
    process.exit(1);
  }

  const setlist: Setlist = JSON.parse(readFileSync(setlistPath, 'utf-8'));
  console.log(`Aligning show: ${setlist.date} — ${setlist.venue}\n`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Audio file directory (resolve from setlist audio paths)
  const audioDir = resolve(VISUALIZER_DIR, 'public', 'audio');

  let songs = setlist.songs;
  if (trackArg) {
    songs = songs.filter(s => s.trackId === trackArg);
    if (songs.length === 0) {
      console.error(`Track ${trackArg} not found in setlist`);
      process.exit(1);
    }
  }

  let aligned = 0;
  let skippedInstrumental = 0;
  let skippedExisting = 0;
  let skippedNoLyrics = 0;
  let failed = 0;

  for (const song of songs) {
    const outPath = resolve(OUTPUT_DIR, `${song.trackId}-alignment.json`);

    // Skip if already aligned (unless --force)
    if (!force && existsSync(outPath)) {
      console.log(`  ○ ${song.trackId} (${song.title}) — exists, skipped`);
      skippedExisting++;
      continue;
    }

    // Check if instrumental
    const catalogEntry = findCatalogEntry(song.title, LYRICS_DIR);
    if (catalogEntry?.instrumental) {
      console.log(`  ○ ${song.trackId} (${song.title}) — instrumental, skipped`);
      skippedInstrumental++;
      continue;
    }

    // Load lyrics
    const lyrics = loadLyrics(song.title, LYRICS_DIR);
    if (!lyrics) {
      console.log(`  ○ ${song.trackId} (${song.title}) — no lyrics found`);
      skippedNoLyrics++;
      continue;
    }

    // Resolve audio path
    const audioPath = resolve(audioDir, song.audioFile);
    if (!existsSync(audioPath)) {
      console.log(`  ✗ ${song.trackId} (${song.title}) — audio file not found: ${audioPath}`);
      failed++;
      continue;
    }

    // Run WhisperX alignment
    try {
      console.log(`  ⏳ ${song.trackId} (${song.title}) — aligning...`);
      const alignment = alignLyrics(audioPath, lyrics, song.title, song.trackId);
      writeFileSync(outPath, JSON.stringify(alignment, null, 2), 'utf-8');
      console.log(`  ✓ ${song.trackId} (${song.title}) — ${alignment.words.length} words aligned`);
      aligned++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${song.trackId} (${song.title}) — alignment failed: ${msg}`);
      failed++;
    }
  }

  console.log(`\nSummary: ${aligned} aligned, ${skippedExisting} existing, ${skippedInstrumental} instrumental, ${skippedNoLyrics} no lyrics, ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
