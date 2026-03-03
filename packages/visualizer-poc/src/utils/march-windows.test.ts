import { describe, it, expect } from "vitest";
import {
  precomputeMarchWindows,
  findActiveMarch,
  type MarchConfig,
} from "../components/parametric/audio-helpers";
import type { EnhancedFrameData } from "../data/types";

function makeFrame(rms: number, beat = false): EnhancedFrameData {
  return {
    rms,
    sub: 0,
    low: 0,
    mid: 0,
    high: 0,
    centroid: 0,
    flatness: 0,
    onset: 0,
    beat,
    chroma: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    contrast: [0, 0, 0, 0, 0, 0, 0],
  };
}

const DEFAULT_CONFIG: MarchConfig = {
  enterThreshold: 0.12,
  exitThreshold: 0.07,
  sustainFrames: 30,
  cooldownFrames: 150,
  marchDuration: 450,
};

describe("precomputeMarchWindows", () => {
  it("returns empty array for empty frames", () => {
    const result = precomputeMarchWindows([], DEFAULT_CONFIG);
    expect(result).toEqual([]);
  });

  it("returns empty array when energy never reaches threshold", () => {
    const frames = Array.from({ length: 600 }, () => makeFrame(0.05));
    const result = precomputeMarchWindows(frames, DEFAULT_CONFIG);
    expect(result).toEqual([]);
  });

  it("creates a march window when energy sustains above threshold", () => {
    // 300 frames of high energy with beats every 15 frames
    const frames = Array.from({ length: 600 }, (_, i) =>
      makeFrame(0.2, i % 15 === 0),
    );
    const result = precomputeMarchWindows(frames, DEFAULT_CONFIG);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].direction).toBe(1);
    expect(result[0].startFrame).toBeLessThan(100);
    expect(result[0].endFrame).toBeGreaterThan(result[0].startFrame);
  });

  it("alternates march direction", () => {
    // Long sustained high energy — should produce multiple marches
    const frames = Array.from({ length: 3000 }, (_, i) =>
      makeFrame(0.25, i % 15 === 0),
    );
    const result = precomputeMarchWindows(frames, {
      ...DEFAULT_CONFIG,
      marchDuration: 200,
      cooldownFrames: 50,
    });
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].direction).toBe(1);
    expect(result[1].direction).toBe(-1);
  });

  it("respects cooldown between marches", () => {
    const frames = Array.from({ length: 3000 }, (_, i) =>
      makeFrame(0.25, i % 15 === 0),
    );
    const config: MarchConfig = {
      ...DEFAULT_CONFIG,
      marchDuration: 200,
      cooldownFrames: 300,
    };
    const result = precomputeMarchWindows(frames, config);
    for (let i = 1; i < result.length; i++) {
      const gap = result[i].startFrame - result[i - 1].endFrame;
      expect(gap).toBeGreaterThanOrEqual(config.cooldownFrames);
    }
  });

  it("ends march early when energy drops below exit threshold", () => {
    // High energy for 200 frames, then silence
    const frames = Array.from({ length: 1000 }, (_, i) =>
      makeFrame(i < 200 ? 0.25 : 0.01, i % 15 === 0),
    );
    const result = precomputeMarchWindows(frames, DEFAULT_CONFIG);
    if (result.length > 0) {
      // March should end before the full marchDuration if energy drops
      const marchLen = result[0].endFrame - result[0].startFrame;
      expect(marchLen).toBeLessThan(DEFAULT_CONFIG.marchDuration);
    }
  });

  it("aligns march start to a beat frame", () => {
    // No beats until frame 50
    const frames = Array.from({ length: 600 }, (_, i) =>
      makeFrame(0.25, i === 50),
    );
    const result = precomputeMarchWindows(frames, DEFAULT_CONFIG);
    if (result.length > 0) {
      // Start should be at or near the beat frame
      expect(result[0].startFrame).toBeGreaterThanOrEqual(30);
    }
  });
});

describe("findActiveMarch", () => {
  const windows = [
    { startFrame: 100, endFrame: 550, direction: 1 as const },
    { startFrame: 700, endFrame: 1150, direction: -1 as const },
  ];

  it("returns null when no march is active", () => {
    expect(findActiveMarch(windows, 50)).toBeNull();
    expect(findActiveMarch(windows, 600)).toBeNull();
    expect(findActiveMarch(windows, 1200)).toBeNull();
  });

  it("returns the active march window", () => {
    expect(findActiveMarch(windows, 100)).toBe(windows[0]);
    expect(findActiveMarch(windows, 300)).toBe(windows[0]);
    expect(findActiveMarch(windows, 549)).toBe(windows[0]);
    expect(findActiveMarch(windows, 700)).toBe(windows[1]);
    expect(findActiveMarch(windows, 900)).toBe(windows[1]);
  });

  it("returns null at exact end frame (exclusive)", () => {
    expect(findActiveMarch(windows, 550)).toBeNull();
    expect(findActiveMarch(windows, 1150)).toBeNull();
  });

  it("handles empty windows array", () => {
    expect(findActiveMarch([], 100)).toBeNull();
  });
});
