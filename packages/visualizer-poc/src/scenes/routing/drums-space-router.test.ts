/**
 * Drums/Space router — pool integrity + identity override + activeShaderPool gating.
 */
import { describe, it, expect } from "vitest";
import {
  DRUMS_SPACE_SHADER_POOLS,
  DRUMS_SPACE_ENTRY_BLEND,
  pickDrumsSpaceMode,
  getDrumsSpaceMode,
} from "./drums-space-router";
import type { SongIdentity } from "../../data/song-identities";
import type { DrumsSpaceSubPhase } from "../../utils/drums-space-phase";

// Mirrors the manifest-generator SHADER_BLOCKLIST + visualizer
// AUTO_SELECT_BLOCKLIST. A pool entry that ends up here would render as
// black or be filtered out, defeating the routing override.
const KNOWN_BLOCKED = new Set([
  "combustible_voronoi", "creation", "fluid_2d", "spectral_bridge",
  "obsidian_mirror", "amber_drift", "volumetric_clouds", "volumetric_smoke",
  "volumetric_nebula", "digital_rain", "protean_clouds", "seascape",
  "warm_nebula", "particle_nebula", "liquid_mandala", "star_nest",
  "crystalline_void", "space_travel", "fractal_zoom", "acid_melt",
  "aurora_sky", "spinning_spiral", "prism_refraction", "spectral_analyzer",
  "neon_grid", "concert_beams", "blacklight_glow", "liquid_projector",
  "databend", "signal_decay", "climax_surge", "cellular_automata",
  "bioluminescence", "luminous_cavern", "storm_vortex", "mycelium_network",
  "cosmic_voyage", "solar_flare", "forest", "dual_blend", "dual_shader",
  "smoke_and_mirrors", "molten_glass", "particle_burst",
  // Banned per shader-quality LAW (atmospheric > frenetic, no flat 2D)
  "fractal_flames", "reaction_diffusion", "oil_projector", "liquid_light",
  "plasma_field", "tie_dye",
]);

// BUSTED tier from SHADER-COST-PROFILE-2026-05-02.md (>66ms p95 @ 360p
// extrapolates to >2.4s/frame at 4K — unacceptable during 5min Space holds).
const BUSTED_TIER = new Set([
  "voronoi_flow", "psychedelic_garden", "bioluminescence",
  "volumetric_smoke", "smoke_rings", "coral_reef", "smoke_and_mirrors",
  "flower_field", "particle_nebula", "memorial_drift", "bloom_explosion",
  "inferno", "earthquake_fissure", "lava_flow", "desert_road",
]);

describe("DRUMS_SPACE_SHADER_POOLS — pool integrity", () => {
  const phases: DrumsSpaceSubPhase[] = [
    "drums_tribal", "transition", "space_ambient",
    "space_textural", "space_melodic", "reemergence",
  ];

  it.each(phases)("%s pool has at least 5 candidates", (phase) => {
    expect(DRUMS_SPACE_SHADER_POOLS[phase].length).toBeGreaterThanOrEqual(5);
  });

  it.each(phases)("%s pool contains no blocked shaders", (phase) => {
    const blocked = DRUMS_SPACE_SHADER_POOLS[phase].filter((s) => KNOWN_BLOCKED.has(s));
    expect(blocked, `${phase} pool has blocked: ${blocked.join(", ")}`).toEqual([]);
  });

  it.each(phases)("%s pool contains no BUSTED-tier shaders", (phase) => {
    const expensive = DRUMS_SPACE_SHADER_POOLS[phase].filter((s) => BUSTED_TIER.has(s));
    expect(expensive, `${phase} pool has BUSTED: ${expensive.join(", ")}`).toEqual([]);
  });

  it("every phase has an entry blend mode", () => {
    for (const phase of phases) {
      expect(DRUMS_SPACE_ENTRY_BLEND[phase]).toBeDefined();
    }
  });

  it("entry blend modes are valid GPU blend names", () => {
    const valid = new Set(["dissolve", "additive", "luminance_key", "noise_dissolve"]);
    for (const phase of phases) {
      expect(valid.has(DRUMS_SPACE_ENTRY_BLEND[phase])).toBe(true);
    }
  });

  it("drums_tribal enters with additive (heat erupts)", () => {
    expect(DRUMS_SPACE_ENTRY_BLEND.drums_tribal).toBe("additive");
  });

  it("space_ambient enters with luminance_key (light dissolves into void)", () => {
    expect(DRUMS_SPACE_ENTRY_BLEND.space_ambient).toBe("luminance_key");
  });

  it("reemergence enters with additive (light returning)", () => {
    expect(DRUMS_SPACE_ENTRY_BLEND.reemergence).toBe("additive");
  });
});

describe("pickDrumsSpaceMode", () => {
  it("returns a pool member when no identity is set", () => {
    const mode = pickDrumsSpaceMode("drums_tribal", 1234);
    expect(DRUMS_SPACE_SHADER_POOLS.drums_tribal).toContain(mode);
  });

  it("seeded picks are deterministic for the same (phase, seed)", () => {
    expect(pickDrumsSpaceMode("space_ambient", 555))
      .toBe(pickDrumsSpaceMode("space_ambient", 555));
  });

  it("song identity override wins when activeShaderPool allows it", () => {
    const identity: SongIdentity = {
      drumsSpaceShaders: { drums_tribal: "aurora" },
    } as SongIdentity;
    const result = pickDrumsSpaceMode("drums_tribal", 42, identity, ["aurora", "deep_ocean"]);
    expect(result).toBe("aurora");
  });

  it("song identity override is rejected when not in activeShaderPool", () => {
    const identity: SongIdentity = {
      drumsSpaceShaders: { drums_tribal: "creation" }, // blocked
    } as SongIdentity;
    // activeShaderPool excludes creation → fall through to pool pick
    const activePool = DRUMS_SPACE_SHADER_POOLS.drums_tribal;
    const result = pickDrumsSpaceMode("drums_tribal", 42, identity, activePool);
    expect(result).not.toBe("creation");
    expect(activePool).toContain(result);
  });

  it("activeShaderPool filter applies before random pick", () => {
    // Restrict to a single pool member — pickDrumsSpaceMode must return it
    const restricted = ["mandala_engine"];
    for (let seed = 0; seed < 20; seed++) {
      expect(pickDrumsSpaceMode("drums_tribal", seed, undefined, restricted))
        .toBe("mandala_engine");
    }
  });

  it("falls through to unfiltered pool when filter starves", () => {
    // activeShaderPool excludes ALL pool members → fall back to pool
    const result = pickDrumsSpaceMode("drums_tribal", 7, undefined, ["foo_shader"]);
    expect(DRUMS_SPACE_SHADER_POOLS.drums_tribal).toContain(result);
  });

  it("unknown phase returns a safe atmospheric default", () => {
    expect(pickDrumsSpaceMode("not_a_phase", 1)).toBe("cosmic_voyage");
    expect(pickDrumsSpaceMode("not_a_phase", 1, undefined, ["aurora"])).toBe("aurora");
  });

  it("phase-string hashing avoids the length-collision bug", () => {
    // space_ambient (13) and space_melodic (13) used to share a seed
    // because the legacy code keyed on phase.length. Verify the new
    // hashing produces different distributions across many seeds.
    let same = 0;
    let different = 0;
    for (let seed = 0; seed < 200; seed++) {
      if (pickDrumsSpaceMode("space_ambient", seed) === pickDrumsSpaceMode("space_melodic", seed)) {
        same++;
      } else {
        different++;
      }
    }
    // The pools share some shaders (aurora, nimitz_aurora, void_light) so
    // some collisions are expected — but most seeds must diverge.
    expect(different).toBeGreaterThan(same);
  });
});

describe("getDrumsSpaceMode (legacy alias)", () => {
  it("delegates to pickDrumsSpaceMode without activeShaderPool", () => {
    // Same seed → same answer
    expect(getDrumsSpaceMode("drums_tribal", 100))
      .toBe(pickDrumsSpaceMode("drums_tribal", 100, undefined, undefined));
  });
});
