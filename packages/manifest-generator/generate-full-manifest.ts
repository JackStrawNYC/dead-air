#!/usr/bin/env npx tsx
/**
 * Full Manifest Generator — extracts ALL visual intelligence from the TypeScript
 * engine into a JSON manifest for the Rust GPU renderer.
 *
 * This is the "brain" bridge: it runs SongVisualizer + SceneRouter logic headlessly
 * (no React, no Remotion, no browser) by importing the pure utility functions directly.
 *
 * Outputs a manifest with:
 *   - All shader GLSL strings
 *   - Per-frame: shader_id, transitions, blend modes, 175+ uniforms
 *   - Scene routing decisions (reactive triggers, jam evolution, dual-shader composition)
 *   - Audio-derived structural analysis (climax, coherence, stems, sections)
 *
 * Usage:
 *   npx tsx generate-full-manifest.ts \
 *     --data-dir ../visualizer-poc/data \
 *     --output manifest.json \
 *     --fps 60 --width 3840 --height 2160
 *
 * Type-correctness status (audit Debt #6):
 *   The previous-session signature mismatches have been resolved: callers now
 *   align with current callee signatures (computeAudioSnapshot, computeReactiveTriggers,
 *   detectJamCycle, GrooveState/GrooveVisualModifiers default shapes, era source).
 *   The try/catch fallbacks are still present — they protect against runtime failures
 *   inside the analysis utilities themselves, not type errors.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, createWriteStream, statSync } from "fs";
import { join, resolve } from "path";

const __dirname = new URL(".", import.meta.url).pathname;
const VISUALIZER_ROOT = resolve(__dirname, "../visualizer-poc");

// ─── Pure utility imports from visualizer-poc ───
// All 15 modules verified as PURE (no React/Remotion/browser deps)

import { computeAudioSnapshot, buildBeatArray } from "../visualizer-poc/src/utils/audio-reactive.js";
import { classifyStemSection, detectSolo } from "../visualizer-poc/src/utils/stem-features.js";
import { detectStemInterplay } from "../visualizer-poc/src/utils/stem-interplay.js";
import { computeCoherence, batchComputeCoherence } from "../visualizer-poc/src/utils/coherence.js";
import { computeITResponse } from "../visualizer-poc/src/utils/it-response.js";
import { computeDrumsSpacePhase } from "../visualizer-poc/src/utils/drums-space-phase.js";
import { computeClimaxState, climaxModulation } from "../visualizer-poc/src/utils/climax-state.js";
import { computeReactiveTriggers } from "../visualizer-poc/src/utils/reactive-triggers.js";
import { detectGroove, grooveModifiers } from "../visualizer-poc/src/utils/groove-detector.js";
import { detectJamCycle } from "../visualizer-poc/src/utils/jam-cycles.js";
import { getSectionVocabulary } from "../visualizer-poc/src/utils/section-vocabulary.js";
import { computeNarrativeDirective } from "../visualizer-poc/src/utils/visual-narrator.js";
import { detectPeakOfShow } from "../visualizer-poc/src/utils/peak-of-show.js";
import { findNearestBeat } from "../visualizer-poc/src/scenes/routing/beat-sync.js";
import { dynamicCrossfadeDuration } from "../visualizer-poc/src/scenes/routing/crossfade-timing.js";
import { getModeForSection } from "../visualizer-poc/src/scenes/routing/shader-variety.js";
import { TRANSITION_AFFINITY, SCENE_REGISTRY } from "../visualizer-poc/src/scenes/scene-registry.js";
import { lookupSongIdentity, getOrGenerateSongIdentity, setActiveShowDate } from "../visualizer-poc/src/data/song-identities.js";
import { computeShowVisualSeed, type ShowVisualSeed } from "../visualizer-poc/src/utils/show-visual-seed.js";
import { hashString } from "@dead-air/audio-core/hash";

// ─── Overlay imports (for --with-overlays mode) ───
import { buildRotationSchedule, getOverlayOpacities } from "../visualizer-poc/src/data/overlay-rotation.js";
import { OVERLAY_REGISTRY, OVERLAY_BY_NAME, ALWAYS_ACTIVE } from "../visualizer-poc/src/data/overlay-registry.js";
import { getEraPreset } from "../visualizer-poc/src/data/era-presets.js";
import type { SectionBoundary, EnhancedFrameData } from "../visualizer-poc/src/data/types.js";

// ─── Shader collection (same as generate-manifest.ts) ───

export async function collectShaderGLSL(): Promise<Record<string, string>> {
  const shaders: Record<string, string> = {};
  const shaderDir = join(VISUALIZER_ROOT, "src/shaders");
  const skipFiles = new Set([
    "noise.ts", "dual-blend.ts", "overlay-sdf.ts", "shader-strings.ts",
    "mesh-deformation.ts", "particle-burst.ts",
  ]);
  const files = readdirSync(shaderDir)
    .filter(f => f.endsWith(".ts") && !f.includes(".test.") && !f.startsWith("shared") && !skipFiles.has(f));

  for (const file of files) {
    try {
      const mod = await import(join(shaderDir, file));
      const fragKey = Object.keys(mod).find(k => k.endsWith("Frag"));
      if (fragKey && typeof mod[fragKey] === "string" && mod[fragKey].length > 100) {
        const shaderId = file.replace(".ts", "").replace(/-/g, "_");
        shaders[shaderId] = mod[fragKey];
      }
    } catch (e) { console.warn(`  [WARN] shader import failed for ${file}: ${(e as Error).message?.slice(0,80)}`); }
  }
  return shaders;
}

// ─── Audio helpers ───

function gaussianSmooth(frames: any[], idx: number, field: string, win: number): number {
  const half = Math.floor(win / 2);
  let sum = 0, w = 0;
  for (let i = -half; i <= half; i++) {
    const fi = Math.max(0, Math.min(frames.length - 1, idx + i));
    const g = Math.exp((-i * i) / (2 * (win / 4) ** 2));
    sum += (frames[fi]?.[field] ?? 0) * g;
    w += g;
  }
  return w > 0 ? sum / w : 0;
}

function chromaHue(f: any): number {
  const c = f.chroma;
  if (!c || !Array.isArray(c)) return 180;
  let mi = 0, mv = 0;
  for (let i = 0; i < 12; i++) if ((c[i] ?? 0) > mv) { mv = c[i]; mi = i; }
  return mi * 30;
}

function sectionTypeFloat(st?: string): number {
  const map: Record<string, number> = {
    intro: 0, verse: 1, chorus: 2, bridge: 3, solo: 4, jam: 5, outro: 6, space: 7,
  };
  return map[st ?? "jam"] ?? 5;
}

// ─── Pre-computed smoothed arrays (avoids O(n²) per-frame Gaussian) ───

interface SmoothedArrays {
  energy: Float32Array;      // rms, window 25
  slowEnergy: Float32Array;  // rms, window 90
  fastEnergy: Float32Array;  // rms, window 5
  bass: Float32Array;        // sub+low, window 15
  fastBass: Float32Array;    // sub, window 5
  mids: Float32Array;        // mid, window 12
  highs: Float32Array;       // high, window 12
}

function precomputeSmoothed(frames: any[]): SmoothedArrays {
  const n = frames.length;
  const result: SmoothedArrays = {
    energy: new Float32Array(n),
    slowEnergy: new Float32Array(n),
    fastEnergy: new Float32Array(n),
    bass: new Float32Array(n),
    fastBass: new Float32Array(n),
    mids: new Float32Array(n),
    highs: new Float32Array(n),
  };

  // Smoothing: react to 2-4 second musical phrases. Not individual hits,
  // but not so slow it feels disconnected from the music.
  // Analysis is ~10fps, so window=30 ≈ 3 seconds.
  for (let i = 0; i < n; i++) {
    result.energy[i] = gaussianSmooth(frames, i, "rms", 35);      // ~3.5s (musical phrase)
    result.slowEnergy[i] = gaussianSmooth(frames, i, "rms", 100); // ~10s (song arc)
    result.fastEnergy[i] = gaussianSmooth(frames, i, "rms", 8);   // ~0.8s (responsive)
    result.bass[i] = gaussianSmooth(frames, i, "sub", 25) + gaussianSmooth(frames, i, "low", 25); // ~2.5s
    result.fastBass[i] = gaussianSmooth(frames, i, "sub", 8);     // ~0.8s
    result.mids[i] = gaussianSmooth(frames, i, "mid", 20);        // ~2s
    result.highs[i] = gaussianSmooth(frames, i, "high", 20);      // ~2s
  }

  return result;
}

/// Interpolate a numeric field between two analysis frames.
/// Returns the blended value at fractional position `t` (0=lo, 1=hi).
function lerpField(frames: any[], loIdx: number, hiIdx: number, field: string, t: number): number {
  const lo = frames[loIdx]?.[field] ?? 0;
  const hi = frames[hiIdx]?.[field] ?? 0;
  return lo + (hi - lo) * t;
}

/// Get the interpolated analysis frame index and blend factor for 60fps output.
/// Returns { lo, hi, t } where lo/hi are integer indices and t is 0-1 blend.
function getInterpolatedIndex(outputFrame: number, afps: number, fps: number, frameCount: number): { lo: number; hi: number; t: number } {
  const exact = outputFrame * (afps / fps);
  const lo = Math.min(Math.floor(exact), frameCount - 1);
  const hi = Math.min(lo + 1, frameCount - 1);
  const t = exact - lo;
  return { lo, hi, t };
}

// ─── Structural analysis per frame ───

interface SongContext {
  frames: any[];
  sections: any[];
  tempo: number;
  isDrumsSpace: boolean;
  songSeed: number;
  setNumber: number;
  songIndexInSet: number;
  totalSongsInSet: number;
  showSongsCompleted: number;
  totalShowSongs: number;
  usedShaderModes: Map<string, number>;
}

/**
 * Find the section containing `idx` and return its [start, end) bounds.
 * Sections in the manifest may use either `start`/`end` or `frameStart`/`frameEnd`
 * field names — accept both. Falls back to the whole song when no match.
 */
function findSectionBounds(
  sections: any[],
  idx: number,
  totalFrames: number,
): { start: number; end: number } {
  if (!sections || sections.length === 0) {
    return { start: 0, end: totalFrames };
  }
  for (const s of sections) {
    const start = s.start ?? s.frameStart ?? 0;
    const end = s.end ?? s.frameEnd ?? start + (s.length ?? 0);
    if (idx >= start && idx < end) {
      return { start, end };
    }
  }
  return { start: 0, end: totalFrames };
}

function analyzeFrame(
  ctx: SongContext,
  idx: number,
  prevState: any,
  smoothed?: SmoothedArrays,
): any {
  const { frames, sections, tempo, isDrumsSpace } = ctx;
  const f = frames[idx] ?? {};

  // Use pre-smoothed values (O(1) lookup) instead of re-computing Gaussian per frame
  const snapshot: any = smoothed ? {
    energy: smoothed.energy[idx] ?? 0,
    slowEnergy: smoothed.slowEnergy[idx] ?? 0,
    fastEnergy: smoothed.fastEnergy[idx] ?? 0,
    bass: smoothed.bass[idx] ?? 0,
    fastBass: smoothed.fastBass[idx] ?? 0,
    mids: smoothed.mids[idx] ?? 0,
    highs: smoothed.highs[idx] ?? 0,
    rms: f.rms ?? 0,
    onset: f.onset ?? 0,
    beat: f.beat ? 1 : 0,
    beatConfidence: f.beatConfidence ?? 0.5,
    beatStability: 0.5,
    spectralFlux: f.spectralFlux ?? 0,
    centroid: f.centroid ?? 0.5,
    flatness: f.flatness ?? 0.5,
    drumOnset: f.stemDrumOnset ?? 0,
    vocalPresence: f.stemVocalPresence ?? 0,
    chromaHue: 180,
    musicalTime: idx / 30,
    localTempo: f.localTempo ?? 120,
  } : (() => {
    try {
      return computeAudioSnapshot(frames, idx, undefined, 30);
    } catch (e) { if (idx === 0) console.warn(`    [WARN] computeAudioSnapshot FAILED: ${(e as Error).message?.slice(0,100)}`);

      return {
        energy: gaussianSmooth(frames, idx, "rms", 25),
        bass: gaussianSmooth(frames, idx, "sub", 15),
        mids: gaussianSmooth(frames, idx, "mid", 12),
        highs: gaussianSmooth(frames, idx, "high", 12),
        rms: f.rms ?? 0,
        onset: f.onset ?? 0,
        beat: f.beat ? 1 : 0,
        spectralFlux: f.spectralFlux ?? 0,
        centroid: f.centroid ?? 0.5,
      };
    }
  })();

  // Structural analysis (all pure functions)
  let stemSection = "jam";
  let soloState = null;
  let interplay = null;
  let coherenceState = { isLocked: false, score: 0 };
  let itState = { forceTranscendentShader: false };
  let drumsSpaceState = null;
  let climaxState = { phase: "idle", intensity: 0 };
  let climaxMod = { saturationOffset: 0, brightnessOffset: 0, bloomOffset: 0 };
  // Default ReactiveState matching the real type (reactive-triggers.ts).
  let reactiveState: import("../visualizer-poc/src/utils/reactive-triggers.js").ReactiveState = {
    isTriggered: false,
    triggerType: null,
    triggerStrength: 0,
    triggerAge: 0,
    suggestedModes: [],
    overlayInjections: [],
    cooldownRemaining: 0,
  };
  // Default GrooveState matching groove-detector.ts
  let groove: import("../visualizer-poc/src/utils/groove-detector.js").GrooveState = {
    type: "pocket",
    confidence: 0,
  };
  let grooveMods: import("../visualizer-poc/src/utils/groove-detector.js").GrooveVisualModifiers = {
    temperatureShift: 0,
    motionMult: 1.0,
    regularity: 0.5,
    pulseMult: 1.0,
  };
  let jamCycle = { phase: "setup", progress: 0, isDeepening: false, cycleCount: 0 };
  let sectionVocab = { overlayDensityMult: 1.0, driftSpeedMult: 1.0 };
  let narrative = { saturationOffset: 0, temperature: 0, overlayDensityMult: 1.0, motionMult: 1.0 };
  let peakOfShow = { isPeak: false, intensity: 0 };

  // Track which analysis functions succeed (logged once on first frame)
  const failures: string[] = [];

  try { stemSection = classifyStemSection(snapshot); } catch (e) { failures.push(`stemSection: ${(e as Error).message?.slice(0,60)}`); }
  try { soloState = detectSolo(snapshot); } catch (e) { failures.push(`solo: ${(e as Error).message?.slice(0,60)}`); }
  // Use precomputed values if available (O(1) lookup vs O(window) scan)
  if ((ctx as any)._preComputed) {
    const pre = (ctx as any)._preComputed;
    interplay = pre.interplay[idx] ?? null;
    coherenceState = pre.coherence[idx] ?? { isLocked: false, score: 0 };
    itState = pre.it[idx] ?? { forceTranscendentShader: false };
    climaxState = pre.climax[idx] ?? { phase: "idle", intensity: 0 };
    reactiveState = pre.reactive[idx] ?? { triggered: false, triggerType: null, shaderPool: [] };
    jamCycle = pre.jamCycle[idx] ?? { phase: "setup", progress: 0, isDeepening: false };
    try { drumsSpaceState = computeDrumsSpacePhase(frames, idx, isDrumsSpace); } catch (e) { failures.push(`drumsSpace: ${(e as Error).message?.slice(0,60)}`); }
    try { climaxMod = climaxModulation(climaxState as any); } catch (e) { failures.push(`climaxMod: ${(e as Error).message?.slice(0,60)}`); }
  } else {
    try { interplay = detectStemInterplay(frames, idx); } catch (e) { failures.push(`interplay: ${(e as Error).message?.slice(0,60)}`); }
    try { coherenceState = computeCoherence(frames, idx); } catch (e) { failures.push(`coherence: ${(e as Error).message?.slice(0,60)}`); }
    try { itState = computeITResponse(frames, idx); } catch (e) { failures.push(`IT: ${(e as Error).message?.slice(0,60)}`); }
    try { drumsSpaceState = computeDrumsSpacePhase(frames, idx, isDrumsSpace); } catch (e) { failures.push(`drumsSpace: ${(e as Error).message?.slice(0,60)}`); }
    try { climaxState = computeClimaxState(frames, idx, sections); } catch (e) { failures.push(`climax: ${(e as Error).message?.slice(0,60)}`); }
    try { climaxMod = climaxModulation(climaxState as any); } catch (e) { failures.push(`climaxMod: ${(e as Error).message?.slice(0,60)}`); }
    // Locate section bounds for the current frame so reactive triggers can
    // reason about position within the section.
    const sectionBounds = findSectionBounds(sections, idx, frames.length);
    try {
      reactiveState = computeReactiveTriggers(
        frames, idx,
        sectionBounds.start, sectionBounds.end,
        tempo,
        coherenceState.isLocked,
      );
    } catch (e) { failures.push(`reactive: ${(e as Error).message?.slice(0,60)}`); }
  }
  try {
    groove = detectGroove(
      snapshot.beatStability ?? 0.5,
      snapshot.drumOnset ?? 0,
      snapshot.energy ?? 0.3,
      snapshot.flatness ?? 0.5,
    );
    grooveMods = grooveModifiers(groove);
  } catch (e) { failures.push(`groove: ${(e as Error).message?.slice(0,60)}`); }
  try {
    const b = findSectionBounds(sections, idx, frames.length);
    jamCycle = detectJamCycle(frames, idx, b.start, b.end);
  } catch (e) { failures.push(`jamCycle: ${(e as Error).message?.slice(0,60)}`); }
  try { sectionVocab = getSectionVocabulary(stemSection) as any; } catch (e) { failures.push(`sectionVocab: ${(e as Error).message?.slice(0,60)}`); }
  try {
    narrative = computeNarrativeDirective({
      setNumber: ctx.setNumber,
      setProgress: ctx.songIndexInSet / Math.max(1, ctx.totalSongsInSet),
      sectionType: stemSection,
      grooveType: groove.type,
      jamPhase: jamCycle.phase,
      energy: snapshot.energy ?? 0.3,
      climaxPhase: climaxState.phase,
      songProgress: idx / Math.max(1, frames.length),
    } as any) as any;
  } catch (e) { failures.push(`narrative: ${(e as Error).message?.slice(0,60)}`); }

  // Log analysis status on first frame of each song
  if (idx === 0) {
    if (failures.length > 0) {
      console.warn(`    [WARN] ${failures.length}/${failures.length + 13 - failures.length} analysis functions FAILED:`);
      for (const f of failures) console.warn(`      - ${f}`);
    } else {
      console.log(`    [OK] All 13 analysis functions succeeded`);
    }
  }

  return {
    stemSection,
    soloState,
    interplay,
    coherenceState,
    itState,
    drumsSpaceState,
    climaxState,
    climaxMod,
    reactiveState,
    groove,
    grooveMods,
    jamCycle,
    sectionVocab,
    narrative,
    peakOfShow,
    snapshot,
  };
}

// ─── Scene routing (full SceneRouter decision tree) ───

// Seeded RNG for deterministic shader selection
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Complementary shader pools for dual composition
const DUAL_POOLS: Record<string, string[]> = {
  protean_clouds: ["aurora", "cosmic_voyage", "void_light"],
  fractal_temple: ["deep_ocean", "mandala_engine", "sacred_geometry"],
  liquid_light: ["tie_dye", "oil_projector", "fluid_2d"],
  inferno: ["electric_arc", "lava_flow", "fire_mountain_smoke"],
  aurora: ["cosmic_voyage", "void_light", "particle_nebula"],
  cosmic_voyage: ["aurora", "void_light", "protean_clouds"],
  deep_ocean: ["crystal_cavern", "bioluminescence", "void_light"],
};

function getDualPool(mode: string): string[] {
  return DUAL_POOLS[mode] ?? ["aurora", "cosmic_voyage", "void_light"];
}

interface RouteState {
  currentSectionIdx: number;
  currentMode: string;
  sectionStartFrame: number;
  sectionEndFrame: number;
}

// Hold durations per section type (values are at 30fps — scaled to output fps at usage site)
const MIN_HOLD_FRAMES_30: Record<string, number> = {
  jam: 5400,     // 3 minutes
  solo: 2700,    // 90 seconds
  space: 9000,   // 5 minutes
  verse: 900,    // 30 seconds
  chorus: 900,   // 30 seconds
  bridge: 900,   // 30 seconds
  intro: 450,    // 15 seconds
  outro: 450,    // 15 seconds
};

function shouldHoldShader(
  outFrame: number,
  shaderStartFrame: number,
  currentSectionIdx: number,
  sections: { start: number; end: number }[],
  analysisFrames: any[],
  afps: number,
  fps: number,
): boolean {
  const section = sections[currentSectionIdx];
  if (!section) return false;
  const analysisIdx = Math.min(
    Math.floor(outFrame * (afps / fps)),
    analysisFrames.length - 1,
  );
  const sectionType = analysisFrames[Math.max(0, analysisIdx)]?.sectionType ?? "verse";
  const minHold = (MIN_HOLD_FRAMES_30[sectionType] ?? 900) * (fps / 30);

  // Walk backward through contiguous same-type sections to find the true hold start
  let holdStart = section.start;
  for (let i = currentSectionIdx - 1; i >= 0; i--) {
    const prevAnalysisIdx = Math.min(
      Math.floor(sections[i].start * (afps / fps)),
      analysisFrames.length - 1,
    );
    const prevType = analysisFrames[Math.max(0, prevAnalysisIdx)]?.sectionType;
    if (prevType !== sectionType) break;
    holdStart = sections[i].start;
  }

  // The shader hasn't been held long enough since it started
  return (outFrame - Math.max(holdStart, shaderStartFrame)) < minHold;
}

function routeScene(
  ctx: SongContext,
  analysis: any,
  frameIdx: number,
  prevShaderId: string,
  defaultMode: string,
  routeState: RouteState,
): { shaderId: string; secondaryId: string | null; blendProgress: number | null; blendMode: string | null } {
  const { itState, drumsSpaceState, reactiveState, climaxState, coherenceState, jamCycle, groove } = analysis;
  const energy = analysis.snapshot?.energy ?? 0.3;
  const beat = ctx.frames[Math.min(frameIdx, ctx.frames.length - 1)]?.beat ? 1 : 0;

  // Priority 1: IT transcendent forcing — DISABLED in manifest generator.
  // The simplified batch coherence detection is too sensitive (locks 94% of frames),
  // forcing nearly the entire show into a 4-shader pool. The real Remotion engine
  // has more nuanced frame-by-frame coherence that works correctly.
  // TODO: calibrate batch coherence thresholds to match real-time behavior.
  // if (itState?.forceTranscendentShader) { ... }

  // Priority 2: Drums/Space override
  if (drumsSpaceState?.subPhase) {
    const dsMap: Record<string, string> = {
      drums_build: "inferno",
      drums_peak: "electric_arc",
      space_ambient: "cosmic_voyage",
      space_textural: "aurora",
      space_melodic: "void_light",
    };
    const ds = dsMap[drumsSpaceState.subPhase] ?? defaultMode;
    if (ds !== prevShaderId) {
      return { shaderId: ds, secondaryId: prevShaderId, blendProgress: 0.5, blendMode: "dissolve" };
    }
    return { shaderId: ds, secondaryId: null, blendProgress: null, blendMode: null };
  }

  // Priority 3: Reactive trigger injection
  if (reactiveState?.triggered && reactiveState.shaderPool?.length > 0) {
    const pool = reactiveState.shaderPool;
    const pick = pool[Math.floor(seededRandom(ctx.songSeed + frameIdx * 3) * pool.length)];
    return { shaderId: pick, secondaryId: prevShaderId, blendProgress: 0.3, blendMode: "dissolve" };
  }

  // Priority 4: Section crossfade
  const sectionLen = routeState.sectionEndFrame - routeState.sectionStartFrame;
  const sectionProgress = sectionLen > 0 ? (frameIdx - routeState.sectionStartFrame) / sectionLen : 0;
  const fps = (ctx as any).fps ?? 60;
  // dynamicCrossfadeDuration was imported but never called; the old
  // hardcoded `min(90 * fpsScale, sectionLen * 0.15)` capped fades at
  // 3s and produced sub-second crossfades for short sections — this
  // is the "shader transitions felt abrupt" Cornell-feedback signal.
  // The dynamic helper picks 2-12s based on quiet/loud context AND
  // accounts for spectral flux at the boundary.
  const dynamicLen = ctx.frames
    ? dynamicCrossfadeDuration(
        ctx.frames as any,
        Math.max(0, Math.min(ctx.frames.length - 1, routeState.sectionStartFrame)),
        60,
        fps,
      )
    : Math.round(180 * (fps / 30)); // 6s default
  const crossfadeLen = Math.min(dynamicLen, Math.max(1, Math.floor(sectionLen * 0.30)));

  // Crossfade IN: first frames of a new section. Window scales with
  // crossfadeLen / sectionLen so even very long sections get the full
  // dynamic fade (was capped at 15% of section).
  const crossfadeWindow = sectionLen > 0 ? Math.min(0.45, crossfadeLen / sectionLen) : 0.15;
  if (sectionProgress < crossfadeWindow && prevShaderId !== routeState.currentMode && crossfadeLen > 0) {
    const crossfadeProgress = sectionProgress / crossfadeWindow;
    // Blend mode based on energy delta
    let blendMode = "dissolve";
    if (energy > 0.4) blendMode = "luminance_key";
    else if (energy < 0.08) blendMode = "additive";
    return {
      shaderId: routeState.currentMode,
      secondaryId: prevShaderId,
      blendProgress: crossfadeProgress,
      blendMode,
    };
  }

  // Priority 5: Dual-shader composition
  const dualCooldown = routeState.currentSectionIdx > 0 && routeState.currentSectionIdx % 3 === 0;
  const dualEnergyThreshold = ctx.setNumber === 1 ? 0.18 : 0.12;
  const dualBlendCap = ctx.setNumber === 1 ? 0.35 : 0.55;

  const climaxPhase = climaxState?.phase ?? "idle";
  const climaxForceDual = (climaxPhase === "climax" || climaxPhase === "sustain") && energy > 0.08;
  const stemSection = analysis.stemSection ?? "jam";
  const longSection = sectionLen >= 600;

  const shouldDual = !dualCooldown && (
    climaxForceDual ||
    (longSection && (energy > dualEnergyThreshold || stemSection === "jam" || stemSection === "solo"))
  );

  if (shouldDual) {
    const pool = getDualPool(routeState.currentMode);
    const secondaryMode = pool[Math.floor(seededRandom(routeState.currentSectionIdx * 13 + ctx.songSeed) * pool.length)];

    // Asymmetric blend: energy-reactive + beat-pulsed + arc-shaped
    const sectionRamp = Math.min(1, sectionProgress / 0.2); // ramp up over first 20%
    const baseBlend = 0.10 + energy * 0.30;
    const arcBlend = Math.sin(sectionProgress * Math.PI) * 0.12;
    const beatPulse = beat ? 0.15 * Math.max(0.3, energy) : 0;
    const blendProgress = Math.min(dualBlendCap, (baseBlend + arcBlend + beatPulse) * sectionRamp);

    let blendMode = "dissolve";
    if (energy > 0.5) blendMode = "luminance_key";
    else if (energy > 0.3) blendMode = "additive";

    return {
      shaderId: routeState.currentMode,
      secondaryId: secondaryMode,
      blendProgress,
      blendMode,
    };
  }

  // Priority 6: Dead air (after music ends)
  // (handled by uniform envelope_brightness → 0, not shader routing)

  // Default: render current section's mode
  return { shaderId: routeState.currentMode, secondaryId: null, blendProgress: null, blendMode: null };
}

// ─── Compute all uniforms ───

function computeUniforms(
  frames: any[], idx: number, fps: number, tempo: number,
  width: number, height: number, globalTime: number,
  analysis: any,
  smoothed: SmoothedArrays,
  idxHi?: number,
  interpT?: number,
  song?: any,
  songProgress?: number,
  sectionProgress?: number,
  showVisualSeed?: ShowVisualSeed | null,
  showEra?: string,
): Record<string, number> {
  void showEra; // reserved for future use (currently derived from setlist.era at call site)
  const f = frames[idx] ?? {};
  const t = interpT ?? 0;
  const hi = idxHi ?? idx;
  const time = globalTime + idx / fps + (t / fps);

  // Shorthand: interpolate a raw frame field between lo and hi
  const L = (field: string, fallback = 0) => lerpField(frames, idx, hi, field, t) || fallback;

  // Interpolate pre-computed smoothed values (O(1) lookup instead of O(window) per call)
  const lerpSmoothed = (arr: Float32Array) => {
    const v0 = arr[idx];
    if (idx === hi) return v0;
    return v0 + (arr[hi] - v0) * t;
  };

  const energy = lerpSmoothed(smoothed.energy);
  const slowEnergy = lerpSmoothed(smoothed.slowEnergy);
  const bass = lerpSmoothed(smoothed.bass);
  const mids = lerpSmoothed(smoothed.mids);
  const highs = lerpSmoothed(smoothed.highs);

  // Smoothstep helper
  const ss = (t2: number) => { const c = Math.max(0, Math.min(1, t2)); return c * c * (3 - 2 * c); };

  // Energy factor with smoothstep (wider range than before)
  const factor = ss((energy - 0.05) / 0.30);

  // Structural analysis values (discrete state machines — don't interpolate phases)
  const climax = analysis?.climaxState ?? { phase: "idle", intensity: 0 };

  // Envelope brightness: dark quiet, bright loud, but never washed
  // Quiet: 0.45 (dim but visible) → Loud: 1.15 (vivid, punchy)
  let envBrightness = 0.45 + Math.sqrt(factor) * 0.70;

  // Envelope saturation: RICH, not muted. The Dead = vivid color.
  // Quiet: 0.80 (still colorful) → Loud: 1.40 (psychedelic vivid)
  const satKnee = 0.80 + factor * 0.60;
  let envSaturation = satKnee;

  // Climax modulation: meaningful boosts that a viewer FEELS
  const climaxPhase = climax.phase;
  const climaxT = ss(climax.intensity ?? 0);
  if (climaxPhase === "climax") {
    envBrightness += 0.15 * climaxT;
    envSaturation += 0.25 * climaxT;
  } else if (climaxPhase === "sustain") {
    envBrightness += 0.10 * climaxT;
    envSaturation += 0.15 * climaxT;
  } else if (climaxPhase === "build") {
    envBrightness += 0.03 * climaxT;
    envSaturation -= 0.05 * climaxT;
  } else if (climaxPhase === "release") {
    envBrightness -= 0.03 * climaxT;
    envSaturation += 0.05 * climaxT;
  } else {
    // idle: subdued, intimate
    envSaturation -= 0.08 * climaxT;
    envBrightness -= 0.05 * climaxT;
  }

  // Hue: drums/space phase + chroma breathing
  let hueShiftDeg = 0;
  const sType = f.sectionType ?? "";
  if (sType === "space" || sType === "ambient") {
    hueShiftDeg += 15; // blue shift for space
  } else if (sType === "drums" || sType === "percussion") {
    hueShiftDeg += 12; // warm shift for drums
  }
  // Chroma breathing: dominant pitch class modulates hue ±5 degrees
  const chromaHueNorm = chromaHue(f) / 360; // 0-1
  const chromaBreathing = (chromaHueNorm - 0.5) * 10 * Math.min(1, energy * 4);
  hueShiftDeg += chromaBreathing;
  const envHue = hueShiftDeg * (Math.PI / 180); // convert to radians

  // Rich, vivid range — the Dead is NOT muted
  envBrightness = Math.max(0.35, Math.min(1.20, envBrightness));
  envSaturation = Math.max(0.75, Math.min(1.50, envSaturation));
  const climaxPhaseMap: Record<string, number> = { idle: 0, build: 1, climax: 2, sustain: 3, release: 4 };
  const jamCycle = analysis?.jamCycle ?? { phase: "setup", progress: 0 };
  const jamPhaseMap: Record<string, number> = { setup: 0, exploration: 1, building: 2, peak_space: 3, resolution: 4 };
  const coherence = analysis?.coherenceState?.score ?? 0;

  return {
    time, dynamic_time: time, beat_time: time, // overwritten by frame loop accumulator
    musical_time: (time * tempo / 60) % 1, tempo,
    // Restore energy — the Dead plays LOUD. Let the shaders feel it.
    energy: energy * 0.95,
    rms: L("rms") * 0.95,
    bass: bass * 0.90,
    mids, highs,
    onset: L("onset") * 0.5, // dampened but present — onsets drive visual accents
    centroid: L("centroid", 0.5),
    beat: f.beat ? 0.8 : 0,  // perceptible beat pulse
    slow_energy: slowEnergy,
    fast_energy: lerpSmoothed(smoothed.fastEnergy),
    fast_bass: lerpSmoothed(smoothed.fastBass),
    // Spectral flux: if not in analysis, approximate from energy derivative
    spectral_flux: L("spectralFlux") || Math.abs(lerpSmoothed(smoothed.fastEnergy) - energy) * 3,
    energy_accel: lerpSmoothed(smoothed.fastEnergy) - energy,
    energy_trend: energy - slowEnergy,
    onset_snap: L("onset") * 0.5, beat_snap: f.beat ? 0.6 : 0, // musical pulse
    beat_confidence: L("beatConfidence", 0.5),
    beat_stability: L("beatStability", 0.5),
    downbeat: f.downbeat ? 1 : 0,  // discrete
    drum_onset: L("stemDrumOnset"),
    drum_beat: f.stemDrumBeat ? 1 : 0,  // discrete
    stem_bass: L("stemBassRms") ?? 0,
    stem_drums: L("stemDrumOnset"),
    vocal_energy: L("stemVocalRms"),
    vocal_presence: L("stemVocalPresence") > 0.5 ? 1 : 0,
    other_energy: L("stemOtherRms"),
    other_centroid: L("stemOtherCentroid", 0.5),
    chroma_hue: L("chroma") ? chromaHue(f) : 180,  // chroma is array, use nearest
    chroma_shift: 0,
    chord_index: L("chordIndex"),
    harmonic_tension: L("harmonicTension"),
    melodic_pitch: L("melodicPitch", 0.5),
    melodic_direction: L("melodicDirection"),
    melodic_confidence: L("melodicConfidence"),
    chord_confidence: L("chordConfidence"),
    section_type: sectionTypeFloat(f.sectionType),  // discrete
    section_index: 0, // overwritten by frame loop with routeState.currentSectionIdx
    section_progress: L("sectionProgress"),
    climax_phase: climaxPhaseMap[climax.phase] ?? 0,  // discrete
    climax_intensity: climax.intensity ?? 0,
    coherence,
    jam_density: 0.5 + (jamCycle.progress ?? 0) * 0.3,
    jam_phase: jamPhaseMap[jamCycle.phase] ?? 0,  // discrete
    jam_progress: jamCycle.progress ?? 0,
    // Energy forecast: look ahead 60 frames (~2s) to predict energy trend
    energy_forecast: (() => {
      const lookAhead = Math.min(idx + 60, frames.length - 1);
      const futureE = frames[lookAhead]?.rms ?? energy;
      return Math.max(0, Math.min(1, futureE));
    })(),
    // Peak approaching: 1.0 when high energy is coming within 120 frames
    peak_approaching: (() => {
      for (let la = 1; la <= 120 && idx + la < frames.length; la++) {
        if ((frames[idx + la]?.rms ?? 0) > 0.4) return Math.max(0, 1 - la / 120);
      }
      return 0;
    })(),
    tempo_derivative: L("tempoDerivative"),
    dynamic_range: L("dynamicRange", 0.5),
    space_score: L("spaceScore"),
    timbral_brightness: L("timbralBrightness", 0.5),
    timbral_flux: L("timbralFlux"),
    vocal_pitch: L("vocalPitch"),
    vocal_pitch_confidence: L("vocalPitchConfidence"),
    improvisation_score: L("improvisationScore"),
    // CLAP semantic approximations: computed from available audio features
    // when the actual CLAP ML pipeline hasn't run. These are heuristic
    // mappings that give shaders SOMETHING to work with.
    semantic_psychedelic: L("semantic_psychedelic") || Math.min(1, energy * 0.5 + (L("centroid", 0.5) - 0.3) * 2),
    semantic_cosmic: L("semantic_cosmic") || Math.min(1, slowEnergy * 0.3 + (1 - energy) * 0.4),
    semantic_aggressive: L("semantic_aggressive") || Math.min(1, energy * 0.8 + bass * 0.5 - 0.2),
    semantic_tender: L("semantic_tender") || Math.min(1, (1 - energy) * 0.7 + (1 - bass) * 0.3),
    semantic_rhythmic: L("semantic_rhythmic") || Math.min(1, (f.beat ? 0.5 : 0) + bass * 0.3 + L("onset") * 0.3),
    semantic_ambient: L("semantic_ambient") || Math.min(1, (1 - energy) * 0.5 + L("centroid", 0.5) * 0.3),
    semantic_chaotic: L("semantic_chaotic") || Math.max(0, Math.min(1, L("spectralFlux") * 2 + energy * 0.3 - 0.15)),
    semantic_triumphant: L("semantic_triumphant") || Math.min(1, energy * 0.6 + (climax.phase === "climax" ? 0.4 : 0)),
    // Dead-specific song palettes: warm, earthy, psychedelic
    // Every Dead song has a COLOR. Not algorithmic — hand-curated from the culture.
    palette_primary: (song?.palette?.primary ?? (() => {
      const deadPalettes: Record<string, [number, number, number]> = {
        // [primary hue, secondary hue, saturation] — all warm, earthy, Dead
        "Promised Land":        [15, 40, 0.90],   // red-orange / amber
        "Sugaree":              [340, 270, 0.80],  // rose / deep purple
        "Me and My Uncle":      [35, 20, 0.85],   // dusty gold / warm brown
        "Deal":                 [10, 45, 0.90],    // crimson / golden
        "Black-Throated Wind":  [220, 280, 0.70],  // storm blue / indigo
        "China Cat Sunflower":  [40, 25, 0.95],    // warm amber / orange sunshine
        "I Know You Rider":     [30, 350, 0.90],   // golden / warm magenta
        "Mexicali Blues":       [25, 45, 0.85],    // desert orange / cactus gold
        "Bertha":               [5, 35, 0.90],     // hot red / amber
        "Playing in the Band":  [280, 320, 0.85],  // deep purple / warm magenta
        "He's Gone":            [250, 220, 0.65],  // twilight blue / storm gray
        "Jack Straw":           [20, 45, 0.85],    // warm orange / golden
        "Bird Song":            [50, 130, 0.80],   // golden / forest green
        "Greatest Story Ever Told": [35, 10, 0.90], // amber / red
        "Dark Star":            [260, 290, 0.75],  // deep indigo / violet
        "El Paso":              [25, 15, 0.85],    // desert sand / warm red
        "Sing Me Back Home":    [30, 270, 0.70],   // warm amber / muted purple
        "Sugar Magnolia":       [45, 30, 0.95],    // golden sunshine / warm orange
        "Casey Jones":          [10, 40, 0.90],    // red / golden
        "One More Saturday Night": [350, 280, 0.90], // hot pink-red / purple
      };
      const p = deadPalettes[song?.title ?? ""] ?? [30, 350, 0.85];
      return p[0];
    })()) / 360,
    palette_secondary: (song?.palette?.secondary ?? (() => {
      const deadPalettes: Record<string, [number, number, number]> = {
        "Promised Land": [15, 40, 0.90], "Sugaree": [340, 270, 0.80],
        "Me and My Uncle": [35, 20, 0.85], "Deal": [10, 45, 0.90],
        "Black-Throated Wind": [220, 280, 0.70], "China Cat Sunflower": [40, 25, 0.95],
        "I Know You Rider": [30, 350, 0.90], "Mexicali Blues": [25, 45, 0.85],
        "Bertha": [5, 35, 0.90], "Playing in the Band": [280, 320, 0.85],
        "He's Gone": [250, 220, 0.65], "Jack Straw": [20, 45, 0.85],
        "Bird Song": [50, 130, 0.80], "Greatest Story Ever Told": [35, 10, 0.90],
        "Dark Star": [260, 290, 0.75], "El Paso": [25, 15, 0.85],
        "Sing Me Back Home": [30, 270, 0.70], "Sugar Magnolia": [45, 30, 0.95],
        "Casey Jones": [10, 40, 0.90], "One More Saturday Night": [350, 280, 0.90],
      };
      return (deadPalettes[song?.title ?? ""] ?? [30, 350, 0.85])[1];
    })()) / 360,
    palette_saturation: song?.palette?.saturation ?? (() => {
      const deadPalettes: Record<string, [number, number, number]> = {
        "Promised Land": [15, 40, 0.90], "Sugaree": [340, 270, 0.80],
        "Me and My Uncle": [35, 20, 0.85], "Deal": [10, 45, 0.90],
        "Black-Throated Wind": [220, 280, 0.70], "China Cat Sunflower": [40, 25, 0.95],
        "I Know You Rider": [30, 350, 0.90], "Mexicali Blues": [25, 45, 0.85],
        "Bertha": [5, 35, 0.90], "Playing in the Band": [280, 320, 0.85],
        "He's Gone": [250, 220, 0.65], "Jack Straw": [20, 45, 0.85],
        "Bird Song": [50, 130, 0.80], "Greatest Story Ever Told": [35, 10, 0.90],
        "Dark Star": [260, 290, 0.75], "El Paso": [25, 15, 0.85],
        "Sing Me Back Home": [30, 270, 0.70], "Sugar Magnolia": [45, 30, 0.95],
        "Casey Jones": [10, 40, 0.90], "One More Saturday Night": [350, 280, 0.90],
      };
      return (deadPalettes[song?.title ?? ""] ?? [30, 350, 0.85])[2];
    })(),
    envelope_brightness: envBrightness,
    envelope_saturation: envSaturation,
    envelope_hue: envHue,
    // Era grading: Veneta 1972 = primal era, outdoor Oregon afternoon sunshine.
    // Strong golden warmth, rich saturation, visible sepia, analog 16mm feel.
    era_saturation: 1.20, era_brightness: 1.08, era_sepia: 0.15,
    show_warmth: 0.25, show_contrast: 1.10, show_saturation: 1.15,
    show_grain: 1.3, show_bloom: 1.15,
    // Dynamic params: quiet drifts slowly, peaks churn intensely
    // Dynamic params: glacial quiet, flowing peaks.
    // Fast energy adds phrase-level responsiveness on top of base speed.
    param_bass_scale: 0.4 + energy * 0.6,
    param_energy_scale: 0.5 + energy * 0.5,
    param_motion_speed: 0.18 + energy * 0.35 + lerpSmoothed(smoothed.fastEnergy) * 0.12,
    // Base: 0.18-0.53 from slow energy, +0.12 from fast energy = phrase tracking
    param_color_sat_bias: ((song?.palette?.saturation ?? 0.85) - 0.85) * 2, // negative for muted songs, positive for vivid
    param_complexity: 0.5 + energy * 0.5,
    param_drum_reactivity: 0.5 + (L("stemDrumOnset") ?? 0) * 0.5,
    param_vocal_weight: L("stemVocalPresence") > 0.5 ? 0.8 : 0.3,
    peak_of_show: analysis?.peakOfShow?.isPeak ? 1 : (climax.phase === "climax" && (climax.intensity ?? 0) > 0.8 ? 0.5 : 0),
    // Phase 2C: shader progress uniforms
    song_progress: songProgress ?? 0,
    shader_hold_progress: sectionProgress ?? 0,
    // Phase 4C: per-show visual character (computed once per show)
    show_grain_character: showVisualSeed?.grainPreference ?? 0.5,
    show_bloom_character: showVisualSeed?.bloomBias ?? 0.0,
    show_temperature_character: showVisualSeed?.paletteTemperature ?? 0.0,
    show_contrast_character: showVisualSeed?.contrastCharacter ?? 0.5,
    // FFT contrast data (7-band tuple, see EnhancedFrameData.contrast)
    // Cast: this single field is number[]; the rest of the Record is number,
    // so we keep the loose Record<string, number> shape for downstream simplicity.
    contrast: ([
      bass,
      f.stemBassRms ?? bass,
      mids,
      energy,
      highs,
      f.timbralBrightness ?? 0.5,
      f.spectralFlux ?? 0,
    ] as unknown) as number,
    // Motion blur: adaptive sample count based on energy + climax
    motion_blur_samples: (() => {
      const ci = climax.intensity ?? 0;
      if (ci > 0.5) return 4;    // climax: heavy blur
      if (energy > 0.4) return 2; // medium energy: light blur
      return 1;                   // quiet: no blur (free)
    })(),
  };
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : def;
  };

  const dataDir = getArg("data-dir", join(VISUALIZER_ROOT, "data"));
  // Song-named analysis directory (data/tracks/) has stem-aligned, CLAP-enriched files.
  // Preferred over disc-track analysis (visualizer-poc/data/tracks/) which is duration-mismatched.
  const songAnalysisDir = join(__dirname, "../../data/tracks");
  const outputPath = getArg("output", "manifest.json");

  // Resolve analysis path: try song-named file first, fall back to disc-track ID.
  // Song-named: {title-slug}-{date}-analysis.json in data/tracks/
  // Disc-track: {trackId}-analysis.json in dataDir/tracks/
  function resolveAnalysisPath(song: any, showDate: string): string | null {
    // Try song-named path first (correctly aligned with stems + has CLAP semantics)
    const slug = song.title
      .toLowerCase()
      .replace(/'/g, " ")          // He's Gone → he s gone (apostrophe → space → hyphen)
      .replace(/[^a-z0-9]+/g, "-") // spaces/punctuation → hyphens
      .replace(/-+/g, "-")         // collapse multiple hyphens
      .replace(/^-|-$/g, "");      // trim leading/trailing hyphens
    const songNamedPath = join(songAnalysisDir, `${slug}-${showDate}-analysis.json`);
    if (existsSync(songNamedPath)) return songNamedPath;

    // Fallback to disc-track ID path
    const discTrackPath = join(dataDir, "tracks", `${song.trackId}-analysis.json`);
    if (existsSync(discTrackPath)) {
      console.warn(`    [WARN] Using disc-track analysis for ${song.title} (song-named not found at ${slug}-${showDate})`);
      return discTrackPath;
    }

    return null;
  }
  const fps = parseInt(getArg("fps", "60"));
  const singleSongIdx = args.indexOf("--single-song") >= 0
    ? parseInt(args[args.indexOf("--single-song") + 1])
    : -1;
  const width = parseInt(getArg("width", "3840"));
  const height = parseInt(getArg("height", "2160"));
  const withOverlays = args.includes("--with-overlays");
  const noTrim = args.includes("--no-trim");
  const overlayPngDirExplicit = args.indexOf("--overlay-png-dir") >= 0;
  const overlayPngDir = getArg("overlay-png-dir", "./overlay-pngs");

  console.log(`[full-manifest] Data: ${dataDir}`);
  if (withOverlays) {
    console.log(`[full-manifest] Overlays: ENABLED (PNG dir: ${overlayPngDir})`);
  }

  const setlist = JSON.parse(readFileSync(join(dataDir, "setlist.json"), "utf-8"));
  const showTitle = `${setlist.venue ?? "?"} — ${setlist.date ?? ""}`;
  const songs = setlist.songs ?? [];
  console.log(`[full-manifest] Show: ${showTitle} (${songs.length} songs)`);

  // Activate show-specific routing (e.g. Veneta song identities with preferredModes)
  if (setlist.date) setActiveShowDate(setlist.date);

  // Load sacred moments (authored effect overrides for specific frame ranges)
  interface SacredMoment {
    song: string;
    trackId: string;
    label: string;
    startFrame: number;
    endFrame: number;
    forcePostProcessMode: number;
    forcePostProcessIntensity: number;
    forceCompositedMode: number;
    forceCompositedIntensity: number;
    fadeFrames: number;
    overrideMinHold: boolean;
  }
  let sacredMoments: SacredMoment[] = [];
  const sacredPath = join(resolve(__dirname, "../../data/shows"), setlist.date ?? "unknown", "sacred-moments.json");
  if (existsSync(sacredPath)) {
    const sacredData = JSON.parse(readFileSync(sacredPath, "utf-8"));
    sacredMoments = sacredData.moments ?? [];
    console.log(`[full-manifest] Sacred moments: ${sacredMoments.length} regions loaded from ${sacredPath}`);
  }

  console.log("[full-manifest] Collecting GLSL...");
  const shaders = await collectShaderGLSL();
  console.log(`[full-manifest] ${Object.keys(shaders).length} shaders collected`);

  // ─── Compute show visual seed from all song analysis data ───
  const showDate = setlist.date ?? "unknown";
  const allSongFrames: any[][] = [];
  for (const song of songs) {
    const trackPath = resolveAnalysisPath(song, showDate);
    if (trackPath) {
      const a = JSON.parse(readFileSync(trackPath, "utf-8"));
      if (a.frames) allSongFrames.push(a.frames);
    }
  }
  const showDateHash = hashString(setlist.date ?? "unknown");
  const showVisualSeed = allSongFrames.length > 0
    ? computeShowVisualSeed(allSongFrames, showDateHash)
    : null;
  if (showVisualSeed) {
    console.log(`[full-manifest] Show seed: ${showVisualSeed.dominantSpectralFamily}/${showVisualSeed.secondarySpectralFamily}, temp=${showVisualSeed.paletteTemperature.toFixed(2)}`);
  }

  // ─── Overlay pool setup (when --with-overlays) ───
  let overlayPool: string[] = [];
  if (withOverlays) {
    const era = setlist.era ?? "primal";
    const eraPreset = getEraPreset(era);
    const eraExcluded = eraPreset ? new Set(eraPreset.excludedOverlays) : new Set<string>();
    overlayPool = OVERLAY_REGISTRY
      .filter(e => (e.tier === "A" || e.tier === "B") && !eraExcluded.has(e.name))
      .map(e => e.name);
    // Add always-active overlays
    for (const name of ALWAYS_ACTIVE) {
      if (!overlayPool.includes(name)) overlayPool.push(name);
    }
    console.log(`[full-manifest] Overlay pool: ${overlayPool.length} overlays (era: ${era})`);
  }

  // Per-frame overlay schedule: overlay_schedule[frameIdx] = OverlayInstance[]
  const overlaySchedule: Array<Array<{
    overlay_id: string;
    transform: { opacity: number; scale: number; rotation_deg: number; offset_x: number; offset_y: number };
    blend_mode: string;
  }>> = [];

  // ─── Process each song ───
  const allFrames: any[] = [];
  const songBoundaries: Array<{ title: string; set: number; startFrame: number; endFrame: number }> = [];
  let globalTime = 0;
  const usedShaderModes = new Map<string, number>();
  const shaderModeLastUsed = new Map<string, number>();
  let showSongsCompleted = 0;

  const songStart = singleSongIdx >= 0 ? singleSongIdx : 0;
  const songEnd = singleSongIdx >= 0 ? singleSongIdx + 1 : songs.length;

  // Estimate total show frames for show_position calculation
  let totalShowFrames = 0;
  for (let si = songStart; si < songEnd; si++) {
    const tp = resolveAnalysisPath(songs[si], showDate);
    if (tp) {
      const a = JSON.parse(readFileSync(tp, "utf-8"));
      totalShowFrames += Math.ceil((a.frames?.length ?? 0) / (a.meta?.fps ?? 30) * fps);
    }
  }
  totalShowFrames = Math.max(1, totalShowFrames);
  for (let songIdx = songStart; songIdx < songEnd; songIdx++) {
    const song = songs[songIdx];
    const trackPath = resolveAnalysisPath(song, showDate);
    if (!trackPath) {
      console.warn(`  SKIP: ${song.title} (no analysis)`);
      showSongsCompleted++;
      continue;
    }

    const analysis = JSON.parse(readFileSync(trackPath, "utf-8"));
    let frames = analysis.frames ?? [];
    let sections = analysis.sections ?? [];

    // ─── Auto-trim: remove non-music from start and end ───────────────
    // Archive.org recordings include crowd noise, tuning, and applause
    // before/after songs. Find where music actually starts and ends.
    // Skip when --no-trim is passed.
    if (!noTrim) {
      const WINDOW = 150; // 5 seconds at 30fps — require sustained music
      const THRESHOLD = 0.08; // RMS below this = not music

      // Find music start: require 80% of frames in window above threshold
      // (not just average — prevents single loud moments from triggering)
      let musicStart = 0;
      for (let i = 0; i < frames.length - WINDOW; i += 30) {
        let aboveCount = 0;
        for (let j = i; j < i + WINDOW; j++) {
          if ((frames[j].rms ?? 0) > THRESHOLD) aboveCount++;
        }
        if (aboveCount > WINDOW * 0.8) { // 80% of 5-second window must be music
          musicStart = Math.max(0, i - 15); // 0.5s before music
          break;
        }
      }

      // Find music end
      let musicEnd = frames.length;
      for (let i = frames.length - 1; i > WINDOW; i -= 30) {
        let avg = 0;
        for (let j = i - WINDOW; j < i; j++) avg += frames[j].rms ?? 0;
        avg /= WINDOW;
        if (avg > THRESHOLD) {
          musicEnd = Math.min(frames.length, i + 60); // 2s after music
          break;
        }
      }

      const trimFront = musicStart / (analysis.meta?.fps ?? 30);
      const trimBack = (frames.length - musicEnd) / (analysis.meta?.fps ?? 30);
      if (trimFront > 3 || trimBack > 5) {
        console.log(`    Trim: ${trimFront.toFixed(0)}s front, ${trimBack.toFixed(0)}s back (${frames.length} → ${musicEnd - musicStart} frames)`);
        frames = frames.slice(musicStart, musicEnd);
        // Adjust section boundaries
        sections = sections.map((s: any) => ({
          ...s,
          start: Math.max(0, (s.start ?? s.frameStart ?? 0) - musicStart),
          end: Math.max(0, (s.end ?? s.frameEnd ?? frames.length) - musicStart),
        })).filter((s: any) => s.end > 0);
      }
    }

    // ─── Dead Air Detection ───────────────────────────────────────────
    // Flag frames that are crowd noise, tuning, banter, or applause —
    // NOT music. These get routed to calm ambient visuals instead of
    // reactive shaders pulsing to Bob tuning his guitar.
    //
    // Detection signals:
    //   - No beat regularity (beatConfidence low or no beats in window)
    //   - Low spectral centroid (muddy/noisy, not tonal)
    //   - High flatness (white noise / crowd noise)
    //   - Low onset regularity (no rhythmic pattern)
    //   - Very low or very high RMS without beat structure
    //
    // Each frame gets a deadAirScore 0-1. Above 0.5 = not music.
    const deadAirFlags = new Uint8Array(frames.length); // 1 = dead air
    {
      const WINDOW = 60; // 2 seconds at 30fps
      for (let fi = 0; fi < frames.length; fi++) {
        const f = frames[fi];

        // Signal 1: Beat regularity — count confident beats in ±window
        let beatCount = 0;
        const lo = Math.max(0, fi - WINDOW);
        const hi = Math.min(frames.length - 1, fi + WINDOW);
        for (let j = lo; j <= hi; j++) {
          if (frames[j].beat && (frames[j].beatConfidence ?? 0) > 0.5) beatCount++;
        }
        const beatDensity = beatCount / (hi - lo + 1);
        const noBeat = beatDensity < 0.02 ? 1.0 : beatDensity < 0.04 ? 0.5 : 0.0;

        // Signal 2: Spectral flatness — high = noise, low = tonal
        const flatness = f.flatness ?? 0.5;
        const isNoisy = flatness > 0.5 ? 1.0 : flatness > 0.35 ? 0.5 : 0.0;

        // Signal 3: Low energy — crowd noise / tuning / banter
        // Crowd noise is typically RMS 0.01-0.08. Music is 0.1+.
        const rms = f.rms ?? 0;
        const isSilent = rms < 0.08 ? 1.0 : rms < 0.12 ? 0.5 : 0.0;

        // Signal 4: Low spectral centroid — muddy, not musical
        const centroid = f.centroid ?? 0.5;
        const isMuddy = centroid < 0.2 ? 0.7 : 0.0;

        // Signal 5: Onset regularity — irregular onsets = not music
        let onsetCount = 0;
        for (let j = lo; j <= hi; j++) {
          if ((frames[j].onset ?? 0) > 0.3) onsetCount++;
        }
        const onsetDensity = onsetCount / (hi - lo + 1);
        const noOnsets = onsetDensity < 0.01 ? 0.8 : onsetDensity < 0.03 ? 0.3 : 0.0;

        // Composite score — weighted average
        const deadAirScore =
          noBeat * 0.35 +
          isNoisy * 0.20 +
          isSilent * 0.20 +
          isMuddy * 0.10 +
          noOnsets * 0.15;

        deadAirFlags[fi] = deadAirScore > 0.4 ? 1 : 0;
      }

      // Large-window RMS check: if average RMS in a 10-second window is < 0.10,
      // it's dead air (crowd noise, tuning, banter). Beat detection is unreliable
      // for non-music content (hallucinated beats in noise).
      const MUSIC_WINDOW = 300; // 10 seconds at 30fps
      for (let fi = 0; fi < frames.length; fi++) {
        if (deadAirFlags[fi]) continue; // already flagged
        const mLo = Math.max(0, fi - MUSIC_WINDOW);
        const mHi = Math.min(frames.length - 1, fi + MUSIC_WINDOW);
        let rmsSum = 0;
        for (let j = mLo; j <= mHi; j++) {
          rmsSum += frames[j].rms ?? 0;
        }
        const avgRms = rmsSum / (mHi - mLo + 1);
        if (avgRms < 0.10) {
          deadAirFlags[fi] = 1;
        }
      }

      // Smooth: require 2+ seconds of dead air to trigger (avoid false positives)
      const SUSTAIN = 60; // 2 seconds
      const smoothed_da = new Uint8Array(frames.length);
      let runLength = 0;
      for (let fi = 0; fi < frames.length; fi++) {
        if (deadAirFlags[fi]) {
          runLength++;
        } else {
          runLength = 0;
        }
        smoothed_da[fi] = runLength >= SUSTAIN ? 1 : 0;
      }
      // Back-fill: once we know a run exceeds SUSTAIN, flag the whole run
      runLength = 0;
      for (let fi = frames.length - 1; fi >= 0; fi--) {
        if (smoothed_da[fi]) {
          runLength++;
        } else if (deadAirFlags[fi] && runLength > 0) {
          smoothed_da[fi] = 1;
          runLength++;
        } else {
          runLength = 0;
        }
      }
      for (let fi = 0; fi < frames.length; fi++) {
        deadAirFlags[fi] = smoothed_da[fi];
      }

      const deadFrames = deadAirFlags.reduce((s, v) => s + v, 0);
      if (deadFrames > 0) {
        console.log(`    Dead air: ${deadFrames} frames (${(deadFrames / frames.length * 100).toFixed(1)}%) — crowd/tuning/banter`);
      }
    }

    // If no sections from analysis, generate synthetic sections from energy contours.
    // Segments every 30-90 seconds based on energy changes, giving the router
    // meaningful boundaries to switch shaders at.
    if (sections.length === 0 && frames.length > 0) {
      sections = [];
      const analysisRate = analysis.meta?.fps ?? 30;
      const SECTION_MIN = Math.round(30 * analysisRate);  // min 30s per section
      const SECTION_MAX = Math.round(90 * analysisRate);   // max 90s per section
      let segStart = 0;
      let lastEnergy = frames[0]?.rms ?? 0;

      for (let fi = SECTION_MIN; fi < frames.length; fi++) {
        const e = frames[fi]?.rms ?? 0;
        const delta = Math.abs(e - lastEnergy);
        const elapsed = fi - segStart;

        // Split on significant energy change after minimum hold, or at max
        if ((delta > 0.08 && elapsed >= SECTION_MIN) || elapsed >= SECTION_MAX) {
          const avgE = frames.slice(segStart, fi).reduce((s: number, f: EnhancedFrameData) => s + (f.rms ?? 0), 0) / (fi - segStart);
          const sectionType = avgE > 0.25 ? "chorus" : avgE > 0.12 ? "verse" : "space";
          sections.push({ start: segStart, end: fi, type: sectionType });
          segStart = fi;
          lastEnergy = e;
        }
      }
      // Final section
      if (segStart < frames.length) {
        const avgE = frames.slice(segStart).reduce((s: number, f: EnhancedFrameData) => s + (f.rms ?? 0), 0) / (frames.length - segStart);
        const sectionType = avgE > 0.25 ? "chorus" : avgE > 0.12 ? "verse" : "space";
        sections.push({ start: segStart, end: frames.length, type: sectionType });
      }
      console.log(`    Synthetic sections: ${sections.length} (from energy contours)`);
    }
    const tempo = analysis.meta?.tempo ?? 120;
    const afps = analysis.meta?.fps ?? 30;
    const totalOut = Math.ceil((frames.length / afps) * fps);
    const defaultMode = (song.defaultMode ?? "protean_clouds").replace(/-/g, "_");
    const songIdentity = lookupSongIdentity(song.title) ?? undefined;
    const isDrumsSpace = song.title?.toLowerCase().includes("drums") ||
                          song.title?.toLowerCase().includes("space");
    const setNumber = song.set ?? 1;

    console.log(`  [Song ${songIdx + 1}/${setlist.songs.length}] ${song.title}: ${frames.length} → ${totalOut} frames (default: ${defaultMode})`);

    // Pre-compute all Gaussian-smoothed values (O(n*w) once, then O(1) per frame)
    const smoothed = precomputeSmoothed(frames);

    // Batch-precompute expensive window-scanning analysis functions
    // This turns O(n*w) per-frame cost into O(n*w) total cost
    // Batch precompute: use O(n) batch functions where available
    const batchStart = Date.now();

    // Coherence: O(n*window) batch instead of O(n*300*window) per-frame
    let t0 = Date.now();
    let preCoherence: any[];
    try { preCoherence = batchComputeCoherence(frames); } catch (e) { console.warn(`    [WARN] batchComputeCoherence FAILED: ${(e as Error).message?.slice(0,120)}`); preCoherence = frames.map(() => ({ isLocked: false, score: 0 })); }
    const coherenceMs = Date.now() - t0;

    // Remaining functions: still per-frame but benefit from coherence being pre-done
    const preIT: any[] = new Array(frames.length);
    const preInterplay: any[] = new Array(frames.length);
    const preReactive: any[] = new Array(frames.length);
    const preJamCycle: any[] = new Array(frames.length);
    const preClimaxState: any[] = new Array(frames.length);

    // Derive IT response from pre-computed coherence (avoids re-computing coherence)
    t0 = Date.now();
    for (let bi = 0; bi < frames.length; bi++) {
      const coh = preCoherence[bi];
      // Simplified IT: if coherence is locked, force transcendent shader
      // This avoids computeITResponse calling computeCoherence internally
      preIT[bi] = {
        forceTranscendentShader: coh?.isLocked && (coh?.lockDuration ?? 0) > 300,
        phase: coh?.isLocked ? "locked" : "normal",
        lockDepth: coh?.isLocked
          ? (coh.lockDuration > 300 ? "transcendent" : coh.lockDuration > 150 ? "deep" : coh.lockDuration > 90 ? "medium" : "shallow")
          : "shallow",
        overlayOpacityOverride: coh?.isLocked ? Math.max(0.05, 1.0 - (coh.lockDuration / 300)) : null,
        cameraLock: coh?.isLocked && (coh?.lockDuration ?? 0) > 15,
        luminanceLift: coh?.isLocked ? Math.min(0.15, (coh.lockDuration ?? 0) / 600) : 0,
        saturationSurge: coh?.isLocked ? Math.min(0.20, (coh.lockDuration ?? 0) / 500) : 0,
        flashIntensity: 0,
        flashHue: 0,
        snapZoom: 0,
        vignettePull: coh?.isLocked && (coh?.lockDuration ?? 0) > 150 ? 0.15 : 0,
        timeDilation: coh?.isLocked ? Math.max(0.2, 1.0 - (coh.lockDuration ?? 0) / 600) : 1.0,
      };
    }
    const itMs = Date.now() - t0;

    t0 = Date.now();
    for (let bi = 0; bi < frames.length; bi++) {
      try { preInterplay[bi] = detectStemInterplay(frames, bi); } catch (e) { if (bi === 0) console.warn(`    [WARN] detectStemInterplay FAILED on frame 0: ${(e as Error).message?.slice(0,100)}`); preInterplay[bi] = null; }
      const sb = findSectionBounds(sections, bi, frames.length);
      try {
        preReactive[bi] = computeReactiveTriggers(
          frames, bi,
          sb.start, sb.end,
          tempo,
          preCoherence[bi]?.isLocked ?? false,
        );
      } catch (e) {
        if (bi === 0) console.warn(`    [WARN] computeReactiveTriggers FAILED on frame 0: ${(e as Error).message?.slice(0,100)}`);
        preReactive[bi] = {
          isTriggered: false, triggerType: null, triggerStrength: 0,
          triggerAge: 0, suggestedModes: [], overlayInjections: [],
          cooldownRemaining: 0,
        };
      }
      try { preJamCycle[bi] = detectJamCycle(frames, bi, sb.start, sb.end); } catch (e) { if (bi === 0) console.warn(`    [WARN] detectJamCycle FAILED on frame 0: ${(e as Error).message?.slice(0,100)}`); preJamCycle[bi] = { phase: "setup", progress: 0, isDeepening: false, cycleCount: 0 }; }
      try { preClimaxState[bi] = computeClimaxState(frames, bi, sections); } catch (e) { if (bi === 0) console.warn(`    [WARN] computeClimaxState FAILED on frame 0: ${(e as Error).message?.slice(0,100)}`); preClimaxState[bi] = { phase: "idle", intensity: 0 }; }
    }
    const restMs = Date.now() - t0;
    const batchMs = Date.now() - batchStart;
    // Count precompute failures for visibility
    const preFailCounts = {
      interplay: preInterplay.filter(v => v === null).length,
      reactive: preReactive.filter(v => !v?.triggered && v?.triggerType === null && v?.shaderPool?.length === 0).length,
      jamCycle: preJamCycle.filter(v => v?.phase === "setup" && v?.progress === 0).length,
      climax: preClimaxState.filter(v => v?.phase === "idle" && v?.intensity === 0).length,
    };
    console.log(`    Batch precompute: ${frames.length} frames in ${(batchMs / 1000).toFixed(1)}s (coherence: ${(coherenceMs / 1000).toFixed(1)}s, IT: ${(itMs / 1000).toFixed(1)}s, rest: ${(restMs / 1000).toFixed(1)}s)`);
    console.log(`    Precompute neutral-defaults: interplay=${preFailCounts.interplay}/${frames.length}, reactive=${preFailCounts.reactive}/${frames.length}, jamCycle=${preFailCounts.jamCycle}/${frames.length}, climax=${preFailCounts.climax}/${frames.length}`);

    const ctx: SongContext & { _preComputed?: any } = {
      frames,
      sections,
      tempo,
      isDrumsSpace,
      _preComputed: {
        coherence: preCoherence,
        it: preIT,
        interplay: preInterplay,
        reactive: preReactive,
        jamCycle: preJamCycle,
        climax: preClimaxState,
      },
      songSeed: songIdx * 1000 + (song.trackId?.charCodeAt?.(0) ?? 0),
      setNumber,
      songIndexInSet: song.trackNumber ?? songIdx,
      totalSongsInSet: songs.filter((s: any) => (s.set ?? 1) === setNumber).length,
      showSongsCompleted,
      totalShowSongs: songs.length,
      usedShaderModes,
    };

    let prevShaderId = defaultMode;
    let prevState: any = null;
    let shaderStartFrame = 0;
    let transitionStartFrame = -1;
    let transitionLength = 0;
    let transitionFromShader = "";

    // Build section boundaries for routing (frame ranges in output fps)
    const sectionBounds = (sections ?? []).map((s: any) => ({
      start: Math.floor((s.start ?? s.frameStart ?? 0) * (fps / afps)),
      end: Math.floor((s.end ?? s.frameEnd ?? frames.length) * (fps / afps)),
    }));

    // Pre-compute per-section shader selection using energy-based routing.
    // Uses song identity preferred modes when available, otherwise picks from
    // the full active shader pool based on section energy level.
    const sectionModes: string[] = [];
    const preferredModes = songIdentity?.preferredModes ?? [];
    // A+/A/B tier only — every shader in this pool should make a viewer say "beautiful"
    // C/D tier, black-frame risk, show-specific variants, and screensaver shaders are BLOCKED
    const SHADER_BLOCKLIST = new Set([
      // C/D tier: generic procedural, screensaver quality
      "combustible_voronoi", "creation", "fluid_2d", "spectral_bridge",
      "obsidian_mirror", "amber_drift", "volumetric_clouds", "volumetric_smoke",
      "volumetric_nebula", "digital_rain", "protean_clouds", "seascape",
      "warm_nebula", "particle_nebula", "liquid_mandala", "star_nest",
      "crystalline_void", "space_travel", "fractal_zoom", "acid_melt",
      "aurora_sky", "spinning_spiral", "prism_refraction", "spectral_analyzer",
      "neon_grid", "concert_beams", "blacklight_glow", "liquid_projector",
      "databend", "signal_decay", "climax_surge", "cellular_automata",
      "bioluminescence",
      // Black-frame risk: unclear implementation, sparse output, or naga compile failure
      "luminous_cavern", // snoise undefined → naga compile failure → 5251 black frames
      "storm_vortex", "mycelium_network", "cosmic_voyage", "solar_flare",
      // 3D-mesh shaders (not fullscreen-quad) — uses vWorldPos varying that
      // Rust renderer's vertex shader doesn't produce → naga compile failure.
      "forest",
      // Show-specific variants: only used via song identity, not random pool
      "morning_dew_fog", "dark_star_void", "fire_mountain_smoke",
      "estimated_prophet_mist", "wharf_rat_storm", "scarlet_golden_haze",
      "st_stephen_lightning", "terrapin_nebula",
      // Redundant with better versions
      "dual_blend", "dual_shader", "smoke_and_mirrors", "molten_glass",
      "particle_burst",
    ]);
    const activeShaderPool = Object.keys(shaders).filter(s => !SHADER_BLOCKLIST.has(s));

    for (let si = 0; si < Math.max(1, sections.length); si++) {
      const section = sections[si] ?? { start: 0, end: frames.length, type: "verse" };
      const sectionStart = section.start ?? section.frameStart ?? 0;
      const sectionEnd = section.end ?? section.frameEnd ?? frames.length;
      const mid = Math.floor((sectionStart + sectionEnd) / 2);
      const avgEnergy = smoothed.energy[Math.min(mid, frames.length - 1)] ?? 0.3;

      // Energy-appropriate shader sets (shared between identity and fallback)
      // Shader pools curated for GRATEFUL DEAD concert aesthetic:
      // Prioritize: warm concert lighting, psychedelic tie-dye, liquid light projectors
      // These shaders look like you're AT a Dead show, not watching a screensaver
      // HIGH energy: explosive, screen-filling, vivid, WARM
      // Removed oil_projector/coral_reef — their green base fights warm palettes
      const HIGH_ENERGY_SHADERS = new Set([
        "tie_dye", "inferno", "lava_flow", "fractal_flames",
        "fractal_temple", "kaleidoscope", "stained_glass",
      ]);
      // LOW energy: screen-filling, gentle, warm tones
      const LOW_ENERGY_SHADERS = new Set([
        "tie_dye", "stained_glass", "sacred_geometry",
        "smoke_rings", "fractal_temple", "kaleidoscope",
      ]);

      // Shaders that FILL THE SCREEN with psychedelic Dead concert color.
      // Sparse raymarchers (concert_lighting, ink_wash, void_light) look great
      // at high energy but produce mostly black at mid/low energy. Deprioritized.
      // Dead-concert shaders: warm-toned, screen-filling, psychedelic
      // REMOVED: oil_projector, coral_reef (green base fights warm palettes)
      const DEAD_CONCERT_SHADERS = new Set([
        "tie_dye",              // #1 Dead shader — psychedelic color bleed
        "fractal_flames",       // organic fire — warm tones
        "inferno",              // volcanic lava — deep reds
        "lava_flow",            // molten — warm amber/red
        "fractal_temple",       // sacred cathedral — warm golden light
        "kaleidoscope",         // mandala — adapts to palette well
        "stained_glass",        // cathedral light — warm colored glass
        "sacred_geometry",      // geometric — spiritual, warm
        "smoke_rings",          // gentle smoke — neutral, takes palette color
      ]);

      // PRIMARY: use shader-variety::getModeForSection — the same sophisticated
      // router the Remotion engine uses. It applies recency weighting,
      // visual-memory diversity, song-identity preferences, spectral-family
      // matching, and continuous-energy gaussian-weighted pools. Until now
      // this function was imported but never called, defaulting to the
      // hardcoded HIGH/LOW/MID pools below — which capped Veneta to 21
      // unique shaders out of 87 active.
      const adaptedSections = (sections ?? []).map((s: any) => {
        const sStart = s.start ?? s.frameStart ?? 0;
        const sEnd = s.end ?? s.frameEnd ?? frames.length;
        const sMid = Math.floor((sStart + sEnd) / 2);
        const sAvg = smoothed.energy[Math.min(sMid, frames.length - 1)] ?? 0.3;
        return {
          frameStart: sStart,
          frameEnd: sEnd,
          avgEnergy: sAvg,
          energy: sAvg >= 0.4 ? "high" : sAvg >= 0.15 ? "mid" : "low",
        };
      });
      // Pre-filter the song's preferredModes against activeShaderPool.
      // Many authored identities have 3-5 preferredModes but 2-3 of them
      // are now blocklisted (added to the cull AFTER identities were
      // authored), leaving only 1-2 valid. With < 3 valid the picker
      // collapses every section to those few — which produced the
      // "1-unique-per-song" symptom. So:
      //   ≥ 3 valid preferred → use as authored, full identity weight
      //   < 3 valid           → DROP identity, let continuous-energy
      //                         pool drive variety (defaultMode still
      //                         anchors section 0)
      const validPreferred = (songIdentity?.preferredModes ?? []).filter(
        (m: any) => activeShaderPool.includes(m as any)
      );
      const useIdentity = songIdentity && validPreferred.length >= 3;
      const filteredIdentity: any = useIdentity
        ? { ...songIdentity, preferredModes: validPreferred }
        : undefined;
      // For songs without rich identities, anchor section 0 on the FIRST
      // valid preferred mode (or defaultMode if all blocked) so the
      // authored opening still wins.
      const anchorMode = (validPreferred[0] as any)
        ?? (activeShaderPool.includes(defaultMode) ? defaultMode : "fractal_temple");
      const songEntryShape: any = {
        ...song,
        defaultMode: anchorMode,
      };
      const showShaderPool = activeShaderPool as any;
      let pick: string | null = null;
      try {
        const candidate = getModeForSection(
          songEntryShape,
          si,
          adaptedSections as any,
          ctx.songSeed,
          (setlist as any).era,
          false,                    // coherenceIsLocked — manifest gen is offline batch
          usedShaderModes as any,   // SHOW-LEVEL state, persists across songs
          filteredIdentity,         // identity only when we have ≥3 valid preferred
          undefined,                // stemSection
          frames as any,            // for spectral matching
          totalOut,                 // songDuration in frames
          setNumber,
          songIdx + 1,              // trackNumber (1-based)
          shaderModeLastUsed as any,
          undefined,                // stemDominant
          undefined,                // visualMemory — could thread through later
          showShaderPool,           // restrict to manifest-available, non-blocklisted
        );
        // Manifest-gen blocklist wins over shader-variety's SAFE_SHADERS.
        if (candidate && activeShaderPool.includes(candidate as any) && !SHADER_BLOCKLIST.has(candidate as any)) {
          pick = candidate as string;
        }
      } catch (e) {
        console.warn(`    [WARN] getModeForSection threw: ${e} — falling back to legacy pool`);
      }

      // FALLBACK: legacy hardcoded pool. Only fires if getModeForSection
      // returned a blocklisted/missing shader (which should be rare since
      // we passed showShaderPool = activeShaderPool).
      if (!pick) {
        let pool: string[] = [];
        if (preferredModes.length > 0) {
          const identityFiltered = preferredModes.filter((m: string) =>
            activeShaderPool.includes(m)
          );
          if (identityFiltered.length >= 1) {
            pool = identityFiltered;
          }
        }
        if (pool.length === 0) {
          if (avgEnergy > 0.25) {
            pool = activeShaderPool.filter(s => HIGH_ENERGY_SHADERS.has(s));
          } else if (avgEnergy < 0.10) {
            pool = activeShaderPool.filter(s => LOW_ENERGY_SHADERS.has(s));
          } else {
            pool = activeShaderPool.filter(s => ["tie_dye", "fractal_temple",
              "stained_glass", "fractal_flames", "kaleidoscope",
              "sacred_geometry", "lava_flow", "inferno", "smoke_rings"].includes(s));
          }
        }
        if (pool.length === 0) pool = ["fractal_temple", "aurora", "deep_ocean", "inferno", "stained_glass"];
        const seed = ctx.songSeed + si * 137;
        pick = pool[Math.floor(seededRandom(seed) * pool.length)];
        if (sectionModes.length > 0 && pick === sectionModes[sectionModes.length - 1] && pool.length > 1) {
          pick = pool[Math.floor(seededRandom(seed + 99) * pool.length)];
        }
      }

      sectionModes.push(pick);
      // Update show-level recency state so the NEXT section's call to
      // getModeForSection sees what we picked. Without this the recency
      // weighting can't fire and variety collapses.
      usedShaderModes.set(pick as any, (usedShaderModes.get(pick as any) ?? 0) + 1);
      shaderModeLastUsed.set(pick as any, songIdx + 1);
    }

    // VARIETY ENFORCEMENT POST-PASS
    // Even with all the bias layers in getModeForSection, songs with rich
    // identities + matching stem/groove/semantic biases can collapse to a
    // single mode (multiple layers stacking copies of the same shader on
    // an already-narrow preferred pool). Cap any single shader at 50% of
    // a multi-section song's picks: replace excess occurrences with a
    // varied alternative from the activeShaderPool, weighted by the
    // continuous-energy gaussian for that section's avgEnergy.
    if (sectionModes.length >= 4) {
      const counts = new Map<string, number>();
      for (const m of sectionModes) counts.set(m, (counts.get(m) ?? 0) + 1);
      const cap = Math.ceil(sectionModes.length * 0.5);
      // For each over-cap shader, find its excess section indices and replace.
      // Skip section 0 (preserve authored opening).
      const overCap = [...counts.entries()].filter(([, c]) => c > cap);
      for (const [overMode, ] of overCap) {
        const overIndices = sectionModes
          .map((m, i) => m === overMode ? i : -1)
          .filter(i => i >= 0 && i > 0);  // never replace section 0
        // Build alternative pool: activeShaderPool minus the over-mode minus other over-modes.
        const overSet = new Set(overCap.map(([m]) => m));
        const alts = activeShaderPool.filter((s: string) => !overSet.has(s));
        if (alts.length === 0) continue;
        // Replace from the END of the over list so leading occurrences (early
        // sections) keep the authored mode.
        const excess = counts.get(overMode)! - cap;
        for (let i = 0; i < excess && i < overIndices.length; i++) {
          const idx = overIndices[overIndices.length - 1 - i];
          // Pick from alts, preferring shaders not yet used in this song
          const songUsed = new Set(sectionModes);
          const fresh = alts.filter((m: string) => !songUsed.has(m));
          const pickPool = fresh.length > 0 ? fresh : alts;
          const newPick = pickPool[Math.floor(seededRandom(ctx.songSeed + idx * 991) * pickPool.length)];
          // Update show-level state — decrement old, increment new.
          usedShaderModes.set(overMode as any, (usedShaderModes.get(overMode as any) ?? 1) - 1);
          usedShaderModes.set(newPick as any, (usedShaderModes.get(newPick as any) ?? 0) + 1);
          shaderModeLastUsed.set(newPick as any, songIdx + 1);
          sectionModes[idx] = newPick;
        }
      }
    }

    {
      const unique = new Set(sectionModes);
      console.log(`    Sections: ${sectionModes.length} sections, ${unique.size} unique shaders [${[...unique].join(", ")}]`);
      if (unique.size <= 1 && sectionModes.length > 1) {
        console.log(`    WARNING: Only 1 shader for entire song — routing may be broken`);
        console.log(`    Default mode: ${defaultMode}, sections: ${sections.length}`);
      }
    }

    // Track current section with real per-section mode routing
    let currentSectionIdx = 0;
    const getRouteState = (outFrame: number): RouteState => {
      while (currentSectionIdx < sectionBounds.length - 1 &&
             outFrame >= sectionBounds[currentSectionIdx].end) {
        currentSectionIdx++;
      }
      const section = sectionBounds[currentSectionIdx] ?? { start: 0, end: totalOut };
      return {
        currentSectionIdx,
        currentMode: sectionModes[currentSectionIdx] ?? defaultMode,
        sectionStartFrame: section.start,
        sectionEndFrame: section.end,
      };
    };

    const progressInterval = Math.max(1, Math.floor(totalOut / 20)); // Log every 5%
    const songStartTime = Date.now();
    let dynamicTimeAccum = 0; // Accumulated dynamic time with modifiers

    // Effect hold state: prevents flickering between effect modes
    let effectHoldMode = 0;      // Currently held effect mode (0 = none)
    let effectHoldIntensity = 0; // Base intensity for held effect
    let effectHoldFrames = 0;    // How long current effect has been held
    let effectCooldown = 0;      // Frames remaining in cooldown after effect ends

    // Composited effect hold state (independent of post-process effects)
    let compHoldMode = 0;
    let compHoldIntensity = 0;
    let compHoldFrames = 0;
    let compCooldown = 0;
    for (let i = 0; i < totalOut; i++) {
      if (i > 0 && i % progressInterval === 0) {
        const pct = ((i / totalOut) * 100).toFixed(0);
        const elapsed = ((Date.now() - songStartTime) / 1000).toFixed(1);
        const fps_actual = (i / ((Date.now() - songStartTime) / 1000)).toFixed(0);
        const eta = (((totalOut - i) / (i / ((Date.now() - songStartTime) / 1000)))).toFixed(0);
        console.log(`    [${pct}%] ${i}/${totalOut} frames (${fps_actual} frames/sec, ETA ${eta}s)`);
      }
      // Interpolated frame index for smooth 60fps (instead of nearest-neighbor)
      const { lo: ai, hi: aiHi, t: interpT } = getInterpolatedIndex(i, afps, fps, frames.length);

      // Structural analysis (uses integer index — these are discrete state machines)
      const frameAnalysis = analyzeFrame(ctx, ai, prevState, smoothed);
      prevState = frameAnalysis;

      // Scene routing with hold enforcement (prevents seizure-fast switching)
      const routeState = getRouteState(i);

      // Hold enforcement: suppress section-boundary transitions when the shader
      // hasn't been held long enough or the section type forbids cuts.
      if (routeState.currentMode !== prevShaderId) {
        const vocab = getSectionVocabulary(frameAnalysis.stemSection) as any;
        const cutsPermitted = vocab?.cutsPermitted ?? true;
        const held = shouldHoldShader(
          i, shaderStartFrame, currentSectionIdx, sectionBounds,
          frames, afps, fps,
        );
        if (!cutsPermitted || held) {
          routeState.currentMode = prevShaderId;
        }
      }

      const route = routeScene(ctx, frameAnalysis, i, prevShaderId, defaultMode, routeState);

      // HARD MINIMUM HOLD: no shader switch within 900 frames (30s at 30fps)
      // This is the last line of defense against seizure-fast switching.
      // routeScene may suggest a switch, but we suppress it if the current
      // shader hasn't been held long enough.
      const framesSinceSwitch = i - shaderStartFrame;
      const MIN_HOLD = 900 * (fps / 30); // 30 seconds, scaled by fps
      if (route.shaderId !== prevShaderId && framesSinceSwitch < MIN_HOLD) {
        route.shaderId = prevShaderId;
        route.secondaryId = null;
        route.blendProgress = null;
        route.blendMode = null;
      }

      if (route.shaderId !== prevShaderId) {
        // Generate a 3-second crossfade ramp into the new shader
        const CROSSFADE_FRAMES = Math.round(90 * (fps / 30));
        transitionFromShader = prevShaderId;
        route.secondaryId = prevShaderId;
        route.blendProgress = 0.0;
        route.blendMode = "dissolve";
        shaderStartFrame = i;
        transitionStartFrame = i;
        transitionLength = CROSSFADE_FRAMES;
      }
      // Override blend data during crossfade ramp — smooth 0→1 over 3 seconds
      if (transitionStartFrame >= 0) {
        if (i < transitionStartFrame + transitionLength) {
          const progress = (i - transitionStartFrame) / transitionLength;
          route.secondaryId = transitionFromShader;
          route.blendProgress = Math.min(1.0, progress);
          route.blendMode = "dissolve";
        } else {
          transitionStartFrame = -1; // crossfade complete
        }
      }
      prevShaderId = route.shaderId;

      // Track shader usage
      usedShaderModes.set(route.shaderId, (usedShaderModes.get(route.shaderId) ?? 0) + 1);
      shaderModeLastUsed.set(route.shaderId, showSongsCompleted);

      // Compute section progress for shader_hold_progress uniform
      const routeSectionLen = routeState.sectionEndFrame - routeState.sectionStartFrame;
      const routeSectionProgress = routeSectionLen > 0
        ? (i - routeState.sectionStartFrame) / routeSectionLen
        : 0;

      // ─── Dead Air Override ───
      // Non-music frames get one consistent calm shader (not randomized per-frame)
      const isDeadAir = deadAirFlags[ai] === 1;
      if (isDeadAir) {
        // Pick ONE dead air shader per song (seeded by song, not by frame)
        const deadAirShaders = ["aurora", "void_light", "cosmic_dust", "smoke_rings"];
        const daPool = deadAirShaders.filter(s => Object.keys(shaders).includes(s));
        if (daPool.length > 0) {
          const deadAirShader = daPool[Math.floor(seededRandom(ctx.songSeed) * daPool.length)];
          route.shaderId = deadAirShader;
          route.secondaryId = null;
          route.blendProgress = null;
          route.blendMode = null;
        }
      }

      // Compute uniforms with interpolation between adjacent analysis frames.
      // Structural analysis and routing use integer index (discrete decisions),
      // but continuous audio values are interpolated for smooth 60fps curves.
      let uniforms = computeUniforms(
        frames, ai, fps, tempo, width, height, globalTime, frameAnalysis, smoothed,
        aiHi, interpT,
        song, i / Math.max(1, totalOut), routeSectionProgress, showVisualSeed,
        setlist.era ?? "classic",
      );

      // Fix section_index and section_progress (not available in computeUniforms)
      uniforms.section_index = routeState.currentSectionIdx;
      uniforms.section_progress = routeSectionProgress;

      // Chroma shift: change between adjacent frames' chroma hue (harmonic drift)
      if (ai > 0) {
        const prevHue = chromaHue(frames[ai - 1]) || 0;
        const curHue = chromaHue(frames[ai]) || 0;
        uniforms.chroma_shift = Math.abs(curHue - prevHue) / 360; // 0-1 normalized
      }

      // Tempo derivative: approximate from local tempo stability
      if (ai > 10) {
        const prevTempo = frames[ai - 10]?.localTempo ?? tempo;
        const curTempo = frames[ai]?.localTempo ?? tempo;
        uniforms.tempo_derivative = (curTempo - prevTempo) / 10; // BPM change per frame
      }

      // Show warmth: derive from era + time-of-day shift
      // Veneta started late afternoon → outdoor shows get cooler as night falls
      const showPos = allFrames.length / Math.max(1, totalShowFrames);
      uniforms.show_position = showPos;
      uniforms.show_warmth = (() => {
        // Era is a show-level concept (date-derived), not part of audio analysis.
        // It comes from setlist.era; defaults to "classic" if absent.
        const era = (setlist as any)?.era ?? "classic";
        const warmth: Record<string, number> = {
          primal: 0.30, classic: 0.12, hiatus: -0.05, touch_of_grey: 0.0, revival: -0.02,
        };
        let base = warmth[era] ?? 0;
        // Time-of-day shift: warmer in first half (golden hour), cooler in second (dusk/night)
        base += (1.0 - showPos) * 0.08 - showPos * 0.04;
        return base;
      })();

      // Effect triggers: fire visual modes at specific musical moments.
      // Uses climax state, energy, section type, and song characteristics.
      // Effects fire ~15-25% of the time, with minimum hold duration (no flickering).
      const climaxState = frameAnalysis?.climaxState ?? { phase: "idle", intensity: 0 };
      const energy = uniforms.energy ?? 0;
      const sectionType = uniforms.section_type ?? 5;
      const songProg = uniforms.song_progress ?? 0;
      const beatSnap = uniforms.beat_snap ?? 0;
      const spaceScore = uniforms.space_score ?? 0;

      // Effect hold state (persists across frames within this song)
      // Once an effect triggers, hold it for MIN_HOLD frames before allowing change
      const MIN_EFFECT_HOLD = Math.round(fps * 3); // 3 seconds minimum
      const MAX_EFFECT_HOLD = Math.round(fps * 8); // 8 seconds maximum
      const COOLDOWN_FRAMES = Math.round(fps * 5); // 5 second gap between effects

      // Determine desired effect based on musical state
      let desiredMode = 0;
      let desiredIntensity = 0;

      if (climaxState.phase === "climax" || (climaxState.phase === "sustain" && (climaxState.intensity ?? 0) > 0.6)) {
        // Peak moments: always trigger dramatic effects
        const peak = climaxState.intensity ?? 0.8;
        const choices = [3, 4, 1, 10]; // hypersaturation, chromatic, kaleidoscope, light leak
        desiredMode = choices[Math.floor(seededRandom(songIdx * 131 + Math.floor(i / MIN_EFFECT_HOLD)) * choices.length)];
        desiredIntensity = peak * 0.65;
      } else if (climaxState.phase === "build" && (climaxState.intensity ?? 0) > 0.7) {
        // Strong build only: anticipatory effects
        const build = climaxState.intensity ?? 0.6;
        const choices = [9, 2, 12]; // breath pulse, deep feedback, moire
        desiredMode = choices[Math.floor(seededRandom(songIdx * 137 + Math.floor(i / MIN_EFFECT_HOLD)) * choices.length)];
        desiredIntensity = build * 0.40;
      } else if (energy > 0.50 && beatSnap > 0.5) {
        // High-energy strong beat moments: rare punchy effects (~10%)
        const trigger = seededRandom(i * 7919 + songIdx * 251);
        if (trigger > 0.90) {
          const choices = [8, 4, 14, 7]; // zoom punch, chromatic, glitch, audio displace
          desiredMode = choices[Math.floor(seededRandom(songIdx * 149 + Math.floor(i / MIN_EFFECT_HOLD)) * choices.length)];
          desiredIntensity = energy * 0.50;
        }
      } else if (sectionType >= 4.5 && sectionType < 5.5 && energy > 0.35) {
        // Jam sections: psychedelic effects (rare, ~12%)
        const trigger = seededRandom(i * 6271 + songIdx * 307);
        if (trigger > 0.88) {
          const choices = [2, 5, 1, 6, 7]; // feedback, trails, kaleidoscope, mirror, audio displace
          desiredMode = choices[Math.floor(seededRandom(songIdx * 163 + Math.floor(i / MIN_EFFECT_HOLD)) * choices.length)];
          desiredIntensity = 0.35 + energy * 0.25;
        }
      } else if (spaceScore > 0.6) {
        // Deep space sections: dreamy effects (rare, ~15%)
        const trigger = seededRandom(i * 5381 + songIdx * 389);
        if (trigger > 0.85) {
          const choices = [11, 13, 9]; // time dilation, DoF, breath
          desiredMode = choices[Math.floor(seededRandom(songIdx * 173 + Math.floor(i / MIN_EFFECT_HOLD)) * choices.length)];
          desiredIntensity = 0.30 + spaceScore * 0.20;
        }
      } else if (songProg > 0.88 && energy > 0.40) {
        // Song climax region (last 12%): rare (~12%)
        const trigger = seededRandom(i * 4507 + songIdx * 431);
        if (trigger > 0.88) {
          const choices = [10, 3, 5]; // light leak, hypersaturation, trails
          desiredMode = choices[Math.floor(seededRandom(songIdx * 191 + Math.floor(i / MIN_EFFECT_HOLD)) * choices.length)];
          desiredIntensity = energy * 0.45;
        }
      }

      // Apply hold logic: don't flicker between effects
      if (effectHoldMode > 0 && effectHoldFrames < MAX_EFFECT_HOLD) {
        // Currently holding an effect — keep it
        uniforms.effect_mode = effectHoldMode;
        // Smooth intensity: fade in over 15 frames, sustain, fade out over 15 frames
        const fadeIn = Math.min(effectHoldFrames / 15, 1.0);
        const remainingInMax = MAX_EFFECT_HOLD - effectHoldFrames;
        const fadeOut = Math.min(remainingInMax / 15, 1.0);
        uniforms.effect_intensity = effectHoldIntensity * fadeIn * fadeOut;
        effectHoldFrames++;
      } else if (effectHoldMode > 0) {
        // Hold expired — enter cooldown
        uniforms.effect_mode = 0;
        uniforms.effect_intensity = 0;
        effectCooldown = COOLDOWN_FRAMES;
        effectHoldMode = 0;
        effectHoldFrames = 0;
      } else if (effectCooldown > 0) {
        // In cooldown — no effects
        uniforms.effect_mode = 0;
        uniforms.effect_intensity = 0;
        effectCooldown--;
      } else if (desiredMode > 0) {
        // New effect trigger — start hold
        effectHoldMode = desiredMode;
        effectHoldIntensity = desiredIntensity;
        effectHoldFrames = 0;
        uniforms.effect_mode = desiredMode;
        uniforms.effect_intensity = desiredIntensity * 0.067; // first frame fade-in
        effectHoldFrames = 1;
      } else {
        uniforms.effect_mode = 0;
        uniforms.effect_intensity = 0;
      }

      // Camera behavior: section-type driven storytelling
      // Quiet = pull-back (feel vast), peaks = push-in (feel intimate),
      // jams = rotate (feel disoriented), ballads = static (feel grounded)
      const sectionFloat = uniforms.section_type ?? 5;
      if (climaxState.phase === "climax") {
        uniforms.camera_behavior = 5; // zoom-punch at climax
      } else if (sectionFloat >= 6.5) { // space
        uniforms.camera_behavior = 1; // pull-back (vast)
      } else if (sectionFloat >= 4.5 && sectionFloat < 5.5) { // jam
        uniforms.camera_behavior = 3; // rotate (disorienting)
      } else if (sectionFloat < 1.5) { // verse/intro
        uniforms.camera_behavior = 4; // static (grounded)
      } else if (sectionFloat >= 1.5 && sectionFloat < 2.5) { // chorus
        uniforms.camera_behavior = 2; // push-in (intimate)
      } else {
        uniforms.camera_behavior = 0; // auto
      }

      // ─── Composited effect triggers (independent of post-process effects) ───
      // Composited effects add visual LAYERS (particles, caustics, embers, etc.)
      // They run ~10-15% of the time, complementing but not overlapping with post-process.
      const COMP_MIN_HOLD = Math.round(fps * 4); // 4 seconds minimum
      const COMP_MAX_HOLD = Math.round(fps * 10); // 10 seconds max
      const COMP_COOLDOWN = Math.round(fps * 8); // 8 second gap

      let desiredComp = 0;
      let desiredCompIntensity = 0;
      const compSeed = seededRandom(i * 3571 + songIdx * 521);

      if (sectionType >= 6.5 && energy < 0.15) {
        // Deep space: celestial map or liquid metal
        if (compSeed > 0.80) {
          const choices = [3, 9]; // celestial map, liquid metal
          desiredComp = choices[Math.floor(seededRandom(songIdx * 211 + Math.floor(i / COMP_MIN_HOLD)) * choices.length)];
          desiredCompIntensity = 0.50 + spaceScore * 0.20;
        }
      } else if (sectionType >= 4.5 && sectionType < 5.5 && energy > 0.35) {
        // Jam: particles, caustics, fire, geometric
        if (compSeed > 0.85) {
          const choices = [1, 2, 5, 8]; // particles, caustics, fire, geometric
          desiredComp = choices[Math.floor(seededRandom(songIdx * 223 + Math.floor(i / COMP_MIN_HOLD)) * choices.length)];
          desiredCompIntensity = 0.40 + energy * 0.30;
        }
      } else if (climaxState.phase === "climax" || (climaxState.phase === "sustain" && energy > 0.5)) {
        // Climax: tunnel, fire, strobe
        if (compSeed > 0.70) {
          const choices = [4, 5, 7]; // tunnel, fire, strobe
          desiredComp = choices[Math.floor(seededRandom(songIdx * 239 + Math.floor(i / COMP_MIN_HOLD)) * choices.length)];
          desiredCompIntensity = 0.55 + energy * 0.25;
        }
      } else if (energy > 0.45 && beatSnap > 0.4) {
        // High-energy beats: ripples, strobe, geometric
        if (compSeed > 0.88) {
          const choices = [6, 7, 8]; // ripples, strobe, geometric
          desiredComp = choices[Math.floor(seededRandom(songIdx * 251 + Math.floor(i / COMP_MIN_HOLD)) * choices.length)];
          desiredCompIntensity = 0.45 + energy * 0.25;
        }
      } else if (songProg > 0.90 && energy > 0.30) {
        // Song finale: concert poster, tunnel
        if (compSeed > 0.85) {
          const choices = [10, 4]; // concert poster, tunnel
          desiredComp = choices[Math.floor(seededRandom(songIdx * 263 + Math.floor(i / COMP_MIN_HOLD)) * choices.length)];
          desiredCompIntensity = 0.50;
        }
      }

      // Composited hold logic (same pattern as post-process)
      if (compHoldMode > 0 && compHoldFrames < COMP_MAX_HOLD) {
        uniforms.composited_mode = compHoldMode;
        const fadeIn = Math.min(compHoldFrames / 20, 1.0);
        const remainingInMax = COMP_MAX_HOLD - compHoldFrames;
        const fadeOut = Math.min(remainingInMax / 20, 1.0);
        uniforms.composited_intensity = compHoldIntensity * fadeIn * fadeOut;
        compHoldFrames++;
      } else if (compHoldMode > 0) {
        uniforms.composited_mode = 0;
        uniforms.composited_intensity = 0;
        compCooldown = COMP_COOLDOWN;
        compHoldMode = 0;
        compHoldFrames = 0;
      } else if (compCooldown > 0) {
        uniforms.composited_mode = 0;
        uniforms.composited_intensity = 0;
        compCooldown--;
      } else if (desiredComp > 0) {
        compHoldMode = desiredComp;
        compHoldIntensity = desiredCompIntensity;
        compHoldFrames = 1;
        uniforms.composited_mode = desiredComp;
        uniforms.composited_intensity = desiredCompIntensity * 0.05;
      } else {
        uniforms.composited_mode = 0;
        uniforms.composited_intensity = 0;
      }

      // ─── Sacred moment overrides (authored effect directives) ───
      // Applied AFTER normal trigger cascade — force specific effects in sacred regions.
      // MIN_HOLD and COOLDOWN are bypassed. Fades in/out at region boundaries.
      const songTrackId = song.trackId;
      for (const sm of sacredMoments) {
        if (sm.trackId !== songTrackId) continue;
        if (i < sm.startFrame || i >= sm.endFrame) continue;

        // Compute fade envelope (30-frame crossfade at boundaries)
        const fadeLen = sm.fadeFrames ?? 30;
        const framesIn = i - sm.startFrame;
        const framesOut = sm.endFrame - 1 - i;
        const fadeIn = Math.min(framesIn / fadeLen, 1.0);
        const fadeOut = Math.min(framesOut / fadeLen, 1.0);
        const fade = fadeIn * fadeOut;

        // Override post-process effect
        uniforms.effect_mode = sm.forcePostProcessMode;
        uniforms.effect_intensity = sm.forcePostProcessIntensity * fade;

        // Override composited effect
        uniforms.composited_mode = sm.forceCompositedMode;
        uniforms.composited_intensity = sm.forceCompositedIntensity * fade;

        // Reset hold state so normal cascade doesn't fight the override next frame
        effectHoldMode = sm.forcePostProcessMode;
        effectHoldIntensity = sm.forcePostProcessIntensity;
        effectHoldFrames = 1;
        effectCooldown = 0;
        compHoldMode = sm.forceCompositedMode;
        compHoldIntensity = sm.forceCompositedIntensity;
        compHoldFrames = 1;
        compCooldown = 0;
        break; // First matching moment wins
      }

      // Accumulate dynamic_time with modifiers.
      // IMPORTANT: tempo does NOT accelerate shader animation — it drives beat sync only.
      // Previously tempo/120 made 150 BPM songs run 1.25x faster which was seizure-inducing.
      // Now: base speed = real time, with subtle modifiers for musical feel.
      const dt = 1 / fps; // time step per frame
      const baseDT = dt; // real-time base (NOT tempo-scaled)
      const fluxMult = 1.0 + Math.min(0.02, (uniforms.spectral_flux || 0) * 0.05); // subtle flux boost
      // climaxState already declared above for effect triggers
      const climaxSpeed = (climaxState.phase === "climax" || climaxState.phase === "sustain")
        ? 1.0 + (climaxState.intensity ?? 0) * 0.15 // up to 1.15x during climax (was 1.3x)
        : 1.0;
      const deadAirMult = isDeadAir ? 0.05 : 1.0; // 5% speed during dead air
      dynamicTimeAccum += baseDT * fluxMult * climaxSpeed * deadAirMult;
      uniforms.dynamic_time = dynamicTimeAccum;
      uniforms.beat_time = dynamicTimeAccum; // keep in sync

      // Suppress reactive uniforms during dead air — calm ambient, no pulsing to noise
      if (isDeadAir) {
        uniforms.energy = Math.min(uniforms.energy ?? 0, 0.05);
        uniforms.bass = Math.min(uniforms.bass ?? 0, 0.02);
        uniforms.onset = 0;
        uniforms.beat_snap = 0;
        uniforms.drum_onset = 0;
        // Keep dead air visible but subdued (not nearly invisible)
        uniforms.envelope_brightness = Math.min(uniforms.envelope_brightness ?? 0.5, 0.45);
        uniforms.envelope_saturation = Math.min(uniforms.envelope_saturation ?? 0.5, 0.65);
      }

      allFrames.push({
        shader_id: route.shaderId,
        frame: allFrames.length,
        secondary_shader_id: route.secondaryId,
        blend_progress: route.blendProgress,
        blend_mode: route.blendMode,
        ...uniforms,
      });
    }

    // ─── Overlay schedule for this song (when --with-overlays) ───
    if (withOverlays && overlayPool.length > 0) {
      const overlayStartTime = Date.now();

      // Convert sections to SectionBoundary format expected by overlay rotation
      const overlaySections: SectionBoundary[] = (sections ?? []).map((s: any, si: number) => {
        const start = s.start ?? s.frameStart ?? 0;
        const end = s.end ?? s.frameEnd ?? frames.length;
        const mid = Math.floor((start + end) / 2);
        const avgEnergy = smoothed.energy[Math.min(mid, frames.length - 1)] ?? 0.3;
        const energy: "low" | "mid" | "high" = avgEnergy > 0.25 ? "high" : avgEnergy > 0.12 ? "mid" : "low";
        return {
          frameStart: start,
          frameEnd: end,
          label: `section_${si}`,
          energy,
          avgEnergy,
        };
      });

      // Fallback if no sections
      if (overlaySections.length === 0) {
        overlaySections.push({
          frameStart: 0,
          frameEnd: frames.length,
          label: "section_0",
          energy: "mid" as const,
          avgEnergy: 0.2,
        });
      }

      // Build rotation schedule for this song
      const rotSchedule = buildRotationSchedule(
        overlayPool,
        overlaySections,
        song.trackId ?? `song${songIdx}`,
        showDateHash,       // showSeed
        frames,             // EnhancedFrameData[]
        isDrumsSpace,
        undefined,          // energyHints
        setlist.era ?? "primal",
        undefined,          // mode
        songIdentity,
        undefined,          // showArcModifiers
        undefined,          // drumsSpacePhase
        undefined,          // stemSectionType
        showSongsCompleted, // songsCompleted
        undefined,          // songHero
        tempo,
      );

      // Get prominence data for blend mode mapping
      const prominenceMap = new Map<string, string>();
      for (const entry of OVERLAY_REGISTRY) {
        if (entry.prominence) prominenceMap.set(entry.name, entry.prominence);
      }

      // Compute per-frame overlay instances
      for (let i = 0; i < totalOut; i++) {
        const { lo: ai } = getInterpolatedIndex(i, afps, fps, frames.length);
        // Map output frame to analysis frame for overlay rotation (which operates at analysis fps)
        const analysisFrame = ai;

        const opacities = getOverlayOpacities(
          analysisFrame,
          rotSchedule,
          frames,
          undefined, // calibration
          (ctx._preComputed?.reactive?.[ai] ?? { triggered: false, triggerType: null, shaderPool: [] }) as any,
          tempo,
        );

        // Convert opacities to OverlayInstance array
        const frameInstances: typeof overlaySchedule[0] = [];
        for (const [overlayName, opacity] of Object.entries(opacities)) {
          if (opacity <= 0.005) continue; // skip invisible overlays

          // ALL overlays use screen blend — dark pixels vanish naturally.
          // "Normal" blend makes dark icons look like opaque stickers on bright shaders.
          const prominence = prominenceMap.get(overlayName) ?? "ambient";
          const blendMode = "screen";

          // Scale: overlay PNGs are full-frame (1920x1080). Scale controls what
          // fraction of the frame the overlay covers. 0.25 = quarter of frame.
          let scale = 0.38; // default: 38% of frame
          if (overlayName === "SongTitle" || overlayName === "ConcertInfo") {
            scale = 0.22;
          } else if (overlayName === "FilmGrain") {
            scale = 1.0;
          } else if (prominence === "hero") {
            scale = 0.35; // hero icons: present, recognizable
          } else if (prominence === "accent") {
            scale = 0.33;
          }

          // Cap opacity: overlays should enhance, not dominate
          let finalOpacity = opacity;
          if (prominence === "ambient") finalOpacity = Math.min(finalOpacity, 0.25);
          if (prominence === "accent") finalOpacity = Math.min(finalOpacity, 0.40);
          // Hero icons: still subtle — they're cultural texture, not logos
          if (prominence === "hero") finalOpacity = Math.min(finalOpacity, 0.30);
          // FilmGrain: very subtle — it should add texture not haze
          if (overlayName === "FilmGrain") finalOpacity = Math.min(finalOpacity, 0.15);
          // SmokeWisps: only during quiet passages, invisible at peaks
          if (overlayName === "SmokeWisps") {
            const frameEnergy = frames[ai]?.rms ?? 0.3;
            finalOpacity = finalOpacity * Math.max(0, 1.0 - frameEnergy * 3);
          }
          // ConcertInfo: brief appearance at song start then gone
          if (overlayName === "ConcertInfo") {
            const songTimeSec = i / fps;
            if (songTimeSec < 0.5) finalOpacity = songTimeSec * 0.8;
            else if (songTimeSec < 6.0) finalOpacity = 0.4;
            else if (songTimeSec < 8.0) finalOpacity = 0.4 * (1.0 - (songTimeSec - 6.0) / 2.0);
            else finalOpacity = 0;
          }
          // SongTitle: fade in at song start, hold 8s, fade out by 11s, then invisible
          if (overlayName === "SongTitle") {
            const songTimeSec = i / fps;
            if (songTimeSec < 1.0) {
              finalOpacity = songTimeSec * 0.6; // fade in over 1s
            } else if (songTimeSec < 9.0) {
              finalOpacity = 0.6; // hold
            } else if (songTimeSec < 11.0) {
              finalOpacity = 0.6 * (1.0 - (songTimeSec - 9.0) / 2.0); // fade out over 2s
            } else {
              finalOpacity = 0; // invisible after 11s
            }
          }

          // Scatter overlays across the frame — don't stack at center
          // Use seeded hash of overlay name for deterministic but varied positioning
          const nameHash = overlayName.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
          const posRng = Math.abs(nameHash % 1000) / 1000; // 0-1 from name
          let offsetX = 0.0;
          let offsetY = 0.0;
          // Audio-reactive overlay transforms: overlays breathe with the music
          const frameRms = frames[ai]?.rms ?? 0.2;
          const frameBass = frames[ai]?.stemBassRms ?? frames[ai]?.rms ?? 0.2;
          const frameBeat = frames[ai]?.beat ? 1 : 0;
          const isIcon = overlayName !== "FilmGrain" && overlayName !== "SongTitle" && overlayName !== "ConcertInfo";

          if (isIcon) {
            const timeSec = i / fps;
            // Drift: energy-modulated speed (nearly still in quiet, flowing at peaks)
            const driftSpeed = (0.008 + frameRms * 0.02) + (posRng * 0.005);
            const driftX = Math.sin(timeSec * driftSpeed * 2 + nameHash) * (0.05 + frameRms * 0.05);
            const driftY = Math.cos(timeSec * driftSpeed * 1.3 + nameHash * 0.7) * (0.04 + frameRms * 0.04);
            offsetX = (posRng - 0.5) * 0.35 + driftX;
            offsetY = (((nameHash >> 8) & 0xFF) / 255 - 0.5) * 0.25 + driftY;

            // Opacity: breathe with bass — subtle pulse on rhythm
            const breathe = 1.0 + Math.sin(timeSec * 3.0 + nameHash) * frameBass * 0.15;
            finalOpacity *= breathe;

            // Beat flash: tiny brightness bump on beats
            if (frameBeat) finalOpacity *= 1.08;
          } else if (overlayName === "SongTitle") {
            offsetX = 0.0; offsetY = 0.35;
          }

          // Rotation: energy-modulated sway
          let rotDeg = 0.0;
          if (isIcon) {
            const timeSec = i / fps;
            const rotSpeed = 0.015 + frameRms * 0.01;
            rotDeg = Math.sin(timeSec * rotSpeed + nameHash * 0.1) * (5 + frameRms * 8); // ±5° quiet, ±13° loud
          }

          // Scale: breathe with bass — icons pulse subtly with the low end
          let finalScale = scale;
          if (isIcon) {
            finalScale *= (1.0 + frameBass * 0.08); // up to 8% larger on bass hits
          }

          const instance: any = {
            overlay_id: overlayName,
            transform: {
              opacity: Math.round(Math.min(finalOpacity, overlayName === "SongTitle" ? 1.0 : 0.35) * 1000) / 1000,
              scale: Math.round(finalScale * 1000) / 1000,
              rotation_deg: Math.round(rotDeg * 10) / 10,
              offset_x: Math.round(offsetX * 1000) / 1000,
              offset_y: Math.round(offsetY * 1000) / 1000,
            },
            blend_mode: blendMode,
          };
          // SongTitle: attach inline SVG for text rendering (no PNG exists)
          if (overlayName === "SongTitle" && finalOpacity > 0.01) {
            const safeTitle = song.title.replace(/&/g, '&amp;');
            instance.keyframe_svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><defs><filter id="ts" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.8"/></filter></defs><text x="${width / 2}" y="${Math.round(height * 0.92)}" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="${Math.round(height * 0.05)}" fill="rgba(255,248,230,1)" filter="url(#ts)" letter-spacing="4">${safeTitle}</text><text x="${width / 2}" y="${Math.round(height * 0.96)}" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(height * 0.022)}" fill="rgba(255,248,230,0.5)" letter-spacing="2">SET ${song.set ?? 1}</text></svg>`;
          }
          // FilmGrain + SmokeWisps: skip if no PNG (handled by GLSL postprocess / cosmetic)
          if ((overlayName === "FilmGrain" || overlayName === "SmokeWisps") && finalOpacity > 0) {
            continue; // no PNG, no SVG — skip to avoid silent cache miss
          }
          frameInstances.push(instance);
        }

        // Dead cultural watermark: one iconic symbol always subtly present.
        // Rotates through Dead icons on a slow 30-second cycle.
        // Screen-blended at 10-12% opacity — felt more than seen.
        // Only icons that have bright content in their PNGs (dark backgrounds get stripped).
        // StealYourFaceOff (0.1% bright) and BearTraced (missing) removed.
        const DEAD_ICONS = ["BreathingStealie", "ThirteenPointBolt", "GoldenRoad", "StealieFade"];
        const iconCycleIdx = Math.floor((i / fps / 30)) % DEAD_ICONS.length; // new icon every 30s
        const iconName = DEAD_ICONS[iconCycleIdx];
        // Don't add if this icon is already in the frame (from regular rotation)
        if (!frameInstances.some(fi => fi.overlay_id === iconName)) {
          // Slow breathing opacity: 8-12% with gentle sine wave
          const breathe = 0.10 + Math.sin(i / fps * 0.3) * 0.02;
          const iconHash = iconName.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
          frameInstances.push({
            overlay_id: iconName,
            transform: {
              opacity: Math.round(breathe * 1000) / 1000,
              scale: 0.20, // small — it's a watermark, not a feature
              rotation_deg: 0,
              offset_x: Math.round(((Math.abs(iconHash % 100) / 100 - 0.5) * 0.3) * 1000) / 1000,
              offset_y: Math.round(((Math.abs((iconHash >> 8) % 100) / 100 - 0.5) * 0.3) * 1000) / 1000,
            },
            blend_mode: "screen",
          });
        }

        // Song art: small poster in bottom-left corner.
        // Fades in over 3s at song start, holds at low opacity, fades during peaks.
        const songArtId = `SongArt_${song.trackId}`;
        const artFadeIn = Math.min(i / (fps * 3), 1.0); // 3s fade in
        const artEnergyFade = 1.0 - Math.min(1, Math.max(0, ((smoothed.energy[ai] ?? 0.3) - 0.4) / 0.3)); // fade out at high energy
        const artOpacity = 0.25 * artFadeIn * artEnergyFade; // max 25% opacity
        if (artOpacity > 0.01) {
          frameInstances.push({
            overlay_id: songArtId,
            transform: {
              opacity: Math.round(artOpacity * 1000) / 1000,
              scale: 0.18, // small — bottom-left poster
              rotation_deg: 0,
              offset_x: -0.38, // bottom-left
              offset_y: 0.35,
            },
            blend_mode: "screen",
          });
        }

        overlaySchedule.push(frameInstances);
      }

      const overlayMs = Date.now() - overlayStartTime;
      const avgOverlays = overlaySchedule.length > 0
        ? (overlaySchedule.slice(-totalOut).reduce((s, f) => s + f.length, 0) / totalOut).toFixed(1)
        : "0";
      console.log(`    Overlays: ${totalOut} frames in ${(overlayMs / 1000).toFixed(1)}s (avg ${avgOverlays} per frame)`);
    }

    // Track song boundary for chapter cards
    songBoundaries.push({
      title: song.title,
      set: song.set ?? (songIdx < 10 ? 1 : songIdx < 15 ? 2 : 3),
      startFrame: allFrames.length - totalOut,
      endFrame: allFrames.length,
    });

    globalTime += frames.length / afps;
    showSongsCompleted++;
    const songElapsed = ((Date.now() - songStartTime) / 1000).toFixed(1);
    console.log(`  ✓ ${song.title} done (${totalOut} frames in ${songElapsed}s, ${allFrames.length} total)`);
  }

  // ─── Song boundary crossfades ───
  // Smooth transitions between songs: last 2s of song N blends into first 2s of song N+1.
  // Prevents hard cuts where 25+ fields jump simultaneously (black flash, shader cold-start).
  // Boundary crossfades OVERRIDE section crossfades (they take precedence).
  // Energy/brightness are smoothed across the boundary to prevent uniform discontinuity.
  const BOUNDARY_FADE_FRAMES = Math.round(fps * 2); // 2 seconds at output fps
  if (songBoundaries.length > 1) {
    console.log(`[full-manifest] Applying ${songBoundaries.length - 1} song boundary crossfades (${BOUNDARY_FADE_FRAMES} frames each)`);
    let crossfadesApplied = 0;

    for (let bi = 0; bi < songBoundaries.length - 1; bi++) {
      const songA = songBoundaries[bi];
      const songB = songBoundaries[bi + 1];
      const boundary = songA.endFrame; // = songB.startFrame

      // Skip if either song is too short for a crossfade
      const songALen = songA.endFrame - songA.startFrame;
      const songBLen = songB.endFrame - songB.startFrame;
      if (songALen < BOUNDARY_FADE_FRAMES * 2 || songBLen < BOUNDARY_FADE_FRAMES * 2) continue;

      // Determine blend mode: segue pairs use luminance_key, others use dissolve
      const songAData = songs[bi];
      const isSegue = songAData?.segueInto && songAData.segueInto !== false;
      const blendMode = isSegue ? "luminance_key" : "dissolve";

      // Get the shader at end of song A and start of song B
      const shaderAtEndA = allFrames[boundary - 1]?.shader_id;
      const shaderAtStartB = allFrames[boundary]?.shader_id;
      if (!shaderAtEndA || !shaderAtStartB) continue;

      // Snapshot values at boundary edges for smoothing
      const endA = allFrames[boundary - 1];
      const startB = allFrames[boundary];
      const mbEndA = endA?.motion_blur_samples ?? 1;
      const mbStartB = startB?.motion_blur_samples ?? 1;
      const energyEndA = endA?.energy ?? 0.3;
      const energyStartB = startB?.energy ?? 0.3;
      const brightEndA = endA?.envelope_brightness ?? 1.0;
      const brightStartB = startB?.envelope_brightness ?? 1.0;
      const satEndA = endA?.envelope_saturation ?? 1.0;
      const satStartB = startB?.envelope_saturation ?? 1.0;

      // Last BOUNDARY_FADE_FRAMES of song A: blend toward song B's shader
      for (let j = 0; j < BOUNDARY_FADE_FRAMES; j++) {
        const fi = boundary - BOUNDARY_FADE_FRAMES + j;
        if (fi < songA.startFrame || fi >= boundary) continue;
        const progress = j / BOUNDARY_FADE_FRAMES; // 0→1
        const frame = allFrames[fi];
        if (!frame) continue;

        // Boundary crossfade OVERRIDES section crossfades (takes precedence)
        frame.secondary_shader_id = shaderAtStartB;
        frame.blend_progress = progress;
        frame.blend_mode = blendMode;

        // Smooth motion_blur, energy, brightness, saturation toward song B values
        frame.motion_blur_samples = Math.round(mbEndA + (mbStartB - mbEndA) * progress);
        // Ease energy/brightness toward the incoming song's values in the last 25% of the fade
        const easeT = Math.max(0, (progress - 0.75) * 4); // 0 until 75%, then 0→1
        frame.energy = (frame.energy ?? 0) * (1 - easeT) + energyStartB * easeT;
        frame.envelope_brightness = (frame.envelope_brightness ?? 1) * (1 - easeT) + brightStartB * easeT;
        frame.envelope_saturation = (frame.envelope_saturation ?? 1) * (1 - easeT) + satStartB * easeT;
      }

      // First BOUNDARY_FADE_FRAMES of song B: blend from song A's shader
      for (let j = 0; j < BOUNDARY_FADE_FRAMES; j++) {
        const fi = boundary + j;
        if (fi >= songB.endFrame) continue;
        const progress = 1.0 - (j / BOUNDARY_FADE_FRAMES); // 1→0 (outgoing shader fades)
        const frame = allFrames[fi];
        if (!frame) continue;

        // Boundary crossfade OVERRIDES section crossfades (takes precedence)
        frame.secondary_shader_id = shaderAtEndA;
        frame.blend_progress = progress;
        frame.blend_mode = blendMode;

        // Smooth motion_blur, energy, brightness, saturation from song A values
        frame.motion_blur_samples = Math.round(mbStartB + (mbEndA - mbStartB) * progress);
        // Ease energy/brightness from the outgoing song's values in the first 25% of the fade
        const easeT = Math.max(0, (progress - 0.75) * 4); // strong at start, fades by 25%
        frame.energy = (frame.energy ?? 0) * (1 - easeT) + energyEndA * easeT;
        frame.envelope_brightness = (frame.envelope_brightness ?? 1) * (1 - easeT) + brightEndA * easeT;
        frame.envelope_saturation = (frame.envelope_saturation ?? 1) * (1 - easeT) + satEndA * easeT;
      }

      crossfadesApplied++;
      console.log(`    ${songA.title} → ${songB.title}: ${blendMode}${isSegue ? " (segue)" : ""}`);
    }
    console.log(`[full-manifest] ${crossfadesApplied} boundary crossfades applied`);
  }

  // ─── Single-song mode: write just the frames array ───
  if (singleSongIdx >= 0) {
    console.log(`\n[full-manifest] Single-song mode: writing ${allFrames.length} frames`);
    writeFileSync(outputPath, JSON.stringify(allFrames));
    const mb = (statSync(outputPath).size / 1048576).toFixed(1);
    console.log(`[full-manifest] Done: ${outputPath} (${mb} MB, ${allFrames.length} frames)`);

    // Write overlay schedule to a sibling file for the parallel merger to pick up
    if (withOverlays && overlaySchedule.length > 0) {
      const overlayPath = outputPath.replace("-frames.json", "-overlays.json");
      writeFileSync(overlayPath, JSON.stringify(overlaySchedule));
      const overlayMb = (statSync(overlayPath).size / 1048576).toFixed(1);
      console.log(`[full-manifest] Overlays: ${overlayPath} (${overlayMb} MB, ${overlaySchedule.length} frames)`);
    }
    return;
  }

  // ─── Strip unused shaders ───
  // Only include shaders actually referenced by frames (primary + secondary).
  // Reduces manifest from ~1.6GB to ~400MB for a typical 20-song show.
  const usedShaderIds = new Set<string>();
  for (const fr of allFrames) {
    usedShaderIds.add(fr.shader_id);
    if (fr.secondary_shader_id) usedShaderIds.add(fr.secondary_shader_id);
  }
  const strippedShaders: Record<string, string> = {};
  for (const id of usedShaderIds) {
    if (shaders[id]) strippedShaders[id] = shaders[id];
  }
  const stripped = Object.keys(shaders).length - Object.keys(strippedShaders).length;
  console.log(`[full-manifest] Shader strip: ${Object.keys(strippedShaders).length} used, ${stripped} unused removed`);

  // Pre-flight validation: every referenced shader must have GLSL source
  let missingShaders = 0;
  for (const id of usedShaderIds) {
    if (!strippedShaders[id]) {
      console.error(`  ERROR: frame references shader "${id}" but no GLSL source found`);
      missingShaders++;
    }
  }
  if (missingShaders > 0) {
    console.error(`[full-manifest] ${missingShaders} referenced shaders have no source — render will produce black frames`);
  }

  // ─── Write manifest (streaming JSON for large shows) ───
  console.log(`\n[full-manifest] Writing: ${allFrames.length} frames, ${Object.keys(strippedShaders).length} shaders`);
  const ws = createWriteStream(outputPath);

  ws.write('{"shaders":');
  ws.write(JSON.stringify(strippedShaders));
  ws.write(`,"width":${width},"height":${height},"fps":${fps},"show_title":${JSON.stringify(showTitle)}`);
  ws.write(`,"song_boundaries":${JSON.stringify(songBoundaries)}`);
  ws.write(',"frames":[\n');

  // Helper: write with backpressure handling for large files
  const safeWrite = (data: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!ws.write(data)) {
        ws.once('drain', resolve);
      } else {
        resolve();
      }
    });
  };

  for (let i = 0; i < allFrames.length; i++) {
    if (i > 0) await safeWrite(',\n');
    await safeWrite(JSON.stringify(allFrames[i]));
    if (i % 50000 === 0 && i > 0) {
      process.stdout.write(`  ${(i / allFrames.length * 100).toFixed(0)}%`);
    }
  }

  await safeWrite('\n]');

  // ─── Write overlay schedule (when --with-overlays) ───
  if (withOverlays && overlaySchedule.length > 0) {
    console.log(`\n[full-manifest] Writing overlay_schedule: ${overlaySchedule.length} frames`);
    await safeWrite(',"overlay_schedule":[\n');
    for (let i = 0; i < overlaySchedule.length; i++) {
      if (i > 0) await safeWrite(',\n');
      await safeWrite(JSON.stringify(overlaySchedule[i]));
      if (i % 50000 === 0 && i > 0) {
        process.stdout.write(`  overlays ${(i / overlaySchedule.length * 100).toFixed(0)}%`);
      }
    }
    await safeWrite('\n]');
    await safeWrite(`,"overlay_png_dir":${JSON.stringify(overlayPngDirExplicit ? overlayPngDir : resolve(overlayPngDir))}`);

    // Report overlay usage stats
    const overlayUsage = new Map<string, number>();
    for (const frame of overlaySchedule) {
      for (const inst of frame) {
        overlayUsage.set(inst.overlay_id, (overlayUsage.get(inst.overlay_id) ?? 0) + 1);
      }
    }
    const sortedOverlays = [...overlayUsage.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`\n[full-manifest] Overlay usage (top 15):`);
    for (const [name, count] of sortedOverlays.slice(0, 15)) {
      const pct = (count / overlaySchedule.length * 100).toFixed(1);
      console.log(`  ${name}: ${count} frames (${pct}%)`);
    }
  }

  await safeWrite('}');
  await new Promise<void>((res, rej) => {
    ws.end(() => res());
    ws.on("error", rej);
  });

  const mb = (statSync(outputPath).size / 1048576).toFixed(1);
  console.log(`[full-manifest] Done: ${outputPath} (${mb} MB, ${allFrames.length} frames)`);

  // Report shader usage
  const sortedModes = [...usedShaderModes.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n[full-manifest] Shader usage (top 10):`);
  for (const [mode, count] of sortedModes.slice(0, 10)) {
    const pct = (count / allFrames.length * 100).toFixed(1);
    console.log(`  ${mode}: ${count} frames (${pct}%)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
