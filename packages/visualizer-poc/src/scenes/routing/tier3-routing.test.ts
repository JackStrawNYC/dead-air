import { describe, it, expect } from "vitest";
import {
  pickKeyModeBias,
  pickSilenceOverride,
  pickVocalRatioBias,
} from "./tier3-routing";

const SECTION = { frameStart: 0, frameEnd: 100 };

function frames<T>(count: number, build: (i: number) => T): T[] {
  return Array.from({ length: count }, (_, i) => build(i));
}

// ─── pickKeyModeBias ──────────────────────────────────────────────────────

describe("pickKeyModeBias", () => {
  it("returns null when key confidence is below threshold", () => {
    const f = frames(101, () => ({ keyMode: 1, keyConfidence: 0.3 }));
    expect(pickKeyModeBias(f, SECTION)).toBeNull();
  });

  it("returns major-key pool for high-confidence major", () => {
    const f = frames(101, () => ({ keyMode: 1, keyConfidence: 0.8 }));
    const pool = pickKeyModeBias(f, SECTION);
    expect(pool).not.toBeNull();
    expect(pool).toContain("aurora");
    expect(pool).toContain("ember_meadow");
  });

  it("returns minor-key pool for high-confidence minor", () => {
    const f = frames(101, () => ({ keyMode: 0, keyConfidence: 0.8 }));
    const pool = pickKeyModeBias(f, SECTION);
    expect(pool).not.toBeNull();
    expect(pool).toContain("deep_ocean");
    expect(pool).toContain("dark_star_void");
  });

  it("returns null on empty frames", () => {
    expect(pickKeyModeBias([], SECTION)).toBeNull();
  });
});

// ─── pickSilenceOverride ──────────────────────────────────────────────────

describe("pickSilenceOverride", () => {
  it("returns null when silence average is below threshold", () => {
    const f = frames(101, () => ({ silenceScore: 0.2 }));
    expect(pickSilenceOverride(f, SECTION)).toBeNull();
  });

  it("returns ambient pool when silence > 0.5", () => {
    const f = frames(101, () => ({ silenceScore: 0.7 }));
    const pool = pickSilenceOverride(f, SECTION);
    expect(pool).not.toBeNull();
    expect(pool).toContain("aurora");
    expect(pool).toContain("void_light");
    expect(pool).toContain("cosmic_dust");
  });

  it("returns null on undefined silenceScore", () => {
    const f = frames(101, () => ({}));
    expect(pickSilenceOverride(f, SECTION)).toBeNull();
  });
});

// ─── pickVocalRatioBias ───────────────────────────────────────────────────

describe("pickVocalRatioBias", () => {
  it("returns vocal-dominant pool when ratio > 0.5", () => {
    const f = frames(101, () => ({ vocalEnergyRatio: 0.7 }));
    const pool = pickVocalRatioBias(f, SECTION);
    expect(pool).not.toBeNull();
    expect(pool).toContain("porch_twilight");
    expect(pool).toContain("ember_meadow");
  });

  it("returns instrumental-dominant pool when ratio < 0.2", () => {
    const f = frames(101, () => ({ vocalEnergyRatio: 0.05 }));
    const pool = pickVocalRatioBias(f, SECTION);
    expect(pool).not.toBeNull();
    expect(pool).toContain("electric_arc");
    expect(pool).toContain("dance_floor_prism");
  });

  it("returns null in balanced mid-range", () => {
    const f = frames(101, () => ({ vocalEnergyRatio: 0.35 }));
    expect(pickVocalRatioBias(f, SECTION)).toBeNull();
  });

  it("returns null when no frames have the field", () => {
    const f = frames(101, () => ({}));
    expect(pickVocalRatioBias(f, SECTION)).toBeNull();
  });

  it("vocal-dominant and instrumental-dominant pools share fractal_temple but not edge biases", () => {
    // fractal_temple is in BOTH (universal cathedral fits both ends), but
    // porch_twilight (warm intimate) is only vocal, electric_arc (dramatic
    // expansive) is only instrumental. Pin the structural difference.
    const vocal = pickVocalRatioBias(frames(101, () => ({ vocalEnergyRatio: 0.7 })), SECTION);
    const inst = pickVocalRatioBias(frames(101, () => ({ vocalEnergyRatio: 0.05 })), SECTION);
    expect(vocal).toContain("porch_twilight");
    expect(inst).not.toContain("porch_twilight");
    expect(inst).toContain("electric_arc");
    expect(vocal).not.toContain("electric_arc");
  });
});
