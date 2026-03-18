import { describe, it, expect } from "vitest";
import { detectGroove, grooveModifiers } from "./groove-detector";
import type { GrooveState } from "./groove-detector";

describe("detectGroove", () => {
  it("classifies pocket groove: tight rhythm, moderate energy, steady beat", () => {
    const result = detectGroove(0.8, 0.4, 0.18, 0.2);
    expect(result.type).toBe("pocket");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("classifies driving groove: strong beat, high energy, active drums", () => {
    const result = detectGroove(0.7, 0.5, 0.4, 0.2);
    expect(result.type).toBe("driving");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("classifies floating groove: weak beat, ambient, low energy", () => {
    const result = detectGroove(0.2, 0.1, 0.08, 0.5);
    expect(result.type).toBe("floating");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("classifies freeform groove: weak beat, moderate+ energy", () => {
    const result = detectGroove(0.2, 0.3, 0.3, 0.4);
    expect(result.type).toBe("freeform");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("falls back to pocket with low confidence when no pattern matches", () => {
    const result = detectGroove(0.5, 0.2, 0.2, 0.1);
    expect(result.type).toBe("pocket");
    expect(result.confidence).toBe(0.2);
  });

  it("confidence values are always in 0-1 range", () => {
    const cases: [number, number, number, number][] = [
      [1.0, 1.0, 0.20, 0.0],  // extreme pocket inputs
      [1.0, 1.0, 1.0, 0.0],   // extreme driving inputs
      [0.0, 0.0, 0.0, 1.0],   // extreme floating inputs
      [0.0, 0.0, 1.0, 1.0],   // extreme freeform inputs
      [0.5, 0.5, 0.5, 0.5],   // mid-range
    ];
    for (const [bs, do_, e, f] of cases) {
      const result = detectGroove(bs, do_, e, f);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("grooveModifiers", () => {
  it("scales modifiers by confidence: zero confidence yields neutral values", () => {
    const state: GrooveState = { type: "pocket", confidence: 0 };
    const mods = grooveModifiers(state);
    expect(mods.motionMult).toBeCloseTo(1.0);
    expect(mods.temperatureShift).toBeCloseTo(0);
    expect(mods.regularity).toBeCloseTo(0);
    expect(mods.pulseMult).toBeCloseTo(1.0);
  });

  it("scales modifiers by confidence: full confidence yields base values", () => {
    const state: GrooveState = { type: "pocket", confidence: 1 };
    const mods = grooveModifiers(state);
    expect(mods.temperatureShift).toBeCloseTo(0.3);
    expect(mods.motionMult).toBeCloseTo(0.8);
    expect(mods.regularity).toBeCloseTo(0.7);
    expect(mods.pulseMult).toBeCloseTo(1.2);
  });

  it("half confidence produces halfway between neutral and base", () => {
    const state: GrooveState = { type: "driving", confidence: 0.5 };
    const mods = grooveModifiers(state);
    // motionMult base is 1.4, neutral is 1.0 → at 0.5: 1 + (1.4-1)*0.5 = 1.2
    expect(mods.motionMult).toBeCloseTo(1.2);
    // temperatureShift base is 0.1 → at 0.5: 0.1 * 0.5 = 0.05
    expect(mods.temperatureShift).toBeCloseTo(0.05);
  });

  it("floating groove with full confidence produces cool temperature", () => {
    const state: GrooveState = { type: "floating", confidence: 1 };
    const mods = grooveModifiers(state);
    expect(mods.temperatureShift).toBeLessThan(0);
    expect(mods.motionMult).toBeLessThan(1);
  });

  it("freeform groove with full confidence has neutral temperature", () => {
    const state: GrooveState = { type: "freeform", confidence: 1 };
    const mods = grooveModifiers(state);
    expect(mods.temperatureShift).toBeCloseTo(0);
    expect(mods.motionMult).toBeCloseTo(1.0);
  });
});
