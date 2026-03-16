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
});
