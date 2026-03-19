import { describe, it, expect } from "vitest";
import { compute3DCamera } from "./camera-3d";
import type { Camera3DState } from "./camera-3d";

/** Helper: default quiet inputs */
function quiet(overrides: Record<string, number> = {}): Camera3DState {
  return compute3DCamera(
    overrides.time ?? 0,
    overrides.dynamicTime ?? 0,
    overrides.energy ?? 0,
    overrides.bass ?? 0,
    overrides.fastEnergy ?? 0,
    overrides.vocalPresence ?? 0,
    overrides.drumOnset ?? 0,
    overrides.sectionProgress ?? 0,
    overrides.sectionIndex ?? 0,
    overrides.climaxPhase ?? 0,
    overrides.climaxIntensity ?? 0,
    overrides.cameraSteadiness ?? 0.5,
    overrides.beatSnap ?? 0,
  );
}

describe("compute3DCamera", () => {
  it("returns all expected fields", () => {
    const cam = quiet();
    expect(cam.position).toHaveLength(3);
    expect(cam.target).toHaveLength(3);
    expect(typeof cam.fov).toBe("number");
    expect(typeof cam.dofStrength).toBe("number");
    expect(typeof cam.focusDistance).toBe("number");
  });

  it("fields are within expected ranges", () => {
    const cam = quiet({ energy: 0.5, bass: 0.5, time: 10 });
    expect(cam.fov).toBeGreaterThanOrEqual(45);
    expect(cam.fov).toBeLessThanOrEqual(65);
    expect(cam.dofStrength).toBeGreaterThanOrEqual(0);
    expect(cam.dofStrength).toBeLessThanOrEqual(1);
    expect(cam.focusDistance).toBeGreaterThanOrEqual(2);
    expect(cam.focusDistance).toBeLessThanOrEqual(5);
  });

  it("energy increases → radius decreases (closer)", () => {
    const lowE = quiet({ energy: 0.1, dynamicTime: 0 });
    const highE = quiet({ energy: 0.9, dynamicTime: 0 });
    // At dynamicTime=0: orbX=0, orbZ=radius
    // Position z = radius + shake (shake ~0 when bass=0)
    expect(Math.abs(lowE.position[2])).toBeGreaterThan(Math.abs(highE.position[2]));
  });

  it("bass increases → shake amplitude increases", () => {
    const noBass = quiet({ bass: 0, time: 1 });
    const highBass = quiet({ bass: 0.9, time: 1 });
    // Shake adds to position — higher bass = more displacement
    const noBassShake = Math.abs(noBass.position[0]) + Math.abs(noBass.position[1]);
    const highBassShake = Math.abs(highBass.position[0]) + Math.abs(highBass.position[1]);
    expect(highBassShake).toBeGreaterThan(noBassShake);
  });

  it("cameraSteadiness dampens shake", () => {
    const loose = compute3DCamera(1, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const steady = compute3DCamera(1, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0, 1.0, 0);
    // Steady camera should have less position displacement from shake
    const looseMag = Math.abs(loose.position[0]) + Math.abs(loose.position[1]) + Math.abs(loose.position[2]);
    const steadyMag = Math.abs(steady.position[0]) + Math.abs(steady.position[1]) + Math.abs(steady.position[2]);
    expect(steadyMag).toBeLessThan(looseMag);
  });

  it("DOF strength increases with energy and climaxIntensity", () => {
    const low = quiet({ energy: 0.1, climaxIntensity: 0 });
    const high = quiet({ energy: 0.9, climaxIntensity: 0.8 });
    expect(high.dofStrength).toBeGreaterThan(low.dofStrength);
  });

  it("vocal presence reduces orbit radius", () => {
    const noVocal = quiet({ vocalPresence: 0, dynamicTime: 0 });
    const withVocal = quiet({ vocalPresence: 0.8, dynamicTime: 0 });
    // At dynamicTime=0: z = radius, vocal should make it closer
    expect(Math.abs(withVocal.position[2])).toBeLessThan(Math.abs(noVocal.position[2]));
  });

  it("drum onset produces position jolt", () => {
    const noDrum = quiet({ drumOnset: 0, time: 1 });
    const withDrum = quiet({ drumOnset: 0.9, time: 1 });
    // Jolt adds displacement
    const noMag = Math.abs(noDrum.position[0]) + Math.abs(noDrum.position[1]) + Math.abs(noDrum.position[2]);
    const withMag = Math.abs(withDrum.position[0]) + Math.abs(withDrum.position[1]) + Math.abs(withDrum.position[2]);
    expect(withMag).toBeGreaterThan(noMag);
  });

  it("deterministic: same inputs = same output", () => {
    const a = compute3DCamera(5, 10, 0.5, 0.3, 0.4, 0.2, 0.1, 0.6, 3, 1, 0.5, 0.5, 0.3);
    const b = compute3DCamera(5, 10, 0.5, 0.3, 0.4, 0.2, 0.1, 0.6, 3, 1, 0.5, 0.5, 0.3);
    expect(a.position).toEqual(b.position);
    expect(a.target).toEqual(b.target);
    expect(a.fov).toBe(b.fov);
    expect(a.dofStrength).toBe(b.dofStrength);
    expect(a.focusDistance).toBe(b.focusDistance);
  });

  it("zero inputs → safe defaults (no NaN, reasonable position)", () => {
    const cam = compute3DCamera(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (const v of cam.position) {
      expect(isNaN(v)).toBe(false);
      expect(isFinite(v)).toBe(true);
    }
    for (const v of cam.target) {
      expect(isNaN(v)).toBe(false);
      expect(isFinite(v)).toBe(true);
    }
    expect(isNaN(cam.fov)).toBe(false);
    expect(cam.fov).toBeGreaterThanOrEqual(45);
  });

  it("FOV widens with energy", () => {
    const lowFov = quiet({ energy: 0 });
    const highFov = quiet({ energy: 1 });
    expect(highFov.fov).toBeGreaterThan(lowFov.fov);
  });

  it("focus distance decreases with energy", () => {
    const lowE = quiet({ energy: 0 });
    const highE = quiet({ energy: 1 });
    expect(highE.focusDistance).toBeLessThan(lowE.focusDistance);
  });

  it("vocal presence dampens shake", () => {
    const noVocal = compute3DCamera(2, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const withVocal = compute3DCamera(2, 0, 0, 0.8, 0, 0.8, 0, 0, 0, 0, 0, 0, 0);
    const noShake = Math.abs(noVocal.position[0]);
    const withShake = Math.abs(withVocal.position[0]);
    expect(withShake).toBeLessThan(noShake);
  });

  it("clamps out-of-range inputs safely", () => {
    const cam = compute3DCamera(0, 0, 5, -1, 2, -0.5, 3, 0, 0, 0, -1, 2, -1);
    expect(cam.fov).toBeGreaterThanOrEqual(45);
    expect(cam.fov).toBeLessThanOrEqual(65);
    expect(cam.dofStrength).toBeGreaterThanOrEqual(0);
    expect(cam.dofStrength).toBeLessThanOrEqual(1);
  });

  it("orbital position changes with dynamicTime", () => {
    const t0 = quiet({ dynamicTime: 0 });
    const t100 = quiet({ dynamicTime: 100 });
    // Different orbital angles should produce different positions
    expect(t0.position[0]).not.toBeCloseTo(t100.position[0], 1);
  });

  it("position has 3 components as tuple", () => {
    const cam = quiet();
    expect(Array.isArray(cam.position)).toBe(true);
    expect(cam.position.length).toBe(3);
    expect(Array.isArray(cam.target)).toBe(true);
    expect(cam.target.length).toBe(3);
  });

  it("DOF strength clamped between 0 and 1", () => {
    const highClimax = quiet({ energy: 1, climaxIntensity: 1 });
    expect(highClimax.dofStrength).toBeLessThanOrEqual(1);
    const zero = quiet({ energy: 0, climaxIntensity: 0 });
    expect(zero.dofStrength).toBeGreaterThanOrEqual(0);
  });

  it("drum onset below threshold produces no jolt", () => {
    const belowThreshold = quiet({ drumOnset: 0.3, time: 1 });
    const noOnset = quiet({ drumOnset: 0, time: 1 });
    // Both should have same position (no jolt below 0.5)
    expect(belowThreshold.position[0]).toBeCloseTo(noOnset.position[0], 5);
  });
});
