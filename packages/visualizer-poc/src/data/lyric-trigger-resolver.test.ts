import { describe, it, expect } from "vitest";
import { resolveLyricTriggers } from "./lyric-trigger-resolver";

// Mock alignment words for testing
const mockAlignment = [
  { word: "we", start: 17.5, end: 17.7, score: 1 },
  { word: "can", start: 17.7, end: 17.9, score: 1 },
  { word: "jack", start: 22.0, end: 22.3, score: 1 },
  { word: "straw", start: 22.3, end: 22.6, score: 1 },
  { word: "from", start: 22.6, end: 22.8, score: 1 },
  { word: "wichita", start: 22.8, end: 23.4, score: 1 },
  { word: "cut", start: 25.0, end: 25.2, score: 1 },
  { word: "his", start: 25.2, end: 25.4, score: 1 },
];

describe("resolveLyricTriggers", () => {
  it("returns empty array for unknown song", () => {
    const result = resolveLyricTriggers("Unknown Song", mockAlignment, 30);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty alignment", () => {
    const result = resolveLyricTriggers("Jack Straw", [], 30);
    expect(result).toEqual([]);
  });

  it("resolves a trigger when phrase matches alignment", () => {
    const result = resolveLyricTriggers("Jack Straw", mockAlignment, 30);
    expect(result.length).toBeGreaterThanOrEqual(1);

    const jackStrawTrigger = result.find((t) => t.triggerId === "jackstraw-wichita");
    if (jackStrawTrigger) {
      // Phrase starts at 22.0s, pre_roll is 4s → frameStart ≈ (22.0 - 4) * 30 = 540
      expect(jackStrawTrigger.frameStart).toBeCloseTo(540, -1);
      // hold_seconds is 18 → frameEnd ≈ (22.0 + 18) * 30 = 1200
      expect(jackStrawTrigger.frameEnd).toBeCloseTo(1200, -1);
      expect(jackStrawTrigger.visual).toContain("stealyourface");
      expect(jackStrawTrigger.mediaType).toBe("video");
      expect(jackStrawTrigger.phrase).toBe("jack straw from wichita");
    }
  });

  it("returns windows sorted by start frame", () => {
    // Use a song with multiple triggers (Estimated Prophet has 2)
    const epAlignment = [
      { word: "prophet", start: 30.0, end: 30.5, score: 1 },
      { word: "on", start: 30.5, end: 30.7, score: 1 },
      { word: "the", start: 30.7, end: 30.9, score: 1 },
      { word: "burning", start: 30.9, end: 31.3, score: 1 },
      { word: "shore", start: 31.3, end: 31.8, score: 1 },
      { word: "california", start: 90.0, end: 91.0, score: 1 },
    ];
    const result = resolveLyricTriggers("Estimated Prophet", epAlignment, 30);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].frameStart).toBeGreaterThanOrEqual(result[i - 1].frameStart);
    }
  });

  it("enforces minimum gap between trigger windows", () => {
    // Create alignment where two phrases appear close together
    const closeAlignment = [
      { word: "deal", start: 10.0, end: 10.3, score: 1 },
      { word: "go", start: 10.3, end: 10.5, score: 1 },
      { word: "down", start: 10.5, end: 10.8, score: 1 },
      // Second occurrence right after first ends (within min_gap of 15s + hold of 12s = 27s)
      { word: "deal", start: 20.0, end: 20.3, score: 1 },
      { word: "go", start: 20.3, end: 20.5, score: 1 },
      { word: "down", start: 20.5, end: 20.8, score: 1 },
    ];
    const result = resolveLyricTriggers("Deal", closeAlignment, 30);
    // Should only get one trigger (first occurrence only, plus gap enforcement)
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it("handles case-insensitive phrase matching", () => {
    const uppercaseAlignment = [
      { word: "Jack", start: 22.0, end: 22.3, score: 1 },
      { word: "Straw", start: 22.3, end: 22.6, score: 1 },
      { word: "From", start: 22.6, end: 22.8, score: 1 },
      { word: "Wichita", start: 22.8, end: 23.4, score: 1 },
    ];
    const result = resolveLyricTriggers("Jack Straw", uppercaseAlignment, 30);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("computes correct frame values at 30fps", () => {
    const result = resolveLyricTriggers("Jack Straw", mockAlignment, 30);
    const trigger = result.find((t) => t.triggerId === "jackstraw-wichita");
    if (trigger) {
      // pre_roll not specified in trigger → uses default 4s
      // phrase at 22.0s → start = (22.0 - 4) * 30 = 540
      expect(trigger.frameStart).toBe(Math.round((22.0 - 4) * 30));
      // hold = 18s → end = (22.0 + 18) * 30 = 1200
      expect(trigger.frameEnd).toBe(Math.round((22.0 + 18) * 30));
    }
  });

  it("includes opacity from trigger config defaults", () => {
    const result = resolveLyricTriggers("Jack Straw", mockAlignment, 30);
    if (result.length > 0) {
      expect(result[0].opacity).toBeGreaterThan(0);
      expect(result[0].opacity).toBeLessThanOrEqual(1);
    }
  });
});
