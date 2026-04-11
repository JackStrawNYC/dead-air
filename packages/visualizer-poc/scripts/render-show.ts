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
 *   npx tsx scripts/render-show.ts --track=s1t10 --preview   # 10-second preview
 *   npx tsx scripts/render-show.ts --show-date=1977-05-08    # dynamic show (after bridge)
 *
 * Features:
 *   --resume      Skip tracks with existing output
 *   --track=ID    Render only one track
 *   --gl=angle    GPU backend (default: angle)
 *   --chunk=N     Frames per chunk for long songs (default: 3000)
 *   --preview     Render only first 300 frames (10s) to a separate preview file
 *   --show-date   Show date for output naming (default: from setlist.json)
 *   --data-dir    Data directory override (default: ROOT/data)
 *   --seed        PRNG seed for generative variation (default: timestamp)
 *   --fps=N       Render fps (30 or 60; analysis is interpolated from 30fps)
 */

import { execSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { cpus } from "os";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const TRACKS_DIR = join(DATA_DIR, "tracks");
const OUT_DIR = join(ROOT, "out");
const SONGS_DIR = join(OUT_DIR, "songs");
const AUDIO_DIR = join(ROOT, "public", "audio");
const ENTRY = join(ROOT, "src", "entry.ts");
const BUNDLE_DIR = join(OUT_DIR, "bundle");
const BUNDLE_HASH_FILE = join(BUNDLE_DIR, ".source-hash");

// ─── Render Presets ───

interface RenderPreset {
  width: number;
  height: number;
  concurrency: number;
  skipGrain: boolean;
  skipBloom: boolean;
  label: string;
}

const PRESETS: Record<string, RenderPreset> = {
  draft:   { width: 1280, height: 720,  concurrency: 6, skipGrain: true,  skipBloom: true,  label: "Draft (720p, no grain/bloom)" },
  preview: { width: 1920, height: 1080, concurrency: 4, skipGrain: false, skipBloom: false, label: "Preview (1080p, full quality)" },
  final:   { width: 1920, height: 1080, concurrency: 3, skipGrain: false, skipBloom: false, label: "Final (1080p, full quality, max fidelity)" },
  "4k":    { width: 3840, height: 2160, concurrency: 6, skipGrain: false, skipBloom: false, label: "4K (2160p, full quality)" },
};

// Parse args
const args = process.argv.slice(2);
const resume = args.includes("--resume");
const draftMode = args.includes("--draft");
// GL backend: ANGLE on all platforms. EGL was tested on Linux/Docker and caused
// immediate crashes on some Vast.ai instances. ANGLE is proven stable (Bertha
// preview, chunk tests all succeeded with ANGLE).
const glArg = args.find((a) => a.startsWith("--gl="))?.split("=")[1] ?? "angle";
// Default chunk size 600 (was 3000 → 1200). Each chunk gets a fresh Chrome
// process; GPU driver leaks accumulate between chunks. 600 frames = 20 seconds
// of video, enough to render cleanly before GPU memory pressure builds.
const chunkSize = parseInt(args.find((a) => a.startsWith("--chunk="))?.split("=")[1] ?? "600", 10);
const trackFilter = args.find((a) => a.startsWith("--track="))?.split("=")[1];
const previewMode = args.includes("--preview");
const showDateArg = args.find((a) => a.startsWith("--show-date="))?.split("=")[1];
const dataDirArg = args.find((a) => a.startsWith("--data-dir="))?.split("=")[1];
const seedArg = args.find((a) => a.startsWith("--seed="))?.split("=")[1];
const presetArg = args.find((a) => a.startsWith("--preset="))?.split("=")[1];
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="))?.split("=")[1];
const noIntro = args.includes("--no-intro");
const noEndCard = args.includes("--no-end-card");
const noChapters = args.includes("--no-chapters");
const noSetBreaks = args.includes("--no-set-breaks");
const setBreakSecArg = args.find((a) => a.startsWith("--set-break-sec="))?.split("=")[1];
const fpsArg = args.find((a) => a.startsWith("--fps="))?.split("=")[1];
// Backwards-compatible: --draft maps to draft preset, --preview flag maps to preview preset
const activePreset: RenderPreset | null = presetArg
  ? PRESETS[presetArg] ?? null
  : draftMode ? PRESETS.draft : null;
// --concurrency=N overrides preset concurrency
if (activePreset && concurrencyArg) {
  activePreset.concurrency = parseInt(concurrencyArg, 10);
}
const renderSeed = seedArg ? parseInt(seedArg, 10) : Date.now();
const previewFps = fpsArg ? parseInt(fpsArg, 10) : 30;
const PREVIEW_FRAMES = parseInt(
  args.find((a) => a.startsWith("--preview-seconds="))?.split("=")[1] ?? "15",
  10,
) * previewFps;

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

/** Hash key source files to detect changes that require rebundling.
 *  As of the chill-mode + A+++ overlay rebuild, this hashes:
 *  - Critical core files (Root, SongVisualizer, FullscreenQuad, etc.)
 *  - SceneRouter + scene-registry (routing + safe shaders)
 *  - All shader shared files (postprocess, noise, fxaa, uniforms)
 *  - All overlay components in src/components/ (recursively)
 *  - All scene component files in src/scenes/
 *  - data: setlist.json, schemas, types
 *  This is intentionally aggressive — the cost of a stale bundle is much higher
 *  than the cost of a redundant rebuild. */
function computeSourceHash(): string {
  const filesToHash = [
    join(ROOT, "src", "entry.ts"),
    join(ROOT, "src", "Root.tsx"),
    join(ROOT, "src", "SongVisualizer.tsx"),
    // Components — full directory walk
    join(ROOT, "src", "components"),
    // Scene routing + registry
    join(ROOT, "src", "scenes", "SceneRouter.tsx"),
    join(ROOT, "src", "scenes", "scene-registry.ts"),
    // Shared shader infrastructure
    join(ROOT, "src", "shaders", "shared", "postprocess.glsl.ts"),
    join(ROOT, "src", "shaders", "shared", "uniforms.glsl.ts"),
    join(ROOT, "src", "shaders", "shared", "fxaa.glsl.ts"),
    join(ROOT, "src", "shaders", "noise.ts"),
    // Utils that affect render output
    join(ROOT, "src", "utils", "audio-reactive.ts"),
    join(ROOT, "src", "utils", "energy.ts"),
    join(ROOT, "src", "utils", "climax-state.ts"),
    join(ROOT, "src", "utils", "reactive-triggers.ts"),
    // Data
    join(ROOT, "src", "data", "overlay-selector.ts"),
    join(ROOT, "src", "data", "overlay-rotation.ts"),
    join(ROOT, "src", "data", "overlay-windows.ts"),
    join(ROOT, "src", "data", "schemas.ts"),
    join(DATA_DIR, "setlist.json"),
    join(DATA_DIR, "show-timeline.json"),
    join(DATA_DIR, "narrative-states.json"),
  ];
  const optionalFiles = [
    join(DATA_DIR, "overlay-schedule.json"),
    join(DATA_DIR, "show-context.json"),
  ];

  const hash = createHash("sha256");
  // Recursively hash a directory's tsx/ts files (sorted for determinism)
  function hashDir(dir: string): void {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sorted) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        hashDir(full);
      } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
        hash.update(readFileSync(full));
      }
    }
  }
  for (const f of filesToHash) {
    if (!existsSync(f)) continue;
    const stat = statSync(f);
    if (stat.isDirectory()) {
      hashDir(f);
    } else {
      hash.update(readFileSync(f));
    }
  }
  for (const f of optionalFiles) {
    if (existsSync(f)) hash.update(readFileSync(f));
  }
  return hash.digest("hex").slice(0, 16);
}

/** Run the cross-song narrative precompute step.
 *  Writes data/narrative-states.json (~40 KB) which Root.tsx imports.
 *  Replaces the old in-bundle precompute that forced Webpack to inline ~250 MB
 *  of analysis JSONs into bundle.js. */
function ensureNarrativePrecompute(): void {
  const out = join(DATA_DIR, "narrative-states.json");
  const setlistPath = join(DATA_DIR, "setlist.json");
  // Stale if missing or older than setlist.json
  if (existsSync(out)) {
    const outMtime = statSync(out).mtimeMs;
    const setlistMtime = statSync(setlistPath).mtimeMs;
    if (outMtime >= setlistMtime) {
      console.log("Narrative precompute up-to-date.");
      return;
    }
  }
  console.log("Precomputing narrative states ...");
  execSync(`npx tsx ${join(ROOT, "scripts", "precompute-narrative.ts")}`, {
    cwd: ROOT,
    stdio: "inherit",
  });
}

/** Bundle the project, rebuilding if source files changed */
function ensureBundle(): string {
  ensureNarrativePrecompute();
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
  const warnings: string[] = [];

  for (const song of songs) {
    // Check analysis JSON exists and has valid structure
    const analysisPath = join(TRACKS_DIR, `${song.trackId}-analysis.json`);
    if (!existsSync(analysisPath)) {
      errors.push(`Missing analysis: ${analysisPath}`);
    } else {
      // Spot-check: verify meta.totalFrames matches frames array length
      try {
        const raw = JSON.parse(readFileSync(analysisPath, "utf-8"));
        if (raw.meta && raw.frames) {
          if (raw.meta.totalFrames !== raw.frames.length) {
            warnings.push(
              `Frame count mismatch: ${song.trackId} — meta says ${raw.meta.totalFrames}, got ${raw.frames.length} frames`,
            );
          }
        }
      } catch {
        errors.push(`Unparseable analysis: ${song.trackId}`);
      }
    }

    // Check audio file
    const audioPath = join(AUDIO_DIR, song.audioFile);
    if (!existsSync(audioPath)) {
      errors.push(`Missing audio: ${audioPath}`);
    }

    // Check timeline entry and frame count consistency
    const track = tracks.find((t) => t.trackId === song.trackId);
    if (!track || track.missing) {
      errors.push(`Missing timeline entry: ${song.trackId} (run analyze_show.py)`);
    } else if (track.totalFrames === 0) {
      errors.push(`Zero frames: ${song.trackId} — analysis may have failed`);
    }
  }

  if (warnings.length > 0) {
    console.warn("\n  Warnings:");
    for (const w of warnings) console.warn(`    ! ${w}`);
  }

  if (errors.length > 0) {
    console.error("\nPRE-FLIGHT FAILED — missing assets:\n");
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error(`\n${errors.length} error(s). Fix these before rendering.`);
    console.error(`Tip: run 'npx tsx scripts/validate-pipeline.ts' for full diagnostics.\n`);
    process.exit(1);
  }

  console.log(`  All ${songs.length} songs: analysis + audio + timeline ✓\n`);
}

// ─── Render retry logic ───

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [10_000, 20_000, 40_000]; // exponential backoff: 10s, 20s, 40s

/**
 * Execute a render command with retry logic (3 attempts, exponential backoff).
 * Logs attempt number and error details on failure.
 */
function execWithRetry(cmd: string, opts: { cwd: string; stdio: "inherit" | "pipe" }, label: string): void {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      execSync(cmd, opts);

      // ─── GPU cleanup between chunks ───
      // Chrome's GPU process doesn't fully release ANGLE/EGL WebGL contexts
      // on exit. On Vast.ai Docker instances, this causes chunk 2+ to crash
      // with "Target closed" because GPU memory accumulates linearly across
      // chunk invocations. Explicitly kill stray Chrome procs, wait for file
      // descriptors to close, and drop kernel caches.
      if (process.platform === "linux") {
        try { execSync("pkill -9 -f 'chrome-headless' 2>/dev/null || true", { stdio: "ignore" }); } catch {}
        try { execSync("sleep 3", { stdio: "ignore" }); } catch {}
        try { execSync("sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true", { stdio: "ignore" }); } catch {}
      }

      return; // success
    } catch (err: any) {
      const errorMsg = err.stderr?.toString().slice(-500) || err.message || "Unknown error";
      console.error(`  RENDER FAILED (attempt ${attempt}/${MAX_RETRIES}) [${label}]: ${errorMsg}`);

      // Kill stray Chrome processes before retry
      try { execSync("pkill -9 -f 'chrome-headless' 2>/dev/null || true", { stdio: "ignore" }); } catch {}
      try { execSync("sleep 3", { stdio: "ignore" }); } catch {}

      if (attempt < MAX_RETRIES) {
        const waitMs = RETRY_BACKOFF_MS[attempt - 1];
        console.log(`  Retrying in ${waitMs / 1000}s ...`);
        execSync(`sleep ${waitMs / 1000}`);
      } else {
        console.error(`  All ${MAX_RETRIES} attempts failed for [${label}]. Aborting.`);
        throw err;
      }
    }
  }
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
  adaptiveConcurrency: number,
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
        `--concurrency=${adaptiveConcurrency}`,
        `--timeout=900000`,
        `--delay-render-timeout-in-milliseconds=300000`,
        `--frames=0-${totalFrames - 1}`,
        "--muted",
      ].join(" ");
      execWithRetry(cmd, { cwd: ROOT, stdio: "inherit" }, `${song.trackId} single-pass`);
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
          `--concurrency=${adaptiveConcurrency}`,
          `--timeout=900000`,
          `--delay-render-timeout-in-milliseconds=300000`,
          `--frames=${start}-${end}`,
          "--muted",
        ].join(" ");
        execWithRetry(cmd, { cwd: ROOT, stdio: "inherit" }, `${song.trackId} chunk ${start}-${end}`);
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
  // CHILL CALIBRATION + 4K FIX:
  // ShowIntro at 4K previously hit Remotion's delayRender 28s timeout because the
  // OffthreadVideo + Img + 4K decode pipeline takes >28s for the first frame.
  // Fix: --delay-render-timeout-in-milliseconds=300000 (5 min) gives the pipeline
  // ample time to load assets + warm shader cache, while keeping --concurrency=2
  // (to avoid memory pressure on 4K decode).
  const cmd = [
    "npx remotion render",
    bundlePath,
    "ShowIntro",
    outputPath,
    `--gl=${glArg}`,
    `--timeout=900000`,
    `--delay-render-timeout-in-milliseconds=300000`,
    `--concurrency=2`,
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
    `--timeout=600000`,
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

  const breakDuration = setBreakSecArg ? parseInt(setBreakSecArg, 10) : 10;
  console.log(`\nRendering set break (${breakDuration}s) ...`);
  const cmd = [
    "npx remotion render",
    bundlePath,
    "SetBreak",
    outputPath,
    `--gl=${glArg}`,
    `--timeout=600000`,
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
    `--timeout=600000`,
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

  // Build segue set — songs whose predecessor has segueInto: true
  const segueIntoSet = new Set<string>();
  const setlistSongs: SetlistEntry[] = JSON.parse(readFileSync(join(DATA_DIR, "setlist.json"), "utf-8")).songs;
  for (let i = 1; i < setlistSongs.length; i++) {
    if (setlistSongs[i - 1].segueInto) {
      segueIntoSet.add(setlistSongs[i].trackId);
    }
  }

  const entries: string[] = [];
  let prevSet = rendered[0]?.set ?? 1;
  let chaptersInserted = 0;

  for (const { path, set, trackId } of rendered) {
    // Insert set break between sets
    if (set !== prevSet && prevSet !== 0 && set !== 0 && !noSetBreaks) {
      const breakPath = renderSetBreak(bundlePath);
      entries.push(`file '${breakPath}'`);
      console.log(`  Inserted set break between set ${prevSet} and set ${set}`);
    }

    // Insert "before" chapter cards (skip for segue-into songs — music flows continuously)
    if (!noChapters && trackId && !segueIntoSet.has(trackId)) {
      const beforeIndices = chaptersBefore.get(trackId);
      if (beforeIndices) {
        for (const idx of beforeIndices) {
          const chapterPath = renderChapterCard(idx, bundlePath);
          entries.push(`file '${chapterPath}'`);
          chaptersInserted++;
          console.log(`  Inserted chapter ${idx} before ${trackId}`);
        }
      }
    } else if (!noChapters && trackId && segueIntoSet.has(trackId)) {
      const beforeIndices = chaptersBefore.get(trackId);
      if (beforeIndices?.length) {
        console.log(`  SEGUE: skipped ${beforeIndices.length} chapter card(s) before ${trackId}`);
      }
    }

    entries.push(`file '${path}'`);

    // Insert "after" chapter cards (after this song)
    if (!noChapters && trackId) {
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
  // Apply fps override (analysis data stays at 30fps, Root.tsx scales frame counts)
  const renderFps = fpsArg ? parseInt(fpsArg, 10) : 30;
  process.env.RENDER_FPS = String(renderFps);
  if (renderFps !== 30) {
    console.log(`FPS: ${renderFps} (analysis interpolated from 30fps)`);
  }

  // Apply preset or legacy resolution logic
  if (activePreset) {
    process.env.RENDER_WIDTH = String(activePreset.width);
    process.env.RENDER_HEIGHT = String(activePreset.height);
    process.env.RENDER_QUALITY = presetArg ?? (draftMode ? "draft" : "preview");
    if (activePreset.skipGrain) process.env.SKIP_GRAIN = "1";
    if (activePreset.skipBloom) process.env.SKIP_BLOOM = "1";
    console.log(`Preset: ${activePreset.label}`);
  } else {
    process.env.RENDER_WIDTH = previewMode ? "1920" : "3840";
    process.env.RENDER_HEIGHT = previewMode ? "1080" : "2160";
  }
  // Adaptive concurrency: scale based on resolution and available CPU cores
  const numCores = cpus().length;
  const renderWidth = parseInt(process.env.RENDER_WIDTH ?? "1920", 10);
  const pixelScale = (renderWidth * parseInt(process.env.RENDER_HEIGHT ?? "1080", 10)) / (1920 * 1080);
  const adaptiveConcurrency = activePreset?.concurrency ?? Math.max(4, Math.floor(numCores / pixelScale));
  console.log(`Resolution: ${process.env.RENDER_WIDTH}x${process.env.RENDER_HEIGHT} | Concurrency: ${adaptiveConcurrency} (${numCores} cores)`);

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
    if (track && !track.missing) {
      totalFrames += previewMode ? Math.min(PREVIEW_FRAMES, track.totalFrames) : track.totalFrames;
    }
  }

  console.log(`\nRendering ${songsToRender.length} track(s) with gl=${glArg}, chunk=${chunkSize}`);
  console.log(`Total frames: ${totalFrames.toLocaleString()} (${(totalFrames / renderFps / 60).toFixed(1)} min of video at ${renderFps}fps)`);
  console.log(`Strategy: video-only chunks + original audio mux`);
  console.log("=".repeat(60));

  const rendered: { path: string; set: number; trackId?: string }[] = [];
  const startTime = Date.now();
  let framesRendered = 0;

  if (!trackFilter && !previewMode && !noIntro) {
    try {
      const introPath = renderShowIntro(bundlePath);
      if (introPath) {
        rendered.push({ path: introPath, set: 0 });
      }
    } catch (e) {
      console.warn("\n⚠ Show intro render failed (OffthreadVideo timeout at 4K) — skipping intro");
      console.warn("  Re-run with --no-intro to skip, or render intro separately at 1080p\n");
    }
  }

  for (const song of songsToRender) {
    const track = tracks.find((t: TimelineTrack) => t.trackId === song.trackId);
    if (!track || track.missing || track.totalFrames === 0) {
      console.log(`SKIP: ${song.trackId} — no analysis data`);
      continue;
    }

    const outputPath = previewMode
      ? join(SONGS_DIR, `${song.trackId}-preview.mp4`)
      : join(SONGS_DIR, `${song.trackId}.mp4`);
    const renderFrames = previewMode ? Math.min(PREVIEW_FRAMES, track.totalFrames) : track.totalFrames;

    if (resume && existsSync(outputPath)) {
      console.log(`RESUME: ${song.trackId} already rendered`);
      rendered.push({ path: outputPath, set: song.set, trackId: song.trackId });
      framesRendered += renderFrames;
    } else {
      const analysisPath = join(TRACKS_DIR, `${song.trackId}-analysis.json`);

      console.log(`\n[${ (framesRendered / totalFrames * 100).toFixed(0) }%] Rendering: ${song.title} (${song.trackId}) — ${renderFrames} frames${previewMode ? " (PREVIEW)" : ""}`);

      const songStart = Date.now();
      renderSong(song, renderFrames, analysisPath, outputPath, bundlePath, adaptiveConcurrency);
      const songElapsed = (Date.now() - songStart) / 1000;
      const songFps = renderFrames / songElapsed;

      framesRendered += renderFrames;
      const elapsed = (Date.now() - startTime) / 1000;
      const fps = framesRendered / elapsed;
      const remaining = (totalFrames - framesRendered) / fps;
      console.log(`  Song: ${renderFrames} frames in ${(songElapsed / 60).toFixed(1)}m (${songFps.toFixed(1)} fps)`);
      console.log(`  Progress: ${framesRendered.toLocaleString()}/${totalFrames.toLocaleString()} frames (${fps.toFixed(1)} eff. fps, ~${(remaining / 60).toFixed(0)}m remaining)`);

      rendered.push({ path: outputPath, set: song.set, trackId: song.trackId });
    }
  }

  if (!trackFilter && !previewMode && !noEndCard) {
    try {
      const endCardPath = renderEndCard(bundlePath);
      rendered.push({ path: endCardPath, set: 0 });
    } catch (e) {
      console.warn("\n⚠ End card render failed — skipping");
    }
  }

  if (!trackFilter && !previewMode && rendered.length > 1) {
    concatShow(rendered, bundlePath, chapters);
  }

  // Write variation metadata
  const variationMeta = {
    seed: renderSeed,
    showDate: showDateArg ?? setlist.date,
    renderedAt: new Date().toISOString(),
    tracksRendered: rendered.length,
    totalFrames,
    previewMode,
  };
  writeFileSync(
    join(OUT_DIR, "variation-meta.json"),
    JSON.stringify(variationMeta, null, 2),
  );
  console.log(`\nVariation seed: ${renderSeed}`);

  const totalElapsed = (Date.now() - startTime) / 1000;
  console.log(`Done! Rendered ${rendered.length} segment(s) in ${(totalElapsed / 60).toFixed(1)} minutes.`);
}

main();
