import { describe, it, expect } from "vitest";
import { smoothstep, smoothstepSimple, lerp, clamp } from "./math";

describe("smoothstep", () => {
  it("returns 0 below edge0", () => {
    expect(smoothstep(0.2, 0.8, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.8, 0.0)).toBe(0);
    expect(smoothstep(0.2, 0.8, -1)).toBe(0);
  });

  it("returns 1 above edge1", () => {
    expect(smoothstep(0.2, 0.8, 0.9)).toBe(1);
    expect(smoothstep(0.2, 0.8, 1.0)).toBe(1);
    expect(smoothstep(0.2, 0.8, 100)).toBe(1);
  });

  it("returns 0.5 at midpoint", () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });

  it("produces S-curve (not linear)", () => {
    // At 25% input, should be less than 0.25 (ease-in)
    const at25 = smoothstep(0, 1, 0.25);
    expect(at25).toBeLessThan(0.25);
    // At 75% input, should be more than 0.75 (ease-out)
    const at75 = smoothstep(0, 1, 0.75);
    expect(at75).toBeGreaterThan(0.75);
  });

  it("is monotonically increasing", () => {
    let prev = 0;
    for (let x = 0; x <= 1; x += 0.01) {
      const val = smoothstep(0, 1, x);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });
});

describe("smoothstepSimple", () => {
  it("clamps input to [0, 1]", () => {
    expect(smoothstepSimple(-0.5)).toBe(0);
    expect(smoothstepSimple(1.5)).toBe(1);
  });

  it("matches smoothstep(0, 1, x)", () => {
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      expect(smoothstepSimple(x)).toBe(smoothstep(0, 1, x));
    }
  });
});

describe("lerp", () => {
  it("returns a at t=0", () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it("returns b at t=1", () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it("returns midpoint at t=0.5", () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  it("extrapolates beyond [0, 1]", () => {
    expect(lerp(0, 10, 2)).toBe(20);
    expect(lerp(0, 10, -1)).toBe(-10);
  });
});

describe("clamp", () => {
  it("returns value when in range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to min", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps to max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("handles min === max", () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });
});
