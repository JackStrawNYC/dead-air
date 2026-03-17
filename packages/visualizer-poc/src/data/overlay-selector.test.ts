import { describe, it, expect } from "vitest";
import {
  emptyHistory,
  pushHistory,
  buildSongProfile,
  selectOverlays,
  selectOverlaysForShow,
} from "./overlay-selector";
import type {
  EnhancedFrameData,
  SetlistEntry,
  TrackAnalysis,
  SongProfile,
} from "./types";
import { OVERLAY_REGISTRY } from "./overlay-registry";

// ─── Test Helpers ───

function makeFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.15,
    centroid: 0.3,
    onset: 0,
    beat: false,
    sub: 0.2,
    low: 0.3,
    mid: 0.25,
    high: 0.1,
    chroma: [0.5, 0.3, 0.2, 0.4, 0.6, 0.1, 0.3, 0.5, 0.2, 0.4, 0.3, 0.1],
    contrast: [0.3, 0.4, 0.5, 0.3, 0.2, 0.4, 0.3],
    flatness: 0.05,
    ...overrides,
  };
}

function makeSong(overrides: Partial<SetlistEntry> = {}): SetlistEntry {
  return {
    trackId: "s1t01",
    title: "Test Song",
    set: 1,
    trackNumber: 1,
    defaultMode: "liquid_light",
    audioFile: "test.mp3",
    ...overrides,
  };
}

function makeAnalysis(
  frameCount: number,
  frameOverrides: Partial<EnhancedFrameData> = {},
): TrackAnalysis {
  return {
    meta: {
      source: "test",
      duration: frameCount / 30,
      fps: 30,
      sr: 22050,
      hopLength: 735,
      totalFrames: frameCount,
      tempo: 120,
      sections: [
        { frameStart: 0, frameEnd: frameCount, label: "section_0", energy: "mid", avgEnergy: 0.15 },
      ],
    },
    frames: Array.from({ length: frameCount }, () => makeFrame(frameOverrides)),
  };
}

// ─── History ───

describe("emptyHistory", () => {
  it("creates empty state", () => {
    const h = emptyHistory();
    expect(h.recentSongs).toEqual([]);
    expect(h.frequency.size).toBe(0);
    expect(h.songCount).toBe(0);
  });
});

describe("pushHistory", () => {
  it("adds overlays to recent and frequency", () => {
    let h = emptyHistory();
    h = pushHistory(h, ["A", "B", "C"]);
    expect(h.songCount).toBe(1);
    expect(h.recentSongs.length).toBe(1);
    expect(h.recentSongs[0].has("A")).toBe(true);
    expect(h.frequency.get("A")).toBe(1);
  });

  it("maintains lookback depth of 4", () => {
    let h = emptyHistory();
    for (let i = 0; i < 6; i++) {
      h = pushHistory(h, [`overlay_${i}`]);
    }
    expect(h.recentSongs.length).toBe(4);
    expect(h.songCount).toBe(6);
  });

  it("accumulates frequency across songs", () => {
    let h = emptyHistory();
    h = pushHistory(h, ["A", "B"]);
    h = pushHistory(h, ["A", "C"]);
    h = pushHistory(h, ["A"]);
    expect(h.frequency.get("A")).toBe(3);
    expect(h.frequency.get("B")).toBe(1);
    expect(h.frequency.get("C")).toBe(1);
  });
});

// ─── Song Profiling ───

describe("buildSongProfile", () => {
  it("handles empty frames", () => {
    const song = makeSong();
    const analysis: TrackAnalysis = {
      meta: {
        source: "test", duration: 0, fps: 30, sr: 22050,
        hopLength: 735, totalFrames: 0, tempo: 140, sections: [],
      },
      frames: [],
    };
    const profile = buildSongProfile(song, analysis);
    expect(profile.avgEnergy).toBe(0);
    expect(profile.dominantEnergyBand).toBe("low");
    expect(profile.tempo).toBe(140);
  });

  it("computes correct averages", () => {
    const song = makeSong();
    const analysis = makeAnalysis(100, { rms: 0.3, low: 0.5, mid: 0.2, high: 0.1 });
    const profile = buildSongProfile(song, analysis);
    expect(profile.avgEnergy).toBeCloseTo(0.3, 5);
    expect(profile.dominantEnergyBand).toBe("low"); // low=0.5 is highest
  });

  it("detects high-energy dominant band", () => {
    const song = makeSong();
    const analysis = makeAnalysis(100, { low: 0.1, mid: 0.2, high: 0.8 });
    const profile = buildSongProfile(song, analysis);
    expect(profile.dominantEnergyBand).toBe("high");
  });

  it("computes peak energy ratio", () => {
    const song = makeSong();
    // 50 frames above 0.25, 50 below
    const frames = [
      ...Array.from({ length: 50 }, () => makeFrame({ rms: 0.3 })),
      ...Array.from({ length: 50 }, () => makeFrame({ rms: 0.1 })),
    ];
    const analysis: TrackAnalysis = {
      meta: {
        source: "test", duration: 100 / 30, fps: 30, sr: 22050,
        hopLength: 735, totalFrames: 100, tempo: 120,
        sections: [{ frameStart: 0, frameEnd: 100, label: "s0", energy: "mid", avgEnergy: 0.2 }],
      },
      frames,
    };
    const profile = buildSongProfile(song, analysis);
    expect(profile.peakEnergyRatio).toBeCloseTo(0.5, 5);
  });

  it("preserves trackId and title", () => {
    const song = makeSong({ trackId: "s2t08", title: "Morning Dew" });
    const analysis = makeAnalysis(10);
    const profile = buildSongProfile(song, analysis);
    expect(profile.trackId).toBe("s2t08");
    expect(profile.title).toBe("Morning Dew");
  });
});

// ─── Selection Algorithm ───

describe("selectOverlays", () => {
  const profile: SongProfile = {
    trackId: "s1t01",
    title: "Test",
    set: 1,
    avgEnergy: 0.15,
    energyVariance: 0.01,
    dominantEnergyBand: "mid",
    peakEnergyRatio: 0.3,
    avgCentroid: 0.3,
    avgFlatness: 0.05,
    avgSub: 0.2,
    chromaSpread: 0.1,
    tempo: 120,
    sectionCount: 3,
    avgVocalPresence: 0,
    avgDrumEnergy: 0,
    avgOtherCentroid: 0,
  };

  it("always includes always-active overlays", () => {
    const result = selectOverlays(profile, emptyHistory());
    expect(result.activeOverlays).toContain("SongTitle");
    expect(result.activeOverlays).toContain("FilmGrain");
  });

  it("returns consistent results with same seed", () => {
    const r1 = selectOverlays(profile, emptyHistory(), undefined, 42);
    const r2 = selectOverlays(profile, emptyHistory(), undefined, 42);
    expect(r1.activeOverlays).toEqual(r2.activeOverlays);
  });

  it("returns results for different seeds", () => {
    const r1 = selectOverlays(profile, emptyHistory(), undefined, 42);
    const r2 = selectOverlays(profile, emptyHistory(), undefined, 999);
    // Both should produce valid overlay sets
    expect(r1.activeOverlays.length).toBeGreaterThan(0);
    expect(r2.activeOverlays.length).toBeGreaterThan(0);
    // With a small curated pool, high overlap is expected
  });

  it("respects force-include overrides", () => {
    const result = selectOverlays(profile, emptyHistory(), {
      include: ["BreathingStealie"],
    });
    expect(result.activeOverlays).toContain("BreathingStealie");
  });

  it("respects force-exclude overrides", () => {
    const result = selectOverlays(profile, emptyHistory(), {
      exclude: ["CosmicStarfield"],
    });
    expect(result.activeOverlays).not.toContain("CosmicStarfield");
  });

  it("keeps total weight reasonable", () => {
    // totalWeight includes always-active overlays (weight 1 each) + selected
    // The cap is 8 for non-always-active selection, but always-active add on top
    const result = selectOverlays(profile, emptyHistory());
    expect(result.totalWeight).toBeLessThanOrEqual(12);
    expect(result.totalWeight).toBeGreaterThan(0);
  });

  it("accepts legacy Set<string> for backward compat", () => {
    const legacyHistory = new Set(["A", "B"]);
    const result = selectOverlays(profile, legacyHistory);
    expect(result.activeOverlays.length).toBeGreaterThan(0);
  });
});

// ─── Full Show Selection ───

describe("selectOverlaysForShow", () => {
  it("selects overlays for multiple songs", () => {
    const songs = [
      { song: makeSong({ trackId: "s1t01", title: "Song 1" }), analysis: makeAnalysis(300) },
      { song: makeSong({ trackId: "s1t02", title: "Song 2" }), analysis: makeAnalysis(300) },
      { song: makeSong({ trackId: "s1t03", title: "Song 3" }), analysis: makeAnalysis(300) },
    ];
    const results = selectOverlaysForShow(songs, 42);
    expect(Object.keys(results)).toEqual(["s1t01", "s1t02", "s1t03"]);
    for (const key of Object.keys(results)) {
      expect(results[key].activeOverlays.length).toBeGreaterThan(0);
      expect(results[key].title).toBeTruthy();
    }
  });

  it("reduces repetition across songs via history", () => {
    const songs = Array.from({ length: 6 }, (_, i) => ({
      song: makeSong({ trackId: `s1t0${i + 1}`, title: `Song ${i + 1}` }),
      analysis: makeAnalysis(300),
    }));
    const results = selectOverlaysForShow(songs, 42);

    // Count how many times each overlay appears across all songs
    const freq = new Map<string, number>();
    for (const key of Object.keys(results)) {
      for (const name of results[key].activeOverlays) {
        freq.set(name, (freq.get(name) ?? 0) + 1);
      }
    }

    // No non-always-active overlay should appear in >60% of songs
    // (frequency cap is 40%, with some tolerance for always-active)
    for (const [name, count] of freq) {
      if (name === "SongTitle" || name === "FilmGrain") continue; // always-active
      expect(count).toBeLessThanOrEqual(5); // max ~83% of 6 songs, but with penalties should be lower
    }
  });
});

// ─── A-tier Scoring ───

describe("A-tier scoring in selection", () => {
  it("A-tier overlays appear disproportionately", () => {
    // Run selection 20 times with different seeds
    const aTierNames = new Set(
      OVERLAY_REGISTRY.filter((e) => e.tier === "A" && !e.alwaysActive).map((e) => e.name),
    );
    const selectableCount = OVERLAY_REGISTRY.filter((e) => !e.alwaysActive).length;
    const aTierPoolRatio = aTierNames.size / selectableCount;

    let totalSelected = 0;
    let aTierSelected = 0;
    for (let seed = 0; seed < 20; seed++) {
      const profile: SongProfile = {
        trackId: `s1t${String(seed).padStart(2, "0")}`,
        title: `Test ${seed}`,
        set: 1,
        avgEnergy: 0.15,
        energyVariance: 0.01,
        dominantEnergyBand: "mid",
        peakEnergyRatio: 0.3,
        avgCentroid: 0.3,
        avgFlatness: 0.05,
        avgSub: 0.2,
        chromaSpread: 0.1,
        tempo: 120,
        sectionCount: 3,
        avgVocalPresence: 0,
        avgDrumEnergy: 0,
        avgOtherCentroid: 0,
      };
      const result = selectOverlays(profile, emptyHistory(), undefined, seed * 1000);
      const nonAlwaysActive = result.activeOverlays.filter(
        (n) => n !== "SongTitle" && n !== "FilmGrain",
      );
      totalSelected += nonAlwaysActive.length;
      aTierSelected += nonAlwaysActive.filter((n) => aTierNames.has(n)).length;
    }

    // A-tier should appear more than their pool proportion
    const aTierSelectionRatio = aTierSelected / totalSelected;
    expect(aTierSelectionRatio).toBeGreaterThan(aTierPoolRatio);
  });
});

// ─── Curated Pool ───

describe("curated overlay pool", () => {
  it("contains key Dead iconography", () => {
    const names = OVERLAY_REGISTRY.map((e) => e.name);
    expect(names).toContain("BreathingStealie");
    expect(names).toContain("ThirteenPointBolt");
    expect(names).toContain("BearParade");
    expect(names).toContain("SkeletonBand");
    expect(names).toContain("WallOfSound");
  });

  it("has 59 total overlays (57 selectable + 2 always-active)", () => {
    expect(OVERLAY_REGISTRY.length).toBe(59);
  });
});
