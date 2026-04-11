import { describe, it, expect } from "vitest";
import {
  computeComplexity,
  createComplexityState,
  type ComplexityState,
} from "./adaptive-complexity";

/** Helper: run N frames at a given frame time */
function runFrames(
  state: ComplexityState,
  frameTimeMs: number,
  count: number,
): ComplexityState {
  let s = state;
  for (let i = 0; i < count; i++) {
    s = computeComplexity(frameTimeMs, s.targetFps, s);
  }
  return s;
}

describe("adaptive-complexity: computeComplexity", () => {
  it("stays at 1.0 when frame time is under budget", () => {
    const state = createComplexityState(30);
    // 30fps target = 33.3ms; 25ms is well under budget
    const result = computeComplexity(25, 30, state);
    expect(result.resolutionScale).toBe(1.0);
    expect(result.stepReduction).toBe(1.0);
  });

  it("stays at 1.0 when frame time is slightly over but within 1.2x threshold", () => {
    const state = createComplexityState(30);
    // 35ms is > 33.3ms but < 33.3 * 1.2 = 40ms — within tolerance
    const result = computeComplexity(35, 30, state);
    expect(result.resolutionScale).toBe(1.0);
    expect(result.stepReduction).toBe(1.0);
  });

  it("reduces resolution when frame time exceeds 1.2x budget", () => {
    const state = createComplexityState(30);
    // 42ms > 33.3 * 1.2 = 40ms
    const result = computeComplexity(42, 30, state);
    expect(result.resolutionScale).toBeLessThan(1.0);
    expect(result.resolutionScale).toBe(0.95); // 1.0 - 0.05
  });

  it("reduces step count when frame time exceeds 1.5x budget", () => {
    const state = createComplexityState(30);
    // 55ms > 33.3 * 1.5 = 50ms
    const result = computeComplexity(55, 30, state);
    expect(result.resolutionScale).toBeLessThan(1.0);
    expect(result.stepReduction).toBeLessThan(1.0);
    expect(result.stepReduction).toBe(0.95); // 1.0 - 0.05
  });

  it("gradually recovers when under budget for 10+ consecutive frames", () => {
    // First reduce quality
    let state = createComplexityState(30);
    state = computeComplexity(55, 30, state); // reduce both
    expect(state.resolutionScale).toBe(0.95);
    expect(state.stepReduction).toBe(0.95);

    // Run 10 frames well under budget to trigger recovery
    state = runFrames(state, 20, 10);

    // Should have started recovering
    expect(state.resolutionScale).toBeGreaterThan(0.95);
  });

  it("does not recover until 10 consecutive under-budget frames", () => {
    let state = createComplexityState(30);
    // Reduce quality
    state = computeComplexity(55, 30, state);
    const reducedRes = state.resolutionScale;

    // Run 9 frames under budget — not enough for recovery
    state = runFrames(state, 20, 9);
    expect(state.resolutionScale).toBe(reducedRes);

    // 10th frame triggers recovery
    state = computeComplexity(20, 30, state);
    expect(state.resolutionScale).toBeGreaterThan(reducedRes);
  });

  it("never goes below 0.5 for resolution scale", () => {
    let state = createComplexityState(30);
    // Hammer it with 20 over-budget frames
    state = runFrames(state, 55, 20);
    expect(state.resolutionScale).toBe(0.5);
  });

  it("never goes below 0.5 for step reduction", () => {
    let state = createComplexityState(30);
    // Hammer it with 20 severely over-budget frames
    state = runFrames(state, 55, 20);
    expect(state.stepReduction).toBe(0.5);
  });

  it("never goes above 1.0 for resolution scale", () => {
    let state = createComplexityState(30);
    // Start at max and run under budget for a long time
    state = runFrames(state, 10, 30);
    expect(state.resolutionScale).toBe(1.0);
  });

  it("never goes above 1.0 for step reduction", () => {
    let state = createComplexityState(30);
    state = runFrames(state, 10, 30);
    expect(state.stepReduction).toBe(1.0);
  });

  it("temporalUpscaleActive activates when resolution is below 0.9", () => {
    let state = createComplexityState(30);
    // Reduce resolution below 0.9
    state = runFrames(state, 55, 3); // 1.0 -> 0.95 -> 0.90 -> 0.85
    expect(state.resolutionScale).toBeLessThan(0.9);
    expect(state.temporalUpscaleActive).toBe(true);
  });

  it("temporalUpscaleActive is false at full resolution", () => {
    const state = createComplexityState(30);
    expect(state.temporalUpscaleActive).toBe(false);
  });

  it("temporalUpscaleActive deactivates when resolution recovers above 0.9", () => {
    let state = createComplexityState(30);
    // Reduce below threshold
    state = runFrames(state, 55, 3);
    expect(state.temporalUpscaleActive).toBe(true);

    // Recover above threshold (need many under-budget frames)
    state = runFrames(state, 10, 30);
    expect(state.resolutionScale).toBeGreaterThanOrEqual(0.9);
    expect(state.temporalUpscaleActive).toBe(false);
  });

  it("smooth transitions: max change per frame is 0.05", () => {
    const state = createComplexityState(30);
    // Even extremely over-budget frame should only reduce by 0.05
    const result = computeComplexity(200, 30, state);
    expect(state.resolutionScale - result.resolutionScale).toBeLessThanOrEqual(0.05 + 1e-10);
    expect(state.stepReduction - result.stepReduction).toBeLessThanOrEqual(0.05 + 1e-10);
  });

  it("works correctly at 60fps target", () => {
    const state = createComplexityState(60);
    // 60fps target = 16.7ms; 22ms > 16.7 * 1.2 = 20ms
    const result = computeComplexity(22, 60, state);
    expect(result.resolutionScale).toBeLessThan(1.0);
  });

  it("resets recovery counter when a frame goes over budget", () => {
    let state = createComplexityState(30);
    // Reduce quality
    state = computeComplexity(55, 30, state);
    const reducedRes = state.resolutionScale;

    // Run 8 under-budget frames
    state = runFrames(state, 20, 8);
    expect(state.resolutionScale).toBe(reducedRes); // Not yet recovered

    // One over-budget frame resets the counter
    state = computeComplexity(55, 30, state);

    // Run 9 more under-budget frames (total since reset: 9, not enough)
    state = runFrames(state, 20, 9);
    // Resolution should have gotten worse from the over-budget frame then not yet recovered
    expect(state.resolutionScale).toBeLessThanOrEqual(reducedRes);
  });

  it("recovers resolution before step count", () => {
    let state = createComplexityState(30);
    // Reduce both
    state = runFrames(state, 55, 5);
    const reducedRes = state.resolutionScale;
    const reducedSteps = state.stepReduction;

    // Recover with many under-budget frames
    state = runFrames(state, 10, 15);

    // Resolution should recover first
    expect(state.resolutionScale).toBeGreaterThan(reducedRes);
    // Steps may or may not have recovered yet — but resolution should be ahead
    if (state.resolutionScale < 1.0) {
      expect(state.stepReduction).toBe(reducedSteps);
    }
  });
});

describe("adaptive-complexity: createComplexityState", () => {
  it("creates state at full quality", () => {
    const state = createComplexityState();
    expect(state.resolutionScale).toBe(1.0);
    expect(state.stepReduction).toBe(1.0);
    expect(state.temporalUpscaleActive).toBe(false);
    expect(state.targetFps).toBe(30);
    expect(state._consecutiveUnderBudget).toBe(0);
  });

  it("accepts custom target FPS", () => {
    const state = createComplexityState(60);
    expect(state.targetFps).toBe(60);
  });
});
