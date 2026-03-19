/**
 * media-resolver.ts — Pure function module for automatic song→poster matching.
 *
 * Takes a song title + the image-library catalog and returns a poster
 * image path for SongArtLayer (or null).
 *
 * No React hooks, no side effects, no imports from Remotion.
 */

// ─── Types ───

export interface ResolvedSongMedia {
  /** Poster image path for SongArtLayer (relative to public/), or null */
  songArt: string | null;
}

interface CatalogEntry {
  id: string;
  path: string;
  type: "image" | "video";
  songKey: string;
  category?: "song" | "general";
  tags: string[];
}

interface Catalog {
  version: number;
  assets: CatalogEntry[];
}

// ─── Title Normalization ───

/** Edge-case title aliases (normalized form → canonical slug) */
const TITLE_ALIASES: Record<string, string> = {
  "dancinginthestreet": "dancininthestreet",
  "dancinginthestreets": "dancininthestreet",
  "dancininthestreets": "dancininthestreet",
  "fireinthemountain": "fireonthemountain",
  "birdssong": "birdsong",
  "unclejohnsband": "unclejohnsband",
  "stjohnsband": "unclejohnsband",
};

/**
 * Strip everything non-alphanumeric, lowercase.
 * Used for comparing song titles against catalog songKeys.
 * Both sides get normalized to the same form before comparison.
 */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── Core Resolver ───

/**
 * Resolve poster art for a given song from the catalog.
 *
 * @param songTitle  Human-readable song title (e.g. "Fire on the Mountain")
 * @param catalog    The image-library.json catalog
 * @param showSeed   Numeric seed (unused, kept for API compatibility)
 * @param trackId    Track identifier (unused, kept for API compatibility)
 */
export function resolveMediaForSong(
  songTitle: string,
  catalog: Catalog,
  showSeed: number,
  trackId: string,
): ResolvedSongMedia {
  const normalizedTitle = normalizeForMatch(songTitle);
  const resolvedTitle = TITLE_ALIASES[normalizedTitle] ?? normalizedTitle;

  // Find matching song entries
  const songEntries: CatalogEntry[] = [];

  for (const entry of catalog.assets) {
    const normalizedKey = normalizeForMatch(entry.songKey);
    if (entry.category !== "general" && normalizedKey === resolvedTitle) {
      songEntries.push(entry);
    }
  }

  // Pick poster: prefer curated image over AI-generated (exclude SVGs)
  let songArt: string | null = null;
  const songImages = songEntries.filter((e) => e.type === "image" && !e.path.endsWith(".svg"));
  if (songImages.length > 0) {
    const curated = songImages.find((e) => e.tags.includes("curated-image"));
    songArt = (curated ?? songImages[0]).path;
  }

  return { songArt };
}
