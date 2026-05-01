#!/usr/bin/env npx tsx
/**
 * Extract show-specific routing data from TS modules into editable JSON.
 *
 * Reads VENETA_SONG_IDENTITIES from veneta-routing.ts and writes
 * data/shows/{showDate}/routing.json. Once written, the show can be
 * adjusted by editing JSON — no TypeScript changes, no recompilation.
 *
 * Usage:
 *   npx tsx scripts/extract-show-routing.mts
 *   npx tsx scripts/extract-show-routing.mts --check   # report drift only
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { VENETA_SONG_IDENTITIES, VENETA_SHOW_DATE } from "../src/data/veneta-routing.js";

const checkOnly = process.argv.includes("--check");

const PKG_ROOT = resolve(import.meta.dirname, "..");
const showDir = join(PKG_ROOT, "data/shows", VENETA_SHOW_DATE);
const outPath = join(showDir, "routing.json");

mkdirSync(showDir, { recursive: true });

const payload = {
  $schema: "../../../schemas/show-routing.schema.json",
  showDate: VENETA_SHOW_DATE,
  description: "Per-song visual identities for the Veneta 8/27/72 show. Editable without TypeScript.",
  songs: VENETA_SONG_IDENTITIES,
};

const json = JSON.stringify(payload, null, 2);

if (checkOnly) {
  if (!existsSync(outPath)) {
    console.error(`[check] missing: ${outPath}`);
    process.exit(2);
  }
  const onDisk = readFileSync(outPath, "utf-8");
  if (onDisk !== json) {
    console.error(`[check] drift between TS and JSON: ${outPath}`);
    process.exit(3);
  }
  console.log(`[check] up-to-date: ${outPath}`);
  process.exit(0);
}

writeFileSync(outPath, json);
console.log(`[extract] wrote ${outPath} (${Object.keys(VENETA_SONG_IDENTITIES).length} songs, ${json.length} bytes)`);
