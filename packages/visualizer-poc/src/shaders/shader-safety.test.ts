/**
 * Shader Safety Regression Test
 *
 * Catches the architectural bugs that previously broke d2t06 rendering:
 *
 *   1. Per-shader broken `max(col, prev * decay)` feedback pattern
 *      → fix: use shared `temporalBlendEnabled: true` in postprocess config
 *
 *   2. IQ cosine palette pattern fed song hue uniforms
 *      → fix: use `paletteHueColor(hue, sat, val)` from noise.ts
 *
 *   3. Linear hue mix `hsv2rgb(vec3(mix(baseHue, paletteHue, t), s, v))` that
 *      overshoots into wrong hue zones for cool palettes
 *      → fix: use `safeBlendHue(baseHue, paletteHue, t, s, v)` from noise.ts
 *
 * These patterns silently produce broken visuals (green-clump splatter, stuck
 * channels, color flooding) when shaders are used with palettes they weren't
 * designed for. The bugs are easy to copy-paste accidentally because the math
 * looks reasonable but is mathematically wrong.
 *
 * This test scans every .ts file in src/shaders/ and fails if any of the
 * broken patterns are present. CI catches the regression before it ships.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const SHADERS_DIR = join(__dirname);

// Files we deliberately exclude:
// - noise.ts: contains the documented examples of the broken patterns in
//   COMMENTS for the helper functions; the helpers themselves are correct.
// - This test file itself.
// - Test files (*.test.ts).
// - Subdirectories handled separately (we walk only the top level).
const EXCLUDED_FILES = new Set([
  "noise.ts",
  "shader-safety.test.ts",
  "overlay-sdf.ts", // SDF helpers, not a fragment shader
]);

function getShaderFiles(): string[] {
  return readdirSync(SHADERS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => !f.endsWith(".test.ts"))
    .filter((f) => !EXCLUDED_FILES.has(f));
}

function readShader(filename: string): string {
  return readFileSync(join(SHADERS_DIR, filename), "utf-8");
}

describe("shader-safety: broken feedback pattern", () => {
  // Bug: `col = max(col, prev * feedbackDecay)` is a per-channel max that
  // pins bright values for ~3-7 seconds and produces stuck color clumps.
  // Fix: replace with `temporalBlendEnabled: true` in the postprocess config,
  // which uses proper `mix(col, prev, blend)` math.
  const shaderFiles = getShaderFiles();

  for (const filename of shaderFiles) {
    it(`${filename} does not use broken max() feedback`, () => {
      const content = readShader(filename);
      // Match: `max(col, prev * <anything>)` or `max(col, <anything> * prev)`
      // and `max(col, texture2D(uPrevFrame, ...).rgb * <anything>)`.
      // We allow `min()` and `mix()` — only `max()` produces the bug.
      const brokenPattern = /max\s*\(\s*col\s*,\s*[^)]*prev[^)]*\)/;
      expect(
        brokenPattern.test(content),
        `${filename} contains broken \`max(col, prev * decay)\` feedback. ` +
          `Replace with \`temporalBlendEnabled: true\` in the postprocess config and delete the in-shader feedback block.`
      ).toBe(false);
    });
  }
});

describe("shader-safety: IQ cosine palette fed song hue uniforms", () => {
  // Bug: `0.5 + 0.5 * cos(TAU * vec3(hue1, hue1 + 0.33, hue1 + 0.67))` is
  // a procedural color generator, NOT a hue-to-color function. For a song
  // hue input (e.g. 0.722 = purple), it produces an unrelated color
  // (e.g. neon yellow-green). Use `paletteHueColor(hue, sat, val)` instead.
  //
  // Note: this pattern is VALID when fed a spatially-varying input (e.g.
  // `cos(TAU * vec3(uv.x + time, ...))` — that's procedural variation).
  // We only flag the variant where the input is named `hue1`/`hue2`/etc,
  // which is the unambiguous "fed song palette uniform" case.
  const shaderFiles = getShaderFiles();

  for (const filename of shaderFiles) {
    it(`${filename} does not use cos-palette with song hue uniforms`, () => {
      const content = readShader(filename);
      // Match: `cos(TAU * vec3(hue1, hue1 + 0.33, hue1 + 0.67))` or `hue2` variant
      // Allows whitespace variation. Captures the bug pattern only when the
      // hue identifier is `hue1`, `hue2`, `hueA`, `hueB` — clear song-palette inputs.
      const brokenPattern =
        /cos\s*\(\s*TAU\s*\*\s*vec3\s*\(\s*hue[12AB]\s*,\s*hue[12AB]\s*\+\s*0\.33\s*,\s*hue[12AB]\s*\+\s*0\.67\s*\)\s*\)/;
      expect(
        brokenPattern.test(content),
        `${filename} uses the IQ cosine palette pattern with a song palette uniform. ` +
          `Replace \`0.5 + 0.5 * cos(TAU * vec3(hue1, hue1 + 0.33, hue1 + 0.67))\` ` +
          `with \`paletteHueColor(hue1, sat, val)\` from noise.ts.`
      ).toBe(false);
    });
  }
});

describe("shader-safety: linear hue mix overshoot", () => {
  // Bug: `hsv2rgb(vec3(mix(baseHue, palHue, t), s, v))` linearly blends
  // hues, which can overshoot the hue circle (e.g. mix(amber=0.097,
  // purple=0.722, 0.4) = 0.347 = green). Use `safeBlendHue` (shortest-arc).
  const shaderFiles = getShaderFiles();

  for (const filename of shaderFiles) {
    it(`${filename} does not use linear hue mix into hsv2rgb`, () => {
      const content = readShader(filename);
      // Match: hsv2rgb( vec3( mix( ... , ... , ...) , ... , ...) )
      // We're conservative: only flag the inner mix when its 1st arg ends
      // with `Hue` (a hue variable) and its 2nd arg starts with `hue` (a
      // palette hue uniform). Other uses of mix() inside hsv2rgb() are fine.
      const brokenPattern =
        /hsv2rgb\s*\(\s*vec3\s*\(\s*mix\s*\(\s*\w*Hue\s*,\s*hue[12AB]/;
      expect(
        brokenPattern.test(content),
        `${filename} uses linear hue mix that can overshoot into wrong hue zones. ` +
          `Replace \`hsv2rgb(vec3(mix(baseHue, paletteHue, t), s, v))\` ` +
          `with \`safeBlendHue(baseHue, paletteHue, t, s, v)\` from noise.ts.`
      ).toBe(false);
    });
  }
});

describe("shader-safety: postprocess.glsl architectural fixes", () => {
  // The postprocess chain itself had three architectural bugs that have
  // been fixed. Sanity-check that the fixes are still in place so they
  // can't be silently reverted.
  const postprocess = readFileSync(
    join(SHADERS_DIR, "shared", "postprocess.glsl.ts"),
    "utf-8"
  );

  it("envelope hue rotation uses HSV space, not 2D R-G matrix", () => {
    // The broken version was a `mat3(...) * col` rotation in the R-G plane
    // with `max(0)` clamping. The fixed version uses rgb2hsv → hue +=
    // offset → hsv2rgb. Look for the rgb2hsv usage in the envelope hue
    // rotation block.
    expect(
      postprocess.includes("rgb2hsv(col)") &&
        postprocess.includes("uEnvelopeHue / 6.28318530718"),
      "envelope hue rotation must use proper HSV rotation (rgb2hsv → rotate → hsv2rgb), " +
        "not the broken 2D R-G matrix rotation"
    ).toBe(true);
  });

  it("cinematicGrade saturation factor is capped (in noise.ts)", () => {
    const noiseTs = readFileSync(join(SHADERS_DIR, "noise.ts"), "utf-8");
    expect(
      noiseTs.includes("clamp(satFactor, 0.0, 1.5)"),
      "cinematicGrade saturation extrapolation must be capped at 1.5 to prevent " +
        "channel overshoot. The unclamped version could push to 2.55+ and " +
        "produce broken hue rotations."
    ).toBe(true);
  });

  it("postprocess applies a final HDR safety clamp", () => {
    expect(
      postprocess.includes("clamp(col, vec3(0.0), vec3(2.0))"),
      "applyPostProcess must end with a final HDR safety clamp [0, 2] to prevent " +
        "any single bug from cascading into runaway color accumulation."
    ).toBe(true);
  });
});

describe("shader-safety: noise.ts palette helpers exist", () => {
  // The fix relies on these helpers being available. Sanity-check the API
  // so they can't be silently removed.
  const noiseTs = readFileSync(join(SHADERS_DIR, "noise.ts"), "utf-8");

  it("paletteHueColor helper is defined", () => {
    expect(
      noiseTs.includes("vec3 paletteHueColor(float palHue, float sat, float val)"),
      "paletteHueColor() helper must be available in noise.ts for shaders to use " +
        "instead of the broken IQ cosine palette pattern."
    ).toBe(true);
  });

  it("safeBlendHue helper is defined", () => {
    expect(
      noiseTs.includes("vec3 safeBlendHue(float baseHue, float palHue, float blendStrength, float sat, float val)"),
      "safeBlendHue() helper must be available in noise.ts for shaders to use " +
        "instead of the broken linear hue mix pattern."
    ).toBe(true);
  });
});
