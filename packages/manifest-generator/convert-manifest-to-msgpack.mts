#!/usr/bin/env npx tsx
/**
 * Convert a JSON manifest to MessagePack. One-shot utility for migrating
 * existing renders to the smaller binary format. Settings must match the
 * Rust loader (rmp_serde) — useRecords=false, useFloat32=ALWAYS.
 *
 * Usage:
 *   npx tsx convert-manifest-to-msgpack.mts <input.json> [output.msgpack]
 */

import { readFileSync, writeFileSync, statSync } from "fs";
import { Packr } from "msgpackr";

const input = process.argv[2];
if (!input) {
  console.error("Usage: convert-manifest-to-msgpack.mts <input.json> [output.msgpack]");
  process.exit(1);
}
const output = process.argv[3] ?? input.replace(/\.json$/, ".msgpack");

const inSize = statSync(input).size;
console.log(`[convert] Reading ${input} (${(inSize / 1048576).toFixed(1)} MB)...`);
const t0 = Date.now();
const manifest = JSON.parse(readFileSync(input, "utf-8"));
console.log(`[convert] Parsed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const packr = new Packr({ useRecords: false, structuredClone: false, useFloat32: 1 });
console.log(`[convert] Packing msgpack...`);
const t1 = Date.now();
const buffer = packr.pack(manifest);
console.log(`[convert] Packed in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

writeFileSync(output, buffer);
const outSize = statSync(output).size;
console.log(`[convert] Wrote ${output} (${(outSize / 1048576).toFixed(1)} MB)`);
console.log(`[convert] Compression: ${(outSize / inSize * 100).toFixed(1)}% of JSON (${(1 - outSize / inSize) * 100 | 0}% smaller)`);
