#!/usr/bin/env npx tsx
/**
 * Wave 3.5 phase A — inventory the visualizer-poc src dependency graph.
 *
 * Walks every .ts/.tsx file under src/ and src/data/ + src/utils/, parses
 * imports, and emits a JSON report classifying each module as either:
 *
 *   - `engine`  — pure logic / data / shader strings. Belongs in the
 *                 future @dead-air/visual-engine package.
 *   - `view`    — React/Remotion components. Belongs in
 *                 @dead-air/remotion-compositions.
 *   - `mixed`   — imports BOTH engine and view modules. These need to
 *                 be split or hoisted before the package boundary moves.
 *
 * Heuristic for view-ness: file name ends in `.tsx`, OR file imports
 * "react"/"remotion"/"@react-three". Everything else is engine.
 *
 * Output: packages/visualizer-poc/inventory-imports.json
 *
 * Use the report to plan the migration in MONOLITH-SPLIT-NOTES.md.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, resolve, relative } from "path";

const HERE = resolve(import.meta.dirname);
const PKG_ROOT = resolve(HERE, "..");
const SRC = join(PKG_ROOT, "src");
const OUT = join(PKG_ROOT, "inventory-imports.json");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "__mocks__" || entry === "node_modules") continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (
      (p.endsWith(".ts") || p.endsWith(".tsx")) &&
      !p.endsWith(".test.ts") &&
      !p.endsWith(".test.tsx") &&
      !p.endsWith(".d.ts")
    ) {
      acc.push(p);
    }
  }
  return acc;
}

const files = walk(SRC);
const importRe = /^\s*import\s+(?:type\s+)?(?:[^"']+from\s+)?["']([^"']+)["'];?$/gm;

interface ModuleInfo {
  path: string;
  classification: "engine" | "view" | "mixed";
  reasons: string[];
  imports: string[];
}

const VIEW_DEPS = ["react", "react-dom", "remotion", "@remotion/", "@react-three/", "three"];

const modules: ModuleInfo[] = [];

for (const file of files) {
  const rel = relative(PKG_ROOT, file);
  const src = readFileSync(file, "utf-8");
  const imports: string[] = [];
  for (const m of src.matchAll(importRe)) imports.push(m[1]);

  const isTsx = file.endsWith(".tsx");
  const importsView = imports.some((i) => VIEW_DEPS.some((v) => i === v || i.startsWith(v)));
  let classification: ModuleInfo["classification"];
  const reasons: string[] = [];
  if (isTsx) { classification = "view"; reasons.push("file ends in .tsx"); }
  else if (importsView) { classification = "view"; reasons.push("imports react/remotion/three"); }
  else { classification = "engine"; reasons.push("pure ts, no view deps"); }

  modules.push({ path: rel, classification, reasons, imports });
}

// Second pass: detect "mixed" — engine modules that get imported BY view modules
// AND view modules that import engine — ok, that's expected. We mark a file
// "mixed" only if it itself contains both view and engine concerns.
// (Currently the heuristic above can't distinguish that without AST work; we
// flag the simpler case where a .ts (engine) file has react/remotion imports.)

const summary = {
  total: modules.length,
  engine: modules.filter((m) => m.classification === "engine").length,
  view: modules.filter((m) => m.classification === "view").length,
  mixed: modules.filter((m) => m.classification === "mixed").length,
};

const report = {
  description: "Wave 3.5 monolith-split inventory. Engine modules go to @dead-air/visual-engine; view modules stay in @dead-air/remotion-compositions.",
  generated_at_utc: new Date().toISOString().split("T")[0],
  summary,
  modules: modules.sort((a, b) => a.path.localeCompare(b.path)),
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`[inventory] ${modules.length} files: ${summary.engine} engine, ${summary.view} view, ${summary.mixed} mixed`);
console.log(`[inventory] report → ${OUT}`);

// Per-top-directory rollup (e.g., src/data, src/utils, src/scenes).
const byTopDir = new Map<string, { engine: number; view: number }>();
for (const m of modules) {
  const parts = m.path.split("/");
  // src/foo/...   → "src/foo"
  // src/Root.tsx  → "src/"
  const top = parts.length >= 3 ? parts.slice(0, 2).join("/") : "src/";
  const cur = byTopDir.get(top) ?? { engine: 0, view: 0 };
  if (m.classification === "engine") cur.engine++;
  else cur.view++;
  byTopDir.set(top, cur);
}
console.log(`[inventory] per-directory rollup:`);
const dirs = [...byTopDir.entries()].sort();
const colWidth = Math.max(...dirs.map(([d]) => d.length));
for (const [dir, c] of dirs) {
  const total = c.engine + c.view;
  console.log(
    `  ${dir.padEnd(colWidth)}  engine=${String(c.engine).padStart(3)}  view=${String(c.view).padStart(3)}  total=${total}`,
  );
}
