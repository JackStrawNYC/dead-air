import { describe, it, expect } from "vitest";
import { computeEffectIndex } from "./EffectScheduleContext";

describe("computeEffectIndex", () => {
  const scheduleLength = 300; // 10 seconds at 30fps

  it("returns frame directly at matching fps (30fps schedule, 30fps render)", () => {
    expect(computeEffectIndex(0, 30, 30, scheduleLength)).toBe(0);
    expect(computeEffectIndex(150, 30, 30, scheduleLength)).toBe(150);
    expect(computeEffectIndex(299, 30, 30, scheduleLength)).toBe(299);
  });

  it("scales frame index when render fps differs from schedule fps", () => {
    // At 60fps render, frame 60 = 1 second = schedule frame 30
    expect(computeEffectIndex(60, 30, 60, scheduleLength)).toBe(30);
    // Frame 0 maps to 0 regardless
    expect(computeEffectIndex(0, 30, 60, scheduleLength)).toBe(0);
    // Frame 120 at 60fps = 2 seconds = schedule frame 60
    expect(computeEffectIndex(120, 30, 60, scheduleLength)).toBe(60);
  });

  it("clamps to schedule bounds", () => {
    // Beyond schedule length
    expect(computeEffectIndex(600, 30, 30, scheduleLength)).toBe(299);
    // At 60fps, frame 600 = 10s = schedule frame 300, clamped to 299
    expect(computeEffectIndex(600, 30, 60, scheduleLength)).toBe(299);
  });

  it("handles negative frames", () => {
    expect(computeEffectIndex(-1, 30, 30, scheduleLength)).toBe(0);
  });

  it("maintains temporal alignment: same wall-clock second = same effect", () => {
    // 1 second mark at different fps should read the same schedule entry
    const at1sec_30fps = computeEffectIndex(30, 30, 30, scheduleLength);
    const at1sec_60fps = computeEffectIndex(60, 30, 60, scheduleLength);
    expect(at1sec_30fps).toBe(at1sec_60fps);

    // 5 second mark
    const at5sec_30fps = computeEffectIndex(150, 30, 30, scheduleLength);
    const at5sec_60fps = computeEffectIndex(300, 30, 60, scheduleLength);
    expect(at5sec_30fps).toBe(at5sec_60fps);
  });
});
