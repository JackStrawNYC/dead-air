/**
 * Worker thread for parallel per-song manifest generation.
 *
 * Each worker processes one song: loads analysis, runs batch precompute,
 * generates per-frame routing + uniforms, returns the frame array.
 *
 * The main thread orchestrates: distributes songs to workers, collects
 * results, merges frame arrays in order, writes the manifest.
 */

import { parentPort, workerData } from "worker_threads";

// The worker receives all necessary data via workerData and runs
// the song processing function, returning the frame array.
// We import the processing logic from the main module.

if (!parentPort) {
  throw new Error("This file must be run as a worker thread");
}

// Dynamically import the processing function
async function run() {
  const { processSong } = await import("./generate-full-manifest.js");
  const { songData, songIdx, totalSongs, shaders, fps, width, height, showVisualSeed, globalTimeOffset } = workerData;

  try {
    const result = await processSong(songData, songIdx, totalSongs, shaders, fps, width, height, showVisualSeed, globalTimeOffset);
    parentPort!.postMessage({ type: "done", songIdx, frames: result.frames, shaderUsage: result.shaderUsage });
  } catch (err: any) {
    parentPort!.postMessage({ type: "error", songIdx, error: err.message });
  }
}

run();
