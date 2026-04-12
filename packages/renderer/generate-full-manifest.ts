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
import { computeCoherence } from "../visualizer-poc/src/utils/coherence.js";
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
import { lookupSongIdentity, getOrGenerateSongIdentity } from "../visualizer-poc/src/data/song-identities.js";
import { computeShowVisualSeed, type ShowVisualSeed } from "../visualizer-poc/src/utils/show-visual-seed.js";
import { hashString } from "../visualizer-poc/src/utils/hash.js";

// ─── Shader collection (same as generate-manifest.ts) ───

async function collectShaderGLSL(): Promise<Record<string, string>> {
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
    } catch {}
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

  for (let i = 0; i < n; i++) {
    result.energy[i] = gaussianSmooth(frames, i, "rms", 25);
    result.slowEnergy[i] = gaussianSmooth(frames, i, "rms", 90);
    result.fastEnergy[i] = gaussianSmooth(frames, i, "rms", 5);
    result.bass[i] = gaussianSmooth(frames, i, "sub", 15) + gaussianSmooth(frames, i, "low", 15);
    result.fastBass[i] = gaussianSmooth(frames, i, "sub", 5);
    result.mids[i] = gaussianSmooth(frames, i, "mid", 12);
    result.highs[i] = gaussianSmooth(frames, i, "high", 12);
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

function analyzeFrame(
  ctx: SongContext,
  idx: number,
  prevState: any,
): any {
  const { frames, sections, tempo, isDrumsSpace } = ctx;
  const f = frames[idx] ?? {};

  // Build audio snapshot for pure utilities
  let snapshot: any;
  try {
    snapshot = computeAudioSnapshot(frames, idx, 30);
  } catch {
    // Fallback if computeAudioSnapshot has interface mismatch
    snapshot = {
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

  // Structural analysis (all pure functions)
  let stemSection = "jam";
  let soloState = null;
  let interplay = null;
  let coherenceState = { isLocked: false, score: 0 };
  let itState = { forceTranscendentShader: false };
  let drumsSpaceState = null;
  let climaxState = { phase: "idle", intensity: 0 };
  let climaxMod = { saturationOffset: 0, brightnessOffset: 0, bloomOffset: 0 };
  let reactiveState = { triggered: false, triggerType: null, shaderPool: [] as string[] };
  let groove = { type: "pocket", motionMult: 1.0 };
  let grooveMods = { motionMult: 1.0, overlayDensityMult: 1.0 };
  let jamCycle = { phase: "setup", progress: 0, isDeepening: false };
  let sectionVocab = { overlayDensityMult: 1.0, driftSpeedMult: 1.0 };
  let narrative = { saturationOffset: 0, temperature: 0, overlayDensityMult: 1.0, motionMult: 1.0 };
  let peakOfShow = { isPeak: false, intensity: 0 };

  // Track which analysis functions succeed (logged once on first frame)
  const failures: string[] = [];

  try { stemSection = classifyStemSection(snapshot); } catch (e) { failures.push(`stemSection: ${(e as Error).message?.slice(0,60)}`); }
  try { soloState = detectSolo(snapshot); } catch (e) { failures.push(`solo: ${(e as Error).message?.slice(0,60)}`); }
  try { interplay = detectStemInterplay(frames, idx); } catch (e) { failures.push(`interplay: ${(e as Error).message?.slice(0,60)}`); }
  try { coherenceState = computeCoherence(frames, idx); } catch (e) { failures.push(`coherence: ${(e as Error).message?.slice(0,60)}`); }
  try { itState = computeITResponse(frames, idx); } catch (e) { failures.push(`IT: ${(e as Error).message?.slice(0,60)}`); }
  try { drumsSpaceState = computeDrumsSpacePhase(frames, idx, isDrumsSpace); } catch (e) { failures.push(`drumsSpace: ${(e as Error).message?.slice(0,60)}`); }
  try { climaxState = computeClimaxState(frames, idx, sections); } catch (e) { failures.push(`climax: ${(e as Error).message?.slice(0,60)}`); }
  try { climaxMod = climaxModulation(climaxState as any); } catch (e) { failures.push(`climaxMod: ${(e as Error).message?.slice(0,60)}`); }
  try { reactiveState = computeReactiveTriggers(frames, idx, { coherenceLocked: coherenceState.isLocked }); } catch (e) { failures.push(`reactive: ${(e as Error).message?.slice(0,60)}`); }
  try {
    groove = detectGroove(
      snapshot.beatStability ?? 0.5,
      snapshot.drumOnset ?? 0,
      snapshot.energy ?? 0.3,
      snapshot.flatness ?? 0.5,
    );
    grooveMods = grooveModifiers(groove as any);
  } catch (e) { failures.push(`groove: ${(e as Error).message?.slice(0,60)}`); }
  try { jamCycle = detectJamCycle(frames, idx, sections); } catch (e) { failures.push(`jamCycle: ${(e as Error).message?.slice(0,60)}`); }
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

  // Priority 1: IT transcendent forcing
  if (itState?.forceTranscendentShader) {
    const pool = ["cosmic_voyage", "cosmic_voyage", "mandala_engine", "aurora"];
    const pick = pool[Math.floor(seededRandom(ctx.songSeed + frameIdx * 7) * pool.length)];
    return { shaderId: pick, secondaryId: null, blendProgress: null, blendMode: null };
  }

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
  // 15% of section, max 3s — scale by fps (90 frames = 3s at 30fps)
  const fpsScale = (ctx as any).fps ? (ctx as any).fps / 30 : 2; // default 60fps = 2x
  const crossfadeLen = Math.min(Math.round(90 * fpsScale), Math.floor(sectionLen * 0.15));

  // Crossfade IN: first frames of a new section
  if (sectionProgress < 0.15 && prevShaderId !== routeState.currentMode && crossfadeLen > 0) {
    const crossfadeProgress = sectionProgress / 0.15;
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
): Record<string, number> {
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

  const factor = Math.max(0, Math.min(1, (energy - 0.05) / 0.30));
  const envBrightness = 0.55 + Math.sqrt(factor) * 0.50;

  // Structural analysis values (discrete state machines — don't interpolate phases)
  const climax = analysis?.climaxState ?? { phase: "idle", intensity: 0 };
  const climaxPhaseMap: Record<string, number> = { idle: 0, build: 1, climax: 2, sustain: 3, release: 4 };
  const jamCycle = analysis?.jamCycle ?? { phase: "setup", progress: 0 };
  const jamPhaseMap: Record<string, number> = { exploration: 0, building: 1, peak_space: 2, resolution: 3 };
  const coherence = analysis?.coherenceState?.score ?? 0;

  return {
    time, dynamic_time: time * (tempo / 120), beat_time: time * (tempo / 120),
    musical_time: (time * tempo / 60) % 1, tempo,
    energy, rms: L("rms"), bass, mids, highs,
    onset: L("onset"),
    centroid: L("centroid", 0.5),
    beat: f.beat ? 1 : 0,  // discrete — don't interpolate
    slow_energy: slowEnergy,
    fast_energy: lerpSmoothed(smoothed.fastEnergy),
    fast_bass: lerpSmoothed(smoothed.fastBass),
    spectral_flux: L("spectralFlux") || 0,
    energy_accel: lerpSmoothed(smoothed.fastEnergy) - energy,
    energy_trend: energy - slowEnergy,
    onset_snap: L("onset"), beat_snap: f.beat ? 1 : 0,
    beat_confidence: L("beatConfidence", 0.5),
    beat_stability: L("beatStability", 0.5),
    downbeat: f.downbeat ? 1 : 0,  // discrete
    drum_onset: L("stemDrumOnset"),
    drum_beat: f.stemDrumBeat ? 1 : 0,  // discrete
    stem_bass: L("stemBassRms") || bass,
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
    section_index: 0,
    section_progress: L("sectionProgress"),
    climax_phase: climaxPhaseMap[climax.phase] ?? 0,  // discrete
    climax_intensity: climax.intensity ?? 0,
    coherence,
    jam_density: 0.5 + (jamCycle.progress ?? 0) * 0.3,
    jam_phase: jamPhaseMap[jamCycle.phase] ?? 0,  // discrete
    jam_progress: jamCycle.progress ?? 0,
    energy_forecast: L("energyForecast"),
    peak_approaching: L("peakApproaching"),
    tempo_derivative: L("tempoDerivative"),
    dynamic_range: L("dynamicRange", 0.5),
    space_score: L("spaceScore"),
    timbral_brightness: L("timbralBrightness", 0.5),
    timbral_flux: L("timbralFlux"),
    vocal_pitch: L("vocalPitch"),
    vocal_pitch_confidence: L("vocalPitchConfidence"),
    improvisation_score: L("improvisationScore"),
    semantic_psychedelic: L("semantic_psychedelic"),
    semantic_cosmic: L("semantic_cosmic"),
    semantic_aggressive: L("semantic_aggressive"),
    semantic_tender: L("semantic_tender"),
    semantic_rhythmic: L("semantic_rhythmic"),
    semantic_ambient: L("semantic_ambient"),
    semantic_chaotic: L("semantic_chaotic"),
    semantic_triumphant: L("semantic_triumphant"),
    palette_primary: (song?.palette?.primary ?? 30) / 360,
    palette_secondary: (song?.palette?.secondary ?? 200) / 360,
    palette_saturation: song?.palette?.saturation ?? 0.85,
    envelope_brightness: envBrightness,
    envelope_saturation: 1.0 + energy * 0.2,
    envelope_hue: 0,
    era_saturation: 1.05, era_brightness: 1.0, era_sepia: 0.06,
    show_warmth: 0, show_contrast: 1.0, show_saturation: 1.0,
    show_grain: 1.0, show_bloom: 1.0,
    param_bass_scale: 1.0, param_energy_scale: 1.0, param_motion_speed: 1.0,
    param_color_sat_bias: 0, param_complexity: 1.0,
    param_drum_reactivity: 1.0, param_vocal_weight: 1.0,
    peak_of_show: analysis?.peakOfShow?.isPeak ? 1 : 0,
    // Phase 2C: shader progress uniforms
    song_progress: songProgress ?? 0,
    shader_hold_progress: sectionProgress ?? 0,
    // Phase 4C: per-show visual character (computed once per show)
    show_grain_character: showVisualSeed?.grainPreference ?? 0.5,
    show_bloom_character: showVisualSeed?.bloomBias ?? 0.0,
    show_temperature_character: showVisualSeed?.paletteTemperature ?? 0.0,
    show_contrast_character: showVisualSeed?.contrastCharacter ?? 0.5,
    // FFT contrast data (7-band)
    contrast: [
      bass,
      f.stemBassRms ?? bass,
      mids,
      energy,
      highs,
      f.timbralBrightness ?? 0.5,
      f.spectralFlux ?? 0,
    ],
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
  const outputPath = getArg("output", "manifest.json");
  const fps = parseInt(getArg("fps", "60"));
  const width = parseInt(getArg("width", "3840"));
  const height = parseInt(getArg("height", "2160"));

  console.log(`[full-manifest] Data: ${dataDir}`);

  const setlist = JSON.parse(readFileSync(join(dataDir, "setlist.json"), "utf-8"));
  const showTitle = `${setlist.venue ?? "?"} — ${setlist.date ?? ""}`;
  const songs = setlist.songs ?? [];
  console.log(`[full-manifest] Show: ${showTitle} (${songs.length} songs)`);

  console.log("[full-manifest] Collecting GLSL...");
  const shaders = await collectShaderGLSL();
  console.log(`[full-manifest] ${Object.keys(shaders).length} shaders collected`);

  // ─── Compute show visual seed from all song analysis data ───
  const allSongFrames: any[][] = [];
  for (const song of songs) {
    const trackPath = join(dataDir, "tracks", `${song.trackId}-analysis.json`);
    if (existsSync(trackPath)) {
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

  // ─── Process each song ───
  const allFrames: any[] = [];
  let globalTime = 0;
  const usedShaderModes = new Map<string, number>();
  const shaderModeLastUsed = new Map<string, number>();
  let showSongsCompleted = 0;

  for (let songIdx = 0; songIdx < songs.length; songIdx++) {
    const song = songs[songIdx];
    const trackPath = join(dataDir, "tracks", `${song.trackId}-analysis.json`);
    if (!existsSync(trackPath)) {
      console.warn(`  SKIP: ${song.title} (no analysis)`);
      showSongsCompleted++;
      continue;
    }

    const analysis = JSON.parse(readFileSync(trackPath, "utf-8"));
    const frames = analysis.frames ?? [];
    const sections = analysis.sections ?? [];
    const tempo = analysis.meta?.tempo ?? 120;
    const afps = analysis.meta?.fps ?? 30;
    const totalOut = Math.ceil((frames.length / afps) * fps);
    const defaultMode = (song.defaultMode ?? "protean_clouds").replace(/-/g, "_");
    const songIdentity = lookupSongIdentity(song.title) ?? undefined;
    const isDrumsSpace = song.title?.toLowerCase().includes("drums") ||
                          song.title?.toLowerCase().includes("space");
    const setNumber = song.set ?? 1;

    console.log(`  ${song.title}: ${frames.length} → ${totalOut} frames (default: ${defaultMode})`);

    // Pre-compute all Gaussian-smoothed values (O(n*w) once, then O(1) per frame)
    const smoothed = precomputeSmoothed(frames);

    const ctx: SongContext = {
      frames,
      sections,
      tempo,
      isDrumsSpace,
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

    // Build section boundaries for routing (frame ranges in output fps)
    const sectionBounds = (sections ?? []).map((s: any) => ({
      start: Math.floor((s.frameStart ?? 0) * (fps / afps)),
      end: Math.floor((s.frameEnd ?? frames.length) * (fps / afps)),
    }));

    // Pre-compute per-section modes using getModeForSection (real SceneRouter logic)
    const sectionModes: string[] = [];
    for (let si = 0; si < Math.max(1, sections.length); si++) {
      try {
        const mode = getModeForSection(
          { ...song, defaultMode } as any,  // SetlistEntry
          si,
          sections,
          ctx.songSeed,
          setlist.era,
          false,  // coherenceIsLocked (per-frame, not per-section)
          usedShaderModes,
          songIdentity,
          undefined,  // stemSection (per-frame)
          frames,
          frames.length / afps,  // songDuration
          setNumber,
          song.trackNumber ?? songIdx,
          shaderModeLastUsed,
          undefined,  // stemDominant
          undefined,  // visualMemory
        );
        sectionModes.push(mode);
      } catch {
        sectionModes.push(defaultMode);
      }
    }
    if (sectionModes.length > 1) {
      const unique = new Set(sectionModes);
      console.log(`    Sections: ${sectionModes.length} sections, ${unique.size} unique shaders [${[...unique].join(", ")}]`);
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

    for (let i = 0; i < totalOut; i++) {
      // Interpolated frame index for smooth 60fps (instead of nearest-neighbor)
      const { lo: ai, hi: aiHi, t: interpT } = getInterpolatedIndex(i, afps, fps, frames.length);

      // Structural analysis (uses integer index — these are discrete state machines)
      const frameAnalysis = analyzeFrame(ctx, ai, prevState);
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
      if (route.shaderId !== prevShaderId) {
        shaderStartFrame = i;
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

      // Compute uniforms with interpolation between adjacent analysis frames.
      // Structural analysis and routing use integer index (discrete decisions),
      // but continuous audio values are interpolated for smooth 60fps curves.
      const uniforms = computeUniforms(
        frames, ai, fps, tempo, width, height, globalTime, frameAnalysis, smoothed,
        aiHi, interpT,
        song, i / Math.max(1, totalOut), routeSectionProgress, showVisualSeed,
      );

      allFrames.push({
        shader_id: route.shaderId,
        frame: allFrames.length,
        secondary_shader_id: route.secondaryId,
        blend_progress: route.blendProgress,
        blend_mode: route.blendMode,
        ...uniforms,
      });
    }

    globalTime += frames.length / afps;
    showSongsCompleted++;
  }

  // ─── Write manifest (streaming JSON for large shows) ───
  console.log(`\n[full-manifest] Writing: ${allFrames.length} frames, ${Object.keys(shaders).length} shaders`);
  const ws = createWriteStream(outputPath);

  ws.write('{"shaders":');
  ws.write(JSON.stringify(shaders));
  ws.write(`,"width":${width},"height":${height},"fps":${fps},"show_title":${JSON.stringify(showTitle)}`);
  ws.write(',"frames":[\n');

  for (let i = 0; i < allFrames.length; i++) {
    if (i > 0) ws.write(',\n');
    ws.write(JSON.stringify(allFrames[i]));
    if (i % 50000 === 0 && i > 0) {
      process.stdout.write(`  ${(i / allFrames.length * 100).toFixed(0)}%\r`);
    }
  }

  ws.write('\n]}');
  await new Promise<void>((resolve, reject) => {
    ws.end(() => resolve());
    ws.on("error", reject);
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
