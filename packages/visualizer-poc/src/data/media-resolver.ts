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

import { seeded, seededShuffle } from "../utils/seededRandom";
import { hashString } from "../utils/hash";

// ─── Types ───

export interface ResolvedMedia {
  /** Path relative to public/ */
  src: string;
  /** "image" or "video" */
  mediaType: "image" | "video";
  /** 0 = song-specific video, 1 = song-specific image, 2 = general video, 3 = general image */
  priority: number;
  /** Energy phase tag from catalog (for section-aware placement) */
  energyTag?: "low" | "mid" | "high";
  /** Video duration in frames (default 450 = 15s for Grok, 300 = 10s for Hailuo) */
  durationFrames?: number;
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

// ─── Seeded Shuffle (imported from utils/seededRandom) ───

// ─── Tag extraction helpers ───

/** Extract energy tag (low/mid/high) from catalog tags like "energy-low" */
function extractEnergyTag(tags: string[]): "low" | "mid" | "high" | undefined {
  for (const t of tags) {
    if (t === "energy-low") return "low";
    if (t === "energy-mid") return "mid";
    if (t === "energy-high") return "high";
  }
  return undefined;
}

/** Extract duration in frames from catalog tags like "duration-300" */
function extractDurationFrames(tags: string[]): number | undefined {
  for (const t of tags) {
    const match = t.match(/^duration-(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  return undefined;
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

  // Pick poster: prefer curated image over AI-generated (exclude SVGs)
  let songArt: string | null = null;
  const songImages = songEntries.filter((e) => e.type === "image" && !e.path.endsWith(".svg"));
  if (songImages.length > 0) {
    // Prefer curated (from Desktop ingest) over AI-generated (from setlist ingest)
    const curated = songImages.find((e) => e.tags.includes("curated-image"));
    songArt = (curated ?? songImages[0]).path;
  }

  // Build prioritized media list
  const media: ResolvedMedia[] = [];

  // Priority 0: song-specific videos (scene-video only — exclude bare "generated" clips)
  const songVideos = songEntries.filter((e) => e.type === "video" && e.tags.includes("scene-video"));
  for (const v of songVideos) {
    media.push({
      src: v.path,
      mediaType: "video",
      priority: 0,
      energyTag: extractEnergyTag(v.tags),
      durationFrames: extractDurationFrames(v.tags),
    });
  }

  // Priority 1: song-specific images (excluding poster and generated stills)
  for (const img of songImages) {
    if (img.path === songArt) continue;
    if (img.tags.includes("song-video-still")) continue;
    media.push({ src: img.path, mediaType: "image", priority: 1 });
  }

  // General pool videos/images excluded — they break song-specific atmosphere.
  // Each song has 4-6 dedicated videos which is enough. The generals are filler.

  return { songArt, media };
}
