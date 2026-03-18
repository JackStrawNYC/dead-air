import { describe, it, expect } from "vitest";
import { endScreenOverlayMult } from "./end-screen-zones";

describe("endScreenOverlayMult", () => {
  const totalFrames = 3000;

  it("returns 1.0 for frames well before the end screen window", () => {
    // Window starts at totalFrames - 600 = 2400
    expect(endScreenOverlayMult(0, totalFrames)).toBe(1);
    expect(endScreenOverlayMult(1000, totalFrames)).toBe(1);
    expect(endScreenOverlayMult(2000, totalFrames)).toBe(1);
  });

  it("returns 1.0 at the start of the end screen window", () => {
    // windowStart = 3000 - 600 = 2400; dim factor = 0/90 = 0
    expect(endScreenOverlayMult(2400, totalFrames)).toBe(1);
  });

  it("returns partially suppressed value partway into the ramp", () => {
    // 90 frames into window: frame = 2400 + 90 = 2490
    // dim = 90/90 = 1.0, mult = 1 - 1.0*0.6 = 0.4
    expect(endScreenOverlayMult(2490, totalFrames)).toBeCloseTo(0.4);
  });

  it("returns 0.4 at the end of the track", () => {
    // frame = 2999 (totalFrames - 1)
    // dim = (2999 - 2400) / 90 = 6.66, clamped to 1
    // mult = 1 - 1*0.6 = 0.4
    expect(endScreenOverlayMult(2999, totalFrames)).toBeCloseTo(0.4);
  });

  it("ramps linearly over the 90-frame ramp period", () => {
    // At 45 frames into window (halfway through ramp)
    // dim = 45/90 = 0.5, mult = 1 - 0.5*0.6 = 0.7
    const frame = totalFrames - 600 + 45;
    expect(endScreenOverlayMult(frame, totalFrames)).toBeCloseTo(0.7);
  });

  it("never goes below 0.4", () => {
    // Even far past the ramp end
    for (let f = totalFrames - 500; f < totalFrames; f += 50) {
      expect(endScreenOverlayMult(f, totalFrames)).toBeGreaterThanOrEqual(0.4 - 0.001);
    }
  });
});
