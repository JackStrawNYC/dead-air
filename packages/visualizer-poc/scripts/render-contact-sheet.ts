#!/usr/bin/env npx tsx
/**
 * Contact Sheet Renderer — pre-bundles ONCE, then renders stills from the bundle.
 *
 * The key optimization: `remotion bundle` creates a webpack bundle on disk,
 * then `remotion still --bundle=<path>` renders from it without re-bundling.
 * This drops per-frame cost from ~10s (rebundle each time) to ~0.5s.
 *
 * Usage:
 *   npx tsx scripts/render-contact-sheet.ts [--interval=5] [--fps=60]
 *
 * Output: out/contact-sheet.jpg
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
const CELL_WIDTH = 128;
const CELL_HEIGHT = 72;
const GRID_COLS = 60;

const ROOT = join(import.meta.dirname!, "..");
const OUT_DIR = join(ROOT, "out/contact-sheet-frames");
const BUNDLE_DIR = join(ROOT, "out/remotion-bundle");
const SETLIST_PATH = join(ROOT, "data/setlist.json");

mkdirSync(OUT_DIR, { recursive: true });

const setlist = JSON.parse(readFileSync(SETLIST_PATH, "utf-8"));
const songs: { trackId: string; title: string; set: number }[] = setlist.songs;

// ─── Step 1: Pre-bundle once ───
process.env.RENDER_FPS = String(FPS);

if (!existsSync(join(BUNDLE_DIR, "index.html"))) {
  console.log("[contact-sheet] Pre-bundling Remotion project...");
  const start = Date.now();
  execSync(
    `npx remotion bundle src/entry.ts --out-dir="${BUNDLE_DIR}"`,
    { cwd: ROOT, stdio: "inherit", timeout: 300_000 },
  );
  console.log(`[contact-sheet] Bundle complete in ${((Date.now() - start) / 1000).toFixed(0)}s`);
} else {
  console.log("[contact-sheet] Using existing bundle at " + BUNDLE_DIR);
}

// ─── Step 2: Build frame list ───
interface FrameSpec {
  trackId: string;
  title: string;
  frameInSong: number;
  globalSecond: number;
}

const frameSpecs: FrameSpec[] = [];
let globalSecondAccum = 0;

for (const song of songs) {
  const analysisPath = join(ROOT, "data/tracks", `${song.trackId}-analysis.json`);
  if (!existsSync(analysisPath)) continue;
  const analysis = JSON.parse(readFileSync(analysisPath, "utf-8"));
  const songDurationSec = analysis.meta.totalFrames / 30;
  const songFrames = Math.round(songDurationSec * FPS);

  for (let sec = 0; sec < songDurationSec; sec += INTERVAL_SEC) {
    const frameInSong = Math.min(Math.round(sec * FPS), songFrames - 1);
    frameSpecs.push({
      trackId: song.trackId,
      title: song.title,
      frameInSong,
      globalSecond: globalSecondAccum + sec,
    });
  }
  globalSecondAccum += songDurationSec;
}

const totalFrames = frameSpecs.length;
const gridRows = Math.ceil(totalFrames / GRID_COLS);
console.log(`[contact-sheet] ${totalFrames} frames, ${GRID_COLS}×${gridRows} grid, ${FPS}fps`);

// ─── Step 3: Render all frames from pre-built bundle ───
const renderStart = Date.now();
let rendered = 0;
let currentTrackId = "";

for (const spec of frameSpecs) {
  const outPath = join(OUT_DIR, `frame-${String(rendered).padStart(5, "0")}.png`);

  if (existsSync(outPath)) {
    rendered++;
    continue;
  }

  if (spec.trackId !== currentTrackId) {
    currentTrackId = spec.trackId;
    console.log(`\n  ${spec.title} (${spec.trackId})`);
  }

  try {
    execSync(
      `npx remotion still "${BUNDLE_DIR}" ${spec.trackId} "${outPath}" --frame=${spec.frameInSong} --gl=angle`,
      { cwd: ROOT, stdio: "pipe", timeout: 60_000 },
    );
  } catch {
    // Black placeholder on failure
    try {
      execSync(`convert -size 3840x2160 xc:black "${outPath}"`, { stdio: "pipe" });
    } catch {
      writeFileSync(outPath, ""); // empty file as last resort
    }
  }

  rendered++;
  if (rendered % 50 === 0) {
    const elapsed = (Date.now() - renderStart) / 1000;
    const fps = rendered / elapsed;
    const eta = ((totalFrames - rendered) / fps / 60).toFixed(0);
    console.log(`  [${(rendered / totalFrames * 100).toFixed(1)}%] ${rendered}/${totalFrames} (${fps.toFixed(1)} fps, ETA ${eta}m)`);
  }
}

console.log(`\n[contact-sheet] ${rendered} frames rendered in ${((Date.now() - renderStart) / 1000 / 60).toFixed(1)}m`);

// ─── Step 4: Stitch grid ───
const gridOutput = join(ROOT, "out/contact-sheet.jpg");
console.log(`[contact-sheet] Stitching ${GRID_COLS}×${gridRows} grid...`);

try {
  execSync(
    `montage "${OUT_DIR}/frame-*.png" -tile ${GRID_COLS}x -geometry ${CELL_WIDTH}x${CELL_HEIGHT}+1+1 -background black "${gridOutput}"`,
    { cwd: ROOT, stdio: "inherit", timeout: 600_000 },
  );
  const sizeMB = (require("fs").statSync(gridOutput).size / 1048576).toFixed(1);
  console.log(`[contact-sheet] Done: ${gridOutput} (${sizeMB} MB)`);
} catch {
  console.log("[contact-sheet] montage failed — frames at: " + OUT_DIR);
}
