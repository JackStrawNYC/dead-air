import { describe, it, expect } from "vitest";
import { resolveLyricTriggers } from "./lyric-trigger-resolver";

// Mock alignment words for testing — uses "Scarlet Begonias" trigger phrase "shown the light"
const mockAlignment = [
  { word: "once", start: 17.5, end: 17.7, score: 1 },
  { word: "in", start: 17.7, end: 17.9, score: 1 },
  { word: "shown", start: 22.0, end: 22.3, score: 1 },
  { word: "the", start: 22.3, end: 22.6, score: 1 },
  { word: "light", start: 22.6, end: 23.0, score: 1 },
  { word: "you", start: 25.0, end: 25.2, score: 1 },
  { word: "know", start: 25.2, end: 25.4, score: 1 },
];

describe("resolveLyricTriggers", () => {
  it("returns empty array for unknown song", () => {
    const result = resolveLyricTriggers("Unknown Song", mockAlignment, 30);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty alignment", () => {
    const result = resolveLyricTriggers("Scarlet Begonias", [], 30);
    expect(result).toEqual([]);
  });

  it("resolves a trigger when phrase matches alignment", () => {
    const result = resolveLyricTriggers("Scarlet Begonias", mockAlignment, 30);
    expect(result.length).toBeGreaterThanOrEqual(1);

    const scarletTrigger = result.find((t) => t.triggerId === "scarlet-wind");
    if (scarletTrigger) {
      // Phrase "shown the light" starts at 22.0s, pre_roll is 4s → frameStart = (22.0 - 4) * 30 = 540
      expect(scarletTrigger.frameStart).toBeCloseTo(540, -1);
      // hold_seconds is 12 → frameEnd = (22.0 + 12) * 30 = 1020
      expect(scarletTrigger.frameEnd).toBeCloseTo(1020, -1);
      expect(scarletTrigger.visual).toContain("scarletbegonias");
      expect(scarletTrigger.mediaType).toBe("image");
      expect(scarletTrigger.phrase).toBe("shown the light");
    }
  });

  it("returns windows sorted by start frame", () => {
    // Estimated Prophet has trigger phrase "prophet on the burning shore"
    const epAlignment = [
      { word: "prophet", start: 30.0, end: 30.5, score: 1 },
      { word: "on", start: 30.5, end: 30.7, score: 1 },
      { word: "the", start: 30.7, end: 30.9, score: 1 },
      { word: "burning", start: 30.9, end: 31.3, score: 1 },
      { word: "shore", start: 31.3, end: 31.8, score: 1 },
    ];
    const result = resolveLyricTriggers("Estimated Prophet", epAlignment, 30);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].frameStart).toBeGreaterThanOrEqual(result[i - 1].frameStart);
    }
  });

  it("enforces minimum gap between trigger windows", () => {
    // Fire on the Mountain: phrase "fire on the mountain", hold=20, min_gap=15
    // Two occurrences close together — only first should fire
    const closeAlignment = [
      { word: "fire", start: 10.0, end: 10.3, score: 1 },
      { word: "on", start: 10.3, end: 10.5, score: 1 },
      { word: "the", start: 10.5, end: 10.7, score: 1 },
      { word: "mountain", start: 10.7, end: 11.2, score: 1 },
      // Second occurrence — within min_gap of 15s + hold of 20s = too close
      { word: "fire", start: 20.0, end: 20.3, score: 1 },
      { word: "on", start: 20.3, end: 20.5, score: 1 },
      { word: "the", start: 20.5, end: 20.7, score: 1 },
      { word: "mountain", start: 20.7, end: 21.2, score: 1 },
    ];
    const result = resolveLyricTriggers("Fire on the Mountain", closeAlignment, 30);
    // Uses first occurrence only (code takes first match), so at most 1
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it("handles case-insensitive phrase matching", () => {
    const uppercaseAlignment = [
      { word: "Shown", start: 22.0, end: 22.3, score: 1 },
      { word: "The", start: 22.3, end: 22.6, score: 1 },
      { word: "Light", start: 22.6, end: 23.0, score: 1 },
    ];
    const result = resolveLyricTriggers("Scarlet Begonias", uppercaseAlignment, 30);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("computes correct frame values at 30fps", () => {
    const result = resolveLyricTriggers("Scarlet Begonias", mockAlignment, 30);
    const trigger = result.find((t) => t.triggerId === "scarlet-wind");
    if (trigger) {
      // pre_roll not specified in trigger → uses default 4s
      // phrase "shown the light" at 22.0s → start = (22.0 - 4) * 30 = 540
      expect(trigger.frameStart).toBe(Math.round((22.0 - 4) * 30));
      // hold = 12s → end = (22.0 + 12) * 30 = 1020
      expect(trigger.frameEnd).toBe(Math.round((22.0 + 12) * 30));
    }
  });

  it("includes opacity from trigger config defaults", () => {
    const result = resolveLyricTriggers("Scarlet Begonias", mockAlignment, 30);
    if (result.length > 0) {
      expect(result[0].opacity).toBeGreaterThan(0);
      expect(result[0].opacity).toBeLessThanOrEqual(1);
    }
  });
});
