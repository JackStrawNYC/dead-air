import { describe, it, expect, beforeEach } from "vitest";
import { ChordDetector } from "./ChordDetector";

describe("ChordDetector", () => {
  let detector: ChordDetector;

  beforeEach(() => {
    detector = new ChordDetector(60, 2);
  });

  it("detects C major from C-E-G chroma", () => {
    // C=0, E=4, G=7 boosted
    const chroma = new Float32Array(12);
    chroma[0] = 1.0; // C
    chroma[4] = 0.9; // E
    chroma[7] = 0.8; // G

    const result = detector.detect(chroma);
    expect(result.chordIndex).toBe(0); // C major = index 0
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("detects A minor from A-C-E chroma", () => {
    // A minor: root A=9, minor third C=0 (+3 from 9 = 0), fifth E=4 (+7 from 9 = 4)
    const chroma = new Float32Array(12);
    chroma[9] = 1.0; // A
    chroma[0] = 0.9; // C
    chroma[4] = 0.8; // E

    const result = detector.detect(chroma);
    // A minor = index 12 + 9 = 21
    expect(result.chordIndex).toBe(21);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("detects G major from G-B-D chroma", () => {
    const chroma = new Float32Array(12);
    chroma[7] = 1.0; // G
    chroma[11] = 0.9; // B
    chroma[2] = 0.8; // D

    const result = detector.detect(chroma);
    expect(result.chordIndex).toBe(7); // G major = index 7
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("returns low confidence for ambiguous chroma", () => {
    // All pitch classes equal = no clear chord
    const chroma = new Float32Array(12).fill(0.5);
    const result = detector.detect(chroma);
    // Confidence should be lower than a clear chord
    // With uniform distribution, cosine similarity to any triad template is still decent
    // but lower than a clean match
    expect(result.confidence).toBeLessThan(0.9);
    expect(result.confidence).toBeGreaterThan(0); // still some match
  });

  it("returns zero confidence for silent chroma", () => {
    const chroma = new Float32Array(12).fill(0);
    const result = detector.detect(chroma);
    expect(result.confidence).toBe(0);
  });

  it("harmonic tension starts at zero", () => {
    const chroma = new Float32Array(12);
    chroma[0] = 1.0;
    chroma[4] = 0.8;
    chroma[7] = 0.6;

    const result = detector.detect(chroma);
    expect(result.harmonicTension).toBe(0);
  });

  it("harmonic tension increases with chord changes", () => {
    // Alternate between C major and D minor chroma
    const cMajor = new Float32Array(12);
    cMajor[0] = 1.0; cMajor[4] = 0.8; cMajor[7] = 0.6;

    const dMinor = new Float32Array(12);
    dMinor[2] = 1.0; dMinor[5] = 0.8; dMinor[9] = 0.6;

    // Feed alternating chords for many frames
    for (let i = 0; i < 60; i++) {
      detector.detect(i % 2 === 0 ? cMajor : dMinor);
    }

    const result = detector.detect(cMajor);
    expect(result.harmonicTension).toBeGreaterThan(0.5);
  });

  it("harmonic tension stays low with stable chords", () => {
    const cMajor = new Float32Array(12);
    cMajor[0] = 1.0; cMajor[4] = 0.8; cMajor[7] = 0.6;

    // Same chord for many frames
    for (let i = 0; i < 120; i++) {
      detector.detect(cMajor);
    }

    const result = detector.detect(cMajor);
    expect(result.harmonicTension).toBe(0);
  });

  it("chord index is in range 0-23", () => {
    const chroma = new Float32Array(12);
    for (let root = 0; root < 12; root++) {
      chroma.fill(0);
      chroma[root] = 1.0;
      chroma[(root + 4) % 12] = 0.8;
      chroma[(root + 7) % 12] = 0.6;

      const result = detector.detect(chroma);
      expect(result.chordIndex).toBeGreaterThanOrEqual(0);
      expect(result.chordIndex).toBeLessThanOrEqual(23);
    }
  });

  it("confidence is in range 0-1", () => {
    const chroma = new Float32Array(12);
    chroma[3] = 0.7; chroma[6] = 0.4; chroma[10] = 0.9;

    const result = detector.detect(chroma);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("resets properly", () => {
    const chroma = new Float32Array(12);
    chroma[0] = 1.0; chroma[4] = 0.8; chroma[7] = 0.6;

    // Build up history
    for (let i = 0; i < 60; i++) detector.detect(chroma);
    detector.reset();

    const result = detector.detect(chroma);
    expect(result.harmonicTension).toBe(0); // no history after reset
  });
});
