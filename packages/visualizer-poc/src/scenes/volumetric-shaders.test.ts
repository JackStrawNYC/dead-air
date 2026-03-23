import { describe, it, expect } from "vitest";
import { volumetricCloudsVert, volumetricCloudsFrag } from "../shaders/volumetric-clouds";
import { volumetricSmokeVert, volumetricSmokeFrag } from "../shaders/volumetric-smoke";
import { volumetricNebulaVert, volumetricNebulaFrag } from "../shaders/volumetric-nebula";
import { SCENE_REGISTRY, TRANSITION_AFFINITY } from "./scene-registry";
import type { VisualMode } from "../data/types";

// ─── Volumetric Clouds ───

describe("volumetric-clouds shader", () => {
  it("exports vertex and fragment shader strings", () => {
    expect(typeof volumetricCloudsVert).toBe("string");
    expect(typeof volumetricCloudsFrag).toBe("string");
    expect(volumetricCloudsVert.length).toBeGreaterThan(10);
    expect(volumetricCloudsFrag.length).toBeGreaterThan(100);
  });

  it("contains shared uniform declarations", () => {
    expect(volumetricCloudsFrag).toContain("uniform float uBass");
    expect(volumetricCloudsFrag).toContain("uniform float uEnergy");
    expect(volumetricCloudsFrag).toContain("uniform float uTime");
  });

  it("contains noise library functions", () => {
    expect(volumetricCloudsFrag).toContain("fbm");
    expect(volumetricCloudsFrag).toContain("hsvToCosineHue");
  });

  it("has raymarch loop for cloud density", () => {
    expect(volumetricCloudsFrag).toContain("cloudDensity");
    expect(volumetricCloudsFrag).toContain("for (int i = 0;");
  });

  it("references expected audio uniforms", () => {
    expect(volumetricCloudsFrag).toContain("uBass");
    expect(volumetricCloudsFrag).toContain("uEnergy");
    expect(volumetricCloudsFrag).toContain("uDrumOnset");
    expect(volumetricCloudsFrag).toContain("uSlowEnergy");
    expect(volumetricCloudsFrag).toContain("uClimaxPhase");
    expect(volumetricCloudsFrag).toContain("uBeatSnap");
  });

  it("has god ray march toward sun", () => {
    expect(volumetricCloudsFrag).toContain("sunPos");
    expect(volumetricCloudsFrag).toContain("sunDir");
    expect(volumetricCloudsFrag).toContain("phase");
  });

  it("uses energy-gated step count", () => {
    expect(volumetricCloudsFrag).toContain("mix(24.0, 48.0");
  });

  it("uses post-process pipeline", () => {
    expect(volumetricCloudsFrag).toContain("applyPostProcess");
  });

  it("has altitude masking for cloud layer", () => {
    expect(volumetricCloudsFrag).toContain("altMask");
    expect(volumetricCloudsFrag).toContain("smoothstep");
  });
});

// ─── Volumetric Smoke ───

describe("volumetric-smoke shader", () => {
  it("exports vertex and fragment shader strings", () => {
    expect(typeof volumetricSmokeVert).toBe("string");
    expect(typeof volumetricSmokeFrag).toBe("string");
    expect(volumetricSmokeVert.length).toBeGreaterThan(10);
    expect(volumetricSmokeFrag.length).toBeGreaterThan(100);
  });

  it("contains shared uniform declarations", () => {
    expect(volumetricSmokeFrag).toContain("uniform float uBass");
    expect(volumetricSmokeFrag).toContain("uniform float uEnergy");
  });

  it("contains noise library with curlNoise", () => {
    expect(volumetricSmokeFrag).toContain("curlNoise");
    expect(volumetricSmokeFrag).toContain("fbm");
  });

  it("has raymarch loop for smoke density", () => {
    expect(volumetricSmokeFrag).toContain("smokeDens");
    expect(volumetricSmokeFrag).toContain("for (int i = 0;");
  });

  it("references expected audio uniforms", () => {
    expect(volumetricSmokeFrag).toContain("uBass");
    expect(volumetricSmokeFrag).toContain("uEnergy");
    expect(volumetricSmokeFrag).toContain("uDrumOnset");
    expect(volumetricSmokeFrag).toContain("uVocalEnergy");
    expect(volumetricSmokeFrag).toContain("uSectionIndex");
    expect(volumetricSmokeFrag).toContain("uSlowEnergy");
  });

  it("has 3 volumetric spotlight cones", () => {
    expect(volumetricSmokeFrag).toContain("spotPos");
    expect(volumetricSmokeFrag).toContain("spotDir");
    expect(volumetricSmokeFrag).toContain("coneAtten");
  });

  it("uses energy-gated step count", () => {
    expect(volumetricSmokeFrag).toContain("mix(24.0, 40.0");
  });

  it("has custom inline bloom (not buildPostProcessGLSL)", () => {
    expect(volumetricSmokeFrag).toContain("bloomThreshold");
    expect(volumetricSmokeFrag).toContain("bloomAmount");
    expect(volumetricSmokeFrag).toContain("cinematicGrade");
  });

  it("drum onset triggers smoke bursts", () => {
    expect(volumetricSmokeFrag).toContain("drumOnset * 0.4");
  });
});

// ─── Volumetric Nebula ───

describe("volumetric-nebula shader", () => {
  it("exports vertex and fragment shader strings", () => {
    expect(typeof volumetricNebulaVert).toBe("string");
    expect(typeof volumetricNebulaFrag).toBe("string");
    expect(volumetricNebulaVert.length).toBeGreaterThan(10);
    expect(volumetricNebulaFrag.length).toBeGreaterThan(100);
  });

  it("contains shared uniform declarations", () => {
    expect(volumetricNebulaFrag).toContain("uniform float uBass");
    expect(volumetricNebulaFrag).toContain("uniform float uEnergy");
  });

  it("contains noise library with ridgedMultifractal", () => {
    expect(volumetricNebulaFrag).toContain("ridged4");
    expect(volumetricNebulaFrag).toContain("fbm3");
  });

  it("has raymarch loop with emission+absorption model", () => {
    expect(volumetricNebulaFrag).toContain("nebulaAccum");
    expect(volumetricNebulaFrag).toContain("nebulaAlpha");
    expect(volumetricNebulaFrag).toContain("for (int i = 0;");
  });

  it("references expected audio uniforms", () => {
    expect(volumetricNebulaFrag).toContain("uBass");
    expect(volumetricNebulaFrag).toContain("uEnergy");
    expect(volumetricNebulaFrag).toContain("uDrumOnset");
    expect(volumetricNebulaFrag).toContain("uHarmonicTension");
    expect(volumetricNebulaFrag).toContain("uMelodicPitch");
    expect(volumetricNebulaFrag).toContain("uSlowEnergy");
  });

  it("uses energy-gated step count (32-64)", () => {
    expect(volumetricNebulaFrag).toContain("mix(32.0, 64.0");
  });

  it("has star field function", () => {
    expect(volumetricNebulaFrag).toContain("starField");
  });

  it("harmonic tension drives color saturation", () => {
    expect(volumetricNebulaFrag).toContain("tension");
    expect(volumetricNebulaFrag).toContain("lowTensionColor");
    expect(volumetricNebulaFrag).toContain("highTensionColor");
  });

  it("melodic pitch drives nebula scale", () => {
    expect(volumetricNebulaFrag).toContain("nebulaScale");
    expect(volumetricNebulaFrag).toContain("pitch");
  });

  it("uses post-process pipeline with bloom offset and CA", () => {
    expect(volumetricNebulaFrag).toContain("applyPostProcess");
  });
});

// ─── Registry Integration ───

describe("volumetric shader registry", () => {
  it("registry has 69 total entries", () => {
    expect(Object.keys(SCENE_REGISTRY).length).toBe(73);
  });

  it("volumetric_clouds is registered with correct affinity", () => {
    const entry = SCENE_REGISTRY.volumetric_clouds;
    expect(entry).toBeDefined();
    expect(entry.energyAffinity).toBe("low");
    expect(entry.complement).toBe("volumetric_smoke");
    expect(entry.preferredTransitionIn).toBe("dissolve");
  });

  it("volumetric_smoke is registered with correct affinity", () => {
    const entry = SCENE_REGISTRY.volumetric_smoke;
    expect(entry).toBeDefined();
    expect(entry.energyAffinity).toBe("mid");
    expect(entry.complement).toBe("concert_lighting");
    expect(entry.preferredTransitionIn).toBe("void");
  });

  it("volumetric_nebula is registered with correct affinity", () => {
    const entry = SCENE_REGISTRY.volumetric_nebula;
    expect(entry).toBeDefined();
    expect(entry.energyAffinity).toBe("any");
    expect(entry.complement).toBe("cosmic_voyage");
    expect(entry.preferredTransitionIn).toBe("dissolve");
  });

  it("complements point to valid modes", () => {
    const allModes = Object.keys(SCENE_REGISTRY) as VisualMode[];
    expect(allModes).toContain(SCENE_REGISTRY.volumetric_clouds.complement);
    expect(allModes).toContain(SCENE_REGISTRY.volumetric_smoke.complement);
    expect(allModes).toContain(SCENE_REGISTRY.volumetric_nebula.complement);
  });

  it("transition affinity entries exist for all 3 volumetric shaders", () => {
    expect(TRANSITION_AFFINITY.volumetric_clouds).toBeDefined();
    expect(TRANSITION_AFFINITY.volumetric_smoke).toBeDefined();
    expect(TRANSITION_AFFINITY.volumetric_nebula).toBeDefined();
    expect(TRANSITION_AFFINITY.volumetric_clouds!.length).toBe(3);
    expect(TRANSITION_AFFINITY.volumetric_smoke!.length).toBe(3);
    expect(TRANSITION_AFFINITY.volumetric_nebula!.length).toBe(3);
  });

  it("transition affinity targets are valid modes", () => {
    const allModes = Object.keys(SCENE_REGISTRY) as VisualMode[];
    for (const targets of [
      TRANSITION_AFFINITY.volumetric_clouds!,
      TRANSITION_AFFINITY.volumetric_smoke!,
      TRANSITION_AFFINITY.volumetric_nebula!,
    ]) {
      for (const target of targets) {
        expect(allModes).toContain(target);
      }
    }
  });
});
