import { describe, it, expect } from "vitest";
import { dualBlendVert, dualBlendFrag } from "../shaders/dual-blend";
import { getShaderStrings } from "../shaders/shader-strings";
import { selectTransitionStyle } from "../utils/transition-selector";
import type { VisualMode } from "../data/types";

// ─── Dual Blend Shader ───

describe("dual-blend shader", () => {
  it("exports vertex and fragment shader strings", () => {
    expect(typeof dualBlendVert).toBe("string");
    expect(typeof dualBlendFrag).toBe("string");
    expect(dualBlendVert.length).toBeGreaterThan(10);
    expect(dualBlendFrag.length).toBeGreaterThan(100);
  });

  it("references uSceneA, uSceneB, uBlendProgress, uBlendMode", () => {
    expect(dualBlendFrag).toContain("uSceneA");
    expect(dualBlendFrag).toContain("uSceneB");
    expect(dualBlendFrag).toContain("uBlendProgress");
    expect(dualBlendFrag).toContain("uBlendMode");
  });

  it("contains all 5 blend mode branches", () => {
    // luminance key
    expect(dualBlendFrag).toContain("lumB");
    // noise dissolve
    expect(dualBlendFrag).toContain("fbm3");
    // additive
    expect(dualBlendFrag).toContain("a + b * progress");
    // multiplicative
    expect(dualBlendFrag).toContain("a * b");
    // depth aware
    expect(dualBlendFrag).toContain("depthMask");
  });

  it("contains noise import for dissolve mode", () => {
    expect(dualBlendFrag).toContain("fbm3");
  });
});

// ─── Shader Strings ───

describe("shader-strings", () => {
  it("returns null for Three.js scenes (particle_nebula, crystal_cavern)", () => {
    expect(getShaderStrings("particle_nebula")).toBeNull();
    expect(getShaderStrings("crystal_cavern")).toBeNull();
  });

  it("returns non-null for GLSL FullscreenQuad scenes", () => {
    const glslModes: VisualMode[] = [
      "liquid_light", "concert_lighting", "tie_dye", "inferno",
      "deep_ocean", "aurora", "cosmic_dust", "oil_projector",
      "sacred_geometry", "kaleidoscope", "fractal_zoom",
      "volumetric_clouds", "volumetric_smoke", "volumetric_nebula",
    ];
    for (const mode of glslModes) {
      const strings = getShaderStrings(mode);
      expect(strings).not.toBeNull();
      expect(strings!.vert.length).toBeGreaterThan(10);
      expect(strings!.frag.length).toBeGreaterThan(100);
    }
  });

  it("returns vert and frag string properties", () => {
    const strings = getShaderStrings("liquid_light");
    expect(strings).toHaveProperty("vert");
    expect(strings).toHaveProperty("frag");
    expect(typeof strings!.vert).toBe("string");
    expect(typeof strings!.frag).toBe("string");
  });
});

// ─── Transition Selector (new shader styles) ───

describe("transition-selector shader styles", () => {
  it("shader_luminance selectable at high energy + flux", () => {
    // Try multiple energy combos to hit the deterministic coin flip
    let found = false;
    for (let i = 0; i < 20; i++) {
      const eBefore = 0.2 + i * 0.01;
      const eAfter = 0.5 + i * 0.01;
      const style = selectTransitionStyle(eBefore, eAfter, undefined, undefined, undefined, 0.3);
      if (style === "shader_luminance") {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("shader_dissolve selectable at moderate energy", () => {
    let found = false;
    for (let i = 0; i < 30; i++) {
      const eBefore = 0.2 + i * 0.005;
      const eAfter = 0.25 + i * 0.005;
      const style = selectTransitionStyle(eBefore, eAfter, undefined, undefined, undefined, 0.1);
      if (style === "shader_dissolve") {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("scene preferences still override shader styles", () => {
    const style = selectTransitionStyle(0.5, 0.5, undefined, "flash", undefined, 0.3);
    expect(style).toBe("flash");
  });

  it("low energy does not produce shader transitions", () => {
    const style = selectTransitionStyle(0.0, 0.0, undefined, undefined, undefined, 0.0);
    expect(style).not.toContain("shader_");
  });

  it("spectralFlux parameter is optional (backward compatible)", () => {
    const style = selectTransitionStyle(0.3, 0.5);
    expect(typeof style).toBe("string");
  });
});
