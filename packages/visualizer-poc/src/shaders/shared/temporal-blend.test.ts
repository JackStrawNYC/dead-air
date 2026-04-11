import { describe, it, expect } from "vitest";
import { temporalBlendVert, temporalBlendFrag } from "./temporal-blend.glsl";

describe("temporal-blend: shader strings", () => {
  it("exports non-empty vertex shader", () => {
    expect(temporalBlendVert.length).toBeGreaterThan(0);
  });

  it("exports non-empty fragment shader", () => {
    expect(temporalBlendFrag.length).toBeGreaterThan(0);
  });

  it("vertex shader sets vUv and gl_Position", () => {
    expect(temporalBlendVert).toContain("vUv = uv");
    expect(temporalBlendVert).toContain("gl_Position");
  });

  it("fragment shader declares required uniforms", () => {
    expect(temporalBlendFrag).toContain("uniform sampler2D uInputTexture");
    expect(temporalBlendFrag).toContain("uniform sampler2D uPrevFrame");
    expect(temporalBlendFrag).toContain("uniform float uTemporalBlendStrength");
    expect(temporalBlendFrag).toContain("uniform float uEnergy");
  });

  it("fragment shader contains luminance-based rejection mask", () => {
    // The rejection mask uses luminance weights (0.299, 0.587, 0.114)
    expect(temporalBlendFrag).toContain("vec3(0.299, 0.587, 0.114)");
    // smoothstep rejection thresholds
    expect(temporalBlendFrag).toContain("smoothstep(0.05, 0.20, lumDiff)");
    // Rejection variable
    expect(temporalBlendFrag).toContain("rejection");
  });

  it("fragment shader computes luminance difference for ghosting prevention", () => {
    expect(temporalBlendFrag).toContain("lumDiff");
    expect(temporalBlendFrag).toContain("current - previous");
  });

  it("fragment shader uses mix for temporal blending", () => {
    expect(temporalBlendFrag).toContain("mix(current, previous, blendFactor)");
  });

  it("fragment shader modulates blend by energy", () => {
    // Energy dampening prevents smoothing sharp transients
    expect(temporalBlendFrag).toContain("uEnergy");
    expect(temporalBlendFrag).toContain("energyDampen");
  });

  it("fragment shader combines strength, rejection, and energy into blend factor", () => {
    expect(temporalBlendFrag).toContain(
      "uTemporalBlendStrength * rejection * energyDampen"
    );
  });

  it("fragment shader reads both current and previous frame textures", () => {
    expect(temporalBlendFrag).toContain("texture2D(uInputTexture, vUv)");
    expect(temporalBlendFrag).toContain("texture2D(uPrevFrame, vUv)");
  });
});
