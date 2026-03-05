#!/usr/bin/env npx tsx
/**
 * generate-youtube-meta.ts — Generate YouTube description + SEO metadata.
 *
 * Outputs:
 *   - youtube-description.txt: tour context + highlights + chapters
 *   - youtube-meta.json: { date, venue, songs[], chapters[], tags[] }
 *
 * Usage:
 *   npx tsx scripts/generate-youtube-meta.ts
 *   npx tsx scripts/generate-youtube-meta.ts --sub-chapters   # include sub-chapter markers
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const OUT_DIR = join(ROOT, "out");

interface SetlistEntry {
  trackId: string;
  title: string;
  set: number;
  segueInto?: boolean;
}

function main() {
  const setlistPath = join(DATA_DIR, "setlist.json");
  const narrationPath = join(DATA_DIR, "narration.json");

  if (!existsSync(setlistPath)) {
    console.error("ERROR: setlist.json not found");
    process.exit(1);
  }

  const setlist = JSON.parse(readFileSync(setlistPath, "utf-8"));
  const songs: SetlistEntry[] = setlist.songs;
  const showDate: string = setlist.date ?? "";
  const venue: string = setlist.venue ?? "";
  const tourName: string = setlist.tourName ?? "";
  const era: string = setlist.era ?? "";

  // Load narration for tour context
  let tourContext = "";
  let fanReviews: Array<{ text: string; reviewer: string; stars?: number }> = [];
  if (existsSync(narrationPath)) {
    const narration = JSON.parse(readFileSync(narrationPath, "utf-8"));
    tourContext = narration.tourContext ?? "";
    fanReviews = narration.fanReviews ?? [];
  }

  // Generate chapters (reuse the chapters script)
  const chaptersFile = join(OUT_DIR, "youtube-chapters.txt");
  const subChapters = process.argv.includes("--sub-chapters");
  try {
    const chapterArgs = subChapters ? "--sub-chapters" : "";
    execSync(`npx tsx ${join(ROOT, "scripts", "generate-chapters.ts")} ${chapterArgs}`, {
      cwd: ROOT,
      stdio: "pipe",
    });
  } catch {
    console.warn("WARNING: Could not generate chapters");
  }

  let chaptersText = "";
  if (existsSync(chaptersFile)) {
    const raw = readFileSync(chaptersFile, "utf-8");
    // Strip comment lines
    chaptersText = raw
      .split("\n")
      .filter((l) => !l.startsWith("#") && l.trim())
      .join("\n");
  }

  // Build setlist text grouped by set
  const sets = new Map<number, SetlistEntry[]>();
  for (const song of songs) {
    const arr = sets.get(song.set) ?? [];
    arr.push(song);
    sets.set(song.set, arr);
  }

  let setlistText = "";
  for (const [setNum, setSongs] of sets) {
    const setLabel = setNum === 3 ? "Encore" : `Set ${setNum}`;
    setlistText += `\n${setLabel}:\n`;
    for (const song of setSongs) {
      const segueArrow = song.segueInto ? " >" : "";
      setlistText += `  ${song.title}${segueArrow}\n`;
    }
  }

  // Auto-generate tags
  const tags: string[] = [];
  tags.push("Grateful Dead");
  if (venue) tags.push(venue.split(",")[0].trim());
  if (showDate) tags.push(showDate);
  const year = showDate.split("-")[0];
  if (year) tags.push(`Grateful Dead ${year}`);
  if (tourName) tags.push(tourName);
  if (era) tags.push(`${era} era`);
  for (const song of songs) {
    tags.push(song.title);
  }
  tags.push("live concert", "bootleg", "dead air", "concert visualization");

  // Fan review highlight
  let reviewHighlight = "";
  if (fanReviews.length > 0) {
    const best = fanReviews[0];
    reviewHighlight = `\n"${best.text}" — ${best.reviewer}\n`;
  }

  // Build description
  const description = [
    `Grateful Dead — ${venue}`,
    `${showDate}`,
    "",
    tourContext ? `${tourContext}` : "",
    reviewHighlight,
    "SETLIST:",
    setlistText,
    "CHAPTERS:",
    chaptersText,
    "",
    "---",
    "Generated with Dead Air — AI-powered concert visualization",
    `https://github.com/dead-air`,
    "",
    `Tags: ${tags.slice(0, 15).join(", ")}`,
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  // Write outputs
  mkdirSync(OUT_DIR, { recursive: true });

  const descPath = join(OUT_DIR, "youtube-description.txt");
  writeFileSync(descPath, description);
  console.log(`\nYouTube description: ${descPath}`);

  const metaPath = join(OUT_DIR, "youtube-meta.json");
  const meta = {
    date: showDate,
    venue,
    tourName,
    era,
    songs: songs.map((s) => ({
      trackId: s.trackId,
      title: s.title,
      set: s.set,
      segue: s.segueInto ?? false,
    })),
    tags,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log(`YouTube metadata: ${metaPath}`);

  // Preview
  console.log("\n" + "═".repeat(60));
  console.log(description);
  console.log("═".repeat(60));
}

main();
