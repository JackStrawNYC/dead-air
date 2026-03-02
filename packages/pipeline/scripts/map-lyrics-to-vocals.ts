#!/usr/bin/env npx tsx
/**
 * map-lyrics-to-vocals.ts — Hybrid lyrics mapper.
 *
 * Takes Deepgram timestamps (WHEN vocals happen) and correct lyrics text files
 * (WHAT is being sung) to produce accurate lyric alignment data.
 *
 * The problem: Deepgram can detect when vocals occur in live concert recordings,
 * but it frequently mis-transcribes the actual words (music drowns vocals).
 * The lyrics .txt files have the correct words but no timing data.
 *
 * This script merges both: Deepgram timing + lyrics text = accurate alignment.
 *
 * Algorithm:
 *   1. Extract vocal regions from Deepgram alignment (clusters of words with gaps < 4s)
 *   2. Read correct lyrics from data/lyrics/{slug}.txt
 *   3. Split lyrics into lines, map lines to vocal regions sequentially
 *   4. Distribute words within each line evenly across the region's time window
 *   5. Output alignment JSON with source: "mapped-lyrics"
 *
 * Usage:
 *   npx tsx packages/pipeline/scripts/map-lyrics-to-vocals.ts --show=1977-05-08
 *   npx tsx packages/pipeline/scripts/map-lyrics-to-vocals.ts --show=1977-05-08 --track=s2t03
 *   npx tsx packages/pipeline/scripts/map-lyrics-to-vocals.ts --show=1977-05-08 --force
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VISUALIZER_DIR = resolve(__dirname, '..', '..', 'visualizer-poc');
const ALIGNMENT_DIR = resolve(VISUALIZER_DIR, 'data', 'lyrics');
const LYRICS_DIR = resolve(__dirname, '..', '..', '..', 'data', 'lyrics');
const CATALOG_PATH = resolve(LYRICS_DIR, 'song-catalog.json');

// ─── Types ───

interface AlignedWord {
  word: string;
  start: number;
  end: number;
  score: number;
}

interface AlignmentFile {
  songName: string;
  trackId: string;
  source: string;
  words: AlignedWord[];
}

interface VocalRegion {
  start: number;    // start time of first word in region
  end: number;      // end time of last word in region
  wordCount: number; // how many Deepgram words in this region
  words: AlignedWord[]; // the actual Deepgram words with their timestamps
}

interface SetlistSong {
  trackId: string;
  title: string;
}

interface SongEntry {
  title: string;
  slug: string;
  instrumental: boolean;
  aliases: string[];
}

// ─── CLI ───

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const showArg = args.find(a => a.startsWith('--show='))?.slice(7);
const trackArg = args.find(a => a.startsWith('--track='))?.slice(8);
const gapThreshold = parseFloat(args.find(a => a.startsWith('--gap='))?.slice(6) || '4');

if (!showArg) {
  console.error('Usage: map-lyrics-to-vocals.ts --show=YYYY-MM-DD [--track=s2t03] [--force] [--gap=4]');
  process.exit(1);
}

// ─── Instrumental detection ───

const INSTRUMENTAL_TRACKS = new Set(['s1t09', 's2t07']); // Supplication, Drums/Space

// ─── Song catalog lookup ───

function loadCatalog(): SongEntry[] {
  if (!existsSync(CATALOG_PATH)) return [];
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')).songs;
}

function findSlug(catalog: SongEntry[], title: string): string | null {
  const norm = title.toLowerCase().replace(/['']/g, "'");

  // Direct title match
  let entry = catalog.find(s =>
    s.title.toLowerCase().replace(/['']/g, "'") === norm
  );
  if (entry) return entry.slug;

  // Alias match
  entry = catalog.find(s =>
    s.aliases.some(a => a.toLowerCase().replace(/['']/g, "'") === norm)
  );
  if (entry) return entry.slug;

  // Fuzzy: strip special chars
  const normSimple = norm.replace(/[^a-z0-9\s]/g, '');
  entry = catalog.find(s => {
    const ts = s.title.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    return ts === normSimple || ts.includes(normSimple) || normSimple.includes(ts);
  });
  return entry?.slug || null;
}

// ─── Core: Extract vocal regions from Deepgram data ───

function extractVocalRegions(words: AlignedWord[], gapSec: number): VocalRegion[] {
  if (words.length === 0) return [];

  const regions: VocalRegion[] = [];
  let regionWords: AlignedWord[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;

    if (gap > gapSec) {
      // Close current region, start new one
      regions.push({
        start: regionWords[0].start,
        end: regionWords[regionWords.length - 1].end,
        wordCount: regionWords.length,
        words: regionWords,
      });
      regionWords = [words[i]];
    } else {
      regionWords.push(words[i]);
    }
  }

  // Close last region
  regions.push({
    start: regionWords[0].start,
    end: regionWords[regionWords.length - 1].end,
    wordCount: regionWords.length,
    words: regionWords,
  });

  // Filter out tiny regions — likely crowd noise or Deepgram hallucinations
  return regions.filter(r => (r.end - r.start) >= 2.0 || r.wordCount >= 3);
}

// ─── Core: Read and parse lyrics ───

function loadLyrics(slug: string): string[] | null {
  const lyricsPath = resolve(LYRICS_DIR, `${slug}.txt`);
  if (!existsSync(lyricsPath)) return null;

  const raw = readFileSync(lyricsPath, 'utf-8').trim();

  // Skip placeholder files
  if (raw.startsWith('<!--') || raw.length < 10) return null;

  // Split into non-empty lines
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

// ─── Core: Map lyrics to vocal regions ───

function mapLyricsToRegions(
  lyricLines: string[],
  regions: VocalRegion[],
): AlignedWord[] {
  if (regions.length === 0 || lyricLines.length === 0) return [];

  const mappedWords: AlignedWord[] = [];

  // Strategy: distribute lyric lines across vocal regions proportionally
  // based on each region's Deepgram word count (how much vocal activity detected).
  // Then map each lyric word to the TIMESTAMP of the corresponding Deepgram word
  // so the rhythm follows the actual vocal cadence, not a mechanical even distribution.

  const totalDeepgramWords = regions.reduce((sum, r) => sum + r.wordCount, 0);

  // Assign lyric lines to regions proportionally
  let lyricIdx = 0;
  const regionAssignments: { region: VocalRegion; lines: string[] }[] = [];

  for (let r = 0; r < regions.length; r++) {
    const region = regions[r];
    const proportion = region.wordCount / totalDeepgramWords;
    let lineCount: number;

    if (r === regions.length - 1) {
      lineCount = lyricLines.length - lyricIdx;
    } else {
      lineCount = Math.max(1, Math.round(proportion * lyricLines.length));
      lineCount = Math.min(lineCount, lyricLines.length - lyricIdx);
    }

    if (lineCount <= 0 && lyricIdx < lyricLines.length) {
      lineCount = 0;
    }

    const lines = lyricLines.slice(lyricIdx, lyricIdx + lineCount);
    regionAssignments.push({ region, lines });
    lyricIdx += lineCount;
  }

  // Handle remaining lyrics: distribute to empty regions
  if (lyricIdx < lyricLines.length) {
    for (const assignment of regionAssignments) {
      if (lyricIdx >= lyricLines.length) break;
      if (assignment.lines.length === 0) {
        assignment.lines.push(lyricLines[lyricIdx]);
        lyricIdx++;
      }
    }
  }

  // Jam songs: cycle lyrics through empty regions
  let cycleIdx = 0;
  for (const assignment of regionAssignments) {
    if (assignment.lines.length === 0 && lyricLines.length > 0) {
      assignment.lines.push(lyricLines[cycleIdx % lyricLines.length]);
      cycleIdx++;
    }
  }

  // Map lyric words to Deepgram word timestamps.
  // Each lyric word inherits timing from the corresponding Deepgram word,
  // preserving the natural vocal cadence. When multiple lyric words map to
  // one Deepgram word, subdivide that word's time slot evenly.
  for (const { region, lines } of regionAssignments) {
    if (lines.length === 0) continue;

    const lyricWords = lines.flatMap(l => l.split(/\s+/).filter(w => w.length > 0));
    if (lyricWords.length === 0) continue;

    const dgWords = region.words;

    // Step 1: Assign each lyric word to a Deepgram word index
    const assignments: number[] = [];
    for (let i = 0; i < lyricWords.length; i++) {
      assignments.push(Math.min(
        Math.floor(i * dgWords.length / lyricWords.length),
        dgWords.length - 1,
      ));
    }

    // Step 2: For each Deepgram word, find all lyric words assigned to it
    // and subdivide its time slot
    let i = 0;
    while (i < lyricWords.length) {
      const dgIdx = assignments[i];
      // Count how many consecutive lyric words share this Deepgram word
      let count = 0;
      while (i + count < lyricWords.length && assignments[i + count] === dgIdx) {
        count++;
      }

      // Time slot: from this Deepgram word's start to the next word's start (or this word's end)
      const slotStart = dgWords[dgIdx].start;
      const slotEnd = dgIdx < dgWords.length - 1
        ? dgWords[dgIdx + 1].start
        : dgWords[dgIdx].end;
      const slotDuration = slotEnd - slotStart;

      // Subdivide among the lyric words sharing this slot
      for (let j = 0; j < count; j++) {
        const wordStart = slotStart + (j / count) * slotDuration;
        const wordEnd = slotStart + ((j + 1) / count) * slotDuration;

        mappedWords.push({
          word: lyricWords[i + j].toLowerCase().replace(/[^a-z0-9'''-]/g, ''),
          start: parseFloat(wordStart.toFixed(3)),
          end: parseFloat(wordEnd.toFixed(3)),
          score: 1.0,
        });
      }

      i += count;
    }
  }

  return mappedWords;
}

// ─── Main ───

async function main() {
  console.log('\nMapping lyrics to vocal regions\n');

  // Load setlist
  const setlistPath = resolve(VISUALIZER_DIR, 'data', 'setlist.json');
  if (!existsSync(setlistPath)) {
    console.error(`Setlist not found at ${setlistPath}`);
    process.exit(1);
  }
  const setlist = JSON.parse(readFileSync(setlistPath, 'utf-8'));
  const catalog = loadCatalog();

  let songs: SetlistSong[] = setlist.songs;

  // Filter to specific track
  if (trackArg) {
    songs = songs.filter(s => s.trackId === trackArg);
    if (songs.length === 0) {
      console.error(`Track ${trackArg} not found in setlist`);
      process.exit(1);
    }
  }

  let mapped = 0;
  let skipped = 0;
  let failed = 0;
  const results: Array<{ trackId: string; title: string; words: number; regions: number; status: string }> = [];

  for (const song of songs) {
    // Skip instrumentals
    if (INSTRUMENTAL_TRACKS.has(song.trackId)) {
      console.log(`  ○ ${song.trackId} ${song.title} (instrumental, skipped)`);
      skipped++;
      results.push({ trackId: song.trackId, title: song.title, words: 0, regions: 0, status: 'instrumental' });
      continue;
    }

    // Check for existing Deepgram alignment
    const alignmentPath = resolve(ALIGNMENT_DIR, `${song.trackId}-alignment.json`);
    if (!existsSync(alignmentPath)) {
      console.log(`  ✗ ${song.trackId} ${song.title} — no Deepgram alignment found`);
      failed++;
      results.push({ trackId: song.trackId, title: song.title, words: 0, regions: 0, status: 'no-alignment' });
      continue;
    }

    // Load alignment file
    const alignment: AlignmentFile = JSON.parse(readFileSync(alignmentPath, 'utf-8'));

    // If this is already a mapped file (not raw Deepgram), check for backup
    const backupPath = resolve(ALIGNMENT_DIR, `${song.trackId}-alignment-deepgram.json`);
    let deepgramData: AlignmentFile;

    if (alignment.source === 'mapped-lyrics') {
      // Already mapped — need the raw Deepgram backup to re-map
      if (!existsSync(backupPath)) {
        if (!force) {
          console.log(`  ○ ${song.trackId} ${song.title} (already mapped, skipped)`);
          skipped++;
          results.push({ trackId: song.trackId, title: song.title, words: alignment.words.length, regions: 0, status: 'existing' });
          continue;
        }
        console.log(`  ✗ ${song.trackId} ${song.title} — already mapped but no Deepgram backup found`);
        failed++;
        results.push({ trackId: song.trackId, title: song.title, words: 0, regions: 0, status: 'no-deepgram-backup' });
        continue;
      }
      deepgramData = JSON.parse(readFileSync(backupPath, 'utf-8'));
    } else {
      // Raw Deepgram data — save backup before overwriting
      writeFileSync(backupPath, JSON.stringify(alignment, null, 2), 'utf-8');
      deepgramData = alignment;
    }

    const outputPath = alignmentPath;

    // Find lyrics slug
    const slug = findSlug(catalog, song.title);
    if (!slug) {
      console.log(`  ✗ ${song.trackId} ${song.title} — not found in song catalog`);
      failed++;
      results.push({ trackId: song.trackId, title: song.title, words: 0, regions: 0, status: 'no-catalog' });
      continue;
    }

    // Load lyrics
    const lyricLines = loadLyrics(slug);
    if (!lyricLines) {
      console.log(`  ✗ ${song.trackId} ${song.title} — no lyrics file (${slug}.txt)`);
      failed++;
      results.push({ trackId: song.trackId, title: song.title, words: 0, regions: 0, status: 'no-lyrics' });
      continue;
    }

    // Extract vocal regions from Deepgram timing
    const regions = extractVocalRegions(deepgramData.words, gapThreshold);

    if (dryRun) {
      console.log(`  → ${song.trackId} ${song.title}: ${regions.length} vocal regions, ${lyricLines.length} lyric lines`);
      for (const r of regions) {
        console.log(`      ${r.start.toFixed(1)}s–${r.end.toFixed(1)}s (${r.wordCount} words, ${(r.end - r.start).toFixed(1)}s)`);
      }
      continue;
    }

    // Map lyrics to vocal regions
    const mappedWords = mapLyricsToRegions(lyricLines, regions);

    // Build output
    const output: AlignmentFile = {
      songName: song.title,
      trackId: song.trackId,
      source: 'mapped-lyrics',
      words: mappedWords,
    };

    writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`  ✓ ${song.trackId} ${song.title} — ${mappedWords.length} words mapped across ${regions.length} vocal regions`);
    mapped++;
    results.push({ trackId: song.trackId, title: song.title, words: mappedWords.length, regions: regions.length, status: 'mapped' });
  }

  // Summary
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Done: ${mapped} mapped, ${skipped} skipped, ${failed} failed`);

  if (results.length > 0 && !dryRun) {
    console.log(`\nResults:`);
    console.log(`${'─'.repeat(65)}`);
    const maxTitle = Math.max(...results.map(r => r.title.length));
    for (const r of results) {
      const pad = ' '.repeat(maxTitle - r.title.length);
      const regionStr = r.regions > 0 ? `${r.regions} regions` : '';
      console.log(`  ${r.trackId} ${r.title}${pad}  ${String(r.words).padStart(4)} words  ${regionStr.padEnd(11)} ${r.status}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
