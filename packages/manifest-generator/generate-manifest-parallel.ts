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
import { join, resolve, extname } from "path";
import { cpus } from "os";
import { Packr } from "msgpackr";

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

// Detect MessagePack output. Rust loader (manifest.rs) supports both .msgpack/.mp
// extensions natively. MessagePack is ~5-10x smaller and ~5-10x faster to load.
const useMsgpack = (() => {
  const ext = extname(outputPath).toLowerCase();
  return ext === ".msgpack" || ext === ".mp";
})();

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
      execArgv: [], // tsx is already handling TypeScript
      stdio: ["ignore", "pipe", "pipe", "ipc"],
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

  // Build song boundaries for chapter cards
  const songBoundaries: { title: string; set: number; startFrame: number; endFrame: number }[] = [];
  {
    let boundaryOffset = 0;
    for (const result of results) {
      if (result.frameCount === 0) continue;
      const song = songs[result.idx];
      songBoundaries.push({
        title: song?.title ?? `Song ${result.idx + 1}`,
        set: song?.set ?? 1,
        startFrame: boundaryOffset,
        endFrame: boundaryOffset + result.frameCount,
      });
      boundaryOffset += result.frameCount;
    }
  }

  if (useMsgpack) {
    await writeManifestMsgpack(results, shaders, songBoundaries, totalFrames, elapsed);
  } else {
    await writeManifestJson(results, shaders, songBoundaries, totalFrames, elapsed);
  }
}

async function writeManifestJson(
  results: SongResult[],
  shaders: Record<string, string>,
  songBoundaries: { title: string; set: number; startFrame: number; endFrame: number }[],
  totalFrames: number,
  elapsed: string,
) {
  console.log("[parallel-manifest] Writing merged manifest (JSON)...");
  const ws = createWriteStream(outputPath);
  ws.write('{"shaders":');
  ws.write(JSON.stringify(shaders));
  ws.write(`,"width":${width},"height":${height},"fps":${fps}`);
  ws.write(`,"show_title":${JSON.stringify(`${setlist.venue} — ${setlist.date}`)}`);
  ws.write(`,"song_boundaries":${JSON.stringify(songBoundaries)}`);

  ws.write(',"frames":[\n');

  let frameIdx = 0;
  for (const result of results) {
    if (result.frameCount === 0) continue;
    const frames = JSON.parse(readFileSync(result.framesPath, "utf-8"));
    for (let i = 0; i < frames.length; i++) {
      if (frameIdx > 0) ws.write(",\n");
      frames[i].frame = frameIdx;
      ws.write(JSON.stringify(frames[i]));
      frameIdx++;
    }
    if (frameIdx % 50000 === 0) {
      process.stdout.write(`  ${(frameIdx / totalFrames * 100).toFixed(0)}% written\r`);
    }
  }

  ws.write("\n]");

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
        for (let i = 0; i < result.frameCount; i++) {
          if (!firstOverlayFrame) ws.write(",\n");
          ws.write("[]");
          firstOverlayFrame = false;
          overlayFrameCount++;
        }
      }
    }

    ws.write("\n]");
    ws.write(`,"overlay_png_dir":${JSON.stringify(resolve(overlayPngDir))}`);
    console.log(`[parallel-manifest] Overlay schedule: ${overlayFrameCount} frames merged`);
  }

  ws.write("}");
  ws.end();
  await new Promise<void>((res) => ws.on("finish", res));

  console.log(`\n[parallel-manifest] Done: ${outputPath} (${frameIdx} frames)`);
  console.log(`[parallel-manifest] Total time: ${elapsed}s`);
}

async function writeManifestMsgpack(
  results: SongResult[],
  shaders: Record<string, string>,
  songBoundaries: { title: string; set: number; startFrame: number; endFrame: number }[],
  totalFrames: number,
  elapsed: string,
) {
  console.log("[parallel-manifest] Writing merged manifest (MessagePack)...");
  console.log("[parallel-manifest] NOTE: msgpack path buffers all frames in RAM (~2-3GB peak for 60fps 3hr show)");

  // Assemble entire manifest in memory; msgpack pack is much more compact than JSON,
  // but still requires the full object graph. Per-song frames are loaded sequentially
  // and concatenated, so peak RSS is bounded by the merged frames array.
  const allFrames: any[] = new Array(totalFrames);
  let frameIdx = 0;
  for (const result of results) {
    if (result.frameCount === 0) continue;
    const frames = JSON.parse(readFileSync(result.framesPath, "utf-8"));
    for (let i = 0; i < frames.length; i++) {
      frames[i].frame = frameIdx;
      allFrames[frameIdx++] = frames[i];
    }
    if (frameIdx % 50000 === 0) {
      process.stdout.write(`  ${(frameIdx / totalFrames * 100).toFixed(0)}% loaded\r`);
    }
  }

  // Truncate in case of empty songs (rare).
  allFrames.length = frameIdx;

  const manifest: Record<string, unknown> = {
    shaders,
    width,
    height,
    fps,
    show_title: `${setlist.venue} — ${setlist.date}`,
    song_boundaries: songBoundaries,
    frames: allFrames,
  };

  if (withOverlays) {
    console.log("\n[parallel-manifest] Merging overlay schedules...");
    const overlaySchedule: any[] = new Array(totalFrames);
    let oi = 0;
    for (const result of results) {
      if (result.frameCount === 0) continue;
      const overlayPath = result.framesPath.replace("-frames.json", "-overlays.json");
      if (existsSync(overlayPath)) {
        const songOverlays = JSON.parse(readFileSync(overlayPath, "utf-8"));
        for (let i = 0; i < songOverlays.length; i++) overlaySchedule[oi++] = songOverlays[i];
      } else {
        for (let i = 0; i < result.frameCount; i++) overlaySchedule[oi++] = [];
      }
    }
    overlaySchedule.length = oi;
    manifest.overlay_schedule = overlaySchedule;
    manifest.overlay_png_dir = resolve(overlayPngDir);
    console.log(`[parallel-manifest] Overlay schedule: ${oi} frames merged`);
  }

  // useRecords MUST be false: Rust's rmp_serde only parses standard msgpack maps,
  // not msgpackr's "records" extension. structuredClone disabled — plain data, no cycles.
  // useFloat32: ALWAYS (1) cuts frame floats from 8B → 4B (≈50% smaller frame payload).
  // Rust FrameData fields are f32; we already lose nothing by truncating in transit.
  const packr = new Packr({ useRecords: false, structuredClone: false, useFloat32: 1 });
  console.log("[parallel-manifest] Packing msgpack...");
  const t0 = Date.now();
  const buffer = packr.pack(manifest);
  console.log(`[parallel-manifest] Packed in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${(buffer.length / 1048576).toFixed(1)} MB`);

  writeFileSync(outputPath, buffer);
  console.log(`\n[parallel-manifest] Done: ${outputPath} (${frameIdx} frames, ${(buffer.length / 1048576).toFixed(1)} MB)`);
  console.log(`[parallel-manifest] Total time: ${elapsed}s`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
