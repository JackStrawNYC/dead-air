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
  it("flash selected for large energy jump up", () => {
    const style = selectTransitionStyle(0.05, 0.3, undefined, undefined, undefined, 0.1);
    expect(style).toBe("flash");
  });

  it("void selected for large energy drop", () => {
    const style = selectTransitionStyle(0.3, 0.05, undefined, undefined, undefined, 0.1);
    expect(style).toBe("void");
  });

  it("distortion selected for high spectral flux", () => {
    const style = selectTransitionStyle(0.15, 0.15, undefined, undefined, undefined, 0.35);
    expect(style).toBe("distortion");
  });

  it("morph selected for jam sections with moderate energy change", () => {
    const style = selectTransitionStyle(0.1, 0.2, "jam", undefined, undefined, 0.1);
    expect(style).toBe("morph");
  });

  it("void selected for space sections", () => {
    const style = selectTransitionStyle(0.1, 0.1, "space", undefined, undefined);
    expect(style).toBe("void");
  });

  it("dissolve selected for neutral transitions", () => {
    const style = selectTransitionStyle(0.15, 0.15, "verse", undefined, undefined, 0.05);
    expect(style).toBe("dissolve");
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
