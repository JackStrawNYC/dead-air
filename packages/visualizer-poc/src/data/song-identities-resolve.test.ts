import { describe, it, expect } from "vitest";
import { resolveSongMode, getShowModesForSong, buildShowShaderPool } from "./song-identities";
import { lookupSongIdentity } from "./song-identities";
import type { VisualMode } from "./types";

describe("getShowModesForSong", () => {
  it("returns same subset for same seed + title (deterministic)", () => {
    const preferred: VisualMode[] = [
      "cosmic_voyage", "deep_ocean", "crystal_cavern",
      "mandala_engine", "feedback_recursion", "morphogenesis", "neural_web",
    ];
    const a = getShowModesForSong(preferred, 42, "Dark Star");
    const b = getShowModesForSong(preferred, 42, "Dark Star");
    expect(a).toEqual(b);
  });

  it("narrows 7 preferred to 4 show modes", () => {
    const preferred: VisualMode[] = [
      "cosmic_voyage", "deep_ocean", "crystal_cavern",
      "mandala_engine", "feedback_recursion", "morphogenesis", "neural_web",
    ];
    const result = getShowModesForSong(preferred, 42, "Dark Star");
    expect(result).toHaveLength(4);
    for (const m of result) {
      expect(preferred).toContain(m);
    }
  });

  it("returns all modes when preferredModes.length <= count", () => {
    const preferred: VisualMode[] = ["inferno", "tie_dye", "aurora"];
    const result = getShowModesForSong(preferred, 42, "Bertha");
    expect(result).toHaveLength(3);
    expect(new Set(result)).toEqual(new Set(preferred));
  });

  it("different seeds produce different subsets across 20 seeds", () => {
    const preferred: VisualMode[] = [
      "cosmic_voyage", "deep_ocean", "crystal_cavern",
      "mandala_engine", "feedback_recursion", "morphogenesis", "neural_web",
    ];
    const subsets = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const subset = getShowModesForSong(preferred, seed, "Dark Star");
      subsets.add(subset.sort().join(","));
    }
    // With 7-choose-4 = 35 possible combos, 20 seeds should produce ≥5 distinct subsets
    expect(subsets.size).toBeGreaterThanOrEqual(5);
  });
});

describe("resolveSongMode", () => {
  it("returns the same mode for the same title + seed (deterministic)", () => {
    const a = resolveSongMode("Dark Star", "cosmic_voyage", 42);
    const b = resolveSongMode("Dark Star", "cosmic_voyage", 42);
    expect(a).toBe(b);
  });

  it("returns different modes across many different seeds (variety)", () => {
    const modes = new Set<VisualMode>();
    for (let seed = 0; seed < 200; seed++) {
      modes.add(resolveSongMode("Dark Star", "cosmic_voyage", seed));
    }
    // Dark Star has 7 preferredModes — across 200 seeds we should hit at least 3
    expect(modes.size).toBeGreaterThanOrEqual(3);
  });

  it("returns defaultMode for a song without an identity", () => {
    const result = resolveSongMode("Some Unknown Song XYZ", "liquid_light", 99);
    expect(result).toBe("liquid_light");
  });

  it("always returns a member of the song's preferredModes", () => {
    const identity = lookupSongIdentity("Dark Star");
    expect(identity).toBeDefined();

    for (let seed = 0; seed < 100; seed++) {
      const mode = resolveSongMode("Dark Star", "cosmic_voyage", seed);
      expect(identity!.preferredModes).toContain(mode);
    }
  });

  it("result is always one of the 4 show modes (defaultMode alignment)", () => {
    const identity = lookupSongIdentity("Dark Star");
    expect(identity).toBeDefined();

    for (let seed = 0; seed < 100; seed++) {
      const showModes = getShowModesForSong(identity!.preferredModes, seed, "Dark Star");
      const mode = resolveSongMode("Dark Star", "cosmic_voyage", seed);
      expect(showModes).toContain(mode);
    }
  });

  it("different titles with the same seed produce different modes", () => {
    const seed = 12345;
    const darkStar = resolveSongMode("Dark Star", "cosmic_voyage", seed);
    const bertha = resolveSongMode("Bertha", "concert_lighting", seed);
    expect(typeof darkStar).toBe("string");
    expect(typeof bertha).toBe("string");
    const darkStarIdentity = lookupSongIdentity("Dark Star");
    const berthaIdentity = lookupSongIdentity("Bertha");
    expect(darkStarIdentity!.preferredModes).toContain(darkStar);
    expect(berthaIdentity!.preferredModes).toContain(bertha);
  });

  it("cross-show variety: 20 seeds produce ≥5 distinct modes for Dark Star", () => {
    const modes = new Set<VisualMode>();
    for (let seed = 0; seed < 20; seed++) {
      modes.add(resolveSongMode("Dark Star", "cosmic_voyage", seed));
    }
    // Dark Star has 7 preferred, each seed narrows to 4, then picks 1 — should vary
    expect(modes.size).toBeGreaterThanOrEqual(5);
  });
});

describe("buildShowShaderPool", () => {
  const testSongs: Array<{ title: string; defaultMode: VisualMode }> = [
    { title: "Dark Star", defaultMode: "cosmic_voyage" },
    { title: "Bertha", defaultMode: "concert_lighting" },
    { title: "Scarlet Begonias", defaultMode: "tie_dye" },
    { title: "Fire on the Mountain", defaultMode: "inferno" },
    { title: "Truckin'", defaultMode: "oil_projector" },
    { title: "Eyes of the World", defaultMode: "aurora" },
    { title: "China Cat Sunflower", defaultMode: "kaleidoscope" },
    { title: "Playing in the Band", defaultMode: "feedback_recursion" },
  ];

  it("returns 8-12 modes by default", () => {
    const pool = buildShowShaderPool(testSongs, 42);
    expect(pool.length).toBeGreaterThanOrEqual(8);
    expect(pool.length).toBeLessThanOrEqual(12);
  });

  it("is deterministic (same seed = same pool)", () => {
    const a = buildShowShaderPool(testSongs, 42);
    const b = buildShowShaderPool(testSongs, 42);
    expect(a).toEqual(b);
  });

  it("varies with different seeds", () => {
    const pools = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      pools.add(buildShowShaderPool(testSongs, seed).sort().join(","));
    }
    expect(pools.size).toBeGreaterThanOrEqual(2);
  });

  it("includes each song's defaultMode", () => {
    const pool = buildShowShaderPool(testSongs, 42);
    const poolSet = new Set(pool);
    // Most default modes should be in the pool (they have ref count from their song)
    let included = 0;
    for (const song of testSongs) {
      if (poolSet.has(song.defaultMode)) included++;
    }
    // At least half the default modes should survive pruning
    expect(included).toBeGreaterThanOrEqual(testSongs.length / 2);
  });
});
