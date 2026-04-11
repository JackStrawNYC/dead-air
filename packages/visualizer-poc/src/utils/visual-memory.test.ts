import { describe, it, expect, beforeEach } from "vitest";
import {
  createInitialMemory,
  getShaderFingerprint,
  updateVisualMemory,
  getUnderrepresentedDimension,
  scoreDiversityBonus,
  FINGERPRINT_DIMENSIONS,
  _clearFingerprintCache,
} from "./visual-memory";
import type { VisualFingerprint, VisualMemoryState } from "./visual-memory";
import { SCENE_REGISTRY } from "../scenes/scene-registry";
import type { VisualMode } from "../data/types";

beforeEach(() => {
  _clearFingerprintCache();
});

// ─── Initial Memory ───

describe("createInitialMemory", () => {
  it("creates zeroed initial state", () => {
    const mem = createInitialMemory();
    expect(mem.totalWeight).toBe(0);
    for (const dim of FINGERPRINT_DIMENSIONS) {
      expect(mem.accumulated[dim]).toBe(0);
      expect(mem.exposure[dim]).toBe(0);
    }
  });
});

// ─── Fingerprint Mapping ───

describe("getShaderFingerprint", () => {
  it("returns a valid fingerprint for every registered shader", () => {
    const modes = Object.keys(SCENE_REGISTRY) as VisualMode[];
    expect(modes.length).toBeGreaterThan(0);

    for (const mode of modes) {
      const fp = getShaderFingerprint(mode);
      expect(fp).toBeDefined();
      for (const dim of FINGERPRINT_DIMENSIONS) {
        expect(typeof fp[dim]).toBe("number");
        expect(Number.isFinite(fp[dim])).toBe(true);
      }
      // warmth is [-1, 1], everything else [0, 1]
      expect(fp.warmth).toBeGreaterThanOrEqual(-1);
      expect(fp.warmth).toBeLessThanOrEqual(1);
      for (const dim of FINGERPRINT_DIMENSIONS.filter((d) => d !== "warmth")) {
        expect(fp[dim]).toBeGreaterThanOrEqual(0);
        expect(fp[dim]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("applies spectral family defaults", () => {
    // cosmic_dust has spectralFamily: "cosmic" → warmth should be negative
    const fp = getShaderFingerprint("cosmic_dust");
    expect(fp.warmth).toBeLessThan(0);
    expect(fp.abstraction).toBeGreaterThan(0.5);
  });

  it("applies energy affinity defaults for motion/density", () => {
    // particle_nebula: low energy → slow motion, low density
    const fpLow = getShaderFingerprint("particle_nebula");
    // inferno: high energy → fast motion, high density
    const fpHigh = getShaderFingerprint("inferno");
    // inferno has override for motionSpeed: 0.9
    expect(fpHigh.motionSpeed).toBeGreaterThan(fpLow.motionSpeed);
  });

  it("applies per-shader overrides (fractal_temple)", () => {
    const fp = getShaderFingerprint("fractal_temple");
    expect(fp.geometricness).toBe(0.9);
    expect(fp.abstraction).toBe(0.7);
  });

  it("applies per-shader overrides (liquid_light)", () => {
    const fp = getShaderFingerprint("liquid_light");
    expect(fp.geometricness).toBe(0.1);
    expect(fp.warmth).toBe(0.5);
  });

  it("applies per-shader overrides (deep_ocean)", () => {
    const fp = getShaderFingerprint("deep_ocean");
    expect(fp.warmth).toBe(-0.6);
    expect(fp.motionSpeed).toBe(0.3);
  });

  it("caches fingerprints (returns same reference)", () => {
    const fp1 = getShaderFingerprint("inferno");
    const fp2 = getShaderFingerprint("inferno");
    expect(fp1).toBe(fp2);
  });

  it("differentiates warm vs cool shaders", () => {
    const warm = getShaderFingerprint("inferno");
    const cool = getShaderFingerprint("deep_ocean");
    expect(warm.warmth).toBeGreaterThan(cool.warmth);
    expect(warm.warmth).toBeGreaterThan(0.5);
    expect(cool.warmth).toBeLessThan(-0.3);
  });

  it("differentiates geometric vs organic shaders", () => {
    const geo = getShaderFingerprint("sacred_geometry");
    const organic = getShaderFingerprint("liquid_light");
    expect(geo.geometricness).toBeGreaterThan(organic.geometricness);
    expect(geo.geometricness).toBeGreaterThan(0.8);
    expect(organic.geometricness).toBeLessThan(0.3);
  });
});

// ─── Memory Update ───

describe("updateVisualMemory", () => {
  it("updates accumulated average with first shader", () => {
    const initial = createInitialMemory();
    const fp = getShaderFingerprint("inferno");
    // 1 minute at 30fps = 1800 frames
    const updated = updateVisualMemory(initial, "inferno", 1800);

    expect(updated.totalWeight).toBeCloseTo(1.0); // 1 minute
    for (const dim of FINGERPRINT_DIMENSIONS) {
      expect(updated.accumulated[dim]).toBeCloseTo(fp[dim]);
    }
  });

  it("returns same state for zero-duration update", () => {
    const initial = createInitialMemory();
    const updated = updateVisualMemory(initial, "inferno", 0);
    expect(updated).toBe(initial);
  });

  it("returns same state for negative-duration update", () => {
    const initial = createInitialMemory();
    const updated = updateVisualMemory(initial, "inferno", -100);
    expect(updated).toBe(initial);
  });

  it("computes weighted average across multiple shaders", () => {
    let mem = createInitialMemory();
    // 2 minutes of inferno (warm)
    mem = updateVisualMemory(mem, "inferno", 3600);
    // 2 minutes of deep_ocean (cool)
    mem = updateVisualMemory(mem, "deep_ocean", 3600);

    const warmFp = getShaderFingerprint("inferno");
    const coolFp = getShaderFingerprint("deep_ocean");

    // With equal weights, the average should be the midpoint
    for (const dim of FINGERPRINT_DIMENSIONS) {
      const expectedAvg = (warmFp[dim] + coolFp[dim]) / 2;
      expect(mem.accumulated[dim]).toBeCloseTo(expectedAvg, 2);
    }
    expect(mem.totalWeight).toBeCloseTo(4.0); // 4 minutes total
  });

  it("longer duration weighs more in the average", () => {
    let mem = createInitialMemory();
    // 4 minutes of inferno (warm, weight=4)
    mem = updateVisualMemory(mem, "inferno", 7200);
    // 1 minute of deep_ocean (cool, weight=1)
    mem = updateVisualMemory(mem, "deep_ocean", 1800);

    const warmFp = getShaderFingerprint("inferno");
    const coolFp = getShaderFingerprint("deep_ocean");

    // Weighted average: (warm*4 + cool*1) / 5
    const expectedWarmth = (warmFp.warmth * 4 + coolFp.warmth * 1) / 5;
    expect(mem.accumulated.warmth).toBeCloseTo(expectedWarmth, 2);
    expect(mem.totalWeight).toBeCloseTo(5.0);
  });

  it("is immutable (does not mutate input state)", () => {
    const initial = createInitialMemory();
    const updated = updateVisualMemory(initial, "inferno", 1800);
    expect(initial.totalWeight).toBe(0);
    expect(initial.accumulated.warmth).toBe(0);
    expect(updated.totalWeight).not.toBe(0);
  });

  it("accumulates exposure based on distance from center", () => {
    let mem = createInitialMemory();
    // inferno has warmth: 0.8, which is far from center (0 for warmth)
    mem = updateVisualMemory(mem, "inferno", 1800);

    // Exposure should be positive for warmth (|0.8 - 0| * 1 min = 0.8)
    expect(mem.exposure.warmth).toBeGreaterThan(0);
  });
});

// ─── Underrepresented Dimension ───

describe("getUnderrepresentedDimension", () => {
  it("returns 'warmth' for empty memory (deterministic fallback)", () => {
    const mem = createInitialMemory();
    expect(getUnderrepresentedDimension(mem)).toBe("warmth");
  });

  it("returns lowest-exposure dimension after heavy usage of one region", () => {
    let mem = createInitialMemory();
    // Show 10 minutes of geometric, fast, saturated, abstract content
    // sacred_geometry: geometricness: 0.95, abstraction: 0.8, motionSpeed: 0.2, density: 0.3
    // This has HIGH geometricness and abstraction exposure, but LOW motion/density
    mem = updateVisualMemory(mem, "sacred_geometry", 18000); // 10 min

    const underrep = getUnderrepresentedDimension(mem);
    // sacred_geometry has warmth: 0 (tonal family), which is exactly at center (0 for warmth dim)
    // so warmth exposure will be near zero. That should be the underrepresented dimension.
    expect(underrep).toBe("warmth");
  });

  it("changes as memory accumulates different shaders", () => {
    let mem = createInitialMemory();
    // Start with something warm → warmth is well-represented
    mem = updateVisualMemory(mem, "inferno", 18000); // 10 min warm

    // warmth should NOT be underrepresented after lots of warm content
    const dim1 = getUnderrepresentedDimension(mem);
    expect(dim1).not.toBe("warmth");
  });
});

// ─── Diversity Scoring ───

describe("scoreDiversityBonus", () => {
  it("returns 0.5 for empty memory (all candidates equally novel)", () => {
    const mem = createInitialMemory();
    const score = scoreDiversityBonus(mem, "inferno");
    expect(score).toBe(0.5);
  });

  it("gives cool shaders higher diversity bonus after warm saturation", () => {
    let mem = createInitialMemory();
    // Saturate with warm shaders
    mem = updateVisualMemory(mem, "inferno", 18000); // 10 min
    mem = updateVisualMemory(mem, "lava_flow", 9000); // 5 min

    const coolScore = scoreDiversityBonus(mem, "deep_ocean");
    const warmScore = scoreDiversityBonus(mem, "inferno");

    expect(coolScore).toBeGreaterThan(warmScore);
  });

  it("gives organic shaders higher diversity bonus after geometric saturation", () => {
    let mem = createInitialMemory();
    // Saturate with geometric shaders
    mem = updateVisualMemory(mem, "sacred_geometry", 18000); // 10 min
    mem = updateVisualMemory(mem, "truchet_tiling", 9000); // 5 min

    const organicScore = scoreDiversityBonus(mem, "liquid_light");
    const geoScore = scoreDiversityBonus(mem, "fractal_temple");

    expect(organicScore).toBeGreaterThan(geoScore);
  });

  it("gives high diversity score for shaders opposite to accumulated average", () => {
    let mem = createInitialMemory();
    // Lots of warm, dense, fast, saturated, abstract content
    mem = updateVisualMemory(mem, "inferno", 18000);
    mem = updateVisualMemory(mem, "climax_surge", 9000);

    // stark_minimal is the opposite: sparse, slow, desaturated
    const oppositeScore = scoreDiversityBonus(mem, "stark_minimal");
    expect(oppositeScore).toBeGreaterThan(0.2);
  });

  it("decreases diversity score for recently-shown visual characteristics", () => {
    let mem = createInitialMemory();
    // Show inferno for a while
    mem = updateVisualMemory(mem, "inferno", 18000);

    // inferno itself should have lowest diversity
    const infernoScore = scoreDiversityBonus(mem, "inferno");

    // Any other shader should score higher
    const oceanScore = scoreDiversityBonus(mem, "deep_ocean");
    const auroraScore = scoreDiversityBonus(mem, "aurora");
    const sacredScore = scoreDiversityBonus(mem, "sacred_geometry");

    expect(oceanScore).toBeGreaterThan(infernoScore);
    expect(auroraScore).toBeGreaterThan(infernoScore);
    expect(sacredScore).toBeGreaterThan(infernoScore);
  });

  it("returns score in [0, 1] range for all shader combinations", () => {
    let mem = createInitialMemory();
    mem = updateVisualMemory(mem, "cosmic_voyage", 9000);

    const modes = Object.keys(SCENE_REGISTRY) as VisualMode[];
    for (const mode of modes) {
      const score = scoreDiversityBonus(mem, mode);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("inferno scores near-zero against inferno-saturated memory", () => {
    let mem = createInitialMemory();
    // Pure inferno memory
    mem = updateVisualMemory(mem, "inferno", 18000);

    const score = scoreDiversityBonus(mem, "inferno");
    // Distance from accumulated average to same shader should be ~0
    expect(score).toBeLessThan(0.05);
  });
});

// ─── Duration Weighting ───

describe("duration weighting", () => {
  it("heavier shader duration shifts the accumulated average more", () => {
    // Memory A: 1 min inferno then 1 min deep_ocean
    let memA = createInitialMemory();
    memA = updateVisualMemory(memA, "inferno", 1800);
    memA = updateVisualMemory(memA, "deep_ocean", 1800);

    // Memory B: 5 min inferno then 1 min deep_ocean
    let memB = createInitialMemory();
    memB = updateVisualMemory(memB, "inferno", 9000);
    memB = updateVisualMemory(memB, "deep_ocean", 1800);

    // memB should be warmer because inferno dominated
    expect(memB.accumulated.warmth).toBeGreaterThan(memA.accumulated.warmth);
  });

  it("short shaders barely affect the average", () => {
    let mem = createInitialMemory();
    // 10 minutes of deep_ocean
    mem = updateVisualMemory(mem, "deep_ocean", 18000);
    const avgBefore = mem.accumulated.warmth;

    // 3 seconds of inferno (90 frames)
    mem = updateVisualMemory(mem, "inferno", 90);
    const avgAfter = mem.accumulated.warmth;

    // The average should barely move
    expect(Math.abs(avgAfter - avgBefore)).toBeLessThan(0.05);
  });
});

// ─── Integration: Full Show Simulation ───

describe("full show simulation", () => {
  it("diverse show maintains moderate accumulated values", () => {
    let mem = createInitialMemory();
    // Simulate a diverse 20-song show
    const diverseSetlist: { mode: VisualMode; frames: number }[] = [
      { mode: "liquid_light", frames: 5400 },   // 3 min
      { mode: "cosmic_voyage", frames: 7200 },  // 4 min
      { mode: "inferno", frames: 3600 },         // 2 min
      { mode: "deep_ocean", frames: 5400 },      // 3 min
      { mode: "sacred_geometry", frames: 4500 }, // 2.5 min
      { mode: "aurora", frames: 3600 },           // 2 min
      { mode: "fractal_temple", frames: 5400 },  // 3 min
      { mode: "tie_dye", frames: 4500 },          // 2.5 min
      { mode: "stark_minimal", frames: 3600 },   // 2 min
      { mode: "storm", frames: 3600 },            // 2 min
    ];

    for (const { mode, frames } of diverseSetlist) {
      mem = updateVisualMemory(mem, mode, frames);
    }

    // Accumulated warmth should be moderate (mix of warm and cool)
    expect(mem.accumulated.warmth).toBeGreaterThan(-0.5);
    expect(mem.accumulated.warmth).toBeLessThan(0.5);

    // Diversity scores should be relatively low for all (everything represented)
    const modes = diverseSetlist.map((s) => s.mode);
    const scores = modes.map((m) => scoreDiversityBonus(mem, m));
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(avgScore).toBeLessThan(0.5);
  });

  it("monotone show drives high diversity scores for contrasting shaders", () => {
    let mem = createInitialMemory();
    // Simulate a show that's all warm fractals
    for (let i = 0; i < 10; i++) {
      mem = updateVisualMemory(mem, "inferno", 5400); // 3 min each
      mem = updateVisualMemory(mem, "lava_flow", 5400);
      mem = updateVisualMemory(mem, "fractal_flames", 5400);
    }

    // Cool shaders should get very high diversity bonus
    const coolScore = scoreDiversityBonus(mem, "deep_ocean");
    const geoScore = scoreDiversityBonus(mem, "sacred_geometry");
    const minimalScore = scoreDiversityBonus(mem, "stark_minimal");

    expect(coolScore).toBeGreaterThan(0.3);
    expect(geoScore).toBeGreaterThan(0.2);
    expect(minimalScore).toBeGreaterThan(0.3);

    // More warm fractals should get very low diversity bonus
    const warmScore = scoreDiversityBonus(mem, "inferno");
    expect(warmScore).toBeLessThan(0.1);
  });
});
