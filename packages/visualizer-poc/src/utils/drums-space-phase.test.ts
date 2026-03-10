import { describe, it, expect, beforeEach } from "vitest";
import {
  computeDrumsSpacePhase,
  resetDrumsSpacePhase,
} from "./drums-space-phase";
import type { AudioSnapshot } from "./audio-reactive";

function makeSnapshot(overrides: Partial<AudioSnapshot> = {}): AudioSnapshot {
  return {
    energy: 0.15,
    slowEnergy: 0.15,
    bass: 0.1,
    mids: 0.1,
    highs: 0.05,
    onsetEnvelope: 0.3,
    beatDecay: 0.5,
    chromaHue: 180,
    centroid: 0.3,
    flatness: 0.2,
    spectralFlux: 0.1,
    musicalTime: 0,
    ...overrides,
  };
}

describe("drums-space-phase", () => {
  beforeEach(() => {
    resetDrumsSpacePhase();
  });

  it("returns null for non-drums/space songs", () => {
    const result = computeDrumsSpacePhase(makeSnapshot(), false);
    expect(result).toBeNull();
  });

  it("high onset + low flatness → drums_tribal", () => {
    // Feed several frames to build history
    for (let i = 0; i < 35; i++) {
      computeDrumsSpacePhase(
        makeSnapshot({ onsetEnvelope: 0.6, energy: 0.25, flatness: 0.15 }),
        true,
      );
    }
    const result = computeDrumsSpacePhase(
      makeSnapshot({ onsetEnvelope: 0.6, energy: 0.25, flatness: 0.15 }),
      true,
    );
    expect(result).not.toBeNull();
    expect(result!.subPhase).toBe("drums_tribal");
  });

  it("low onset + high flatness → space_ambient", () => {
    for (let i = 0; i < 35; i++) {
      computeDrumsSpacePhase(
        makeSnapshot({ onsetEnvelope: 0.05, energy: 0.05, flatness: 0.6 }),
        true,
      );
    }
    const result = computeDrumsSpacePhase(
      makeSnapshot({ onsetEnvelope: 0.05, energy: 0.05, flatness: 0.6 }),
      true,
    );
    expect(result).not.toBeNull();
    expect(result!.subPhase).toBe("space_ambient");
  });

  it("rising onset from low → reemergence", () => {
    // First establish space_ambient
    for (let i = 0; i < 35; i++) {
      computeDrumsSpacePhase(
        makeSnapshot({ onsetEnvelope: 0.05, energy: 0.05, flatness: 0.6 }),
        true,
      );
    }
    // Then onset starts rising gently (below tribal threshold)
    for (let i = 0; i < 35; i++) {
      computeDrumsSpacePhase(
        makeSnapshot({ onsetEnvelope: 0.25, energy: 0.10, flatness: 0.35 }),
        true,
      );
    }
    const result = computeDrumsSpacePhase(
      makeSnapshot({ onsetEnvelope: 0.25, energy: 0.10, flatness: 0.35 }),
      true,
    );
    expect(result).not.toBeNull();
    // Should be reemergence, transition, or drums_tribal as band rebuilds
    expect(["reemergence", "transition", "drums_tribal"]).toContain(result!.subPhase);
  });

  it("phaseProgress increases with consecutive phase frames", () => {
    const result1 = computeDrumsSpacePhase(
      makeSnapshot({ onsetEnvelope: 0.6, energy: 0.25, flatness: 0.15 }),
      true,
    );
    expect(result1).not.toBeNull();

    // Feed more frames of the same phase
    let lastResult = result1;
    for (let i = 0; i < 30; i++) {
      lastResult = computeDrumsSpacePhase(
        makeSnapshot({ onsetEnvelope: 0.6, energy: 0.25, flatness: 0.15 }),
        true,
      );
    }
    expect(lastResult!.phaseProgress).toBeGreaterThan(result1!.phaseProgress);
  });
});
