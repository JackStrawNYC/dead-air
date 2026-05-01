#!/usr/bin/env npx tsx
/**
 * SCHEMA EXTRACTION — HISTORICAL TOOL
 *
 * This script was the original Wave 2.1 phase A bootstrapper. It scanned
 * `packages/renderer/src/uniforms.rs` for write_f32 calls to seed
 * `uniforms-schema.json`.
 *
 * As of phase D (commit 9e07e97), the 105 simple write_f32 calls were
 * deleted from uniforms.rs in favour of the schema-driven codegen
 * `pack_simple_uniforms`. THE SCHEMA IS NOW THE SOURCE OF TRUTH — running
 * this extractor against the current uniforms.rs would produce ~18
 * entries (only the computed/synthetic ones remain), wiping the schema.
 *
 * The script is kept for reference / one-shot use against a historical
 * checkout of uniforms.rs. Day-to-day workflow:
 *
 *   1. Edit `packages/renderer/uniforms-schema.json` directly.
 *   2. Run `generate-rust-uniforms.mts` and `generate-uniform-packer.mts`
 *      and `generate-glsl-uniforms.mts` to regenerate downstream.
 *   3. `cargo test --test uniforms_layout_drift` and
 *      `cargo test --test uniform_packer_parity` validate the layout.
 *
 * Patterns this script still recognises (kept verbatim):
 *   write_f32(&mut buf, OFFSET, frame.RUST_FIELD);       // uName
 *   write_f32(&mut buf, OFFSET, EXPR);                   // uName (extra notes)
 *   for-loop chroma block at offsets 192/208/224         (vec4 each)
 *   contrast block at offsets 160/176                    (vec4 each)
 */

import { readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const HERE = resolve(import.meta.dirname);
const RENDERER_ROOT = resolve(HERE, "..");
const UNIFORMS_RS = join(RENDERER_ROOT, "src/uniforms.rs");
const SCHEMA_OUT = join(RENDERER_ROOT, "uniforms-schema.json");

interface UniformEntry {
  name: string;          // GLSL uniform name, e.g. "uTime"
  offset: number;        // byte offset in the std140 buffer
  size: number;          // 4 (float), 16 (vec4)
  glsl_type: "float" | "vec2" | "vec3" | "vec4";
  rust_source: string;   // Rust expression that produced the value
  group?: string;        // section header from the comment band
  notes?: string;        // any free-form comment
}

const src = readFileSync(UNIFORMS_RS, "utf-8");

const entries: UniformEntry[] = [];
let currentGroup: string | undefined;

const lines = src.split("\n");
const writeLineRe = /^\s*write_f32\(&mut buf,\s*(\d+),\s*(.+?)\);(?:\s*\/\/\s*(.+))?$/;
const sectionRe = /─── (.+?) ───/;

for (const line of lines) {
  const sectionMatch = line.match(sectionRe);
  if (sectionMatch) {
    currentGroup = sectionMatch[1].trim();
    continue;
  }

  const writeMatch = line.match(writeLineRe);
  if (writeMatch) {
    const [, offsetStr, expr, comment] = writeMatch;
    const offset = Number(offsetStr);
    // Comment is "uName ..." or "uName (notes)"
    const cm = (comment ?? "").match(/^(u[A-Za-z][A-Za-z0-9]*)(?:\s+(.+))?$/);
    if (!cm) continue; // not a uniform write (likely a contrast inner-loop)
    const [, name, notes] = cm;
    entries.push({
      name,
      offset,
      size: 4,
      glsl_type: "float",
      rust_source: expr.trim(),
      group: currentGroup,
      notes: notes?.trim(),
    });
  }
}

// Vec4 blocks need to be hand-described — they're written via for-loops in Rust
// rather than as straight uniform writes. Source comments name them:
const vec4Blocks: Array<{ name: string; offset: number; group: string }> = [
  { name: "uContrast0", offset: 160, group: "Chroma / Spectral" },
  { name: "uContrast1", offset: 176, group: "Chroma / Spectral" },
  { name: "uChroma0",   offset: 192, group: "Chroma / Spectral" },
  { name: "uChroma1",   offset: 208, group: "Chroma / Spectral" },
  { name: "uChroma2",   offset: 224, group: "Chroma / Spectral" },
];

// Strip individual entries that fall inside vec4 blocks (160-191, 192-239)
const vec4Ranges = vec4Blocks.map((b) => [b.offset, b.offset + 16] as const);
const filtered = entries.filter(
  (e) => !vec4Ranges.some(([lo, hi]) => e.offset >= lo && e.offset < hi),
);

for (const blk of vec4Blocks) {
  filtered.push({
    name: blk.name,
    offset: blk.offset,
    size: 16,
    glsl_type: "vec4",
    rust_source: "[loop]",
    group: blk.group,
  });
}
filtered.sort((a, b) => a.offset - b.offset);

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "dead-air-uniform-schema",
  description: "Std140 uniform layout extracted from packages/renderer/src/uniforms.rs. Source of truth for future codegen.",
  total_size_bytes: 656,
  generated_from: "packages/renderer/src/uniforms.rs",
  generated_at_utc: new Date().toISOString().split("T")[0],
  uniform_count: filtered.length,
  uniforms: filtered,
};

writeFileSync(SCHEMA_OUT, JSON.stringify(schema, null, 2));
console.log(`[extract-uniform-schema] ${filtered.length} uniforms → ${SCHEMA_OUT}`);

// Sanity: detect overlapping offsets (would indicate a bug in extraction or in uniforms.rs)
let prev: UniformEntry | null = null;
for (const e of filtered) {
  if (prev && prev.offset + prev.size > e.offset) {
    console.error(`  WARN: overlap — ${prev.name}@${prev.offset}+${prev.size} vs ${e.name}@${e.offset}`);
  }
  prev = e;
}
const used = filtered[filtered.length - 1].offset + filtered[filtered.length - 1].size;
console.log(`[extract-uniform-schema] last uniform ends at byte ${used} (buffer size ${schema.total_size_bytes})`);
