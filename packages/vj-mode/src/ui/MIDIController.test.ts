import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMIDIMappings, setMIDIMappings, isMIDIActive } from "./MIDIController";
import type { MIDICCMapping } from "./MIDIController";

describe("MIDIController", () => {
  it("returns default mappings", () => {
    const mappings = getMIDIMappings();
    expect(mappings.length).toBeGreaterThan(0);
    expect(mappings.find((m) => m.cc === 1)?.action).toBe("jamDensity");
    expect(mappings.find((m) => m.cc === 2)?.action).toBe("palettePrimary");
    expect(mappings.find((m) => m.cc === 14)?.action).toBe("nextScene");
    expect(mappings.find((m) => m.cc === 64)?.action).toBe("toggleAutoTransition");
  });

  it("allows custom mappings", () => {
    const custom: MIDICCMapping[] = [
      { cc: 10, action: "jamDensity" },
      { cc: 20, action: "nextScene" },
    ];
    setMIDIMappings(custom);
    const result = getMIDIMappings();
    expect(result).toHaveLength(2);
    expect(result[0].cc).toBe(10);
    expect(result[1].action).toBe("nextScene");
  });

  it("reports MIDI as inactive before init", () => {
    expect(isMIDIActive()).toBe(false);
  });

  it("getMIDIMappings returns a copy (not internal reference)", () => {
    const m1 = getMIDIMappings();
    const m2 = getMIDIMappings();
    expect(m1).not.toBe(m2);
    expect(m1).toEqual(m2);
  });
});
