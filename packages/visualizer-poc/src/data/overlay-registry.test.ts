import { describe, it, expect } from "vitest";
import {
  OVERLAY_REGISTRY,
  SELECTABLE_REGISTRY,
  OVERLAY_BY_NAME,
  ALWAYS_ACTIVE,
} from "./overlay-registry";
import type { OverlayTag, OverlayCategory } from "./types";

// ─── Valid values for validation ───

const VALID_TAGS: Set<string> = new Set([
  "cosmic", "organic", "mechanical", "psychedelic", "festival",
  "contemplative", "dead-culture", "intense", "retro", "aquatic",
]);

const VALID_CATEGORIES: Set<string> = new Set([
  "atmospheric", "sacred", "reactive", "geometric", "nature",
  "character", "artifact", "info", "hud", "distortion",
]);

const VALID_ENERGY_BANDS = new Set(["low", "mid", "high", "any"]);

describe("overlay-registry integrity", () => {
  it("has no duplicate names", () => {
    const names = OVERLAY_REGISTRY.map((e) => e.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("has exactly 40 entries (38 keepers + 2 always-active)", () => {
    expect(OVERLAY_REGISTRY.length).toBe(40);
  });

  it("all entries have required fields", () => {
    for (const entry of OVERLAY_REGISTRY) {
      expect(entry.name).toBeTruthy();
      expect(entry.layer).toBeGreaterThanOrEqual(1);
      expect(entry.layer).toBeLessThanOrEqual(10);
      expect(entry.category).toBeTruthy();
      expect(entry.tags.length).toBeGreaterThanOrEqual(1);
      expect(VALID_ENERGY_BANDS.has(entry.energyBand)).toBe(true);
      expect([1, 2, 3]).toContain(entry.weight);
    }
  });

  it("all tags are valid OverlayTag values", () => {
    for (const entry of OVERLAY_REGISTRY) {
      for (const tag of entry.tags) {
        expect(VALID_TAGS.has(tag)).toBe(true);
      }
    }
  });

  it("all categories are valid OverlayCategory values", () => {
    for (const entry of OVERLAY_REGISTRY) {
      expect(VALID_CATEGORIES.has(entry.category)).toBe(true);
    }
  });

  it("populated layers include 1, 2, 3, 5, 6, 7, 10", () => {
    const layers = new Set(OVERLAY_REGISTRY.map((e) => e.layer));
    for (const l of [1, 2, 3, 5, 6, 7, 10]) {
      expect(layers.has(l)).toBe(true);
    }
  });

  it("dutyCycle is 0-100 when present", () => {
    for (const entry of OVERLAY_REGISTRY) {
      if (entry.dutyCycle !== undefined) {
        expect(entry.dutyCycle).toBeGreaterThan(0);
        expect(entry.dutyCycle).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("SELECTABLE_REGISTRY", () => {
  it("equals OVERLAY_REGISTRY contents", () => {
    expect(SELECTABLE_REGISTRY.length).toBe(OVERLAY_REGISTRY.length);
    for (let i = 0; i < OVERLAY_REGISTRY.length; i++) {
      expect(SELECTABLE_REGISTRY[i].name).toBe(OVERLAY_REGISTRY[i].name);
    }
  });
});

describe("OVERLAY_BY_NAME", () => {
  it("contains every registry entry", () => {
    expect(OVERLAY_BY_NAME.size).toBe(OVERLAY_REGISTRY.length);
    for (const entry of OVERLAY_REGISTRY) {
      expect(OVERLAY_BY_NAME.get(entry.name)).toBe(entry);
    }
  });

  it("returns undefined for unknown names", () => {
    expect(OVERLAY_BY_NAME.get("NonexistentOverlay")).toBeUndefined();
  });
});

describe("ALWAYS_ACTIVE", () => {
  it("contains only overlays with alwaysActive flag", () => {
    const flagged = OVERLAY_REGISTRY.filter((e) => e.alwaysActive).map((e) => e.name);
    expect(ALWAYS_ACTIVE).toEqual(flagged);
  });

  it("has a small count (2-5)", () => {
    expect(ALWAYS_ACTIVE.length).toBeGreaterThanOrEqual(2);
    expect(ALWAYS_ACTIVE.length).toBeLessThanOrEqual(5);
  });

  it("includes SongTitle and FilmGrain", () => {
    expect(ALWAYS_ACTIVE).toContain("SongTitle");
    expect(ALWAYS_ACTIVE).toContain("FilmGrain");
  });
});
