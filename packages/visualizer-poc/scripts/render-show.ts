#!/usr/bin/env npx tsx
/**
 * Full show renderer — renders each song as a separate composition,
 * then concatenates into the final show MP4 via FFmpeg.
 * Inserts chapter cards between songs and set breaks between sets.
 *
 * Usage:
 *   npx tsx scripts/render-show.ts [--resume] [--track=s2t08] [--gl=angle]
 *
 * Features:
 *   --resume     Skip tracks with existing output
 *   --track=ID   Render only one track
 *   --gl=angle   GPU backend (default: angle)
 *   --chunk=N    Frames per chunk for long songs (default: 3000)
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const TRACKS_DIR = join(DATA_DIR, "tracks");
const OUT_DIR = join(ROOT, "out");
const SONGS_DIR = join(OUT_DIR, "songs");
const ENTRY = join(ROOT, "src", "entry.ts");

// Parse args
const args = process.argv.slice(2);
const resume = args.includes("--resume");
const glArg = args.find((a) => a.startsWith("--gl="))?.split("=")[1] ?? "angle";
const chunkSize = parseInt(args.find((a) => a.startsWith("--chunk="))?.split("=")[1] ?? "3000", 10);
const trackFilter = args.find((a) => a.startsWith("--track="))?.split("=")[1];

interface SetlistEntry {
  trackId: string;
  title: string;
  audioFile: string;
  set: number;
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

// ─── Chapter card helpers ───

/** Load chapter cards from show-context.json */
function loadChapters(): ChapterEntry[] {
  const contextPath = join(DATA_DIR, "show-context.json");
  if (!existsSync(contextPath)) return [];
  const data = JSON.parse(readFileSync(contextPath, "utf-8"));
  return data.chapters ?? [];
}

/** Get chapter cards that should play BEFORE a given track */
function getChaptersBefore(chapters: ChapterEntry[], trackId: string): ChapterEntry[] {
  return chapters.filter((ch) => ch.before === trackId);
}

/** Get chapter cards that should play AFTER a given track */
function getChaptersAfter(chapters: ChapterEntry[], trackId: string): ChapterEntry[] {
  return chapters.filter((ch) => ch.after === trackId);
}

/** Render a single chapter card composition, return path */
function renderChapterCard(index: number): string {
  const outputPath = join(SONGS_DIR, `chapter-${index}.mp4`);
  if (resume && existsSync(outputPath)) {
    console.log(`  RESUME: chapter-${index} already rendered`);
    return outputPath;
  }

  console.log(`  Rendering chapter card ${index} ...`);
  const cmd = [
    "npx remotion render",
    ENTRY,
    `Chapter-${index}`,
    outputPath,
    `--gl=${glArg}`,
  ].join(" ");

  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
  return outputPath;
}

// ─── Main ───

function main() {
  // Load setlist + timeline + chapters
  const setlist = JSON.parse(readFileSync(join(DATA_DIR, "setlist.json"), "utf-8"));
  const timelinePath = join(DATA_DIR, "show-timeline.json");

  if (!existsSync(timelinePath)) {
    console.error("ERROR: show-timeline.json not found. Run: python scripts/analyze_show.py");
    process.exit(1);
  }

  const timeline = JSON.parse(readFileSync(timelinePath, "utf-8"));
  const tracks: TimelineTrack[] = timeline.tracks;
  const chapters = loadChapters();

  mkdirSync(SONGS_DIR, { recursive: true });

  const songs: SetlistEntry[] = setlist.songs;
  const songsToRender = trackFilter
    ? songs.filter((s) => s.trackId === trackFilter)
    : songs;

  console.log(`\nRendering ${songsToRender.length} track(s) with gl=${glArg}, chunk=${chunkSize}`);
  console.log(`Chapter cards: ${chapters.length}`);
  console.log("=".repeat(60));

  // Concat segments: { path, set } where set=0 is intro/chapter material
  const rendered: { path: string; set: number }[] = [];

  // Render show intro poster (if not filtering to a single track)
  if (!trackFilter) {
    const introPath = renderShowIntro();
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

    // Insert "before" chapter cards for this song
    if (!trackFilter) {
      const beforeCards = getChaptersBefore(chapters, song.trackId);
      for (const ch of beforeCards) {
        const idx = chapters.indexOf(ch);
        const cardPath = renderChapterCard(idx);
        rendered.push({ path: cardPath, set: song.set });
      }
    }

    const outputPath = join(SONGS_DIR, `${song.trackId}.mp4`);

    if (resume && existsSync(outputPath)) {
      console.log(`RESUME: ${song.trackId} already rendered`);
      rendered.push({ path: outputPath, set: song.set });
    } else {
      const analysisPath = join(TRACKS_DIR, `${song.trackId}-analysis.json`);
      if (!existsSync(analysisPath)) {
        console.log(`SKIP: ${song.trackId} — no analysis JSON`);
        continue;
      }

      console.log(`\nRendering: ${song.title} (${song.trackId}) — ${track.totalFrames} frames`);

      if (track.totalFrames > chunkSize) {
        renderChunked(song, track.totalFrames, analysisPath, outputPath);
      } else {
        renderFull(song, track.totalFrames, analysisPath, outputPath);
      }

      rendered.push({ path: outputPath, set: song.set });
    }

    // Insert "after" chapter cards for this song
    if (!trackFilter) {
      const afterCards = getChaptersAfter(chapters, song.trackId);
      for (const ch of afterCards) {
        const idx = chapters.indexOf(ch);
        const cardPath = renderChapterCard(idx);
        rendered.push({ path: cardPath, set: song.set });
      }
    }
  }

  // Append end card after all songs + chapter cards
  if (!trackFilter) {
    const endCardPath = renderEndCard();
    rendered.push({ path: endCardPath, set: 0 });
  }

  // Concatenate all tracks into full show (with set breaks + chapters)
  if (!trackFilter && rendered.length > 1) {
    concatShow(rendered);
  }

  console.log(`\nDone! Rendered ${rendered.length} segment(s).`);
}

function renderShowIntro(): string | null {
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

  console.log("\nRendering show intro (10s) ...");
  const cmd = [
    "npx remotion render",
    ENTRY,
    "ShowIntro",
    outputPath,
    `--gl=${glArg}`,
  ].join(" ");

  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
  return outputPath;
}

function renderFull(song: SetlistEntry, totalFrames: number, analysisPath: string, outputPath: string) {
  const cmd = [
    "npx remotion render",
    ENTRY,
    song.trackId,
    outputPath,
    `--props=${analysisPath}`,
    `--gl=${glArg}`,
    `--frames=0-${totalFrames - 1}`,
  ].join(" ");

  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

function renderChunked(song: SetlistEntry, totalFrames: number, analysisPath: string, outputPath: string) {
  const chunksDir = join(SONGS_DIR, `${song.trackId}-chunks`);
  mkdirSync(chunksDir, { recursive: true });

  const chunks: string[] = [];
  let start = 0;

  while (start < totalFrames) {
    const end = Math.min(start + chunkSize - 1, totalFrames - 1);
    const chunkPath = join(chunksDir, `chunk-${String(start).padStart(8, "0")}.mp4`);

    if (resume && existsSync(chunkPath)) {
      console.log(`  RESUME: chunk ${start}-${end}`);
    } else {
      const cmd = [
        "npx remotion render",
        ENTRY,
        song.trackId,
        chunkPath,
        `--props=${analysisPath}`,
        `--gl=${glArg}`,
        `--frames=${start}-${end}`,
      ].join(" ");

      console.log(`  Chunk ${start}-${end} ...`);
      execSync(cmd, { cwd: ROOT, stdio: "inherit" });
    }

    chunks.push(chunkPath);
    start += chunkSize;
  }

  // FFmpeg concat
  const listPath = join(chunksDir, "concat.txt");
  const listContent = chunks.map((c) => `file '${c}'`).join("\n");
  writeFileSync(listPath, listContent);

  console.log(`  Concatenating ${chunks.length} chunks ...`);
  // Re-encode audio during chunk concat to eliminate boundary skips.
  // Video stays as stream copy (fast), audio gets re-encoded to smooth
  // over the discontinuities at chunk boundaries.
  // -shortest trims audio to match video duration (AAC frames overshoot
  // by ~53ms per chunk, which accumulates into audible drift).
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v copy -c:a aac -b:a 320k -shortest "${outputPath}"`,
    { cwd: ROOT, stdio: "inherit" },
  );
}

function renderEndCard(): string {
  const outputPath = join(SONGS_DIR, "end-card.mp4");
  if (resume && existsSync(outputPath)) {
    console.log("RESUME: end-card already rendered");
    return outputPath;
  }

  console.log("\nRendering end card (12s) ...");
  const cmd = [
    "npx remotion render",
    ENTRY,
    "EndCard",
    outputPath,
    `--gl=${glArg}`,
  ].join(" ");

  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
  return outputPath;
}

function renderSetBreak(): string {
  const outputPath = join(SONGS_DIR, "set-break.mp4");
  if (existsSync(outputPath)) {
    console.log("RESUME: set-break already rendered");
    return outputPath;
  }

  console.log("\nRendering set break (5s black) ...");
  const cmd = [
    "npx remotion render",
    ENTRY,
    "SetBreak",
    outputPath,
    `--gl=${glArg}`,
  ].join(" ");

  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
  return outputPath;
}

function concatShow(rendered: { path: string; set: number }[]) {
  const showOutput = join(OUT_DIR, "cornell-77-full-show.mp4");
  const listPath = join(OUT_DIR, "show-concat.txt");

  // Build concat list with set breaks between sets
  const entries: string[] = [];
  let prevSet = rendered[0]?.set ?? 1;

  for (const { path, set } of rendered) {
    // Insert set break when set number changes (but not for intro/end card bookends)
    if (set !== prevSet && prevSet !== 0 && set !== 0) {
      const breakPath = renderSetBreak();
      entries.push(`file '${breakPath}'`);
      console.log(`  Inserted set break between set ${prevSet} and set ${set}`);
    }
    entries.push(`file '${path}'`);
    prevSet = set;
  }

  writeFileSync(listPath, entries.join("\n"));

  console.log(`\nConcatenating ${entries.length} segments into full show ...`);
  // Re-encode audio to eliminate boundary glitches between segments
  // with different bitrates (songs=307k, chapters/intro=317k).
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v copy -c:a aac -b:a 320k "${showOutput}"`,
    { cwd: ROOT, stdio: "inherit" },
  );
  console.log(`Full show: ${showOutput}`);
}

main();
