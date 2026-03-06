#!/usr/bin/env npx tsx
/**
 * validate-lyrics.ts — Lyrics pipeline validation and quality audit.
 *
 * Audits lyrics coverage, stub detection, alignment quality, and duplicate
 * line detection across the lyrics pipeline.
 *
 * Usage:
 *   npx tsx packages/pipeline/scripts/validate-lyrics.ts
 *   npx tsx packages/pipeline/scripts/validate-lyrics.ts --show=1977-05-08
 *   npx tsx packages/pipeline/scripts/validate-lyrics.ts --verbose
 *   npx tsx packages/pipeline/scripts/validate-lyrics.ts --fix-stubs
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LYRICS_DIR = resolve(__dirname, '..', '..', '..', 'data', 'lyrics');
const CATALOG_PATH = resolve(LYRICS_DIR, 'song-catalog.json');
const VISUALIZER_DIR = resolve(__dirname, '..', '..', 'visualizer-poc');
const ALIGNMENT_DIR = resolve(VISUALIZER_DIR, 'data', 'lyrics');

// ─── Types ───

interface SongEntry {
  title: string;
  slug: string;
  instrumental: boolean;
  aliases: string[];
}

interface Catalog {
  songs: SongEntry[];
}

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

interface SetlistSong {
  trackId: string;
  title: string;
}

interface Setlist {
  date: string;
  songs: SetlistSong[];
}

type Severity = 'error' | 'warn' | 'pass';

interface CheckResult {
  check: string;
  song: string;
  severity: Severity;
  message: string;
}

// ─── CLI args ───

const args = process.argv.slice(2);
const showFilter = args.find(a => a.startsWith('--show='))?.slice(7);
const verbose = args.includes('--verbose');
const fixStubs = args.includes('--fix-stubs');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: validate-lyrics.ts [options]

Options:
  --show=YYYY-MM-DD   Only validate songs in that show's setlist
  --verbose           Show passing checks too, not just failures
  --fix-stubs         Print scraper commands for any stub files detected
  --help, -h          Show this help message
`);
  process.exit(0);
}

// ─── Helpers ───

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

function findCatalogEntry(catalog: Catalog, title: string): SongEntry | null {
  const norm = title.toLowerCase().replace(/['']/g, "'");

  let entry = catalog.songs.find(s =>
    s.title.toLowerCase().replace(/['']/g, "'") === norm
  );
  if (entry) return entry;

  entry = catalog.songs.find(s =>
    s.aliases.some(a => a.toLowerCase().replace(/['']/g, "'") === norm)
  );
  if (entry) return entry;

  const normSimple = norm.replace(/[^a-z0-9\s]/g, '');
  entry = catalog.songs.find(s => {
    const ts = s.title.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    return ts === normSimple || ts.includes(normSimple) || normSimple.includes(ts);
  });
  return entry || null;
}

// ─── Checks ───

function runCoverageCheck(catalog: Catalog, slugsToCheck: Set<string> | null): CheckResult[] {
  const results: CheckResult[] = [];

  const lyricsFiles = readdirSync(LYRICS_DIR)
    .filter(f => f.endsWith('.txt'))
    .map(f => f.replace('.txt', ''));
  const lyricsFileSet = new Set(lyricsFiles);

  const songsToCheck = slugsToCheck
    ? catalog.songs.filter(s => slugsToCheck.has(s.slug))
    : catalog.songs;

  const nonInstrumental = songsToCheck.filter(s => !s.instrumental);

  let missing = 0;
  for (const song of nonInstrumental) {
    if (!lyricsFileSet.has(song.slug)) {
      results.push({
        check: 'coverage',
        song: song.title,
        severity: 'error',
        message: `Missing lyrics file: ${song.slug}.txt`,
      });
      missing++;
    } else {
      results.push({
        check: 'coverage',
        song: song.title,
        severity: 'pass',
        message: `Lyrics file exists: ${song.slug}.txt`,
      });
    }
  }

  // Summary line (always shown)
  const totalCatalog = songsToCheck.length;
  const instrumentalCount = songsToCheck.filter(s => s.instrumental).length;
  const totalLyricsFiles = lyricsFiles.length;

  results.unshift({
    check: 'coverage-summary',
    song: '(all)',
    severity: missing > 0 ? 'error' : 'pass',
    message: `Catalog: ${totalCatalog} songs (${instrumentalCount} instrumental), Lyrics files: ${totalLyricsFiles}, Missing: ${missing}`,
  });

  return results;
}

function runStubCheck(catalog: Catalog, slugsToCheck: Set<string> | null): { results: CheckResult[]; stubs: string[] } {
  const results: CheckResult[] = [];
  const stubs: string[] = [];

  const songsToCheck = slugsToCheck
    ? catalog.songs.filter(s => slugsToCheck.has(s.slug))
    : catalog.songs;

  const nonInstrumental = songsToCheck.filter(s => !s.instrumental);

  for (const song of nonInstrumental) {
    const filePath = resolve(LYRICS_DIR, `${song.slug}.txt`);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const wc = wordCount(content);

    if (wc < 20) {
      results.push({
        check: 'stub',
        song: song.title,
        severity: 'error',
        message: `Stub file (${wc} words) — needs re-scraping: ${song.slug}.txt`,
      });
      stubs.push(song.slug);
    } else {
      results.push({
        check: 'stub',
        song: song.title,
        severity: 'pass',
        message: `${wc} words`,
      });
    }
  }

  return { results, stubs };
}

function runAlignmentCheck(catalog: Catalog, slugsToCheck: Set<string> | null, setlistSongs: SetlistSong[] | null): CheckResult[] {
  const results: CheckResult[] = [];

  if (!existsSync(ALIGNMENT_DIR)) {
    results.push({
      check: 'alignment',
      song: '(all)',
      severity: 'warn',
      message: `Alignment directory not found: ${ALIGNMENT_DIR}`,
    });
    return results;
  }

  const alignmentFiles = readdirSync(ALIGNMENT_DIR)
    .filter(f => f.endsWith('-alignment.json') && !f.endsWith('-deepgram.json'));

  for (const file of alignmentFiles) {
    const filePath = resolve(ALIGNMENT_DIR, file);
    let alignment: AlignmentFile;
    try {
      alignment = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      results.push({
        check: 'alignment',
        song: file,
        severity: 'error',
        message: `Failed to parse alignment file: ${file}`,
      });
      continue;
    }

    // If we have a setlist filter, only check tracks in that setlist
    if (setlistSongs) {
      const inSetlist = setlistSongs.some(s => s.trackId === alignment.trackId);
      if (!inSetlist) continue;
    }

    const alignmentWordCount = alignment.words.length;
    const songTitle = alignment.songName;

    // Check: minimum word count
    if (alignmentWordCount < 40) {
      results.push({
        check: 'alignment',
        song: `${alignment.trackId} ${songTitle}`,
        severity: 'error',
        message: `Alignment has only ${alignmentWordCount} words (minimum 40 for impactful display)`,
      });
    }

    // Find the source lyrics file to compare word counts
    const catalogEntry = findCatalogEntry(catalog, songTitle);
    if (!catalogEntry) {
      results.push({
        check: 'alignment',
        song: `${alignment.trackId} ${songTitle}`,
        severity: 'warn',
        message: `Cannot find catalog entry for "${songTitle}" — skipping word count comparison`,
      });
      continue;
    }

    if (slugsToCheck && !slugsToCheck.has(catalogEntry.slug)) continue;

    const lyricsPath = resolve(LYRICS_DIR, `${catalogEntry.slug}.txt`);
    if (!existsSync(lyricsPath)) {
      results.push({
        check: 'alignment',
        song: `${alignment.trackId} ${songTitle}`,
        severity: 'warn',
        message: `No source lyrics file (${catalogEntry.slug}.txt) to compare against`,
      });
      continue;
    }

    const lyricsContent = readFileSync(lyricsPath, 'utf-8');
    const lyricsWc = wordCount(lyricsContent);

    if (lyricsWc === 0) {
      results.push({
        check: 'alignment',
        song: `${alignment.trackId} ${songTitle}`,
        severity: 'warn',
        message: `Source lyrics file is empty — cannot compare`,
      });
      continue;
    }

    const divergence = Math.abs(alignmentWordCount - lyricsWc) / lyricsWc;

    if (divergence > 0.30) {
      results.push({
        check: 'alignment',
        song: `${alignment.trackId} ${songTitle}`,
        severity: 'error',
        message: `Word count divergence ${(divergence * 100).toFixed(0)}%: alignment has ${alignmentWordCount}, lyrics has ${lyricsWc} — timing may be off`,
      });
    } else {
      results.push({
        check: 'alignment',
        song: `${alignment.trackId} ${songTitle}`,
        severity: 'pass',
        message: `Alignment ${alignmentWordCount} words vs lyrics ${lyricsWc} words (${(divergence * 100).toFixed(0)}% divergence)`,
      });
    }
  }

  return results;
}

function runDuplicateLineCheck(catalog: Catalog, slugsToCheck: Set<string> | null): CheckResult[] {
  const results: CheckResult[] = [];

  const songsToCheck = slugsToCheck
    ? catalog.songs.filter(s => slugsToCheck.has(s.slug))
    : catalog.songs;

  const nonInstrumental = songsToCheck.filter(s => !s.instrumental);

  for (const song of nonInstrumental) {
    const filePath = resolve(LYRICS_DIR, `${song.slug}.txt`);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const lines = content
      .split('\n')
      .map(l => l.trim().toLowerCase())
      .filter(l => l.length > 0);

    const lineCounts = new Map<string, number>();
    for (const line of lines) {
      lineCounts.set(line, (lineCounts.get(line) || 0) + 1);
    }

    const excessiveDupes: string[] = [];
    for (const [line, count] of lineCounts) {
      if (count > 4) {
        excessiveDupes.push(`"${line}" x${count}`);
      }
    }

    if (excessiveDupes.length > 0) {
      results.push({
        check: 'duplicates',
        song: song.title,
        severity: 'warn',
        message: `Repeated lines (possible scraping artifact): ${excessiveDupes.join(', ')}`,
      });
    } else {
      results.push({
        check: 'duplicates',
        song: song.title,
        severity: 'pass',
        message: `No excessive duplicate lines`,
      });
    }
  }

  return results;
}

// ─── Output formatting ───

const ICONS: Record<Severity, string> = {
  pass: '[ok]',
  warn: '[!!]',
  error: '[XX]',
};

function printResults(title: string, results: CheckResult[]): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(70)}`);

  const filtered = verbose
    ? results
    : results.filter(r => r.severity !== 'pass');

  if (filtered.length === 0) {
    console.log(`  ${ICONS.pass} All checks passed.`);
    return;
  }

  // Find max song name length for alignment
  const maxSong = Math.max(...filtered.map(r => r.song.length), 10);

  for (const r of filtered) {
    const icon = ICONS[r.severity];
    const pad = ' '.repeat(Math.max(0, maxSong - r.song.length));
    console.log(`  ${icon} ${r.song}${pad}  ${r.message}`);
  }
}

// ─── Main ───

async function main() {
  console.log('\nLyrics Pipeline Validation');
  console.log(`${'─'.repeat(70)}`);

  // Load catalog
  if (!existsSync(CATALOG_PATH)) {
    console.error(`Song catalog not found at ${CATALOG_PATH}`);
    process.exit(1);
  }
  const catalog: Catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));

  // Determine which slugs to check
  let slugsToCheck: Set<string> | null = null;
  let setlistSongs: SetlistSong[] | null = null;

  if (showFilter) {
    const setlistPath = resolve(VISUALIZER_DIR, 'data', 'setlist.json');
    if (!existsSync(setlistPath)) {
      console.error(`Setlist not found at ${setlistPath}`);
      process.exit(1);
    }
    const setlist: Setlist = JSON.parse(readFileSync(setlistPath, 'utf-8'));
    setlistSongs = setlist.songs;

    slugsToCheck = new Set<string>();
    for (const sl of setlist.songs) {
      const entry = findCatalogEntry(catalog, sl.title);
      if (entry) {
        slugsToCheck.add(entry.slug);
      } else {
        console.log(`  [!!] "${sl.title}" not found in song catalog`);
      }
    }

    console.log(`Filtering to show ${showFilter}: ${slugsToCheck.size} songs from setlist`);
  } else {
    console.log(`Validating full catalog: ${catalog.songs.length} songs`);
  }

  // Run all checks
  const coverageResults = runCoverageCheck(catalog, slugsToCheck);
  const { results: stubResults, stubs } = runStubCheck(catalog, slugsToCheck);
  const alignmentResults = runAlignmentCheck(catalog, slugsToCheck, setlistSongs);
  const duplicateResults = runDuplicateLineCheck(catalog, slugsToCheck);

  // Print results
  printResults('1. Coverage Report', coverageResults);
  printResults('2. Stub Detection (<20 words)', stubResults);
  printResults('3. Alignment Quality Audit', alignmentResults);
  printResults('4. Duplicate Line Detection', duplicateResults);

  // Fix stubs output
  if (fixStubs && stubs.length > 0) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('  Re-scrape Commands for Stubs');
    console.log(`${'='.repeat(70)}`);
    for (const slug of stubs) {
      const entry = catalog.songs.find(s => s.slug === slug);
      const title = entry?.title || slug;
      console.log(`  npx tsx packages/pipeline/scripts/scrape-lyrics.ts --song="${title}" --force`);
    }
  }

  // Summary table
  const allResults = [...coverageResults, ...stubResults, ...alignmentResults, ...duplicateResults];
  const errors = allResults.filter(r => r.severity === 'error');
  const warnings = allResults.filter(r => r.severity === 'warn');
  const passes = allResults.filter(r => r.severity === 'pass');

  console.log(`\n${'='.repeat(70)}`);
  console.log('  Summary');
  console.log(`${'='.repeat(70)}`);
  console.log(`  [ok] Passed:   ${passes.length}`);
  console.log(`  [!!] Warnings: ${warnings.length}`);
  console.log(`  [XX] Errors:   ${errors.length}`);
  console.log(`${'─'.repeat(70)}`);

  if (errors.length > 0) {
    console.log(`\n  FAILED — ${errors.length} critical issue(s) found.\n`);
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log(`\n  PASSED with ${warnings.length} warning(s).\n`);
    process.exit(0);
  } else {
    console.log(`\n  PASSED — all checks clean.\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
