import { describe, it, expect } from "vitest";
import { computeMediaSuppression, computeArtSuppressionFactor } from "./media-suppression";

const makeTrigger = (start: number, end: number) => ({
  frameStart: start,
  frameEnd: end,
});

describe("computeMediaSuppression", () => {
  it("returns 1.0 with no active trigger", () => {
    expect(computeMediaSuppression(100, undefined)).toBe(1.0);
  });

  it("returns 0.15 when lyric trigger is active", () => {
    expect(computeMediaSuppression(100, makeTrigger(50, 150))).toBe(0.15);
  });
});

describe("computeArtSuppressionFactor", () => {
  it("returns 1 with no active trigger", () => {
    expect(computeArtSuppressionFactor(100, undefined)).toBe(1);
  });

  it("suppresses during lyric trigger", () => {
    const trigger = makeTrigger(100, 300);
    const factor = computeArtSuppressionFactor(200, trigger);
    expect(factor).toBeLessThan(1);
    expect(factor).toBeGreaterThan(0);
  });

  it("returns 1 well outside trigger range", () => {
    const trigger = makeTrigger(500, 800);
    // Frame 100 is well before the trigger starts (500 - 150 = 350)
    expect(computeArtSuppressionFactor(100, trigger)).toBe(1);
  });
});
