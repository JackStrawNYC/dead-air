import { describe, it, expect, beforeEach } from "vitest";
import { RollingAudioState } from "./RollingAudioState";
import type { RawAudioFeatures } from "./types";

function makeRaw(overrides: Partial<RawAudioFeatures> = {}): RawAudioFeatures {
  return {
    rms: 0,
    bass: 0,
    mids: 0,
    highs: 0,
    centroid: 0,
    onset: 0,
    flatness: 0,
    chromaBins: new Float32Array(12),
    spectralFlux: 0,
    ...overrides,
  };
}

const NO_BEAT = { isBeat: false, estimatedTempo: 120 };
const BEAT = { isBeat: true, estimatedTempo: 120 };
const DT = 1 / 60; // 60fps frame time

describe("RollingAudioState", () => {
  let state: RollingAudioState;

  beforeEach(() => {
    state = new RollingAudioState();
  });

  it("returns all fields on first update", () => {
    const result = state.update(makeRaw(), NO_BEAT, DT, 0);

    expect(result).toHaveProperty("rms");
    expect(result).toHaveProperty("bass");
    expect(result).toHaveProperty("mids");
    expect(result).toHaveProperty("highs");
    expect(result).toHaveProperty("energy");
    expect(result).toHaveProperty("slowEnergy");
    expect(result).toHaveProperty("fastEnergy");
    expect(result).toHaveProperty("onset");
    expect(result).toHaveProperty("chromaHue");
    expect(result).toHaveProperty("sectionProgress");
    expect(result).toHaveProperty("sectionIndex");
    expect(result).toHaveProperty("climaxPhase");
    expect(result).toHaveProperty("dynamicTime");
    expect(result).toHaveProperty("musicalTime");
    expect(result).toHaveProperty("chroma");
    expect(result).toHaveProperty("contrast");
    expect(result.chroma).toHaveLength(12);
    expect(result.contrast).toHaveLength(7);
  });

  it("smoothly tracks energy increases (EMA)", () => {
    // Feed silence, then loud signal
    for (let i = 0; i < 60; i++) {
      state.update(makeRaw({ rms: 0 }), NO_BEAT, DT, i * DT);
    }

    // Start feeding loud signal
    let prev = 0;
    for (let i = 0; i < 30; i++) {
      const result = state.update(makeRaw({ rms: 0.8 }), NO_BEAT, DT, (60 + i) * DT);
      expect(result.energy).toBeGreaterThanOrEqual(prev);
      prev = result.energy;
    }

    // Energy should have risen but not fully reached 0.8 yet (EMA is slow)
    expect(prev).toBeGreaterThan(0);
    expect(prev).toBeLessThan(0.8);
  });

  it("fast energy tracks faster than slow energy", () => {
    for (let i = 0; i < 30; i++) {
      state.update(makeRaw({ rms: 0 }), NO_BEAT, DT, i * DT);
    }

    // Step change to loud
    const result = state.update(makeRaw({ rms: 0.9 }), NO_BEAT, DT, 30 * DT);
    expect(result.fastEnergy).toBeGreaterThan(result.slowEnergy);
  });

  it("beat detection triggers beat snap and decay", () => {
    // Build up energy first so energy gate doesn't suppress transients
    for (let i = 0; i < 60; i++) {
      state.update(makeRaw({ rms: 0.5 }), NO_BEAT, DT, i * DT);
    }

    const r1 = state.update(makeRaw({ rms: 0.5 }), BEAT, DT, 60 * DT);
    expect(r1.beatSnap).toBeGreaterThan(0);
    expect(r1.beatDecay).toBeGreaterThan(0);

    // Decay over subsequent frames
    let prev = r1.beatDecay;
    for (let i = 1; i < 30; i++) {
      const r = state.update(makeRaw({ rms: 0.5 }), NO_BEAT, DT, (60 + i) * DT);
      expect(r.beatDecay).toBeLessThanOrEqual(prev);
      prev = r.beatDecay;
    }
  });

  it("sections auto-increment after 30 seconds", () => {
    const r0 = state.update(makeRaw(), NO_BEAT, DT, 0);
    expect(r0.sectionIndex).toBe(0);

    // Jump to 31 seconds
    const r31 = state.update(makeRaw(), NO_BEAT, DT, 31);
    expect(r31.sectionIndex).toBe(1);
  });

  it("dynamic time advances with energy", () => {
    // Silent: dynamic time barely moves
    let silentResult = state.update(makeRaw({ rms: 0 }), NO_BEAT, DT, 0);
    for (let i = 1; i < 60; i++) {
      silentResult = state.update(makeRaw({ rms: 0 }), NO_BEAT, DT, i * DT);
    }
    const silentDT = silentResult.dynamicTime;

    // Reset and do loud
    state.reset();
    let loudResult = state.update(makeRaw({ rms: 0.8 }), NO_BEAT, DT, 0);
    for (let i = 1; i < 60; i++) {
      loudResult = state.update(makeRaw({ rms: 0.8 }), NO_BEAT, DT, i * DT);
    }
    const loudDT = loudResult.dynamicTime;

    expect(loudDT).toBeGreaterThan(silentDT);
  });

  it("resets all state", () => {
    // Build up state
    for (let i = 0; i < 120; i++) {
      state.update(makeRaw({ rms: 0.5 }), BEAT, DT, i * DT);
    }

    state.reset();
    const result = state.update(makeRaw({ rms: 0 }), NO_BEAT, DT, 0);
    expect(result.energy).toBeCloseTo(0, 4);
    expect(result.sectionIndex).toBe(0);
    // Dynamic time always advances a minimum amount (speed >= 0.01)
    expect(result.dynamicTime).toBeCloseTo(0, 3);
  });

  it("stem uniforms default to 0", () => {
    const result = state.update(makeRaw(), NO_BEAT, DT, 0);
    expect(result.vocalEnergy).toBe(0);
    expect(result.vocalPresence).toBe(0);
    expect(result.otherEnergy).toBe(0);
    expect(result.otherCentroid).toBe(0);
  });
});
