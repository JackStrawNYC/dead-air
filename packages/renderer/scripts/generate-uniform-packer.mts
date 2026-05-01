#!/usr/bin/env npx tsx
/**
 * Generate a TypeScript uniform packer from uniforms-schema.json.
 *
 * Wave 2.1 phase B: with the schema in hand, the manifest generator
 * can use a typed packer instead of stringly-typed Record<string, number>
 * for individual uniform fields. This is the consumer side of the schema.
 *
 * Output: packages/renderer/generated/uniform-packer.ts
 *
 * The Rust packer (uniforms.rs) remains hand-written for now — phase C
 * will generate that from the same schema. Until then, the schema is the
 * contract and `uniform_schema_drift.rs` enforces it.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const HERE = resolve(import.meta.dirname);
const RENDERER_ROOT = resolve(HERE, "..");
const SCHEMA_IN = join(RENDERER_ROOT, "uniforms-schema.json");
const OUT_DIR = join(RENDERER_ROOT, "generated");
const OUT = join(OUT_DIR, "uniform-packer.ts");

interface UniformEntry {
  name: string;
  offset: number;
  size: number;
  glsl_type: "float" | "vec2" | "vec3" | "vec4";
  rust_source: string;
  group?: string;
  notes?: string;
}

const schema = JSON.parse(readFileSync(SCHEMA_IN, "utf-8")) as {
  total_size_bytes: number;
  uniform_count: number;
  uniforms: UniformEntry[];
};

mkdirSync(OUT_DIR, { recursive: true });

const lines: string[] = [];
lines.push("// AUTO-GENERATED — do not edit by hand.");
lines.push("// Source: packages/renderer/uniforms-schema.json");
lines.push("// Regenerate: npx tsx packages/renderer/scripts/generate-uniform-packer.mts");
lines.push("// Drift gate: cargo test --test uniform_schema_drift");
lines.push("");
lines.push(`export const UNIFORM_BUFFER_SIZE = ${schema.total_size_bytes};`);
lines.push("");

// Type
lines.push("export interface UniformValues {");
let lastGroup: string | undefined;
for (const u of schema.uniforms) {
  if (u.group !== lastGroup) {
    lines.push(`  // ─── ${u.group} ───`);
    lastGroup = u.group;
  }
  if (u.glsl_type === "float") {
    lines.push(`  /** offset ${u.offset} — ${u.notes ?? u.rust_source} */`);
    lines.push(`  ${u.name}?: number;`);
  } else {
    const components = u.glsl_type === "vec2" ? 2 : u.glsl_type === "vec3" ? 3 : 4;
    lines.push(`  /** offset ${u.offset} — ${u.glsl_type} (${components}f) */`);
    lines.push(`  ${u.name}?: number[];`);
  }
}
lines.push("}");
lines.push("");

// Packer
lines.push(`/** Pack a partial UniformValues into the std140 buffer. Missing fields stay 0. */`);
lines.push(`export function packUniforms(values: UniformValues, target?: Uint8Array): Uint8Array {`);
lines.push(`  const buf = target ?? new Uint8Array(UNIFORM_BUFFER_SIZE);`);
lines.push(`  if (buf.length < UNIFORM_BUFFER_SIZE) {`);
lines.push(`    throw new Error(\`packUniforms: target buffer is \${buf.length} bytes, need \${UNIFORM_BUFFER_SIZE}\`);`);
lines.push(`  }`);
lines.push(`  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);`);
lines.push(``);
for (const u of schema.uniforms) {
  if (u.glsl_type === "float") {
    lines.push(`  if (values.${u.name} !== undefined) view.setFloat32(${u.offset}, values.${u.name}, true);`);
  } else {
    const components = u.glsl_type === "vec2" ? 2 : u.glsl_type === "vec3" ? 3 : 4;
    lines.push(`  if (values.${u.name}) {`);
    for (let i = 0; i < components; i++) {
      lines.push(`    view.setFloat32(${u.offset + i * 4}, values.${u.name}[${i}] ?? 0, true);`);
    }
    lines.push(`  }`);
  }
}
lines.push(``);
lines.push(`  return buf;`);
lines.push(`}`);
lines.push(``);

// Field list — useful for debugging
lines.push(`export const UNIFORM_FIELDS: ReadonlyArray<{ name: string; offset: number; type: string }> = [`);
for (const u of schema.uniforms) {
  lines.push(`  { name: ${JSON.stringify(u.name)}, offset: ${u.offset}, type: ${JSON.stringify(u.glsl_type)} },`);
}
lines.push(`];`);
lines.push(``);

writeFileSync(OUT, lines.join("\n"));
console.log(`[generate-uniform-packer] ${schema.uniforms.length} uniforms → ${OUT}`);
