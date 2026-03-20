import { describe, it, expect } from "vitest";
import { buildWindowsFromSections, markDropoutWindows } from "./overlay-windows";
import type { SectionBoundary } from "./types";

function makeSections(configs: { start: number; end: number; energy: "low" | "mid" | "high" }[]): SectionBoundary[] {
  return configs.map((c, i) => ({
    frameStart: c.start,
    frameEnd: c.end,
    label: `section_${i}`,
    energy: c.energy,
    avgEnergy: c.energy === "high" ? 0.3 : c.energy === "mid" ? 0.15 : 0.05,
  }));
}

describe("buildWindowsFromSections", () => {
  it("creates one window for a short section", () => {
    const sections = makeSections([{ start: 0, end: 500, energy: "mid" }]);
    const windows = buildWindowsFromSections(sections, 1.0);
    expect(windows.length).toBe(1);
    expect(windows[0].frameStart).toBe(0);
    expect(windows[0].frameEnd).toBe(500);
    expect(windows[0].energy).toBe("mid");
  });

  it("creates multiple windows for a long section", () => {
    const sections = makeSections([{ start: 0, end: 5400, energy: "mid" }]);
    const windows = buildWindowsFromSections(sections, 1.0);
    expect(windows.length).toBeGreaterThan(1);
    // Windows should cover full range
    expect(windows[0].frameStart).toBe(0);
    expect(windows[windows.length - 1].frameEnd).toBe(5400);
  });

  it("respects windowDurationScale", () => {
    const sections = makeSections([{ start: 0, end: 5400, energy: "mid" }]);
    const normalWindows = buildWindowsFromSections(sections, 1.0);
    const scaledWindows = buildWindowsFromSections(sections, 2.0);
    // Scaled windows should be fewer (longer duration per window)
    expect(scaledWindows.length).toBeLessThanOrEqual(normalWindows.length);
  });

  it("preserves energy from parent section", () => {
    const sections = makeSections([
      { start: 0, end: 1800, energy: "low" },
      { start: 1800, end: 3600, energy: "high" },
    ]);
    const windows = buildWindowsFromSections(sections, 1.0);
    const lowWindows = windows.filter((w) => w.energy === "low");
    const highWindows = windows.filter((w) => w.energy === "high");
    expect(lowWindows.length).toBeGreaterThan(0);
    expect(highWindows.length).toBeGreaterThan(0);
  });
});

describe("markDropoutWindows", () => {
  it("marks window before energy increase", () => {
    const sections = makeSections([
      { start: 0, end: 1800, energy: "low" },
      { start: 1800, end: 3600, energy: "high" },
    ]);
    const windows = buildWindowsFromSections(sections, 1.0);
    markDropoutWindows(windows);
    const lastLow = windows.filter((w) => w.energy === "low").pop();
    expect(lastLow?.isDropout).toBe(true);
  });

  it("does not mark window before same or lower energy", () => {
    const sections = makeSections([
      { start: 0, end: 1800, energy: "high" },
      { start: 1800, end: 3600, energy: "low" },
    ]);
    const windows = buildWindowsFromSections(sections, 1.0);
    markDropoutWindows(windows);
    const highWindows = windows.filter((w) => w.energy === "high");
    for (const w of highWindows) {
      expect(w.isDropout).toBeFalsy();
    }
  });
});
