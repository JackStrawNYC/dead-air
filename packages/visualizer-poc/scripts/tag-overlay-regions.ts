#!/usr/bin/env npx tsx
/**
 * Tag all overlays in overlay-registry.ts with region assignments.
 * Classifies based on category, prominence, and individual review.
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const REGISTRY_PATH = join(import.meta.dirname!, "../src/data/overlay-registry.ts");

// ─── Region classification rules ───

// Full-frame ambient overlays → "edge" (no collision limit)
const EDGE_CATEGORIES = new Set([
  "atmospheric", "distortion", "hud",
]);

// Center-screen focal designs
const CENTER_OVERLAYS = new Set([
  "BreathingStealie", "SacredGeometry", "MandalaGenerator",
  "SacredGeometryOverlay", "StealYourFaceKaleidoscope",
  "SkullKaleidoscope", "FractalZoom", "DarkStarPortal",
  "KaleidoscopeFilter", "GratefulMandala", "UnitySpiral",
  "SpiralHypnoDisc", "SpinningYinYang", "ThirdEye",
  "PsychedelicEye", "FibonacciSpiral",
]);

// Quadrant rotation for focal overlays (distribute evenly)
const QUADRANTS: Array<"upper-left" | "upper-right" | "lower-left" | "lower-right"> = [
  "upper-left", "upper-right", "lower-right", "lower-left",
];

function classifyOverlay(
  name: string,
  category: string,
  prominence: string,
  index: number,
): "center" | "upper-left" | "upper-right" | "lower-left" | "lower-right" | "edge" {
  // Explicit center assignments
  if (CENTER_OVERLAYS.has(name)) return "center";

  // Full-frame ambient categories → edge
  if (EDGE_CATEGORIES.has(category)) return "edge";

  // Geometric patterns are typically full-frame → edge
  if (category === "geometric") return "edge";

  // Reactive overlays: most are full-frame effects → edge
  if (category === "reactive" && prominence === "ambient") return "edge";

  // Non-ambient overlays (hero/accent) get quadrant distribution
  if (prominence === "hero" || prominence === "accent") {
    return QUADRANTS[index % 4];
  }

  // Character overlays → quadrant distribution
  if (category === "character") {
    return QUADRANTS[index % 4];
  }

  // Nature overlays with discrete elements → quadrant
  if (category === "nature") {
    return QUADRANTS[index % 4];
  }

  // Artifact overlays → quadrant (posters, tickets etc.)
  if (category === "artifact") {
    return QUADRANTS[index % 4];
  }

  // Sacred overlays not in CENTER_OVERLAYS → quadrant
  if (category === "sacred") {
    return QUADRANTS[index % 4];
  }

  // Default: edge
  return "edge";
}

// ─── Apply classifications ───

let src = readFileSync(REGISTRY_PATH, "utf-8");

// Find all overlay entries and add region field
const entryRegex = /(\{\s*name:\s*"([^"]+)"[^}]*?)(tier:\s*"[^"]+"\s*(?:,\s*)?)/gs;
let focalIndex = 0;
const assignments: { name: string; region: string; category: string; prominence: string }[] = [];

// First pass: collect all entries
const allEntries: { name: string; category: string; prominence: string; hasTier: boolean }[] = [];
const nameRegex = /name:\s*"([^"]+)"/g;
const names: string[] = [];
let nm;
while ((nm = nameRegex.exec(src)) !== null) names.push(nm[1]);

// For each name, extract category and prominence
for (const name of names) {
  const idx = src.indexOf(`name: "${name}"`);
  const block = src.substring(idx, src.indexOf("}", idx) + 1);
  const catMatch = block.match(/category:\s*"([^"]+)"/);
  const promMatch = block.match(/prominence:\s*"([^"]+)"/);
  const tierMatch = block.match(/tier:\s*"([^"]+)"/);
  const category = catMatch?.[1] ?? "atmospheric";
  const prominence = promMatch?.[1] ?? "ambient";
  const tier = tierMatch?.[1] ?? "B";

  // Only classify active overlays (A+B tier)
  const isActive = tier !== "C";
  const region = classifyOverlay(name, category, prominence, focalIndex);

  if (region !== "edge" && isActive) focalIndex++;

  assignments.push({ name, region, category, prominence });
}

// Second pass: insert region field into each entry
for (const { name, region } of assignments) {
  // Find the entry and add region before the closing brace
  // Look for the pattern: name: "X", ... } and add region before }
  const nameStr = `name: "${name}"`;
  const nameIdx = src.indexOf(nameStr);
  if (nameIdx === -1) continue;

  // Find the closing brace for this entry
  let braceIdx = src.indexOf("}", nameIdx);
  if (braceIdx === -1) continue;

  // Check if region already exists
  const entryBlock = src.substring(nameIdx, braceIdx);
  if (entryBlock.includes("region:")) continue;

  // Insert region before closing brace
  // Find last non-whitespace before }
  let insertIdx = braceIdx;
  while (insertIdx > 0 && (src[insertIdx - 1] === " " || src[insertIdx - 1] === "\n")) insertIdx--;

  // Add comma if needed
  const needsComma = src[insertIdx - 1] !== ",";
  const insertion = (needsComma ? "," : "") + ` region: "${region}"`;

  src = src.substring(0, insertIdx) + insertion + src.substring(insertIdx);
}

writeFileSync(REGISTRY_PATH, src);

// Report
const regionCounts: Record<string, number> = {};
const activeAssignments = assignments.filter(a => {
  const idx = src.indexOf(`name: "${a.name}"`);
  const block = src.substring(idx, src.indexOf("}", idx) + 1);
  const tier = block.match(/tier:\s*"([^"]+)"/)?.[1] ?? "B";
  return tier !== "C";
});

for (const a of activeAssignments) regionCounts[a.region] = (regionCounts[a.region] || 0) + 1;

console.log("\n=== Region Distribution (Active Overlays) ===");
for (const [region, count] of Object.entries(regionCounts).sort()) {
  console.log(`  ${region}: ${count}`);
}
console.log(`  Total: ${Object.values(regionCounts).reduce((a, b) => a + b, 0)}`);

// Spot-check 10 random focal assignments
console.log("\n=== Spot-Check: 10 Focal Overlays ===");
const focal = activeAssignments.filter(a => a.region !== "edge");
for (let i = 0; i < Math.min(10, focal.length); i++) {
  const a = focal[i];
  console.log(`  ${a.name} (${a.category}/${a.prominence}) → ${a.region}`);
}

// Ambiguous cases
console.log("\n=== Potentially Ambiguous ===");
const ambiguous = activeAssignments.filter(a =>
  a.region !== "edge" && a.prominence === "ambient" && ["sacred", "nature", "character"].includes(a.category)
);
for (const a of ambiguous.slice(0, 10)) {
  console.log(`  ${a.name} (${a.category}/ambient) → ${a.region} — verify: is this a discrete focal element or full-frame?`);
}
