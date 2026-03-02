#!/usr/bin/env npx tsx
/**
 * scrape-lyrics.ts — Scrapes Grateful Dead lyrics from dead.net (official source).
 *
 * Uses the Drupal JSON API at dead.net to fetch official, Dead-sanctioned lyrics.
 * No API key needed — just hits the public JSON endpoint.
 *
 * URL pattern: https://www.dead.net/song/{slug}?_format=json
 * Lyrics live in: response.field_lyrics[0].value (HTML)
 *
 * Usage:
 *   npx tsx packages/pipeline/scripts/scrape-lyrics.ts
 *   npx tsx packages/pipeline/scripts/scrape-lyrics.ts --force
 *   npx tsx packages/pipeline/scripts/scrape-lyrics.ts --song="Fire on the Mountain"
 *   npx tsx packages/pipeline/scripts/scrape-lyrics.ts --show=1977-05-08
 *   npx tsx packages/pipeline/scripts/scrape-lyrics.ts --dry-run
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', '..', '..', 'data', 'lyrics');
const CATALOG_PATH = resolve(DATA_DIR, 'song-catalog.json');
const VISUALIZER_DIR = resolve(__dirname, '..', '..', 'visualizer-poc');

interface SongEntry {
  title: string;
  slug: string;
  instrumental: boolean;
  aliases: string[];
  deadNetSlug?: string;
}

interface Catalog {
  songs: SongEntry[];
}

interface SetlistSong {
  trackId: string;
  title: string;
}

interface Setlist {
  songs: SetlistSong[];
}

// ─── CLI args ───

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const songFilter = args.find(a => a.startsWith('--song='))?.slice(7);
const showFilter = args.find(a => a.startsWith('--show='))?.slice(7);

// ─── dead.net URL construction ───

/**
 * Drupal Pathauto stop words — stripped from URL slugs on dead.net.
 * Determined empirically from known dead.net song URLs.
 */
const DRUPAL_STOP_WORDS = new Set([
  'a', 'an', 'the', 'on', 'in', 'of', 'to', 'and', 'or',
  'is', 'at', 'by', 'for', 'from', 'with',
]);

/**
 * Build a dead.net slug from a song title.
 * Dead.net uses Drupal Pathauto which strips common English stop words.
 *
 * Examples:
 *   "Fire on the Mountain"  → "fire-mountain"
 *   "Dancin' in the Streets" → "dancin-streets"
 *   "Not Fade Away"         → "not-fade-away" (not all words are stop words)
 */
function buildDeadNetSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, '')           // strip apostrophes
    .replace(/\(.*?\)/g, '')        // remove parentheticals
    .replace(/[^a-z0-9\s-]/g, '')   // strip special chars
    .trim()
    .split(/\s+/)
    .filter(w => !DRUPAL_STOP_WORDS.has(w))
    .join('-')
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^-|-$/g, '');         // trim leading/trailing hyphens
}

/**
 * Override map for songs whose dead.net slug doesn't follow standard Pathauto rules.
 * Key = catalog slug (used for lyrics filename), Value = dead.net URL slug.
 */
const DEAD_NET_SLUG_OVERRIDES: Record<string, string> = {
  // Songs where Drupal computed a non-obvious slug
  'minglewood-blues': 'new-minglewood-blues',
  'dancin-in-the-streets': 'dancin-streets',
  'st-stephen': 'saint-stephen',
  'saint-stephen': 'saint-stephen',
  'i-know-you-rider': 'i-know-you-rider',
  'us-blues': 'u-s-blues',
  'goin-down-the-road-feeling-bad': 'goin-down-road-feelin-bad',
  'baba-oriley': 'baba-oriley',
};

// ─── dead.net API ───

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

interface DeadNetResponse {
  title?: Array<{ value: string }>;
  field_lyrics?: Array<{ value: string; processed: string }>;
  field_lyrics_by?: Array<{ value: string } | { target_id: number }>;
  field_music_by?: Array<{ value: string } | { target_id: number }>;
}

async function fetchFromDeadNet(slug: string): Promise<string | null> {
  const url = `https://www.dead.net/song/${slug}?_format=json`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) return null;

  const data: DeadNetResponse = await res.json();

  // Extract lyrics from field_lyrics[0].value (HTML format)
  const lyricsHtml = data.field_lyrics?.[0]?.value
    || data.field_lyrics?.[0]?.processed;

  if (!lyricsHtml) return null;

  // dead.net marks cover songs with "Lyrics not available"
  if (lyricsHtml.includes('Lyrics not available') || lyricsHtml.includes('lyrics not available')) {
    return null;
  }

  return cleanDeadNetHtml(lyricsHtml);
}

/**
 * Clean dead.net lyrics HTML to plain text.
 * Dead.net uses <p class="verse">, <p class="chorus">, <br /> for structure.
 * Also has annotation footnotes like (1), (2) that we strip.
 */
function cleanDeadNetHtml(html: string): string {
  return html
    // Verse/chorus paragraph breaks → double newline
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    // Opening/closing p tags
    .replace(/<\/?p[^>]*>/gi, '')
    // <br> → newline
    .replace(/<br\s*\/?>/gi, '\n')
    // Strip all remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '...')
    // Strip annotation footnote markers: (note 1), (Note 4), (1), (2), etc.
    // Use [^\S\n]* instead of \s* to avoid eating newlines
    .replace(/[^\S\n]*\(note\s*\d+\)[^\S\n]*/gi, '')
    .replace(/[^\S\n]*\(\d+\)[^\S\n]*/g, '')
    // Strip performer markers inline: [All], [Jerry], [Bob], etc.
    .replace(/\[(?:All|Jerry|Bob|Phil|Both|Donna|Keith|Weir|Garcia|Everyone)\]\s*/gi, '')
    // Strip repeat/section markers: [repeat etc], [chorus], [verse], etc.
    .replace(/\[(?:repeat|chorus|verse|bridge|instrumental|outro|intro|refrain)[^\]]*\]/gi, '')
    // Strip section dividers: -----(William Tell Bridge)-----
    .replace(/^-{2,}\s*\(.*?\)\s*-{2,}$/gm, '')
    // Strip lines that are just footnote text (start with number + period)
    .replace(/^\d+\.\s+.*$/gm, '')
    // Collapse excess whitespace
    .replace(/[ \t]+/g, ' ')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    // Collapse 3+ newlines to double
    .replace(/\n{3,}/g, '\n\n')
    // Trim each line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Final trim
    .trim();
}

// ─── Rate limiting ───

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Song resolution ───

/**
 * Given a setlist song title, find its entry in the song catalog.
 */
function findCatalogEntry(catalog: Catalog, title: string): SongEntry | null {
  const norm = title.toLowerCase().replace(/['']/g, "'");

  // Direct title match
  let entry = catalog.songs.find(s =>
    s.title.toLowerCase().replace(/['']/g, "'") === norm
  );
  if (entry) return entry;

  // Alias match
  entry = catalog.songs.find(s =>
    s.aliases.some(a => a.toLowerCase().replace(/['']/g, "'") === norm)
  );
  if (entry) return entry;

  // Partial match (e.g., "Lazy Lightnin'" matches "Lazy Lightning")
  const normSimple = norm.replace(/[^a-z0-9\s]/g, '');
  entry = catalog.songs.find(s => {
    const titleSimple = s.title.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    return titleSimple === normSimple || titleSimple.includes(normSimple) || normSimple.includes(titleSimple);
  });
  return entry || null;
}

// ─── Main ───

async function main() {
  if (!existsSync(CATALOG_PATH)) {
    console.error(`Song catalog not found at ${CATALOG_PATH}`);
    process.exit(1);
  }

  mkdirSync(DATA_DIR, { recursive: true });

  const catalog: Catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
  let songs: SongEntry[] = catalog.songs;

  // --show filter: only scrape songs from a specific show's setlist
  if (showFilter) {
    const setlistPath = resolve(VISUALIZER_DIR, 'data', 'setlist.json');
    if (!existsSync(setlistPath)) {
      console.error(`Setlist not found at ${setlistPath}`);
      process.exit(1);
    }
    const setlist: Setlist = JSON.parse(readFileSync(setlistPath, 'utf-8'));
    const setlistSongs: SongEntry[] = [];

    for (const sl of setlist.songs) {
      const entry = findCatalogEntry(catalog, sl.title);
      if (entry) {
        setlistSongs.push(entry);
      } else {
        console.log(`  ⚠ "${sl.title}" not found in song catalog, skipping`);
      }
    }
    songs = setlistSongs;
  }

  // --song filter
  if (songFilter) {
    const norm = songFilter.toLowerCase();
    songs = songs.filter(s =>
      s.title.toLowerCase().includes(norm) ||
      s.aliases.some(a => a.toLowerCase().includes(norm)),
    );
    if (songs.length === 0) {
      console.error(`No songs matching "${songFilter}" in catalog`);
      process.exit(1);
    }
  }

  console.log(`\nScraping lyrics from dead.net for ${songs.length} songs\n`);

  let scraped = 0;
  let skippedInstrumental = 0;
  let skippedExisting = 0;
  let failed = 0;
  const results: Array<{ slug: string; words: number; status: string }> = [];

  for (const song of songs) {
    const outPath = resolve(DATA_DIR, `${song.slug}.txt`);

    if (song.instrumental) {
      console.log(`  ○ ${song.title} (instrumental, skipped)`);
      skippedInstrumental++;
      results.push({ slug: song.slug, words: 0, status: 'instrumental' });
      continue;
    }

    if (!force && existsSync(outPath)) {
      const contents = readFileSync(outPath, 'utf-8').trim();
      if (contents.length > 0) {
        const wc = contents.split(/\s+/).length;
        console.log(`  ○ ${song.title} (exists, ${wc} words, skipped)`);
        skippedExisting++;
        results.push({ slug: song.slug, words: wc, status: 'existing' });
        continue;
      }
    }

    // Compute dead.net slug — check overrides first, then compute from title
    const deadNetSlug = song.deadNetSlug
      || DEAD_NET_SLUG_OVERRIDES[song.slug]
      || buildDeadNetSlug(song.title);

    if (dryRun) {
      console.log(`  → ${song.title} → https://www.dead.net/song/${deadNetSlug}`);
      continue;
    }

    // Try primary slug
    let lyrics = await fetchFromDeadNet(deadNetSlug);

    // Fallback: try the catalog slug directly (without stop-word stripping)
    if (!lyrics && deadNetSlug !== song.slug) {
      await delay(500);
      lyrics = await fetchFromDeadNet(song.slug);
    }

    // Fallback: try title as-is (all words, no stop-word removal)
    if (!lyrics) {
      const fullSlug = song.title
        .toLowerCase()
        .replace(/['']/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (fullSlug !== deadNetSlug && fullSlug !== song.slug) {
        await delay(500);
        lyrics = await fetchFromDeadNet(fullSlug);
      }
    }

    // Fallback: try aliases
    if (!lyrics) {
      for (const alias of song.aliases) {
        await delay(500);
        const aliasSlug = buildDeadNetSlug(alias);
        lyrics = await fetchFromDeadNet(aliasSlug);
        if (lyrics) break;
      }
    }

    if (!lyrics || lyrics.split(/\s+/).length < 5) {
      console.log(`  ✗ ${song.title} → not found on dead.net (tried: ${deadNetSlug})`);
      failed++;
      results.push({ slug: song.slug, words: 0, status: 'FAILED' });
      await delay(800);
      continue;
    }

    const wordCount = lyrics.split(/\s+/).length;

    // Write lyrics file
    writeFileSync(outPath, lyrics, 'utf-8');
    console.log(`  ✓ ${song.slug} (${wordCount} words)`);
    scraped++;
    results.push({ slug: song.slug, words: wordCount, status: 'scraped' });

    // Rate limit: 800ms between requests to be respectful
    await delay(800);
  }

  // Summary
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Done: ${scraped} scraped, ${skippedExisting} existing, ${skippedInstrumental} instrumental, ${failed} failed`);

  if (results.length > 0) {
    console.log(`\nResults:`);
    console.log(`${'─'.repeat(50)}`);
    const maxSlug = Math.max(...results.map(r => r.slug.length));
    for (const r of results) {
      const pad = ' '.repeat(maxSlug - r.slug.length);
      console.log(`  ${r.slug}${pad}  ${String(r.words).padStart(4)} words  ${r.status}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
