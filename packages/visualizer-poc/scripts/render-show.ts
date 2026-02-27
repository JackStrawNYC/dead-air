#!/usr/bin/env npx tsx
/**
 * Full show renderer — renders each song as a separate composition,
 * then concatenates into the final show MP4 via FFmpeg.
 *
 * Strategy: render video-only (--muted) with chunking for speed,
 * then mux the original concert audio file per song. This gives
 * perfect audio with no chunk-boundary artifacts.
 *
 * Pre-bundles the Remotion project once and reuses the bundle for all
 * renders, eliminating bundling/copying overhead per render.
 *
 * Usage:
 *   npx tsx scripts/render-show.ts [--resume] [--track=s2t08] [--gl=angle]
 *
 * Features:
 *   --resume     Skip tracks with existing output
 *   --track=ID   Render only one track
 *   --gl=angle   GPU backend (default: angle)
 *   --chunk=N    Frames per chunk for long songs (default: 4500)
 */

import { execSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const TRACKS_DIR = join(DATA_DIR, "tracks");
const OUT_DIR = join(ROOT, "out");
const SONGS_DIR = join(OUT_DIR, "songs");
const AUDIO_DIR = join(ROOT, "public", "audio");
const ENTRY = join(ROOT, "src", "entry.ts");
const BUNDLE_DIR = join(OUT_DIR, "bundle");
const BUNDLE_HASH_FILE = join(BUNDLE_DIR, ".source-hash");

// Parse args
const args = process.argv.slice(2);
const resume = args.includes("--resume");
const glArg = args.find((a) => a.startsWith("--gl="))?.split("=")[1] ?? "angle";
const chunkSize = parseInt(args.find((a) => a.startsWith("--chunk="))?.split("=")[1] ?? "4500", 10);
const trackFilter = args.find((a) => a.startsWith("--track="))?.split("=")[1];

interface SetlistEntry {
  trackId: string;
  title: string;
  audioFile: string;
  set: number;
  segueInto?: boolean;
}

interface TimelineTrack {
  trackId: string;
  totalFrames: number;
  missing?: boolean;
}

interface ChapterEntry {
  before?: string;
  after?: string;
  text: string;
}

// ─── Bundle invalidation via source hash ───

/** Hash key source files to detect changes that require rebundling */
function computeSourceHash(): string {
  const filesToHash = [
    join(ROOT, "src", "entry.ts"),
    join(ROOT, "src", "Root.tsx"),
    join(ROOT, "src", "SongVisualizer.tsx"),
    join(DATA_DIR, "setlist.json"),
  ];
  // Optional files (may not exist)
  const optionalFiles = [
    join(DATA_DIR, "overlay-schedule.json"),
    join(DATA_DIR, "show-context.json"),
  ];

  const hash = createHash("sha256");
  for (const f of filesToHash) {
    hash.update(readFileSync(f));
  }
  for (const f of optionalFiles) {
    if (existsSync(f)) hash.update(readFileSync(f));
  }
  return hash.digest("hex").slice(0, 16);
}

/** Bundle the project, rebuilding if source files changed */
function ensureBundle(): string {
  const currentHash = computeSourceHash();

  if (existsSync(join(BUNDLE_DIR, "index.html")) && existsSync(BUNDLE_HASH_FILE)) {
    const storedHash = readFileSync(BUNDLE_HASH_FILE, "utf-8").trim();
    if (storedHash === currentHash) {
      console.log("Bundle up-to-date, reusing ...");
      return BUNDLE_DIR;
    }
    console.log("Source files changed — rebuilding bundle ...");
    rmSync(BUNDLE_DIR, { recursive: true, force: true });
  }

  console.log("Bundling Remotion project ...");
  mkdirSync(BUNDLE_DIR, { recursive: true });
  execSync(
    `npx remotion bundle ${ENTRY} --out-dir=${BUNDLE_DIR}`,
    { cwd: ROOT, stdio: "inherit" },
  );
  writeFileSync(BUNDLE_HASH_FILE, currentHash);
  console.log("Bundle ready.\n");
  return BUNDLE_DIR;
}

// ─── Pre-flight validation ───

function preflight(songs: SetlistEntry[], tracks: TimelineTrack[]): void {
  console.log("\nPre-flight validation ...");
  const errors: string[] = [];

  for (const song of songs) {
    // Check analysis JSON
    const analysisPath = join(TRACKS_DIR, `${song.trackId}-analysis.json`);
    if (!existsSync(analysisPath)) {
      errors.push(`Missing analysis: ${analysisPath}`);
    }

    // Check audio file
    const audioPath = join(AUDIO_DIR, song.audioFile);
    if (!existsSync(audioPath)) {
      errors.push(`Missing audio: ${audioPath}`);
    }

    // Check timeline entry
    const track = tracks.find((t) => t.trackId === song.trackId);
    if (!track || track.missing) {
      errors.push(`Missing timeline entry: ${song.trackId} (run analyze_show.py)`);
    }
  }

  if (errors.length > 0) {
    console.error("\nPRE-FLIGHT FAILED — missing assets:\n");
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error(`\n${errors.length} error(s). Fix these before rendering.\n`);
    process.exit(1);
  }

  console.log(`  All ${songs.length} songs: analysis + audio + timeline ✓\n`);
}

// ─── Song rendering: video-only chunks + audio mux ───

/**
 * Render a song: video-only chunks (--muted), concat chunks,
 * then mux the original audio file for perfect sound.
 */
function renderSong(
  song: SetlistEntry,
  totalFrames: number,
  analysisPath: string,
  outputPath: string,
  bundlePath: string,
): void {
  const chunksDir = join(SONGS_DIR, `${song.trackId}-chunks`);
  mkdirSync(chunksDir, { recursive: true });

  const videoOnlyPath = join(chunksDir, "video-only.mp4");

  // Step 1: Render video-only (muted) — chunked for speed
  if (totalFrames <= chunkSize) {
    // Small enough for single pass
    if (!(resume && existsSync(videoOnlyPath))) {
      console.log(`  Rendering video (${totalFrames} frames, single pass) ...`);
      const cmd = [
        "npx remotion render",
        bundlePath,
        song.trackId,
        videoOnlyPath,
        `--props=${analysisPath}`,
        `--gl=${glArg}`,
        `--concurrency=6`,
        `--timeout=300000`,
        `--frames=0-${totalFrames - 1}`,
        "--muted",
      ].join(" ");
      execSync(cmd, { cwd: ROOT, stdio: "inherit" });
    } else {
      console.log(`  RESUME: video-only already rendered`);
    }
  } else {
    // Chunked rendering
    const chunks: string[] = [];
    let start = 0;

    while (start < totalFrames) {
      const end = Math.min(start + chunkSize - 1, totalFrames - 1);
      const chunkPath = join(chunksDir, `chunk-${String(start).padStart(8, "0")}.mp4`);

      if (resume && existsSync(chunkPath)) {
        console.log(`  RESUME: chunk ${start}-${end}`);
      } else {
        console.log(`  Chunk ${start}-${end} (${end - start + 1} frames) ...`);
        const cmd = [
          "npx remotion render",
          bundlePath,
          song.trackId,
          chunkPath,
          `--props=${analysisPath}`,
          `--gl=${glArg}`,
          `--concurrency=6`,
          `--timeout=300000`,
          `--frames=${start}-${end}`,
          "--muted",
        ].join(" ");
        execSync(cmd, { cwd: ROOT, stdio: "inherit" });
      }

      chunks.push(chunkPath);
      start += chunkSize;
    }

    // Concat video chunks (video stream copy — lossless, instant)
    if (!(resume && existsSync(videoOnlyPath))) {
      const listPath = join(chunksDir, "concat.txt");
      writeFileSync(listPath, chunks.map((c) => `file '${c}'`).join("\n"));
      console.log(`  Concatenating ${chunks.length} video chunks ...`);
      execSync(
        `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v copy -an "${videoOnlyPath}"`,
        { cwd: ROOT, stdio: "inherit" },
      );
    } else {
      console.log(`  RESUME: video-only concat exists`);
    }
  }

  // Step 2: Mux original audio onto video
  const audioPath = join(AUDIO_DIR, song.audioFile);
  console.log(`  Muxing audio: ${song.audioFile}`);
  execSync(
    `ffmpeg -y -i "${videoOnlyPath}" -i "${audioPath}" -c:v copy -c:a aac -ar 48000 -b:a 320k -shortest "${outputPath}"`,
    { cwd: ROOT, stdio: "inherit" },
  );
}

// ─── Simple compositions (intro, end card, set break, chapter cards) ───

function renderShowIntro(bundlePath: string): string | null {
  const setlistCheck = JSON.parse(readFileSync(join(DATA_DIR, "setlist.json"), "utf-8"));
  if (!setlistCheck.showPoster) {
    console.log("SKIP: No showPoster in setlist.json (run generate-song-art.ts first)");
    return null;
  }

  const outputPath = join(SONGS_DIR, "show-intro.mp4");
  if (resume && existsSync(outputPath)) {
    console.log("RESUME: show-intro already rendered");
    return outputPath;
  }

  console.log("\nRendering show intro (15.5s) ...");
  const cmd = [
    "npx remotion render",
    bundlePath,
    "ShowIntro",
    outputPath,
    `--gl=${glArg}`,
  ].join(" ");

  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
  return outputPath;
}

function renderEndCard(bundlePath: string): string {
  const outputPath = join(SONGS_DIR, "end-card.mp4");
  if (resume && existsSync(outputPath)) {
    console.log("RESUME: end-card already rendered");
    return outputPath;
  }

  console.log("\nRendering end card (12s) ...");
  const cmd = [
    "npx remotion render",
    bundlePath,
    "EndCard",
    outputPath,
    `--gl=${glArg}`,
  ].join(" ");

  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
  return outputPath;
}

function renderSetBreak(bundlePath: string): string {
  const outputPath = join(SONGS_DIR, "set-break.mp4");
  if (resume && existsSync(outputPath)) {
    console.log("RESUME: set-break already rendered");
    return outputPath;
  }

  console.log("\nRendering set break (10s) ...");
  const cmd = [
    "npx remotion render",
    bundlePath,
    "SetBreak",
    outputPath,
    `--gl=${glArg}`,
  ].join(" ");

  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
  return outputPath;
}

/** Render a chapter card composition */
function renderChapterCard(index: number, bundlePath: string): string {
  const outputPath = join(SONGS_DIR, `chapter-${index}.mp4`);
  if (resume && existsSync(outputPath)) {
    console.log(`  RESUME: chapter-${index} already rendered`);
    return outputPath;
  }

  console.log(`  Rendering Chapter-${index} (6s) ...`);
  const cmd = [
    "npx remotion render",
    bundlePath,
    `Chapter-${index}`,
    outputPath,
    `--gl=${glArg}`,
  ].join(" ");

  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
  return outputPath;
}

// ─── Final concat ───

function concatShow(
  rendered: { path: string; set: number; trackId?: string }[],
  bundlePath: string,
  chapters: ChapterEntry[],
) {
  // Derive show output name from setlist date + venue (no hardcoded show name)
  const setlistData = JSON.parse(readFileSync(join(DATA_DIR, "setlist.json"), "utf-8"));
  const showDate = (setlistData.date || "show").replace(/\//g, "-");
  const showVenue = (setlistData.venue || "").split(",")[0].trim().toLowerCase().replace(/\s+/g, "-") || "show";
  const showOutput = join(OUT_DIR, `${showDate}-${showVenue}-full-show.mp4`);
  const listPath = join(OUT_DIR, "show-concat.txt");

  // Build chapter lookup maps: "before" and "after" keyed by trackId
  const chaptersBefore = new Map<string, number[]>();
  const chaptersAfter = new Map<string, number[]>();
  chapters.forEach((ch, i) => {
    if (ch.before) {
      const arr = chaptersBefore.get(ch.before) ?? [];
      arr.push(i);
      chaptersBefore.set(ch.before, arr);
    }
    if (ch.after) {
      const arr = chaptersAfter.get(ch.after) ?? [];
      arr.push(i);
      chaptersAfter.set(ch.after, arr);
    }
  });

  const entries: string[] = [];
  let prevSet = rendered[0]?.set ?? 1;
  let chaptersInserted = 0;

  for (const { path, set, trackId } of rendered) {
    // Insert set break between sets
    if (set !== prevSet && prevSet !== 0 && set !== 0) {
      const breakPath = renderSetBreak(bundlePath);
      entries.push(`file '${breakPath}'`);
      console.log(`  Inserted set break between set ${prevSet} and set ${set}`);
    }

    // Insert "before" chapter cards (before this song)
    if (trackId) {
      const beforeIndices = chaptersBefore.get(trackId);
      if (beforeIndices) {
        for (const idx of beforeIndices) {
          const chapterPath = renderChapterCard(idx, bundlePath);
          entries.push(`file '${chapterPath}'`);
          chaptersInserted++;
          console.log(`  Inserted chapter ${idx} before ${trackId}`);
        }
      }
    }

    entries.push(`file '${path}'`);

    // Insert "after" chapter cards (after this song)
    if (trackId) {
      const afterIndices = chaptersAfter.get(trackId);
      if (afterIndices) {
        for (const idx of afterIndices) {
          const chapterPath = renderChapterCard(idx, bundlePath);
          entries.push(`file '${chapterPath}'`);
          chaptersInserted++;
          console.log(`  Inserted chapter ${idx} after ${trackId}`);
        }
      }
    }

    prevSet = set;
  }

  writeFileSync(listPath, entries.join("\n"));

  console.log(`\nConcatenating ${entries.length} segments (${chaptersInserted} chapter cards) into full show ...`);
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v copy -c:a aac -ar 48000 -b:a 320k "${showOutput}"`,
    { cwd: ROOT, stdio: "inherit" },
  );
  console.log(`Full show: ${showOutput}`);
}

// ─── Main ───

function main() {
  const setlist = JSON.parse(readFileSync(join(DATA_DIR, "setlist.json"), "utf-8"));
  const timelinePath = join(DATA_DIR, "show-timeline.json");

  if (!existsSync(timelinePath)) {
    console.error("ERROR: show-timeline.json not found. Run: python scripts/analyze_show.py");
    process.exit(1);
  }

  const timeline = JSON.parse(readFileSync(timelinePath, "utf-8"));
  const tracks: TimelineTrack[] = timeline.tracks;
  mkdirSync(SONGS_DIR, { recursive: true });

  // Load chapters (optional — graceful if missing)
  let chapters: ChapterEntry[] = [];
  const showContextPath = join(DATA_DIR, "show-context.json");
  if (existsSync(showContextPath)) {
    const ctx = JSON.parse(readFileSync(showContextPath, "utf-8"));
    chapters = ctx.chapters ?? [];
    console.log(`Loaded ${chapters.length} chapter cards from show-context.json`);
  }

  const songs: SetlistEntry[] = setlist.songs;
  const songsToRender = trackFilter
    ? songs.filter((s) => s.trackId === trackFilter)
    : songs;

  // Pre-flight: validate all assets exist before burning render time
  if (!trackFilter) {
    preflight(songsToRender, tracks);
  }

  const bundlePath = ensureBundle();

  let totalFrames = 0;
  for (const song of songsToRender) {
    const track = tracks.find((t: TimelineTrack) => t.trackId === song.trackId);
    if (track && !track.missing) totalFrames += track.totalFrames;
  }

  console.log(`\nRendering ${songsToRender.length} track(s) with gl=${glArg}, chunk=${chunkSize}`);
  console.log(`Total frames: ${totalFrames.toLocaleString()} (${(totalFrames / 30 / 60).toFixed(1)} min of video)`);
  console.log(`Strategy: video-only chunks + original audio mux`);
  console.log("=".repeat(60));

  const rendered: { path: string; set: number; trackId?: string }[] = [];
  const startTime = Date.now();
  let framesRendered = 0;

  if (!trackFilter) {
    const introPath = renderShowIntro(bundlePath);
    if (introPath) {
      rendered.push({ path: introPath, set: 0 });
    }
  }

  for (const song of songsToRender) {
    const track = tracks.find((t: TimelineTrack) => t.trackId === song.trackId);
    if (!track || track.missing || track.totalFrames === 0) {
      console.log(`SKIP: ${song.trackId} — no analysis data`);
      continue;
    }

    const outputPath = join(SONGS_DIR, `${song.trackId}.mp4`);

    if (resume && existsSync(outputPath)) {
      console.log(`RESUME: ${song.trackId} already rendered`);
      rendered.push({ path: outputPath, set: song.set, trackId: song.trackId });
      framesRendered += track.totalFrames;
    } else {
      const analysisPath = join(TRACKS_DIR, `${song.trackId}-analysis.json`);

      console.log(`\n[${ (framesRendered / totalFrames * 100).toFixed(0) }%] Rendering: ${song.title} (${song.trackId}) — ${track.totalFrames} frames`);

      renderSong(song, track.totalFrames, analysisPath, outputPath, bundlePath);

      framesRendered += track.totalFrames;
      const elapsed = (Date.now() - startTime) / 1000;
      const fps = framesRendered / elapsed;
      const remaining = (totalFrames - framesRendered) / fps;
      console.log(`  Progress: ${framesRendered.toLocaleString()}/${totalFrames.toLocaleString()} frames (${fps.toFixed(1)} eff. fps, ~${(remaining / 60).toFixed(0)}m remaining)`);

      rendered.push({ path: outputPath, set: song.set, trackId: song.trackId });
    }
  }

  if (!trackFilter) {
    const endCardPath = renderEndCard(bundlePath);
    rendered.push({ path: endCardPath, set: 0 });
  }

  if (!trackFilter && rendered.length > 1) {
    concatShow(rendered, bundlePath, chapters);
  }

  const totalElapsed = (Date.now() - startTime) / 1000;
  console.log(`\nDone! Rendered ${rendered.length} segment(s) in ${(totalElapsed / 60).toFixed(1)} minutes.`);
}

main();
