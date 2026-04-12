/**
 * diagnose-shaders.ts — Diagnostic script for Dead Air Rust/wgpu shader compatibility.
 *
 * Imports each shader's fragment GLSL from visualizer-poc, applies the same
 * GLSL ES → GLSL 450 transformations that glsl_compat.rs performs, then checks
 * for common failure patterns that cause shaders to render black or fail to compile.
 *
 * Run: npx tsx diagnose-shaders.ts
 * (If import errors, try: NODE_OPTIONS="--experimental-vm-modules" npx tsx diagnose-shaders.ts)
 */

import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SHADER_DIR = join(__dirname, "../visualizer-poc/src/shaders");

// Files to skip (shared modules, tests, non-shader utilities)
const SKIP_FILES = new Set([
  "noise.ts",
  "dual-blend.ts",
  "overlay-sdf.ts",
  "shader-strings.ts",
  "mesh-deformation.ts",
  "mesh-deformation.test.ts",
  "particle-burst.ts",
  "shader-safety.test.ts",
  "wave3-audit.test.ts",
]);

// Flagship / top-20 shaders (the ones that matter most for visual quality)
const FLAGSHIP_SHADERS = new Set([
  "liquid-light",
  "fractal-temple",
  "cosmic-voyage",
  "aurora",
  "protean-clouds",
  "inferno",
  "deep-ocean",
  "oil-projector",
  "tie-dye",
  "volumetric-clouds",
  "volumetric-smoke",
  "volumetric-nebula",
  "smoke-and-mirrors",
  "fractal-zoom",
  "kaleidoscope",
  "sacred-geometry",
  "feedback-recursion",
  "coral-reef",
  "lava-flow",
  "galaxy-spiral",
]);

// ═══════════════════════════════════════════════════════════════════════════════
// GLSL ES → GLSL 450 compatibility transform (mirrors glsl_compat.rs)
// ═══════════════════════════════════════════════════════════════════════════════

/** Variables commonly captured by generated raymarch functions (from glsl_compat.rs) */
const CAPTURE_CANDIDATES = [
  "energy", "bass", "ft", "psyche", "flowTime", "floodLevel",
  "melodicPitch", "eruptionScale", "geyserTime", "tension",
  "drumOnset", "slowE", "vocalP", "sJam", "sSpace",
  "sChorus", "sSolo", "climB", "spaceScore", "aggressive",
  "stability", "onset", "highs", "mids", "timbral",
  "timeVal", "energyVal", "bassVal", "midsVal", "vocalPresence",
  "drumOn", "climaxBoost", "coherence",
  "basePipeRadius", "bassShake", "bassV", "bassVib",
  "beatSnap", "beatSnap2", "bloomState", "cellScale",
  "climaxAmount", "climaxPhase", "corruption", "dcTime",
  "destructionLevel", "dissolveProgress", "drumSnap",
  "expansionPhase", "flowSpeedMod", "gapWidth", "growthRate",
  "hcTime", "icoRadius", "llTime", "majorR", "maTime",
  "melPitch", "musTime", "ncTime", "reelAngle", "rockAngle",
  "sway", "time", "trackStability", "tunnelRadius",
  "baseFluidRadius", "bassBreath", "bassPulse", "bassSize",
  "beatStab", "beatStability", "chaos", "climaxBurst",
  "climaxIntensity", "climaxLift", "climaxOpen", "climaxShatter",
  "d0", "density", "dishCount", "drumV", "emergence", "energyV",
  "filmAdvance", "fl2BeatPulse", "forecast", "fzScale",
  "granDisp", "melodicP", "minorR", "pitch", "randomness",
  "rotSpeed", "sceneTime", "shakeAmp", "slowTime", "twist",
  "twistMult", "ventTime", "viscosity", "wallThickness",
  "beatSteady", "churn", "climax", "climaxAperture",
  "drumShift", "firingRate", "flowPhase", "fzFoldLimit",
  "gemCount", "irregularity", "jamDissolve", "morphAmt",
  "prismAngle", "ringCountMod", "roadW", "rotAngle",
  "rotation", "seismicPhase", "splashWave", "tempoV",
  "tiltDir", "vocalGlow", "weave",
  "blobCount", "branchDensity", "burstAmount", "cellTime",
  "climaxV", "crowdCount", "explSpeed", "fzIterations",
  "halfW", "melodicFreq", "onsetCascade", "shatterAmt",
  "slowEnergy", "tensionV",
  "bassScale", "climaxErupt", "fzFoldDistort", "stabilityV",
  "halfH", "drumSync", "turbulence", "pressureWave", "shatterAmount",
  "climaxWarp", "breachAmount", "pressureOrigin",
  "sectionSpeedMul",
  "numSignals", "fogSteps", "marchSteps", "signalSteps", "steps",
];

function isWordUsedIn(source: string, word: string): boolean {
  const re = new RegExp(`(?<![a-zA-Z0-9_])${escapeRegex(word)}(?![a-zA-Z0-9_])`);
  return re.test(source);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface DiagnosticResult {
  name: string;
  fileName: string;
  lineCount: number;
  isFlagship: boolean;

  // Feature detection
  usesTexture2D: boolean;       // texture2D() calls (pre-conversion)
  usesUPrevFrame: boolean;      // feedback shader needing uPrevFrame
  usesUFFTTexture: boolean;     // FFT texture sampling
  hasGeneratedFuncs: boolean;   // buildRaymarchNormal/AO/Shadow pattern (_rmp param)
  capturedLocals: string[];     // locals captured by generated funcs
  hasDynamicLoops: boolean;     // int x = int(...) used as loop bound
  dynamicLoopVars: string[];    // which variables are dynamic loop bounds
  hasConstMatInit: boolean;     // const mat3/mat2 with expressions (naga issue)
  hasModuleGlobals: boolean;    // module-scope float/vec with assignment (not const)
  uniformCount: number;         // approximate uniform count
  hasPostProcess: boolean;      // uses buildPostProcessGLSL
  hasLighting: boolean;         // uses lightingGLSL
  hasNoise: boolean;            // uses noiseGLSL
  hasRaymarching: boolean;      // uses buildRaymarchNormal/AO/etc.

  // Classification
  category: "simple" | "complex" | "feedback" | "extreme";
  risks: string[];
}

function analyzeShader(name: string, fileName: string, fragSource: string, isFlagship: boolean): DiagnosticResult {
  const lines = fragSource.split("\n");
  const risks: string[] = [];

  // --- Feature detection ---

  const usesTexture2D = fragSource.includes("texture2D(");
  // Distinguish between "declares sampler" (in shared uniforms, harmless — stripped by compat)
  // vs "actually samples from it" (texture2D(uPrevFrame,...) or texture(uPrevFrame,...))
  // The shared uniforms block declares uFFTTexture for every shader, but only some actually
  // sample it. Only actual sampling requires texture binding support in the Rust renderer.
  const samplesUPrevFrame =
    /texture2D\s*\(\s*uPrevFrame/.test(fragSource) ||
    /texture\s*\(\s*uPrevFrame/.test(fragSource);
  const samplesUFFTTexture =
    /texture2D\s*\(\s*uFFTTexture/.test(fragSource) ||
    /texture\s*\(\s*uFFTTexture/.test(fragSource);
  // Keep the old check for backward compat in the result object
  const usesUPrevFrame = samplesUPrevFrame;
  const usesUFFTTexture = samplesUFFTTexture;

  // Generated functions (from buildRaymarchNormal/AO/Shadow)
  const hasGeneratedFuncs = /\w+\(vec3 _rmp/.test(fragSource);

  // Detect captured locals in generated functions
  let capturedLocals: string[] = [];
  if (hasGeneratedFuncs) {
    // Extract generated function bodies
    let genFuncBody = "";
    let inGenFunc = false;
    let depth = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        (trimmed.startsWith("vec3 ") || trimmed.startsWith("float ")) &&
        trimmed.includes("(vec3 _rmp") &&
        trimmed.includes("{")
      ) {
        inGenFunc = true;
        depth = 1;
        genFuncBody += trimmed + " ";
        continue;
      }
      if (inGenFunc) {
        for (const ch of trimmed) {
          if (ch === "{") depth++;
          if (ch === "}") depth--;
        }
        genFuncBody += trimmed + " ";
        if (depth <= 0) inGenFunc = false;
      }
    }

    if (genFuncBody) {
      capturedLocals = CAPTURE_CANDIDATES.filter((v) => isWordUsedIn(genFuncBody, v));
    }
  }

  // Dynamic loop bounds: int x = int(...); then for(... i < x ...) or if(i>=x) break
  const dynamicIntDecls: string[] = [];
  const dynamicLoopVars: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Detect: int varName = int(expr) where expr is NOT a simple constant
    const intMatch = trimmed.match(/int\s+(\w+)\s*=\s*int\(/);
    if (intMatch) {
      dynamicIntDecls.push(intMatch[1]);
    }
    // Also detect: int varName = int(float(...)) or compound expressions
    const intMatch2 = trimmed.match(/int\s+(\w+)\s*=.*int\s*\(\s*(?:mix|clamp|floor|ceil|min|max)\s*\(/);
    if (intMatch2 && !dynamicIntDecls.includes(intMatch2[1])) {
      dynamicIntDecls.push(intMatch2[1]);
    }
  }
  // Check if any of those are used as loop bounds or loop-break conditions
  for (const varName of dynamicIntDecls) {
    // Pattern 1: for(... i < varName ...) — with various whitespace
    const loopPattern = new RegExp(`for\\s*\\([^)]*<\\s*${escapeRegex(varName)}[\\s;)]`);
    // Pattern 2: for(... i <= varName ...)
    const loopPattern2 = new RegExp(`for\\s*\\([^)]*<=\\s*${escapeRegex(varName)}[\\s;)]`);
    // Pattern 3: if(i >= varName) break
    const breakPattern = new RegExp(`if\\s*\\([^)]*>=\\s*${escapeRegex(varName)}[^)]*\\)\\s*break`);
    if (loopPattern.test(fragSource) || loopPattern2.test(fragSource) || breakPattern.test(fragSource)) {
      dynamicLoopVars.push(varName);
    }
  }
  const hasDynamicLoops = dynamicLoopVars.length > 0;

  // const mat3/mat2 with expression (naga may choke on const with * operator)
  const hasConstMatInit = /const\s+mat[234]\s+\w+\s*=\s*mat[234]\s*\([\s\S]*?\)\s*\*/.test(fragSource);

  // Module-scope float/vec globals (not uniform, not const) — may confuse naga scoping
  let hasModuleGlobals = false;
  let braceDepth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    for (const ch of trimmed) {
      if (ch === "{") braceDepth++;
      if (ch === "}") braceDepth--;
    }
    if (braceDepth === 0) {
      if (
        /^(float|vec[234]|int)\s+\w+\s*=/.test(trimmed) &&
        !trimmed.startsWith("const ") &&
        !trimmed.startsWith("uniform ") &&
        !trimmed.startsWith("//")
      ) {
        hasModuleGlobals = true;
      }
    }
  }

  // Count approximate uniforms (from shared block + any extras)
  const uniformLines = fragSource.match(/uniform\s+(float|vec[234]|int|mat[234]|sampler2D)\s+\w+/g);
  const uniformCount = uniformLines ? uniformLines.length : 0;

  // Imported modules
  const hasPostProcess =
    fragSource.includes("applyPostProcess") || fragSource.includes("ppApplyPostProcess");
  const hasLighting = fragSource.includes("sharedDiffuse") || fragSource.includes("sharedSpecular");
  const hasNoise = fragSource.includes("snoise") || fragSource.includes("fbm") || fragSource.includes("fbm3");
  const hasRaymarching = hasGeneratedFuncs;

  // --- Risk assessment ---

  if (usesUPrevFrame) {
    risks.push("FEEDBACK: uses uPrevFrame — stub returns vec4(0.05,0.03,0.08,1) so feedback trail is lost, may look dark/flat");
  }
  if (usesUFFTTexture) {
    risks.push("FFT_TEXTURE: uses uFFTTexture — stub returns vec4(0) so FFT-driven visuals will be dead");
  }
  if (hasDynamicLoops) {
    risks.push(`DYNAMIC_LOOP: dynamic loop bounds (${dynamicLoopVars.join(", ")}) — naga/SPIRV may require constant loop bounds`);
  }
  if (capturedLocals.length > 0) {
    const missing = capturedLocals.filter(
      (v) => !CAPTURE_CANDIDATES.includes(v)
    );
    // Check if any captured locals are NOT in the glsl_compat.rs list
    // (they should all be there, but check for completeness)
    if (capturedLocals.length > 10) {
      risks.push(`MANY_CAPTURES: ${capturedLocals.length} locals captured by generated funcs — high chance of missed variable`);
    }
    // Check if all captures are actually in the candidate list (they should be since we filter by it)
    risks.push(`CAPTURED_LOCALS: ${capturedLocals.length} vars hoisted to globals (${capturedLocals.slice(0, 5).join(", ")}${capturedLocals.length > 5 ? "..." : ""})`);
  }
  if (hasConstMatInit) {
    risks.push("CONST_MAT_EXPR: const mat with expression (e.g., mat3(...) * 1.93) — naga may reject const-expr multiplication");
  }
  if (hasModuleGlobals) {
    risks.push("MODULE_GLOBALS: non-const module-scope variables (e.g., float _pc_prm1 = 0.0) — may need special handling in GLSL 450");
  }
  if (lines.length > 500) {
    risks.push(`VERY_LONG: ${lines.length} lines — high complexity increases transpilation risk`);
  }
  if (lines.length > 300 && lines.length <= 500) {
    risks.push(`LONG: ${lines.length} lines`);
  }

  // Count unique function definitions (non-main)
  const funcDefs = fragSource.match(/(?:void|float|vec[234]|mat[234]|int|bool)\s+\w+\s*\([^)]*\)\s*\{/g);
  const funcCount = funcDefs ? funcDefs.length : 0;
  if (funcCount > 15) {
    risks.push(`MANY_FUNCS: ${funcCount} function definitions — complex shader`);
  }

  // Check for #define with complex expressions
  const defines = fragSource.match(/#define\s+\w+/g);
  const defineCount = defines ? defines.length : 0;

  // Check for mat2 constructor patterns that work differently in GLSL 450
  // In GLSL ES, mat2(a,b,c,d) is column-major, same in 450, but mat2(float) is identity*float
  const hasMat2Inline = /mat2\s*\(\s*[a-zA-Z]/.test(fragSource) && !fragSource.includes("mat2(0");

  // --- Categorization ---
  // NOTE: Line count is NOT a complexity signal here — all shaders include shared
  // uniforms (~190 lines), noise (~150 lines), lighting (~50 lines), and post-process
  // (~300 lines), so every real shader is 1500+ lines. Only actual transpilation
  // risk factors matter for categorization.
  let category: DiagnosticResult["category"];

  const hasTranspilationRisk =
    hasDynamicLoops ||
    hasConstMatInit ||
    hasModuleGlobals;
  const hasCaptureRisk = capturedLocals.length > 5;

  if (usesUPrevFrame && (hasTranspilationRisk || hasCaptureRisk)) {
    category = "extreme";
  } else if (usesUPrevFrame) {
    category = "feedback";
  } else if (hasTranspilationRisk || hasCaptureRisk) {
    category = "complex";
  } else if (capturedLocals.length > 0) {
    // Has captured locals but all in the known list — glsl_compat.rs should handle
    category = "simple";
  } else {
    category = "simple";
  }

  return {
    name,
    fileName,
    lineCount: lines.length,
    isFlagship,
    usesTexture2D,
    usesUPrevFrame,
    usesUFFTTexture,
    hasGeneratedFuncs,
    capturedLocals,
    hasDynamicLoops,
    dynamicLoopVars,
    hasConstMatInit,
    hasModuleGlobals,
    uniformCount,
    hasPostProcess,
    hasLighting,
    hasNoise,
    hasRaymarching,
    category,
    risks,
  };

}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const files = readdirSync(SHADER_DIR)
    .filter(
      (f) =>
        f.endsWith(".ts") &&
        !f.includes(".test.") &&
        !f.startsWith("shared") &&
        !SKIP_FILES.has(f)
    )
    .sort();

  console.log(`\n========================================`);
  console.log(`  Dead Air Shader wgpu Compatibility`);
  console.log(`  Diagnostic Report`);
  console.log(`========================================\n`);
  console.log(`Scanning ${files.length} shader files...\n`);

  const results: DiagnosticResult[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const mod = await import(join(SHADER_DIR, file));
      const fragKey = Object.keys(mod).find((k) => k.endsWith("Frag"));
      if (!fragKey || typeof mod[fragKey] !== "string" || mod[fragKey].length < 100) {
        continue;
      }
      const fragSource: string = mod[fragKey];
      const shaderName = file.replace(".ts", "");
      const isFlagship = FLAGSHIP_SHADERS.has(shaderName);

      const result = analyzeShader(shaderName, file, fragSource, isFlagship);
      results.push(result);
    } catch (e: any) {
      errors.push(`${file}: ${e.message?.slice(0, 120)}`);
    }
  }

  // ─── Summary by category ───
  const simple = results.filter((r) => r.category === "simple");
  const complex = results.filter((r) => r.category === "complex");
  const feedback = results.filter((r) => r.category === "feedback");
  const extreme = results.filter((r) => r.category === "extreme");

  console.log(`─── CATEGORY SUMMARY ───`);
  console.log(`  SIMPLE   (likely works):      ${simple.length} shaders`);
  console.log(`  COMPLEX  (might fail):        ${complex.length} shaders`);
  console.log(`  FEEDBACK (needs uPrevFrame):  ${feedback.length} shaders`);
  console.log(`  EXTREME  (feedback+complex):  ${extreme.length} shaders`);
  console.log(`  TOTAL:                        ${results.length} shaders`);
  if (errors.length > 0) {
    console.log(`  IMPORT ERRORS:                ${errors.length}`);
  }
  console.log();

  // ─── Feature prevalence ───
  console.log(`─── FEATURE PREVALENCE ───`);
  console.log(`  texture2D calls:          ${results.filter((r) => r.usesTexture2D).length}`);
  console.log(`  uPrevFrame (feedback):    ${results.filter((r) => r.usesUPrevFrame).length}`);
  console.log(`  uFFTTexture:              ${results.filter((r) => r.usesUFFTTexture).length}`);
  console.log(`  Generated funcs (_rmp):   ${results.filter((r) => r.hasGeneratedFuncs).length}`);
  console.log(`  Dynamic loop bounds:      ${results.filter((r) => r.hasDynamicLoops).length}`);
  console.log(`  const mat * expr:         ${results.filter((r) => r.hasConstMatInit).length}`);
  console.log(`  Module-scope globals:     ${results.filter((r) => r.hasModuleGlobals).length}`);
  console.log(`  Post-processing chain:    ${results.filter((r) => r.hasPostProcess).length}`);
  console.log(`  Shared lighting:          ${results.filter((r) => r.hasLighting).length}`);
  console.log(`  Noise library:            ${results.filter((r) => r.hasNoise).length}`);
  console.log(`  Raymarching helpers:      ${results.filter((r) => r.hasRaymarching).length}`);
  console.log();

  // ─── Top 20 Flagship Analysis ───
  const flagships = results.filter((r) => r.isFlagship);
  console.log(`─── TOP 20 FLAGSHIP SHADERS ───`);
  console.log();
  for (const r of flagships.sort((a, b) => a.name.localeCompare(b.name))) {
    const icon =
      r.category === "simple"
        ? "OK"
        : r.category === "complex"
          ? "WARN"
          : r.category === "feedback"
            ? "FEED"
            : "CRIT";
    console.log(`  [${icon}] ${r.name} (${r.lineCount} lines, ${r.category})`);
    if (r.risks.length > 0) {
      for (const risk of r.risks) {
        console.log(`        - ${risk}`);
      }
    } else {
      console.log(`        (no detected risks)`);
    }
    console.log();
  }

  // ─── All shaders with risks, grouped by category ───
  console.log(`\n─── SIMPLE SHADERS (${simple.length}) — likely render correctly ───`);
  for (const r of simple.sort((a, b) => a.name.localeCompare(b.name))) {
    const flag = r.isFlagship ? " [FLAGSHIP]" : "";
    console.log(`  ${r.name} (${r.lineCount} lines)${flag}`);
  }

  console.log(`\n─── COMPLEX SHADERS (${complex.length}) — may fail in wgpu ───`);
  for (const r of complex.sort((a, b) => a.name.localeCompare(b.name))) {
    const flag = r.isFlagship ? " [FLAGSHIP]" : "";
    console.log(`  ${r.name} (${r.lineCount} lines)${flag}`);
    for (const risk of r.risks) {
      console.log(`      ${risk}`);
    }
  }

  console.log(`\n─── FEEDBACK SHADERS (${feedback.length}) — need uPrevFrame texture support ───`);
  for (const r of feedback.sort((a, b) => a.name.localeCompare(b.name))) {
    const flag = r.isFlagship ? " [FLAGSHIP]" : "";
    console.log(`  ${r.name} (${r.lineCount} lines)${flag}`);
    for (const risk of r.risks) {
      console.log(`      ${risk}`);
    }
  }

  console.log(`\n─── EXTREME SHADERS (${extreme.length}) — feedback + complex, highest risk ───`);
  for (const r of extreme.sort((a, b) => a.name.localeCompare(b.name))) {
    const flag = r.isFlagship ? " [FLAGSHIP]" : "";
    console.log(`  ${r.name} (${r.lineCount} lines)${flag}`);
    for (const risk of r.risks) {
      console.log(`      ${risk}`);
    }
  }

  // ─── Dynamic loop analysis ───
  const dynamicLoopShaders = results.filter((r) => r.hasDynamicLoops);
  if (dynamicLoopShaders.length > 0) {
    console.log(`\n─── DYNAMIC LOOP BOUNDS (${dynamicLoopShaders.length} shaders) ───`);
    console.log(`  naga/SPIRV may require constant loop bounds. These shaders use`);
    console.log(`  int x = int(mix(...)) as a loop limit, which compiles in WebGL`);
    console.log(`  but may fail in GLSL 450 → SPIRV → WGSL pipeline.\n`);
    for (const r of dynamicLoopShaders.sort((a, b) => a.name.localeCompare(b.name))) {
      const flag = r.isFlagship ? " [FLAGSHIP]" : "";
      console.log(`  ${r.name}: ${r.dynamicLoopVars.join(", ")}${flag}`);
    }
  }

  // ─── Liquid Light deep dive (the reported failure case) ───
  const ll = results.find((r) => r.name === "liquid-light");
  if (ll) {
    console.log(`\n─── LIQUID LIGHT DEEP DIVE (reported rendering as black) ───`);
    console.log(`  Lines: ${ll.lineCount}`);
    console.log(`  Category: ${ll.category}`);
    console.log(`  Generated funcs: ${ll.hasGeneratedFuncs}`);
    console.log(`  Captured locals: ${ll.capturedLocals.join(", ") || "(none)"}`);
    console.log(`  Dynamic loops: ${ll.hasDynamicLoops} ${ll.dynamicLoopVars.length > 0 ? `(${ll.dynamicLoopVars.join(", ")})` : ""}`);
    console.log(`  Uses uPrevFrame: ${ll.usesUPrevFrame}`);
    console.log(`  Uses uFFTTexture: ${ll.usesUFFTTexture}`);
    console.log(`  Post-process: ${ll.hasPostProcess}`);
    console.log(`  Risks:`);
    for (const risk of ll.risks) {
      console.log(`    - ${risk}`);
    }
    console.log();
    console.log(`  ROOT CAUSE ANALYSIS:`);
    if (ll.hasDynamicLoops) {
      console.log(`    * Dynamic loop bounds (${ll.dynamicLoopVars.join(", ")}) are the primary suspect.`);
      console.log(`      naga converts GLSL to SPIRV, which requires analyzable loop bounds.`);
      console.log(`      When the loop bound is int(mix(32.0, 96.0, energy)), SPIRV may:`);
      console.log(`        a) Reject it outright (compilation fail)`);
      console.log(`        b) Replace with 0 iterations (renders black)`);
      console.log(`        c) Use the minimum value (renders dim/incomplete)`);
    }
    if (ll.capturedLocals.length > 0) {
      console.log(`    * ${ll.capturedLocals.length} captured locals in generated raymarch funcs.`);
      console.log(`      glsl_compat.rs hoists these to globals. If any are missed,`);
      console.log(`      the shader compiles but the variable reads 0.0 (black output).`);
    }
    if (ll.hasPostProcess) {
      console.log(`    * Post-processing chain present — if bloom threshold is wrong`);
      console.log(`      or grading clamps too aggressively, output can appear black.`);
    }
  }

  // ─── Import errors ───
  if (errors.length > 0) {
    console.log(`\n─── IMPORT ERRORS (${errors.length}) ───`);
    for (const e of errors) {
      console.log(`  ${e}`);
    }
  }

  // ─── Actionable recommendations ───
  console.log(`\n─── RECOMMENDATIONS FOR glsl_compat.rs ───`);
  console.log();
  console.log(`  1. DYNAMIC LOOP BOUNDS (affects ${dynamicLoopShaders.length} shaders):`);
  console.log(`     Add a pass that converts "int x = int(expr); for(i=0;i<x;...)" to`);
  console.log(`     "for(i=0;i<MAX;...) { if(i>=x) break; }" where MAX is the largest`);
  console.log(`     constant in the mix() range. This preserves behavior while satisfying`);
  console.log(`     SPIRV's analyzable-loop-bounds requirement.`);
  console.log();
  console.log(`  2. CONST MAT EXPRESSIONS (affects ${results.filter((r) => r.hasConstMatInit).length} shaders):`);
  console.log(`     "const mat3 m = mat3(...) * 1.93;" may fail in naga. Convert to`);
  console.log(`     non-const or pre-multiply the matrix values.`);
  console.log();
  console.log(`  3. FEEDBACK SHADERS (${feedback.length + extreme.length} shaders):`);
  console.log(`     The stub "_deadair_sample_prev" returns near-black. These shaders`);
  console.log(`     rely on feeding previous frame back — without real texture support,`);
  console.log(`     they will always look degraded. Priority: implement real ping-pong`);
  console.log(`     buffer in the Rust renderer.`);
  console.log();
  console.log(`  4. MODULE-SCOPE MUTABLE GLOBALS (affects ${results.filter((r) => r.hasModuleGlobals).length} shaders):`);
  console.log(`     Patterns like "float _pc_prm1 = 0.0;" at module scope are valid in`);
  console.log(`     GLSL 450 but naga may handle them differently. Verify these compile.`);
  console.log();

  // Final answer
  const flagshipsOK = flagships.filter((r) => r.category === "simple");
  const flagshipsRisky = flagships.filter((r) => r.category !== "simple");
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  BOTTOM LINE: ${flagshipsOK.length}/${flagships.length} flagship shaders likely render correctly.`);
  console.log(`  ${flagshipsRisky.length}/${flagships.length} flagship shaders need glsl_compat.rs fixes.`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  if (flagshipsOK.length > 0) {
    console.log(`  Likely OK: ${flagshipsOK.map((r) => r.name).join(", ")}`);
  }
  if (flagshipsRisky.length > 0) {
    console.log(`  Needs fixes: ${flagshipsRisky.map((r) => r.name).join(", ")}`);
  }
  console.log();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
