#!/usr/bin/env npx tsx
/**
 * detect-vocal-sections.ts — Heuristic vocal section detector.
 *
 * Generates test alignment JSON from existing Librosa analysis data + lyrics.
 * Uses spectral features to distinguish vocals from instrumental sections,
 * then assigns lyric lines to detected vocal regions.
 *
 * Output is imprecise (±1-2 seconds) but sufficient for trigger testing —
 * the pre_roll_seconds buffer absorbs timing errors.
 *
 * Usage:
 *   npx tsx packages/pipeline/scripts/detect-vocal-sections.ts --track=s2t03
 *   npx tsx packages/pipeline/scripts/detect-vocal-sections.ts --show=1977-05-08
 *   npx tsx packages/pipeline/scripts/detect-vocal-sections.ts --show=1977-05-08 --force
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VISUALIZER_DIR = resolve(__dirname, '..', '..', 'visualizer-poc');
const TRACKS_DIR = resolve(VISUALIZER_DIR, 'data', 'tracks');
const LYRICS_DIR = resolve(__dirname, '..', '..', '..', 'data', 'lyrics');
const OUTPUT_DIR = resolve(VISUALIZER_DIR, 'data', 'lyrics');

interface FrameData {
  rms: number;
  mid: number;
  flatness: number;
  contrast: number[];
}

interface TrackMeta {
  source: string;
  totalFrames: number;
  tempo: number;
}

interface TrackAnalysis {
  meta: TrackMeta;
  frames: FrameData[];
}

interface SetlistEntry {
  trackId: string;
  title: string;
}

interface Setlist {
  songs: SetlistEntry[];
}

interface AlignedWord {
  word: string;
  start: number;
  end: number;
  score: number;
}

interface AlignmentOutput {
  songName: string;
  trackId: string;
  source: string;
  words: AlignedWord[];
}

// ─── CLI args ───

const args = process.argv.slice(2);
const trackArg = args.find(a => a.startsWith('--track='))?.slice(8);
const showArg = args.find(a => a.startsWith('--show='))?.slice(7);
const force = args.includes('--force');

if (!trackArg && !showArg) {
  console.error('Usage: detect-vocal-sections.ts --track=s2t03 | --show=1977-05-08 [--force]');
  process.exit(1);
}

// ─── Vocal Detection ───

interface VocalRegion {
  startFrame: number;
  endFrame: number;
  avgScore: number;
}

function detectVocalRegions(frames: FrameData[], fps = 30): VocalRegion[] {
  const SMOOTH_WINDOW = Math.round(fps * 1.5); // 1.5s Gaussian window
  const THRESHOLD = 0.45;
  const MERGE_GAP = Math.round(fps * 2); // 2s gap to merge
  const MIN_DURATION = Math.round(fps * 3); // 3s minimum

  // Step 1: Compute per-frame vocal likelihood score
  const scores: number[] = new Array(frames.length);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const mid = f.mid ?? 0;
    const flatness = f.flatness ?? 0.5;
    const contrast3 = f.contrast?.[3] ?? 0;
    const contrast4 = f.contrast?.[4] ?? 0;

    scores[i] = mid * 0.4 + (1 - flatness) * 0.3 + contrast3 * 0.15 + contrast4 * 0.15;
  }

  // Step 2: Gaussian smoothing
  const smoothed: number[] = new Array(frames.length);
  const sigma = SMOOTH_WINDOW * 0.5;
  for (let i = 0; i < frames.length; i++) {
    let sum = 0;
    let weightSum = 0;
    const lo = Math.max(0, i - SMOOTH_WINDOW);
    const hi = Math.min(frames.length - 1, i + SMOOTH_WINDOW);
    for (let j = lo; j <= hi; j++) {
      const dist = j - i;
      const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      sum += scores[j] * weight;
      weightSum += weight;
    }
    smoothed[i] = weightSum > 0 ? sum / weightSum : 0;
  }

  // Step 3: Threshold → vocal frames
  const isVocal: boolean[] = smoothed.map(s => s > THRESHOLD);

  // Step 4: Extract contiguous regions
  const rawRegions: VocalRegion[] = [];
  let regionStart = -1;
  for (let i = 0; i < isVocal.length; i++) {
    if (isVocal[i] && regionStart === -1) {
      regionStart = i;
    } else if (!isVocal[i] && regionStart !== -1) {
      const avgScore = smoothed.slice(regionStart, i).reduce((a, b) => a + b, 0) / (i - regionStart);
      rawRegions.push({ startFrame: regionStart, endFrame: i, avgScore });
      regionStart = -1;
    }
  }
  if (regionStart !== -1) {
    const avgScore = smoothed.slice(regionStart).reduce((a, b) => a + b, 0) / (frames.length - regionStart);
    rawRegions.push({ startFrame: regionStart, endFrame: frames.length, avgScore });
  }

  // Step 5: Merge regions within MERGE_GAP
  const merged: VocalRegion[] = [];
  for (const region of rawRegions) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (region.startFrame - prev.endFrame <= MERGE_GAP) {
        prev.endFrame = region.endFrame;
        prev.avgScore = (prev.avgScore + region.avgScore) / 2;
        continue;
      }
    }
    merged.push({ ...region });
  }

  // Step 6: Filter too-short regions
  return merged.filter(r => (r.endFrame - r.startFrame) >= MIN_DURATION);
}

// ─── Lyrics → Words ───

function lyricsToWords(lyrics: string): string[] {
  return lyrics
    .split(/\n+/)
    .flatMap(line => line.split(/\s+/))
    .filter(w => w.length > 0);
}

function lyricsToLines(lyrics: string): string[][] {
  return lyrics
    .split(/\n+/)
    .map(line => line.split(/\s+/).filter(w => w.length > 0))
    .filter(line => line.length > 0);
}

// ─── Build Alignment ───

function buildAlignment(
  songName: string,
  trackId: string,
  regions: VocalRegion[],
  lyrics: string,
  fps = 30,
): AlignmentOutput {
  const lines = lyricsToLines(lyrics);
  const words: AlignedWord[] = [];

  // Assign lyric lines to vocal regions sequentially
  let lineIdx = 0;
  for (const region of regions) {
    if (lineIdx >= lines.length) break;

    const regionStartSec = region.startFrame / fps;
    const regionDuration = (region.endFrame - region.startFrame) / fps;
    const line = lines[lineIdx];
    const wordDuration = regionDuration / line.length;

    for (let i = 0; i < line.length; i++) {
      const start = regionStartSec + i * wordDuration;
      const end = start + wordDuration * 0.8; // 80% of slot for word, 20% gap
      words.push({
        word: line[i].toLowerCase().replace(/[^a-z']/g, ''),
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000,
        score: Math.round(region.avgScore * 100) / 100,
      });
    }

    lineIdx++;
  }

  return {
    songName,
    trackId,
    source: 'heuristic-vocal-detection',
    words,
  };
}

// ─── Song title → lyrics slug resolution ───

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function findLyrics(songTitle: string): string | null {
  const catalogPath = resolve(LYRICS_DIR, 'song-catalog.json');
  if (!existsSync(catalogPath)) return null;

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  const normalized = normalizeForMatch(songTitle);

  for (const entry of catalog.songs) {
    if (entry.instrumental) continue;
    if (normalizeForMatch(entry.title) === normalized) {
      const filePath = resolve(LYRICS_DIR, `${entry.slug}.txt`);
      if (existsSync(filePath)) return readFileSync(filePath, 'utf-8').trim();
    }
    for (const alias of entry.aliases) {
      if (normalizeForMatch(alias) === normalized) {
        const filePath = resolve(LYRICS_DIR, `${entry.slug}.txt`);
        if (existsSync(filePath)) return readFileSync(filePath, 'utf-8').trim();
      }
    }
  }

  // Fallback: try slug directly
  const slug = songTitle
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const filePath = resolve(LYRICS_DIR, `${slug}.txt`);
  if (existsSync(filePath)) return readFileSync(filePath, 'utf-8').trim();

  return null;
}

// ─── Process a single track ───

function processTrack(trackId: string, songTitle: string): boolean {
  const analysisPath = resolve(TRACKS_DIR, `${trackId}-analysis.json`);
  const outPath = resolve(OUTPUT_DIR, `${trackId}-alignment.json`);

  if (!force && existsSync(outPath)) {
    console.log(`  ○ ${trackId} (${songTitle}) — exists, skipped`);
    return false;
  }

  if (!existsSync(analysisPath)) {
    console.log(`  ✗ ${trackId} (${songTitle}) — no analysis data`);
    return false;
  }

  const lyrics = findLyrics(songTitle);
  if (!lyrics) {
    console.log(`  ○ ${trackId} (${songTitle}) — no lyrics found`);
    return false;
  }

  const analysis: TrackAnalysis = JSON.parse(readFileSync(analysisPath, 'utf-8'));
  const regions = detectVocalRegions(analysis.frames);

  if (regions.length === 0) {
    console.log(`  ✗ ${trackId} (${songTitle}) — no vocal regions detected`);
    return false;
  }

  const alignment = buildAlignment(songTitle, trackId, regions, lyrics);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(outPath, JSON.stringify(alignment, null, 2), 'utf-8');
  console.log(`  ✓ ${trackId} (${songTitle}) — ${alignment.words.length} words, ${regions.length} vocal regions`);
  return true;
}

// ─── Main ───

function main() {
  console.log('Detecting vocal sections...\n');

  if (trackArg) {
    // Single track mode — need to look up title from setlist
    const setlistPath = resolve(VISUALIZER_DIR, 'data', 'setlist.json');
    if (!existsSync(setlistPath)) {
      console.error('setlist.json not found');
      process.exit(1);
    }
    const setlist: Setlist = JSON.parse(readFileSync(setlistPath, 'utf-8'));
    const song = setlist.songs.find(s => s.trackId === trackArg);
    const title = song?.title ?? trackArg;
    processTrack(trackArg, title);
    return;
  }

  // Show mode — process all tracks in setlist
  const setlistPath = resolve(VISUALIZER_DIR, 'data', 'setlist.json');
  if (!existsSync(setlistPath)) {
    console.error('setlist.json not found');
    process.exit(1);
  }

  const setlist: Setlist = JSON.parse(readFileSync(setlistPath, 'utf-8'));
  let aligned = 0;
  let skipped = 0;

  for (const song of setlist.songs) {
    if (processTrack(song.trackId, song.title)) {
      aligned++;
    } else {
      skipped++;
    }
  }

  console.log(`\nDone: ${aligned} aligned, ${skipped} skipped`);
}

main();
