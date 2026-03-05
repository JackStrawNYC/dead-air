/**
 * Static data loader — loads optional JSON data files at module init.
 *
 * Extracted from SongVisualizer to isolate data loading concerns.
 * All loads are try-catch guarded with null fallbacks.
 */

import type { Milestone } from "../../data/types";
import type { SongStats } from "../SongDNA";
import type { FanReview } from "../FanQuoteOverlay";
import { safeParse, SongStatsSchema, MilestoneDataSchema, NarrationSchema, ImageLibrarySchema } from "../../data/schemas";

// ─── Song Stats ───

let _songStatsData: Record<string, SongStats> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../../../data/song-stats.json");
  const validated = safeParse(SongStatsSchema, raw);
  _songStatsData = validated?.songs ?? null;
} catch {
  // Stats not available yet
}
export const songStatsData = _songStatsData;

// ─── Milestones ───

let _milestonesMap: Record<string, Milestone> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../../../data/milestones.json");
  const validated = safeParse(MilestoneDataSchema, raw);
  if (validated?.milestones) {
    _milestonesMap = {};
    for (const m of validated.milestones) {
      _milestonesMap[m.trackId] = m;
    }
  }
} catch {
  // Milestones not available yet
}
export const milestonesMap = _milestonesMap;

// ─── Narration ───

export interface NarrationSong {
  listenFor: string[];
  context?: string;
  songHistory?: string;
}

let _narrationData: Record<string, NarrationSong> | null = null;
let _fanReviewsData: FanReview[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../../../data/narration.json");
  const validated = safeParse(NarrationSchema, raw);
  _narrationData = (validated?.songs as Record<string, NarrationSong> | undefined) ?? null;
  _fanReviewsData = (validated?.fanReviews as FanReview[] | undefined) ?? [];
} catch {
  // Narration not available yet
}
export const narrationData = _narrationData;
export const fanReviewsData = _fanReviewsData;

// ─── Media Catalog ───

export interface MediaCatalogAsset {
  id: string;
  path: string;
  type: "image" | "video";
  songKey: string;
  category?: "song" | "general";
  tags: string[];
}

let _mediaCatalog: { version: number; assets: MediaCatalogAsset[] } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../../../data/image-library.json");
  const validated = safeParse(ImageLibrarySchema, raw);
  _mediaCatalog = validated?.assets?.length ? (validated as { version: number; assets: MediaCatalogAsset[] }) : null;
} catch {
  // Catalog not yet generated — auto-resolution disabled
}
export const mediaCatalog = _mediaCatalog;
