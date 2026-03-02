#!/usr/bin/env npx tsx
/**
 * clean-alignment.ts — Post-processes Deepgram alignment data.
 *
 * Removes non-lyric content that Deepgram transcribed from crowd noise,
 * applause, between-song banter, and instrumental sections where the
 * model hallucinated speech from music.
 *
 * Cleaning passes:
 *   1. Remove known non-lyric words (applause, cheers, thank, etc.)
 *   2. Remove trailing words after music ends (applause/tuning section)
 *   3. Remove isolated low-confidence words surrounded by large gaps
 *   4. Remove words where Deepgram clearly hallucinated during instrumentals
 *
 * Usage:
 *   npx tsx packages/pipeline/scripts/clean-alignment.ts
 *   npx tsx packages/pipeline/scripts/clean-alignment.ts --track=s2t03
 *   npx tsx packages/pipeline/scripts/clean-alignment.ts --dry-run
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VISUALIZER_DIR = resolve(__dirname, '..', '..', 'visualizer-poc');
const ALIGNMENT_DIR = resolve(VISUALIZER_DIR, 'data', 'lyrics');
const TRACKS_DIR = resolve(VISUALIZER_DIR, 'data', 'tracks');

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

interface TrackMeta {
  duration: number;
  sections: Array<{ frameStart: number; frameEnd: number; energy: string }>;
}

// ─── CLI ───

const args = process.argv.slice(2);
const trackArg = args.find(a => a.startsWith('--track='))?.slice(8);
const dryRun = args.includes('--dry-run');

// ─── Non-lyric word filter ───

// Words that are NEVER lyrics — always remove regardless of context
const ALWAYS_REMOVE = new Set([
  'applause', 'cheers', 'cheering', 'clapping', 'clap',
  'laughter', 'laughing',
]);

// Words that are only non-lyric when isolated (gap > 5s) or low confidence
const NON_LYRIC_WORDS = new Set([
  'wooo', 'woooo', 'woohoo', 'wahoo',
  'yay', 'whew',
  'uh', 'um', 'hmm', 'hm', 'mmm', 'mm',
  'ah', 'aah', 'ohh', 'ooh',
]);

// Words that are only non-lyric at the END of a song (last 30s)
const END_ONLY_FILTER = new Set([
  'thank', 'thanks', 'thankyou', 'goodnight', 'good', 'night',
  'applause', 'cheers', 'cheering', 'clapping',
]);

// ─── Cleaning passes ───

function findMusicEndTime(trackId: string): number | null {
  const analysisPath = resolve(TRACKS_DIR, `${trackId}-analysis.json`);
  if (!existsSync(analysisPath)) return null;

  try {
    // Read just the meta section (avoid loading full frames array)
    const raw = readFileSync(analysisPath, 'utf-8');
    const metaMatch = raw.match(/"duration"\s*:\s*([\d.]+)/);
    if (metaMatch) return parseFloat(metaMatch[1]);
  } catch { /* ignore */ }
  return null;
}

function cleanAlignment(alignment: AlignmentFile): { cleaned: AlignmentFile; removed: number; reasons: Record<string, number> } {
  const reasons: Record<string, number> = {};
  const trackDuration = findMusicEndTime(alignment.trackId);

  function remove(reason: string) {
    reasons[reason] = (reasons[reason] || 0) + 1;
  }

  let words = [...alignment.words];
  const originalCount = words.length;

  // Pass 1: Remove empty/single-char garbage words
  words = words.filter(w => {
    if (w.word.length <= 1 && !['i', 'a', 'o'].includes(w.word)) {
      remove('single-char');
      return false;
    }
    return true;
  });

  // Pass 1.5: Remove words that are NEVER lyrics (applause, cheers, etc.)
  words = words.filter(w => {
    if (ALWAYS_REMOVE.has(w.word)) {
      remove('never-lyric');
      return false;
    }
    return true;
  });

  // Pass 2: Remove non-lyric words at end of song (last 30s)
  if (trackDuration) {
    const endThreshold = trackDuration - 30;
    words = words.filter(w => {
      if (w.start >= endThreshold && END_ONLY_FILTER.has(w.word)) {
        remove('end-of-song-noise');
        return false;
      }
      return true;
    });
  }

  // Pass 3: Remove isolated low-confidence words in large gaps
  // A word is "isolated" if there's >15s gap before AND after it, AND score < 0.2
  const filtered: AlignedWord[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prevEnd = i > 0 ? words[i - 1].end : 0;
    const nextStart = i < words.length - 1 ? words[i + 1].start : (trackDuration || w.end + 100);
    const gapBefore = w.start - prevEnd;
    const gapAfter = nextStart - w.end;

    if (w.score < 0.15 && gapBefore > 15 && gapAfter > 15) {
      remove('isolated-low-conf');
      continue;
    }

    // Also remove filler words (uh, um, etc.) that aren't part of vocal phrases
    if (NON_LYRIC_WORDS.has(w.word) && !['oh', 'no'].includes(w.word)) {
      // Only remove if isolated (gap > 5s on both sides) or very low confidence
      if ((gapBefore > 5 && gapAfter > 5) || w.score < 0.15) {
        remove('non-lyric-word');
        continue;
      }
    }

    filtered.push(w);
  }
  words = filtered;

  // Pass 4: Remove trailing silence/noise — find the last cluster of real lyrics
  // If there's a gap of >60s at the end with only scattered low-conf words, trim them
  if (words.length > 10) {
    let lastSolidIdx = words.length - 1;
    for (let i = words.length - 1; i > 0; i--) {
      const gapAfter = (i < words.length - 1) ? words[i + 1].start - words[i].end : 0;
      if (gapAfter > 60 && words.slice(i + 1).every(w => w.score < 0.3)) {
        lastSolidIdx = i;
        const trimmed = words.length - 1 - i;
        if (trimmed > 0) remove(`trailing-noise(${trimmed})`);
        break;
      }
    }
    words = words.slice(0, lastSolidIdx + 1);
  }

  return {
    cleaned: { ...alignment, words },
    removed: originalCount - words.length,
    reasons,
  };
}

// ─── Main ───

function main() {
  console.log('\nCleaning Deepgram alignment data\n');

  const files = trackArg
    ? [`${trackArg}-alignment.json`]
    : readdirSync(ALIGNMENT_DIR)
        .filter((f: string) => f.endsWith('-alignment.json'));

  let totalRemoved = 0;
  let totalWords = 0;

  for (const file of files) {
    const filePath = resolve(ALIGNMENT_DIR, file);
    if (!existsSync(filePath)) {
      console.log(`  ✗ ${file} — not found`);
      continue;
    }

    const alignment: AlignmentFile = JSON.parse(readFileSync(filePath, 'utf-8'));

    // Skip non-Deepgram files
    if (!alignment.source?.startsWith('deepgram-')) {
      console.log(`  ○ ${file} — not Deepgram data, skipped`);
      continue;
    }

    const { cleaned, removed, reasons } = cleanAlignment(alignment);
    totalRemoved += removed;
    totalWords += alignment.words.length;

    if (removed === 0) {
      console.log(`  ✓ ${alignment.trackId} (${alignment.songName}) — ${alignment.words.length} words, clean`);
      continue;
    }

    const reasonStr = Object.entries(reasons).map(([k, v]) => `${k}:${v}`).join(', ');
    console.log(`  ✓ ${alignment.trackId} (${alignment.songName}) — ${alignment.words.length}→${cleaned.words.length} words (removed ${removed}: ${reasonStr})`);

    if (!dryRun) {
      writeFileSync(filePath, JSON.stringify(cleaned, null, 2), 'utf-8');
    }
  }

  console.log(`\nTotal: ${totalRemoved} words removed from ${totalWords} (${dryRun ? 'DRY RUN' : 'written'})`);
}

main();
