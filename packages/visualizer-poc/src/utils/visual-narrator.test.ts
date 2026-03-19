import { describe, it, expect } from "vitest";
import { computeNarrativeDirective } from "./visual-narrator";
import type { NarrativeContext, NarrativeDirective } from "./visual-narrator";

describe("computeNarrativeDirective", () => {
  it("drums/space override: near-void, cool, no heroes, slow motion", () => {
    const ctx: NarrativeContext = {
      isDrumsSpace: true,
      setNumber: 2,
      setProgress: 0.5,
      energy: 0.1,
    };
    const result = computeNarrativeDirective(ctx);
    expect(result.overlayDensityMult).toBe(0.1);
    expect(result.temperature).toBe(-0.6);
    expect(result.heroPermitted).toBe(false);
    expect(result.motionMult).toBe(0.3);
  });

  it("set 1 early: warm temperature, high overlay density", () => {
    const ctx: NarrativeContext = {
      setNumber: 1,
      setProgress: 0.1,
      energy: 0.3,
    };
    const result = computeNarrativeDirective(ctx);
    // Set 1 temperature = 0.3 - 0.1*0.2 = 0.28 → positive (warm)
    expect(result.temperature).toBeGreaterThan(0);
    // Set 1 overlayDensityMult = 1.1 - 0.1*0.2 = 1.08 → > 0.8
    expect(result.overlayDensityMult).toBeGreaterThan(0.8);
  });

  it("set 2 mid: deep exploration with high abstraction", () => {
    const ctx: NarrativeContext = {
      setNumber: 2,
      setProgress: 0.5,
      energy: 0.3,
    };
    const result = computeNarrativeDirective(ctx);
    // abstractionPeak = 1 - |0.5-0.5|*2 = 1.0
    // abstractionLevel = 0.4 + 1.0*0.5 = 0.9 → > 0.7
    expect(result.abstractionLevel).toBeGreaterThan(0.7);
  });

  it("encore (set 3): party mode with warm temperature and boosted saturation", () => {
    const ctx: NarrativeContext = {
      setNumber: 3,
      setProgress: 0.5,
      energy: 0.5,
    };
    const result = computeNarrativeDirective(ctx);
    expect(result.temperature).toBe(0.5);
    expect(result.saturationOffset).toBeGreaterThanOrEqual(0.15);
    expect(result.brightnessOffset).toBeGreaterThanOrEqual(0.10);
  });

  it("space section: sparse overlays and no heroes", () => {
    const ctx: NarrativeContext = {
      setNumber: 2,
      setProgress: 0.5,
      energy: 0.1,
      sectionType: "space",
    };
    const result = computeNarrativeDirective(ctx);
    // overlayDensityMult = base * 0.3 → well below 0.3
    expect(result.overlayDensityMult).toBeLessThan(0.3);
    expect(result.heroPermitted).toBe(false);
  });

  it("jam section: increased abstraction and reduced overlay density", () => {
    const ctx: NarrativeContext = {
      setNumber: 2,
      setProgress: 0.5,
      energy: 0.3,
      sectionType: "jam",
    };
    const result = computeNarrativeDirective(ctx);
    // abstractionLevel = base (0.9) + 0.2 capped at 1.0
    expect(result.abstractionLevel).toBeGreaterThan(0.7);
    // overlayDensityMult = base * 0.6 → reduced
    const noJam = computeNarrativeDirective({
      setNumber: 2,
      setProgress: 0.5,
      energy: 0.3,
    });
    expect(result.overlayDensityMult).toBeLessThan(noJam.overlayDensityMult);
  });

  it("floating groove: cool temperature and slow motion", () => {
    const ctx: NarrativeContext = {
      setNumber: 2,
      setProgress: 0.5,
      energy: 0.1,
      grooveType: "floating",
    };
    const result = computeNarrativeDirective(ctx);
    // temperature = -0.1 - 0.3 = -0.4 → < -0.3
    expect(result.temperature).toBeLessThan(-0.3);
    // motionMult = 1.0 * 0.4 = 0.4 → < 0.5
    expect(result.motionMult).toBeLessThan(0.5);
  });

  it("jam peak phase: heroes permitted and saturation boost", () => {
    const ctx: NarrativeContext = {
      setNumber: 2,
      setProgress: 0.5,
      energy: 0.5,
      jamPhase: "peak",
    };
    const result = computeNarrativeDirective(ctx);
    expect(result.heroPermitted).toBe(true);
    expect(result.saturationOffset).toBeGreaterThan(0);
  });

  it("all outputs are clamped to valid ranges", () => {
    // Test with extreme combinations that push values past bounds
    const extremeContexts: NarrativeContext[] = [
      { setNumber: 1, setProgress: 0, energy: 1, sectionType: "chorus", grooveType: "driving", jamPhase: "peak", jamDeepening: true },
      { setNumber: 2, setProgress: 1, energy: 0, sectionType: "space", grooveType: "floating", jamPhase: "explore" },
      { setNumber: 3, setProgress: 0, energy: 0.5, sectionType: "solo", grooveType: "freeform" },
      { isDrumsSpace: true, setNumber: 1, setProgress: 0, energy: 0 },
    ];

    for (const ctx of extremeContexts) {
      const result = computeNarrativeDirective(ctx);
      expect(result.overlayDensityMult).toBeGreaterThanOrEqual(0);
      expect(result.overlayDensityMult).toBeLessThanOrEqual(2);
      expect(result.saturationOffset).toBeGreaterThanOrEqual(-0.5);
      expect(result.saturationOffset).toBeLessThanOrEqual(0.5);
      expect(result.abstractionLevel).toBeGreaterThanOrEqual(0);
      expect(result.abstractionLevel).toBeLessThanOrEqual(1);
      expect(result.motionMult).toBeGreaterThanOrEqual(0.1);
      expect(result.motionMult).toBeLessThanOrEqual(2);
    }
  });
});
