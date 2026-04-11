/**
 * Tests for semantic-router.ts — CLAP semantic score → visual routing.
 */

import { describe, it, expect } from "vitest";
import { computeSemanticProfile, extractSemanticScores } from "./semantic-router";

describe("computeSemanticProfile", () => {
  it("returns neutral profile for all-zero scores", () => {
    const result = computeSemanticProfile({});
    expect(result.dominant).toBeNull();
    expect(result.dominantConfidence).toBe(0);
    expect(result.preferredShaders).toEqual([]);
    expect(result.motionIntensity).toBe(1);
  });

  it("identifies dominant category correctly", () => {
    const result = computeSemanticProfile({
      psychedelic: 0.8,
      aggressive: 0.2,
      tender: 0.1,
      cosmic: 0.3,
    });
    expect(result.dominant).toBe("psychedelic");
    expect(result.dominantConfidence).toBe(0.8);
  });

  it("routes psychedelic to cosmic/protean shaders", () => {
    const result = computeSemanticProfile({ psychedelic: 0.9 });
    expect(result.preferredShaders).toContain("cosmic_voyage");
    expect(result.preferredShaders).toContain("protean_clouds");
    expect(result.preferredShaders).toContain("deep_ocean");
  });

  it("routes aggressive to high-energy shaders", () => {
    const result = computeSemanticProfile({ aggressive: 0.85 });
    expect(result.preferredShaders).toContain("inferno");
    expect(result.preferredShaders).toContain("protean_clouds");
  });

  it("routes tender to warm/organic shaders", () => {
    const result = computeSemanticProfile({ tender: 0.9 });
    expect(result.preferredShaders).toContain("aurora");
    expect(result.preferredShaders).toContain("protean_clouds");
    expect(result.motionIntensity).toBeLessThan(1);
  });

  it("routes cosmic to space shaders", () => {
    const result = computeSemanticProfile({ cosmic: 0.7 });
    expect(result.preferredShaders).toContain("cosmic_voyage");
    expect(result.preferredShaders).toContain("cosmic_dust");
    expect(result.colorTemperature).toBeLessThan(0); // cool
  });

  it("blends secondary categories into preferences", () => {
    const result = computeSemanticProfile({
      psychedelic: 0.7,
      cosmic: 0.5, // secondary, above 0.3 threshold
    });
    // Should have both psychedelic AND cosmic shaders
    expect(result.preferredShaders).toContain("protean_clouds"); // psychedelic
    expect(result.preferredShaders).toContain("cosmic_voyage"); // cosmic (also in psychedelic)
  });

  it("computes overlay biases weighted by score", () => {
    const result = computeSemanticProfile({ aggressive: 0.8 });
    expect(result.overlayBiases["reactive"]).toBeGreaterThan(0);
    expect(result.overlayBiases["distortion"]).toBeGreaterThan(0);
  });

  it("adjusts motion intensity by category", () => {
    const aggressive = computeSemanticProfile({ aggressive: 0.9 });
    const ambient = computeSemanticProfile({ ambient: 0.9 });
    expect(aggressive.motionIntensity).toBeGreaterThan(ambient.motionIntensity);
  });

  it("clamps color temperature to [-1, 1]", () => {
    const result = computeSemanticProfile({ aggressive: 1.0 });
    expect(result.colorTemperature).toBeGreaterThanOrEqual(-1);
    expect(result.colorTemperature).toBeLessThanOrEqual(1);
  });
});

describe("extractSemanticScores", () => {
  it("returns null when no semantic data present", () => {
    expect(extractSemanticScores({})).toBeNull();
  });

  it("returns null when all scores are zero", () => {
    expect(extractSemanticScores({
      semanticPsychedelic: 0,
      semanticAggressive: 0,
    })).toBeNull();
  });

  it("extracts scores when data is present", () => {
    const result = extractSemanticScores({
      semanticPsychedelic: 0.8,
      semanticCosmic: 0.3,
    });
    expect(result).not.toBeNull();
    expect(result!.psychedelic).toBe(0.8);
    expect(result!.cosmic).toBe(0.3);
    expect(result!.aggressive).toBe(0);
  });
});
