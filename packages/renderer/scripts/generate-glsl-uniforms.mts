#!/usr/bin/env npx tsx
/**
 * Generate the shared GLSL uniform declaration block from uniforms-schema.json.
 *
 * Wave 2.1 phase C — third codegen target. Output mirrors the structure of
 * packages/visualizer-poc/src/shaders/shared/uniforms.glsl.ts but is now
 * derived from the same schema as the Rust packer + TS packer.
 *
 * Output: packages/renderer/generated/uniforms.glsl.txt
 *
 * NOTE: until consumers are switched, this file is informational.
 * The shared/uniforms.glsl.ts file remains the live source for shaders.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const HERE = resolve(import.meta.dirname);
const RENDERER_ROOT = resolve(HERE, "..");
const SCHEMA_IN = join(RENDERER_ROOT, "uniforms-schema.json");
const OUT_DIR = join(RENDERER_ROOT, "generated");
const OUT = join(OUT_DIR, "uniforms.glsl.txt");

interface UniformEntry {
  name: string;
  offset: number;
  size: number;
  glsl_type: "float" | "vec2" | "vec3" | "vec4";
  group?: string;
  notes?: string;
}

const schema = JSON.parse(readFileSync(SCHEMA_IN, "utf-8")) as {
  total_size_bytes: number;
  uniforms: UniformEntry[];
};

mkdirSync(OUT_DIR, { recursive: true });

const lines: string[] = [];
lines.push("// AUTO-GENERATED — do not edit by hand.");
lines.push("// Source: packages/renderer/uniforms-schema.json");
lines.push("// Regenerate: npx tsx packages/renderer/scripts/generate-glsl-uniforms.mts");
lines.push("");

let lastGroup: string | undefined;
for (const u of schema.uniforms) {
  if (u.group !== lastGroup) {
    if (lastGroup !== undefined) lines.push("");
    lines.push(`// ─── ${u.group} ───`);
    lastGroup = u.group;
  }
  const note = u.notes ? `  // ${u.notes}` : "";
  lines.push(`uniform ${u.glsl_type} ${u.name};${note}`);
}
lines.push("");

writeFileSync(OUT, lines.join("\n"));
console.log(`[generate-glsl-uniforms] ${schema.uniforms.length} uniforms → ${OUT}`);
