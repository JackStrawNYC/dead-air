#!/usr/bin/env npx tsx
/**
 * export-scene-registry — exports SCENE_REGISTRY to JSON for dashboard consumption.
 * Writes data/scene-registry.json with mode IDs, energy affinity, and complement info.
 *
 * Usage: npx tsx scripts/export-scene-registry.ts
 * Re-run when shaders are added or registry entries change.
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import { SCENE_REGISTRY } from "../src/scenes/scene-registry";
import type { VisualMode } from "../src/data/types";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "data", "scene-registry.json");

interface SceneModeEntry {
  id: string;
  energyAffinity: "low" | "mid" | "high" | "any";
  complement: string;
}

const modes: SceneModeEntry[] = (Object.entries(SCENE_REGISTRY) as [VisualMode, (typeof SCENE_REGISTRY)[VisualMode]][])
  .map(([id, entry]) => ({
    id,
    energyAffinity: entry.energyAffinity,
    complement: entry.complement,
  }));

const output = { modes };

writeFileSync(OUT, JSON.stringify(output, null, 2) + "\n", "utf-8");
console.log(`Wrote ${modes.length} scene modes to ${OUT}`);
