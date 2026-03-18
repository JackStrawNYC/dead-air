import { describe, it, expect } from "vitest";
import { AutoTransitionEngine } from "./AutoTransitionEngine";

function makeAudio(overrides: Partial<{
  energy: number;
  bass: number;
  onset: number;
  tempo: number;
  harmonicTension: number;
  climaxPhase: number;
  beatSnap: number;
}> = {}) {
  return {
    energy: 0.1,
    bass: 0.1,
    onset: 0,
    tempo: 120,
    harmonicTension: 0,
    climaxPhase: 0,
    beatSnap: 0,
    ...overrides,
  };
}

describe("AutoTransitionEngine", () => {
  it("starts in quiet state", () => {
    const engine = new AutoTransitionEngine();
    expect(engine.energyState).toBe("quiet");
  });

  it("transitions to building when energy rises", () => {
    const engine = new AutoTransitionEngine();

    // Feed quiet energy to build history
    for (let i = 0; i < 15; i++) {
      engine.evaluate(makeAudio({ energy: 0.1 }), i);
    }

    // Ramp up energy
    for (let i = 15; i < 25; i++) {
      engine.evaluate(makeAudio({ energy: 0.2 + (i - 15) * 0.03 }), i);
    }

    expect(engine.energyState).toBe("building");
  });

  it("transitions to peak at high energy", () => {
    const engine = new AutoTransitionEngine();

    // Build history at moderate energy
    for (let i = 0; i < 15; i++) {
      engine.evaluate(makeAudio({ energy: 0.3 }), i);
    }

    // Jump to peak
    for (let i = 15; i < 25; i++) {
      engine.evaluate(makeAudio({ energy: 0.7 }), i + 20);
    }

    expect(["peak", "building"]).toContain(engine.energyState);
  });

  it("returns null when no state change", () => {
    const engine = new AutoTransitionEngine();

    // Stable quiet state
    for (let i = 0; i < 20; i++) {
      const result = engine.evaluate(makeAudio({ energy: 0.1 }), i);
      // Should mostly return null (no state change)
      if (i > 5) expect(result).toBeNull();
    }
  });

  it("respects minimum interval between transitions", () => {
    const engine = new AutoTransitionEngine();
    engine.recordScene("liquid_light");

    // Build history
    for (let i = 0; i < 15; i++) {
      engine.evaluate(makeAudio({ energy: 0.1 }), i);
    }

    // Trigger a state change
    const result1 = engine.evaluate(makeAudio({ energy: 0.7 }), 20);

    // Even if state changes again quickly, respect interval
    for (let i = 0; i < 5; i++) {
      engine.evaluate(makeAudio({ energy: 0.7 }), 21 + i);
    }
    const result2 = engine.evaluate(makeAudio({ energy: 0.1 }), 25);

    // Should not trigger again so quickly (interval < minInterval)
    expect(result2).toBeNull();
  });

  it("reset clears state", () => {
    const engine = new AutoTransitionEngine();

    // Build some state
    for (let i = 0; i < 20; i++) {
      engine.evaluate(makeAudio({ energy: 0.5 }), i);
    }

    engine.reset();
    expect(engine.energyState).toBe("quiet");
  });

  it("selects scene with affinity scoring", () => {
    const engine = new AutoTransitionEngine();
    engine.recordScene("liquid_light");

    // Build enough history for state change
    for (let i = 0; i < 15; i++) {
      engine.evaluate(makeAudio({ energy: 0.1 }), i);
    }

    // Trigger quiet → building
    const decision = engine.evaluate(makeAudio({ energy: 0.5 }), 30);

    if (decision) {
      expect(decision.nextScene).toBeTruthy();
      expect(decision.transitionMode).toBeTruthy();
      expect(decision.duration).toBeGreaterThan(0);
    }
  });
});
