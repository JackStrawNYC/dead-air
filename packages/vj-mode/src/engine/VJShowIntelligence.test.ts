import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VJShowIntelligence } from "./VJShowIntelligence";

describe("VJShowIntelligence", () => {
  let intel: VJShowIntelligence;

  beforeEach(() => {
    vi.useFakeTimers();
    intel = new VJShowIntelligence();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("show phase", () => {
    it("starts in opening phase", () => {
      expect(intel.getShowPhase()).toBe("opening");
    });

    it("transitions to building after 10 minutes", () => {
      vi.advanceTimersByTime(11 * 60 * 1000);
      expect(intel.getShowPhase()).toBe("building");
    });

    it("transitions to peak after 40 minutes", () => {
      vi.advanceTimersByTime(41 * 60 * 1000);
      expect(intel.getShowPhase()).toBe("peak");
    });

    it("transitions to wind_down after 80 minutes", () => {
      vi.advanceTimersByTime(81 * 60 * 1000);
      expect(intel.getShowPhase()).toBe("wind_down");
    });
  });

  describe("scene usage tracking", () => {
    it("records scene usage", () => {
      intel.recordSceneUsage("liquid_light");
      intel.recordSceneUsage("liquid_light");
      intel.recordSceneUsage("aurora");

      const underused = intel.getUnderusedScenes(["liquid_light", "aurora", "inferno"]);
      expect(underused).toContain("aurora");
      expect(underused).toContain("inferno");
      expect(underused).not.toContain("liquid_light");
    });

    it("returns all scenes when nothing has been used", () => {
      const available = ["liquid_light", "aurora", "inferno"] as const;
      const underused = intel.getUnderusedScenes([...available]);
      expect(underused.length).toBe(3);
    });
  });

  describe("scene scoring", () => {
    it("gives positive score to phase-appropriate scenes", () => {
      // Opening phase prefers mid/low energy
      const score = intel.getSceneScore("oil_projector"); // mid energy
      expect(score).toBeGreaterThan(0);
    });

    it("penalizes overused scenes", () => {
      // Use liquid_light many times
      for (let i = 0; i < 10; i++) {
        intel.recordSceneUsage("liquid_light");
      }
      // Record one usage of another scene so avg is lower
      intel.recordSceneUsage("aurora");

      const score = intel.getSceneScore("liquid_light");
      // Should be penalized for overuse
      expect(score).toBeLessThan(intel.getSceneScore("aurora"));
    });

    it("returns score in -2 to +3 range", () => {
      const score = intel.getSceneScore("inferno");
      expect(score).toBeGreaterThanOrEqual(-2);
      expect(score).toBeLessThanOrEqual(3);
    });

    it("returns 0 for unknown scenes", () => {
      const score = intel.getSceneScore("nonexistent" as any);
      expect(score).toBe(0);
    });
  });

  describe("reset", () => {
    it("clears all tracking data", () => {
      intel.recordSceneUsage("liquid_light");
      intel.recordSceneUsage("inferno");

      intel.reset();

      const underused = intel.getUnderusedScenes(["liquid_light", "inferno"]);
      expect(underused.length).toBe(2); // all unused again
    });
  });
});
