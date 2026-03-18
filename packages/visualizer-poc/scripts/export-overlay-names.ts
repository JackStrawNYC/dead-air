#!/usr/bin/env npx tsx
/**
 * export-overlay-names — exports overlay names from OVERLAY_REGISTRY to JSON.
 * Writes data/overlay-names.json (sorted name list).
 *
 * Usage: npx tsx scripts/export-overlay-names.ts
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import { OVERLAY_REGISTRY } from "../src/data/overlay-registry";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "data", "overlay-names.json");

const names = OVERLAY_REGISTRY.map((o) => o.name).sort();

writeFileSync(OUT, JSON.stringify(names, null, 2) + "\n", "utf-8");
console.log(`Wrote ${names.length} overlay names to ${OUT}`);
