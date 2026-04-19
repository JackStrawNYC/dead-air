#!/usr/bin/env npx tsx
/**
 * Repoint disc-track analysis files to stem-aligned song-named data.
 *
 * Reads setlist.json, maps each trackId to its song-named analysis file
 * in the repo-root data/tracks/ directory, and copies it to the disc-track
 * path that Remotion reads (data/shows/{date}/tracks/{trackId}-analysis.json).
 *
 * Song-named files have:
 *   - Correct frame counts (stem-aligned, trimmed)
 *   - 44 fields per frame (stems + CLAP semantics)
 *   - Properly segmented audio analysis
 *
 * Disc-track files (before repoint) have:
 *   - Misaligned frame counts (raw disc rip segments)
 *   - 36 fields per frame (no CLAP semantics)
 *
 * Usage:
 *   npx tsx scripts/repoint-analysis.ts
 *   npx tsx scripts/repoint-analysis.ts --dry-run
 *   npx tsx scripts/repoint-analysis.ts --data-dir ../../data/tracks
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const __dirname = new URL(".", import.meta.url).pathname;
const VISUALIZER_ROOT = resolve(__dirname, "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const getArg = (name: string, def: string) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : def;
};

// Source: song-named analysis files with stems + CLAP
const songNamedDir = resolve(getArg("data-dir", join(VISUALIZER_ROOT, "../../data/tracks")));

// Target: disc-track analysis files that Remotion reads
const setlistPath = join(VISUALIZER_ROOT, "data/setlist.json");
const setlist = JSON.parse(readFileSync(setlistPath, "utf-8"));
const showDate = setlist.date; // e.g., "1972-08-27"

// Resolve target directory from symlink
const targetDir = resolve(VISUALIZER_ROOT, "data/tracks");

console.log(`[repoint-analysis] Show: ${setlist.venue} — ${showDate}`);
console.log(`[repoint-analysis] Source: ${songNamedDir}`);
console.log(`[repoint-analysis] Target: ${targetDir}`);
if (dryRun) console.log(`[repoint-analysis] DRY RUN — no files will be written`);
console.log();

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/'/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

let pass = 0;
let fail = 0;

for (const song of setlist.songs) {
  const slug = slugify(song.title);
  const songNamedPath = join(songNamedDir, `${slug}-${showDate}-analysis.json`);
  const discTrackPath = join(targetDir, `${song.trackId}-analysis.json`);

  if (!existsSync(songNamedPath)) {
    console.log(`  ✗ ${song.trackId} ${song.title}: song-named file NOT FOUND at ${slug}-${showDate}-analysis.json`);
    fail++;
    continue;
  }

  // Read song-named file to report stats
  const data = JSON.parse(readFileSync(songNamedPath, "utf-8"));
  const frameCount = data.frames?.length ?? 0;
  const fieldCount = Object.keys(data.frames?.[0] ?? {}).length;
  const hasCLAP = data.frames?.[0]?.semantic_psychedelic !== undefined;

  if (!dryRun) {
    copyFileSync(songNamedPath, discTrackPath);
  }

  console.log(
    `  ✓ ${song.trackId} ${song.title}: ${frameCount} frames, ${fieldCount} fields, CLAP: ${hasCLAP ? "yes" : "NO"}${dryRun ? " (dry run)" : ""}`
  );
  pass++;
}

console.log();
console.log(`[repoint-analysis] ${pass} copied, ${fail} failed`);
if (fail > 0) {
  console.log(`[repoint-analysis] WARNING: ${fail} songs missing song-named analysis files`);
  process.exit(1);
}
