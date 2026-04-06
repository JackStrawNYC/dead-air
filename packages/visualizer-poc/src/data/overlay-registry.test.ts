import { describe, it, expect } from "vitest";
import {
  OVERLAY_REGISTRY,
  SELECTABLE_REGISTRY,
  OVERLAY_BY_NAME,
  ALWAYS_ACTIVE,
} from "./overlay-registry";
import type { OverlayCategory } from "./types";
import { BAND_CONFIG } from "./band-config";

// ─── Valid values for validation ───
// OverlayTag is now `string` for portability. We validate that registry
// tags are from the known set (generic tags + band culture tag).

const VALID_TAGS: Set<string> = new Set([
  "cosmic", "organic", "mechanical", "psychedelic", "festival",
  "contemplative", "intense", "retro", "aquatic",
  BAND_CONFIG.overlayTags.culture,
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

  it("has exactly 373 entries", () => {
    expect(OVERLAY_REGISTRY.length).toBe(373);
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
    for (const l of [1, 2, 3, 4, 5, 6, 7, 9, 10]) {
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

  it("every selectable overlay has an energyResponse curve", () => {
    const selectable = OVERLAY_REGISTRY.filter((e) => !e.alwaysActive);
    for (const entry of selectable) {
      expect(entry.energyResponse, `${entry.name} missing energyResponse`).toBeDefined();
      const [threshold, peak, falloff] = entry.energyResponse!;
      expect(threshold, `${entry.name} threshold > peak`).toBeLessThanOrEqual(peak);
      expect(falloff, `${entry.name} falloff <= 0`).toBeGreaterThan(0);
    }
  });

  it("has essential active overlays (FilmGrain, SongTitle, VHSGlitch)", () => {
    const active = OVERLAY_REGISTRY.filter((e) => e.tier === "A" || e.tier === "B" || e.alwaysActive);
    expect(active.length).toBeGreaterThanOrEqual(3);
  });
});

describe("SELECTABLE_REGISTRY", () => {
  it("contains only A+B tier overlays (excludes C-tier)", () => {
    expect(SELECTABLE_REGISTRY.length).toBe(
      OVERLAY_REGISTRY.filter((e) => e.tier !== "C").length,
    );
    for (const entry of SELECTABLE_REGISTRY) {
      expect(entry.tier).not.toBe("C");
    }
  });

  it("is smaller than OVERLAY_REGISTRY (C-tier archived)", () => {
    expect(SELECTABLE_REGISTRY.length).toBeLessThan(OVERLAY_REGISTRY.length);
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
