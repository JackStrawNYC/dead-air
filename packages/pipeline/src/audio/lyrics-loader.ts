import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createLogger } from '@dead-air/core';

const log = createLogger('audio:lyrics');

export interface SongCatalogEntry {
  title: string;
  slug: string;
  instrumental: boolean;
  aliases: string[];
}

interface SongCatalog {
  songs: SongCatalogEntry[];
}

let catalogCache: SongCatalog | null = null;

/**
 * Normalize text for fuzzy matching: lowercase, strip non-alphanumeric, collapse whitespace.
 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert a title to a URL-safe slug.
 */
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Load the song catalog from song-catalog.json.
 */
export function loadSongCatalog(lyricsDir: string): SongCatalogEntry[] {
  if (catalogCache) return catalogCache.songs;

  const catalogPath = resolve(lyricsDir, 'song-catalog.json');
  if (!existsSync(catalogPath)) {
    log.warn(`Song catalog not found at ${catalogPath}`);
    return [];
  }

  const raw = readFileSync(catalogPath, 'utf-8');
  catalogCache = JSON.parse(raw) as SongCatalog;
  return catalogCache.songs;
}

/**
 * Resolve a song title to its lyrics text file.
 *
 * Resolution order:
 * 1. Exact slug match from catalog
 * 2. Alias match (normalized comparison)
 * 3. Generated slug from title
 *
 * Handles Dead-specific naming variations:
 * - "Dancin' in the Streets" / "Dancing in the Street"
 * - "St. Stephen" / "Saint Stephen"
 * - "Me & My Uncle" / "Me and My Uncle"
 * - "Not Fade Away" / "NFA"
 * - Medley notation: "Scarlet Begonias > Fire On The Mountain" -> split on ">"
 */
export function loadLyrics(songTitle: string, lyricsDir: string): string | null {
  // Handle medley notation — split on ">" and resolve first song
  if (songTitle.includes('>')) {
    const firstSong = songTitle.split('>')[0].trim();
    return loadLyrics(firstSong, lyricsDir);
  }

  // Strip common suffixes that don't affect lyrics
  const cleanTitle = songTitle
    .replace(/\s*jam\s*$/i, '')
    .replace(/\s*reprise\s*$/i, '')
    .trim();

  const catalog = loadSongCatalog(lyricsDir);
  const normalizedInput = normalizeForMatch(cleanTitle);

  // 1. Exact slug match from catalog
  for (const entry of catalog) {
    if (entry.instrumental) continue;

    if (normalizeForMatch(entry.title) === normalizedInput) {
      return readLyricsFile(entry.slug, lyricsDir);
    }

    // Check aliases
    for (const alias of entry.aliases) {
      if (normalizeForMatch(alias) === normalizedInput) {
        return readLyricsFile(entry.slug, lyricsDir);
      }
    }
  }

  // 2. Generated slug fallback
  const slug = titleToSlug(cleanTitle);
  return readLyricsFile(slug, lyricsDir);
}

/**
 * Read a lyrics file by slug. Returns file contents or null.
 */
function readLyricsFile(slug: string, lyricsDir: string): string | null {
  const filePath = resolve(lyricsDir, `${slug}.txt`);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const contents = readFileSync(filePath, 'utf-8').trim();
    return contents || null;
  } catch {
    return null;
  }
}

/**
 * Resolve a song title to its catalog entry (for metadata lookup).
 */
export function findCatalogEntry(
  songTitle: string,
  lyricsDir: string,
): SongCatalogEntry | null {
  const catalog = loadSongCatalog(lyricsDir);
  const normalizedInput = normalizeForMatch(songTitle);

  for (const entry of catalog) {
    if (normalizeForMatch(entry.title) === normalizedInput) {
      return entry;
    }
    for (const alias of entry.aliases) {
      if (normalizeForMatch(alias) === normalizedInput) {
        return entry;
      }
    }
  }

  return null;
}
