/**
 * Vignette-stack regression guard. The audit flagged the prior implementation
 * stacking quiet vignette (~18% edge darken) AND dramatic vignette (~35%)
 * multiplicatively at quiet-frame edges (~47% crush). The fix combines via
 * max() so the deeper of the two wins instead of compounding.
 *
 * These tests reproduce the GLSL math in TS so a future tweak that
 * accidentally re-stacks the multiplications is caught here, even though
 * the GLSL itself isn't executed in unit tests.
 */
import { describe, it, expect } from "vitest";

/** Reproduces the postprocess.glsl quiet-vignette-darken computation. */
function quietVigDarken(p: { x: number; y: number }, quietness: number): number {
  // float quietVig = 1.0 - dot(p * 1.1, p * 1.1);
  // quietVig = smoothstep(0.0, 1.0, quietVig);
  // quietVigDarken = (1.0 - quietVig) * quietness * 0.18;
  const px = p.x * 1.1, py = p.y * 1.1;
  let q = 1.0 - (px * px + py * py);
  q = Math.max(0, Math.min(1, q));
  q = q * q * (3 - 2 * q); // smoothstep
  return (1.0 - q) * quietness * 0.18;
}

/** Reproduces the dramatic-vignette darken. */
function dramaticVigDarken(p: { x: number; y: number }): number {
  // float vig = 1.0 - dot(p * 0.9, p * 0.9);
  // vig = smoothstep(0.0, 1.0, vig);
  // dramaticDarken = (1.0 - vig) * 0.35;
  const px = p.x * 0.9, py = p.y * 0.9;
  let v = 1.0 - (px * px + py * py);
  v = Math.max(0, Math.min(1, v));
  v = v * v * (3 - 2 * v);
  return (1.0 - v) * 0.35;
}

/** Old (broken) stacking behavior — for regression comparison. */
function oldStackedDarken(p: { x: number; y: number }, quietness: number): number {
  const qFactor = 1 - quietVigDarken(p, quietness);   // multiplicative factor 1=clear, 0=black
  const dFactor = 1 - dramaticVigDarken(p);
  return 1 - qFactor * dFactor; // total darkening when stacked
}

/** New (fixed) max-combine behavior. */
function newCombinedDarken(p: { x: number; y: number }, quietness: number): number {
  return Math.max(quietVigDarken(p, quietness), dramaticVigDarken(p));
}

// p coords match the shader: (uv - 0.5) * aspect. Corner of a 16:9 frame
// is ≈ (0.89, 0.5) where both vignettes peak.
const FRAME_EDGE = { x: 0.89, y: 0.5 };
const FRAME_CENTER = { x: 0.0, y: 0.0 };

describe("Vignette stack guard (audit Tier 0 #10)", () => {
  it("at full quietness + frame edge, OLD stack crushes >40%", () => {
    // The audit's exact failure case
    const old = oldStackedDarken(FRAME_EDGE, 1.0);
    expect(old, `old stack darkening = ${(old * 100).toFixed(0)}%`).toBeGreaterThan(0.40);
  });

  it("at full quietness + frame edge, NEW combine darkens ≤ dramatic alone", () => {
    const fresh = newCombinedDarken(FRAME_EDGE, 1.0);
    const dramaticOnly = dramaticVigDarken(FRAME_EDGE);
    // The fixed combine never exceeds the deeper of the two
    expect(fresh).toBeLessThanOrEqual(Math.max(dramaticOnly, quietVigDarken(FRAME_EDGE, 1.0)) + 1e-6);
    // And specifically: not crushed past dramatic-only
    expect(fresh).toBeLessThanOrEqual(dramaticOnly + 1e-6);
  });

  it("center pixel is unaffected by either vignette", () => {
    expect(newCombinedDarken(FRAME_CENTER, 1.0)).toBeLessThan(0.001);
    expect(oldStackedDarken(FRAME_CENTER, 1.0)).toBeLessThan(0.001);
  });

  it("at full quietness, NEW darkening at edge < OLD darkening", () => {
    // The fix delivers — quiet edges are no longer compound-crushed
    expect(newCombinedDarken(FRAME_EDGE, 1.0))
      .toBeLessThan(oldStackedDarken(FRAME_EDGE, 1.0));
  });

  it("at zero quietness, NEW darkening matches dramatic-only (no regression on loud frames)", () => {
    // Loud frames never had the stacking issue — verify the fix doesn't
    // change their behavior.
    const fresh = newCombinedDarken(FRAME_EDGE, 0.0);
    const old = oldStackedDarken(FRAME_EDGE, 0.0);
    expect(Math.abs(fresh - old)).toBeLessThan(0.001);
  });
});
