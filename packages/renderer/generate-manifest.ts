#!/usr/bin/env npx tsx
/**
 * Manifest Generator — bridges the TypeScript brain to the Rust GPU renderer.
 *
 * Reads real show data (setlist + per-track audio analysis) and outputs
 * a JSON manifest for the Rust renderer.
 *
 * Usage:
 *   npx tsx generate-manifest.ts \
 *     --data-dir ../visualizer-poc/data \
 *     --output manifest.json \
 *     --fps 60 --width 3840 --height 2160
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, resolve } from "path";

const __dirname = new URL(".", import.meta.url).pathname;
const VISUALIZER_ROOT = resolve(__dirname, "../visualizer-poc");

// ─── Collect pre-composed GLSL strings ───

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
  const map: Record<string, number> = { intro: 0, verse: 1, chorus: 2, bridge: 3, solo: 4, jam: 5, outro: 6, space: 7 };
  return map[st ?? "jam"] ?? 5;
}

function computeUniforms(
  frames: any[], idx: number, fps: number, tempo: number,
  width: number, height: number, globalTime: number,
): Record<string, number> {
  const f = frames[idx] ?? {};
  const time = globalTime + idx / fps;
  const energy = gaussianSmooth(frames, idx, "rms", 25);
  const slowEnergy = gaussianSmooth(frames, idx, "rms", 90);
  const bass = gaussianSmooth(frames, idx, "sub", 15) + gaussianSmooth(frames, idx, "low", 15);

  const factor = Math.max(0, Math.min(1, (energy - 0.05) / 0.30));
  const envBrightness = 0.55 + Math.sqrt(factor) * 0.50;

  return {
    time, dynamic_time: time, beat_time: time * (tempo / 120),
    musical_time: (time * tempo / 60) % 1, tempo,
    energy, rms: f.rms ?? 0, bass,
    mids: gaussianSmooth(frames, idx, "mid", 12),
    highs: gaussianSmooth(frames, idx, "high", 12),
    onset: f.onset ?? 0, centroid: f.centroid ?? 0.5, beat: f.beat ? 1 : 0,
    slow_energy: slowEnergy,
    fast_energy: gaussianSmooth(frames, idx, "rms", 5),
    fast_bass: gaussianSmooth(frames, idx, "sub", 5),
    spectral_flux: 0, energy_accel: 0, energy_trend: 0,
    onset_snap: f.onset ?? 0, beat_snap: f.beat ? 1 : 0,
    beat_confidence: f.beatConfidence ?? 0.5, beat_stability: 0.5,
    downbeat: f.downbeat ? 1 : 0,
    drum_onset: f.stemDrumOnset ?? 0, drum_beat: f.stemDrumBeat ? 1 : 0,
    stem_bass: f.stemBassRms ?? bass, stem_drums: f.stemDrumOnset ?? 0,
    vocal_energy: f.stemVocalRms ?? 0, vocal_presence: f.stemVocalPresence ? 1 : 0,
    other_energy: f.stemOtherRms ?? 0, other_centroid: f.stemOtherCentroid ?? 0.5,
    chroma_hue: chromaHue(f), chroma_shift: 0,
    chord_index: f.chordIndex ?? 0, harmonic_tension: f.harmonicTension ?? 0,
    melodic_pitch: f.melodicPitch ?? 0.5, melodic_direction: f.melodicDirection ?? 0,
    melodic_confidence: f.melodicConfidence ?? 0, chord_confidence: f.chordConfidence ?? 0,
    section_type: sectionTypeFloat(f.sectionType),
    section_index: 0, section_progress: 0,
    climax_phase: 0, climax_intensity: 0, coherence: 0,
    jam_density: 0.5, jam_phase: 0, jam_progress: 0,
    energy_forecast: 0, peak_approaching: 0,
    tempo_derivative: f.tempoDerivative ?? 0, dynamic_range: f.dynamicRange ?? 0.5,
    space_score: f.spaceScore ?? 0, timbral_brightness: f.timbralBrightness ?? 0.5,
    timbral_flux: f.timbralFlux ?? 0, vocal_pitch: f.vocalPitch ?? 0,
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
    palette_primary: 0.08, palette_secondary: 0.55, palette_saturation: 0.85,
    envelope_brightness: envBrightness, envelope_saturation: 1.0 + energy * 0.2,
    envelope_hue: 0,
    era_saturation: 1.05, era_brightness: 1.0, era_sepia: 0.06,
    show_warmth: 0, show_contrast: 1.0, show_saturation: 1.0,
    show_grain: 1.0, show_bloom: 1.0,
    param_bass_scale: 1.0, param_energy_scale: 1.0, param_motion_speed: 1.0,
    param_color_sat_bias: 0, param_complexity: 1.0,
    param_drum_reactivity: 1.0, param_vocal_weight: 1.0,
    peak_of_show: 0,
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

  console.log(`Data: ${dataDir}`);

  const setlist = JSON.parse(readFileSync(join(dataDir, "setlist.json"), "utf-8"));
  const showTitle = `${setlist.venue ?? "?"} — ${setlist.date ?? ""}`;
  console.log(`Show: ${showTitle} (${setlist.songs?.length ?? 0} songs)`);

  console.log("Collecting GLSL...");
  const shaders = await collectShaderGLSL();
  console.log(`${Object.keys(shaders).length} shaders collected`);

  const allFrames: any[] = [];
  let globalTime = 0;

  for (const song of setlist.songs ?? []) {
    const path = join(dataDir, "tracks", `${song.trackId}-analysis.json`);
    if (!existsSync(path)) { console.warn(`  SKIP: ${song.title}`); continue; }

    const analysis = JSON.parse(readFileSync(path, "utf-8"));
    const frames = analysis.frames ?? [];
    const tempo = analysis.meta?.tempo ?? 120;
    const afps = analysis.meta?.fps ?? 30;
    const totalOut = Math.ceil((frames.length / afps) * fps);
    const shaderId = (song.defaultMode ?? "protean_clouds").replace(/-/g, "_");

    console.log(`  ${song.title}: ${frames.length}→${totalOut} frames (${shaderId})`);

    for (let i = 0; i < totalOut; i++) {
      const ai = Math.min(Math.floor(i * (afps / fps)), frames.length - 1);
      allFrames.push({
        shader_id: shaderId,
        frame: allFrames.length,
        secondary_shader_id: null, blend_progress: null, blend_mode: null,
        ...computeUniforms(frames, ai, fps, tempo, width, height, globalTime),
      });
    }
    globalTime += frames.length / afps;
  }

  // Stream JSON to avoid memory limits (678K frames = ~500MB+)
  console.log(`\nWriting: ${allFrames.length} frames, ${Object.keys(shaders).length} shaders`);
  const { createWriteStream } = await import("fs");
  const ws = createWriteStream(outputPath);

  ws.write('{"shaders":');
  ws.write(JSON.stringify(shaders));
  ws.write(`,"width":${width},"height":${height},"fps":${fps},"show_title":${JSON.stringify(showTitle)}`);
  ws.write(',"frames":[\n');

  for (let i = 0; i < allFrames.length; i++) {
    if (i > 0) ws.write(',\n');
    ws.write(JSON.stringify(allFrames[i]));
    if (i % 100000 === 0 && i > 0) process.stdout.write(`  ${(i / allFrames.length * 100).toFixed(0)}%\r`);
  }

  ws.write('\n]}');
  await new Promise<void>((resolve, reject) => {
    ws.end(() => resolve());
    ws.on("error", reject);
  });

  const { statSync } = await import("fs");
  const mb = (statSync(outputPath).size / 1048576).toFixed(1);
  console.log(`Done: ${outputPath} (${mb} MB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
