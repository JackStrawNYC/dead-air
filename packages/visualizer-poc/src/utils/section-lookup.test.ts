import { describe, it, expect } from "vitest";
import { findCurrentSection } from "./section-lookup";
import type { SectionBoundary } from "../data/types";

function makeSection(start: number, end: number, energy: "low" | "mid" | "high" = "mid"): SectionBoundary {
  return { frameStart: start, frameEnd: end, label: `section`, energy, avgEnergy: 0.15 };
}

describe("findCurrentSection", () => {
  it("returns defaults for empty sections", () => {
    const result = findCurrentSection([], 100);
    expect(result.sectionIndex).toBe(0);
    expect(result.section).toBeNull();
    expect(result.sectionProgress).toBe(0);
  });

  it("finds section at start", () => {
    const sections = [makeSection(0, 100), makeSection(100, 200)];
    const result = findCurrentSection(sections, 0);
    expect(result.sectionIndex).toBe(0);
    expect(result.sectionProgress).toBeCloseTo(0, 3);
  });

  it("finds section at midpoint", () => {
    const sections = [makeSection(0, 100), makeSection(100, 200)];
    const result = findCurrentSection(sections, 50);
    expect(result.sectionIndex).toBe(0);
    expect(result.sectionProgress).toBeCloseTo(0.5, 3);
  });

  it("finds second section", () => {
    const sections = [makeSection(0, 100), makeSection(100, 200)];
    const result = findCurrentSection(sections, 150);
    expect(result.sectionIndex).toBe(1);
    expect(result.sectionProgress).toBeCloseTo(0.5, 3);
  });

  it("clamps before first section", () => {
    const sections = [makeSection(50, 100), makeSection(100, 200)];
    const result = findCurrentSection(sections, 10);
    expect(result.sectionIndex).toBe(0);
    expect(result.sectionProgress).toBe(0);
  });

  it("clamps after last section", () => {
    const sections = [makeSection(0, 100), makeSection(100, 200)];
    const result = findCurrentSection(sections, 300);
    expect(result.sectionIndex).toBe(1);
    expect(result.sectionProgress).toBe(1);
  });

  it("handles single section", () => {
    const sections = [makeSection(0, 1000)];
    const result = findCurrentSection(sections, 500);
    expect(result.sectionIndex).toBe(0);
    expect(result.sectionProgress).toBeCloseTo(0.5, 3);
  });

  it("handles many sections (binary search correctness)", () => {
    const sections = Array.from({ length: 100 }, (_, i) =>
      makeSection(i * 100, (i + 1) * 100),
    );
    const result = findCurrentSection(sections, 5050);
    expect(result.sectionIndex).toBe(50);
    expect(result.sectionProgress).toBeCloseTo(0.5, 3);
  });

  it("returns section boundary at exact boundary", () => {
    const sections = [makeSection(0, 100), makeSection(100, 200)];
    // frameEnd is exclusive, so frame 100 is in the second section
    const result = findCurrentSection(sections, 100);
    expect(result.sectionIndex).toBe(1);
    expect(result.sectionProgress).toBeCloseTo(0, 3);
  });

  it("handles gap between sections", () => {
    const sections = [makeSection(0, 100), makeSection(200, 300)];
    // Frame 150 is in the gap
    const result = findCurrentSection(sections, 150);
    // Should return a reasonable fallback
    expect(result.sectionIndex).toBeGreaterThanOrEqual(0);
    expect(result.sectionIndex).toBeLessThan(sections.length);
  });
});
