import { describe, it, expect } from "vitest";
import {
  SCENE_REGISTRY,
  getComplement,
  getModesForEnergy,
  getRegisteredModes,
} from "./scene-registry";
import type { VisualMode } from "../data/types";

const ALL_MODES: VisualMode[] = [
  "liquid_light", "oil_projector", "concert_lighting", "lo_fi_grain",
  "particle_nebula", "stark_minimal", "tie_dye", "cosmic_dust", "vintage_film",
  "cosmic_voyage", "inferno", "deep_ocean", "aurora", "crystal_cavern",
  "fluid_light", "void_light", "fluid_2d",
  "spectral_analyzer", "particle_swarm", "crystalline_growth", "climax_surge",
];

describe("SCENE_REGISTRY", () => {
  it("has exactly 21 registered modes", () => {
    expect(Object.keys(SCENE_REGISTRY).length).toBe(21);
  });

  it("contains all expected modes", () => {
    for (const mode of ALL_MODES) {
      expect(SCENE_REGISTRY[mode]).toBeDefined();
    }
  });

  it("every entry has Component, energyAffinity, and complement", () => {
    for (const mode of ALL_MODES) {
      const entry = SCENE_REGISTRY[mode];
      expect(entry.Component).toBeDefined();
      expect(["low", "mid", "high", "any"]).toContain(entry.energyAffinity);
      expect(ALL_MODES).toContain(entry.complement);
    }
  });

  it("no mode complements itself", () => {
    for (const mode of ALL_MODES) {
      expect(SCENE_REGISTRY[mode].complement).not.toBe(mode);
    }
  });
});

describe("getComplement", () => {
  it("returns the correct complement for each mode", () => {
    expect(getComplement("liquid_light")).toBe("oil_projector");
    expect(getComplement("oil_projector")).toBe("liquid_light");
    expect(getComplement("concert_lighting")).toBe("lo_fi_grain");
    expect(getComplement("lo_fi_grain")).toBe("concert_lighting");
    expect(getComplement("particle_nebula")).toBe("cosmic_dust");
    expect(getComplement("cosmic_dust")).toBe("particle_nebula");
    expect(getComplement("tie_dye")).toBe("vintage_film");
    expect(getComplement("vintage_film")).toBe("tie_dye");
    expect(getComplement("stark_minimal")).toBe("liquid_light");
    expect(getComplement("cosmic_voyage")).toBe("concert_lighting");
    expect(getComplement("inferno")).toBe("cosmic_voyage");
    expect(getComplement("deep_ocean")).toBe("inferno");
    expect(getComplement("aurora")).toBe("tie_dye");
    expect(getComplement("crystal_cavern")).toBe("inferno");
  });

  it("returns the mode itself for unknown modes", () => {
    expect(getComplement("nonexistent" as VisualMode)).toBe("nonexistent");
  });
});

describe("getModesForEnergy", () => {
  it("returns high-energy modes", () => {
    const modes = getModesForEnergy("high");
    expect(modes).toContain("liquid_light");
    expect(modes).toContain("concert_lighting");
    expect(modes).toContain("tie_dye");
    expect(modes).toContain("inferno");
    expect(modes).not.toContain("particle_nebula"); // low energy
  });

  it("returns mid-energy modes", () => {
    const modes = getModesForEnergy("mid");
    expect(modes).toContain("oil_projector");
    expect(modes).toContain("lo_fi_grain");
    expect(modes).toContain("vintage_film");
    expect(modes).not.toContain("liquid_light"); // high energy
  });

  it("returns low-energy modes", () => {
    const modes = getModesForEnergy("low");
    expect(modes).toContain("particle_nebula");
    expect(modes).toContain("stark_minimal");
    expect(modes).toContain("cosmic_dust");
    expect(modes).toContain("cosmic_voyage");
    expect(modes).toContain("deep_ocean");
    expect(modes).toContain("aurora");
    expect(modes).toContain("crystal_cavern");
    expect(modes).not.toContain("concert_lighting"); // high energy
  });

  it("each energy level has at least 2 modes", () => {
    expect(getModesForEnergy("low").length).toBeGreaterThanOrEqual(2);
    expect(getModesForEnergy("mid").length).toBeGreaterThanOrEqual(2);
    expect(getModesForEnergy("high").length).toBeGreaterThanOrEqual(2);
  });
});

describe("getRegisteredModes", () => {
  it("returns all 21 modes", () => {
    const modes = getRegisteredModes();
    expect(modes.length).toBe(21);
    for (const mode of ALL_MODES) {
      expect(modes).toContain(mode);
    }
  });
});
