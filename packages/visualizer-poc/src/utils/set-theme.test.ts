import { describe, it, expect } from "vitest";
import { getSetTheme, applySetModifiers, applySetShaderFilter } from "./set-theme";
import type { ShowArcModifiers } from "../data/show-arc";
import type { VisualMode } from "../data/types";

describe("getSetTheme", () => {
  it("returns warm, punchy theme for set 1", () => {
    const theme = getSetTheme(1);
    expect(theme.warmthShift).toBe(5);
    expect(theme.brightnessOffset).toBe(0.03);
    expect(theme.saturationOffset).toBe(0.02);
    expect(theme.densityMult).toBe(1.05);
    expect(theme.windowDurationMult).toBe(0.95);
    expect(theme.abstractionOffset).toBe(0);
    expect(theme.overlayBias.character).toBe(0.08);
    expect(theme.overlayBias.atmospheric).toBe(0.05);
    expect(theme.overlayBias.sacred).toBe(-0.03);
  });

  it("returns cool, psychedelic theme for set 2", () => {
    const theme = getSetTheme(2);
    expect(theme.warmthShift).toBe(-8);
    expect(theme.brightnessOffset).toBe(-0.05);
    expect(theme.saturationOffset).toBe(-0.03);
    expect(theme.densityMult).toBe(0.90);
    expect(theme.windowDurationMult).toBe(1.15);
    expect(theme.abstractionOffset).toBe(0.10);
    expect(theme.overlayBias.sacred).toBe(0.10);
    expect(theme.overlayBias.geometric).toBe(0.08);
    expect(theme.overlayBias.nature).toBe(0.06);
    expect(theme.overlayBias.character).toBe(-0.10);
  });

  it("returns intimate theme for encore (set 3)", () => {
    const theme = getSetTheme(3);
    expect(theme.warmthShift).toBe(3);
    expect(theme.brightnessOffset).toBe(-0.04);
    expect(theme.saturationOffset).toBe(-0.01);
    expect(theme.densityMult).toBe(0.85);
    expect(theme.windowDurationMult).toBe(0.90);
    expect(theme.abstractionOffset).toBe(0);
    expect(theme.overlayBias.character).toBe(0.10);
    expect(theme.overlayBias.atmospheric).toBe(0.08);
    expect(theme.overlayBias.sacred).toBe(0.03);
    expect(theme.overlayBias.reactive).toBe(-0.05);
  });

  it("returns neutral theme for unknown set number", () => {
    const theme = getSetTheme(99);
    expect(theme.warmthShift).toBe(0);
    expect(theme.brightnessOffset).toBe(0);
    expect(theme.saturationOffset).toBe(0);
    expect(theme.densityMult).toBe(1);
    expect(theme.windowDurationMult).toBe(1);
    expect(theme.abstractionOffset).toBe(0);
    expect(Object.keys(theme.overlayBias)).toHaveLength(0);
  });

  it("returns neutral theme for set 0", () => {
    const theme = getSetTheme(0);
    expect(theme.densityMult).toBe(1);
    expect(theme.warmthShift).toBe(0);
  });

  it("returns neutral theme for negative set number", () => {
    const theme = getSetTheme(-1);
    expect(theme.densityMult).toBe(1);
    expect(theme.warmthShift).toBe(0);
  });

  it("set 1 has boosted structured modes and positive camera steadiness", () => {
    const theme = getSetTheme(1);
    expect(theme.boostedModes).toContain("concert_lighting");
    expect(theme.suppressedModes.length).toBeGreaterThan(0);
    expect(theme.cameraSteadinessOffset).toBeGreaterThan(0);
  });

  it("set 2 has boosted psychedelic modes and negative camera steadiness", () => {
    const theme = getSetTheme(2);
    expect(theme.boostedModes).toContain("sacred_geometry");
    expect(theme.suppressedModes.length).toBe(0); // all modes available
    expect(theme.cameraSteadinessOffset).toBeLessThan(0);
  });

  it("encore has golden warmth and high camera steadiness", () => {
    const theme = getSetTheme(3);
    expect(theme.boostedModes).toContain("oil_projector");
    expect(theme.cameraSteadinessOffset).toBeGreaterThan(0);
  });
});

describe("applySetModifiers", () => {
  const BASE: ShowArcModifiers = {
    overlayBias: { character: 0.10, sacred: 0.05 },
    densityMult: 1.2,
    windowDurationMult: 0.8,
    saturationOffset: 0.05,
    brightnessOffset: 0.03,
    hueShift: 5,
    abstractionLevel: 0.1,
  };

  it("composes set 1 modifiers into base", () => {
    const result = applySetModifiers(BASE, getSetTheme(1));
    // Multiplicative
    expect(result.densityMult).toBeCloseTo(1.2 * 1.05);
    expect(result.windowDurationMult).toBeCloseTo(0.8 * 0.95);
    // Additive
    expect(result.saturationOffset).toBeCloseTo(0.05 + 0.02);
    expect(result.brightnessOffset).toBeCloseTo(0.03 + 0.03);
    expect(result.hueShift).toBeCloseTo(5 + 5);
    // Abstraction clamped
    expect(result.abstractionLevel).toBeCloseTo(0.1 + 0);
    // Overlay bias merged
    expect(result.overlayBias.character).toBeCloseTo(0.10 + 0.08);
    expect(result.overlayBias.sacred).toBeCloseTo(0.05 + (-0.03));
    expect(result.overlayBias.atmospheric).toBeCloseTo(0.05);
  });

  it("composes set 2 modifiers — abstraction clamped to 1", () => {
    const highAbstraction: ShowArcModifiers = { ...BASE, abstractionLevel: 0.95 };
    const result = applySetModifiers(highAbstraction, getSetTheme(2));
    expect(result.abstractionLevel).toBe(1.0); // clamped: 0.95 + 0.10
  });

  it("composes neutral set without changing base", () => {
    const result = applySetModifiers(BASE, getSetTheme(99));
    expect(result.densityMult).toBe(BASE.densityMult);
    expect(result.windowDurationMult).toBe(BASE.windowDurationMult);
    expect(result.saturationOffset).toBe(BASE.saturationOffset);
    expect(result.brightnessOffset).toBe(BASE.brightnessOffset);
    expect(result.hueShift).toBe(BASE.hueShift);
    expect(result.abstractionLevel).toBe(BASE.abstractionLevel);
    expect(result.overlayBias.character).toBe(0.10);
    expect(result.overlayBias.sacred).toBe(0.05);
  });
});

describe("applySetShaderFilter", () => {
  it("boosts set 1 modes and suppresses abstract modes", () => {
    const pool: VisualMode[] = ["concert_lighting", "cosmic_dust", "tie_dye", "aurora"];
    const filtered = applySetShaderFilter(pool, 1);
    // concert_lighting, tie_dye, aurora are boosted (appear 2x each)
    expect(filtered.filter((m) => m === "concert_lighting").length).toBe(2);
    expect(filtered.filter((m) => m === "tie_dye").length).toBe(2);
    // cosmic_dust is suppressed (set 1 suppressedModes)
    expect(filtered).not.toContain("cosmic_dust");
  });

  it("set 2 boosts psychedelic modes without suppressing any", () => {
    const pool: VisualMode[] = ["cosmic_voyage", "concert_lighting", "sacred_geometry"];
    const filtered = applySetShaderFilter(pool, 2);
    expect(filtered.filter((m) => m === "cosmic_voyage").length).toBe(2);
    expect(filtered.filter((m) => m === "sacred_geometry").length).toBe(2);
    expect(filtered).toContain("concert_lighting");
  });

  it("encore suppresses harsh modes", () => {
    const pool: VisualMode[] = ["oil_projector", "databend", "vintage_film"];
    const filtered = applySetShaderFilter(pool, 3);
    expect(filtered).not.toContain("databend");
    expect(filtered).toContain("oil_projector");
  });

  it("does not empty pool when all modes suppressed", () => {
    const pool: VisualMode[] = ["cosmic_dust", "void_light"];
    const filtered = applySetShaderFilter(pool, 1);
    expect(filtered.length).toBeGreaterThan(0);
  });

  it("returns unchanged for unknown set", () => {
    const pool: VisualMode[] = ["concert_lighting", "tie_dye"];
    const filtered = applySetShaderFilter(pool, 99);
    expect(filtered).toEqual(pool);
  });
});
