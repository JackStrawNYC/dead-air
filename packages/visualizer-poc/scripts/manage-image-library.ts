#!/usr/bin/env npx tsx
/**
 * manage-image-library.ts — Catalog and store visual assets for reuse across shows.
 *
 * Supports images (PNG/JPG/WebP) and video clips (MP4/WebM).
 *
 * Usage:
 *   npx tsx scripts/manage-image-library.ts ingest                    # catalog current show's art
 *   npx tsx scripts/manage-image-library.ts ingest --show=gd77-05-08  # explicit show ID
 *   npx tsx scripts/manage-image-library.ts add <file> --song="Scarlet Begonias" --tags=psychedelic,red
 *   npx tsx scripts/manage-image-library.ts add <file> --type=video --song="Dark Star" --tags=space,ambient
 *   npx tsx scripts/manage-image-library.ts list                      # show full catalog
 *   npx tsx scripts/manage-image-library.ts list --song="Fire on the Mountain"
 *   npx tsx scripts/manage-image-library.ts stats                     # summary stats
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, resolve, extname, basename } from "path";
import crypto from "crypto";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const SETLIST_PATH = join(DATA_DIR, "setlist.json");
const LIBRARY_DIR = join(ROOT, "public", "assets", "library");
const CATALOG_PATH = join(DATA_DIR, "image-library.json");

// ─── Types ───

interface AssetEntry {
  /** Unique ID (content hash) */
  id: string;
  /** Path relative to public/ */
  path: string;
  /** Original filename */
  originalFile: string;
  /** "image" or "video" */
  type: "image" | "video";
  /** Song title this asset is associated with */
  song: string;
  /** Normalized song key for matching (lowercase, no punctuation) */
  songKey: string;
  /** Show this was first generated for */
  sourceShow?: string;
  /** Freeform tags */
  tags: string[];
  /** File size in bytes */
  sizeBytes: number;
  /** When this was added to the library */
  addedAt: string;
  /** AI model used to generate (if known) */
  model?: string;
  /** Generation prompt (if known) */
  prompt?: string;
}

interface ImageLibrary {
  version: 1;
  assets: AssetEntry[];
}

// ─── Helpers ───

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov"]);

function normalizeSongKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

function fileHash(filePath: string): string {
  const buf = readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function detectType(filePath: string): "image" | "video" | null {
  const ext = extname(filePath).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  return null;
}

function loadCatalog(): ImageLibrary {
  if (existsSync(CATALOG_PATH)) {
    return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  }
  return { version: 1, assets: [] };
}

function saveCatalog(catalog: ImageLibrary): void {
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");
}

function ensureLibraryDir(): void {
  if (!existsSync(LIBRARY_DIR)) {
    mkdirSync(LIBRARY_DIR, { recursive: true });
  }
}

// ─── Commands ───

function ingestCurrentShow(showId?: string): void {
  if (!existsSync(SETLIST_PATH)) {
    console.error("No setlist.json found at", SETLIST_PATH);
    process.exit(1);
  }

  const setlist = JSON.parse(readFileSync(SETLIST_PATH, "utf8"));
  const resolvedShowId = showId ?? `gd${setlist.date.replace(/-/g, "-")}`;
  const catalog = loadCatalog();
  ensureLibraryDir();

  let added = 0;
  let skipped = 0;

  // Ingest show poster
  if (setlist.showPoster) {
    const posterPath = join(ROOT, "public", setlist.showPoster);
    if (existsSync(posterPath)) {
      const result = addAssetToCatalog(
        catalog,
        posterPath,
        `${setlist.venue} — ${setlist.date}`,
        "image",
        ["show-poster", "venue"],
        resolvedShowId,
      );
      if (result) added++;
      else skipped++;
    }
  }

  // Ingest song art
  for (const song of setlist.songs) {
    if (!song.songArt) continue;
    const artPath = join(ROOT, "public", song.songArt);
    if (!existsSync(artPath)) {
      console.warn(`  ⚠ Missing: ${song.songArt} (${song.title})`);
      continue;
    }

    const result = addAssetToCatalog(
      catalog,
      artPath,
      song.title,
      "image",
      ["song-art", "poster"],
      resolvedShowId,
    );
    if (result) added++;
    else skipped++;
  }

  saveCatalog(catalog);
  console.log(`\nIngested: ${added} new, ${skipped} already in library`);
  console.log(`Total library: ${catalog.assets.length} assets`);
}

function addAssetToCatalog(
  catalog: ImageLibrary,
  srcPath: string,
  song: string,
  type: "image" | "video",
  tags: string[],
  sourceShow?: string,
  model?: string,
  prompt?: string,
): boolean {
  const hash = fileHash(srcPath);

  // Already cataloged?
  if (catalog.assets.some((a) => a.id === hash)) {
    console.log(`  ✓ Already in library: ${song} (${hash})`);
    return false;
  }

  // Copy to library
  const ext = extname(srcPath);
  const songKey = normalizeSongKey(song);
  const libraryFilename = `${songKey}-${hash}${ext}`;
  const libraryPath = join(LIBRARY_DIR, libraryFilename);

  copyFileSync(srcPath, libraryPath);
  const stats = statSync(libraryPath);

  const entry: AssetEntry = {
    id: hash,
    path: `assets/library/${libraryFilename}`,
    originalFile: basename(srcPath),
    type,
    song,
    songKey,
    sourceShow,
    tags,
    sizeBytes: stats.size,
    addedAt: new Date().toISOString(),
    ...(model ? { model } : {}),
    ...(prompt ? { prompt } : {}),
  };

  catalog.assets.push(entry);
  console.log(`  + Added: ${song} → ${libraryFilename} (${(stats.size / 1024 / 1024).toFixed(1)}M)`);
  return true;
}

function addSingleFile(
  filePath: string,
  song: string,
  tags: string[],
  forceType?: "image" | "video",
): void {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const type = forceType ?? detectType(absPath);
  if (!type) {
    console.error(`Unknown file type: ${extname(absPath)}. Use --type=image or --type=video`);
    process.exit(1);
  }

  const catalog = loadCatalog();
  ensureLibraryDir();

  const result = addAssetToCatalog(catalog, absPath, song, type, tags);
  if (result) {
    saveCatalog(catalog);
    console.log(`\nTotal library: ${catalog.assets.length} assets`);
  }
}

function listAssets(songFilter?: string): void {
  const catalog = loadCatalog();

  if (catalog.assets.length === 0) {
    console.log("Library is empty. Run: npx tsx scripts/manage-image-library.ts ingest");
    return;
  }

  let assets = catalog.assets;
  if (songFilter) {
    const filterKey = normalizeSongKey(songFilter);
    assets = assets.filter(
      (a) => a.songKey.includes(filterKey) || a.song.toLowerCase().includes(songFilter.toLowerCase()),
    );
  }

  // Group by song
  const bySong = new Map<string, AssetEntry[]>();
  for (const a of assets) {
    if (!bySong.has(a.song)) bySong.set(a.song, []);
    bySong.get(a.song)!.push(a);
  }

  for (const [song, entries] of [...bySong.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`\n${song}:`);
    for (const e of entries) {
      const size = (e.sizeBytes / 1024 / 1024).toFixed(1);
      const typeIcon = e.type === "video" ? "🎬" : "🖼";
      console.log(`  ${typeIcon} ${e.path} (${size}M) [${e.tags.join(", ")}]`);
    }
  }

  console.log(`\n${assets.length} assets shown`);
}

function showStats(): void {
  const catalog = loadCatalog();

  if (catalog.assets.length === 0) {
    console.log("Library is empty.");
    return;
  }

  const songs = new Set(catalog.assets.map((a) => a.songKey));
  const images = catalog.assets.filter((a) => a.type === "image");
  const videos = catalog.assets.filter((a) => a.type === "video");
  const totalSize = catalog.assets.reduce((sum, a) => sum + a.sizeBytes, 0);
  const shows = new Set(catalog.assets.map((a) => a.sourceShow).filter(Boolean));

  console.log("Image Library Stats");
  console.log("─".repeat(40));
  console.log(`Total assets:    ${catalog.assets.length}`);
  console.log(`  Images:        ${images.length}`);
  console.log(`  Videos:        ${videos.length}`);
  console.log(`Unique songs:    ${songs.size}`);
  console.log(`Source shows:    ${shows.size}`);
  console.log(`Total size:      ${(totalSize / 1024 / 1024).toFixed(0)}M`);

  // Top tags
  const tagCounts = new Map<string, number>();
  for (const a of catalog.assets) {
    for (const t of a.tags) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topTags.length > 0) {
    console.log(`\nTop tags:`);
    for (const [tag, count] of topTags) {
      console.log(`  ${tag}: ${count}`);
    }
  }
}

// ─── CLI ───

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg?.split("=").slice(1).join("=");
}

switch (command) {
  case "ingest": {
    const showId = getFlag("show");
    console.log(`Ingesting current show art into library...`);
    ingestCurrentShow(showId);
    break;
  }
  case "add": {
    const file = args[1];
    const song = getFlag("song");
    const tagsStr = getFlag("tags");
    const type = getFlag("type") as "image" | "video" | undefined;
    if (!file || !song) {
      console.error("Usage: manage-image-library.ts add <file> --song=\"Song Title\" [--tags=a,b] [--type=video]");
      process.exit(1);
    }
    const tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()) : [];
    addSingleFile(file, song, tags, type);
    break;
  }
  case "list": {
    const songFilter = getFlag("song");
    listAssets(songFilter);
    break;
  }
  case "stats": {
    showStats();
    break;
  }
  default:
    console.log(`Usage:
  npx tsx scripts/manage-image-library.ts ingest [--show=gd77-05-08]
  npx tsx scripts/manage-image-library.ts add <file> --song="Title" [--tags=a,b] [--type=video]
  npx tsx scripts/manage-image-library.ts list [--song="Title"]
  npx tsx scripts/manage-image-library.ts stats`);
}
