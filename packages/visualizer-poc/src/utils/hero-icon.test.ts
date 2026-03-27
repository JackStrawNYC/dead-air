import { describe, it, expect } from "vitest";
import { computeHeroIconState } from "./hero-icon";

describe("computeHeroIconState", () => {
  it("returns inactive at phase 0 regardless of intensity", () => {
    const state = computeHeroIconState(0, 0.9);
    expect(state.trigger).toBe(0);
    expect(state.progress).toBe(0);
  });

  it("returns inactive at phase 1 (build) with moderate intensity", () => {
    const state = computeHeroIconState(1, 0.80);
    expect(state.trigger).toBe(0);
    expect(state.progress).toBe(0);
  });

  it("triggers at phase 1 (build) with extreme intensity > 0.85", () => {
    const state = computeHeroIconState(1, 0.95);
    expect(state.trigger).toBe(1);
    // progress = (0.95 - 0.85) / 0.15 ≈ 0.667
    expect(state.progress).toBeCloseTo(0.667, 1);
  });

  it("returns inactive at phase 2 when intensity is below 0.5 threshold", () => {
    const state = computeHeroIconState(2, 0.4);
    expect(state.trigger).toBe(0);
    expect(state.progress).toBe(0);
  });

  it("triggers at phase 2 with intensity above 0.5", () => {
    const state = computeHeroIconState(2, 0.75);
    expect(state.trigger).toBe(1);
    // progress = (0.75 - 0.5) / 0.5 = 0.5
    expect(state.progress).toBeCloseTo(0.5);
  });

  it("triggers at phase 3 (sustain) with full intensity", () => {
    const state = computeHeroIconState(3, 1.0);
    expect(state.trigger).toBe(1);
    // progress = (1.0 - 0.5) / 0.5 = 1.0
    expect(state.progress).toBeCloseTo(1.0);
  });

  it("returns inactive at phase 4 (release) even with high intensity", () => {
    const state = computeHeroIconState(4, 1.0);
    expect(state.trigger).toBe(0);
    expect(state.progress).toBe(0);
  });

  it("clamps progress to 1.0 when intensity exceeds 1.0", () => {
    const state = computeHeroIconState(2, 1.5);
    expect(state.trigger).toBe(1);
    expect(state.progress).toBe(1);
  });

  it("returns zero progress at exactly 0.5 threshold", () => {
    // intensity > 0.5 check: 0.5 is NOT > 0.5, so inactive
    const state = computeHeroIconState(2, 0.5);
    expect(state.trigger).toBe(0);
    expect(state.progress).toBe(0);
  });

  it("triggers with minimal progress just above threshold", () => {
    const state = computeHeroIconState(2, 0.51);
    expect(state.trigger).toBe(1);
    // progress = (0.51 - 0.5) / 0.5 = 0.02
    expect(state.progress).toBeCloseTo(0.02, 2);
  });
});
