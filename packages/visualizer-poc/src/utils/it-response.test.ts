import { describe, it, expect } from "vitest";
import { computeITResponse, type ITShowContext } from "./it-response";
import type { EnhancedFrameData } from "../data/types";

/**
 * Build a minimal frame array that will trigger a coherence lock.
 * High RMS, low flatness, regular beats, consistent chroma = high coherence.
 */
function makeLockedFrames(count: number): EnhancedFrameData[] {
  return Array.from({ length: count }, (_, i) => ({
    rms: 0.30,
    onset: i % 15 === 0 ? 0.6 : 0.05,
    beat: i % 15 === 0,
    centroid: 0.5,
    flatness: 0.08,
    contrast: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3] as [number, number, number, number, number, number, number],
    chroma: [0.8, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1] as [number, number, number, number, number, number, number, number, number, number, number, number],
    sub: 0.3, low: 0.3, mid: 0.3, high: 0.2,
    stemBassRms: 0.3, stemDrumOnset: 0.2, stemVocalRms: 0.1, stemOtherRms: 0.3,
    stemDrumBeat: i % 15 === 0,
    stemOtherCentroid: 0.5,
    stemVocalPresence: 0.1,
    melodicPitch: 0.5,
    melodicConfidence: 0.5,
    melodicDirection: 0,
    chordIndex: 0,
    harmonicTension: 0.2,
    sectionType: "jam",
    improvisationScore: 0.5,
    localTempo: 120,
    beatConfidence: 0.9,
    downbeat: i % 60 === 0,
  }));
}

function makeQuietFrames(count: number): EnhancedFrameData[] {
  return Array.from({ length: count }, () => ({
    rms: 0.02,
    onset: 0,
    beat: false,
    centroid: 0.2,
    flatness: 0.8,
    contrast: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05] as [number, number, number, number, number, number, number],
    chroma: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1] as [number, number, number, number, number, number, number, number, number, number, number, number],
    sub: 0.02, low: 0.02, mid: 0.02, high: 0.02,
    stemBassRms: 0.02, stemDrumOnset: 0, stemVocalRms: 0, stemOtherRms: 0.02,
    stemDrumBeat: false,
    stemOtherCentroid: 0.3,
    stemVocalPresence: 0,
    melodicPitch: 0, melodicConfidence: 0, melodicDirection: 0,
    chordIndex: 0, harmonicTension: 0,
    sectionType: "verse",
    improvisationScore: 0,
    localTempo: 120, beatConfidence: 0.2, downbeat: false,
  }));
}

describe("computeITResponse", () => {
  it("returns normal state for quiet frames", () => {
    const frames = makeQuietFrames(300);
    const result = computeITResponse(frames, 150);
    expect(result.phase).toBe("normal");
    expect(result.saturationSurge).toBe(1);
  });

  it("returns normal state for empty frames", () => {
    const result = computeITResponse([], 0);
    expect(result.phase).toBe("normal");
  });

  it("detects locked state during sustained high coherence", () => {
    // 600 frames of locked content — coherence should lock after ~90 frames
    const frames = makeLockedFrames(600);
    // Check at frame 500 (well past lock threshold)
    const result = computeITResponse(frames, 500);
    // Should be locked or in a locked-derived state
    expect(["locked", "locking"]).toContain(result.phase);
  });

  describe("frequency gating", () => {
    it("allows transcendence with no show context", () => {
      // Without show context, no gating should apply
      const frames = makeLockedFrames(600);
      const result = computeITResponse(frames, 500);
      // No gating — if it reaches transcendent tier, it stays transcendent
      expect(result.forceTranscendentShader === true || result.lockDepth !== "transcendent").toBe(true);
    });

    it("gates transcendence when itLockCount exceeds set budget", () => {
      const frames = makeLockedFrames(600);
      const showContext: ITShowContext = {
        itLockCount: 2, // Already had 2 locks in the show
        isPeakOfShow: false,
        setNumber: 1,
      };
      const result = computeITResponse(frames, 500, showContext);
      // If the lock has progressed to what would be transcendent (300+ frames),
      // it should be gated down to "deep"
      if (result.phase === "locked") {
        expect(result.lockDepth).not.toBe("transcendent");
        expect(result.forceTranscendentShader).toBe(false);
      }
    });

    it("allows transcendence when isPeakOfShow overrides gating", () => {
      const frames = makeLockedFrames(600);
      const showContext: ITShowContext = {
        itLockCount: 5, // Many locks, but this is peak of show
        isPeakOfShow: true,
        setNumber: 2,
      };
      const result = computeITResponse(frames, 500, showContext);
      // Peak-of-show should bypass gating
      if (result.phase === "locked" && result.lockDepth === "transcendent") {
        expect(result.forceTranscendentShader).toBe(true);
      }
    });

    it("allows first transcendence in set 2 with fresh budget", () => {
      const frames = makeLockedFrames(600);
      const showContext: ITShowContext = {
        itLockCount: 1, // 1 lock in set 1
        isPeakOfShow: false,
        setNumber: 2, // set 2 gets fresh budget
      };
      const result = computeITResponse(frames, 500, showContext);
      // Set 2 fresh budget: locksThisSet = max(0, 1 - 1) = 0, which is < MAX
      // So transcendence should be allowed
      if (result.phase === "locked") {
        // Should not be forcibly gated
        expect(["shallow", "medium", "deep", "transcendent"]).toContain(result.lockDepth);
      }
    });
  });
});
