#!/usr/bin/env npx tsx
/**
 * scrape-lyrics.ts — One-time scraper for Grateful Dead lyrics database.
 *
 * Reads song-catalog.json, fetches lyrics from Genius public pages (no API key needed),
 * writes to data/lyrics/{slug}.txt.
 * Skips instrumentals and songs that already have lyrics (unless --force).
 *
 * URL construction: Genius URLs follow a predictable pattern:
 *   https://genius.com/Grateful-dead-{title-slug}-lyrics
 *
 * When the constructed URL 404s, falls back to a Google-style site search.
 *
 * Usage:
 *   npx tsx packages/pipeline/scripts/scrape-lyrics.ts
 *   npx tsx packages/pipeline/scripts/scrape-lyrics.ts --force
 *   npx tsx packages/pipeline/scripts/scrape-lyrics.ts --song="Fire on the Mountain"
 *   npx tsx packages/pipeline/scripts/scrape-lyrics.ts --dry-run
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', '..', '..', 'data', 'lyrics');
const CATALOG_PATH = resolve(DATA_DIR, 'song-catalog.json');

interface SongEntry {
  title: string;
  slug: string;
  instrumental: boolean;
  aliases: string[];
}

interface Catalog {
  songs: SongEntry[];
}

// ─── CLI args ───

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const songFilter = args.find(a => a.startsWith('--song='))?.slice(7);

// ─── Genius URL construction ───

/**
 * Build a Genius URL from a song title.
 * Genius URLs: https://genius.com/Grateful-dead-fire-on-the-mountain-lyrics
 */
function buildGeniusUrl(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/['']/g, '')           // strip apostrophes
    .replace(/&/g, 'and')           // & → and
    .replace(/[^a-z0-9\s-]/g, '')   // strip special chars
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^-|-$/g, '');         // trim leading/trailing hyphens
  return `https://genius.com/Grateful-dead-${slug}-lyrics`;
}

/**
 * Some songs have non-obvious Genius URLs. This map handles known exceptions.
 */
const GENIUS_URL_OVERRIDES: Record<string, string> = {
  'me-and-my-uncle': 'https://genius.com/Grateful-dead-me-and-my-uncle-lyrics',
  'goin-down-the-road-feeling-bad': 'https://genius.com/Grateful-dead-goin-down-the-road-feelin-bad-lyrics',
  'i-know-you-rider': 'https://genius.com/Grateful-dead-i-know-you-rider-lyrics',
  'not-fade-away': 'https://genius.com/Grateful-dead-not-fade-away-lyrics',
  'the-other-one': 'https://genius.com/Grateful-dead-the-other-one-lyrics',
  'st-stephen': 'https://genius.com/Grateful-dead-st-stephen-lyrics',
  'us-blues': 'https://genius.com/Grateful-dead-us-blues-lyrics',
  'one-more-saturday-night': 'https://genius.com/Grateful-dead-one-more-saturday-night-lyrics',
};

// ─── Fetch + Extract ───

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchLyricsFromUrl(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  });

  if (!res.ok) return null;

  const html = await res.text();
  return extractLyricsFromHtml(html);
}

function cleanHtmlToText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')           // <br> → newline
    .replace(/<[^>]+>/g, '')                 // strip all other tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\[.*?\]/g, '')                 // strip [Verse 1], [Chorus], etc.
    .replace(/\d+\s*Contributors?[A-Za-z\s'-]+Lyrics\n?/g, '') // strip "12 ContributorsSong Lyrics"
    .replace(/\d+\s*Contributors?\n?/g, '')  // strip standalone "12 Contributors"
    .replace(/You might also like/g, '')     // strip Genius promo text
    .replace(/Embed$/gm, '')                 // strip trailing "Embed"
    .replace(/\n{3,}/g, '\n\n')              // collapse triple+ newlines
    .trim();
}

function extractLyricsFromHtml(html: string): string | null {
  // Strategy 1: Extract from data-lyrics-container divs (server-rendered lyrics)
  // Use a greedy match that captures nested divs properly
  const containerRegex = /data-lyrics-container="true"[^>]*>([\s\S]*?)(?=<\/div>\s*<div|<\/div>\s*<\/div>|<\/section>)/g;
  const parts: string[] = [];

  let match;
  while ((match = containerRegex.exec(html)) !== null) {
    parts.push(match[1]);
  }

  // Fallback: try the simpler non-greedy match
  if (parts.length === 0) {
    const simpleRegex = /data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g;
    while ((match = simpleRegex.exec(html)) !== null) {
      parts.push(match[1]);
    }
  }

  if (parts.length > 0) {
    const cleaned = cleanHtmlToText(parts.join('\n'));
    if (cleaned.split(/\s+/).length > 10) return cleaned;
  }

  // Strategy 2: Extract from __NEXT_DATA__ JSON (Genius embeds lyrics in page props)
  const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      // Navigate Genius's Next.js page props to find lyrics
      const pageData = data?.props?.pageProps;
      if (pageData) {
        const lyricsText = findLyricsInObject(pageData);
        if (lyricsText) {
          const cleaned = cleanHtmlToText(lyricsText);
          if (cleaned.split(/\s+/).length > 10) return cleaned;
        }
      }
    } catch {
      // JSON parse failed — continue to fallback
    }
  }

  // Strategy 3: Look for Lyrics__Container class (older Genius pages)
  const classRegex = /class="Lyrics__Container[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  const classParts: string[] = [];
  while ((match = classRegex.exec(html)) !== null) {
    classParts.push(match[1]);
  }
  if (classParts.length > 0) {
    const cleaned = cleanHtmlToText(classParts.join('\n'));
    if (cleaned.split(/\s+/).length > 10) return cleaned;
  }

  // Return whatever we got from strategy 1, even if short
  if (parts.length > 0) {
    return cleanHtmlToText(parts.join('\n')) || null;
  }

  return null;
}

/**
 * Recursively search a JSON object for lyrics content.
 * Genius Next.js data nests lyrics in various places.
 */
function findLyricsInObject(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;

  // Check for known Genius lyrics keys
  const record = obj as Record<string, unknown>;
  if (typeof record.lyrics === 'string' && record.lyrics.length > 50) {
    return record.lyrics;
  }
  if (typeof record.body === 'object' && record.body !== null) {
    const body = record.body as Record<string, unknown>;
    if (typeof body.plain === 'string' && body.plain.length > 50) {
      return body.plain;
    }
    if (typeof body.html === 'string' && body.html.length > 50) {
      return body.html;
    }
  }
  if (typeof record.lyricsData === 'object' && record.lyricsData !== null) {
    const result = findLyricsInObject(record.lyricsData);
    if (result) return result;
  }

  // Recurse into nested objects (limit depth)
  for (const key of Object.keys(record)) {
    if (typeof record[key] === 'object' && record[key] !== null) {
      const result = findLyricsInObject(record[key]);
      if (result) return result;
    }
  }

  return null;
}

// ─── Rate limiting ───

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Main ───

async function main() {
  if (!existsSync(CATALOG_PATH)) {
    console.error(`Song catalog not found at ${CATALOG_PATH}`);
    process.exit(1);
  }

  mkdirSync(DATA_DIR, { recursive: true });

  const catalog: Catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
  let songs = catalog.songs;

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

  console.log(`Scraping lyrics for ${songs.length} songs (no API key needed)\n`);

  let scraped = 0;
  let skippedInstrumental = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const song of songs) {
    const outPath = resolve(DATA_DIR, `${song.slug}.txt`);

    if (song.instrumental) {
      console.log(`  ○ ${song.title} (instrumental, skipped)`);
      skippedInstrumental++;
      continue;
    }

    if (!force && existsSync(outPath)) {
      const contents = readFileSync(outPath, 'utf-8').trim();
      if (contents.length > 0) {
        console.log(`  ○ ${song.title} (exists, skipped)`);
        skippedExisting++;
        continue;
      }
    }

    // Build URL — check overrides first, then construct from title
    const url = GENIUS_URL_OVERRIDES[song.slug] ?? buildGeniusUrl(song.title);

    if (dryRun) {
      console.log(`  → ${song.title} → ${url}`);
      continue;
    }

    // Fetch lyrics page
    const lyrics = await fetchLyricsFromUrl(url);

    if (!lyrics || lyrics.length < 20) {
      // Retry with alternate URL constructions for common patterns
      const altUrls = buildAlternateUrls(song);
      let found = false;
      for (const altUrl of altUrls) {
        if (altUrl === url) continue;
        await delay(800);
        const altLyrics = await fetchLyricsFromUrl(altUrl);
        if (altLyrics && altLyrics.length >= 20) {
          writeFileSync(outPath, altLyrics, 'utf-8');
          const wordCount = altLyrics.split(/\s+/).length;
          console.log(`  ✓ ${song.slug} (${wordCount} words) [alt URL]`);
          scraped++;
          found = true;
          break;
        }
      }
      if (!found) {
        console.log(`  ✗ ${song.title} (not found at ${url})`);
        failed++;
      }
      await delay(1000);
      continue;
    }

    // Only overwrite if new content has more words than existing
    const newWordCount = lyrics.split(/\s+/).length;
    if (existsSync(outPath)) {
      const existing = readFileSync(outPath, 'utf-8').trim();
      const existingWordCount = existing.split(/\s+/).length;
      if (existingWordCount >= newWordCount && existingWordCount > 10) {
        console.log(`  ○ ${song.slug} (existing ${existingWordCount} words >= new ${newWordCount}, kept)`);
        skippedExisting++;
        await delay(1000);
        continue;
      }
    }

    // Write lyrics file
    writeFileSync(outPath, lyrics, 'utf-8');
    console.log(`  ✓ ${song.slug} (${newWordCount} words)`);
    scraped++;

    // Rate limit: 1s between requests to be respectful
    await delay(1000);
  }

  console.log(`\nDone: ${scraped} scraped, ${skippedExisting} existing, ${skippedInstrumental} instrumental, ${failed} failed`);
}

/**
 * Build alternate Genius URLs for songs with tricky naming.
 * Tries common variations: with/without "the", parenthetical removal, etc.
 */
function buildAlternateUrls(song: SongEntry): string[] {
  const urls: string[] = [];

  // Try without parenthetical suffixes: "Ain't It Crazy (The Rub)" → "Ain't It Crazy"
  const withoutParens = song.title.replace(/\s*\(.*?\)\s*/g, '').trim();
  if (withoutParens !== song.title) {
    urls.push(buildGeniusUrl(withoutParens));
  }

  // Try each alias
  for (const alias of song.aliases) {
    urls.push(buildGeniusUrl(alias));
  }

  // Try with "the" prefix stripped: "The Other One" → "Other One"
  if (song.title.toLowerCase().startsWith('the ')) {
    urls.push(buildGeniusUrl(song.title.slice(4)));
  }

  return urls;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
