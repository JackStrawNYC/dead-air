import { describe, it, expect } from "vitest";
import {
  getSegueKnowledge,
  getSegueSignificance,
  getPeakMoments,
  getShowRole,
  getAllSegues,
  getAllPeakMoments,
  SHOW_STRUCTURE,
} from "./dead-knowledge-graph";

// ─── Segue Knowledge ───

describe("getSegueKnowledge", () => {
  it("returns knowledge for Scarlet → Fire (the most iconic segue)", () => {
    const segue = getSegueKnowledge("Scarlet Begonias", "Fire on the Mountain");
    expect(segue).toBeDefined();
    expect(segue!.significance).toBe(1.0);
    expect(segue!.treatment).toBe("explosive");
  });

  it("returns knowledge for China Cat → Rider", () => {
    const segue = getSegueKnowledge(
      "China Cat Sunflower",
      "I Know You Rider",
    );
    expect(segue).toBeDefined();
    expect(segue!.significance).toBe(1.0);
    expect(segue!.treatment).toBe("seamless");
  });

  it("returns knowledge for Help → Slipknot", () => {
    const segue = getSegueKnowledge("Help on the Way", "Slipknot!");
    expect(segue).toBeDefined();
    expect(segue!.significance).toBe(0.95);
    expect(segue!.treatment).toBe("building");
  });

  it("returns knowledge for Slipknot → Franklin's Tower", () => {
    const segue = getSegueKnowledge("Slipknot!", "Franklin's Tower");
    expect(segue).toBeDefined();
    expect(segue!.significance).toBe(0.95);
    expect(segue!.treatment).toBe("explosive");
  });

  it("returns knowledge for Dark Star → St. Stephen", () => {
    const segue = getSegueKnowledge("Dark Star", "St. Stephen");
    expect(segue).toBeDefined();
    expect(segue!.significance).toBe(0.9);
    expect(segue!.treatment).toBe("dramatic");
  });

  it("does NOT match reverse direction (Fire → Scarlet)", () => {
    const segue = getSegueKnowledge(
      "Fire on the Mountain",
      "Scarlet Begonias",
    );
    expect(segue).toBeUndefined();
  });

  it("returns undefined for unknown pairs", () => {
    const segue = getSegueKnowledge("Truckin'", "Sugar Magnolia");
    expect(segue).toBeUndefined();
  });

  it("handles case insensitivity", () => {
    const segue = getSegueKnowledge("SCARLET BEGONIAS", "fire on the mountain");
    expect(segue).toBeDefined();
    expect(segue!.significance).toBe(1.0);
  });

  it("handles titles with extra punctuation", () => {
    const segue = getSegueKnowledge("Scarlet Begonias!", "Fire on the Mountain.");
    expect(segue).toBeDefined();
  });

  it("returns knowledge for Estimated → Eyes", () => {
    const segue = getSegueKnowledge("Estimated Prophet", "Eyes of the World");
    expect(segue).toBeDefined();
    expect(segue!.significance).toBe(0.85);
    expect(segue!.treatment).toBe("building");
  });

  it("returns knowledge for Sugar Magnolia → Sunshine Daydream", () => {
    const segue = getSegueKnowledge("Sugar Magnolia", "Sunshine Daydream");
    expect(segue).toBeDefined();
    expect(segue!.significance).toBe(0.9);
    expect(segue!.treatment).toBe("explosive");
  });
});

describe("getSegueSignificance", () => {
  it("returns 1.0 for Scarlet → Fire", () => {
    expect(
      getSegueSignificance("Scarlet Begonias", "Fire on the Mountain"),
    ).toBe(1.0);
  });

  it("returns 0 for unknown pairs", () => {
    expect(getSegueSignificance("Casey Jones", "Bertha")).toBe(0);
  });

  it("returns 0 for reversed iconic pairs", () => {
    expect(
      getSegueSignificance("Fire on the Mountain", "Scarlet Begonias"),
    ).toBe(0);
  });

  it("returns correct significance for mid-tier pairs", () => {
    expect(getSegueSignificance("He's Gone", "Truckin'")).toBe(0.75);
  });
});

// ─── Peak Moments ───

describe("getPeakMoments", () => {
  it("returns peak moments for Dark Star", () => {
    const peaks = getPeakMoments("Dark Star");
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    // Should include a jam_peak
    expect(peaks.some((p) => p.type === "jam_peak")).toBe(true);
    // Should include a quiet_beauty
    expect(peaks.some((p) => p.type === "quiet_beauty")).toBe(true);
  });

  it("returns peaks sorted by typicalProgress", () => {
    const peaks = getPeakMoments("Dark Star");
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i].typicalProgress).toBeGreaterThanOrEqual(
        peaks[i - 1].typicalProgress,
      );
    }
  });

  it("returns Morning Dew crowd eruption near the end", () => {
    const peaks = getPeakMoments("Morning Dew");
    expect(peaks.length).toBeGreaterThanOrEqual(1);
    const crowdPeak = peaks.find((p) => p.type === "crowd_eruption");
    expect(crowdPeak).toBeDefined();
    expect(crowdPeak!.typicalProgress).toBeGreaterThanOrEqual(0.7);
    expect(crowdPeak!.significance).toBe(1.0);
  });

  it("returns Wharf Rat vocal climax", () => {
    const peaks = getPeakMoments("Wharf Rat");
    expect(peaks.length).toBeGreaterThanOrEqual(1);
    expect(peaks.some((p) => p.type === "vocal_climax")).toBe(true);
  });

  it("returns empty array for unknown songs", () => {
    const peaks = getPeakMoments("Some Random Song That Doesn't Exist");
    expect(peaks).toEqual([]);
  });

  it("handles case insensitivity", () => {
    const peaks = getPeakMoments("DARK STAR");
    expect(peaks.length).toBeGreaterThanOrEqual(2);
  });

  it("returns St. Stephen band eruption", () => {
    const peaks = getPeakMoments("St. Stephen");
    expect(peaks.length).toBeGreaterThanOrEqual(1);
    const eruption = peaks.find((p) => p.type === "band_eruption");
    expect(eruption).toBeDefined();
    expect(eruption!.typicalProgress).toBeCloseTo(0.7, 1);
  });

  it("returns Eyes of the World with both beauty and jam peak", () => {
    const peaks = getPeakMoments("Eyes of the World");
    expect(peaks.some((p) => p.type === "quiet_beauty")).toBe(true);
    expect(peaks.some((p) => p.type === "jam_peak")).toBe(true);
  });

  it("returns Brokedown Palace vocal climax", () => {
    const peaks = getPeakMoments("Brokedown Palace");
    const vocal = peaks.find((p) => p.type === "vocal_climax");
    expect(vocal).toBeDefined();
    expect(vocal!.significance).toBeGreaterThanOrEqual(0.9);
  });
});

// ─── Show Role ───

describe("getShowRole", () => {
  it("classifies Jack Straw as set1_opener", () => {
    expect(getShowRole("Jack Straw")).toBe("set1_opener");
  });

  it("classifies Bertha as set1_opener", () => {
    expect(getShowRole("Bertha")).toBe("set1_opener");
  });

  it("classifies Dark Star as deep_jam (highest priority)", () => {
    // Dark Star appears in deepJamSignals, which takes priority
    expect(getShowRole("Dark Star")).toBe("deep_jam");
  });

  it("classifies Playing in the Band as deep_jam over set2_opener", () => {
    // PITB is both a set2 opener and a deep jam signal — deep_jam wins
    expect(getShowRole("Playing in the Band")).toBe("deep_jam");
  });

  it("classifies Brokedown Palace as encore_closer", () => {
    expect(getShowRole("Brokedown Palace")).toBe("encore_closer");
  });

  it("classifies Johnny B. Goode as encore_closer", () => {
    expect(getShowRole("Johnny B. Goode")).toBe("encore_closer");
  });

  it("classifies Samson and Delilah as set2_opener", () => {
    expect(getShowRole("Samson and Delilah")).toBe("set2_opener");
  });

  it("returns undefined for songs with no known role", () => {
    expect(getShowRole("Loose Lucy")).toBeUndefined();
  });

  it("handles case insensitivity", () => {
    expect(getShowRole("JACK STRAW")).toBe("set1_opener");
  });

  it("handles punctuation in titles", () => {
    expect(getShowRole("Truckin'")).toBe("set2_opener");
  });
});

// ─── Data Integrity ───

describe("data integrity", () => {
  it("has at least 20 segue pairs", () => {
    expect(getAllSegues().length).toBeGreaterThanOrEqual(20);
  });

  it("has at least 15 peak moments", () => {
    expect(getAllPeakMoments().length).toBeGreaterThanOrEqual(15);
  });

  it("all segues have significance between 0 and 1", () => {
    for (const segue of getAllSegues()) {
      expect(segue.significance).toBeGreaterThanOrEqual(0);
      expect(segue.significance).toBeLessThanOrEqual(1);
    }
  });

  it("all peak moments have typicalProgress between 0 and 1", () => {
    for (const peak of getAllPeakMoments()) {
      expect(peak.typicalProgress).toBeGreaterThanOrEqual(0);
      expect(peak.typicalProgress).toBeLessThanOrEqual(1);
    }
  });

  it("all segues have non-empty descriptions", () => {
    for (const segue of getAllSegues()) {
      expect(segue.description.length).toBeGreaterThan(0);
    }
  });

  it("all peak moments have non-empty descriptions", () => {
    for (const peak of getAllPeakMoments()) {
      expect(peak.description.length).toBeGreaterThan(0);
    }
  });

  it("show structure has entries in all categories", () => {
    expect(SHOW_STRUCTURE.set1Openers.length).toBeGreaterThan(0);
    expect(SHOW_STRUCTURE.set2Openers.length).toBeGreaterThan(0);
    expect(SHOW_STRUCTURE.deepJamSignals.length).toBeGreaterThan(0);
    expect(SHOW_STRUCTURE.encoreClosers.length).toBeGreaterThan(0);
  });

  it("no duplicate segue pairs", () => {
    const keys = new Set<string>();
    for (const segue of getAllSegues()) {
      const key = `${segue.from}→${segue.to}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });
});
