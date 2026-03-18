import { describe, it, expect } from "vitest";
import { getSectionVocabulary, blendVocabularies } from "./section-vocabulary";
import type { SectionVocabulary } from "./section-vocabulary";

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
  });

  it("returns jam vocabulary", () => {
    const v = getSectionVocabulary("jam");
    expect(v.overlayDensityMult).toBe(0.5);
    expect(v.cutsPermitted).toBe(true);
  });

  it("returns space vocabulary with negative saturation offset", () => {
    const v = getSectionVocabulary("space");
    expect(v.overlayDensityMult).toBe(0.2);
    expect(v.cutsPermitted).toBe(false);
    expect(v.saturationOffset).toBe(-0.12);
  });

  it("returns solo vocabulary with high drift speed", () => {
    const v = getSectionVocabulary("solo");
    expect(v.driftSpeedMult).toBe(1.5);
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
