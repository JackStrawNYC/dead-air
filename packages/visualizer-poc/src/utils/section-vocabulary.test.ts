import { describe, it, expect } from "vitest";
import { getSectionVocabulary, blendVocabularies, getSectionShaderFamily, SECTION_TYPE_FAMILIES } from "./section-vocabulary";
import type { SectionVocabulary } from "./section-vocabulary";

const KNOWN_BLOCKED = new Set([
  "combustible_voronoi", "creation", "fluid_2d", "spectral_bridge",
  "obsidian_mirror", "amber_drift", "volumetric_clouds", "volumetric_smoke",
  "volumetric_nebula", "digital_rain", "protean_clouds", "seascape",
  "warm_nebula", "particle_nebula", "cosmic_voyage",
]);
const BUSTED_TIER = new Set([
  "voronoi_flow", "psychedelic_garden", "bioluminescence", "memorial_drift",
  "smoke_rings", "coral_reef", "smoke_and_mirrors", "flower_field",
  "particle_nebula", "bloom_explosion", "inferno", "earthquake_fissure",
  "lava_flow", "desert_road",
]);

describe("SECTION_TYPE_FAMILIES — pool integrity (Tier 1 #3)", () => {
  const types = ["verse", "chorus", "jam", "space", "solo", "bridge", "intro", "outro"];

  it.each(types)("%s family has at least 4 candidates", (t) => {
    expect(SECTION_TYPE_FAMILIES[t].length).toBeGreaterThanOrEqual(4);
  });

  it.each(types)("%s family contains no blocked shaders", (t) => {
    const blocked = SECTION_TYPE_FAMILIES[t].filter((s) => KNOWN_BLOCKED.has(s));
    expect(blocked, `${t} has blocked: ${blocked.join(", ")}`).toEqual([]);
  });

  it.each(types)("%s family contains no BUSTED shaders", (t) => {
    const busted = SECTION_TYPE_FAMILIES[t].filter((s) => BUSTED_TIER.has(s));
    expect(busted, `${t} has BUSTED: ${busted.join(", ")}`).toEqual([]);
  });

  it("space family leans cosmic/void (audit-flagged sacred moment)", () => {
    expect(SECTION_TYPE_FAMILIES.space).toContain("deep_ocean");
    expect(SECTION_TYPE_FAMILIES.space).toContain("void_light");
    expect(SECTION_TYPE_FAMILIES.space).toContain("cosmic_dust");
  });

  it("verse family leans intimate/warm (low-motion sections)", () => {
    expect(SECTION_TYPE_FAMILIES.verse).toContain("porch_twilight");
  });

  it("solo family leans dramatic (high-energy sections)", () => {
    expect(SECTION_TYPE_FAMILIES.solo).toContain("electric_arc");
  });
});

describe("getSectionShaderFamily", () => {
  it("returns family for known section types", () => {
    expect(getSectionShaderFamily("jam")).toEqual(SECTION_TYPE_FAMILIES.jam);
    expect(getSectionShaderFamily("VERSE")).toEqual(SECTION_TYPE_FAMILIES.verse);
  });

  it("returns null for unknown / undefined", () => {
    expect(getSectionShaderFamily(undefined)).toBeNull();
    expect(getSectionShaderFamily("")).toBeNull();
    expect(getSectionShaderFamily("foo_bar")).toBeNull();
  });
});

describe("getSectionVocabulary", () => {
  it("returns verse vocabulary", () => {
    const v = getSectionVocabulary("verse");
    expect(v.overlayDensityMult).toBe(0.7);
    expect(v.cutsPermitted).toBe(false);
  });

  it("returns chorus vocabulary", () => {
    const v = getSectionVocabulary("chorus");
    expect(v.overlayDensityMult).toBe(1.3);
    expect(v.cutsPermitted).toBe(true);
    expect(v.saturationOffset).toBe(0.15);
    expect(v.brightnessOffset).toBe(0.06);
  });

  it("returns jam vocabulary", () => {
    const v = getSectionVocabulary("jam");
    expect(v.overlayDensityMult).toBe(0.5);
    expect(v.cutsPermitted).toBe(true);
  });

  it("returns space vocabulary with negative saturation offset", () => {
    const v = getSectionVocabulary("space");
    expect(v.overlayDensityMult).toBe(0.25);
    expect(v.cutsPermitted).toBe(false);
    expect(v.saturationOffset).toBe(-0.12);
    expect(v.brightnessOffset).toBe(-0.03);
  });

  it("returns solo vocabulary with high drift speed and boosted saturation", () => {
    const v = getSectionVocabulary("solo");
    expect(v.driftSpeedMult).toBe(1.5);
    expect(v.saturationOffset).toBe(0.20);
    expect(v.brightnessOffset).toBe(0.06);
  });

  it("returns default vocabulary for undefined section type", () => {
    const v = getSectionVocabulary(undefined);
    expect(v.overlayDensityMult).toBe(1.0);
    expect(v.driftSpeedMult).toBe(1.0);
    expect(v.cutsPermitted).toBe(true);
    expect(v.saturationOffset).toBe(0);
  });

  it("returns default vocabulary for unknown string", () => {
    const v = getSectionVocabulary("unknown_section_type");
    expect(v.overlayDensityMult).toBe(1.0);
    expect(v.driftSpeedMult).toBe(1.0);
  });

  it("handles case-insensitive lookup", () => {
    const v = getSectionVocabulary("VERSE");
    expect(v.overlayDensityMult).toBe(0.7);
  });
});

describe("blendVocabularies", () => {
  const verse = getSectionVocabulary("verse");
  const chorus = getSectionVocabulary("chorus");

  it("returns a at t=0", () => {
    const result = blendVocabularies(verse, chorus, 0);
    expect(result.overlayDensityMult).toBeCloseTo(verse.overlayDensityMult);
    expect(result.cameraSteadiness).toBeCloseTo(verse.cameraSteadiness);
    expect(result.driftSpeedMult).toBeCloseTo(verse.driftSpeedMult);
    expect(result.saturationOffset).toBeCloseTo(verse.saturationOffset);
    expect(result.cutsPermitted).toBe(verse.cutsPermitted);
    expect(result.brightnessOffset).toBeCloseTo(verse.brightnessOffset);
  });

  it("returns b at t=1", () => {
    const result = blendVocabularies(verse, chorus, 1);
    expect(result.overlayDensityMult).toBeCloseTo(chorus.overlayDensityMult);
    expect(result.cameraSteadiness).toBeCloseTo(chorus.cameraSteadiness);
    expect(result.driftSpeedMult).toBeCloseTo(chorus.driftSpeedMult);
    expect(result.saturationOffset).toBeCloseTo(chorus.saturationOffset);
    expect(result.cutsPermitted).toBe(chorus.cutsPermitted);
    expect(result.brightnessOffset).toBeCloseTo(chorus.brightnessOffset);
  });

  it("returns midpoint values at t=0.5", () => {
    const result = blendVocabularies(verse, chorus, 0.5);
    // overlayDensityMult: 0.7 + (1.3 - 0.7) * 0.5 = 1.0
    expect(result.overlayDensityMult).toBeCloseTo(1.0);
    // driftSpeedMult: 0.8 + (1.2 - 0.8) * 0.5 = 1.0
    expect(result.driftSpeedMult).toBeCloseTo(1.0);
  });

  it("switches cutsPermitted at midpoint (t<0.5 uses a, t>=0.5 uses b)", () => {
    const atBelow = blendVocabularies(verse, chorus, 0.49);
    expect(atBelow.cutsPermitted).toBe(verse.cutsPermitted); // false

    const atMid = blendVocabularies(verse, chorus, 0.5);
    expect(atMid.cutsPermitted).toBe(chorus.cutsPermitted); // true
  });

  it("clamps t below 0 to 0", () => {
    const result = blendVocabularies(verse, chorus, -1);
    expect(result.overlayDensityMult).toBeCloseTo(verse.overlayDensityMult);
  });

  it("clamps t above 1 to 1", () => {
    const result = blendVocabularies(verse, chorus, 2);
    expect(result.overlayDensityMult).toBeCloseTo(chorus.overlayDensityMult);
  });
});
