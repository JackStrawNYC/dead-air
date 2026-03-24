import { describe, it, expect } from "vitest";
import {
  computeContinuousOverlays,
  scoreOverlayLive,
  computeTargetCount,
  type ContinuousOverlayConfig,
} from "./continuous-overlay";
import type { OverlayEntry, EnhancedFrameData } from "../data/types";
import type { AudioSnapshot } from "./audio-reactive";
import { computeAudioSnapshot, buildBeatArray } from "./audio-reactive";

// ─── Test Helpers ───

function makeEntry(overrides: Partial<OverlayEntry> = {}): OverlayEntry {
  return {
    name: "TestOverlay",
    layer: 5,
    weight: 2,
    tier: "B",
    energyBand: "any",
    category: "atmospheric",
    tags: [],
    dutyCycle: 100,
    ...overrides,
  } as OverlayEntry;
}

/** Generate N frames of test audio data at specified energy */
function makeFrames(count: number, energy = 0.15): EnhancedFrameData[] {
  return Array.from({ length: count }, () => ({
    rms: energy,
    centroid: 0.3,
    onset: 0.1,
    beat: false,
    sub: energy * 0.5,
    low: energy * 0.8,
    mid: energy * 0.6,
    high: energy * 0.3,
    chroma: [0.5, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5, 0.1, 0.1, 0.1, 0.1, 0.1] as [number, number, number, number, number, number, number, number, number, number, number, number],
    contrast: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3] as [number, number, number, number, number, number, number],
    flatness: 0.2,
  }));
}

/** Generate frames with varying energy (ramp from low to high) */
function makeRampFrames(count: number, startEnergy: number, endEnergy: number): EnhancedFrameData[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / Math.max(1, count - 1);
    const energy = startEnergy + t * (endEnergy - startEnergy);
    return {
      rms: energy,
      centroid: 0.3,
      onset: 0.1,
      beat: false,
      sub: energy * 0.5,
      low: energy * 0.8,
      mid: energy * 0.6,
      high: energy * 0.3,
      chroma: [0.5, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5, 0.1, 0.1, 0.1, 0.1, 0.1] as [number, number, number, number, number, number, number, number, number, number, number, number],
      contrast: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3] as [number, number, number, number, number, number, number],
      flatness: 0.2,
    };
  });
}

function makePool(count: number): OverlayEntry[] {
  const categories: OverlayEntry["category"][] = ["atmospheric", "sacred", "reactive", "geometric", "nature", "character"];
  return Array.from({ length: count }, (_, i) => makeEntry({
    name: `Overlay_${i}`,
    layer: (i % 10) + 1,
    category: categories[i % categories.length],
    tags: ["cosmic"],
    tier: i < 10 ? "A" : "B",
    energyBand: i % 3 === 0 ? "low" : i % 3 === 1 ? "mid" : "high",
    weight: ((i % 3) + 1) as 1 | 2 | 3,
  }));
}

function makeConfig(overrides: Partial<ContinuousOverlayConfig> = {}): ContinuousOverlayConfig {
  return {
    pool: makePool(20),
    alwaysActive: ["SongTitle", "FilmGrain"],
    trackId: "s1t01",
    showSeed: 12345,
    isDrumsSpace: false,
    setNumber: 1,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<AudioSnapshot> = {}): AudioSnapshot {
  return {
    energy: 0.15,
    slowEnergy: 0.12,
    bass: 0.1,
    mids: 0.15,
    highs: 0.08,
    onsetEnvelope: 0.1,
    beatDecay: 0.3,
    chromaHue: 120,
    centroid: 0.3,
    flatness: 0.2,
    spectralFlux: 0.1,
    fastEnergy: 0.15,
    drumOnset: 0.1,
    drumBeat: 0.2,
    musicalTime: 0,
    vocalEnergy: 0.1,
    vocalPresence: 0.3,
    otherEnergy: 0.15,
    otherCentroid: 0.3,
    energyAcceleration: 0,
    energyTrend: 0,
    localTempo: 120,
    beatConfidence: 0.5,
    downbeat: false,
    energyForecast: 0.15,
    peakApproaching: 0,
    beatStability: 0.5,
    melodicPitch: 0.5,
    melodicConfidence: 0.5,
    melodicDirection: 0,
    chordIndex: 0,
    harmonicTension: 0.3,
    chordConfidence: 0.5,
    sectionType: "verse",
    tempoDerivative: 0,
    dynamicRange: 0.5,
    spaceScore: 0,
    timbralBrightness: 0.5,
    timbralFlux: 0.2,
    vocalPitch: 0.5,
    vocalPitchConfidence: 0.5,
    semanticPsychedelic: 0.2,
    semanticAggressive: 0.1,
    semanticTender: 0.2,
    semanticCosmic: 0.3,
    semanticRhythmic: 0.2,
    semanticAmbient: 0.2,
    semanticChaotic: 0.1,
    semanticTriumphant: 0.1,
    ...overrides,
  };
}

const fixedRng = () => 0.05;

// ─── Tests ───

describe("computeContinuousOverlays", () => {
  describe("determinism", () => {
    it("produces identical results for same inputs", () => {
      const config = makeConfig();
      const frames = makeFrames(600);
      const snapshot = makeSnapshot();

      const result1 = computeContinuousOverlays(config, frames, 400, snapshot);
      const result2 = computeContinuousOverlays(config, frames, 400, snapshot);

      expect(result1.opacities).toEqual(result2.opacities);
      expect(result1.alwaysActive).toEqual(result2.alwaysActive);
    });

    it("has no hidden mutable state between calls", () => {
      const config = makeConfig();
      const frames = makeFrames(600);
      const snapshot = makeSnapshot();

      // Call at frame 400 twice with a different call in between
      const result1 = computeContinuousOverlays(config, frames, 400, snapshot);
      computeContinuousOverlays(config, frames, 500, makeSnapshot({ energy: 0.35 }));
      const result2 = computeContinuousOverlays(config, frames, 400, snapshot);

      expect(result1.opacities).toEqual(result2.opacities);
    });
  });

  describe("always-active overlays", () => {
    it("always-active overlays have opacity 1", () => {
      const config = makeConfig();
      const frames = makeFrames(600);
      const snapshot = makeSnapshot();

      const result = computeContinuousOverlays(config, frames, 400, snapshot);

      expect(result.opacities["SongTitle"]).toBe(1);
      expect(result.opacities["FilmGrain"]).toBe(1);
    });

    it("returns alwaysActive list matching config", () => {
      const config = makeConfig({ alwaysActive: ["SongTitle", "FilmGrain"] });
      const frames = makeFrames(600);
      const snapshot = makeSnapshot();

      const result = computeContinuousOverlays(config, frames, 400, snapshot);
      expect(result.alwaysActive).toEqual(["SongTitle", "FilmGrain"]);
    });
  });

  describe("intro breathing room", () => {
    it("returns only always-active during intro breathing frames", () => {
      const config = makeConfig();
      const frames = makeFrames(600);
      const snapshot = makeSnapshot();

      const result = computeContinuousOverlays(config, frames, 100, snapshot);

      // Only always-active should be present
      const nonAlwaysActive = Object.keys(result.opacities).filter(
        (name) => !config.alwaysActive.includes(name),
      );
      expect(nonAlwaysActive).toHaveLength(0);
    });

    it("shows pool overlays after intro breathing at high energy", () => {
      const config = makeConfig();
      const frames = makeFrames(900, 0.30);
      const snapshot = makeSnapshot({ energy: 0.30 });

      const result = computeContinuousOverlays(config, frames, 700, snapshot);

      const poolOverlays = Object.keys(result.opacities).filter(
        (name) => !config.alwaysActive.includes(name),
      );
      expect(poolOverlays.length).toBeGreaterThan(0);
    });
  });

  describe("stability (inertia)", () => {
    it("consecutive frames with similar audio produce similar selections", () => {
      const config = makeConfig();
      const frames = makeFrames(600);
      const snapshot1 = makeSnapshot({ energy: 0.15 });
      const snapshot2 = makeSnapshot({ energy: 0.155 }); // very slight change

      const result1 = computeContinuousOverlays(config, frames, 400, snapshot1);
      const result2 = computeContinuousOverlays(config, frames, 401, snapshot2);

      // Get overlay names (excluding always-active)
      const names1 = Object.keys(result1.opacities).filter((n) => !config.alwaysActive.includes(n));
      const names2 = Object.keys(result2.opacities).filter((n) => !config.alwaysActive.includes(n));

      // At least half should overlap
      const overlap = names1.filter((n) => names2.includes(n));
      expect(overlap.length).toBeGreaterThanOrEqual(Math.min(names1.length, names2.length) / 2);
    });
  });

  describe("coherence lock", () => {
    it("maintains selection when coherence is locked", () => {
      const config = makeConfig();
      const frames = makeFrames(600);
      const lockedSnapshot1 = makeSnapshot({ energy: 0.15, isLocked: true });
      const lockedSnapshot2 = makeSnapshot({ energy: 0.20, isLocked: true }); // energy changed but locked

      const result1 = computeContinuousOverlays(config, frames, 400, lockedSnapshot1);
      const result2 = computeContinuousOverlays(config, frames, 401, lockedSnapshot2);

      const names1 = new Set(Object.keys(result1.opacities).filter((n) => !config.alwaysActive.includes(n)));
      const names2 = new Set(Object.keys(result2.opacities).filter((n) => !config.alwaysActive.includes(n)));

      // With higher inertia during lock, selections should be very similar
      const overlap = [...names1].filter((n) => names2.has(n));
      if (names1.size > 0 && names2.size > 0) {
        expect(overlap.length / Math.max(names1.size, names2.size)).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  describe("responsiveness", () => {
    it("selects fewer overlays during quiet sections", () => {
      const config = makeConfig();
      const quietFrames = makeFrames(600, 0.02);
      const loudFrames = makeFrames(600, 0.30);

      const quietSnapshot = makeSnapshot({ energy: 0.02 });
      const loudSnapshot = makeSnapshot({ energy: 0.30 });

      const quietResult = computeContinuousOverlays(config, quietFrames, 400, quietSnapshot);
      const loudResult = computeContinuousOverlays(config, loudFrames, 400, loudSnapshot);

      const quietCount = Object.keys(quietResult.opacities).filter((n) => !config.alwaysActive.includes(n)).length;
      const loudCount = Object.keys(loudResult.opacities).filter((n) => !config.alwaysActive.includes(n)).length;

      expect(loudCount).toBeGreaterThanOrEqual(quietCount);
    });
  });

  describe("hero guarantee", () => {
    it("song hero is always in selection when targetCount > 0", () => {
      const pool = makePool(20);
      pool[5] = makeEntry({ name: "HeroOverlay", layer: 6, category: "character", tags: ["dead-culture"] });
      const config = makeConfig({ pool, songHero: "HeroOverlay" });
      const frames = makeFrames(900, 0.30);
      const snapshot = makeSnapshot({ energy: 0.30 });

      const result = computeContinuousOverlays(config, frames, 700, snapshot);

      expect(result.opacities["HeroOverlay"]).toBeDefined();
      expect(result.opacities["HeroOverlay"]).toBeGreaterThan(0);
    });
  });

  describe("empty pool", () => {
    it("returns only always-active when pool is empty", () => {
      const config = makeConfig({ pool: [] });
      const frames = makeFrames(600);
      const snapshot = makeSnapshot();

      const result = computeContinuousOverlays(config, frames, 400, snapshot);

      expect(result.opacities["SongTitle"]).toBe(1);
      expect(result.opacities["FilmGrain"]).toBe(1);
      const poolOverlays = Object.keys(result.opacities).filter((n) => !config.alwaysActive.includes(n));
      expect(poolOverlays).toHaveLength(0);
    });
  });

  describe("transitions (score-to-opacity smoothstep)", () => {
    it("overlay opacities are between 0 and 1", () => {
      const config = makeConfig();
      const frames = makeFrames(600);
      const snapshot = makeSnapshot();

      const result = computeContinuousOverlays(config, frames, 400, snapshot);

      for (const [, opacity] of Object.entries(result.opacities)) {
        expect(opacity).toBeGreaterThanOrEqual(0);
        expect(opacity).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("reactive injection", () => {
    it("injects reactive overlays when trigger is active", () => {
      const config = makeConfig();
      const frames = makeFrames(900);
      const snapshot = makeSnapshot();
      const reactiveState = {
        isTriggered: true,
        triggerType: "spectral_eruption" as const,
        triggerStrength: 0.8,
        triggerAge: 15, // in hold phase
        suggestedModes: [],
        overlayInjections: ["ReactiveOverlay"],
        cooldownRemaining: 0,
      };

      const result = computeContinuousOverlays(config, frames, 700, snapshot, reactiveState);

      expect(result.opacities["ReactiveOverlay"]).toBeDefined();
      expect(result.opacities["ReactiveOverlay"]).toBeGreaterThan(0);
    });

    it("does not inject when trigger is inactive", () => {
      const config = makeConfig();
      const frames = makeFrames(600);
      const snapshot = makeSnapshot();
      const reactiveState = {
        isTriggered: false,
        triggerType: null,
        triggerStrength: 0,
        triggerAge: 0,
        suggestedModes: [],
        overlayInjections: [],
        cooldownRemaining: 200,
      };

      const result = computeContinuousOverlays(config, frames, 400, snapshot, reactiveState);

      expect(result.opacities["ReactiveOverlay"]).toBeUndefined();
    });
  });
});

describe("scoreOverlayLive", () => {
  it("gives A-tier a scoring bonus", () => {
    const config = makeConfig();
    const snapshot = makeSnapshot();

    const aTier = scoreOverlayLive(makeEntry({ tier: "A" }), snapshot, config, fixedRng);
    const bTier = scoreOverlayLive(makeEntry({ tier: "B" }), snapshot, config, fixedRng);

    expect(aTier).toBeGreaterThan(bTier);
  });

  it("boosts overlays with matching audioAffinity", () => {
    const config = makeConfig();
    const highEnergySnapshot = makeSnapshot({ energy: 0.8, spectralFlux: 0.9 });

    const withAffinity = scoreOverlayLive(
      makeEntry({ audioAffinity: { energy: 0.8, spectralFlux: 0.6 } }),
      highEnergySnapshot,
      config,
      fixedRng,
    );
    const without = scoreOverlayLive(
      makeEntry(),
      highEnergySnapshot,
      config,
      fixedRng,
    );

    expect(withAffinity).toBeGreaterThan(without);
  });

  it("suppresses overlays with negative audioAffinity", () => {
    const config = makeConfig();
    const highEnergySnapshot = makeSnapshot({ energy: 0.8 });

    const suppressed = scoreOverlayLive(
      makeEntry({ audioAffinity: { energy: -0.8 } }),
      highEnergySnapshot,
      config,
      fixedRng,
    );
    const neutral = scoreOverlayLive(
      makeEntry(),
      highEnergySnapshot,
      config,
      fixedRng,
    );

    expect(suppressed).toBeLessThan(neutral);
  });

  it("clamps audioAffinity contribution to +-0.3", () => {
    const config = makeConfig();
    const extremeSnapshot = makeSnapshot({ energy: 1.0, spectralFlux: 1.0, bass: 1.0 });

    const extreme = scoreOverlayLive(
      makeEntry({ audioAffinity: { energy: 1.0, spectralFlux: 1.0, bass: 1.0 } }),
      extremeSnapshot,
      config,
      fixedRng,
    );
    const baseline = scoreOverlayLive(
      makeEntry(),
      extremeSnapshot,
      config,
      fixedRng,
    );

    // Affinity contribution capped at 0.3
    expect(extreme - baseline).toBeLessThanOrEqual(0.31); // small tolerance for float
  });
});

describe("computeTargetCount", () => {
  it("returns fewer overlays at low energy", () => {
    const config = makeConfig();
    const lowSnapshot = makeSnapshot({ energy: 0.03 });
    const highSnapshot = makeSnapshot({ energy: 0.35 });

    const lowCount = computeTargetCount(lowSnapshot, config);
    const highCount = computeTargetCount(highSnapshot, config);

    expect(highCount).toBeGreaterThanOrEqual(lowCount);
  });

  it("caps at pool size", () => {
    const config = makeConfig({ pool: makePool(2) });
    const snapshot = makeSnapshot({ energy: 0.40 });

    const count = computeTargetCount(snapshot, config);
    expect(count).toBeLessThanOrEqual(2);
  });

  it("applies song identity density multiplier", () => {
    const config = makeConfig({
      songIdentity: {
        preferredModes: [],
        palette: { primary: 0, secondary: 0 },
        overlayDensity: 2.0,
      },
    });
    const snapshot = makeSnapshot({ energy: 0.15 });

    const withDensity = computeTargetCount(snapshot, config);
    const without = computeTargetCount(snapshot, makeConfig());

    expect(withDensity).toBeGreaterThanOrEqual(without);
  });

  it("caps during drums/space", () => {
    const config = makeConfig({ isDrumsSpace: true });
    const snapshot = makeSnapshot({ energy: 0.35 });

    const count = computeTargetCount(snapshot, config);
    expect(count).toBeLessThanOrEqual(1);
  });
});

describe("performance", () => {
  it("processes 63 overlays in under 5ms", () => {
    const pool = makePool(63);
    const config = makeConfig({ pool });
    const frames = makeFrames(600, 0.15);
    const snapshot = makeSnapshot();

    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      computeContinuousOverlays(config, frames, 400 + i, snapshot);
    }
    const elapsed = performance.now() - start;

    // Average should be under 5ms per call
    expect(elapsed / 10).toBeLessThan(5);
  });
});
