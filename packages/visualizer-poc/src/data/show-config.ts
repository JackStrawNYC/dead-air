/**
 * Show Config — multi-show configuration loader.
 *
 * Supports rendering different Dead shows by loading show-specific
 * setlist, context, and analysis data from `data/shows/{showId}/`.
 *
 * Default behavior: falls back to current Cornell '77 data at `data/`
 * for backwards compatibility.
 */

import fs from "fs";
import path from "path";

export interface ShowConfig {
  showId: string;
  date: string;
  venue: string;
  /** Directory containing setlist.json, show-context.json, tracks/ */
  dataDir: string;
  /** Directory containing audio files */
  audioDir: string;
  /** Directory containing assets (song-art, scene-images, etc.) */
  assetsDir: string;
}

const DATA_ROOT = path.resolve(import.meta.dirname ?? __dirname, "../../data");
const SHOWS_ROOT = path.join(DATA_ROOT, "shows");

/**
 * List all available show configs.
 * Scans `data/shows/` for directories containing `setlist.json`.
 */
export function listShows(): ShowConfig[] {
  const shows: ShowConfig[] = [];

  // Default show (Cornell '77 — data/ root)
  if (fs.existsSync(path.join(DATA_ROOT, "setlist.json"))) {
    shows.push(buildShowConfig("cornell-77", DATA_ROOT));
  }

  // Additional shows in data/shows/
  if (fs.existsSync(SHOWS_ROOT)) {
    const dirs = fs.readdirSync(SHOWS_ROOT, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const showDir = path.join(SHOWS_ROOT, d.name);
      if (fs.existsSync(path.join(showDir, "setlist.json"))) {
        shows.push(buildShowConfig(d.name, showDir));
      }
    }
  }

  return shows;
}

/**
 * Load a specific show config by ID.
 * Falls back to default (data/ root) if showId is "cornell-77" or not found.
 */
export function loadShowConfig(showId?: string): ShowConfig {
  if (!showId || showId === "cornell-77") {
    return buildShowConfig("cornell-77", DATA_ROOT);
  }

  const showDir = path.join(SHOWS_ROOT, showId);
  if (!fs.existsSync(path.join(showDir, "setlist.json"))) {
    throw new Error(
      `Show "${showId}" not found. Expected setlist.json at ${showDir}/setlist.json`,
    );
  }

  return buildShowConfig(showId, showDir);
}

function buildShowConfig(showId: string, dataDir: string): ShowConfig {
  // Read date/venue from setlist.json
  const setlistPath = path.join(dataDir, "setlist.json");
  let date = "unknown";
  let venue = "unknown";
  try {
    const raw = JSON.parse(fs.readFileSync(setlistPath, "utf-8"));
    date = raw.date ?? date;
    venue = raw.venue ?? venue;
  } catch {
    // Ignore parse errors — defaults are fine
  }

  return {
    showId,
    date,
    venue,
    dataDir,
    audioDir: path.join(dataDir, "../public/audio"),
    assetsDir: path.join(dataDir, "../public/assets"),
  };
}
