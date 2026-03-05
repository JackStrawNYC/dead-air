#!/usr/bin/env npx tsx
/**
 * Generate YouTube chapter timestamps from show data.
 *
 * Replicates the concat order from render-show.ts:
 *   ShowIntro → [before-chapter] → Song → [after-chapter] → ... → SetBreak → ... → EndCard
 *
 * Outputs YouTube-ready chapter text (copy/paste into video description).
 *
 * Usage:
 *   npx tsx scripts/generate-chapters.ts
 *   npx tsx scripts/generate-chapters.ts --include-cards   # also timestamp chapter cards
 *   npx tsx scripts/generate-chapters.ts --sub-chapters    # add listen-for, jam peaks, segues
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const TRACKS_DIR = join(DATA_DIR, "tracks");
const OUT_DIR = join(ROOT, "out");

// Constants matching Root.tsx / render-show.ts
const SHOW_INTRO_FRAMES = 465;   // 15.5s
const CHAPTER_CARD_FRAMES = 180; // 6s
const SET_BREAK_FRAMES = 300;    // 10s
const END_CARD_FRAMES = 360;     // 12s
const FPS = 30;
const JAM_MIN_FRAMES = 14400; // 8 minutes at 30fps — songs with jams

interface SetlistEntry {
  trackId: string;
  title: string;
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

interface NarrationSong {
  listenFor: string[];
  context?: string;
}

interface FrameData {
  rms: number;
}

function framesToTimestamp(frames: number): string {
  const totalSeconds = Math.floor(frames / FPS);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Find jam peak: 30-frame window with highest average RMS.
 * Only for songs > 8 minutes.
 */
function findJamPeak(trackId: string): number | null {
  const analysisPath = join(TRACKS_DIR, `${trackId}-analysis.json`);
  if (!existsSync(analysisPath)) return null;

  try {
    const analysis = JSON.parse(readFileSync(analysisPath, "utf-8"));
    const frames: FrameData[] = analysis.frames;
    if (!frames || frames.length < JAM_MIN_FRAMES) return null;

    const WINDOW = 30;
    let bestStart = 0;
    let bestAvg = 0;

    for (let i = 0; i <= frames.length - WINDOW; i++) {
      let sum = 0;
      for (let j = i; j < i + WINDOW; j++) {
        sum += frames[j].rms;
      }
      const avg = sum / WINDOW;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestStart = i;
      }
    }

    // Return center of the best window
    return bestStart + Math.floor(WINDOW / 2);
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const includeCards = args.includes("--include-cards");
  const subChapters = args.includes("--sub-chapters");

  // Load data
  const setlistPath = join(DATA_DIR, "setlist.json");
  const timelinePath = join(DATA_DIR, "show-timeline.json");
  const contextPath = join(DATA_DIR, "show-context.json");
  const narrationPath = join(DATA_DIR, "narration.json");

  if (!existsSync(setlistPath)) {
    console.error("ERROR: setlist.json not found");
    process.exit(1);
  }
  if (!existsSync(timelinePath)) {
    console.error("ERROR: show-timeline.json not found. Run: python scripts/analyze_show.py");
    process.exit(1);
  }

  const setlist = JSON.parse(readFileSync(setlistPath, "utf-8"));
  const timeline = JSON.parse(readFileSync(timelinePath, "utf-8"));
  const tracks: TimelineTrack[] = timeline.tracks;
  const songs: SetlistEntry[] = setlist.songs;

  // Load chapters (optional)
  let chapters: ChapterEntry[] = [];
  if (existsSync(contextPath)) {
    const ctx = JSON.parse(readFileSync(contextPath, "utf-8"));
    chapters = ctx.chapters ?? [];
  }

  // Load narration for sub-chapters
  let narrationSongs: Record<string, NarrationSong> = {};
  if (subChapters && existsSync(narrationPath)) {
    const narration = JSON.parse(readFileSync(narrationPath, "utf-8"));
    narrationSongs = narration.songs ?? {};
  }

  // Build chapter lookup maps
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

  // Walk the concat order, accumulating frame offsets
  const output: { timestamp: string; label: string; frames: number }[] = [];
  let cursor = 0; // current frame position in final concat
  let prevSet = 0;

  // Show intro
  const hasIntro = !!setlist.showPoster;
  if (hasIntro) {
    output.push({ timestamp: framesToTimestamp(0), label: "Intro", frames: 0 });
    cursor += SHOW_INTRO_FRAMES;
  }

  for (let si = 0; si < songs.length; si++) {
    const song = songs[si];
    const track = tracks.find((t: TimelineTrack) => t.trackId === song.trackId);
    if (!track || track.missing) continue;

    // Set break between sets
    if (prevSet !== 0 && song.set !== prevSet) {
      if (includeCards) {
        output.push({ timestamp: framesToTimestamp(cursor), label: "Set Break", frames: cursor });
      }
      cursor += SET_BREAK_FRAMES;
    }

    // Skip "before" chapter cards for segue-into songs
    const prevSong = si > 0 ? songs[si - 1] : null;
    const isSegueInto = prevSong?.segueInto === true;

    // "Before" chapter cards
    const beforeIndices = chaptersBefore.get(song.trackId);
    if (beforeIndices && !isSegueInto) {
      for (const idx of beforeIndices) {
        if (includeCards) {
          output.push({
            timestamp: framesToTimestamp(cursor),
            label: `[Chapter] ${chapters[idx].text.slice(0, 60)}...`,
            frames: cursor,
          });
        }
        cursor += CHAPTER_CARD_FRAMES;
      }
    }

    const songStartFrame = cursor;

    // Song start
    output.push({
      timestamp: framesToTimestamp(cursor),
      label: song.title,
      frames: cursor,
    });

    // Sub-chapters (if --sub-chapters enabled)
    if (subChapters) {
      // "Listen for" sub-chapter at 30s into each song
      const narration = narrationSongs[song.trackId];
      if (narration?.listenFor?.length > 0) {
        const listenForFrame = songStartFrame + 900; // 30s in
        if (listenForFrame < songStartFrame + track.totalFrames) {
          output.push({
            timestamp: framesToTimestamp(listenForFrame),
            label: `  \u2192 Listen for: ${narration.listenFor[0]}`,
            frames: listenForFrame,
          });
        }
      }

      // Jam peak marker for songs > 8 min
      const jamPeakFrame = findJamPeak(song.trackId);
      if (jamPeakFrame !== null) {
        output.push({
          timestamp: framesToTimestamp(songStartFrame + jamPeakFrame),
          label: `  \u2605 Jam peak`,
          frames: songStartFrame + jamPeakFrame,
        });
      }

      // Segue marker at end of this song
      if (song.segueInto && si + 1 < songs.length) {
        const nextSong = songs[si + 1];
        const segueFrame = songStartFrame + track.totalFrames - 150; // ~5s before end
        output.push({
          timestamp: framesToTimestamp(segueFrame),
          label: `  \u2192 \u2192 ${nextSong.title}`,
          frames: segueFrame,
        });
      }
    }

    cursor += track.totalFrames;

    // "After" chapter cards
    const afterIndices = chaptersAfter.get(song.trackId);
    if (afterIndices) {
      for (const idx of afterIndices) {
        if (includeCards) {
          output.push({
            timestamp: framesToTimestamp(cursor),
            label: `[Chapter] ${chapters[idx].text.slice(0, 60)}...`,
            frames: cursor,
          });
        }
        cursor += CHAPTER_CARD_FRAMES;
      }
    }

    prevSet = song.set;
  }

  // End card
  if (includeCards) {
    output.push({ timestamp: framesToTimestamp(cursor), label: "End", frames: cursor });
  }
  cursor += END_CARD_FRAMES;

  // Sort sub-chapters by frame position
  output.sort((a, b) => a.frames - b.frames);

  // Output
  const totalDuration = framesToTimestamp(cursor);
  console.log(`\nYouTube Chapters — ${setlist.date} ${setlist.venue}`);
  console.log(`Total duration: ${totalDuration}\n`);
  console.log("\u2500".repeat(50));

  const chapterText = output.map((o) => `${o.timestamp} ${o.label}`).join("\n");
  console.log(chapterText);
  console.log("\u2500".repeat(50));

  // Write to file
  const outFile = join(OUT_DIR, "youtube-chapters.txt");
  const header = `# YouTube Chapters \u2014 ${setlist.date} ${setlist.venue}\n# Total: ${totalDuration}\n# Generated: ${new Date().toISOString()}\n\n`;
  writeFileSync(outFile, header + chapterText + "\n");
  console.log(`\nWritten to: ${outFile}`);
}

main();
