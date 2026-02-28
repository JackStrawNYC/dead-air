/**
 * media-resolver.ts — Pure function module for automatic song→media matching.
 *
 * Takes a song title + the image-library catalog and returns:
 *   - A poster image path for SongArtLayer (or null)
 *   - A prioritized media list for SceneVideoLayer
 *
 * Priority ordering:
 *   0 = song-specific video (best match)
 *   1 = song-specific image (excluding poster)
 *   2 = general video (atmospheric, seeded shuffle)
 *   3 = general image (atmospheric, seeded shuffle)
 *
 * No React hooks, no side effects, no imports from Remotion.
 */

import { seeded } from "../utils/seededRandom";

// ─── Types ───

export interface ResolvedMedia {
  /** Path relative to public/ */
  src: string;
  /** "image" or "video" */
  mediaType: "image" | "video";
  /** 0 = song-specific video, 1 = song-specific image, 2 = general video, 3 = general image */
  priority: number;
}

export interface ResolvedSongMedia {
  /** Poster image path for SongArtLayer (relative to public/), or null */
  songArt: string | null;
  /** Prioritized media list for SceneVideoLayer */
  media: ResolvedMedia[];
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
  "dancininthestreet": "dancinginthestreet",
  "dancininthestreets": "dancinginthestreet",
  "dancinginthestreets": "dancinginthestreet",
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

// ─── Seeded Shuffle ───

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  const rng = seeded(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Core Resolver ───

/**
 * Resolve media assets for a given song from the catalog.
 *
 * @param songTitle  Human-readable song title (e.g. "Fire on the Mountain")
 * @param catalog    The image-library.json catalog
 * @param showSeed   Numeric seed for deterministic shuffle of general assets
 * @param trackId    Track identifier (e.g. "s2t03") for per-track shuffle variation
 */
export function resolveMediaForSong(
  songTitle: string,
  catalog: Catalog,
  showSeed: number,
  trackId: string,
): ResolvedSongMedia {
  const normalizedTitle = normalizeForMatch(songTitle);
  const resolvedTitle = TITLE_ALIASES[normalizedTitle] ?? normalizedTitle;

  // Find matching entries: compare normalized forms (strip hyphens from songKey too)
  const songEntries: CatalogEntry[] = [];
  const generalEntries: CatalogEntry[] = [];

  for (const entry of catalog.assets) {
    const normalizedKey = normalizeForMatch(entry.songKey);

    if (entry.category === "general") {
      generalEntries.push(entry);
    } else if (normalizedKey === resolvedTitle) {
      // Song-specific match (category "song" or legacy undefined)
      songEntries.push(entry);
    }
  }

  // Pick poster: prefer curated image over AI-generated
  let songArt: string | null = null;
  const songImages = songEntries.filter((e) => e.type === "image");
  if (songImages.length > 0) {
    // Prefer curated (from Desktop ingest) over AI-generated (from setlist ingest)
    const curated = songImages.find((e) => e.tags.includes("curated-image"));
    songArt = (curated ?? songImages[0]).path;
  }

  // Build prioritized media list
  const media: ResolvedMedia[] = [];

  // Priority 0: song-specific videos
  const songVideos = songEntries.filter((e) => e.type === "video");
  for (const v of songVideos) {
    media.push({ src: v.path, mediaType: "video", priority: 0 });
  }

  // Priority 1: song-specific images (excluding the poster)
  for (const img of songImages) {
    if (img.path === songArt) continue;
    media.push({ src: img.path, mediaType: "image", priority: 1 });
  }

  // Priority 2: general videos (seeded shuffle per trackId + showSeed)
  const generalVideos = generalEntries.filter((e) => e.type === "video");
  const shuffledGenVids = seededShuffle(
    generalVideos,
    hashString(trackId) + showSeed + 7919, // salt for video pool
  );
  for (const v of shuffledGenVids) {
    media.push({ src: v.path, mediaType: "video", priority: 2 });
  }

  // Priority 3: general images (seeded shuffle, different salt)
  const generalImages = generalEntries.filter((e) => e.type === "image");
  const shuffledGenImgs = seededShuffle(
    generalImages,
    hashString(trackId) + showSeed + 4217, // different salt
  );
  for (const img of shuffledGenImgs) {
    media.push({ src: img.path, mediaType: "image", priority: 3 });
  }

  return { songArt, media };
}
