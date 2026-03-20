import { describe, it, expect } from "vitest";
import {
  classifyStemSection,
  detectSolo,
  computeVocalWarmth,
  computeGuitarColorTemp,
  computeInstrumentBalance,
} from "./stem-features";
import type { AudioSnapshot } from "./audio-reactive";

/** Create a minimal AudioSnapshot with default zeros */
function makeSnapshot(overrides: Partial<AudioSnapshot> = {}): AudioSnapshot {
  return {
    energy: 0.3,
    slowEnergy: 0.3,
    bass: 0.2,
    mids: 0.3,
    highs: 0.2,
    onsetEnvelope: 0.1,
    beatDecay: 0,
    chromaHue: 180,
    centroid: 0.5,
    flatness: 0.3,
    spectralFlux: 0.1,
    fastEnergy: 0.3,
    drumOnset: 0.1,
    drumBeat: 0,
    musicalTime: 0,
    vocalEnergy: 0,
    vocalPresence: 0,
    otherEnergy: 0.3,
    otherCentroid: 0.5,
    energyAcceleration: 0,
    energyTrend: 0,
    localTempo: 120,
    beatConfidence: 0,
    downbeat: false,
    energyForecast: 0,
    peakApproaching: 0,
    beatStability: 0,
    melodicPitch: 0,
    melodicConfidence: 0,
    melodicDirection: 0,
    chordIndex: 0,
    harmonicTension: 0,
    chordConfidence: 0.5,
    sectionType: "jam",
    ...overrides,
  };
}

describe("classifyStemSection", () => {
  it("returns quiet when energy is very low", () => {
    expect(classifyStemSection(makeSnapshot({ energy: 0.05 }))).toBe("quiet");
  });

  it("returns vocal when singing with energy", () => {
    expect(classifyStemSection(makeSnapshot({
      vocalPresence: 0.8,
      vocalEnergy: 0.3,
      energy: 0.4,
    }))).toBe("vocal");
  });

  it("returns solo when high other energy, no vocals", () => {
    expect(classifyStemSection(makeSnapshot({
      otherEnergy: 0.5,
      vocalPresence: 0.1,
      energy: 0.4,
    }))).toBe("solo");
  });

  it("returns instrumental when playing without vocals", () => {
    expect(classifyStemSection(makeSnapshot({
      energy: 0.2,
      vocalPresence: 0.1,
      otherEnergy: 0.15,
    }))).toBe("instrumental");
  });

  it("returns jam as default", () => {
    expect(classifyStemSection(makeSnapshot({
      energy: 0.3,
      vocalPresence: 0.6,
      vocalEnergy: 0.05, // not enough vocal energy for "vocal"
      otherEnergy: 0.15,
    }))).toBe("jam");
  });
});

describe("detectSolo", () => {
  it("detects guitar solo: high other + high centroid + no vocals", () => {
    const result = detectSolo(makeSnapshot({
      otherEnergy: 0.5,
      otherCentroid: 0.7,
      vocalPresence: 0.05,
    }));
    expect(result.isSolo).toBe(true);
    expect(result.instrument).toBe("guitar");
    expect(result.intensity).toBeGreaterThan(0);
  });

  it("detects bass solo: high bass + low other + no vocals", () => {
    const result = detectSolo(makeSnapshot({
      bass: 0.5,
      otherEnergy: 0.1,
      vocalPresence: 0.05,
    }));
    expect(result.isSolo).toBe(true);
    expect(result.instrument).toBe("bass");
  });

  it("returns no solo when vocals are present", () => {
    const result = detectSolo(makeSnapshot({
      otherEnergy: 0.5,
      otherCentroid: 0.7,
      vocalPresence: 0.5,
    }));
    expect(result.isSolo).toBe(false);
    expect(result.instrument).toBe("none");
  });

  it("returns no solo during quiet passages", () => {
    const result = detectSolo(makeSnapshot({
      otherEnergy: 0.1,
      otherCentroid: 0.3,
      bass: 0.1,
      vocalPresence: 0,
    }));
    expect(result.isSolo).toBe(false);
  });
});

describe("computeVocalWarmth", () => {
  it("returns 0 when no vocals", () => {
    expect(computeVocalWarmth(makeSnapshot({ vocalPresence: 0, vocalEnergy: 0 }))).toBe(0);
  });

  it("returns high warmth during strong singing", () => {
    const warmth = computeVocalWarmth(makeSnapshot({
      vocalPresence: 0.9,
      vocalEnergy: 0.5,
    }));
    expect(warmth).toBeGreaterThan(0.5);
    expect(warmth).toBeLessThanOrEqual(1);
  });

  it("caps at 1", () => {
    const warmth = computeVocalWarmth(makeSnapshot({
      vocalPresence: 1,
      vocalEnergy: 1,
    }));
    expect(warmth).toBe(1);
  });
});

describe("computeGuitarColorTemp", () => {
  it("returns warm (positive) for high centroid + energy", () => {
    const temp = computeGuitarColorTemp(makeSnapshot({
      otherCentroid: 0.9,
      otherEnergy: 0.5,
    }));
    expect(temp).toBeGreaterThan(0);
  });

  it("returns cool (negative) for low centroid + energy", () => {
    const temp = computeGuitarColorTemp(makeSnapshot({
      otherCentroid: 0.1,
      otherEnergy: 0.5,
    }));
    expect(temp).toBeLessThan(0);
  });

  it("returns near-zero when no energy", () => {
    const temp = computeGuitarColorTemp(makeSnapshot({
      otherCentroid: 0.9,
      otherEnergy: 0,
    }));
    expect(Math.abs(temp)).toBeLessThan(0.01);
  });
});

describe("computeInstrumentBalance", () => {
  it("returns vocals when vocals dominate", () => {
    const result = computeInstrumentBalance(makeSnapshot({
      vocalEnergy: 0.8,
      otherEnergy: 0.1,
      bass: 0.05,
      drumOnset: 0.05,
    }));
    expect(result.dominant).toBe("vocals");
    expect(result.ratio).toBeGreaterThan(0.5);
  });

  it("returns guitar when other dominates", () => {
    const result = computeInstrumentBalance(makeSnapshot({
      vocalEnergy: 0.05,
      otherEnergy: 0.7,
      bass: 0.1,
      drumOnset: 0.05,
    }));
    expect(result.dominant).toBe("guitar");
  });

  it("returns balanced when all instruments are close", () => {
    const result = computeInstrumentBalance(makeSnapshot({
      vocalEnergy: 0.25,
      otherEnergy: 0.25,
      bass: 0.25,
      drumOnset: 0.25,
    }));
    expect(result.dominant).toBe("balanced");
  });

  it("returns balanced when very quiet", () => {
    const result = computeInstrumentBalance(makeSnapshot({
      vocalEnergy: 0,
      otherEnergy: 0,
      bass: 0,
      drumOnset: 0,
    }));
    expect(result.dominant).toBe("balanced");
    expect(result.ratio).toBe(0);
  });
});
