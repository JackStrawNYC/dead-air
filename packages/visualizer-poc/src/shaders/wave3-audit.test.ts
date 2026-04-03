import { describe, it, expect } from "vitest";
import { volumetricNebulaFrag } from "./volumetric-nebula";
import { kaleidoscopeFrag } from "./kaleidoscope";
import { sacredGeometryFrag } from "./sacred-geometry";
import { mandalaEngineFrag } from "./mandala-engine";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import type { AudioSnapshot } from "../utils/audio-reactive";

describe("Fix 1: volumetric-nebula uSectionType", () => {
  it("reads uSectionType in fragment shader", () => {
    expect(volumetricNebulaFrag).toContain("uSectionType");
  });

  it("has section-type gates (sJam, sSpace, sChorus, sSolo)", () => {
    expect(volumetricNebulaFrag).toContain("sJam");
    expect(volumetricNebulaFrag).toContain("sSpace");
    expect(volumetricNebulaFrag).toContain("sChorus");
    expect(volumetricNebulaFrag).toContain("sSolo");
  });

  it("modulates flowTime by section type", () => {
    expect(volumetricNebulaFrag).toContain("sJam * 0.5");
    expect(volumetricNebulaFrag).toContain("sSpace * 0.4");
  });
});

describe("Fix 2: uChordConfidence uniform", () => {
  it("declares uChordConfidence in shared uniforms", () => {
    expect(sharedUniformsGLSL).toContain("uniform float uChordConfidence;");
  });

  it("AudioSnapshot includes chordConfidence field", () => {
    // Type-level check: this compiles only if chordConfidence exists
    const snapshot: Pick<AudioSnapshot, "chordConfidence"> = { chordConfidence: 0.5 };
    expect(snapshot.chordConfidence).toBe(0.5);
  });

  it("sacred-geometry gates chord effects by confidence", () => {
    expect(sacredGeometryFrag).toContain("uChordConfidence");
    expect(sacredGeometryFrag).toContain("chordConf");
  });

  it("kaleidoscope gates chord effects by confidence", () => {
    expect(kaleidoscopeFrag).toContain("uChordConfidence");
    expect(kaleidoscopeFrag).toContain("chordConf");
  });

  it("mandala-engine gates chord effects by confidence", () => {
    expect(mandalaEngineFrag).toContain("uChordConfidence");
    expect(mandalaEngineFrag).toContain("chordConf");
  });
});

describe("Fix 3: PostProcess conditional compilation", () => {
  it("includes cinematic grade by default", () => {
    const glsl = buildPostProcessGLSL();
    expect(glsl).toContain("cinematicGrade");
  });

  it("excludes lens distortion when disabled", () => {
    const glsl = buildPostProcessGLSL({ lensDistortionEnabled: false });
    expect(glsl).not.toContain("barrelDistort");
  });

  it("does not include beat jolt by default (stripped)", () => {
    const glsl = buildPostProcessGLSL();
    expect(glsl).not.toContain("beatJolt");
  });

  it("includes light leak by default (restored cinematic effect)", () => {
    const glsl = buildPostProcessGLSL();
    expect(glsl).toContain("lightLeak");
  });

  it("excludes light leak when disabled", () => {
    const glsl = buildPostProcessGLSL({ lightLeakEnabled: false });
    expect(glsl).not.toContain("lightLeak");
  });

  it("includes era grading by default", () => {
    const glsl = buildPostProcessGLSL();
    expect(glsl).toContain("uEraBrightness");
    expect(glsl).toContain("uEraSepia");
  });

  it("excludes era grading when disabled", () => {
    const glsl = buildPostProcessGLSL({ eraGradingEnabled: false });
    expect(glsl).not.toContain("uEraBrightness");
    expect(glsl).not.toContain("uEraSepia");
  });
});

describe("Fix 4: Song identities JSON-canonical", () => {
  it("loads at least 50 song identities", async () => {
    const { SONG_IDENTITIES } = await import("../data/song-identities");
    expect(Object.keys(SONG_IDENTITIES).length).toBeGreaterThanOrEqual(50);
  });

  it("bertha identity has expected palette", async () => {
    const { SONG_IDENTITIES } = await import("../data/song-identities");
    expect(SONG_IDENTITIES["bertha"]).toBeDefined();
    expect(SONG_IDENTITIES["bertha"].palette.primary).toBe(15);
  });
});
