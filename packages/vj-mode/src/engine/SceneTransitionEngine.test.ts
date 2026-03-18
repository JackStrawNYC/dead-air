import { describe, it, expect } from "vitest";
import { SceneTransitionEngine } from "./SceneTransitionEngine";

describe("SceneTransitionEngine", () => {
  it("starts with initial scene", () => {
    const engine = new SceneTransitionEngine("liquid_light");
    expect(engine.state.currentScene).toBe("liquid_light");
    expect(engine.state.isTransitioning).toBe(false);
  });

  it("triggers transition to new scene", () => {
    const engine = new SceneTransitionEngine("liquid_light");
    engine.triggerTransition("inferno", 2);

    expect(engine.state.isTransitioning).toBe(true);
    expect(engine.state.nextScene).toBe("inferno");
    expect(engine.state.progress).toBe(0);
  });

  it("completes transition after duration", () => {
    const engine = new SceneTransitionEngine("liquid_light");
    engine.triggerTransition("inferno", 2);

    // Update for 2 seconds total
    engine.update(1.0);
    expect(engine.state.isTransitioning).toBe(true);
    expect(engine.state.progress).toBeCloseTo(0.5);

    engine.update(1.0);
    expect(engine.state.isTransitioning).toBe(false);
    expect(engine.state.currentScene).toBe("inferno");
  });

  it("ignores transition to same scene", () => {
    const engine = new SceneTransitionEngine("liquid_light");
    engine.triggerTransition("liquid_light");
    expect(engine.state.isTransitioning).toBe(false);
  });

  it("setScene changes immediately without transition", () => {
    const engine = new SceneTransitionEngine("liquid_light");
    engine.setScene("aurora");
    expect(engine.state.currentScene).toBe("aurora");
    expect(engine.state.isTransitioning).toBe(false);
  });

  it("handles rapid scene changes (interrupts current transition)", () => {
    const engine = new SceneTransitionEngine("liquid_light");
    engine.triggerTransition("inferno", 2);
    engine.update(0.5); // halfway through

    // Interrupt with new transition
    engine.triggerTransition("aurora", 1);
    expect(engine.state.currentScene).toBe("inferno"); // completed interrupted transition
    expect(engine.state.nextScene).toBe("aurora");
    expect(engine.state.isTransitioning).toBe(true);
  });

  it("beat_synced mode waits for beat then progresses by beat count", () => {
    const engine = new SceneTransitionEngine("liquid_light");
    engine.triggerTransition("inferno", 2, "beat_synced", 4);

    expect(engine.state.isTransitioning).toBe(true);
    expect(engine.state.mode).toBe("beat_synced");

    // No beat yet — should not progress
    engine.update(0.5, 0, false, 120);
    expect(engine.state.progress).toBe(0);

    // First beat — starts transition (beat sync starts, progress still 0)
    engine.update(0.01, 1, true, 120);
    expect(engine.state.progress).toBe(0);

    // Second beat — first actual progress
    engine.update(0.5, 2, true, 120);
    expect(engine.state.progress).toBeCloseTo(0.25); // 1 of 4 beats

    // Third beat
    engine.update(0.5, 3, true, 120);
    expect(engine.state.progress).toBeCloseTo(0.5);

    // Fourth beat
    engine.update(0.5, 4, true, 120);
    expect(engine.state.progress).toBeCloseTo(0.75);

    // Fifth beat — completes
    engine.update(0.5, 5, true, 120);
    expect(engine.state.isTransitioning).toBe(false);
    expect(engine.state.currentScene).toBe("inferno");
  });

  it("beat_pumped mode uses linear progress with beat modulation", () => {
    const engine = new SceneTransitionEngine("liquid_light");
    engine.triggerTransition("aurora", 2, "beat_pumped", 4);

    expect(engine.state.mode).toBe("beat_pumped");

    // Progress linearly
    engine.update(1.0, 0, false, 120);
    expect(engine.state.progress).toBeCloseTo(0.5);

    // Beat pump should add slight boost
    engine.update(0.01, 1, true, 120);
    expect(engine.effectiveProgress).toBeGreaterThan(engine.state.progress);

    // Completes after full duration
    engine.update(1.0, 2, false, 120);
    expect(engine.state.isTransitioning).toBe(false);
    expect(engine.state.currentScene).toBe("aurora");
  });
});
