#!/usr/bin/env tsx
/**
 * scaffold-show — Create the directory structure for a new Dead show.
 *
 * Usage:
 *   npx tsx scripts/scaffold-show.ts <show-id> --date <YYYY-MM-DD> --venue <venue>
 *
 * Example:
 *   npx tsx scripts/scaffold-show.ts europe-72-04-08 --date 1972-04-08 --venue "Wembley Empire Pool, London"
 *
 * Creates:
 *   data/shows/<show-id>/
 *     setlist.json       (template)
 *     show-context.json  (template)
 *     tracks/            (empty, for analysis data)
 */

import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const showId = args[0];

if (!showId || showId.startsWith("--")) {
  console.error("Usage: npx tsx scripts/scaffold-show.ts <show-id> [--date YYYY-MM-DD] [--venue 'venue name']");
  process.exit(1);
}

// Parse flags
let date = "1977-01-01";
let venue = "Unknown Venue";

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--date" && args[i + 1]) {
    date = args[++i];
  } else if (args[i] === "--venue" && args[i + 1]) {
    venue = args[++i];
  }
}

const dataRoot = path.resolve(import.meta.dirname ?? __dirname, "../data");
const showDir = path.join(dataRoot, "shows", showId);

if (fs.existsSync(showDir)) {
  console.error(`Show directory already exists: ${showDir}`);
  process.exit(1);
}

// Create directories
fs.mkdirSync(path.join(showDir, "tracks"), { recursive: true });
fs.mkdirSync(path.join(showDir, "lyrics"), { recursive: true });

// Template setlist.json
const setlistTemplate = {
  date,
  venue,
  source: "SBD",
  taper: "",
  showPoster: null,
  era: "classic",
  songs: [
    {
      trackId: "s1t01",
      title: "Song Title",
      audioFile: `${showId}-s1t01.mp3`,
      set: 1,
      trackNumber: 1,
      defaultMode: "liquid_light",
      segueInto: false,
    },
  ],
};

fs.writeFileSync(
  path.join(showDir, "setlist.json"),
  JSON.stringify(setlistTemplate, null, 2) + "\n",
);

// Template show-context.json
const contextTemplate = {
  date,
  venue,
  chapters: [
    {
      before: "s1t01",
      text: `${date}. ${venue}. The tape is rolling.`,
    },
  ],
};

fs.writeFileSync(
  path.join(showDir, "show-context.json"),
  JSON.stringify(contextTemplate, null, 2) + "\n",
);

console.log(`Scaffolded new show: ${showDir}`);
console.log("");
console.log("Next steps:");
console.log(`  1. Place audio files in public/audio/`);
console.log(`  2. Edit ${showDir}/setlist.json with track metadata`);
console.log(`  3. Edit ${showDir}/show-context.json with chapter cards`);
console.log(`  4. Run: pnpm analyze:show -- --show ${showId}`);
console.log(`  5. Run: npx tsx scripts/schedule-overlays.ts --show ${showId}`);
