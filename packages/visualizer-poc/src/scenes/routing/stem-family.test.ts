import { describe, it, expect } from "vitest";
import {
  STEM_FAMILY_POOLS,
  STEM_HARD_GATE_CONFIDENCE,
  pickStemFamilyPool,
} from "./stem-family";

const KNOWN_BLOCKED = new Set([
  "combustible_voronoi", "creation", "fluid_2d", "spectral_bridge",
  "obsidian_mirror", "amber_drift", "volumetric_clouds", "volumetric_smoke",
  "volumetric_nebula", "digital_rain", "protean_clouds", "seascape",
  "warm_nebula", "particle_nebula", "cosmic_voyage",
  "fractal_flames", "reaction_diffusion", "oil_projector", "liquid_light",
  "tie_dye",
]);

const BUSTED_TIER = new Set([
  "voronoi_flow", "psychedelic_garden", "bioluminescence",
  "volumetric_smoke", "smoke_rings", "coral_reef", "smoke_and_mirrors",
  "flower_field", "particle_nebula", "memorial_drift", "bloom_explosion",
  "inferno", "earthquake_fissure", "lava_flow", "desert_road",
]);

describe("STEM_FAMILY_POOLS — pool integrity", () => {
  const musicians = ["jerry", "phil", "drums", "bobby", "vocals"] as const;

  it.each(musicians)("%s pool has at least 4 candidates", (m) => {
    expect(STEM_FAMILY_POOLS[m].length).toBeGreaterThanOrEqual(4);
  });

  it.each(musicians)("%s pool contains no blocked shaders", (m) => {
    const blocked = STEM_FAMILY_POOLS[m].filter((s) => KNOWN_BLOCKED.has(s));
    expect(blocked, `${m} has blocked: ${blocked.join(", ")}`).toEqual([]);
  });

  it.each(musicians)("%s pool contains no BUSTED-tier shaders", (m) => {
    const busted = STEM_FAMILY_POOLS[m].filter((s) => BUSTED_TIER.has(s));
    expect(busted, `${m} has BUSTED: ${busted.join(", ")}`).toEqual([]);
  });

  it("ensemble has empty pool (handled by existing routing)", () => {
    expect(STEM_FAMILY_POOLS.ensemble).toEqual([]);
  });

  it("Phil pool leans cosmic-deep (indigo bass character)", () => {
    expect(STEM_FAMILY_POOLS.phil).toContain("deep_ocean");
    expect(STEM_FAMILY_POOLS.phil).toContain("dark_star_void");
  });

  it("drums pool leans geometric-percussive", () => {
    expect(STEM_FAMILY_POOLS.drums).toContain("mandala_engine");
    expect(STEM_FAMILY_POOLS.drums).toContain("kaleidoscope");
  });

  it("Jerry pool leans warm-cathedral", () => {
    expect(STEM_FAMILY_POOLS.jerry).toContain("aurora");
    expect(STEM_FAMILY_POOLS.jerry).toContain("fractal_temple");
  });
});

describe("pickStemFamilyPool — gating", () => {
  it("returns null below hard-gate confidence", () => {
    expect(pickStemFamilyPool("phil", 0.3)).toBeNull();
    expect(pickStemFamilyPool("phil", 0.59)).toBeNull();
  });

  it("returns the pool at or above hard-gate confidence", () => {
    const r = pickStemFamilyPool("phil", STEM_HARD_GATE_CONFIDENCE);
    expect(r).toEqual(STEM_FAMILY_POOLS.phil);
  });

  it("returns null for ensemble (no single dominant musician)", () => {
    expect(pickStemFamilyPool("ensemble", 0.95)).toBeNull();
  });

  it("returns null when dominant is undefined", () => {
    expect(pickStemFamilyPool(undefined, 0.95)).toBeNull();
  });

  it("returns null for unknown musician strings", () => {
    expect(pickStemFamilyPool("unknown_musician", 0.95)).toBeNull();
  });

  it("hard-gate threshold is at the audit-recommended 0.6", () => {
    // The audit recommended >0.6 for "strong dominance." Pin so a future
    // tweak doesn't silently lower it (and force pivots on weak signals).
    expect(STEM_HARD_GATE_CONFIDENCE).toBe(0.6);
  });
});
