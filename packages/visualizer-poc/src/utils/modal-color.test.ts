import { describe, it, expect } from "vitest";
import { detectModalColor } from "./modal-color";
import type { EnhancedFrameData } from "../data/types";

/** Helper to build a mock frame with sensible defaults */
function mockFrame(
  overrides: Partial<EnhancedFrameData> = {},
): EnhancedFrameData {
  return {
    rms: 0.3,
    centroid: 0.5,
    onset: 0,
    beat: false,
    sub: 0.2,
    low: 0.3,
    mid: 0.4,
    high: 0.3,
    chroma: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    contrast: [0, 0, 0, 0, 0, 0, 0],
    flatness: 0,
    ...overrides,
  } as EnhancedFrameData;
}

/**
 * Build a chroma array with high energy on specified pitch classes
 * and low background energy elsewhere. The first pitch class in the array
 * is treated as the root and gets the highest energy (rootLevel), ensuring
 * the root detection algorithm picks it as the tonic.
 *
 * Pitch classes: C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11
 */
function buildChroma(
  activePitchClasses: number[],
  activeLevel = 0.8,
  bgLevel = 0.05,
  rootLevel = 1.0,
): [number, number, number, number, number, number, number, number, number, number, number, number] {
  const chroma: number[] = new Array(12).fill(bgLevel);
  for (let i = 0; i < activePitchClasses.length; i++) {
    chroma[activePitchClasses[i]] = i === 0 ? rootLevel : activeLevel;
  }
  return chroma as [number, number, number, number, number, number, number, number, number, number, number, number];
}

describe("detectModalColor", () => {
  describe("section gating", () => {
    it("returns neutral for verse sections", () => {
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      const result = detectModalColor(frames, 30, "verse");
      expect(result.hueShift).toBe(0);
      expect(result.satOffset).toBe(0);
      expect(result.mode).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it("returns neutral for chorus sections", () => {
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      const result = detectModalColor(frames, 30, "chorus");
      expect(result.mode).toBeNull();
    });

    it("returns neutral for intro sections", () => {
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      const result = detectModalColor(frames, 30, "intro");
      expect(result.mode).toBeNull();
    });

    it("returns neutral when sectionType is undefined", () => {
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      const result = detectModalColor(frames, 30);
      expect(result.mode).toBeNull();
    });

    it("activates for jam sections", () => {
      // C Mixolydian: C D E F G A Bb = indices 0, 2, 4, 5, 7, 9, 10
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      const result = detectModalColor(frames, 30, "jam");
      expect(result.mode).not.toBeNull();
    });

    it("activates for solo sections", () => {
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      const result = detectModalColor(frames, 30, "solo");
      expect(result.mode).not.toBeNull();
    });

    it("activates for space sections", () => {
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      const result = detectModalColor(frames, 30, "space");
      expect(result.mode).not.toBeNull();
    });

    it("activates for drums sections", () => {
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      const result = detectModalColor(frames, 30, "drums");
      expect(result.mode).not.toBeNull();
    });
  });

  describe("mode detection", () => {
    it("detects Mixolydian from dominant mode chroma pattern", () => {
      // C Mixolydian: C D E F G A Bb = indices 0, 2, 4, 5, 7, 9, 10
      // Template: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0]
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      const result = detectModalColor(frames, 30, "jam");
      expect(result.mode).toBe("mixolydian");
      expect(result.hueShift).toBeGreaterThan(0); // +15 scaled by confidence
      expect(result.satOffset).toBeGreaterThan(0); // +0.08 scaled by confidence
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("detects Aeolian (minor) with negative hue and sat", () => {
      // A Aeolian (natural minor): A B C D E F G = indices 9, 11, 0, 2, 4, 5, 7
      // When transposed to root A (index 9), template is: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([9, 11, 0, 2, 4, 5, 7]) }),
      );
      const result = detectModalColor(frames, 30, "jam");
      expect(result.mode).toBe("aeolian");
      expect(result.hueShift).toBeLessThan(0); // -30 scaled by confidence
      expect(result.satOffset).toBeLessThan(0); // -0.03 scaled by confidence
    });

    it("detects Lydian with positive hue shift", () => {
      // C Lydian: C D E F# G A B = indices 0, 2, 4, 6, 7, 9, 11
      // Template: [1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1]
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 6, 7, 9, 11]) }),
      );
      const result = detectModalColor(frames, 30, "jam");
      expect(result.mode).toBe("lydian");
      expect(result.hueShift).toBeGreaterThan(0); // +25 scaled by confidence
      expect(result.satOffset).toBeGreaterThan(0); // +0.06 scaled by confidence
    });

    it("detects Dorian with negative hue shift and positive sat", () => {
      // D Dorian: D E F G A B C = indices 2, 4, 5, 7, 9, 11, 0
      // Template (from root D): [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0]
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([2, 4, 5, 7, 9, 11, 0]) }),
      );
      const result = detectModalColor(frames, 30, "solo");
      expect(result.mode).toBe("dorian");
      expect(result.hueShift).toBeLessThan(0); // -20 scaled by confidence
      expect(result.satOffset).toBeGreaterThan(0); // +0.03 scaled by confidence
    });

    it("detects Phrygian with strong negative hue shift", () => {
      // E Phrygian: E F G A B C D = indices 4, 5, 7, 9, 11, 0, 2
      // Template (from root E): [1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0]
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([4, 5, 7, 9, 11, 0, 2]) }),
      );
      const result = detectModalColor(frames, 30, "jam");
      expect(result.mode).toBe("phrygian");
      expect(result.hueShift).toBeLessThan(-10); // -40 scaled by confidence
    });
  });

  describe("confidence gating", () => {
    it("returns neutral when chroma is flat (all pitch classes equal)", () => {
      // Flat chroma: all pitch classes have equal energy, no clear mode
      const flatChroma: [number, number, number, number, number, number, number, number, number, number, number, number] =
        [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: flatChroma }),
      );
      const result = detectModalColor(frames, 30, "jam");
      expect(result.hueShift).toBe(0);
      expect(result.satOffset).toBe(0);
      expect(result.mode).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it("returns neutral when chroma has near-zero energy", () => {
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
      );
      const result = detectModalColor(frames, 30, "jam");
      expect(result.mode).toBeNull();
      expect(result.confidence).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles empty frames array", () => {
      const result = detectModalColor([], 0, "jam");
      expect(result.hueShift).toBe(0);
      expect(result.satOffset).toBe(0);
      expect(result.mode).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it("handles idx at start of array (left boundary)", () => {
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      const result = detectModalColor(frames, 0, "jam");
      // Should still detect — just uses fewer frames on the left side
      expect(result.mode).toBe("mixolydian");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("handles idx at end of array (right boundary)", () => {
      const frames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      const result = detectModalColor(frames, 59, "jam");
      expect(result.mode).toBe("mixolydian");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("handles idx beyond array bounds", () => {
      const frames = Array.from({ length: 10 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      // idx far beyond the array — window start/end will clamp
      const result = detectModalColor(frames, 1000, "jam");
      // Should still work with whatever frames fall in the clamped window
      expect(result).toBeDefined();
    });

    it("hueShift stays within documented range (-40 to +25)", () => {
      // Test with each extreme mode
      // Phrygian has the most negative shift (-40)
      const phrygianFrames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([4, 5, 7, 9, 11, 0, 2]) }),
      );
      const phrygian = detectModalColor(phrygianFrames, 30, "jam");
      expect(phrygian.hueShift).toBeGreaterThanOrEqual(-40);

      // Lydian has the most positive shift (+25)
      const lydianFrames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 6, 7, 9, 11]) }),
      );
      const lydian = detectModalColor(lydianFrames, 30, "jam");
      expect(lydian.hueShift).toBeLessThanOrEqual(25);
    });

    it("satOffset stays within documented range (-0.10 to +0.08)", () => {
      // Locrian has most negative satOffset (-0.10)
      const locrianFrames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 1, 3, 5, 6, 8, 10]) }),
      );
      const locrian = detectModalColor(locrianFrames, 30, "jam");
      expect(locrian.satOffset).toBeGreaterThanOrEqual(-0.1);

      // Mixolydian has most positive satOffset (+0.08)
      const mixoFrames = Array.from({ length: 60 }, () =>
        mockFrame({ chroma: buildChroma([0, 2, 4, 5, 7, 9, 10]) }),
      );
      const mixo = detectModalColor(mixoFrames, 30, "jam");
      expect(mixo.satOffset).toBeLessThanOrEqual(0.08);
    });
  });
});
