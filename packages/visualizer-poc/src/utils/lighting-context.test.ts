import { describe, it, expect } from "vitest";
import {
  computeTargetLighting,
  smoothLighting,
  computeLightingState,
  DEFAULT_LIGHTING,
  type LightingState,
  type LightingInput,
} from "./lighting-context";

/** Helper: check that a 3-tuple is normalized (length ~1) */
function isNormalized(v: [number, number, number], epsilon = 0.01): boolean {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return Math.abs(len - 1) < epsilon;
}

describe("computeTargetLighting", () => {
  it("returns default lighting for unknown section type", () => {
    const result = computeTargetLighting({ energy: 0, temperature: 0 });
    expect(result.keyLightDir).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(result.keyLightDir.length).toBe(3);
    // Default intensity is 0.7 + energy boost (0)
    expect(result.keyLightIntensity).toBeCloseTo(0.7, 1);
  });

  it("verse: warm frontal light with moderate intensity", () => {
    const result = computeTargetLighting({ sectionType: "verse", energy: 0.3, temperature: 0 });
    // Verse dir is [0.2, 0.6, 0.8] (frontal)
    expect(result.keyLightDir[2]).toBeGreaterThan(0.5); // strong Z component = frontal
    // Verse intensity: 0.6 + 0.3*0.15 = 0.645
    expect(result.keyLightIntensity).toBeCloseTo(0.645, 2);
    // Verse temperature: 0.3*0.6 + 0*0.4 = 0.18 (warm)
    expect(result.colorTemperature).toBeGreaterThan(0);
  });

  it("chorus: bright overhead light", () => {
    const result = computeTargetLighting({ sectionType: "chorus", energy: 0.5, temperature: 0 });
    // Chorus dir is [0.0, 1.0, 0.3] — strong Y
    expect(result.keyLightDir[1]).toBeGreaterThan(0.8);
    // Chorus intensity: 0.9 + 0.5*0.15 = 0.975
    expect(result.keyLightIntensity).toBeGreaterThan(0.9);
    // Chorus light color is pure white
    expect(result.keyLightColor[0]).toBeCloseTo(1.0, 1);
    expect(result.keyLightColor[1]).toBeCloseTo(1.0, 1);
    expect(result.keyLightColor[2]).toBeCloseTo(1.0, 1);
  });

  it("jam: side cool light", () => {
    const result = computeTargetLighting({ sectionType: "jam", energy: 0.4, temperature: 0 });
    // Jam dir is [0.7, 0.4, -0.3] — strong X (side)
    expect(result.keyLightDir[0]).toBeGreaterThan(0.5);
    // Jam temperature: -0.3*0.6 + 0*0.4 = -0.18 (cool)
    expect(result.colorTemperature).toBeLessThan(0);
    // Blue-tinted light
    expect(result.keyLightColor[2]).toBeGreaterThan(result.keyLightColor[0]);
  });

  it("space: dim top light with dark purple ambient", () => {
    const result = computeTargetLighting({ sectionType: "space", energy: 0.1, temperature: 0 });
    // Space dir is [0.0, 1.0, 0.0] — straight up
    expect(result.keyLightDir[1]).toBeCloseTo(1.0, 1);
    // Space intensity: 0.3 + 0.1*0.15 = 0.315 (dim)
    expect(result.keyLightIntensity).toBeLessThan(0.4);
    // Purple ambient: blue > red > green
    expect(result.ambientColor[2]).toBeGreaterThan(result.ambientColor[1]);
    // Cool temperature
    expect(result.colorTemperature).toBeLessThan(-0.2);
  });

  it("solo: dramatic warm spot", () => {
    const result = computeTargetLighting({ sectionType: "solo", energy: 0.6, temperature: 0 });
    // Solo dir is [0.1, 0.9, 0.2] — near overhead
    expect(result.keyLightDir[1]).toBeGreaterThan(0.7);
    // Solo intensity: 0.85 + 0.6*0.15 = 0.94
    expect(result.keyLightIntensity).toBeGreaterThan(0.9);
    // Warm gold light color
    expect(result.keyLightColor[0]).toBeGreaterThan(result.keyLightColor[2]);
    // Warm temperature
    expect(result.colorTemperature).toBeGreaterThan(0.15);
  });

  it("energy boosts intensity and ambient", () => {
    const low = computeTargetLighting({ sectionType: "verse", energy: 0, temperature: 0 });
    const high = computeTargetLighting({ sectionType: "verse", energy: 1.0, temperature: 0 });
    expect(high.keyLightIntensity).toBeGreaterThan(low.keyLightIntensity);
    // Ambient also brighter at higher energy
    expect(high.ambientColor[0]).toBeGreaterThan(low.ambientColor[0]);
  });

  it("narrative temperature blends with section temperature", () => {
    // Verse base temp is 0.3 → with temp=0: 0.3*0.6 = 0.18
    const neutral = computeTargetLighting({ sectionType: "verse", energy: 0.3, temperature: 0 });
    // With temp=1: 0.3*0.6 + 1*0.4 = 0.58
    const warm = computeTargetLighting({ sectionType: "verse", energy: 0.3, temperature: 1 });
    // With temp=-1: 0.3*0.6 + -1*0.4 = -0.22
    const cool = computeTargetLighting({ sectionType: "verse", energy: 0.3, temperature: -1 });
    expect(warm.colorTemperature).toBeGreaterThan(neutral.colorTemperature);
    expect(cool.colorTemperature).toBeLessThan(neutral.colorTemperature);
  });

  it("key light direction is always normalized", () => {
    const sections = ["verse", "chorus", "jam", "space", "solo", "bridge", "intro", "outro", undefined];
    for (const s of sections) {
      const result = computeTargetLighting({ sectionType: s, energy: 0.5, temperature: 0.2 });
      expect(isNormalized(result.keyLightDir)).toBe(true);
    }
  });

  it("all values are in valid ranges", () => {
    const sections = ["verse", "chorus", "jam", "space", "solo", "bridge", "intro", "outro"];
    for (const s of sections) {
      for (const energy of [0, 0.5, 1.0]) {
        for (const temperature of [-1, 0, 1]) {
          const result = computeTargetLighting({ sectionType: s, energy, temperature });
          expect(result.keyLightIntensity).toBeGreaterThanOrEqual(0);
          expect(result.keyLightIntensity).toBeLessThanOrEqual(1);
          expect(result.colorTemperature).toBeGreaterThanOrEqual(-1);
          expect(result.colorTemperature).toBeLessThanOrEqual(1);
          for (let i = 0; i < 3; i++) {
            expect(result.keyLightColor[i]).toBeGreaterThanOrEqual(0);
            expect(result.keyLightColor[i]).toBeLessThanOrEqual(1);
            expect(result.ambientColor[i]).toBeGreaterThanOrEqual(0);
            expect(result.ambientColor[i]).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe("smoothLighting (EMA)", () => {
  it("alpha=0 returns previous state unchanged", () => {
    const prev: LightingState = {
      keyLightDir: [1, 0, 0],
      keyLightColor: [1, 0, 0],
      keyLightIntensity: 0.5,
      ambientColor: [0.1, 0.1, 0.1],
      colorTemperature: -0.5,
    };
    const target: LightingState = {
      keyLightDir: [0, 1, 0],
      keyLightColor: [0, 1, 0],
      keyLightIntensity: 1.0,
      ambientColor: [0.5, 0.5, 0.5],
      colorTemperature: 0.5,
    };
    const result = smoothLighting(prev, target, 0);
    expect(result.keyLightIntensity).toBeCloseTo(0.5, 5);
    expect(result.colorTemperature).toBeCloseTo(-0.5, 5);
    expect(result.keyLightColor[0]).toBeCloseTo(1, 5);
    expect(result.ambientColor[0]).toBeCloseTo(0.1, 5);
  });

  it("alpha=1 returns target state", () => {
    const prev = { ...DEFAULT_LIGHTING };
    const target: LightingState = {
      keyLightDir: [0, 1, 0],
      keyLightColor: [0.5, 0.6, 0.7],
      keyLightIntensity: 0.9,
      ambientColor: [0.2, 0.2, 0.2],
      colorTemperature: 0.8,
    };
    const result = smoothLighting(prev, target, 1);
    expect(result.keyLightIntensity).toBeCloseTo(0.9, 5);
    expect(result.colorTemperature).toBeCloseTo(0.8, 5);
    expect(result.keyLightColor[0]).toBeCloseTo(0.5, 5);
  });

  it("default alpha (~0.03) produces gradual transition", () => {
    const prev = { ...DEFAULT_LIGHTING };
    const target: LightingState = {
      keyLightDir: [0, 1, 0],
      keyLightColor: [0.5, 0.5, 0.5],
      keyLightIntensity: 1.0,
      ambientColor: [0.5, 0.5, 0.5],
      colorTemperature: 1.0,
    };
    const oneStep = smoothLighting(prev, target);
    // After one step with alpha=0.03, should barely move from prev
    expect(oneStep.keyLightIntensity).toBeCloseTo(
      prev.keyLightIntensity + (target.keyLightIntensity - prev.keyLightIntensity) * 0.03,
      3,
    );
    // After many steps, should converge close to target
    let state = prev;
    for (let i = 0; i < 200; i++) {
      state = smoothLighting(state, target);
    }
    // 200 steps at alpha=0.03: (1-0.03)^200 = ~0.002, so ~99.8% of the way there
    expect(state.keyLightIntensity).toBeCloseTo(target.keyLightIntensity, 1);
    expect(state.colorTemperature).toBeCloseTo(target.colorTemperature, 1);
  });

  it("smoothed direction remains normalized", () => {
    const prev: LightingState = {
      keyLightDir: [1, 0, 0],
      keyLightColor: [1, 1, 1],
      keyLightIntensity: 0.5,
      ambientColor: [0.1, 0.1, 0.1],
      colorTemperature: 0,
    };
    const target: LightingState = {
      keyLightDir: [0, 1, 0],
      keyLightColor: [1, 1, 1],
      keyLightIntensity: 0.5,
      ambientColor: [0.1, 0.1, 0.1],
      colorTemperature: 0,
    };
    // Intermediate step should still be normalized
    const mid = smoothLighting(prev, target, 0.5);
    expect(isNormalized(mid.keyLightDir)).toBe(true);
  });
});

describe("computeLightingState (combined target + smooth)", () => {
  it("first frame from DEFAULT_LIGHTING produces a slightly-shifted state", () => {
    const input: LightingInput = { sectionType: "chorus", energy: 0.5, temperature: 0 };
    const result = computeLightingState(DEFAULT_LIGHTING, input);
    // Should be very close to DEFAULT_LIGHTING (only 3% of the way to chorus target)
    expect(result.keyLightIntensity).not.toEqual(DEFAULT_LIGHTING.keyLightIntensity);
    // But not yet at chorus target (0.975)
    expect(result.keyLightIntensity).toBeLessThan(0.9);
  });

  it("converges to section lighting after many frames", () => {
    const input: LightingInput = { sectionType: "space", energy: 0, temperature: 0 };
    let state = { ...DEFAULT_LIGHTING };
    for (let i = 0; i < 300; i++) {
      state = computeLightingState(state, input);
    }
    // After 300 frames at alpha=0.03, should be very close to space target
    // Space intensity: 0.3 + 0*0.15 = 0.3
    expect(state.keyLightIntensity).toBeCloseTo(0.3, 1);
    // Space temperature: -0.5*0.6 = -0.3
    expect(state.colorTemperature).toBeCloseTo(-0.3, 1);
  });

  it("matches DEFAULT_LIGHTING when starting from default with default section", () => {
    // If section type is unknown and energy=0, target should match DEFAULT_LIGHTING
    const result = computeTargetLighting({ energy: 0, temperature: 0 });
    expect(result.keyLightIntensity).toBeCloseTo(DEFAULT_LIGHTING.keyLightIntensity, 5);
    expect(result.colorTemperature).toBeCloseTo(DEFAULT_LIGHTING.colorTemperature, 5);
  });

  it("custom alpha overrides default smoothing rate", () => {
    const input: LightingInput = { sectionType: "chorus", energy: 0.5, temperature: 0 };
    const slow = computeLightingState(DEFAULT_LIGHTING, input, 0.01);
    const fast = computeLightingState(DEFAULT_LIGHTING, input, 0.1);
    // Fast alpha should move further from default in one step
    const defaultInt = DEFAULT_LIGHTING.keyLightIntensity;
    expect(Math.abs(fast.keyLightIntensity - defaultInt)).toBeGreaterThan(
      Math.abs(slow.keyLightIntensity - defaultInt),
    );
  });
});
