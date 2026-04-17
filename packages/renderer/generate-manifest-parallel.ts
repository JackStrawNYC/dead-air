#!/usr/bin/env npx tsx
/**
 * Parallel manifest generator — processes songs concurrently.
 *
 * Splits the show into per-song chunks, processes N songs in parallel
 * using child_process.fork(), then merges results into one manifest.
 *
 * Usage:
 *   npx tsx generate-manifest-parallel.ts --data-dir <path> --output <path> \
 *     --fps 30 --width 1920 --height 1080 --concurrency 6
 */

import { fork } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, createWriteStream } from "fs";
import { join, resolve } from "path";
import { cpus } from "os";

const args = process.argv.slice(2);
const getArg = (name: string, def: string) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : def;
};

const dataDir = getArg("data-dir", "data");
const outputPath = getArg("output", "manifest.json");
const fps = parseInt(getArg("fps", "30"));
const width = parseInt(getArg("width", "1920"));
const height = parseInt(getArg("height", "1080"));
const concurrency = parseInt(getArg("concurrency", String(Math.max(1, cpus().length - 1))));
const withOverlays = args.includes("--with-overlays");
const overlayPngDir = getArg("overlay-png-dir", "overlay-pngs");

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const SINGLE_SONG_SCRIPT = join(SCRIPT_DIR, "generate-full-manifest.ts");

console.log(`[parallel-manifest] Concurrency: ${concurrency} workers`);
console.log(`[parallel-manifest] Data: ${dataDir}`);
console.log(`[parallel-manifest] Output: ${outputPath}`);
console.log(`[parallel-manifest] ${width}x${height} @ ${fps}fps`);
if (withOverlays) {
  console.log(`[parallel-manifest] Overlays: ENABLED (PNG dir: ${overlayPngDir})`);
}

// Load setlist
const setlist = JSON.parse(readFileSync(join(dataDir, "setlist.json"), "utf-8"));
const songs = setlist.songs ?? [];
console.log(`[parallel-manifest] Show: ${setlist.venue} — ${setlist.date} (${songs.length} songs)`);

// Create temp dir for per-song manifests
const tempDir = join(dataDir, "renders", ".manifest-chunks");
mkdirSync(tempDir, { recursive: true });

// Check which songs have analysis
const validSongs: { song: any; idx: number; trackPath: string }[] = [];
for (let i = 0; i < songs.length; i++) {
  const trackPath = join(dataDir, "tracks", `${songs[i].trackId}-analysis.json`);
  if (existsSync(trackPath)) {
    validSongs.push({ song: songs[i], idx: i, trackPath });
  } else {
    console.warn(`  SKIP: ${songs[i].title} (no analysis)`);
  }
}
console.log(`[parallel-manifest] ${validSongs.length} songs to process`);

// Process songs in parallel batches
interface SongResult {
  idx: number;
  framesPath: string;
  frameCount: number;
  shaderUsage: Record<string, number>;
}

async function processSongInChild(songEntry: typeof validSongs[0]): Promise<SongResult> {
  const { song, idx } = songEntry;
  const framesPath = join(tempDir, `song-${String(idx).padStart(3, "0")}-frames.json`);

  // Skip if already processed (resumable!)
  if (existsSync(framesPath)) {
    const existing = JSON.parse(readFileSync(framesPath, "utf-8"));
    console.log(`  [${idx + 1}/${songs.length}] ${song.title} — cached (${existing.length} frames)`);
    return { idx, framesPath, frameCount: existing.length, shaderUsage: {} };
  }

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // Fork the single-song manifest generator with special args
    const childArgs = [
      "--data-dir", dataDir,
      "--output", framesPath,
      "--fps", String(fps),
      "--width", String(width),
      "--height", String(height),
      "--single-song", String(idx),  // NEW: process only this song
    ];
    if (withOverlays) {
      childArgs.push("--with-overlays", "--overlay-png-dir", overlayPngDir);
    }
    const child = fork(SINGLE_SONG_SCRIPT, childArgs, {
      execArgv: ["--require", require.resolve("tsx/cjs")].filter(() => false), // tsx handles this
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { process.stderr.write(d); });

    child.on("close", (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (code === 0 && existsSync(framesPath)) {
        const frames = JSON.parse(readFileSync(framesPath, "utf-8"));
        console.log(`  ✓ [${idx + 1}/${songs.length}] ${song.title} — ${frames.length} frames in ${elapsed}s`);
        resolve({ idx, framesPath, frameCount: frames.length, shaderUsage: {} });
      } else {
        console.error(`  ✗ [${idx + 1}/${songs.length}] ${song.title} — failed (code ${code})`);
        // Write empty array so it doesn't block retry
        writeFileSync(framesPath, "[]");
        resolve({ idx, framesPath, frameCount: 0, shaderUsage: {} });
      }
    });

    child.on("error", (err) => {
      console.error(`  ✗ [${idx + 1}/${songs.length}] ${song.title} — error: ${err.message}`);
      writeFileSync(framesPath, "[]");
      resolve({ idx, framesPath, frameCount: 0, shaderUsage: {} });
    });
  });
}

async function main() {
  const results: SongResult[] = [];
  const startTime = Date.now();

  // Process in batches of `concurrency`
  for (let batch = 0; batch < validSongs.length; batch += concurrency) {
    const batchSongs = validSongs.slice(batch, batch + concurrency);
    console.log(`\n[parallel-manifest] Batch ${Math.floor(batch / concurrency) + 1}: songs ${batch + 1}-${batch + batchSongs.length}`);

    const batchResults = await Promise.all(batchSongs.map(processSongInChild));
    results.push(...batchResults);
  }

  // Sort by song index
  results.sort((a, b) => a.idx - b.idx);

  const totalFrames = results.reduce((sum, r) => sum + r.frameCount, 0);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[parallel-manifest] All songs processed: ${totalFrames} frames in ${elapsed}s`);

  // Merge: collect GLSL shaders + stream-write merged frames
  console.log("[parallel-manifest] Collecting GLSL shaders...");
  // Import collectShaderGLSL from the main module
  const { collectShaderGLSL } = await import("./generate-full-manifest.js");
  const shaders = await collectShaderGLSL();
  console.log(`[parallel-manifest] ${Object.keys(shaders).length} shaders`);

  console.log("[parallel-manifest] Writing merged manifest...");
  const ws = createWriteStream(outputPath);
  ws.write('{"shaders":');
  ws.write(JSON.stringify(shaders));
  ws.write(`,"width":${width},"height":${height},"fps":${fps}`);
  ws.write(`,"show_title":${JSON.stringify(`${setlist.venue} — ${setlist.date}`)}`);
  ws.write(',"frames":[\n');

  let frameIdx = 0;
  for (const result of results) {
    if (result.frameCount === 0) continue;
    const frames = JSON.parse(readFileSync(result.framesPath, "utf-8"));
    for (let i = 0; i < frames.length; i++) {
      if (frameIdx > 0) ws.write(",\n");
      frames[i].frame = frameIdx; // renumber globally
      ws.write(JSON.stringify(frames[i]));
      frameIdx++;
    }
    if (frameIdx % 50000 === 0) {
      process.stdout.write(`  ${(frameIdx / totalFrames * 100).toFixed(0)}% written\r`);
    }
  }

  ws.write("\n]"); // close frames array

  // Merge overlay schedules from per-song overlay files
  if (withOverlays) {
    console.log("[parallel-manifest] Merging overlay schedules...");
    let overlayFrameCount = 0;
    ws.write(',"overlay_schedule":[\n');
    let firstOverlayFrame = true;

    for (const result of results) {
      if (result.frameCount === 0) continue;
      const overlayPath = result.framesPath.replace("-frames.json", "-overlays.json");
      if (existsSync(overlayPath)) {
        const songOverlays = JSON.parse(readFileSync(overlayPath, "utf-8"));
        for (let i = 0; i < songOverlays.length; i++) {
          if (!firstOverlayFrame) ws.write(",\n");
          ws.write(JSON.stringify(songOverlays[i]));
          firstOverlayFrame = false;
          overlayFrameCount++;
        }
      } else {
        // Fill with empty arrays for frames without overlay data
        for (let i = 0; i < result.frameCount; i++) {
          if (!firstOverlayFrame) ws.write(",\n");
          ws.write("[]");
          firstOverlayFrame = false;
          overlayFrameCount++;
        }
      }
    }

    ws.write("\n]"); // close overlay_schedule array
    ws.write(`,"overlay_png_dir":${JSON.stringify(resolve(overlayPngDir))}`);
    console.log(`[parallel-manifest] Overlay schedule: ${overlayFrameCount} frames merged`);
  }

  ws.write("}"); // close root object
  ws.end();

  await new Promise<void>((res) => ws.on("finish", res));

  console.log(`\n[parallel-manifest] Done: ${outputPath} (${frameIdx} frames)`);
  console.log(`[parallel-manifest] Total time: ${elapsed}s`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
