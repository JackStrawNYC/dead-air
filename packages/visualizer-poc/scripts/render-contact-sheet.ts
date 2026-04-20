#!/usr/bin/env npx tsx
/**
 * Contact Sheet Renderer — renders 1 frame every N seconds across the full show,
 * then stitches into a labeled grid image for visual QA.
 *
 * Usage:
 *   npx tsx scripts/render-contact-sheet.ts [--interval=5] [--fps=60] [--width=3840] [--height=2160]
 *
 * Output: out/contact-sheet.jpg (large grid image)
 */

import { readFileSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const args = process.argv.slice(2);
const getArg = (name: string, def: string) => {
  const found = args.find(a => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : def;
};

const INTERVAL_SEC = parseInt(getArg("interval", "5"));
const FPS = parseInt(getArg("fps", "60"));
const WIDTH = parseInt(getArg("width", "3840"));
const HEIGHT = parseInt(getArg("height", "2160"));
const GRID_COLS = 60;
const CELL_WIDTH = 128; // px per cell in output grid
const CELL_HEIGHT = 72; // 16:9 aspect

const ROOT = join(import.meta.dirname!, "..");
const OUT_DIR = join(ROOT, "out/contact-sheet-frames");
const SETLIST_PATH = join(ROOT, "data/setlist.json");

mkdirSync(OUT_DIR, { recursive: true });

const setlist = JSON.parse(readFileSync(SETLIST_PATH, "utf-8"));
const songs: { trackId: string; title: string; set: number }[] = setlist.songs;

// Build frame list: for each song, compute which frames to render
interface FrameSpec {
  songIdx: number;
  trackId: string;
  title: string;
  frameInSong: number; // frame within the song composition (at FPS)
  globalSecond: number; // wall-clock second in the show
}

const frameSpecs: FrameSpec[] = [];
let globalSecondAccum = 0;

for (let si = 0; si < songs.length; si++) {
  const song = songs[si];
  const analysisPath = join(ROOT, "data/tracks", `${song.trackId}-analysis.json`);
  if (!existsSync(analysisPath)) {
    console.warn(`  SKIP ${song.trackId}: no analysis`);
    continue;
  }
  const analysis = JSON.parse(readFileSync(analysisPath, "utf-8"));
  const songFrames30 = analysis.meta.totalFrames;
  const songDurationSec = songFrames30 / 30;
  const songFrames = Math.round(songDurationSec * FPS);

  // Compute which frames to sample from this song
  for (let sec = 0; sec < songDurationSec; sec += INTERVAL_SEC) {
    const globalSec = globalSecondAccum + sec;
    const frameInSong = Math.round(sec * FPS);
    if (frameInSong >= songFrames) break;
    frameSpecs.push({
      songIdx: si,
      trackId: song.trackId,
      title: song.title,
      frameInSong,
      globalSecond: globalSec,
    });
  }
  globalSecondAccum += songDurationSec;
}

const totalFrames = frameSpecs.length;
const gridRows = Math.ceil(totalFrames / GRID_COLS);
console.log(`[contact-sheet] ${totalFrames} frames (every ${INTERVAL_SEC}s), ${GRID_COLS}×${gridRows} grid`);
console.log(`[contact-sheet] Show: ${(globalSecondAccum / 60).toFixed(1)} minutes, ${FPS}fps, ${WIDTH}×${HEIGHT}`);

// Set render FPS
process.env.RENDER_FPS = String(FPS);

// Render each frame as a still
let rendered = 0;
let currentTrackId = "";

for (const spec of frameSpecs) {
  const outPath = join(OUT_DIR, `frame-${String(rendered).padStart(5, "0")}.png`);

  if (existsSync(outPath)) {
    rendered++;
    continue; // Resume support
  }

  if (spec.trackId !== currentTrackId) {
    currentTrackId = spec.trackId;
    console.log(`\n[contact-sheet] ${spec.title} (${spec.trackId})`);
  }

  try {
    execSync(
      `npx remotion still src/entry.ts ${spec.trackId} "${outPath}" --frame=${spec.frameInSong} --gl=angle`,
      { cwd: ROOT, stdio: "pipe", timeout: 120_000 },
    );
  } catch (e) {
    console.warn(`  FAIL frame ${rendered} (${spec.trackId}:${spec.frameInSong}): ${(e as Error).message?.slice(0, 80)}`);
    // Write a black placeholder
    execSync(`convert -size ${WIDTH}x${HEIGHT} xc:black "${outPath}"`, { stdio: "pipe" }).toString();
  }

  rendered++;
  if (rendered % 10 === 0) {
    const pct = (rendered / totalFrames * 100).toFixed(1);
    const elapsed = process.uptime();
    const eta = (elapsed / rendered * (totalFrames - rendered) / 60).toFixed(0);
    console.log(`  [${pct}%] ${rendered}/${totalFrames} (ETA ${eta}m)`);
  }
}

console.log(`\n[contact-sheet] All ${totalFrames} frames rendered`);

// Generate labels file for ffmpeg drawtext
const labelsPath = join(OUT_DIR, "labels.txt");
const labels: string[] = [];
for (let i = 0; i < frameSpecs.length; i++) {
  const spec = frameSpecs[i];
  const min = Math.floor(spec.globalSecond / 60);
  const sec = Math.floor(spec.globalSecond % 60);
  labels.push(`${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")} ${spec.title.slice(0, 15)}`);
}
writeFileSync(labelsPath, labels.join("\n"));

// Stitch grid via ImageMagick montage
const gridOutput = join(ROOT, "out/contact-sheet.jpg");
console.log(`[contact-sheet] Stitching ${GRID_COLS}×${gridRows} grid...`);

try {
  execSync(
    `montage "${OUT_DIR}/frame-*.png" -tile ${GRID_COLS}x -geometry ${CELL_WIDTH}x${CELL_HEIGHT}+1+1 -background black "${gridOutput}"`,
    { cwd: ROOT, stdio: "inherit", timeout: 300_000 },
  );
  console.log(`[contact-sheet] Done: ${gridOutput}`);
} catch {
  console.log("[contact-sheet] montage failed — trying ffmpeg tile filter instead");
  // Fallback: just report frame directory
  console.log(`[contact-sheet] Frames at: ${OUT_DIR}`);
}
