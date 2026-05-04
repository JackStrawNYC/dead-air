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
import { detectPeakOfShow, computeSongPeakScore } from "../visualizer-poc/src/utils/peak-of-show.js";
import { findNearestBeat } from "../visualizer-poc/src/scenes/routing/beat-sync.js";
import { dynamicCrossfadeDuration } from "../visualizer-poc/src/scenes/routing/crossfade-timing.js";
import { getModeForSection } from "../visualizer-poc/src/scenes/routing/shader-variety.js";
import { TRANSITION_AFFINITY, SCENE_REGISTRY } from "../visualizer-poc/src/scenes/scene-registry.js";
import { lookupSongIdentity, getOrGenerateSongIdentity, setActiveShowDate } from "../visualizer-poc/src/data/song-identities.js";
import { computeShowVisualSeed, type ShowVisualSeed } from "../visualizer-poc/src/utils/show-visual-seed.js";
import { hashString } from "@dead-air/audio-core/hash";

// ─── Overlay imports (for --with-overlays mode) ───
import { buildRotationSchedule, getOverlayOpacities } from "../visualizer-poc/src/data/overlay-rotation.js";
import { computeShowArcPhase, getShowArcModifiers } from "../visualizer-poc/src/data/show-arc.js";
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

// ─── Lyric karaoke ───
// Loads word-level alignment from packages/pipeline/data/lyrics-aligned/
// and emits per-frame SVG overlays so vocals get on-screen lyrics — the
// audit flagged this as MISSING ("infrastructure exists, never wired").
//
// File format (from packages/pipeline/scripts/align_lyrics.py):
//   { lines: [{ text, start, end, line_confidence, words: [...] }] }
//
// Time semantics: line.start/end are in AUDIO seconds within the song's
// raw audio file. Manifest gen trims dead air from the front, so the
// caller passes trimFrontSeconds — we subtract it to convert to OUTPUT
// time (the frame timeline the renderer sees).
interface AlignedLyricLine {
  text: string;
  start: number;
  end: number;
  line_confidence?: number;
}
function loadAlignedLyrics(songSlug: string, showDate: string): AlignedLyricLine[] | null {
  const path = `${__dirname}/../pipeline/data/lyrics-aligned/${songSlug}-${showDate}.json`;
  try {
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, "utf-8"));
    if (!Array.isArray(data?.lines)) return null;
    // Drop low-confidence lines — they're probably misaligned and would
    // flash random text at viewers. <0.50 is the alignment QA threshold.
    return data.lines
      .filter((l: any) => typeof l.text === "string"
        && typeof l.start === "number"
        && typeof l.end === "number"
        && (l.line_confidence ?? 1) >= 0.50)
      .map((l: any) => ({
        text: l.text.trim(),
        start: l.start,
        end: l.end,
        line_confidence: l.line_confidence,
      }));
  } catch {
    return null;
  }
}
/** Build a karaoke-style SVG for a lyric line. Bottom 18% of frame,
 *  italic Georgia with drop shadow for legibility over busy shaders. */
/**
 * Concert stage lighting SVG — three converging beams from above the frame.
 * Models real moving-head spotlights: bright fixture point at top, soft cone
 * fall-off, atmospheric scatter. Two outer beams use the song's primary +
 * secondary palette hues (so the lighting "matches" the song character),
 * one center beam stays neutral white-warm for contrast.
 *
 * Activation: only fires above an energy threshold (peaks/jams/climaxes).
 * Per-beat brightness modulation via the `beatBoost` parameter (0..1).
 *
 * Renders at low opacity (caller's `opacity`) and screen-blends, so it
 * lifts highlights into the frame the way real venue lights do — never
 * dominates the shader content underneath.
 */
function stageLightsSvg(
  width: number,
  height: number,
  primaryHue: number,    // 0..360
  secondaryHue: number,  // 0..360
  beatBoost: number,     // 0..1 — kick/onset brightness multiplier
  sweepPhase: number,    // 0..2π — slow horizontal sweep
  opacity: number,       // 0..1 — per-frame envelope opacity
): string {
  const w = width;
  const h = height;
  // Beam endpoints at floor level, sweeping slowly side-to-side.
  // Origin points are offscreen above the frame so beams enter from "above".
  const sway = Math.sin(sweepPhase) * (w * 0.08);
  const swayInv = Math.sin(sweepPhase + Math.PI) * (w * 0.06);
  // Beam fixture origins (just above top edge)
  const o1x = w * 0.20 + sway;
  const o2x = w * 0.50 + swayInv;
  const o3x = w * 0.80 - sway;
  const oy  = -h * 0.05;
  // Beam floor sweeps wider — converging downward
  const floorY = h * 1.05;
  const halfWidth1 = w * 0.18;
  const halfWidth2 = w * 0.14;
  // Beat boost adds 0..40% to fixture core brightness
  const coreA = (0.55 + beatBoost * 0.40) * opacity;
  const haloA = (0.20 + beatBoost * 0.20) * opacity;
  const tipA  = 0; // transparent at floor — pure cone fall-off
  // Color helpers: HSL strings
  const warm = `hsl(${primaryHue.toFixed(0)},85%,62%)`;
  const cool = `hsl(${secondaryHue.toFixed(0)},80%,60%)`;
  const neutral = `hsl(40,60%,86%)`; // warm-white for center beam
  // Build beam polygon: tight diamond at fixture, wide trapezoid at floor
  const beam = (cx: number, hw: number, color: string, alpha: number, gradId: string) =>
    `<polygon points="${(cx - hw * 0.04).toFixed(1)},${oy.toFixed(1)} ${(cx + hw * 0.04).toFixed(1)},${oy.toFixed(1)} ${(cx + hw).toFixed(1)},${floorY.toFixed(1)} ${(cx - hw).toFixed(1)},${floorY.toFixed(1)}" fill="url(#${gradId})" opacity="${alpha.toFixed(3)}"/>`;
  // Linear gradient: bright source at top → transparent at bottom
  const grad = (id: string, color: string) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="${color}" stop-opacity="${coreA.toFixed(3)}"/>`
    + `<stop offset="0.35" stop-color="${color}" stop-opacity="${(coreA * 0.45).toFixed(3)}"/>`
    + `<stop offset="1" stop-color="${color}" stop-opacity="${tipA.toFixed(3)}"/>`
    + `</linearGradient>`;
  // Fixture rim halo: bright dot at top of each beam
  const halo = (cx: number, color: string) =>
    `<ellipse cx="${cx.toFixed(1)}" cy="${(oy + h * 0.02).toFixed(1)}" rx="${(w * 0.012).toFixed(1)}" ry="${(h * 0.008).toFixed(1)}" fill="${color}" opacity="${haloA.toFixed(3)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
    + `<defs>`
    + grad("g1", warm)
    + grad("g2", neutral)
    + grad("g3", cool)
    + `</defs>`
    + beam(o1x, halfWidth1, warm, 1.0, "g1")
    + beam(o2x, halfWidth2, neutral, 1.0, "g2")
    + beam(o3x, halfWidth1, cool, 1.0, "g3")
    + halo(o1x, warm)
    + halo(o2x, neutral)
    + halo(o3x, cool)
    + `</svg>`;
}

/**
 * Canonical Grateful Dead segues — songs known to flow directly into
 * each other with no clean break. At these boundaries the chapter card
 * is suppressed and the inter-song crossfade is extended so the moment
 * reads as one sacred sequence rather than two adjacent songs.
 *
 * Detection is loose: we lower-case + strip punctuation on both sides
 * before comparing, so "China Cat Sunflower" and "china cat sunflower"
 * both match. setlist.songs[i].segueInto === true on the *first* song
 * of a segue pair also forces the boundary to be a segue, regardless
 * of whether the pair is in this list.
 */
const KNOWN_SEGUES: Array<[string, string]> = [
  // The sacred suites
  ["china cat sunflower", "i know you rider"],
  ["help on the way", "slipknot"],
  ["slipknot", "franklin's tower"],
  ["scarlet begonias", "fire on the mountain"],
  ["estimated prophet", "eyes of the world"],
  ["lost sailor", "saint of circumstance"],
  ["playing in the band", "drums"],
  ["drums", "space"],
  ["space", "the other one"],
  ["space", "wharf rat"],
  ["space", "stella blue"],
  ["the other one", "wharf rat"],
  ["the other one", "stella blue"],
  ["weather report suite", "let it grow"],
  ["truckin'", "the other one"],
  ["uncle john's band", "playing in the band"],
  // Common late-show transitions
  ["sugar magnolia", "sunshine daydream"],
  ["he's gone", "truckin'"],
  ["dark star", "the other one"],
  ["dark star", "sugar magnolia"],
  ["dark star", "el paso"],
];
function normalizeSongTitle(title: string): string {
  return (title ?? "").toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function isKnownSegue(fromTitle: string, toTitle: string): boolean {
  const a = normalizeSongTitle(fromTitle);
  const b = normalizeSongTitle(toTitle);
  return KNOWN_SEGUES.some(([x, y]) => x === a && y === b);
}

/**
 * Venue type inference from venue name + (optional) explicit setlist
 * field. The ambient overlay below is driven by this — outdoor field
 * shows get sun-haze + tree silhouette, theaters get red velvet rim,
 * arenas get overhead rim light, stadiums get open vastness.
 */
type VenueType = "outdoor-day" | "outdoor-night" | "theater" | "arena" | "stadium";
function inferVenueType(venue: string, explicitType?: string | null): VenueType | null {
  if (explicitType) {
    const t = explicitType.toLowerCase();
    if (["outdoor-day", "outdoor-night", "theater", "arena", "stadium"].includes(t)) {
      return t as VenueType;
    }
  }
  const v = (venue ?? "").toLowerCase();
  if (!v) return null;
  // Outdoor / festival / field
  if (/\b(festival|field|park|meadow|grounds|fairground|raceway|speedway|amphithea|amphitheatre|bowl|pavilion|farm|mountain)\b/.test(v)) {
    return "outdoor-day";
  }
  // Theater (older, smaller, indoor with curtains)
  if (/\b(theatre|theater|opera|hall|ballroom|fillmore|capitol|warfield|orpheum|paramount|palace|civic)\b/.test(v)) {
    return "theater";
  }
  // Stadium (huge open, often outdoor)
  if (/\b(stadium|coliseum|colosseum|jfk|bowl)\b/.test(v)) {
    return "stadium";
  }
  // Arena (indoor, larger than theater)
  if (/\b(arena|garden|center|spectrum|forum|frostburg|civic)\b/.test(v)) {
    return "arena";
  }
  return null;
}

/**
 * Outdoor-day venue ambience — warm sun haze at top + transparent middle
 * + dark tree-silhouette band at the very bottom. Made for Veneta-style
 * outdoor field shows. Slowly drifting dust motes in the middle band give
 * it life without being busy.
 */
function venueOutdoorDaySvg(width: number, height: number, timeSec: number, opacity: number): string {
  const w = width;
  const h = height;
  const op = Math.max(0, Math.min(1, opacity));
  const sunHazeA  = (0.28 * op).toFixed(3);
  const sunCoreA  = (0.18 * op).toFixed(3);
  // Sun position drifts slowly over the show (paired with time-of-day arc)
  const sunX = w * (0.50 + Math.sin(timeSec * 0.0008) * 0.35);
  const sunY = h * 0.12;
  const sunR = h * 0.45;

  // Deterministic seeded RNG for tree-line irregularity. Same seed across
  // frames so the tree line stays anchored — only individual leaf-shimmer
  // motion is time-driven, not the whole silhouette dancing around.
  const rand = (s: number) => {
    let z = (s * 9301 + 49297) % 233280;
    return z / 233280;
  };

  // Build a fractal-noise tree-line path. Three octaves of value-noise
  // sampled at increasing frequency, then a few discrete tall spires
  // for individual trees breaking the line. NOT a sine wave — real
  // treelines are irregular and that's the entire point of this.
  const buildTreeLine = (
    baseY: number,
    bandAmp: number,
    segs: number,
    seedOffset: number,
    spireCount: number,
    spireMaxH: number,
  ): string => {
    // Sample value-noise with linear-interp between integer-spaced anchors.
    const sampleNoise = (octave: number, t: number): number => {
      const freq = Math.pow(2, octave);
      const idx = t * freq;
      const i0 = Math.floor(idx);
      const f = idx - i0;
      const a = rand(i0 * 73 + seedOffset + octave * 401) - 0.5;
      const b = rand((i0 + 1) * 73 + seedOffset + octave * 401) - 0.5;
      const fade = f * f * (3 - 2 * f); // smoothstep
      return a + (b - a) * fade;
    };

    // Pre-pick spire positions + heights deterministically so individual
    // tree spires break above the noise band.
    const spires: Array<{ x: number; height: number; w: number }> = [];
    for (let s = 0; s < spireCount; s++) {
      const sx = rand(s * 137 + seedOffset + 9001) * w;
      const sh = (0.4 + rand(s * 211 + seedOffset + 17) * 0.6) * spireMaxH;
      const sw = w * (0.012 + rand(s * 53 + seedOffset + 31) * 0.020);
      spires.push({ x: sx, height: sh, w: sw });
    }

    let path = `M0,${h.toFixed(0)} L0,${baseY.toFixed(1)}`;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const x = t * w;
      // 3-octave FBM-ish value noise
      const n = sampleNoise(1, t) * 0.5
              + sampleNoise(2, t) * 0.30
              + sampleNoise(3, t) * 0.18;
      let dy = n * bandAmp * 2; // -bandAmp..+bandAmp roughly
      // Spire injection: when x is near a spire, lift the line UP (negative y)
      for (const sp of spires) {
        const dist = Math.abs(x - sp.x);
        if (dist < sp.w) {
          // Triangular bump — peaks at spire center
          const lift = (1 - dist / sp.w) * sp.height;
          dy -= lift;
        }
      }
      const y = baseY + dy;
      path += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    path += ` L${w.toFixed(0)},${h.toFixed(0)} Z`;
    return path;
  };

  // Three receding tree-line bands: distant (very dim), middle, foreground.
  // Each at its own seed offset so the noise patterns don't repeat.
  const treeFarPath = buildTreeLine(
    h * 0.885,  // baseline (highest = furthest back)
    h * 0.008,  // small noise amplitude
    34, 100,    // segs, seed
    8, h * 0.025, // 8 modest spires
  );
  const treeMidPath = buildTreeLine(
    h * 0.910,
    h * 0.014,
    44, 200,
    10, h * 0.040,
  );
  const treeNearPath = buildTreeLine(
    h * 0.935,
    h * 0.022,
    60, 300,
    14, h * 0.055,
  );
  const treeFarA  = (0.22 * op).toFixed(3);
  const treeMidA  = (0.42 * op).toFixed(3);
  const treeNearA = (0.62 * op).toFixed(3);

  // Dust motes — 18 positions across two depth layers (near + far)
  let motes = "";
  for (let n = 0; n < 18; n++) {
    const baseX = rand(n * 31 + 7) * w;
    const baseY = h * (0.28 + rand(n * 53 + 11) * 0.42);
    const farMote = n >= 12; // 6 far motes — smaller + dimmer
    const driftX = baseX + Math.sin(timeSec * 0.04 + n * 1.3) * (w * 0.04);
    const driftY = baseY + Math.cos(timeSec * 0.03 + n * 0.9) * (h * 0.02);
    const r = h * (farMote ? 0.0006 : 0.0014 + rand(n * 17 + 3) * 0.0018);
    const baseA = farMote ? 0.18 : 0.32 + rand(n * 23 + 19) * 0.30;
    const a = (op * baseA).toFixed(3);
    motes += `<circle cx="${driftX.toFixed(1)}" cy="${driftY.toFixed(1)}" r="${r.toFixed(2)}" fill="rgba(255,235,180,${a})"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
    + `<defs>`
    + `<radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">`
    + `<stop offset="0" stop-color="#fff5d6" stop-opacity="${sunCoreA}"/>`
    + `<stop offset="0.4" stop-color="#ffd58a" stop-opacity="${sunHazeA}"/>`
    + `<stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/>`
    + `</radialGradient>`
    + `</defs>`
    + `<circle cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="${sunR.toFixed(1)}" fill="url(#sun)"/>`
    + motes
    + `<path d="${treeFarPath}" fill="rgba(35,42,30,${treeFarA})"/>`
    + `<path d="${treeMidPath}" fill="rgba(20,28,18,${treeMidA})"/>`
    + `<path d="${treeNearPath}" fill="rgba(8,14,10,${treeNearA})"/>`
    + `</svg>`;
}

/**
 * Outdoor-night venue ambience — deep cool sky wash with a sparse
 * starfield and a faint horizon glow. Simpler than the day variant.
 */
function venueOutdoorNightSvg(width: number, height: number, timeSec: number, opacity: number): string {
  const w = width, h = height;
  const op = Math.max(0, Math.min(1, opacity));
  const horizonA = (0.20 * op).toFixed(3);
  const rand = (s: number) => { let z = (s * 9301 + 49297) % 233280; return z / 233280; };
  let stars = "";
  for (let n = 0; n < 36; n++) {
    const x = rand(n * 41 + 13) * w;
    const y = h * (0.05 + rand(n * 71 + 5) * 0.55);
    const baseA = 0.4 + rand(n * 19 + 23) * 0.5;
    const twinkle = 0.65 + 0.35 * Math.sin(timeSec * (1 + rand(n * 7 + 1) * 2) + rand(n * 11 + 17) * 6.28);
    const a = (op * baseA * twinkle).toFixed(3);
    const r = h * (0.0010 + rand(n * 13 + 29) * 0.0015);
    stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="rgba(220,230,255,${a})"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
    + `<defs><linearGradient id="horiz" x1="0" y1="1" x2="0" y2="0">`
    + `<stop offset="0" stop-color="#0a1530" stop-opacity="${horizonA}"/>`
    + `<stop offset="0.3" stop-color="#0a1530" stop-opacity="0"/>`
    + `</linearGradient></defs>`
    + `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#horiz)"/>`
    + stars
    + `</svg>`;
}

/**
 * Theater venue ambience — warm red proscenium rim light at top + sides,
 * suggesting the curtain frame of a vintage theater (Fillmore, Capitol,
 * Warfield).
 */
function venueTheaterSvg(width: number, height: number, opacity: number): string {
  const w = width, h = height;
  const op = Math.max(0, Math.min(1, opacity));
  const rimA = (0.35 * op).toFixed(3);
  const sideA = (0.20 * op).toFixed(3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
    + `<defs>`
    + `<linearGradient id="prosTop" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="#7a1018" stop-opacity="${rimA}"/>`
    + `<stop offset="0.18" stop-color="#7a1018" stop-opacity="0"/>`
    + `</linearGradient>`
    + `<linearGradient id="prosLeft" x1="0" y1="0" x2="1" y2="0">`
    + `<stop offset="0" stop-color="#5c0c14" stop-opacity="${sideA}"/>`
    + `<stop offset="0.10" stop-color="#5c0c14" stop-opacity="0"/>`
    + `</linearGradient>`
    + `<linearGradient id="prosRight" x1="1" y1="0" x2="0" y2="0">`
    + `<stop offset="0" stop-color="#5c0c14" stop-opacity="${sideA}"/>`
    + `<stop offset="0.10" stop-color="#5c0c14" stop-opacity="0"/>`
    + `</linearGradient>`
    + `</defs>`
    + `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#prosTop)"/>`
    + `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#prosLeft)"/>`
    + `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#prosRight)"/>`
    + `</svg>`;
}

/**
 * Arena venue ambience — overhead rim of warm lights at the top edge,
 * suggesting the ring of stadium-rigging spots high above the floor.
 */
function venueArenaSvg(width: number, height: number, opacity: number): string {
  const w = width, h = height;
  const op = Math.max(0, Math.min(1, opacity));
  const rimA = (0.30 * op).toFixed(3);
  const dotA = (0.55 * op).toFixed(3);
  let dots = "";
  for (let n = 0; n < 22; n++) {
    const x = (n + 0.5) * (w / 22);
    const y = h * 0.025;
    const r = h * 0.005;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="rgba(255,220,160,${dotA})"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
    + `<defs><linearGradient id="rimTop" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="#ffe8b8" stop-opacity="${rimA}"/>`
    + `<stop offset="0.10" stop-color="#ffe8b8" stop-opacity="0"/>`
    + `</linearGradient></defs>`
    + `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#rimTop)"/>`
    + dots
    + `</svg>`;
}

/**
 * Stadium venue ambience — open vast cool wash, faint horizon line at
 * mid-frame, no rim lights (you're outdoors and far from the rigging).
 */
function venueStadiumSvg(width: number, height: number, opacity: number): string {
  const w = width, h = height;
  const op = Math.max(0, Math.min(1, opacity));
  const skyA = (0.18 * op).toFixed(3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
    + `<defs><linearGradient id="skyVast" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="#3060a0" stop-opacity="${skyA}"/>`
    + `<stop offset="0.45" stop-color="#3060a0" stop-opacity="0"/>`
    + `</linearGradient></defs>`
    + `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#skyVast)"/>`
    + `</svg>`;
}

function venueAmbienceSvg(type: VenueType, width: number, height: number, timeSec: number, opacity: number): string {
  switch (type) {
    case "outdoor-day":   return venueOutdoorDaySvg(width, height, timeSec, opacity);
    case "outdoor-night": return venueOutdoorNightSvg(width, height, timeSec, opacity);
    case "theater":       return venueTheaterSvg(width, height, opacity);
    case "arena":         return venueArenaSvg(width, height, opacity);
    case "stadium":       return venueStadiumSvg(width, height, opacity);
  }
}

/**
 * Per-song lead-vocalist lookup. Keyed by lower-cased song title.
 * Veneta '72 (Pigpen's penultimate year) is mostly Jerry/Bob; Pigpen
 * was on tour but didn't lead vocal duties at this show.
 *
 * For songs not in the table, the visualizer skips the vocal-lead
 * glyph entirely — better to show nothing than to mis-attribute.
 */
type Vocalist = "jerry" | "bob" | "pigpen" | "brent" | "donna" | "phil";
const VOCALIST_BY_SONG: Record<string, Vocalist> = {
  // Jerry-led
  "sugaree": "jerry", "deal": "jerry", "bertha": "jerry",
  "casey jones": "jerry", "bird song": "jerry",
  "sing me back home": "jerry", "china cat sunflower": "jerry",
  "i know you rider": "jerry", "dark star": "jerry",
  "stella blue": "jerry", "ripple": "jerry",
  "scarlet begonias": "jerry", "fire on the mountain": "jerry",
  "eyes of the world": "jerry", "althea": "jerry",
  "shakedown street": "jerry", "touch of grey": "jerry",
  "he's gone": "jerry", "wharf rat": "jerry",
  "tennessee jed": "jerry", "loser": "jerry",
  "candyman": "jerry", "uncle john's band": "jerry",
  "friend of the devil": "jerry", "row jimmy": "jerry",
  "row jimmy row": "jerry", "brokedown palace": "jerry",
  "morning dew": "jerry", "us blues": "jerry",
  "u.s. blues": "jerry", "franklin's tower": "jerry",
  "help on the way": "jerry", "slipknot": "jerry",
  "the wheel": "jerry", "wheel": "jerry",
  // Bob-led
  "the promised land": "bob", "promised land": "bob",
  "me and my uncle": "bob", "mexicali blues": "bob",
  "black-throated wind": "bob", "black throated wind": "bob",
  "jack straw": "bob", "greatest story ever told": "bob",
  "el paso": "bob", "one more saturday night": "bob",
  "playing in the band": "bob", "playin' in the band": "bob",
  "estimated prophet": "bob", "lost sailor": "bob",
  "saint of circumstance": "bob", "looks like rain": "bob",
  "throwing stones": "bob", "sugar magnolia": "bob",
  "weather report suite": "bob", "let it grow": "bob",
  "samson and delilah": "bob", "i need a miracle": "bob",
  "minglewood blues": "bob", "new minglewood blues": "bob",
  "mama tried": "bob", "cassidy": "bob",
  // Pigpen-led
  "good lovin'": "pigpen", "good lovin": "pigpen",
  "lovelight": "pigpen", "turn on your lovelight": "pigpen",
  "big boss man": "pigpen", "mr. charlie": "pigpen",
  "mr charlie": "pigpen", "caution": "pigpen",
  "smokestack lightning": "pigpen", "hard to handle": "pigpen",
  "next time you see me": "pigpen", "katie mae": "pigpen",
  "easy wind": "pigpen", "operator": "pigpen",
  // Phil
  "box of rain": "phil", "unbroken chain": "phil",
  // Brent
  "i will take you home": "brent", "far from me": "brent",
  "hey pocky way": "brent", "tons of steel": "brent",
  "just a little light": "brent", "blow away": "brent",
  // Donna (mid-70s)
  "playing in the band/donna": "donna", "from the heart of me": "donna",
};
function lookupVocalist(title: string): Vocalist | null {
  const k = (title ?? "").toLowerCase().trim();
  return VOCALIST_BY_SONG[k] ?? null;
}
const VOCALIST_COLOR: Record<Vocalist, { rgb: string; initials: string; full: string }> = {
  jerry:  { rgb: "210,150,40",  initials: "JG", full: "JERRY"  }, // warm gold
  bob:    { rgb: "120,170,210", initials: "BW", full: "BOB"    }, // sky blue
  pigpen: { rgb: "200,60,40",   initials: "PP", full: "PIGPEN" }, // blood orange
  brent:  { rgb: "180,120,200", initials: "BM", full: "BRENT"  }, // violet
  donna:  { rgb: "230,140,170", initials: "DG", full: "DONNA"  }, // rose
  phil:   { rgb: "150,150,170", initials: "PL", full: "PHIL"   }, // silver
};

/**
 * Per-vocalist instrument-silhouette SVG path data (drawn in a 100x40
 * viewBox unit space; the glyph renderer scales to actual pixels).
 * Each is hand-crafted: a Strat-shape for Jerry, double-horn SG for Bob,
 * long-bodied bass for Phil, harmonica + mic for Pigpen, Hammond keys
 * for Brent, vocal mic for Donna. Picked to be the most visually
 * recognizable item associated with each member.
 */
const VOCALIST_INSTRUMENT_SVG: Record<Vocalist, string> = {
  // Jerry — stylized solid-body guitar (Tiger/Wolf vibe), body left, neck right
  jerry:
    "M14,20 C14,11 21,7 30,7 C40,7 47,10 50,14 L74,14 L78,12 L86,12 L88,14 L88,18 "
    + "L86,20 L88,22 L88,26 L86,28 L78,28 L74,26 L50,26 C47,30 40,33 30,33 C21,33 14,29 14,20 Z "
    + "M68,18 L72,18 L72,22 L68,22 Z",
  // Bob — double-cutaway SG-style horns
  bob:
    "M10,20 L20,8 L30,14 L42,12 C50,12 55,16 55,20 C55,24 50,28 42,28 L30,26 L20,32 Z "
    + "M55,17 L82,15 L86,17 L88,20 L86,23 L82,25 L55,23 Z "
    + "M82,18 L86,18 L86,22 L82,22 Z",
  // Pigpen — harmonica (rectangle with row of mouth holes)
  pigpen:
    "M10,14 L72,14 L75,16 L75,24 L72,26 L10,26 L7,24 L7,16 Z "
    + "M14,17 L18,17 L18,19 L14,19 Z M21,17 L25,17 L25,19 L21,19 Z "
    + "M28,17 L32,17 L32,19 L28,19 Z M35,17 L39,17 L39,19 L35,19 Z "
    + "M42,17 L46,17 L46,19 L42,19 Z M49,17 L53,17 L53,19 L49,19 Z "
    + "M56,17 L60,17 L60,19 L56,19 Z M63,17 L67,17 L67,19 L63,19 Z",
  // Phil — long-bodied bass with extended scale + signature lower horn
  phil:
    "M8,20 C8,11 14,7 22,7 C32,7 38,10 42,14 L58,14 L62,12 L78,12 L82,14 L86,14 L88,16 L88,20 "
    + "L86,22 L82,22 L82,26 L78,28 L62,28 L58,26 L42,26 C38,30 32,33 22,33 C14,33 8,29 8,20 Z "
    + "M70,18 L74,18 L74,22 L70,22 Z M76,18 L80,18 L80,22 L76,22 Z",
  // Brent — Hammond organ side view: keyboard with drawbars above
  brent:
    "M6,16 L94,16 L94,18 L6,18 Z "
    + "M6,18 L94,18 L94,28 L6,28 Z "
    + "M14,18 L14,28 M22,18 L22,28 M30,18 L30,28 M38,18 L38,28 M46,18 L46,28 "
    + "M54,18 L54,28 M62,18 L62,28 M70,18 L70,28 M78,18 L78,28 M86,18 L86,28 "
    + "M14,12 L17,12 L17,16 L14,16 Z M22,11 L25,11 L25,16 L22,16 Z "
    + "M30,13 L33,13 L33,16 L30,16 Z M38,10 L41,10 L41,16 L38,16 Z "
    + "M46,12 L49,12 L49,16 L46,16 Z M54,11 L57,11 L57,16 L54,16 Z "
    + "M62,13 L65,13 L65,16 L62,16 Z M70,10 L73,10 L73,16 L70,16 Z "
    + "M78,12 L81,12 L81,16 L78,16 Z",
  // Donna — vocal microphone in profile (capsule head + grille + barrel)
  donna:
    "M22,8 C30,8 36,12 36,20 C36,28 30,32 22,32 C14,32 8,28 8,20 C8,12 14,8 22,8 Z "
    + "M14,14 L30,14 M14,18 L30,18 M14,22 L30,22 M14,26 L30,26 "
    + "M36,18 L40,18 L40,22 L36,22 Z "
    + "M40,19 L62,19 L62,21 L40,21 Z "
    + "M62,16 L66,16 L66,24 L62,24 Z "
    + "M66,18 L88,21 L66,22 Z",
};

/**
 * Vocal-lead glyph — instrument silhouette + vocalist name in their
 * signature color, top-left corner. Each instrument is hand-drawn as
 * SVG path data and recognizable: Jerry's solid-body guitar, Bob's
 * double-horn SG, Phil's long bass, Pigpen's harmonica, Brent's
 * Hammond organ, Donna's vocal mic.
 *
 * No initials — initials read as a chat-status badge. The instrument
 * silhouette is the ID; a deadhead recognizes "guitar = Jerry"
 * within seconds.
 *
 * Pulses with vocal RMS (instrument breathes brighter on louder
 * phrases). Caller gates render on stem-vocal-rms threshold so this
 * only appears when the vocalist is actively singing.
 */
function vocalistGlyphSvg(
  width: number,
  height: number,
  vocalist: Vocalist,
  pulse: number,    // 0..1 — vocal-rms-driven
  opacity: number,  // 0..1 envelope
): string {
  const w = width;
  const h = height;
  const v = VOCALIST_COLOR[vocalist];
  const path = VOCALIST_INSTRUMENT_SVG[vocalist];
  // Glyph dimensions: instrument is ~5% of frame width, name beneath.
  const margin = w * 0.018;
  const iconW = w * 0.052;
  const iconH = iconW * 0.4;     // viewBox is 100x40
  const iconX = margin;
  const iconY = margin + h * 0.018;
  const nameSize = Math.round(h * 0.013);
  const op = opacity * (0.6 + pulse * 0.4);
  const fillA = op.toFixed(3);
  const nameA = (op * 0.7).toFixed(3);
  const fill = `rgba(${v.rgb},${fillA})`;
  // Tiny pulse dot to the right of the instrument — beats with vocal energy
  const dotR = h * 0.0035;
  const dotCx = iconX + iconW + dotR * 2;
  const dotCy = iconY + iconH * 0.5;
  const dotA = (op * (0.4 + pulse * 0.6)).toFixed(3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
    + `<g transform="translate(${iconX.toFixed(1)} ${iconY.toFixed(1)}) scale(${(iconW / 100).toFixed(4)} ${(iconH / 40).toFixed(4)})">`
    + `<path d="${path}" fill="${fill}"/>`
    + `</g>`
    + `<circle cx="${dotCx.toFixed(1)}" cy="${dotCy.toFixed(1)}" r="${dotR.toFixed(1)}" fill="rgba(${v.rgb},${dotA})"/>`
    + `<text x="${iconX.toFixed(1)}" y="${(iconY + iconH + nameSize * 1.5).toFixed(1)}" `
    + `font-family="Georgia,serif" font-style="italic" font-weight="400" `
    + `font-size="${nameSize}" letter-spacing="2" fill="rgba(${v.rgb},${nameA})">${v.full}</text>`
    + `</svg>`;
}

/**
 * Subtle full-frame color cast keyed to the lead vocalist's hue. So
 * even peripherally, the screen warms toward gold during Jerry songs
 * and cools toward blue during Bob songs — a deadhead "feels" who's
 * singing without consciously checking the corner glyph.
 *
 * Very low alpha (0.04-0.07) and screen-blended so it lifts highlights
 * gently rather than tinting shadows. Off during peaks (let the music
 * breathe at climaxes) and during drums-space (no vocalist context).
 */
function vocalistColorCastSvg(
  width: number,
  height: number,
  vocalist: Vocalist,
  opacity: number,
): string {
  const w = width, h = height;
  const v = VOCALIST_COLOR[vocalist];
  const a = opacity.toFixed(3);
  // Vignette-style: stronger at center top/bottom, weaker at edges
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
    + `<defs><radialGradient id="vc" cx="0.5" cy="0.5" r="0.75">`
    + `<stop offset="0" stop-color="rgb(${v.rgb})" stop-opacity="${a}"/>`
    + `<stop offset="1" stop-color="rgb(${v.rgb})" stop-opacity="0"/>`
    + `</radialGradient></defs>`
    + `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#vc)"/>`
    + `</svg>`;
}

/**
 * Drums-or-Space ritual marker — single large word ("DRUMS" or "SPACE")
 * rendered low and very dim at the bottom edge. Names the sacred segment
 * without competing with the shader. Bottom-center, wide letter spacing,
 * Helvetica thin, ~10% opacity. Pulses subtly with bass/onset.
 */
function ritualMarkerSvg(
  width: number,
  height: number,
  label: string,    // "DRUMS" or "SPACE"
  pulse: number,    // 0..1 — bass-driven brightness modulation
  opacity: number,  // 0..1 envelope
): string {
  const w = width;
  const h = height;
  const fontSize = Math.round(h * 0.075);
  const y = Math.round(h * 0.92);
  const op = (opacity * (0.55 + pulse * 0.45)).toFixed(3);
  // Color: cool slate for both — distinct from warm encore lights / song titles
  const color = `rgba(180,200,220,${op})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
    + `<text x="${w / 2}" y="${y}" text-anchor="middle" `
    + `font-family="Helvetica Neue, Arial, sans-serif" font-weight="200" `
    + `font-size="${fontSize}" letter-spacing="${Math.round(fontSize * 0.4)}" `
    + `fill="${color}">${label}</text></svg>`;
}

/**
 * Encore lighter-flames ambient — small warm-amber dots scattered in the
 * lower portion of the frame, subtly flickering. Evokes the audience
 * lighting lighters/phones during the last song of the night. Active
 * only during the encore so it doesn't become wallpaper.
 *
 * Deterministic positions seeded by a fixed value so dots stay anchored
 * across frames (don't dance around — only flicker in opacity).
 */
function lighterFlamesSvg(
  width: number,
  height: number,
  timeSec: number,
  envelope: number, // 0..1 — encore fade-in/out gate
): string {
  const w = width;
  const h = height;
  const rDot = w * 0.0035;       // ~3px @ 1080p, ~7px @ 4K
  const rGlow = rDot * 3;
  const dotCount = 44;
  // Mulberry32-style deterministic PRNG seeded by index
  const rand = (seed: number) => {
    let s = seed >>> 0;
    s = (s + 0x6D2B79F5) >>> 0;
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
  let dots = "";
  for (let n = 0; n < dotCount; n++) {
    const x = rand(n * 7919 + 1) * w * 0.92 + w * 0.04;     // 4-96% width
    const y = h * (0.62 + rand(n * 3517 + 5) * 0.32);        // 62-94% height
    const baseOp = 0.45 + rand(n * 1361 + 9) * 0.45;         // 0.45-0.90 base
    const phase = rand(n * 9173 + 13) * Math.PI * 2;
    const flicker = 0.7 + 0.3 * Math.sin(timeSec * (3 + rand(n * 257 + 17) * 2) + phase);
    const op = (baseOp * flicker * envelope).toFixed(3);
    if (parseFloat(op) < 0.04) continue;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rGlow.toFixed(1)}" fill="url(#lf)" opacity="${op}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
    + `<defs><radialGradient id="lf" cx="0.5" cy="0.5" r="0.5">`
    + `<stop offset="0" stop-color="#ffd28a" stop-opacity="0.95"/>`
    + `<stop offset="0.35" stop-color="#ff9a3c" stop-opacity="0.55"/>`
    + `<stop offset="1" stop-color="#ff7a14" stop-opacity="0"/>`
    + `</radialGradient></defs>${dots}</svg>`;
}

/**
 * Persistent show-context HUD — top-right corner block. Grounds the
 * abstract visuals in the show's actual identity: where, when, and
 * how far through. Rendered every frame so a viewer joining mid-show
 * is never confused about what they're watching.
 *
 * Compact: ~22% width × ~7% height. Semi-transparent dark backplate
 * for legibility over any shader. Two lines of small-caps Georgia.
 */
function showContextHudSvg(
  width: number,
  height: number,
  venueShort: string,    // e.g. "VENETA, OR"
  dateShort: string,     // e.g. "8/27/72"
  setLabel: string,      // e.g. "SET 2" or "ENCORE"
  songInSet: string,     // e.g. "4/6"
  elapsedClock: string,  // e.g. "1:23"
  totalClock: string,    // e.g. "3:03"
  opacity: number,       // 0..1 envelope (lets us fade out during peak-of-show)
): string {
  const w = width;
  const h = height;
  const boxW = w * 0.24;
  const boxH = h * 0.075;
  const margin = w * 0.018;
  const x = w - boxW - margin;
  const y = margin;
  const rx = h * 0.008;
  const padX = boxW * 0.07;
  const fontL1 = Math.round(h * 0.022);
  const fontL2 = Math.round(h * 0.016);
  const bgA = (0.55 * opacity).toFixed(3);
  const txtA = opacity.toFixed(3);
  const dimA = (0.78 * opacity).toFixed(3);
  // Thin top accent bar — concert-poster touch
  const accentA = (0.85 * opacity).toFixed(3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
    + `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${rx.toFixed(1)}" fill="rgba(8,8,12,${bgA})"/>`
    + `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${boxW.toFixed(1)}" height="${(h * 0.003).toFixed(1)}" fill="rgba(220,180,90,${accentA})"/>`
    + `<text x="${(x + padX).toFixed(1)}" y="${(y + boxH * 0.42).toFixed(1)}" `
    + `font-family="Georgia,serif" font-size="${fontL1}" font-weight="700" `
    + `letter-spacing="3" fill="rgba(245,238,220,${txtA})">${venueShort} · ${dateShort}</text>`
    + `<text x="${(x + padX).toFixed(1)}" y="${(y + boxH * 0.78).toFixed(1)}" `
    + `font-family="Georgia,serif" font-size="${fontL2}" `
    + `letter-spacing="2" fill="rgba(220,210,190,${dimA})">${setLabel} · ${songInSet} · ${elapsedClock} / ${totalClock}</text>`
    + `</svg>`;
}

/** Format seconds as "M:SS" or "H:MM:SS". */
function formatClock(sec: number): string {
  const s = Math.floor(sec) % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Format ISO date "1972-08-27" as "8/27/72". */
function formatShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const yy = m[1].slice(2);
  return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}/${yy}`;
}

/** Extract a short city/venue label from a long venue string. */
function shortVenue(venue: string): string {
  if (!venue) return "";
  // "Old Renaissance Faire Grounds, Veneta, OR" → "VENETA, OR"
  const parts = venue.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`.toUpperCase();
  }
  return venue.toUpperCase();
}

function lyricLineSvg(text: string, width: number, height: number, fadeOpacity: number): string {
  // Escape for XML
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Auto-size: shrink long lines so they fit a 90% width band
  const charBudget = 50;
  const fontSize = text.length > charBudget
    ? Math.round(height * 0.038 * (charBudget / text.length))
    : Math.round(height * 0.038);
  const y = Math.round(height * 0.86);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`
    + `<defs><filter id="lyrShadow" x="-10%" y="-30%" width="120%" height="160%">`
    + `<feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#000" flood-opacity="0.85"/>`
    + `</filter></defs>`
    + `<text x="${width / 2}" y="${y}" text-anchor="middle" `
    + `font-family="Georgia,serif" font-style="italic" font-size="${fontSize}" `
    + `fill="rgba(255,250,235,${fadeOpacity.toFixed(3)})" filter="url(#lyrShadow)" `
    + `letter-spacing="2">${safe}</text></svg>`;
}

/**
 * Per-era show-body color grading. Drives era_saturation, era_brightness,
 * era_sepia, show_warmth, and show_grain in the uniform output. The grain
 * value crosses the postprocess film-stock gate (>0.8) for 70s eras and
 * stays under it for 80s+ so modern-era shows look digital-clean rather
 * than artificially aged.
 *
 * Values mirror the intro era styles in packages/renderer/src/intro.rs so
 * the intro and body share the same era character.
 */
function eraGrading(era: string): {
  era_saturation: number;
  era_brightness: number;
  era_sepia: number;
  show_warmth: number;
  show_grain: number;
} {
  switch (era) {
    case "primal":        // 1965-72 — outdoor 16mm, warm + grainy
      return { era_saturation: 1.20, era_brightness: 1.08, era_sepia: 0.15, show_warmth: 0.25, show_grain: 1.5 };
    case "classic":       // 1973-78 — 35mm period feel, slightly less sepia
      return { era_saturation: 1.15, era_brightness: 1.05, era_sepia: 0.10, show_warmth: 0.18, show_grain: 1.4 };
    case "hiatus":        // 1975 / Egypt / Closing of Winterland — cleaner 35mm
      return { era_saturation: 1.05, era_brightness: 1.02, era_sepia: 0.05, show_warmth: 0.10, show_grain: 1.1 };
    case "touch_of_grey": // 1985-90 — late-80s SVHS (under the 0.8 grain gate)
      return { era_saturation: 1.10, era_brightness: 1.00, era_sepia: 0.02, show_warmth: 0.05, show_grain: 0.7 };
    case "revival":       // 1990s+ Dead & Co — digital-clean
      return { era_saturation: 1.05, era_brightness: 1.00, era_sepia: 0.00, show_warmth: 0.05, show_grain: 0.4 };
    default:
      return { era_saturation: 1.10, era_brightness: 1.02, era_sepia: 0.05, show_warmth: 0.10, show_grain: 1.0 };
  }
}

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
  /** Pre-blocklist-filtered shader IDs available for this show. Used by
   *  routeScene priority overrides (drums/space, reactive triggers, dual)
   *  to avoid picking blocklisted shaders that would render as black. */
  activeShaderPool?: string[];
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
    reactiveState = pre.reactive[idx] ?? { isTriggered: false, triggerType: null, triggerStrength: 0, triggerAge: 0, suggestedModes: [], overlayInjections: [], cooldownRemaining: 0 };
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

// Complementary shader pools for dual composition.
// All entries are non-blocklisted — the previous version contained
// cosmic_voyage / protean_clouds / fluid_2d / particle_nebula /
// bioluminescence which the SHADER_BLOCKLIST drops, so dual blends
// silently fell back to the renderer's "missing-shader" path = black
// secondary layer.
const DUAL_POOLS: Record<string, string[]> = {
  protean_clouds: ["aurora", "fluid_light", "void_light", "deep_ocean"],
  fractal_temple: ["deep_ocean", "mandala_engine", "sacred_geometry", "honeycomb_cathedral"],
  liquid_light: ["tie_dye", "oil_projector", "ink_wash", "fluid_light"],
  inferno: ["electric_arc", "lava_flow", "fire_mountain_smoke", "bloom_explosion"],
  aurora: ["void_light", "fluid_light", "deep_ocean", "memorial_drift"],
  cosmic_voyage: ["aurora", "void_light", "fluid_light", "deep_ocean"],
  deep_ocean: ["crystal_cavern", "void_light", "fluid_light", "memorial_drift"],
};

function getDualPool(mode: string): string[] {
  return DUAL_POOLS[mode] ?? ["aurora", "void_light", "fluid_light", "deep_ocean"];
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
    // Multi-option pools per phase (was 1 hardcoded shader each → cosmic_voyage
    // alone drove ~12% of full-show frames despite being blocklisted, because
    // the override fired for every space_ambient frame). Now picks varied,
    // post-blocklist alternatives via a seeded shuffle for determinism +
    // stem/section variety. The first non-blocked shader wins.
    const dsPools: Record<string, string[]> = {
      drums_build:    ["inferno", "lava_flow", "electric_arc", "earthquake_fissure", "fractal_flames"],
      drums_peak:     ["electric_arc", "inferno", "bloom_explosion", "lava_flow", "psychedelic_garden"],
      space_ambient:  ["void_light", "deep_ocean", "aurora", "memorial_drift", "fluid_light", "ember_meadow"],
      space_textural: ["aurora", "aurora_curtains", "fluid_light", "void_light", "stark_minimal"],
      space_melodic:  ["void_light", "aurora", "ember_meadow", "fluid_light", "porch_twilight"],
    };
    const pool = dsPools[drumsSpaceState.subPhase] ?? [defaultMode];
    // Seeded pick keeps the same subphase consistent within a song
    // but varies across songs/seeds. defaultMode here may be blocklisted
    // — that's a routeScene-internal limitation; the section-level pick
    // path uses safeDefaultMode/anchorMode so this only matters when
    // dsPools doesn't have an entry for the subphase.
    const seedKey = ctx.songSeed + (drumsSpaceState.subPhase.length * 31);
    const ds = pool[Math.floor(seededRandom(seedKey) * pool.length)] ?? defaultMode;
    if (ds !== prevShaderId) {
      return { shaderId: ds, secondaryId: prevShaderId, blendProgress: 0.5, blendMode: "dissolve" };
    }
    return { shaderId: ds, secondaryId: null, blendProgress: null, blendMode: null };
  }

  // Priority 3: Reactive trigger injection.
  // Field names previously mismatched (triggered/shaderPool vs the source's
  // isTriggered/suggestedModes), so this priority NEVER fired — the whole
  // reactive system (spectral_eruption, energy_eruption, groove_solidify,
  // etc.) was dead code in manifest gen. Now wired correctly. Pool is
  // post-filtered against activeShaderPool (the trigger source includes
  // some blocklisted names like cosmic_voyage / fluid_2d).
  if (reactiveState?.isTriggered && reactiveState.suggestedModes?.length > 0) {
    const showPool = ctx.activeShaderPool ?? [];
    const filteredPool = showPool.length > 0
      ? reactiveState.suggestedModes.filter((m: string) => showPool.includes(m))
      : reactiveState.suggestedModes;
    if (filteredPool.length > 0) {
      const pick = filteredPool[Math.floor(seededRandom(ctx.songSeed + frameIdx * 3) * filteredPool.length)];
      return { shaderId: pick, secondaryId: prevShaderId, blendProgress: 0.3, blendMode: "dissolve" };
    }
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
  showProgress?: number, // 0..1 — overall position through the entire show (for time-of-day arc)
  isEncoreSong?: boolean, // true if current song is the encore — boosts warmth + bloom
): Record<string, number> {
  const eraGrade = eraGrading(showEra ?? "primal");
  // Time-of-day arc: subtle drift in warmth/brightness/saturation across the
  // 3-hour show so it feels like an afternoon-to-night progression rather
  // than 180 disconnected minutes. Magnitude is small — the per-song palette
  // and era grading remain dominant. Three-stop curve:
  //   0.0  afternoon   warmth +0.05, bright ×1.02, sat ×1.02
  //   0.5  sunset      warmth +0.10, bright ×0.99, sat ×1.05  (golden hour)
  //   1.0  night       warmth -0.05, bright ×0.95, sat ×0.92  (cool, deep)
  const sp = Math.max(0, Math.min(1, showProgress ?? 0));
  let todWarmth = 0;
  let todBright = 1;
  let todSat = 1;
  if (sp < 0.5) {
    const t = sp / 0.5;
    todWarmth = 0.05 + (0.10 - 0.05) * t;
    todBright = 1.02 + (0.99 - 1.02) * t;
    todSat   = 1.02 + (1.05 - 1.02) * t;
  } else {
    const t = (sp - 0.5) / 0.5;
    todWarmth = 0.10 + (-0.05 - 0.10) * t;
    todBright = 0.99 + (0.95 - 0.99) * t;
    todSat   = 1.05 + (0.92 - 1.05) * t;
  }
  // Encore boost: visual escalation on the last song(s) of the night.
  // Adds extra warmth + brightness so the encore *feels* like one,
  // working with the time-of-day arc rather than against it.
  const encoreBoostWarmth = isEncoreSong ? 0.08 : 0;
  const encoreBoostBright = isEncoreSong ? 1.04 : 1.0;
  const encoreBoostBloom  = isEncoreSong ? 1.15 : 1.0;
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

  // Narrative directive: per-song authored arc affects color/brightness.
  // computeNarrativeDirective was called every frame but its output was
  // discarded. Now its offsets are applied additively (small magnitudes
  // — ±0.2 brightness, ±0.3 sat — so sections still feel like the same
  // song but the authored narrative arc actually colors the rendering).
  const nar = analysis?.narrative;
  if (nar) {
    envBrightness += (nar.brightnessOffset ?? 0);
    envSaturation += (nar.saturationOffset ?? 0);
    // temperature: -1 cool, +1 warm. Map to ±15° hue shift.
    hueShiftDeg += (nar.temperature ?? 0) * 15;
  }
  // Section vocabulary: per-section-type (verse/chorus/jam/space/etc.)
  // brightness + saturation offsets. Also computed every frame, also
  // dropped. Smaller magnitudes (±0.1 brightness, ±0.2 sat per the
  // VOCABULARIES table) — verses dim/desaturate, choruses brighten.
  const vocab = analysis?.sectionVocab;
  if (vocab) {
    envBrightness += (vocab.brightnessOffset ?? 0);
    envSaturation += (vocab.saturationOffset ?? 0);
  }
  // Groove modifiers: temperature shift from detected groove type
  // (pocket=warm, driving=hot, floating=cool, freeform=neutral).
  // grooveModifiers was computed every frame, never read.
  const gMods = analysis?.grooveMods;
  if (gMods) {
    // temperatureShift -1..+1 → ±10° hue (subtle, layers with vocab+narrative)
    hueShiftDeg += (gMods.temperatureShift ?? 0) * 10;
  }
  // Climax modulation: rich offsets that exceed the hardcoded climax
  // boosts above. climaxModulation factors in anticipation +
  // stem-dominant context, returns specific saturation/brightness/
  // bloom/contrast offsets. Computed but only the saturation +
  // brightness fields fed downstream — adopt the rest now too.
  const cMod = analysis?.climaxMod;
  if (cMod) {
    // Note: the hardcoded climax block above (lines ~682-696) already
    // contributed phase-based boosts. cMod refines by intensity +
    // anticipation. Apply the DELTA (cMod is computed independently),
    // not double-counting the hardcoded path. Magnitudes from
    // climaxModulation are small enough (typical |saturationOffset|
    // < 0.15, |brightnessOffset| < 0.10) that adding still keeps the
    // envelope_brightness/saturation clamps comfortable.
    envBrightness += (cMod.brightnessOffset ?? 0) * 0.5;  // half-weight to avoid double-apply with hardcoded climax
    envSaturation += (cMod.saturationOffset ?? 0) * 0.5;
  }
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
    // Era grading + time-of-day arc: era values mirror intro.rs (so body
    // and intro share era character), then a subtle time-of-day drift is
    // layered on top so the 3-hour show feels like afternoon → sunset →
    // night rather than 180 disconnected minutes.
    era_saturation: eraGrade.era_saturation * todSat,
    era_brightness: eraGrade.era_brightness * todBright * encoreBoostBright,
    era_sepia: eraGrade.era_sepia,
    show_warmth: eraGrade.show_warmth + todWarmth + encoreBoostWarmth,
    // climaxMod modulates bloom + contrast per-frame on top of the
    // era-graded base so peak moments visibly bloom + sharpen.
    // Half-weight (0.5x) so climax-band offsets don't overdrive.
    show_contrast: 1.10 * (1 + ((analysis?.climaxMod?.contrastOffset ?? 0) * 0.5)),
    show_saturation: 1.15 * todSat,
    show_grain: eraGrade.show_grain,
    show_bloom: 1.15 * encoreBoostBloom * (1 + ((analysis?.climaxMod?.bloomOffset ?? 0) * 0.5)),
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
  // Audit fix: missing analysis JSONs were silently skipped (loud songs
  // would render with all-zero audio uniforms = no reactivity for that
  // song's entire duration). --strict-analysis aborts manifest gen if
  // ANY song's analysis is missing/malformed. Recommended for production.
  const strictAnalysis = args.includes("--strict-analysis");
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
    keyframe_svg?: string;
  }>> = [];

  // ─── Process each song ───
  const allFrames: any[] = [];
  const songBoundaries: Array<{ title: string; set: number; startFrame: number; endFrame: number; segueFromPrev?: boolean }> = [];
  let globalTime = 0;
  const usedShaderModes = new Map<string, number>();
  const shaderModeLastUsed = new Map<string, number>();
  let showSongsCompleted = 0;
  // Peak-of-show state: detectPeakOfShow was imported but never called.
  // Track per-song peak scores so the function can fire its one-time
  // "transcendent moment" treatment in the second half of the show.
  const previousSongPeaks: number[] = [];
  let peakOfShowFired = false;
  // Show-arc tracking: track songs-since-last-drums-space so post-jam
  // songs get the post_space arc phase (changes overlay density,
  // saturation/brightness via getShowArcModifiers). Was passed as
  // undefined to buildRotationSchedule, leaving the whole show-arc
  // narrative arc system unwired.
  let postJamSegmentCount = -1; // -1 = no jam yet; 0 = currently in jam; >0 = N songs after

  const songStart = singleSongIdx >= 0 ? singleSongIdx : 0;
  const songEnd = singleSongIdx >= 0 ? singleSongIdx + 1 : songs.length;

  // Pre-flight readiness scan: per-song analysis + lyric availability.
  // Failed analysis = the song renders with flat/zero audio uniforms
  // (no reactivity). Failed lyrics = no karaoke for that song. Surfacing
  // both up-front lets the user notice + fix BEFORE betting 12 hours
  // of GPU time on a partially-broken render.
  let totalShowFrames = 0;
  const missingAnalysis: string[] = [];
  const missingLyrics: string[] = [];
  const malformedAnalysis: { title: string; error: string }[] = [];
  for (let si = songStart; si < songEnd; si++) {
    const s = songs[si];
    const tp = resolveAnalysisPath(s, showDate);
    if (!tp) {
      missingAnalysis.push(s.title);
      continue;
    }
    try {
      const a = JSON.parse(readFileSync(tp, "utf-8"));
      if (!Array.isArray(a.frames) || a.frames.length === 0) {
        malformedAnalysis.push({ title: s.title, error: "no frames array" });
        continue;
      }
      totalShowFrames += Math.ceil((a.frames.length) / (a.meta?.fps ?? 30) * fps);
    } catch (e) {
      malformedAnalysis.push({ title: s.title, error: (e as Error).message?.slice(0, 80) ?? "parse error" });
      continue;
    }
    // Lyric check (informational — not fatal even under --strict-analysis,
    // since not every song has lyrics worth aligning, e.g. Stage Announcements
    // and Drums/Space).
    const lyricSlug = s.title
      .toLowerCase().replace(/'/g, " ").replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-").replace(/^-|-$/g, "");
    const lyricPath = `${__dirname}/../pipeline/data/lyrics-aligned/${lyricSlug}-${showDate}.json`;
    if (!existsSync(lyricPath)) {
      missingLyrics.push(s.title);
    }
  }
  totalShowFrames = Math.max(1, totalShowFrames);

  // Print readiness summary so the user sees the picture before render.
  const totalSongs = songEnd - songStart;
  console.log(`[full-manifest] Pre-flight readiness:`);
  console.log(`  Analysis: ${totalSongs - missingAnalysis.length - malformedAnalysis.length}/${totalSongs} OK, ${missingAnalysis.length} missing, ${malformedAnalysis.length} malformed`);
  console.log(`  Lyrics:   ${totalSongs - missingLyrics.length}/${totalSongs} aligned`);
  if (missingAnalysis.length > 0) {
    console.warn(`  MISSING ANALYSIS: ${missingAnalysis.slice(0, 8).join(", ")}${missingAnalysis.length > 8 ? `, +${missingAnalysis.length - 8} more` : ""}`);
  }
  for (const { title, error } of malformedAnalysis.slice(0, 5)) {
    console.warn(`  MALFORMED ANALYSIS: ${title} — ${error}`);
  }
  if (strictAnalysis && (missingAnalysis.length > 0 || malformedAnalysis.length > 0)) {
    console.error(`[full-manifest] --strict-analysis set, aborting before render due to ${missingAnalysis.length + malformedAnalysis.length} bad analysis files`);
    process.exit(2);
  }

  // Per-set song counts + per-song position-within-set lookup, used by
  // the show-context HUD overlay. Computed once here so the per-frame
  // loop below is a pair of map reads instead of repeated scans.
  const songsPerSet = new Map<number, number>();
  const songPositionInSet = new Map<number, number>(); // songIdx → 1-based position
  {
    const setCounters = new Map<number, number>();
    for (let si = songStart; si < songEnd; si++) {
      const set = songs[si]?.set ?? 1;
      const next = (setCounters.get(set) ?? 0) + 1;
      setCounters.set(set, next);
      songPositionInSet.set(si, next);
    }
    for (const [set, count] of setCounters.entries()) songsPerSet.set(set, count);
  }
  // Find the last *real* song of the show (skip stage-announcement tracks
  // which are typically d?t01 / d?t-last). Used to flag the encore.
  let lastRealSongIdx = -1;
  for (let si = songEnd - 1; si >= songStart; si--) {
    const t = songs[si]?.title?.toLowerCase() ?? "";
    if (!t.includes("announcement") && !t.includes("tuning")) { lastRealSongIdx = si; break; }
  }
  // Total show duration in seconds (for HUD elapsed/total display).
  const totalShowSeconds = totalShowFrames / fps;
  const venueLabel = shortVenue(setlist.venue ?? "");
  const dateLabel = formatShortDate(setlist.date ?? "");
  const totalSetCount = songsPerSet.size;
  // Venue type (drives the ambient overlay) — explicit setlist.venueType
  // wins, otherwise inferred from venue name. null = no venue ambient.
  const venueType = inferVenueType(setlist.venue ?? "", (setlist as any).venueType ?? null);
  if (venueType) {
    console.log(`[full-manifest] Venue ambient: ${venueType}`);
  }

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
      // Hoist trimFrontSeconds outside the trim block so the lyric karaoke
      // pass can convert OUTPUT frame index → AUDIO time correctly. Without
      // this every lyric line would be offset by the trim amount.
      (analysis as any).__trimFrontSeconds = trimFront;
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
    // Raw authored default mode — may be blocklisted (e.g. cosmic_voyage,
    // protean_clouds). Used for diagnostics + fallback. Active routing
    // uses safeDefaultMode below which falls through the blocklist.
    const defaultMode = (song.defaultMode ?? "protean_clouds").replace(/-/g, "_");
    const songIdentity = lookupSongIdentity(song.title) ?? undefined;

    // Load aligned lyrics (Wave 7 — was MISSING per audit). The slug
    // matches the audio-path resolver's algorithm so files like
    // "He's Gone" → "he-s-gone-1972-08-27.json" resolve cleanly.
    const lyricSlug = song.title
      .toLowerCase()
      .replace(/'/g, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const alignedLyrics = loadAlignedLyrics(lyricSlug, showDate);
    const trimFrontSeconds: number = (analysis as any).__trimFrontSeconds ?? 0;
    if (alignedLyrics && alignedLyrics.length > 0) {
      console.log(`    Lyrics: ${alignedLyrics.length} aligned lines (trim=${trimFrontSeconds.toFixed(1)}s)`);
    }
    // Distinguish Drums vs Space — they're sacred and visually different.
    // Drums: tribal, rhythmic, percussive. Space: void, cosmic, motionless.
    // Both get nearly all overlays suppressed so the moment isn't cluttered.
    const titleLower = song.title?.toLowerCase() ?? "";
    const isDrums = titleLower.includes("drums") && !titleLower.includes("space");
    const isSpace = titleLower.includes("space") && !titleLower.includes("drums");
    // "Drums > Space" combined track: treat as space-dominant since the
    // drums portion is usually the front quarter of the track.
    const isDrumsAndSpace = titleLower.includes("drums") && titleLower.includes("space");
    const isDrumsSpace = isDrums || isSpace || isDrumsAndSpace;
    const setNumber = song.set ?? 1;
    // Encore detection. Three signals, any of which counts:
    //   1. Explicit set === "encore" / song.encore === true
    //   2. Last set is short (≤3 songs) — typical 2-set + encore show
    //   3. Last song of the show — always gets encore weight even if the
    //      show didn't formally label one (e.g. Veneta set 3 has 8 songs
    //      but One More Saturday Night IS the encore).
    // Per-song lead vocalist (Jerry/Bob/Pigpen/etc.) — null if unknown.
    // Drives a subtle top-left corner glyph during vocal passages.
    const vocalist = lookupVocalist(song.title ?? "");
    const isLastRealSong = songIdx === lastRealSongIdx;
    const explicitEncore = (song.set as any) === "encore" || (song as any).encore === true;
    const shortLastSet = setNumber === totalSetCount
      && (songsPerSet.get(setNumber) ?? 99) <= 3;
    const isEncoreSong = explicitEncore || shortLastSet || isLastRealSong;

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
      reactive: preReactive.filter(v => !v?.isTriggered && v?.triggerType === null && v?.suggestedModes?.length === 0).length,
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

    // Globally blocked — never picked by any path. Includes:
    // - C/D tier procedural / screensaver-quality
    // - Black-frame risks (compile failures, sparse output)
    // - Redundant variants superseded by better versions
    // - 3D-mesh shaders incompatible with fullscreen-quad pipeline
    const SHADER_BLOCKLIST = new Set([
      "combustible_voronoi", "creation", "fluid_2d", "spectral_bridge",
      "obsidian_mirror", "amber_drift", "volumetric_clouds", "volumetric_smoke",
      "volumetric_nebula", "digital_rain", "protean_clouds", "seascape",
      "warm_nebula", "particle_nebula", "liquid_mandala", "star_nest",
      "crystalline_void", "space_travel", "fractal_zoom", "acid_melt",
      "aurora_sky", "spinning_spiral", "prism_refraction", "spectral_analyzer",
      "neon_grid", "concert_beams", "blacklight_glow", "liquid_projector",
      "databend", "signal_decay", "climax_surge", "cellular_automata",
      "bioluminescence", "luminous_cavern", "storm_vortex", "mycelium_network",
      "cosmic_voyage", "solar_flare", "forest",
      "dual_blend", "dual_shader", "smoke_and_mirrors", "molten_glass",
      "particle_burst",
    ]);
    // Identity-only shaders: hand-crafted song-specific variants that should
    // ONLY be picked when a songIdentity explicitly names them in
    // preferredModes — not via random pool. Without this distinction, songs
    // like Scarlet Begonias with `preferredModes: ["scarlet_golden_haze"]`
    // had their signature shader stripped out by the variety-validity filter.
    const IDENTITY_ONLY_SHADERS = new Set([
      "morning_dew_fog", "dark_star_void", "fire_mountain_smoke",
      "estimated_prophet_mist", "wharf_rat_storm", "scarlet_golden_haze",
      "st_stephen_lightning", "terrapin_nebula",
    ]);

    // Safe default — falls through blocklist. Use this anywhere routing
    // logic would otherwise leak the raw authored defaultMode (which may
    // be cosmic_voyage / protean_clouds / etc, all blocked).
    const SAFE_FALLBACK_DEFAULT = "fractal_temple";
    const safeDefaultMode = !SHADER_BLOCKLIST.has(defaultMode) && shaders[defaultMode]
      ? defaultMode
      : SAFE_FALLBACK_DEFAULT;

    let prevShaderId = safeDefaultMode;
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
    // SHADER_BLOCKLIST is now hoisted above (used by safeDefaultMode).
    const activeShaderPool = Object.keys(shaders).filter(s => !SHADER_BLOCKLIST.has(s));
    // Late-binding so routeScene's priority overrides (drums/space, reactive
    // triggers, dual) can post-filter blocklisted picks.
    ctx.activeShaderPool = activeShaderPool;

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
      // Allow identity-only show-specific variants when explicitly named
      // (scarlet_golden_haze for Scarlet, dark_star_void for Dark Star, etc.)
      const validPreferred = (songIdentity?.preferredModes ?? []).filter(
        (m: any) => activeShaderPool.includes(m as any) || (IDENTITY_ONLY_SHADERS.has(m) && shaders[m])
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
        // Identity-only shaders pass when songIdentity explicitly named them.
        const isIdentityNamed = !!filteredIdentity?.preferredModes?.includes(candidate as any);
        if (candidate
            && (activeShaderPool.includes(candidate as any) || (isIdentityNamed && IDENTITY_ONLY_SHADERS.has(candidate) && shaders[candidate]))
            && !SHADER_BLOCKLIST.has(candidate as any)) {
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
        currentMode: sectionModes[currentSectionIdx] ?? safeDefaultMode,
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

    // Pre-allocate per-frame overlay density multiplier — computed during
    // the main render-frame loop (where narrative + sectionVocab are
    // available) and consumed by the overlay phase below. Without this
    // bridge the overlayDensityMult fields from both narrative and vocab
    // would be wasted (computed every frame, never reach the overlay
    // opacity calculation).
    const overlayDensityMults = new Float32Array(totalOut);
    overlayDensityMults.fill(1.0);

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
      // Peak-of-show: detect THE moment of the show (one-time, second
      // half only). Mutate frameAnalysis.peakOfShow so the uniform
      // lookup at line 849 picks it up, and latch peakOfShowFired at
      // show level so it never fires again.
      if (!peakOfShowFired) {
        const ps = detectPeakOfShow(
          frames as any, ai, previousSongPeaks,
          peakOfShowFired, showSongsCompleted, songs.length,
        );
        if (ps.isActive) {
          frameAnalysis.peakOfShow = { isPeak: true, intensity: ps.intensity };
          peakOfShowFired = true;
          console.log(`    [PEAK OF SHOW] frame ${i} (intensity=${ps.intensity.toFixed(2)}) — golden treatment armed`);
        }
      }
      prevState = frameAnalysis;
      // Stash the per-frame overlay density multiplier so the later
      // overlay phase can apply it. narrative + vocab + peakOfShow
      // each contribute; multiplied (not summed) so a 0.5 vocab + 0.5
      // peak give 0.25 not 0.0.
      overlayDensityMults[i] = (frameAnalysis.narrative?.overlayDensityMult ?? 1.0)
        * (frameAnalysis.sectionVocab?.overlayDensityMult ?? 1.0)
        * (frameAnalysis.interplay?.densityMult ?? 1.0)
        * (frameAnalysis.peakOfShow?.isPeak ? 0.5 : 1.0);

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

      const route = routeScene(ctx, frameAnalysis, i, prevShaderId, safeDefaultMode, routeState);

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
      // Merge songIdentity.palette into song so computeUniforms can read it
      // via song?.palette. SetlistEntry.palette wins if both are set.
      const songForUniforms = (song?.palette || !songIdentity?.palette)
        ? song
        : { ...song, palette: songIdentity.palette };
      // Show progress (0..1) drives the time-of-day arc inside computeUniforms.
      const showProgress = (allFrames.length + i) / Math.max(1, totalShowFrames);
      let uniforms = computeUniforms(
        frames, ai, fps, tempo, width, height, globalTime, frameAnalysis, smoothed,
        aiHi, interpT,
        songForUniforms, i / Math.max(1, totalOut), routeSectionProgress, showVisualSeed,
        setlist.era ?? "classic",
        showProgress,
        isEncoreSong,
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

      // Show-arc phase: where in the show are we? Drives overlay density,
      // saturation/brightness via getShowArcModifiers. Was passed as
      // undefined; now computed per song from set/track/post-jam position.
      const songsInThisSet = songs.filter((s: any) => (s.set ?? 1) === setNumber).length;
      const arcPhase = computeShowArcPhase({
        setNumber,
        trackNumber: song.trackNumber ?? (songIdx + 1),
        songsInSet: songsInThisSet,
        isJamSegment: isDrumsSpace,
        postJamSegmentCount: postJamSegmentCount > 0 ? postJamSegmentCount : 0,
      });
      const showArcModifiers = getShowArcModifiers(arcPhase);

      // Song hero: the song's signature overlay. Without it, overlay
      // selection has no "must-include" guarantee — Sugar Magnolia might
      // not get its rose, Casey Jones might not get its cocaine spoon, etc.
      // Source: first authored overlayBoost entry from songIdentity.
      const songHero: string | undefined = songIdentity?.overlayBoost?.[0];

      // Song-level dominant stem section: pick the most-common stem
      // classification across precomputed frame analysis. Was passed as
      // undefined; overlay-rotation uses it to bias overlay families
      // (vocal/solo/jam/quiet each pull different overlay sets).
      let dominantStemSection: any = undefined;
      try {
        const stemCounts: Record<string, number> = {};
        const sampleStride = Math.max(1, Math.floor(frames.length / 200));
        for (let fi = 0; fi < frames.length; fi += sampleStride) {
          const cached = preReactive[fi]; // reuse precompute pass — frame state has stemSection downstream
          // Frame analysis hasn't run yet here; sample stem classification
          // directly from the frame's drum/vocal/other ratios.
          const drumE = (frames[fi]?.stemDrumRms ?? 0);
          const vocalE = (frames[fi]?.stemVocalRms ?? 0);
          const otherE = (frames[fi]?.stemOtherRms ?? 0);
          const total = drumE + vocalE + otherE;
          if (total < 0.05) {
            stemCounts.quiet = (stemCounts.quiet ?? 0) + 1;
          } else if (vocalE / total > 0.4) {
            stemCounts.vocal = (stemCounts.vocal ?? 0) + 1;
          } else if (otherE / total > 0.55) {
            stemCounts.solo = (stemCounts.solo ?? 0) + 1;
          } else {
            stemCounts.jam = (stemCounts.jam ?? 0) + 1;
          }
        }
        let topCount = 0;
        for (const [k, v] of Object.entries(stemCounts)) {
          if (v > topCount) { topCount = v; dominantStemSection = k; }
        }
      } catch {
        dominantStemSection = undefined;
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
        safeDefaultMode,    // mode — drives SCENE_OVERLAY_BIAS scoring per overlay
        songIdentity,
        showArcModifiers,
        undefined,                  // drumsSpacePhase (per-frame, can't be a song-level constant)
        dominantStemSection,        // now wired from sampled stem-energy analysis
        showSongsCompleted, // songsCompleted
        songHero,           // now wired (was undefined)
        tempo,
      );

      // Post-pass: apply songIdentity.overlaySuppress + overlayBoost to each
      // rotation window. buildRotationSchedule honors overlayDensity but
      // doesn't read suppress/boost lists (the score-aware overlay-selector
      // does, but manifest-gen uses overlay-rotation instead). Without this
      // pass, authored "no laser shows during this song" / "always show
      // skeleton-couple" intent had ZERO effect.
      const suppressSet = new Set(songIdentity?.overlaySuppress ?? []);
      const boostList = songIdentity?.overlayBoost ?? [];
      if (suppressSet.size > 0 || boostList.length > 0) {
        for (const w of rotSchedule.windows) {
          // Drop suppressed
          if (suppressSet.size > 0) {
            w.overlays = w.overlays.filter(name => !suppressSet.has(name));
          }
          // Force-include boost candidates that aren't already present
          // (cap at original window size + 2 to avoid runaway density)
          if (boostList.length > 0) {
            const present = new Set(w.overlays);
            const cap = w.overlays.length + 2;
            for (const name of boostList) {
              if (w.overlays.length >= cap) break;
              if (!present.has(name) && OVERLAY_BY_NAME.has(name)) {
                w.overlays.push(name);
                present.add(name);
              }
            }
          }
        }
      }

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
          (ctx._preComputed?.reactive?.[ai] ?? { isTriggered: false, triggerType: null, triggerStrength: 0, triggerAge: 0, suggestedModes: [], overlayInjections: [], cooldownRemaining: 0 }) as any,
          tempo,
        );

        // Apply per-frame overlay density multiplier from narrative +
        // vocab + peak-of-show (precomputed during the main loop).
        // The renderer already enforces minimum and maximum opacities
        // per overlay; this multiplier is the section-level shape.
        const densityMult = overlayDensityMults[i] ?? 1.0;

        // Convert opacities to OverlayInstance array
        const frameInstances: typeof overlaySchedule[0] = [];
        // Drums>Space: aggressive overlay suppression. The shader is the
        // entire visual statement here; clutter breaks the ritual. We
        // multiply curated opacities by 0.10 (down from densityMult) so
        // they read as ghostly residue rather than active overlays.
        const drumsSpaceOpMult = isDrumsSpace ? 0.10 : 1.0;
        for (const [overlayName, opacityRaw] of Object.entries(opacities)) {
          const opacity = opacityRaw * densityMult * drumsSpaceOpMult;
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

        // ─── Lyric karaoke ───
        // If aligned lyrics exist for this song, find the active line for
        // this frame's audio time and inject a text-SVG overlay. Lines
        // are sorted by start time; we scan forward only (linear amortized).
        // Fades: 0.25s in/out on opacity for smooth presence; max-opacity
        // capped at 0.85 so the lyrics never feel like a hard subtitle
        // strip overlaid on the visual.
        if (alignedLyrics && alignedLyrics.length > 0) {
          const t = i / fps + trimFrontSeconds;
          // Binary-search would be cleaner but lyrics are <50 lines/song
          // — linear is fine and simpler.
          for (const line of alignedLyrics) {
            if (t < line.start - 0.25 || t > line.end + 0.25) continue;
            // Triangular fade: 0 → 0.85 over 0.25s in, hold, 0.85 → 0 over 0.25s out
            let op = 0.85;
            if (t < line.start) op = ((t - (line.start - 0.25)) / 0.25) * 0.85;
            else if (t > line.end) op = ((line.end + 0.25 - t) / 0.25) * 0.85;
            op = Math.max(0, Math.min(0.85, op));
            if (op < 0.01) continue;
            frameInstances.push({
              overlay_id: "Lyrics",
              transform: {
                opacity: Math.round(op * 1000) / 1000,
                scale: 1.0,
                rotation_deg: 0,
                offset_x: 0,
                offset_y: 0,
              },
              blend_mode: "normal",
              keyframe_svg: lyricLineSvg(line.text, width, height, op),
            });
            break; // one line at a time — no overlapping lyric stack
          }
        }

        // ─── Stage lighting beams ───
        // Concert spotlight pair (warm + cool, song-palette tinted) from above
        // the frame. Activates at energy > 0.55 with a soft ramp so beams fade
        // in during builds rather than snap on. Pulses brighter on each beat.
        // Suppressed in the first 4 seconds of a song so the song-title and
        // lyric intro can breathe; suppressed during drums-space because the
        // visuals are meant to be sparse there.
        if (!isDrumsSpace) {
          const energy = frames[ai]?.rms ?? 0;
          const songTimeSec = i / fps;
          const introMute = Math.max(0, Math.min(1, (songTimeSec - 4.0) / 2.0)); // 0 → 1 over 4-6s
          const energyEnvelope = Math.max(0, Math.min(1, (energy - 0.55) / 0.25));
          const baseOp = 0.18 * energyEnvelope * introMute; // peak at ~18% (screen blend)
          if (baseOp > 0.005) {
            const beat = frames[ai]?.beat ? 1 : 0;
            const beatBoost = beat * 0.8 + (frames[ai]?.stemBassRms ?? 0) * 0.4;
            // Resolve song hues from palette (primary, secondary); default warm/cool.
            const songPalette: any = (song as any)?.palette ?? songIdentity?.palette;
            let hP = 30;
            let hS = 200;
            if (songPalette?.primary !== undefined) hP = songPalette.primary;
            if (songPalette?.secondary !== undefined) hS = songPalette.secondary;
            // Slow horizontal sweep — ~12s period — so beams "feel" alive.
            const sweepPhase = (songTimeSec / 12.0) * Math.PI * 2;
            frameInstances.push({
              overlay_id: "StageLights",
              transform: {
                opacity: 1.0, // opacity baked into SVG via per-stop alpha
                scale: 1.0,
                rotation_deg: 0,
                offset_x: 0,
                offset_y: 0,
              },
              blend_mode: "screen",
              keyframe_svg: stageLightsSvg(
                width, height, hP, hS,
                Math.min(1, beatBoost),
                sweepPhase,
                Math.min(1, baseOp),
              ),
            });
          }
        }

        // ─── Venue ambient ───
        // Always-on (subtly) backdrop tying the abstract visuals to the
        // physical room. Renders BEFORE other foreground overlays in the
        // instance list so per-pixel compositing layers it underneath.
        // Suppressed during peak-of-show + drums-space so it doesn't
        // clutter sacred moments. Outdoor-day reads with the time-of-day
        // arc — sun position drifts across the show.
        if (venueType) {
          const showElapsedSec = (allFrames.length + i) / fps;
          const peakSuppress = (overlayDensityMults[i] ?? 1.0) < 0.7 ? 0.3 : 1.0;
          const dsSuppress = isDrumsSpace ? 0.4 : 1.0;
          const venueOp = 0.65 * peakSuppress * dsSuppress;
          if (venueOp > 0.04) {
            frameInstances.push({
              overlay_id: "VenueAmbient",
              transform: {
                opacity: 1.0,
                scale: 1.0,
                rotation_deg: 0,
                offset_x: 0,
                offset_y: 0,
              },
              blend_mode: "screen",
              keyframe_svg: venueAmbienceSvg(venueType, width, height, showElapsedSec, venueOp),
            });
          }
        }

        // ─── Vocal-lead glyph ───
        // Top-left corner monogram + name in vocalist's color. Only renders
        // when a vocalist is actively singing (gated on stem-vocal energy).
        // Suppressed during drums>space (no vocals there) and the first 1.5s
        // of a song so it doesn't fight the song-title intro.
        if (vocalist && !isDrumsSpace) {
          const songTimeSec = i / fps;
          const vocalEnergy = frames[ai]?.stemVocalRms
            ?? frames[ai]?.stemVocalPresence
            ?? 0;
          // Smooth threshold so the glyph fades in/out with vocals rather
          // than blinking on every breath.
          const vocalGate = Math.max(0, Math.min(1, (vocalEnergy - 0.10) / 0.20));
          const introMute = Math.min(1, Math.max(0, (songTimeSec - 1.5) / 1.5));
          const glyphOp = 0.65 * vocalGate * introMute;
          if (glyphOp > 0.04) {
            frameInstances.push({
              overlay_id: "VocalLead",
              transform: {
                opacity: 1.0,
                scale: 1.0,
                rotation_deg: 0,
                offset_x: 0,
                offset_y: 0,
              },
              blend_mode: "screen",
              keyframe_svg: vocalistGlyphSvg(
                width, height, vocalist,
                Math.min(1, vocalEnergy * 2),
                glyphOp,
              ),
            });
          }
          // Subtle full-frame color cast so the screen warms toward the
          // vocalist's hue even when the corner glyph is dim. Suppressed
          // at peaks (the climax should breathe at full color) and during
          // drums-space (no vocalist context). ~5% peak alpha.
          const peakSuppress2 = (overlayDensityMults[i] ?? 1.0) < 0.7 ? 0.2 : 1.0;
          const castOp = 0.055 * vocalGate * introMute * peakSuppress2;
          if (castOp > 0.005) {
            frameInstances.push({
              overlay_id: "VocalCast",
              transform: {
                opacity: 1.0,
                scale: 1.0,
                rotation_deg: 0,
                offset_x: 0,
                offset_y: 0,
              },
              blend_mode: "screen",
              keyframe_svg: vocalistColorCastSvg(width, height, vocalist, castOp),
            });
          }
        }

        // ─── Drums / Space ritual marker ───
        // Single large dim word at the bottom of the frame, naming the
        // sacred segment. Doesn't compete with the shader — barely there.
        // Pulses with bass for Drums, with overall energy for Space.
        if (isDrums || isDrumsAndSpace || isSpace) {
          const songTimeSec = i / fps;
          // Fade in over first 1.5s so the marker emerges as the segment opens
          const ramp = Math.min(1, songTimeSec / 1.5);
          // Determine label: combined Drums>Space tracks switch at ~30% through
          const songProgress = totalOut > 0 ? i / totalOut : 0;
          let label = "SPACE";
          if (isDrums) label = "DRUMS";
          else if (isDrumsAndSpace) label = songProgress < 0.30 ? "DRUMS" : "SPACE";
          const pulseSrc = label === "DRUMS"
            ? (frames[ai]?.stemBassRms ?? frames[ai]?.bass ?? 0)
            : (frames[ai]?.rms ?? 0);
          const markerOp = 0.18 * ramp;
          if (markerOp > 0.01) {
            frameInstances.push({
              overlay_id: "RitualMarker",
              transform: {
                opacity: 1.0,
                scale: 1.0,
                rotation_deg: 0,
                offset_x: 0,
                offset_y: 0,
              },
              blend_mode: "screen",
              keyframe_svg: ritualMarkerSvg(width, height, label, Math.min(1, pulseSrc), markerOp),
            });
          }
        }

        // ─── Encore lighter flames ───
        // Active only during the encore (last set with ≤3 songs). Fade-in
        // over first 2s of the song so it builds with the moment instead
        // of snapping on. Suppressed during peak-of-show — lighters are
        // ambient, not focal, so they shouldn't compete with the climax.
        if (isEncoreSong) {
          const songTimeSec = i / fps;
          const flameRamp = Math.min(1, songTimeSec / 2.0);
          const peakSuppress = (overlayDensityMults[i] ?? 1.0) < 0.7 ? 0.5 : 1.0;
          const flameOp = 0.32 * flameRamp * peakSuppress;
          if (flameOp > 0.02) {
            frameInstances.push({
              overlay_id: "LighterFlames",
              transform: {
                opacity: 1.0,
                scale: 1.0,
                rotation_deg: 0,
                offset_x: 0,
                offset_y: 0,
              },
              blend_mode: "screen",
              keyframe_svg: lighterFlamesSvg(width, height, i / fps, flameOp),
            });
          }
        }

        // ─── Show-context HUD ───
        // Persistent top-right block grounding the abstract visuals in
        // the show's actual identity. Always visible (so a viewer who
        // tunes in mid-show is never lost), but fades during peak-of-show
        // so it doesn't compete with the climax. Skipped during the very
        // first second so the brand intro isn't cluttered.
        {
          const songTimeSec = i / fps;
          const showElapsedSec = (allFrames.length + i) / fps;
          // Set label: detect encore (last set with ≤3 songs is the encore on most shows)
          const setNum = song.set ?? 1;
          const isEncoreSet = setNum === totalSetCount && (songsPerSet.get(setNum) ?? 99) <= 3;
          const setLabel = isEncoreSet ? "ENCORE" : `SET ${setNum}`;
          const inSet = songPositionInSet.get(songIdx) ?? 1;
          const setTotal = songsPerSet.get(setNum) ?? 1;
          // Fade in over first 1.5s of show, fade during peak, dim during drums-space.
          // Peak-of-show detection uses overlayDensityMults (which includes a 0.5x
          // contribution during peak frames) — under 0.7 means peak is active.
          const showStartFade = Math.min(1, showElapsedSec / 1.5);
          const peakFade = (overlayDensityMults[i] ?? 1.0) < 0.7 ? 0.35 : 1.0;
          const dsFade = isDrumsSpace ? 0.45 : 1.0;
          const hudOp = 0.85 * showStartFade * peakFade * dsFade;
          if (hudOp > 0.02 && songTimeSec > 0.0) {
            frameInstances.push({
              overlay_id: "ShowContextHUD",
              transform: {
                opacity: 1.0, // alpha baked into SVG
                scale: 1.0,
                rotation_deg: 0,
                offset_x: 0,
                offset_y: 0,
              },
              blend_mode: "normal",
              keyframe_svg: showContextHudSvg(
                width, height,
                venueLabel, dateLabel, setLabel,
                `${inSet}/${setTotal}`,
                formatClock(showElapsedSec),
                formatClock(totalShowSeconds),
                hudOp,
              ),
            });
          }
        }

        overlaySchedule.push(frameInstances);
      }

      const overlayMs = Date.now() - overlayStartTime;
      const avgOverlays = overlaySchedule.length > 0
        ? (overlaySchedule.slice(-totalOut).reduce((s, f) => s + f.length, 0) / totalOut).toFixed(1)
        : "0";
      console.log(`    Overlays: ${totalOut} frames in ${(overlayMs / 1000).toFixed(1)}s (avg ${avgOverlays} per frame)`);
    }

    // Track song boundary for chapter cards. segueFromPrev: true when
    // the previous song flowed directly into this one (canonical Dead
    // segue pair OR explicit setlist.songs[i-1].segueInto). Used by the
    // renderer to suppress the chapter card and extend the crossfade.
    let segueFromPrev = false;
    if (songIdx > songStart) {
      const prevSong = songs[songIdx - 1];
      const prevExplicit = prevSong?.segueInto === true || (prevSong as any)?.segue === true;
      if (prevExplicit || isKnownSegue(prevSong?.title ?? "", song.title ?? "")) {
        segueFromPrev = true;
      }
    }
    songBoundaries.push({
      title: song.title,
      set: song.set ?? (songIdx < 10 ? 1 : songIdx < 15 ? 2 : 3),
      startFrame: allFrames.length - totalOut,
      endFrame: allFrames.length,
      segueFromPrev,
    });

    // Record this song's peak score so detectPeakOfShow can compare
    // against subsequent songs.
    try {
      const songPeak = computeSongPeakScore(frames as any);
      previousSongPeaks.push(songPeak);
    } catch (e) {
      // Non-fatal — fail open, peak detection just keeps trying
    }

    globalTime += frames.length / afps;
    showSongsCompleted++;
    // Track post-jam offset: 0 during a jam segment, increments after.
    if (isDrumsSpace) {
      postJamSegmentCount = 0;
    } else if (postJamSegmentCount >= 0) {
      postJamSegmentCount++;
    }
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

      // Determine blend mode: segue pairs use luminance_key + extended fade,
      // others use dissolve. Segue detection accepts EITHER an explicit
      // setlist.songs[bi].segueInto flag OR membership in the canonical
      // KNOWN_SEGUES table (China>Rider, Help>Slip>Franklin, Scarlet>Fire,
      // Estimated>Eyes, etc.).
      const songAData = songs[bi];
      const isSegue = (songAData?.segueInto && songAData.segueInto !== false)
        || isKnownSegue(songAData?.title ?? "", songs[bi + 1]?.title ?? "");
      const blendMode = isSegue ? "luminance_key" : "dissolve";
      // Extend the crossfade for segues so the moment reads as continuous
      // sequence rather than two adjacent songs. 2s → 4s.
      const fadeFrames = isSegue ? BOUNDARY_FADE_FRAMES * 2 : BOUNDARY_FADE_FRAMES;

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

      // For non-segue boundaries, apply a "breathing room" visual exhale —
      // triangular brightness/saturation dim that bottoms at 75% / 80% at
      // the exact crossover. Dead concerts have natural pauses between
      // non-segue songs (applause, banter, tuning); the manifest trims
      // those out of the audio so the visual needs to suggest the breath.
      // Audit flagged this as "no breathing room between songs". Segues
      // skip the dim because they're meant to flow without a pause.
      const breathingDim = !isSegue;

      // Last fadeFrames of song A: blend toward song B's shader
      for (let j = 0; j < fadeFrames; j++) {
        const fi = boundary - fadeFrames + j;
        if (fi < songA.startFrame || fi >= boundary) continue;
        const progress = j / fadeFrames; // 0→1
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

        // Breathing dim: outgoing half (linear ramp 1.0 → 0.75 brightness, 1.0 → 0.80 sat)
        if (breathingDim) {
          const breathFactor = 1.0 - progress * 0.25; // 1.0 → 0.75
          const breathSatFactor = 1.0 - progress * 0.20; // 1.0 → 0.80
          frame.envelope_brightness = (frame.envelope_brightness ?? 1) * breathFactor;
          frame.envelope_saturation = (frame.envelope_saturation ?? 1) * breathSatFactor;
        }
      }

      // First fadeFrames of song B: blend from song A's shader
      for (let j = 0; j < fadeFrames; j++) {
        const fi = boundary + j;
        if (fi >= songB.endFrame) continue;
        const progress = 1.0 - (j / fadeFrames); // 1→0 (outgoing shader fades)
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

        // Breathing dim: incoming half (linear ramp 0.75 → 1.0 brightness, 0.80 → 1.0 sat).
        // progress here is INVERTED (1→0 over the window) so we use j-progress.
        if (breathingDim) {
          const incomingProgress = j / fadeFrames; // 0→1
          const breathFactor = 0.75 + incomingProgress * 0.25; // 0.75 → 1.0
          const breathSatFactor = 0.80 + incomingProgress * 0.20; // 0.80 → 1.0
          frame.envelope_brightness = (frame.envelope_brightness ?? 1) * breathFactor;
          frame.envelope_saturation = (frame.envelope_saturation ?? 1) * breathSatFactor;
        }
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

  // ─── Write manifest ───
  // Two paths:
  //   .msgpack — pack the full Manifest object via msgpackr (Buffer-based;
  //     handles >512MB cleanly because there's no intermediate JSON string).
  //     Renderer loads ~2x faster than JSON, file is ~50% smaller.
  //   .json    — stream JSON token-by-token to avoid Node's 512MB string limit.
  if (outputPath.endsWith('.msgpack')) {
    console.log(`\n[full-manifest] Writing msgpack: ${allFrames.length} frames, ${Object.keys(strippedShaders).length} shaders`);
    const { Packr } = await import('msgpackr');
    const manifestObj: any = {
      shaders: strippedShaders,
      width, height, fps,
      show_title: showTitle,
      song_boundaries: songBoundaries,
      frames: allFrames,
    };
    if (withOverlays && overlaySchedule.length > 0) {
      manifestObj.overlay_schedule = overlaySchedule;
      manifestObj.overlay_png_dir = overlayPngDirExplicit ? overlayPngDir : resolve(overlayPngDir);

      const overlayUsage = new Map<string, number>();
      for (const frame of overlaySchedule) {
        for (const inst of frame) {
          overlayUsage.set(inst.overlay_id, (overlayUsage.get(inst.overlay_id) ?? 0) + 1);
        }
      }
      const sortedOverlays = [...overlayUsage.entries()].sort((a, b) => b[1] - a[1]);
      console.log(`[full-manifest] Overlay usage (top 15):`);
      for (const [name, count] of sortedOverlays.slice(0, 15)) {
        const pct = (count / overlaySchedule.length * 100).toFixed(1);
        console.log(`  ${name}: ${count} frames (${pct}%)`);
      }
    }
    // Settings must match the Rust loader (rmp_serde) — useRecords=false, useFloat32=ALWAYS.
    const packr = new Packr({ useRecords: false, structuredClone: false, useFloat32: 1 });
    const buffer = packr.pack(manifestObj);
    writeFileSync(outputPath, buffer);
    const mb = (statSync(outputPath).size / 1048576).toFixed(1);
    console.log(`[full-manifest] Done: ${outputPath} (${mb} MB, ${allFrames.length} frames)`);

    // Report shader usage even on the msgpack path
    const sortedModes = [...usedShaderModes.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`\n[full-manifest] Shader usage (top 15):`);
    for (const [name, count] of sortedModes.slice(0, 15)) {
      const pct = (count / allFrames.length * 100).toFixed(1);
      console.log(`  ${name}: ${count} frames (${pct}%)`);
    }
    return;
  }

  console.log(`\n[full-manifest] Writing JSON: ${allFrames.length} frames, ${Object.keys(strippedShaders).length} shaders`);
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
