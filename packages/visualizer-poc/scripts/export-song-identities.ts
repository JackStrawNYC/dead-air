#!/usr/bin/env npx tsx
/**
 * export-song-identities — exports SONG_IDENTITIES to JSON for dashboard read/write.
 * Writes data/song-identities.json with all serializable fields per song.
 *
 * Usage: npx tsx scripts/export-song-identities.ts
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import { SONG_IDENTITIES } from "../src/data/song-identities";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "data", "song-identities.json");

// SONG_IDENTITIES is already serializable (no functions, no Component refs)
writeFileSync(OUT, JSON.stringify(SONG_IDENTITIES, null, 2) + "\n", "utf-8");

const count = Object.keys(SONG_IDENTITIES).length;
console.log(`Wrote ${count} song identities to ${OUT}`);
