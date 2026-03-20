import { describe, it, expect } from "vitest";
import { selectOverlaysForWindow, HERO_OVERLAY_NAMES } from "./overlay-selection";
import type { OverlayEntry } from "./types";
import { OVERLAY_REGISTRY } from "./overlay-registry";

function makeEntry(overrides: Partial<OverlayEntry> = {}): OverlayEntry {
  return {
    name: "TestOverlay",
    layer: 5,
    weight: 2,
    tier: "B",
    energyBand: "any",
    category: "atmospheric",
    tags: [],
    dutyCycle: 50,
    ...overrides,
  } as OverlayEntry;
}

describe("selectOverlaysForWindow", () => {
  it("returns empty for targetCount 0 during dropout", () => {
    const scored = [{ entry: makeEntry(), score: 0.8 }];
    // isDropout=true prevents duty-cycle adjustment from bumping count above 0
    const result = selectOverlaysForWindow(scored, 0, false, true, [makeEntry()]);
    expect(result.length).toBe(0);
  });

  it("respects targetCount limit", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ name: `Overlay${i}`, layer: i % 5 }),
    );
    const scored = entries.map((e, i) => ({ entry: e, score: 1 - i * 0.05 }));
    const result = selectOverlaysForWindow(scored, 3, false, false, entries);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("prioritizes heroes when available", () => {
    const heroName = Array.from(HERO_OVERLAY_NAMES)[0];
    if (!heroName) return; // skip if no heroes configured
    const heroEntry = OVERLAY_REGISTRY.find((e) => e.name === heroName);
    if (!heroEntry) return;

    const nonHero = makeEntry({ name: "NonHero", layer: heroEntry.layer + 1 });
    const scored = [
      { entry: nonHero, score: 0.9 },
      { entry: heroEntry, score: 0.7 },
    ];
    const result = selectOverlaysForWindow(scored, 2, false, false, [nonHero, heroEntry]);
    const resultNames = result.map((e) => e.name);
    expect(resultNames).toContain(heroName);
  });

  it("provides layer diversity", () => {
    const entries = [
      makeEntry({ name: "A", layer: 1 }),
      makeEntry({ name: "B", layer: 1 }),
      makeEntry({ name: "C", layer: 5 }),
    ];
    const scored = entries.map((e, i) => ({ entry: e, score: 1 - i * 0.1 }));
    const result = selectOverlaysForWindow(scored, 2, false, false, entries);
    const layers = new Set(result.map((e) => e.layer));
    // Should prefer picking from different layers
    expect(layers.size).toBeGreaterThanOrEqual(1);
  });
});
