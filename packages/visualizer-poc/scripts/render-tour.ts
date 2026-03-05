#!/usr/bin/env npx tsx
/**
 * render-tour.ts — Multi-show tour highlight reel renderer.
 *
 * Renders a highlight reel across multiple shows:
 *   1. Tour intro card
 *   2. Per-show: chapter card + top 3 songs by energy
 *   3. Concatenates via FFmpeg
 *
 * Usage:
 *   npx tsx scripts/render-tour.ts --tour spring-77
 *   npx tsx scripts/render-tour.ts --tour spring-77 --top=5     # top 5 songs per show
 *   npx tsx scripts/render-tour.ts --tour spring-77 --preview   # 10s preview per song
 *   npx tsx scripts/render-tour.ts --shows 1977-05-01,1977-05-05,1977-05-08
 *
 * Requirements:
 *   - Each show must have been processed (setlist.json, analysis, audio)
 *   - Data dirs at: ../../data/shows/{date}/ or per show's visualizer data
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = join(ROOT, "out");
const TOURS_DIR = join(OUT_DIR, "tours");

// ─── Tour presets ───
const TOUR_PRESETS: Record<string, { name: string; dateRange: string; shows: string[] }> = {
  "spring-77": {
    name: "Spring 1977",
    dateRange: "April 22 - May 28, 1977",
    shows: [
      "1977-04-22",
      "1977-04-23",
      "1977-04-25",
      "1977-04-27",
      "1977-04-29",
      "1977-04-30",
      "1977-05-01",
      "1977-05-04",
      "1977-05-05",
      "1977-05-07",
      "1977-05-08",
      "1977-05-09",
      "1977-05-11",
      "1977-05-12",
      "1977-05-13",
      "1977-05-15",
      "1977-05-17",
      "1977-05-18",
      "1977-05-19",
      "1977-05-21",
      "1977-05-22",
      "1977-05-25",
      "1977-05-26",
      "1977-05-28",
    ],
  },
  "fall-89": {
    name: "Fall 1989",
    dateRange: "October 1 - December 31, 1989",
    shows: [],
  },
  "europe-72": {
    name: "Europe '72",
    dateRange: "April 7 - May 26, 1972",
    shows: [],
  },
};

// ─── CLI args ───
const args = process.argv.slice(2);
const tourArg = args.find((a) => a.startsWith("--tour="))?.split("=")[1];
const showsArg = args.find((a) => a.startsWith("--shows="))?.split("=")[1];
const topN = parseInt(args.find((a) => a.startsWith("--top="))?.split("=")[1] ?? "3", 10);
const previewMode = args.includes("--preview");
const glArg = args.find((a) => a.startsWith("--gl="))?.split("=")[1] ?? "angle";
const PREVIEW_FRAMES = 300; // 10 seconds

interface ShowSong {
  trackId: string;
  title: string;
  set: number;
  avgEnergy: number;
  peakEnergy: number;
  score: number;
  totalFrames: number;
}

interface ShowData {
  date: string;
  venue: string;
  songs: ShowSong[];
  dataDir: string;
}

/**
 * Load and rank songs from a show's data directory.
 */
function loadShowData(showDate: string): ShowData | null {
  // Try multiple locations for show data
  const possibleDirs = [
    join(ROOT, "data"),  // current visualizer data
    join(ROOT, "..", "..", "data", "shows", showDate),
  ];

  let dataDir: string | null = null;
  for (const dir of possibleDirs) {
    if (existsSync(join(dir, "setlist.json"))) {
      dataDir = dir;
      break;
    }
  }

  if (!dataDir) {
    console.warn(`  SKIP: No data for ${showDate}`);
    return null;
  }

  const setlist = JSON.parse(readFileSync(join(dataDir, "setlist.json"), "utf-8"));
  const timelinePath = join(dataDir, "show-timeline.json");

  if (!existsSync(timelinePath)) {
    console.warn(`  SKIP: No timeline for ${showDate}`);
    return null;
  }

  const timeline = JSON.parse(readFileSync(timelinePath, "utf-8"));
  const tracks: Array<{ trackId: string; totalFrames: number; missing?: boolean }> = timeline.tracks;

  const songs: ShowSong[] = [];

  for (const song of setlist.songs) {
    const track = tracks.find((t) => t.trackId === song.trackId);
    if (!track || track.missing) continue;

    // Try to load per-track analysis for energy scoring
    const analysisPath = join(dataDir, "tracks", `${song.trackId}-analysis.json`);
    let avgEnergy = 0.3;
    let peakEnergy = 0.5;

    if (existsSync(analysisPath)) {
      try {
        const analysis = JSON.parse(readFileSync(analysisPath, "utf-8"));
        const frames: Array<{ rms: number }> = analysis.frames;
        if (frames?.length > 0) {
          avgEnergy = frames.reduce((sum, f) => sum + f.rms, 0) / frames.length;
          peakEnergy = Math.max(...frames.map((f) => f.rms));
        }
      } catch {
        // Use defaults
      }
    }

    const score = avgEnergy * 0.6 + peakEnergy * 0.4;

    songs.push({
      trackId: song.trackId,
      title: song.title,
      set: song.set,
      avgEnergy,
      peakEnergy,
      score,
      totalFrames: track.totalFrames,
    });
  }

  return {
    date: showDate,
    venue: setlist.venue ?? showDate,
    songs,
    dataDir,
  };
}

function main() {
  if (!tourArg && !showsArg) {
    console.error("Usage: render-tour.ts --tour=spring-77");
    console.error("   or: render-tour.ts --shows=1977-05-01,1977-05-08");
    console.error(`\nAvailable tours: ${Object.keys(TOUR_PRESETS).join(", ")}`);
    process.exit(1);
  }

  let tourName: string;
  let dateRange: string;
  let showDates: string[];

  if (tourArg) {
    const preset = TOUR_PRESETS[tourArg];
    if (!preset) {
      console.error(`Unknown tour: ${tourArg}`);
      console.error(`Available: ${Object.keys(TOUR_PRESETS).join(", ")}`);
      process.exit(1);
    }
    tourName = preset.name;
    dateRange = preset.dateRange;
    showDates = preset.shows;
  } else {
    showDates = showsArg!.split(",").map((s) => s.trim());
    tourName = `Tour Highlights`;
    dateRange = `${showDates[0]} - ${showDates[showDates.length - 1]}`;
  }

  console.log(`\nTour: ${tourName}`);
  console.log(`Shows: ${showDates.length}`);
  console.log(`Top songs per show: ${topN}`);
  console.log(`Preview: ${previewMode}\n`);

  // Load available shows
  const shows: ShowData[] = [];
  for (const date of showDates) {
    const data = loadShowData(date);
    if (data) shows.push(data);
  }

  if (shows.length === 0) {
    console.error("No shows found with available data.");
    process.exit(1);
  }

  console.log(`\nLoaded ${shows.length} show(s) with data.\n`);

  // Select top songs per show
  const highlights: Array<{ show: ShowData; songs: ShowSong[] }> = [];
  for (const show of shows) {
    const ranked = [...show.songs].sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, topN);
    highlights.push({ show, songs: top });
    console.log(`  ${show.date} (${show.venue}):`);
    for (const s of top) {
      console.log(`    ${s.title} — energy ${s.score.toFixed(3)}`);
    }
  }

  // Create output directory
  const tourDir = join(TOURS_DIR, tourArg ?? "custom");
  mkdirSync(tourDir, { recursive: true });

  // Build concat list
  const segments: string[] = [];

  // TODO: Render TourIntroCard composition when Remotion entry is wired up
  // For now, we skip the intro and just render the song segments
  console.log(`\nRendering ${highlights.reduce((n, h) => n + h.songs.length, 0)} song highlights ...\n`);

  for (const { show, songs } of highlights) {
    for (const song of songs) {
      const outputPath = join(tourDir, `${show.date}-${song.trackId}.mp4`);
      const analysisPath = join(show.dataDir, "tracks", `${song.trackId}-analysis.json`);
      const audioPath = join(ROOT, "public", "audio", `gd${show.date.replace(/-/g, "").slice(2)}-${song.trackId}.mp3`);

      if (existsSync(outputPath)) {
        console.log(`  SKIP: ${show.date} ${song.title} (exists)`);
        segments.push(outputPath);
        continue;
      }

      if (!existsSync(analysisPath)) {
        console.log(`  SKIP: ${show.date} ${song.title} (no analysis)`);
        continue;
      }

      const renderFrames = previewMode
        ? Math.min(PREVIEW_FRAMES, song.totalFrames)
        : song.totalFrames;

      console.log(`  Rendering: ${show.date} ${song.title} (${renderFrames} frames) ...`);

      try {
        // Render video-only
        const videoOnly = join(tourDir, `${show.date}-${song.trackId}-video.mp4`);
        execSync(
          [
            "npx remotion render",
            join(OUT_DIR, "bundle"),
            song.trackId,
            videoOnly,
            `--props=${analysisPath}`,
            `--gl=${glArg}`,
            `--frames=0-${renderFrames - 1}`,
            "--muted",
          ].join(" "),
          { cwd: ROOT, stdio: "pipe" },
        );

        // Mux audio if available
        if (existsSync(audioPath)) {
          execSync(
            `ffmpeg -y -i "${videoOnly}" -i "${audioPath}" -c:v copy -c:a aac -ar 48000 -b:a 320k -shortest "${outputPath}"`,
            { cwd: ROOT, stdio: "pipe" },
          );
        } else {
          // Just rename video-only
          execSync(`mv "${videoOnly}" "${outputPath}"`, { stdio: "pipe" });
        }

        segments.push(outputPath);
        console.log(`    OK`);
      } catch (err: any) {
        console.error(`    FAIL: ${err.message}`);
      }
    }
  }

  if (segments.length === 0) {
    console.error("No segments rendered.");
    process.exit(1);
  }

  // Concatenate all segments
  const concatList = join(tourDir, "concat.txt");
  writeFileSync(concatList, segments.map((s) => `file '${s}'`).join("\n"));

  const tourOutput = join(tourDir, `${tourArg ?? "custom"}-highlights.mp4`);
  console.log(`\nConcatenating ${segments.length} segments ...`);
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c:v copy -c:a copy "${tourOutput}"`,
    { cwd: ROOT, stdio: "inherit" },
  );

  // Write tour metadata
  const tourMeta = {
    name: tourName,
    dateRange,
    shows: highlights.map((h) => ({
      date: h.show.date,
      venue: h.show.venue,
      highlights: h.songs.map((s) => ({
        trackId: s.trackId,
        title: s.title,
        score: s.score,
      })),
    })),
    segments: segments.length,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(tourDir, "tour-meta.json"), JSON.stringify(tourMeta, null, 2));

  console.log(`\nTour highlight reel: ${tourOutput}`);
  console.log(`Tour metadata: ${join(tourDir, "tour-meta.json")}`);
  console.log(`Done!`);
}

main();
