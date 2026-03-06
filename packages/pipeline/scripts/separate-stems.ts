#!/usr/bin/env npx tsx
/**
 * separate-stems.ts — Demucs stem separation for live concert audio.
 *
 * Separates full-mix audio into 4 stems (vocals, drums, bass, other)
 * using the Demucs htdemucs model. Vocal stems improve Deepgram
 * alignment; bass/drum stems enable stem-specific visualizer features.
 *
 * Usage:
 *   npx tsx packages/pipeline/scripts/separate-stems.ts --show=1977-05-08
 *   npx tsx packages/pipeline/scripts/separate-stems.ts --show=1977-05-08 --track=s2t03
 *   npx tsx packages/pipeline/scripts/separate-stems.ts --show=1977-05-08 --force
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VISUALIZER_DIR = resolve(__dirname, '..', '..', 'visualizer-poc');
const AUDIO_DIR = resolve(VISUALIZER_DIR, 'public', 'audio');
const STEMS_DIR = resolve(__dirname, '..', '..', '..', 'data', 'stems');

// ─── Types ───

interface SetlistSong {
  trackId: string;
  title: string;
  audioFile: string;
}

interface Setlist {
  date: string;
  songs: SetlistSong[];
}

interface StemResult {
  ok: boolean;
  stems?: string[];
  elapsed?: number;
  error?: string;
}

// ─── CLI args ───

const args = process.argv.slice(2);
const trackArg = args.find(a => a.startsWith('--track='))?.slice(8);
const showArg = args.find(a => a.startsWith('--show='))?.slice(7);
const force = args.includes('--force');

if (!showArg) {
  console.error('Usage: separate-stems.ts --show=1977-05-08 [--track=s2t03] [--force]');
  process.exit(1);
}

// ─── Stem check ───

const CANONICAL_STEMS = ['vocals.wav', 'drums.wav', 'bass.wav', 'other.wav'];

function stemsExist(trackId: string): boolean {
  const stemDir = resolve(STEMS_DIR, trackId);
  return CANONICAL_STEMS.every(s => existsSync(resolve(stemDir, s)));
}

// ─── Process a single track ───

function processTrack(song: SetlistSong): 'separated' | 'skipped' | 'failed' {
  const { trackId, title, audioFile } = song;

  // Skip if all stems exist unless --force
  if (!force && stemsExist(trackId)) {
    console.log(`  ○ ${trackId} (${title}) — stems exist, skipped`);
    return 'skipped';
  }

  // Find audio file
  const audioPath = resolve(AUDIO_DIR, audioFile);
  if (!existsSync(audioPath)) {
    console.log(`  ✗ ${trackId} (${title}) — audio file not found: ${audioFile}`);
    return 'failed';
  }

  const outputDir = resolve(STEMS_DIR, trackId);
  const startTime = Date.now();
  console.log(`  ⋯ ${trackId} (${title}) — separating stems...`);

  try {
    const config = JSON.stringify({
      audioPath,
      outputDir,
      model: 'htdemucs',
    });

    const pythonScript = resolve(__dirname, 'separate_stems.py');
    const stdout = execFileSync('python3', [pythonScript], {
      input: config,
      encoding: 'utf-8',
      timeout: 600_000, // 10 minutes
      maxBuffer: 50 * 1024 * 1024,
    });

    const result: StemResult = JSON.parse(stdout.trim());
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!result.ok) {
      console.log(`  ✗ ${trackId} (${title}) — ${result.error} (${elapsed}s)`);
      return 'failed';
    }

    console.log(`  ✓ ${trackId} (${title}) — separated (${result.elapsed ?? elapsed}s)`);
    return 'separated';
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`  ✗ ${trackId} (${title}) — failed after ${elapsed}s: ${err instanceof Error ? err.message : err}`);
    return 'failed';
  }
}

// ─── Main ───

function main() {
  console.log('\nDemucs Stem Separation\n');

  const setlistPath = resolve(VISUALIZER_DIR, 'data', 'setlist.json');
  if (!existsSync(setlistPath)) {
    console.error('Error: setlist.json not found at', setlistPath);
    process.exit(1);
  }

  const setlist: Setlist = JSON.parse(readFileSync(setlistPath, 'utf-8'));
  let songs = setlist.songs;

  // Filter to single track if specified
  if (trackArg) {
    const song = songs.find(s => s.trackId === trackArg);
    if (!song) {
      console.error(`Error: track ${trackArg} not found in setlist`);
      process.exit(1);
    }
    songs = [song];
  }

  console.log(`  Show: ${setlist.date}`);
  console.log(`  Tracks: ${songs.length}${trackArg ? ` (filtered to ${trackArg})` : ''}`);
  console.log(`  Force: ${force}`);
  console.log(`  Output: ${STEMS_DIR}`);
  console.log('');

  let separated = 0;
  let skipped = 0;
  let failed = 0;

  // Sequential processing — Demucs is memory-intensive
  for (const song of songs) {
    const result = processTrack(song);
    if (result === 'separated') separated++;
    else if (result === 'skipped') skipped++;
    else failed++;
  }

  console.log(`\nDone: ${separated} separated, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
