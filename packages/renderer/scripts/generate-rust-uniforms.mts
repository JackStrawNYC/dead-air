#!/usr/bin/env npx tsx
/**
 * Generate a Rust uniform struct + offset constants from uniforms-schema.json.
 *
 * Wave 2.1 phase C — companion to generate-uniform-packer.mts. The output
 * `generated/uniforms_layout.rs` is meant to be referenced from
 * src/uniforms.rs (eventually replacing the hand-written write_f32 calls)
 * with a byte-equivalence test as the gate.
 *
 * For now, it ships as parallel constants so any consumer (test, debug
 * tool, future codegen target) can use the offsets without re-deriving.
 *
 * Output: packages/renderer/generated/uniforms_layout.rs
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const HERE = resolve(import.meta.dirname);
const RENDERER_ROOT = resolve(HERE, "..");
const SCHEMA_IN = join(RENDERER_ROOT, "uniforms-schema.json");
const OUT_DIR = join(RENDERER_ROOT, "generated");
const OUT = join(OUT_DIR, "uniforms_layout.rs");

interface UniformEntry {
  name: string;
  offset: number;
  size: number;
  glsl_type: "float" | "vec2" | "vec3" | "vec4";
}

const schema = JSON.parse(readFileSync(SCHEMA_IN, "utf-8")) as {
  total_size_bytes: number;
  uniforms: UniformEntry[];
};

mkdirSync(OUT_DIR, { recursive: true });

const lines: string[] = [];
lines.push("//! AUTO-GENERATED — do not edit by hand.");
lines.push("//! Source: packages/renderer/uniforms-schema.json");
lines.push("//! Regenerate: npx tsx packages/renderer/scripts/generate-rust-uniforms.mts");
lines.push("");
lines.push(`/// Total std140 uniform buffer size in bytes (matches uniforms.rs UBO_SIZE).`);
lines.push(`pub const UBO_SIZE: usize = ${schema.total_size_bytes};`);
lines.push("");
lines.push("/// Schema-declared offset of every uniform, by GLSL name.");
lines.push("/// Use `OFFSETS::U_TIME` etc — naming follows SCREAMING_SNAKE convention.");
lines.push("pub mod offsets {");
for (const u of schema.uniforms) {
  // Convert "uTime" → "U_TIME"
  const constName = u.name
    .replace(/([A-Z])/g, "_$1")
    .replace(/^_/, "")
    .toUpperCase();
  lines.push(`    pub const ${constName}: usize = ${u.offset};`);
}
lines.push("}");
lines.push("");

// A complete listing for runtime introspection.
lines.push("/// Per-uniform metadata for runtime introspection.");
lines.push("#[derive(Debug, Clone, Copy)]");
lines.push("pub struct UniformField {");
lines.push("    pub name: &'static str,");
lines.push("    pub offset: usize,");
lines.push("    pub size: usize,");
lines.push("    pub kind: UniformKind,");
lines.push("}");
lines.push("");
lines.push("#[derive(Debug, Clone, Copy, PartialEq, Eq)]");
lines.push("pub enum UniformKind { Float, Vec2, Vec3, Vec4 }");
lines.push("");
lines.push(`pub const FIELDS: &[UniformField] = &[`);
for (const u of schema.uniforms) {
  const kind =
    u.glsl_type === "float" ? "UniformKind::Float"
    : u.glsl_type === "vec2" ? "UniformKind::Vec2"
    : u.glsl_type === "vec3" ? "UniformKind::Vec3"
    : "UniformKind::Vec4";
  lines.push(`    UniformField { name: ${JSON.stringify(u.name)}, offset: ${u.offset}, size: ${u.size}, kind: ${kind} },`);
}
lines.push(`];`);
lines.push("");

writeFileSync(OUT, lines.join("\n"));
console.log(`[generate-rust-uniforms] ${schema.uniforms.length} fields → ${OUT}`);
