/**
 * Tests for semantic-router.ts — CLAP semantic score → visual routing.
 *
 * Updated for May 2026 audit (Tier 1 #2): pools recurated to post-blocklist
 * + non-BUSTED shaders. Adds hard-gate tests for the new structural-routing
 * path.
 */

import { describe, it, expect } from "vitest";
import {
  computeSemanticProfile,
  extractSemanticScores,
  pickSemanticHardGate,
  SEMANTIC_HARD_GATE_CONFIDENCE,
  SEMANTIC_SHADERS,
} from "./semantic-router";

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

describe("SEMANTIC_SHADERS — pool integrity (audit-curated)", () => {
  const categories = ["psychedelic", "aggressive", "tender", "cosmic", "rhythmic", "ambient", "chaotic", "triumphant"] as const;

  it.each(categories)("%s pool has at least 4 candidates", (c) => {
    expect(SEMANTIC_SHADERS[c].length).toBeGreaterThanOrEqual(4);
  });

  it.each(categories)("%s pool contains no blocked shaders", (c) => {
    const blocked = SEMANTIC_SHADERS[c].filter((s) => KNOWN_BLOCKED.has(s));
    expect(blocked, `${c} has blocked: ${blocked.join(", ")}`).toEqual([]);
  });

  it.each(categories)("%s pool contains no BUSTED-tier shaders", (c) => {
    const busted = SEMANTIC_SHADERS[c].filter((s) => BUSTED_TIER.has(s));
    expect(busted, `${c} has BUSTED: ${busted.join(", ")}`).toEqual([]);
  });
});

describe("computeSemanticProfile", () => {
  it("returns neutral profile for all-zero scores", () => {
    const result = computeSemanticProfile({});
    expect(result.dominant).toBeNull();
    expect(result.dominantConfidence).toBe(0);
    expect(result.preferredShaders).toEqual([]);
    expect(result.motionIntensity).toBe(1);
  });

  it("identifies dominant category correctly", () => {
    const result = computeSemanticProfile({
      psychedelic: 0.8, aggressive: 0.2, tender: 0.1, cosmic: 0.3,
    });
    expect(result.dominant).toBe("psychedelic");
    expect(result.dominantConfidence).toBe(0.8);
  });

  it("routes psychedelic to fractal/sacred shaders", () => {
    const result = computeSemanticProfile({ psychedelic: 0.9 });
    expect(result.preferredShaders).toContain("fractal_temple");
    expect(result.preferredShaders).toContain("sacred_geometry");
  });

  it("routes aggressive to high-energy ritual shaders", () => {
    const result = computeSemanticProfile({ aggressive: 0.85 });
    expect(result.preferredShaders).toContain("electric_arc");
  });

  it("routes tender to warm/intimate shaders + lower motion", () => {
    const result = computeSemanticProfile({ tender: 0.9 });
    expect(result.preferredShaders).toContain("porch_twilight");
    expect(result.preferredShaders).toContain("aurora");
    expect(result.motionIntensity).toBeLessThan(1);
  });

  it("routes cosmic to void/depth shaders + cool color temp", () => {
    const result = computeSemanticProfile({ cosmic: 0.7 });
    expect(result.preferredShaders).toContain("deep_ocean");
    expect(result.preferredShaders).toContain("void_light");
    expect(result.colorTemperature).toBeLessThan(0);
  });

  it("blends secondary categories into preferences", () => {
    const result = computeSemanticProfile({ psychedelic: 0.7, cosmic: 0.5 });
    expect(result.preferredShaders).toContain("fractal_temple"); // psychedelic
    expect(result.preferredShaders).toContain("deep_ocean");     // cosmic
  });

  it("computes overlay biases weighted by score", () => {
    const result = computeSemanticProfile({ aggressive: 0.8 });
    expect(result.overlayBiases["reactive"]).toBeGreaterThan(0);
  });

  it("adjusts motion intensity by category", () => {
    const aggressive = computeSemanticProfile({ aggressive: 0.9 });
    const ambient = computeSemanticProfile({ ambient: 0.9 });
    expect(aggressive.motionIntensity).toBeGreaterThan(ambient.motionIntensity);
  });

  it("clamps color temperature to [-1, 1]", () => {
    const result = computeSemanticProfile({ aggressive: 1.0 });
    expect(result.colorTemperature).toBeGreaterThanOrEqual(-1);
    expect(result.colorTemperature).toBeLessThanOrEqual(1);
  });
});

describe("pickSemanticHardGate (audit Tier 1 #2)", () => {
  it("returns null when below confidence threshold", () => {
    const profile = computeSemanticProfile({ psychedelic: 0.4 });
    expect(pickSemanticHardGate(profile)).toBeNull();
  });

  it("returns the source pool above threshold", () => {
    const profile = computeSemanticProfile({ psychedelic: 0.8 });
    const pool = pickSemanticHardGate(profile);
    expect(pool).toEqual(SEMANTIC_SHADERS.psychedelic);
  });

  it("hard-gate threshold is the audit-recommended 0.55", () => {
    expect(SEMANTIC_HARD_GATE_CONFIDENCE).toBe(0.55);
  });

  it("returns null when no dominant category", () => {
    const profile = computeSemanticProfile({});
    expect(pickSemanticHardGate(profile)).toBeNull();
  });

  it("hard-gate returns DISTINCT shaders (no soft-bias 2x stuffing)", () => {
    // pickSemanticHardGate pulls SEMANTIC_SHADERS directly, NOT the
    // weighted preferredShaders list (which intentionally duplicates
    // the dominant family for soft-bias weighting).
    const profile = computeSemanticProfile({ cosmic: 0.9 });
    const hardPool = pickSemanticHardGate(profile);
    expect(hardPool).not.toBeNull();
    const unique = new Set(hardPool!);
    expect(unique.size).toBe(hardPool!.length);
  });
});

describe("extractSemanticScores", () => {
  it("returns null when no semantic data present", () => {
    expect(extractSemanticScores({})).toBeNull();
  });

  it("returns null when all scores are zero", () => {
    expect(extractSemanticScores({ semanticPsychedelic: 0, semanticAggressive: 0 })).toBeNull();
  });

  it("extracts scores when data is present", () => {
    const result = extractSemanticScores({ semanticPsychedelic: 0.8, semanticCosmic: 0.3 });
    expect(result).not.toBeNull();
    expect(result!.psychedelic).toBe(0.8);
    expect(result!.cosmic).toBe(0.3);
    expect(result!.aggressive).toBe(0);
  });
});
