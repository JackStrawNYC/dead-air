import { describe, it, expect } from "vitest";
import { decideDualShader } from "./dual-shader-climax";

describe("decideDualShader", () => {
  it("returns inactive when no climax and no interplay lock", () => {
    expect(decideDualShader(0, undefined).active).toBe(false);
    expect(decideDualShader(undefined, undefined).active).toBe(false);
    expect(decideDualShader(undefined, "call-response").active).toBe(false);
  });

  it("activates additive blend during climax phase 2 (peak)", () => {
    const r = decideDualShader(2, undefined);
    expect(r.active).toBe(true);
    expect(r.blendMode).toBe("additive");
    expect(r.blendProgress).toBe(0.45);
  });

  it("PEAK clarity guard — phase 2 blend < phase 3 blend", () => {
    // Audit warning: dual composition muddies peaks. Phase 2 (the moment
    // of impact) must keep blendProgress below the 0.5 equal-mix point so
    // the primary stays dominant; phase 3 (sustain) reaches 0.5.
    const peak = decideDualShader(2, undefined).blendProgress;
    const sustain = decideDualShader(3, undefined).blendProgress;
    expect(peak).toBeLessThan(sustain);
    expect(peak).toBeLessThan(0.5);
  });

  it("build (1) and release (4) both hint at partner subtly", () => {
    expect(decideDualShader(1, undefined).blendProgress).toBe(0.30);
    expect(decideDualShader(4, undefined).blendProgress).toBe(0.30);
  });

  it("tight-lock interplay activates depth_aware blend at 0.5", () => {
    const r = decideDualShader(0, "tight-lock");
    expect(r.active).toBe(true);
    expect(r.blendMode).toBe("depth_aware");
    expect(r.blendProgress).toBe(0.5);
  });

  it("climax wins over tight-lock when both active (additive transcendent feel)", () => {
    const r = decideDualShader(2, "tight-lock");
    expect(r.blendMode).toBe("additive");
    expect(r.blendProgress).toBe(0.45);
  });

  it("non-lock interplay modes do not activate dual on their own", () => {
    expect(decideDualShader(0, "call-response").active).toBe(false);
    expect(decideDualShader(0, "textural-wash").active).toBe(false);
    expect(decideDualShader(0, "solo-spotlight").active).toBe(false);
  });
});
