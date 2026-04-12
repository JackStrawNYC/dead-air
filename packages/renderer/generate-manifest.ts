#!/usr/bin/env npx tsx
/**
 * Manifest Generator — bridges the TypeScript brain to the Rust GPU renderer.
 *
 * This script evaluates all TypeScript routing logic (scene selection, audio-reactive
 * uniforms, transitions, crossfades) and outputs a JSON manifest that the Rust
 * renderer consumes.
 *
 * The manifest contains:
 *   1. Pre-composed GLSL strings (all template literals resolved)
 *   2. Per-frame data: shader_id + all uniform values
 *
 * Usage:
 *   npx tsx generate-manifest.ts --show-dir ../visualizer-poc/data/shows/cornell-77 \
 *     --output manifest.json --fps 60
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";

// ─── Import shader GLSL strings from visualizer-poc ───
// Each shader exports its fragment shader as a template-literal string.
// By importing here, all ${sharedUniformsGLSL}, ${noiseGLSL}, etc. are resolved.

const VISUALIZER_ROOT = resolve(__dirname, "../visualizer-poc");

// We dynamically import all shader modules to get their pre-composed GLSL
async function collectShaderGLSL(): Promise<Record<string, string>> {
  const shaders: Record<string, string> = {};

  // Map of scene registry keys → shader file + export names
  // This maps VisualMode → the actual GLSL fragment string
  const shaderMap: Record<string, { file: string; exportName: string }> = {
    fractal_temple: { file: "fractal-temple", exportName: "fractalTempleFrag" },
    inferno: { file: "inferno", exportName: "infernoFrag" },
    cosmic_voyage: { file: "cosmic-voyage", exportName: "cosmicVoyageFrag" },
    deep_ocean: { file: "deep-ocean", exportName: "deepOceanFrag" },
    river: { file: "river", exportName: "riverFrag" },
    ocean: { file: "ocean", exportName: "oceanFrag" },
    protean_clouds: { file: "protean-clouds", exportName: "proteanCloudsFrag" },
    volumetric_clouds: { file: "volumetric-clouds", exportName: "volumetricCloudsFrag" },
    volumetric_smoke: { file: "volumetric-smoke", exportName: "volumetricSmokeFrag" },
    volumetric_nebula: { file: "volumetric-nebula", exportName: "volumetricNebulaFrag" },
    space_travel: { file: "space-travel", exportName: "spaceTravelFrag" },
    aurora: { file: "aurora", exportName: "auroraFrag" },
    tie_dye: { file: "tie-dye", exportName: "tieDyeFrag" },
    sacred_geometry: { file: "sacred-geometry", exportName: "sacredGeometryFrag" },
    mandala_engine: { file: "mandala-engine", exportName: "mandalaEngineFrag" },
    kaleidoscope: { file: "kaleidoscope", exportName: "kaleidoscopeFrag" },
    star_nest: { file: "star-nest", exportName: "starNestFrag" },
    particle_nebula: { file: "particle-nebula", exportName: "particleNebulaFrag" },
    cosmic_dust: { file: "cosmic-dust", exportName: "cosmicDustFrag" },
    void_light: { file: "void-light", exportName: "voidLightFrag" },
    stained_glass: { file: "stained-glass", exportName: "stainedGlassFrag" },
    electric_arc: { file: "electric-arc", exportName: "electricArcFrag" },
    feedback_recursion: { file: "feedback-recursion", exportName: "feedbackRecursionFrag" },
    reaction_diffusion: { file: "reaction-diffusion", exportName: "reactionDiffusionFrag" },
    fractal_zoom: { file: "fractal-zoom", exportName: "fractalZoomFrag" },
    lava_flow: { file: "lava-flow", exportName: "lavaFlowFrag" },
    plasma_field: { file: "plasma-field", exportName: "plasmaFieldFrag" },
    digital_rain: { file: "digital-rain", exportName: "digitalRainFrag" },
    morphogenesis: { file: "morphogenesis", exportName: "morphogenesisFrag" },
    mycelium_network: { file: "mycelium-network", exportName: "myceliumNetworkFrag" },
  };

  for (const [shaderId, { file, exportName }] of Object.entries(shaderMap)) {
    try {
      const modulePath = join(VISUALIZER_ROOT, "src/shaders", `${file}.ts`);
      if (!existsSync(modulePath)) {
        console.warn(`Shader file not found: ${modulePath}`);
        continue;
      }
      const mod = await import(modulePath);
      if (mod[exportName]) {
        shaders[shaderId] = mod[exportName];
      } else {
        console.warn(`Export ${exportName} not found in ${file}.ts`);
      }
    } catch (e) {
      console.warn(`Failed to import shader ${shaderId}: ${e}`);
    }
  }

  return shaders;
}

// ─── Types ───

interface ShowConfig {
  showDir: string;
  fps: number;
  width: number;
  height: number;
}

interface FrameManifestEntry {
  shader_id: string;
  frame: number;
  secondary_shader_id: string | null;
  blend_progress: number | null;
  blend_mode: string | null;
  // All uniform values (80+ fields)
  [key: string]: number | string | null;
}

interface Manifest {
  shaders: Record<string, string>;
  frames: FrameManifestEntry[];
  width: number;
  height: number;
  fps: number;
  show_title: string;
}

// ─── Audio snapshot computation ───
// Simplified version of computeAudioSnapshot for manifest generation.
// In production, this should import from visualizer-poc/src/utils/audio-reactive.ts

function gaussianSmooth(
  frames: any[],
  idx: number,
  field: string,
  windowSize: number,
): number {
  const half = Math.floor(windowSize / 2);
  let sum = 0;
  let weightSum = 0;
  for (let i = -half; i <= half; i++) {
    const fi = Math.max(0, Math.min(frames.length - 1, idx + i));
    const w = Math.exp((-i * i) / (2 * (windowSize / 4) ** 2));
    const val = frames[fi]?.[field] ?? 0;
    sum += val * w;
    weightSum += w;
  }
  return weightSum > 0 ? sum / weightSum : 0;
}

function computeFrameUniforms(
  frames: any[],
  frameIdx: number,
  fps: number,
  tempo: number,
  width: number,
  height: number,
): Record<string, number> {
  const f = frames[frameIdx] ?? {};
  const time = frameIdx / fps;

  // Smoothed values
  const energy = gaussianSmooth(frames, frameIdx, "rms", 25);
  const slowEnergy = gaussianSmooth(frames, frameIdx, "rms", 90);
  const bass = gaussianSmooth(frames, frameIdx, "sub", 15) +
    gaussianSmooth(frames, frameIdx, "low", 15);
  const mids = gaussianSmooth(frames, frameIdx, "mid", 12);
  const highs = gaussianSmooth(frames, frameIdx, "high", 12);
  const centroid = gaussianSmooth(frames, frameIdx, "centroid", 15);

  // Beat tracking
  const beatConfidence = f.beatConfidence ?? 0;
  const beatStability = f.beatStability ?? 0;
  const musicalTime = f.musicalTime ?? ((time * tempo / 60) % 1);

  return {
    time,
    dynamic_time: time, // simplified — production should accumulate proportional to energy
    beat_time: time * (tempo / 120),
    musical_time: musicalTime,
    tempo,
    energy,
    rms: f.rms ?? 0,
    bass,
    mids,
    highs,
    onset: f.onset ?? 0,
    centroid,
    beat: f.beat ? 1 : 0,
    slow_energy: slowEnergy,
    fast_energy: gaussianSmooth(frames, frameIdx, "rms", 5),
    fast_bass: gaussianSmooth(frames, frameIdx, "sub", 5),
    spectral_flux: f.spectralFlux ?? 0,
    energy_accel: 0,
    energy_trend: 0,
    onset_snap: f.onset ?? 0,
    beat_snap: f.beat ? 1 : 0,
    beat_confidence: beatConfidence,
    beat_stability: beatStability,
    downbeat: f.downbeat ? 1 : 0,
    drum_onset: f.stemDrumOnset ?? 0,
    drum_beat: f.stemDrumBeat ?? 0,
    stem_bass: f.stemBassRms ?? 0,
    stem_drums: f.stemDrumOnset ?? 0,
    vocal_energy: f.stemVocalRms ?? 0,
    vocal_presence: f.stemVocalPresence ?? 0,
    other_energy: f.stemOtherRms ?? 0,
    other_centroid: f.stemOtherCentroid ?? 0,
    chroma_hue: computeChromaHue(f),
    chroma_shift: 0,
    chord_index: f.chordIndex ?? 0,
    harmonic_tension: f.harmonicTension ?? 0,
    melodic_pitch: f.melodicPitch ?? 0,
    melodic_direction: f.melodicDirection ?? 0,
    melodic_confidence: f.melodicConfidence ?? 0,
    chord_confidence: f.chordConfidence ?? 0,
    section_type: parseSectionType(f.sectionType),
    section_index: 0,
    section_progress: 0,
    climax_phase: 0,
    climax_intensity: 0,
    coherence: 0,
    jam_density: 0.5,
    jam_phase: 0,
    jam_progress: 0,
    energy_forecast: 0,
    peak_approaching: 0,
    tempo_derivative: f.tempoDerivative ?? 0,
    dynamic_range: f.dynamicRange ?? 0.5,
    space_score: f.spaceScore ?? 0,
    timbral_brightness: f.timbralBrightness ?? 0.5,
    timbral_flux: f.timbralFlux ?? 0,
    vocal_pitch: f.vocalPitch ?? 0,
    vocal_pitch_confidence: f.vocalPitchConfidence ?? 0,
    improvisation_score: f.improvisationScore ?? 0,
    semantic_psychedelic: f.semantic_psychedelic ?? 0,
    semantic_cosmic: f.semantic_cosmic ?? 0,
    semantic_aggressive: f.semantic_aggressive ?? 0,
    semantic_tender: f.semantic_tender ?? 0,
    semantic_rhythmic: f.semantic_rhythmic ?? 0,
    semantic_ambient: f.semantic_ambient ?? 0,
    semantic_chaotic: f.semantic_chaotic ?? 0,
    semantic_triumphant: f.semantic_triumphant ?? 0,
    palette_primary: 0.7,
    palette_secondary: 0.3,
    palette_saturation: 0.75,
    envelope_brightness: 0.55 + Math.sqrt(Math.min(1, energy / 0.35)) * 0.50,
    envelope_saturation: 1.0,
    envelope_hue: 0,
    era_saturation: 1.0,
    era_brightness: 1.0,
    era_sepia: 0,
    show_warmth: 0,
    show_contrast: 1.0,
    show_saturation: 1.0,
    show_grain: 1.0,
    show_bloom: 1.0,
    param_bass_scale: 1.0,
    param_energy_scale: 1.0,
    param_motion_speed: 1.0,
    param_color_sat_bias: 0,
    param_complexity: 1.0,
    param_drum_reactivity: 1.0,
    param_vocal_weight: 1.0,
    peak_of_show: 0,
  };
}

function computeChromaHue(frame: any): number {
  const chroma = frame.chroma;
  if (!chroma || !Array.isArray(chroma)) return 180;
  let maxIdx = 0;
  let maxVal = 0;
  for (let i = 0; i < 12; i++) {
    if ((chroma[i] ?? 0) > maxVal) {
      maxVal = chroma[i];
      maxIdx = i;
    }
  }
  return maxIdx * 30; // 0-360 hue from pitch class
}

function parseSectionType(st: string | undefined): number {
  switch (st) {
    case "intro": return 0;
    case "verse": return 1;
    case "chorus": return 2;
    case "bridge": return 3;
    case "solo": return 4;
    case "jam": return 5;
    case "outro": return 6;
    case "space": return 7;
    default: return 5; // default to jam
  }
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const showDirIdx = args.indexOf("--show-dir");
  const outputIdx = args.indexOf("--output");
  const fpsIdx = args.indexOf("--fps");
  const widthIdx = args.indexOf("--width");
  const heightIdx = args.indexOf("--height");

  const showDir = showDirIdx >= 0 ? args[showDirIdx + 1] : null;
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : "manifest.json";
  const fps = fpsIdx >= 0 ? parseInt(args[fpsIdx + 1]) : 60;
  const width = widthIdx >= 0 ? parseInt(args[widthIdx + 1]) : 3840;
  const height = heightIdx >= 0 ? parseInt(args[heightIdx + 1]) : 2160;

  if (!showDir) {
    console.error("Usage: npx tsx generate-manifest.ts --show-dir <path> [--output manifest.json] [--fps 60]");
    process.exit(1);
  }

  console.log(`Generating manifest for: ${showDir}`);
  console.log(`Output: ${outputPath} | ${width}x${height} @ ${fps}fps`);

  // Load show data
  const setlistPath = join(showDir, "setlist.json");
  if (!existsSync(setlistPath)) {
    console.error(`Setlist not found: ${setlistPath}`);
    process.exit(1);
  }
  const setlist = JSON.parse(readFileSync(setlistPath, "utf-8"));

  // Collect pre-composed GLSL strings
  console.log("Collecting shader GLSL...");
  const shaders = await collectShaderGLSL();
  console.log(`Collected ${Object.keys(shaders).length} shader GLSL strings`);

  // Build per-frame manifest
  const allFrames: FrameManifestEntry[] = [];
  const defaultShader = "fractal_temple"; // fallback

  for (const song of setlist.songs ?? []) {
    const analysisPath = join(showDir, "tracks", `${song.slug ?? song.title}_analysis.json`);
    if (!existsSync(analysisPath)) {
      console.warn(`Analysis not found for ${song.title}, skipping`);
      continue;
    }

    const analysis = JSON.parse(readFileSync(analysisPath, "utf-8"));
    const frames = analysis.frames ?? [];
    const tempo = analysis.meta?.tempo ?? 120;
    const totalFrames = Math.ceil((frames.length / 30) * fps); // upsample if fps > 30

    console.log(`  ${song.title}: ${frames.length} analysis frames → ${totalFrames} render frames`);

    // Simple shader assignment — in production, use full SceneRouter logic
    const shaderId = song.defaultMode ?? song.preferredModes?.[0] ?? defaultShader;

    for (let renderFrame = 0; renderFrame < totalFrames; renderFrame++) {
      // Map render frame to analysis frame (handles fps upsampling)
      const analysisFrame = Math.min(
        Math.floor(renderFrame * (30 / fps)),
        frames.length - 1,
      );

      const uniforms = computeFrameUniforms(frames, analysisFrame, fps, tempo, width, height);

      allFrames.push({
        shader_id: shaderId,
        frame: allFrames.length,
        secondary_shader_id: null,
        blend_progress: null,
        blend_mode: null,
        ...uniforms,
      });
    }
  }

  // Build manifest
  const manifest: Manifest = {
    shaders,
    frames: allFrames,
    width,
    height,
    fps,
    show_title: setlist.title ?? "Unknown Show",
  };

  // Write manifest
  console.log(`Writing manifest: ${allFrames.length} frames, ${Object.keys(shaders).length} shaders`);
  writeFileSync(outputPath, JSON.stringify(manifest));
  const sizeMB = (Buffer.byteLength(JSON.stringify(manifest)) / 1024 / 1024).toFixed(1);
  console.log(`Manifest written: ${outputPath} (${sizeMB} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
