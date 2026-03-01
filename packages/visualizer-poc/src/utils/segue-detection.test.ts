import { describe, it, expect } from "vitest";
import { detectSegueChains, getSegueContext, blendPalettes } from "./segue-detection";
import type { SetlistEntry } from "../data/types";

function makeSong(overrides: Partial<SetlistEntry> = {}): SetlistEntry {
  return {
    trackId: "t1",
    title: "Test Song",
    audioFile: "test.mp3",
    set: 1,
    trackNumber: 1,
    defaultMode: "liquid_light",
    segueInto: false,
    ...overrides,
  } as SetlistEntry;
}

describe("detectSegueChains", () => {
  it("returns empty for no segues", () => {
    const songs = [
      makeSong({ trackId: "t1", title: "Song A" }),
      makeSong({ trackId: "t2", title: "Song B" }),
    ];
    const chains = detectSegueChains(songs);
    expect(chains).toHaveLength(0);
  });

  it("detects a 2-song segue chain", () => {
    const songs = [
      makeSong({ trackId: "t1", title: "Song A", segueInto: true }),
      makeSong({ trackId: "t2", title: "Song B" }),
    ];
    const chains = detectSegueChains(songs);
    expect(chains).toHaveLength(1);
    expect(chains[0].songIndices).toEqual([0, 1]);
    expect(chains[0].trackIds).toEqual(["t1", "t2"]);
  });

  it("detects a 3-song segue chain", () => {
    const songs = [
      makeSong({ trackId: "t1", title: "Help on the Way", segueInto: true }),
      makeSong({ trackId: "t2", title: "Slipknot!", segueInto: true }),
      makeSong({ trackId: "t3", title: "Franklin's Tower" }),
    ];
    const chains = detectSegueChains(songs);
    expect(chains).toHaveLength(1);
    expect(chains[0].songIndices).toEqual([0, 1, 2]);
    expect(chains[0].sacred).toBe(true);
  });

  it("identifies sacred segues", () => {
    const songs = [
      makeSong({ trackId: "t1", title: "Scarlet Begonias", segueInto: true }),
      makeSong({ trackId: "t2", title: "Fire on the Mountain" }),
    ];
    const chains = detectSegueChains(songs);
    expect(chains[0].sacred).toBe(true);
  });

  it("separates distinct chains", () => {
    const songs = [
      makeSong({ trackId: "t1", title: "Song A", segueInto: true }),
      makeSong({ trackId: "t2", title: "Song B" }),
      makeSong({ trackId: "t3", title: "Song C" }),
      makeSong({ trackId: "t4", title: "Song D", segueInto: true }),
      makeSong({ trackId: "t5", title: "Song E" }),
    ];
    const chains = detectSegueChains(songs);
    expect(chains).toHaveLength(2);
  });
});

describe("getSegueContext", () => {
  it("returns solo for songs not in a chain", () => {
    const chains = detectSegueChains([
      makeSong({ trackId: "t1", title: "Solo Song" }),
    ]);
    const ctx = getSegueContext(0, chains);
    expect(ctx.inChain).toBe(false);
    expect(ctx.position).toBe("solo");
  });

  it("returns start for first song in chain", () => {
    const songs = [
      makeSong({ trackId: "t1", title: "A", segueInto: true }),
      makeSong({ trackId: "t2", title: "B" }),
    ];
    const chains = detectSegueChains(songs);
    const ctx = getSegueContext(0, chains);
    expect(ctx.position).toBe("start");
  });

  it("returns end for last song in chain", () => {
    const songs = [
      makeSong({ trackId: "t1", title: "A", segueInto: true }),
      makeSong({ trackId: "t2", title: "B" }),
    ];
    const chains = detectSegueChains(songs);
    const ctx = getSegueContext(1, chains);
    expect(ctx.position).toBe("end");
  });

  it("returns middle for inner songs", () => {
    const songs = [
      makeSong({ trackId: "t1", title: "A", segueInto: true }),
      makeSong({ trackId: "t2", title: "B", segueInto: true }),
      makeSong({ trackId: "t3", title: "C" }),
    ];
    const chains = detectSegueChains(songs);
    const ctx = getSegueContext(1, chains);
    expect(ctx.position).toBe("middle");
  });
});

describe("blendPalettes", () => {
  it("returns fromPalette at progress 0", () => {
    const result = blendPalettes(
      { primary: 30, secondary: 200 },
      { primary: 120, secondary: 300 },
      0,
    );
    expect(result.primary).toBeCloseTo(30, 0);
    expect(result.secondary).toBeCloseTo(200, 0);
  });

  it("returns toPalette at progress 1", () => {
    const result = blendPalettes(
      { primary: 30, secondary: 200 },
      { primary: 120, secondary: 300 },
      1,
    );
    expect(result.primary).toBeCloseTo(120, 0);
    expect(result.secondary).toBeCloseTo(300, 0);
  });

  it("takes shortest arc around hue wheel", () => {
    // 350 → 10 should go through 0, not through 180
    const result = blendPalettes(
      { primary: 350, secondary: 0 },
      { primary: 10, secondary: 0 },
      0.5,
    );
    expect(result.primary).toBeCloseTo(0, 0); // Midpoint of 350→10 via 0
  });
});
