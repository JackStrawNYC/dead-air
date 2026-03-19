import { describe, it, expect } from "vitest";
import { detectSuite } from "./suite-detector";

describe("detectSuite", () => {
  it("detects Scarlet > Fire suite", () => {
    const setlist = ["Bertha", "Scarlet Begonias", "Fire on the Mountain", "Estimated Prophet"];
    const scarlet = detectSuite(setlist, 1);
    expect(scarlet.inSuite).toBe(true);
    expect(scarlet.suitePosition).toBe(0);
    expect(scarlet.suiteTotalSongs).toBe(2);
    expect(scarlet.isSuiteStart).toBe(true);
    expect(scarlet.isSuiteEnd).toBe(false);

    const fire = detectSuite(setlist, 2);
    expect(fire.inSuite).toBe(true);
    expect(fire.suitePosition).toBe(1);
    expect(fire.isSuiteEnd).toBe(true);
    expect(fire.suiteProgress).toBe(1);
  });

  it("detects Help > Slipknot > Franklin's 3-song suite", () => {
    const setlist = ["Help on the Way", "Slipknot!", "Franklin's Tower", "Music Never Stopped"];
    const help = detectSuite(setlist, 0);
    expect(help.inSuite).toBe(true);
    expect(help.suiteTotalSongs).toBe(3);
    expect(help.suitePosition).toBe(0);
    expect(help.isSuiteStart).toBe(true);

    const slip = detectSuite(setlist, 1);
    expect(slip.inSuite).toBe(true);
    expect(slip.suitePosition).toBe(1);
    expect(slip.suiteProgress).toBeCloseTo(0.5);

    const franklins = detectSuite(setlist, 2);
    expect(franklins.inSuite).toBe(true);
    expect(franklins.suitePosition).toBe(2);
    expect(franklins.isSuiteEnd).toBe(true);
  });

  it("detects China Cat > Rider suite", () => {
    const setlist = ["China Cat Sunflower", "I Know You Rider"];
    const china = detectSuite(setlist, 0);
    expect(china.inSuite).toBe(true);
    expect(china.suiteId).toBe("china cat sunflower");
    expect(china.suiteTotalSongs).toBe(2);
  });

  it("returns no suite for standalone songs", () => {
    const setlist = ["Bertha", "Jack Straw", "Tennessee Jed"];
    expect(detectSuite(setlist, 0).inSuite).toBe(false);
    expect(detectSuite(setlist, 1).inSuite).toBe(false);
  });

  it("returns no suite when chain is broken", () => {
    // Scarlet followed by something other than Fire
    const setlist = ["Scarlet Begonias", "Estimated Prophet"];
    expect(detectSuite(setlist, 0).inSuite).toBe(false);
  });

  it("handles out of bounds index", () => {
    const setlist = ["Bertha"];
    expect(detectSuite(setlist, -1).inSuite).toBe(false);
    expect(detectSuite(setlist, 5).inSuite).toBe(false);
  });

  it("handles empty setlist", () => {
    expect(detectSuite([], 0).inSuite).toBe(false);
  });

  it("suiteId is based on the first song in the chain", () => {
    const setlist = ["Scarlet Begonias", "Fire on the Mountain"];
    const fire = detectSuite(setlist, 1);
    expect(fire.suiteId).toBe("scarlet begonias");
  });

  it("detects Drums > Space suite", () => {
    const setlist = ["Playing in the Band", "Drums", "Space", "Morning Dew"];
    const drums = detectSuite(setlist, 1);
    expect(drums.inSuite).toBe(true);
    expect(drums.suiteTotalSongs).toBe(2);
  });
});
