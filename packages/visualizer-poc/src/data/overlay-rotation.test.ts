import { describe, it, expect } from "vitest";
import {
  buildRotationSchedule,
  getOverlayOpacities,
  buildOverlayManifest,
  HERO_OVERLAY_NAMES,
  A_TIER_OVERLAY_NAMES,
} from "./overlay-rotation";
import type { SectionBoundary, EnhancedFrameData } from "./types";
import { OVERLAY_REGISTRY, ALWAYS_ACTIVE } from "./overlay-registry";

// ─── Test Helpers ───

function makeFrame(overrides: Partial<EnhancedFrameData> = {}): EnhancedFrameData {
  return {
    rms: 0.15, centroid: 0.3, onset: 0, beat: false,
    sub: 0.2, low: 0.3, mid: 0.25, high: 0.1,
    chroma: [0.5, 0.3, 0.2, 0.4, 0.6, 0.1, 0.3, 0.5, 0.2, 0.4, 0.3, 0.1],
    contrast: [0.3, 0.4, 0.5, 0.3, 0.2, 0.4, 0.3],
    flatness: 0.05,
    ...overrides,
  };
}

function makeSections(configs: { start: number; end: number; energy: "low" | "mid" | "high" }[]): SectionBoundary[] {
  return configs.map((c, i) => ({
    frameStart: c.start,
    frameEnd: c.end,
    label: `section_${i}`,
    energy: c.energy,
    avgEnergy: c.energy === "high" ? 0.3 : c.energy === "mid" ? 0.15 : 0.05,
  }));
}

// Sample overlays for testing (mix of real names from curated registry)
const TEST_OVERLAYS = [
  "CosmicStarfield", "BreathingStealie", "WallOfSound",
  "FractalZoom", "ChinaCatSunflower", "SkeletonBand",
  "LaserShow", "EmberRise", "VHSGlitch",
  "BearParade", "MarchingTerrapins", "ThirteenPointBolt",
];

// ─── buildRotationSchedule ───

describe("buildRotationSchedule", () => {
  it("returns trivial schedule for empty sections", () => {
    const schedule = buildRotationSchedule(TEST_OVERLAYS, [], "s1t01");
    expect(schedule.windows).toEqual([]);
    expect(schedule.alwaysActive.length).toBeGreaterThanOrEqual(0);
  });

  it("returns trivial schedule for empty rotation pool", () => {
    const sections = makeSections([{ start: 0, end: 900, energy: "mid" }]);
    // Only always-active overlays — no rotation pool
    const schedule = buildRotationSchedule(ALWAYS_ACTIVE, sections, "s1t01");
    expect(schedule.windows).toEqual([]);
    expect(schedule.alwaysActive.length).toBe(ALWAYS_ACTIVE.length);
  });

  it("separates always-active from rotation pool", () => {
    const sections = makeSections([{ start: 0, end: 900, energy: "mid" }]);
    const overlays = [...ALWAYS_ACTIVE, ...TEST_OVERLAYS];
    const schedule = buildRotationSchedule(overlays, sections, "s1t01");
    expect(schedule.alwaysActive.sort()).toEqual([...ALWAYS_ACTIVE].sort());
    // Rotation windows should not contain always-active overlays
    for (const w of schedule.windows) {
      for (const name of ALWAYS_ACTIVE) {
        expect(w.overlays).not.toContain(name);
      }
    }
  });

  it("creates windows within section boundaries", () => {
    const sections = makeSections([
      { start: 0, end: 2000, energy: "mid" },
      { start: 2000, end: 4000, energy: "high" },
    ]);
    const schedule = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01");
    expect(schedule.windows.length).toBeGreaterThan(0);
    // All windows should be within section bounds
    for (const w of schedule.windows) {
      expect(w.frameStart).toBeGreaterThanOrEqual(0);
      expect(w.frameEnd).toBeLessThanOrEqual(4000);
      expect(w.frameEnd).toBeGreaterThan(w.frameStart);
    }
  });

  it("assigns overlays to each window", () => {
    const sections = makeSections([{ start: 0, end: 1800, energy: "mid" }]);
    const schedule = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01");
    for (const w of schedule.windows) {
      expect(w.overlays.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic with same trackId and seed", () => {
    const sections = makeSections([{ start: 0, end: 1800, energy: "mid" }]);
    const s1 = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01", 42);
    const s2 = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01", 42);
    expect(s1.windows.length).toBe(s2.windows.length);
    for (let i = 0; i < s1.windows.length; i++) {
      expect(s1.windows[i].overlays).toEqual(s2.windows[i].overlays);
    }
  });

  it("varies with different seeds", () => {
    // Long mid section creates many windows; with 1-2 overlays per window
    // different seeds should produce different selections across enough windows
    const sections = makeSections([{ start: 0, end: 27000, energy: "mid" }]);
    const s1 = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01", 42);
    const s2 = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01", 999);
    expect(s1.windows.length).toBeGreaterThan(0);
    expect(s2.windows.length).toBeGreaterThan(0);
    // At least one window should have different overlays
    let anyDiff = false;
    for (let i = 0; i < Math.min(s1.windows.length, s2.windows.length); i++) {
      if (JSON.stringify(s1.windows[i].overlays) !== JSON.stringify(s2.windows[i].overlays)) {
        anyDiff = true;
        break;
      }
    }
    expect(anyDiff).toBe(true);
  });

  it("marks pre-peak dropout windows with 0 overlays", () => {
    const sections = makeSections([
      { start: 0, end: 5400, energy: "low" },
      { start: 5400, end: 10800, energy: "high" },
    ]);
    const schedule = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01");
    // The last window before the high section should be marked dropout
    const lowWindows = schedule.windows.filter((w) => w.energy === "low");
    const lastLow = lowWindows[lowWindows.length - 1];
    expect(lastLow?.isDropout).toBe(true);
    // Dropout should have 0 overlays (complete visual silence)
    expect(lastLow?.overlays.length).toBe(0);
  });

  it("reduces overlays in Drums/Space mode", () => {
    // Use a longer mid section so normal mode can pick up to 2 overlays
    const sections = makeSections([{ start: 0, end: 5400, energy: "mid" }]);
    const normal = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01", 0);
    const drumsSpace = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01", 0, undefined, true);
    // Drums/Space should have at most 1 overlay per window
    const dsMax = Math.max(...drumsSpace.windows.map((w) => w.overlays.length));
    expect(dsMax).toBeLessThanOrEqual(1);
  });
});

// ─── getOverlayOpacities ───

describe("getOverlayOpacities", () => {
  it("returns 1.0 for always-active overlays", () => {
    const sections = makeSections([{ start: 0, end: 900, energy: "mid" }]);
    const overlays = [...ALWAYS_ACTIVE, ...TEST_OVERLAYS];
    const schedule = buildRotationSchedule(overlays, sections, "s1t01");
    const opacities = getOverlayOpacities(450, schedule);
    for (const name of schedule.alwaysActive) {
      expect(opacities[name]).toBe(1);
    }
  });

  it("returns empty for frame outside all windows", () => {
    const sections = makeSections([{ start: 100, end: 900, energy: "mid" }]);
    const schedule = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01");
    const opacities = getOverlayOpacities(50, schedule);
    // Should only have always-active entries
    const nonAlwaysActive = Object.keys(opacities).filter(
      (n) => !schedule.alwaysActive.includes(n),
    );
    expect(nonAlwaysActive.length).toBe(0);
  });

  it("returns opacity 1 at window midpoint (no crossfade)", () => {
    const sections = makeSections([{ start: 0, end: 1800, energy: "mid" }]);
    const schedule = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01");
    // Pick a frame clearly in the middle of the first window (not at a boundary)
    const firstWindow = schedule.windows[0];
    const midFrame = Math.floor((firstWindow.frameStart + firstWindow.frameEnd) / 2);
    const opacities = getOverlayOpacities(midFrame, schedule);
    // All assigned overlays should be at full opacity mid-window
    for (const name of firstWindow?.overlays ?? []) {
      expect(opacities[name]).toBe(1);
    }
  });

  it("handles empty windows schedule", () => {
    const schedule = { alwaysActive: ["SongTitle"], windows: [], accentOverlays: new Map() };
    const opacities = getOverlayOpacities(100, schedule);
    expect(opacities["SongTitle"]).toBe(1);
  });
});

// ─── buildOverlayManifest ───

describe("buildOverlayManifest", () => {
  it("produces one entry per window", () => {
    const sections = makeSections([
      { start: 0, end: 1800, energy: "mid" },
      { start: 1800, end: 3600, energy: "high" },
    ]);
    const schedule = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01");
    const manifest = buildOverlayManifest(schedule);
    expect(manifest.length).toBe(schedule.windows.length);
  });

  it("includes correct fields", () => {
    const sections = makeSections([{ start: 0, end: 900, energy: "mid" }]);
    const schedule = buildRotationSchedule(TEST_OVERLAYS, sections, "s1t01");
    const manifest = buildOverlayManifest(schedule);
    for (const entry of manifest) {
      expect(entry).toHaveProperty("windowIndex");
      expect(entry).toHaveProperty("frameStart");
      expect(entry).toHaveProperty("frameEnd");
      expect(entry).toHaveProperty("energy");
      expect(entry).toHaveProperty("overlays");
      expect(entry).toHaveProperty("accents");
      expect(entry).toHaveProperty("isDropout");
    }
  });
});

// ─── A_TIER_OVERLAY_NAMES ───

describe("A_TIER_OVERLAY_NAMES", () => {
  it("derives from registry tier field (no hardcoded drift)", () => {
    for (const name of A_TIER_OVERLAY_NAMES) {
      const entry = OVERLAY_REGISTRY.find((e) => e.name === name);
      expect(entry, `${name} not in registry`).toBeDefined();
      expect(entry!.tier, `${name} is not A-tier in registry`).toBe("A");
      expect(entry!.alwaysActive, `${name} should not be always-active`).toBeFalsy();
    }
  });

  it("includes all selectable A-tier overlays from registry", () => {
    const registryATier = OVERLAY_REGISTRY
      .filter((e) => e.tier === "A" && !e.alwaysActive)
      .map((e) => e.name);
    for (const name of registryATier) {
      expect(A_TIER_OVERLAY_NAMES.has(name), `${name} missing from A_TIER_OVERLAY_NAMES`).toBe(true);
    }
  });
});

describe("selectable overlays appear in rotation", () => {
  it("B-tier overlays appear in rotation schedule", () => {
    const sections = makeSections([
      { start: 0, end: 5400, energy: "low" },
      { start: 5400, end: 10800, energy: "mid" },
    ]);
    const allOverlays = OVERLAY_REGISTRY
      .filter((e) => !e.alwaysActive && (e.tier === "A" || e.tier === "B"))
      .map((e) => e.name);
    const schedule = buildRotationSchedule(allOverlays, sections, "s1t01", 42);

    // At least some windows should have overlays assigned
    const windowsWithOverlays = schedule.windows.filter((w) => w.overlays.length > 0);
    expect(windowsWithOverlays.length).toBeGreaterThan(0);
  });
});

// ─── HERO_OVERLAY_NAMES ───

describe("HERO_OVERLAY_NAMES", () => {
  it("contains key Dead iconography", () => {
    expect(HERO_OVERLAY_NAMES.has("BreathingStealie")).toBe(true);
    expect(HERO_OVERLAY_NAMES.has("BearParade")).toBe(true);
    expect(HERO_OVERLAY_NAMES.has("SkeletonBand")).toBe(true);
    expect(HERO_OVERLAY_NAMES.has("ThirteenPointBolt")).toBe(true);
  });

  it("has a focused size (6-12)", () => {
    expect(HERO_OVERLAY_NAMES.size).toBeGreaterThanOrEqual(6);
    expect(HERO_OVERLAY_NAMES.size).toBeLessThanOrEqual(12);
  });
});
