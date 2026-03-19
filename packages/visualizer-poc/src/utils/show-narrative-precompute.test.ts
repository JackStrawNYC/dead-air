import { describe, it, expect } from "vitest";
import {
  precomputeNarrativeStates,
  computeShowPhase,
  type NarrativeSongInput,
  type NarrativeFrameData,
} from "./show-narrative-precompute";
import type { VisualMode } from "../data/types";

// ─── Helpers ───

function makeSong(trackId: string, title: string, set = 1): NarrativeSongInput {
  return { trackId, title, set };
}

function makeFrames(count: number, rms: number, flatness = 0.3): NarrativeFrameData[] {
  return Array.from({ length: count }, () => ({ rms, flatness }));
}

const noopResolveMode = () => "liquid_light" as VisualMode;
const noopIsJam = () => false;
const noopLoadFrames = () => null;

// ─── computeShowPhase ───

describe("computeShowPhase", () => {
  it("returns 'opening' for first songs", () => {
    expect(computeShowPhase(0, 20)).toBe("opening");
    expect(computeShowPhase(1, 20)).toBe("opening");
  });

  it("returns 'deepening' for early-mid show", () => {
    expect(computeShowPhase(3, 20)).toBe("deepening");
    expect(computeShowPhase(5, 20)).toBe("deepening");
  });

  it("returns 'peak_show' for mid-late show", () => {
    expect(computeShowPhase(12, 20)).toBe("peak_show");
    expect(computeShowPhase(15, 20)).toBe("peak_show");
  });

  it("returns 'closing' for last songs", () => {
    expect(computeShowPhase(18, 20)).toBe("closing");
    expect(computeShowPhase(19, 20)).toBe("closing");
  });

  it("handles edge cases", () => {
    expect(computeShowPhase(0, 0)).toBe("opening");
    expect(computeShowPhase(0, 1)).toBe("opening");
    // 3-song show: midpoint=1, songsCompleted=1 ≤ 1 → "opening"
    expect(computeShowPhase(1, 3)).toBe("opening");
    // 3-song show: songsCompleted=2, totalSongs-2=1 → "closing"
    expect(computeShowPhase(2, 3)).toBe("closing");
  });
});

// ─── precomputeNarrativeStates ───

describe("precomputeNarrativeStates", () => {
  it("returns one state per song", () => {
    const songs = [makeSong("s1t01", "Bertha"), makeSong("s1t02", "Scarlet")];
    const states = precomputeNarrativeStates(songs, noopLoadFrames, noopResolveMode, noopIsJam);
    expect(states).toHaveLength(2);
  });

  it("first song has zero completed songs", () => {
    const songs = [makeSong("s1t01", "Bertha")];
    const states = precomputeNarrativeStates(songs, noopLoadFrames, noopResolveMode, noopIsJam);
    expect(states[0].songsCompleted).toBe(0);
    expect(states[0].songPeakEnergies).toEqual([]);
    expect(states[0].showEnergyBaseline).toBe(0);
    expect(states[0].showPhase).toBe("opening");
  });

  it("accumulates peak energies from analysis frames", () => {
    const songs = [
      makeSong("s1t01", "Bertha"),
      makeSong("s1t02", "Scarlet"),
      makeSong("s1t03", "Fire"),
    ];

    const frameStore: Record<string, NarrativeFrameData[]> = {
      s1t01: makeFrames(100, 0.20),
      s1t02: makeFrames(100, 0.35),
    };

    const states = precomputeNarrativeStates(
      songs,
      (trackId) => frameStore[trackId] ?? null,
      noopResolveMode,
      noopIsJam,
    );

    // Song 0: no previous data
    expect(states[0].songPeakEnergies).toEqual([]);

    // Song 1: has song 0's peak (0.20)
    expect(states[1].songsCompleted).toBe(1);
    expect(states[1].songPeakEnergies).toEqual([0.20]);
    expect(states[1].showEnergyBaseline).toBeCloseTo(0.20);

    // Song 2: has songs 0+1 peaks
    expect(states[2].songsCompleted).toBe(2);
    expect(states[2].songPeakEnergies).toEqual([0.20, 0.35]);
    expect(states[2].showEnergyBaseline).toBeCloseTo(0.275);
  });

  it("tracks Drums/Space encounter and post-count", () => {
    const songs = [
      makeSong("s2t01", "Playin"),
      makeSong("s2t02", "Drums"),
      makeSong("s2t03", "Space"),
      makeSong("s2t04", "NFA"),
    ];

    const isJam = (title: string) => title === "Drums" || title === "Space";

    const states = precomputeNarrativeStates(songs, noopLoadFrames, noopResolveMode, isJam);

    // Before Drums: no encounter
    expect(states[0].hasDrumsSpace).toBe(false);
    expect(states[1].hasDrumsSpace).toBe(false);

    // After Drums: encountered, count = 0
    expect(states[2].hasDrumsSpace).toBe(true);
    expect(states[2].postDrumsSpaceCount).toBe(0);

    // After Space: still jam, count stays 0
    expect(states[3].hasDrumsSpace).toBe(true);
    expect(states[3].postDrumsSpaceCount).toBe(0);
  });

  it("increments postDrumsSpaceCount after non-jam songs", () => {
    const songs = [
      makeSong("s2t01", "Drums"),
      makeSong("s2t02", "NFA"),
      makeSong("s2t03", "Stella"),
    ];

    const isJam = (title: string) => title === "Drums";

    const states = precomputeNarrativeStates(songs, noopLoadFrames, noopResolveMode, isJam);

    // After Drums renders: hasDrumsSpace true, count 0
    expect(states[1].hasDrumsSpace).toBe(true);
    expect(states[1].postDrumsSpaceCount).toBe(0);

    // After NFA renders: count 1
    expect(states[2].hasDrumsSpace).toBe(true);
    expect(states[2].postDrumsSpaceCount).toBe(1);
  });

  it("tracks shader modes used by previous songs", () => {
    const songs = [
      makeSong("s1t01", "Bertha"),
      makeSong("s1t02", "Scarlet"),
      makeSong("s1t03", "Fire"),
    ];

    let callCount = 0;
    const modes: VisualMode[] = ["liquid_light", "particle_nebula", "liquid_light"];
    const resolveMode = () => modes[callCount++];

    const states = precomputeNarrativeStates(songs, noopLoadFrames, resolveMode, noopIsJam);

    // Song 0: no previous modes
    expect(states[0].usedShaderModes.size).toBe(0);

    // Song 1: has song 0's mode
    expect(states[1].usedShaderModes.get("liquid_light")).toBe(1);

    // Song 2: has songs 0+1 modes
    expect(states[2].usedShaderModes.get("liquid_light")).toBe(1);
    expect(states[2].usedShaderModes.get("particle_nebula")).toBe(1);
  });

  it("each state has independent copies (no shared references)", () => {
    const songs = [makeSong("s1t01", "Bertha"), makeSong("s1t02", "Scarlet")];

    const states = precomputeNarrativeStates(
      songs,
      () => makeFrames(10, 0.5),
      noopResolveMode,
      noopIsJam,
    );

    // Mutating state[0] should not affect state[1]
    states[0].songPeakEnergies.push(999);
    expect(states[1].songPeakEnergies).not.toContain(999);

    states[0].usedShaderModes.set("concert_lighting", 99);
    expect(states[1].usedShaderModes.has("concert_lighting")).toBe(false);
  });

  it("detects coherence lock from analysis frames", () => {
    const songs = [makeSong("s1t01", "Bertha"), makeSong("s1t02", "Scarlet")];

    // High rms + low flatness = coherence proxy
    const highCoherenceFrames = makeFrames(300, 0.25, 0.1);

    const states = precomputeNarrativeStates(
      songs,
      (trackId) => trackId === "s1t01" ? highCoherenceFrames : null,
      noopResolveMode,
      noopIsJam,
    );

    expect(states[0].hasHadCoherenceLock).toBe(false);
    expect(states[1].hasHadCoherenceLock).toBe(true);
  });

  it("show phase transitions through 20-song setlist", () => {
    const songs = Array.from({ length: 20 }, (_, i) =>
      makeSong(`s1t${String(i + 1).padStart(2, "0")}`, `Song${i}`)
    );

    const states = precomputeNarrativeStates(songs, noopLoadFrames, noopResolveMode, noopIsJam);

    expect(states[0].showPhase).toBe("opening");
    expect(states[1].showPhase).toBe("opening");
    expect(states[5].showPhase).toBe("deepening");
    expect(states[12].showPhase).toBe("peak_show");
    expect(states[18].showPhase).toBe("closing");
  });

  it("handles empty setlist", () => {
    const states = precomputeNarrativeStates([], noopLoadFrames, noopResolveMode, noopIsJam);
    expect(states).toEqual([]);
  });

  it("handles songs with no analysis data", () => {
    const songs = [makeSong("s1t01", "Bertha"), makeSong("s1t02", "Scarlet")];
    const states = precomputeNarrativeStates(songs, () => null, noopResolveMode, noopIsJam);

    expect(states[1].songsCompleted).toBe(1);
    expect(states[1].songPeakEnergies).toEqual([]);
    expect(states[1].showEnergyBaseline).toBe(0);
  });
});
