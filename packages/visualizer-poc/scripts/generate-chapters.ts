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
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const OUT_DIR = join(ROOT, "out");

// Constants matching Root.tsx / render-show.ts
const SHOW_INTRO_FRAMES = 465;   // 15.5s
const CHAPTER_CARD_FRAMES = 180; // 6s
const SET_BREAK_FRAMES = 300;    // 10s
const END_CARD_FRAMES = 360;     // 12s
const FPS = 30;

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

function main() {
  const args = process.argv.slice(2);
  const includeCards = args.includes("--include-cards");

  // Load data
  const setlistPath = join(DATA_DIR, "setlist.json");
  const timelinePath = join(DATA_DIR, "show-timeline.json");
  const contextPath = join(DATA_DIR, "show-context.json");

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

  for (const song of songs) {
    const track = tracks.find((t: TimelineTrack) => t.trackId === song.trackId);
    if (!track || track.missing) continue;

    // Set break between sets
    if (prevSet !== 0 && song.set !== prevSet) {
      if (includeCards) {
        output.push({ timestamp: framesToTimestamp(cursor), label: "Set Break", frames: cursor });
      }
      cursor += SET_BREAK_FRAMES;
    }

    // "Before" chapter cards
    const beforeIndices = chaptersBefore.get(song.trackId);
    if (beforeIndices) {
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

    // Song start
    output.push({
      timestamp: framesToTimestamp(cursor),
      label: song.title,
      frames: cursor,
    });

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

  // Output
  const totalDuration = framesToTimestamp(cursor);
  console.log(`\nYouTube Chapters — ${setlist.date} ${setlist.venue}`);
  console.log(`Total duration: ${totalDuration}\n`);
  console.log("─".repeat(50));

  const chapterText = output.map((o) => `${o.timestamp} ${o.label}`).join("\n");
  console.log(chapterText);
  console.log("─".repeat(50));

  // Write to file
  const outFile = join(OUT_DIR, "youtube-chapters.txt");
  const header = `# YouTube Chapters — ${setlist.date} ${setlist.venue}\n# Total: ${totalDuration}\n# Generated: ${new Date().toISOString()}\n\n`;
  writeFileSync(outFile, header + chapterText + "\n");
  console.log(`\nWritten to: ${outFile}`);
}

main();
