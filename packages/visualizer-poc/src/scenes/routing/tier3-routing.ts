/**
 * Tier 3 pipeline-feature routing biases.
 *
 * Wires three new per-frame Python-pipeline fields into the shader-variety
 * routing path so the data the analyze.py is computing actually shapes
 * what's on screen:
 *
 *   • keyTonic / keyMode  — Krumhansl-Schmuckler key detection
 *   • silenceScore        — true silence (between songs / dead air)
 *   • vocalEnergyRatio    — vocal share of tonal energy
 *
 * Each helper computes a section-averaged value (10 samples spanning the
 * section's frame range) and either returns a soft-bias pool (caller
 * weights into the candidate list) or null when the signal is too weak
 * to act on. None of these is a hard gate — they layer below the existing
 * stem / semantic hard gates and above song-identity-only routing.
 */

import type { VisualMode } from "../../data/types";

export interface SectionLike {
  frameStart: number;
  frameEnd: number;
}

interface FrameLike {
  rms?: number;
  keyMode?: number;
  keyConfidence?: number;
  silenceScore?: number;
  vocalEnergyRatio?: number;
}

const SAMPLE_COUNT = 10;

function sampleSection<T>(
  frames: ReadonlyArray<FrameLike>,
  section: SectionLike,
  read: (f: FrameLike) => T,
  zero: T,
): T[] {
  const start = section.frameStart;
  const end = Math.min(section.frameEnd, frames.length - 1);
  const span = end - start;
  if (span <= 0) return [];
  const out: T[] = [];
  const n = Math.min(SAMPLE_COUNT, span);
  for (let s = 0; s < n; s++) {
    const fi = start + Math.floor((s * span) / n);
    out.push(read(frames[fi] ?? {}) ?? zero);
  }
  return out;
}

// ─── 1. Key-mode shader bias ──────────────────────────────────────────────
//
// Major-key + confidence > 0.5 → bias toward warm/uplifting shaders.
// Minor-key + confidence > 0.5 → bias toward cool/cosmic shaders.
// Below confidence: null (no bias).

const MAJOR_KEY_POOL: VisualMode[] = [
  "aurora", "ember_meadow", "porch_twilight", "fractal_temple",
  "honeycomb_cathedral", "sacred_geometry",
];
const MINOR_KEY_POOL: VisualMode[] = [
  "deep_ocean", "cosmic_dust", "void_light", "dark_star_void",
  "nimitz_aurora", "fractal_temple",
];

const KEY_CONFIDENCE_THRESHOLD = 0.50;

export function pickKeyModeBias(
  frames: ReadonlyArray<FrameLike>,
  section: SectionLike,
): VisualMode[] | null {
  const modes = sampleSection<number>(frames, section, (f) => f.keyMode ?? 1, 1);
  const confs = sampleSection<number>(frames, section, (f) => f.keyConfidence ?? 0, 0);
  if (modes.length === 0) return null;
  const avgMode = modes.reduce<number>((s, v) => s + v, 0) / modes.length;
  const avgConf = confs.reduce<number>((s, v) => s + v, 0) / confs.length;
  if (avgConf < KEY_CONFIDENCE_THRESHOLD) return null;
  return avgMode >= 0.5 ? MAJOR_KEY_POOL : MINOR_KEY_POOL;
}

// ─── 2. Silence-score dead-air override ────────────────────────────────────
//
// Dead air between songs (silenceScore averaged > 0.5 across the section)
// routes to ambient/atmospheric shaders so the empty audio reads as
// "moment of reflection" instead of "video paused / black screen."
// Returns a hard-restrict pool (caller treats as override, similar to
// drumsSpacePhase). null when not in silence.

const SILENCE_AMBIENT_POOL: VisualMode[] = [
  "aurora", "void_light", "cosmic_dust", "nimitz_aurora", "deep_ocean",
];

const SILENCE_OVERRIDE_THRESHOLD = 0.50;

export function pickSilenceOverride(
  frames: ReadonlyArray<FrameLike>,
  section: SectionLike,
): VisualMode[] | null {
  const scores = sampleSection<number>(frames, section, (f) => f.silenceScore ?? 0, 0);
  if (scores.length === 0) return null;
  const avg = scores.reduce<number>((s, v) => s + v, 0) / scores.length;
  if (avg < SILENCE_OVERRIDE_THRESHOLD) return null;
  return SILENCE_AMBIENT_POOL;
}

// ─── 3. Vocal-vs-instrumental shader bias ──────────────────────────────────
//
// vocalEnergyRatio > 0.5  → vocal-dominant → warm/intimate shaders
// vocalEnergyRatio < 0.20 → instrumental-dominant → soaring/expansive
// 0.20–0.50 → balanced ensemble, no bias.

const VOCAL_DOMINANT_POOL: VisualMode[] = [
  "porch_twilight", "ember_meadow", "fractal_temple", "aurora",
  "honeycomb_cathedral",
];
const INSTRUMENTAL_DOMINANT_POOL: VisualMode[] = [
  "electric_arc", "fractal_temple", "cosmic_dust", "dance_floor_prism",
  "nimitz_aurora",
];

export function pickVocalRatioBias(
  frames: ReadonlyArray<FrameLike>,
  section: SectionLike,
): VisualMode[] | null {
  const ratios = sampleSection(frames, section, (f) => f.vocalEnergyRatio, undefined as number | undefined);
  const valid = ratios.filter((v): v is number => typeof v === "number" && v >= 0);
  if (valid.length === 0) return null;
  const avg = valid.reduce((s, v) => s + v, 0) / valid.length;
  if (avg > 0.50) return VOCAL_DOMINANT_POOL;
  if (avg < 0.20) return INSTRUMENTAL_DOMINANT_POOL;
  return null;
}
