import { describe, it, expect } from "vitest";
import { dofVert, dofFrag } from "./dof-postpass.glsl";
import { buildDepthAlphaOutput } from "./raymarching.glsl";

describe("dof-postpass: shader strings", () => {
  it("exports non-empty vertex shader", () => {
    expect(dofVert.length).toBeGreaterThan(0);
  });

  it("exports non-empty fragment shader", () => {
    expect(dofFrag.length).toBeGreaterThan(0);
  });

  it("vertex shader sets vUv and gl_Position", () => {
    expect(dofVert).toContain("vUv = uv");
    expect(dofVert).toContain("gl_Position");
  });

  it("fragment shader declares required uniforms", () => {
    expect(dofFrag).toContain("uniform sampler2D uInputTexture");
    expect(dofFrag).toContain("uniform vec2 uResolution");
    expect(dofFrag).toContain("uniform float uCamDof");
    expect(dofFrag).toContain("uniform float uCamFocusDist");
    expect(dofFrag).toContain("uniform float uMaxDist");
  });

  it("fragment shader reads depth from alpha channel", () => {
    expect(dofFrag).toContain("center.a");
  });

  it("fragment shader computes circle of confusion", () => {
    expect(dofFrag).toContain("uCamDof * 20.0");
    expect(dofFrag).toContain("clamp(coc, 0.0, 1.0)");
  });

  it("fragment shader has early-out for in-focus pixels", () => {
    expect(dofFrag).toContain("coc < 0.01");
  });

  it("fragment shader uses 8-tap disc sampling", () => {
    expect(dofFrag).toContain("vec2 discSample(int i)");
    expect(dofFrag).toContain("for (int i = 0; i < 8; i++)");
  });

  it("fragment shader mixes sharp and blurred with smoothstep", () => {
    expect(dofFrag).toContain("mix(sharp, blurred, smoothstep(0.0, 0.15, coc))");
  });

  it("fragment shader preserves alpha (depth) in output", () => {
    expect(dofFrag).toContain("vec4(col, depth)");
    expect(dofFrag).toContain("vec4(sharp, depth)");
  });

  it("fragment shader uses scatter-as-gather tap weighting", () => {
    // Taps are weighted by their own CoC, not just by uniform weight
    expect(dofFrag).toContain("float w = 0.2 + tapCoc");
  });
});

describe("buildDepthAlphaOutput", () => {
  it("generates valid GLSL alpha assignment", () => {
    const result = buildDepthAlphaOutput("totalDist", "12.0");
    expect(result).toBe(
      "gl_FragColor.a = clamp(totalDist / 12.0, 0.0, 1.0);"
    );
  });

  it("accepts variable expressions for maxDist", () => {
    const result = buildDepthAlphaOutput("d", "MAX_DIST");
    expect(result).toBe("gl_FragColor.a = clamp(d / MAX_DIST, 0.0, 1.0);");
  });

  it("embeds the distance variable name exactly", () => {
    const result = buildDepthAlphaOutput("myRayLen", "20.0");
    expect(result).toContain("myRayLen");
    expect(result).toContain("20.0");
  });
});
