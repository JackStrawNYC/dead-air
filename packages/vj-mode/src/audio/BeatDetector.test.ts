import { describe, it, expect, beforeEach } from "vitest";
import { BeatDetector } from "./BeatDetector";

describe("BeatDetector", () => {
  let detector: BeatDetector;

  beforeEach(() => {
    detector = new BeatDetector(60);
  });

  it("does not detect beat on silence", () => {
    const result = detector.detect(0, 0);
    expect(result.isBeat).toBe(false);
  });

  it("detects beat on strong onset after quiet period", () => {
    // Build up history of quiet
    for (let i = 0; i < 60; i++) {
      detector.detect(0.01, i * 16.67);
    }

    // Strong onset
    const result = detector.detect(0.8, 1000);
    expect(result.isBeat).toBe(true);
  });

  it("respects minimum beat interval", () => {
    // First beat
    for (let i = 0; i < 30; i++) detector.detect(0.01, i * 16.67);
    const first = detector.detect(0.8, 500);
    expect(first.isBeat).toBe(true);

    // Too-soon second beat (50ms later, min interval is 300ms at 200bpm)
    const second = detector.detect(0.8, 550);
    expect(second.isBeat).toBe(false);
  });

  it("estimates tempo from regular beats", () => {
    // Simulate 120 BPM: beats every 500ms
    const bpm120Interval = 500;

    for (let i = 0; i < 120; i++) {
      detector.detect(0.01, i * 16.67);
    }

    // Place beats at regular intervals
    for (let beat = 0; beat < 8; beat++) {
      const time = 2000 + beat * bpm120Interval;
      // Quiet between beats
      for (let q = 1; q < 30; q++) {
        detector.detect(0.01, time - q * 16.67 + bpm120Interval / 2);
      }
      detector.detect(0.9, time);
    }

    const result = detector.detect(0.01, 6100);
    expect(result.estimatedTempo).toBeGreaterThan(90);
    expect(result.estimatedTempo).toBeLessThan(160);
  });

  it("resets properly", () => {
    for (let i = 0; i < 60; i++) detector.detect(0.5, i * 16.67);
    detector.reset();
    expect(detector.detect(0, 0).estimatedTempo).toBe(120); // default
  });
});
