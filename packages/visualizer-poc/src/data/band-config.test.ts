import { describe, it, expect } from "vitest";
import { BAND_CONFIG, getEra, isSacredSegue, getSeededLyric, getSeededQuote } from "./band-config";

describe("BAND_CONFIG", () => {
  it("has a band name", () => {
    expect(BAND_CONFIG.bandName).toBeTruthy();
  });

  it("has at least one era", () => {
    expect(BAND_CONFIG.eras.length).toBeGreaterThan(0);
  });

  it("has lyrics", () => {
    expect(BAND_CONFIG.lyrics.length).toBeGreaterThan(0);
  });

  it("has quotes with attributions", () => {
    expect(BAND_CONFIG.quotes.length).toBeGreaterThan(0);
    for (const q of BAND_CONFIG.quotes) {
      expect(q.text).toBeTruthy();
      expect(q.attribution).toBeTruthy();
    }
  });

  it("has sacred segues", () => {
    expect(BAND_CONFIG.sacredSegues.length).toBeGreaterThan(0);
    for (const pair of BAND_CONFIG.sacredSegues) {
      expect(pair.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("getEra", () => {
  it("returns era by ID", () => {
    const era = getEra("classic");
    expect(era).toBeDefined();
    expect(era!.id).toBe("classic");
  });

  it("returns undefined for unknown era", () => {
    expect(getEra("nonexistent")).toBeUndefined();
  });
});

describe("isSacredSegue", () => {
  it("detects known segue pairs", () => {
    expect(isSacredSegue("Scarlet Begonias", "Fire on the Mountain")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSacredSegue("scarlet begonias", "fire on the mountain")).toBe(true);
  });

  it("rejects non-segue pairs", () => {
    expect(isSacredSegue("Truckin'", "Sugar Magnolia")).toBe(false);
  });

  it("is directional (A→B not B→A)", () => {
    expect(isSacredSegue("Fire on the Mountain", "Scarlet Begonias")).toBe(false);
  });
});

describe("getSeededLyric", () => {
  it("returns a string", () => {
    expect(typeof getSeededLyric(42)).toBe("string");
  });

  it("is deterministic", () => {
    expect(getSeededLyric(42)).toBe(getSeededLyric(42));
  });

  it("returns different lyrics for different seeds", () => {
    const lyrics = new Set(Array.from({ length: 10 }, (_, i) => getSeededLyric(i)));
    expect(lyrics.size).toBeGreaterThan(1);
  });
});

describe("getSeededQuote", () => {
  it("returns a quote object", () => {
    const q = getSeededQuote(42);
    expect(q.text).toBeTruthy();
    expect(q.attribution).toBeTruthy();
  });

  it("is deterministic", () => {
    const a = getSeededQuote(42);
    const b = getSeededQuote(42);
    expect(a.text).toBe(b.text);
  });
});
