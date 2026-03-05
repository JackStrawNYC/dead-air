import { describe, it, expect } from "vitest";
import { computeMediaSuppression, computeArtSuppressionFactor } from "./media-suppression";

const makeMedia = (start: number, end: number, priority = 1) => ({
  frameStart: start,
  frameEnd: end,
  media: { priority },
});

const makeTrigger = (start: number, end: number) => ({
  frameStart: start,
  frameEnd: end,
});

describe("computeMediaSuppression", () => {
  it("returns 1.0 with no active windows", () => {
    expect(computeMediaSuppression(100, undefined, undefined)).toBe(1.0);
  });

  it("returns 0.15 when lyric trigger is active", () => {
    expect(computeMediaSuppression(100, undefined, makeTrigger(50, 150))).toBe(0.15);
  });

  it("returns 0.25 for high-priority media", () => {
    expect(computeMediaSuppression(100, makeMedia(50, 150, 1), undefined)).toBe(0.25);
  });

  it("returns 0.40 for low-priority media", () => {
    expect(computeMediaSuppression(100, makeMedia(50, 150, 5), undefined)).toBe(0.40);
  });

  it("lyric trigger takes precedence over media", () => {
    expect(
      computeMediaSuppression(100, makeMedia(50, 150, 1), makeTrigger(50, 150)),
    ).toBe(0.15);
  });
});

describe("computeArtSuppressionFactor", () => {
  it("returns 1 with no active windows", () => {
    expect(computeArtSuppressionFactor(100, undefined, undefined)).toBe(1);
  });

  it("suppresses during lyric trigger", () => {
    const trigger = makeTrigger(100, 300);
    const factor = computeArtSuppressionFactor(200, undefined, trigger);
    expect(factor).toBeLessThan(1);
    expect(factor).toBeGreaterThan(0);
  });

  it("suppresses during media window", () => {
    const media = makeMedia(100, 300, 1);
    const factor = computeArtSuppressionFactor(200, media, undefined, 90);
    expect(factor).toBeLessThan(1);
    expect(factor).toBeGreaterThan(0);
  });

  it("curated media suppresses more than uncurated", () => {
    const curated = makeMedia(100, 300, 1);
    const uncurated = makeMedia(100, 300, 5);
    const curatedFactor = computeArtSuppressionFactor(200, curated, undefined, 90);
    const uncuratedFactor = computeArtSuppressionFactor(200, uncurated, undefined, 90);
    expect(curatedFactor).toBeLessThan(uncuratedFactor);
  });

  it("returns 1 well outside fade range", () => {
    const media = makeMedia(500, 800, 1);
    expect(computeArtSuppressionFactor(100, media, undefined, 90)).toBe(1);
  });
});
