import { describe, it, expect } from "vitest";
import { scoreOverlayForWindow, type ScoringContext } from "./overlay-scoring";
import type { OverlayEntry } from "./types";

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

function makeCtx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    windowEnergy: "mid",
    windowTexture: null,
    isDropout: false,
    previousWindowOverlays: new Set(),
    previousWindowFrames: 1200,
    previousWindowEnergy: null,
    setNumber: 1,
    isDrumsSpace: false,
    ...overrides,
  };
}

const fixedRng = () => 0.05; // deterministic jitter

describe("scoreOverlayForWindow", () => {
  it("gives A-tier a scoring bonus", () => {
    const aTier = scoreOverlayForWindow(makeEntry({ tier: "A" }), makeCtx(), fixedRng);
    const bTier = scoreOverlayForWindow(makeEntry({ tier: "B" }), makeCtx(), fixedRng);
    expect(aTier).toBeGreaterThan(bTier);
  });

  it("boosts energy-matched overlays", () => {
    const matched = scoreOverlayForWindow(makeEntry({ energyBand: "mid" }), makeCtx({ windowEnergy: "mid" }), fixedRng);
    const mismatched = scoreOverlayForWindow(makeEntry({ energyBand: "low" }), makeCtx({ windowEnergy: "high" }), fixedRng);
    expect(matched).toBeGreaterThan(mismatched);
  });

  it("penalizes repeated overlays from long previous window", () => {
    const fresh = scoreOverlayForWindow(makeEntry(), makeCtx(), fixedRng);
    const repeated = scoreOverlayForWindow(makeEntry(), makeCtx({
      previousWindowOverlays: new Set(["TestOverlay"]),
      previousWindowFrames: 1800,
    }), fixedRng);
    expect(fresh).toBeGreaterThan(repeated);
  });

  it("carries over overlays from short previous window", () => {
    const fresh = scoreOverlayForWindow(makeEntry(), makeCtx(), fixedRng);
    const carryover = scoreOverlayForWindow(makeEntry(), makeCtx({
      previousWindowOverlays: new Set(["TestOverlay"]),
      previousWindowFrames: 300,
    }), fixedRng);
    expect(carryover).toBeGreaterThan(fresh);
  });

  it("boosts song identity preferred overlays", () => {
    const boosted = scoreOverlayForWindow(makeEntry(), makeCtx({
      songIdentity: {
        preferredModes: [],
        palette: { primary: 0, secondary: 0, saturation: 1 },
        overlayBoost: ["TestOverlay"],
      },
    }), fixedRng);
    const normal = scoreOverlayForWindow(makeEntry(), makeCtx(), fixedRng);
    expect(boosted).toBeGreaterThan(normal);
  });

  it("prefers low layers during dropout", () => {
    const lowLayer = scoreOverlayForWindow(makeEntry({ layer: 1 }), makeCtx({ isDropout: true }), fixedRng);
    const highLayer = scoreOverlayForWindow(makeEntry({ layer: 8 }), makeCtx({ isDropout: true }), fixedRng);
    expect(lowLayer).toBeGreaterThan(highLayer);
  });

  it("penalizes character overlays at low energy", () => {
    const charLow = scoreOverlayForWindow(
      makeEntry({ category: "character" }),
      makeCtx({ windowEnergy: "low" }),
      fixedRng,
    );
    const charMid = scoreOverlayForWindow(
      makeEntry({ category: "character" }),
      makeCtx({ windowEnergy: "mid" }),
      fixedRng,
    );
    expect(charLow).toBeLessThan(charMid);
  });
});
