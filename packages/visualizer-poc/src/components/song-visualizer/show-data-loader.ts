/**
 * Static data loader — loads optional JSON data files at module init.
 *
 * Extracted from SongVisualizer to isolate data loading concerns.
 * All loads are try-catch guarded with null fallbacks.
 */

import type { Milestone } from "../../data/types";
import type { SongStats } from "../SongDNA";
import type { FanReview } from "../FanQuoteOverlay";

// ─── Song Stats ───

let _songStatsData: Record<string, SongStats> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../../../data/song-stats.json");
  _songStatsData = raw?.songs ?? null;
} catch {
  // Stats not available yet
}
export const songStatsData = _songStatsData;

// ─── Milestones ───

let _milestonesMap: Record<string, Milestone> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../../../data/milestones.json");
  if (raw?.milestones) {
    _milestonesMap = {};
    for (const m of raw.milestones as Milestone[]) {
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
  _narrationData = raw?.songs ?? null;
  _fanReviewsData = raw?.fanReviews ?? [];
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
  _mediaCatalog = raw?.assets?.length ? raw : null;
} catch {
  // Catalog not yet generated — auto-resolution disabled
}
export const mediaCatalog = _mediaCatalog;
