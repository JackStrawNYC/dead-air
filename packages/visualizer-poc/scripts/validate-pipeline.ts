#!/usr/bin/env npx tsx
/**
 * Pipeline Health Checks — validates data integrity between pipeline stages.
 *
 * Runs Zod schema validation on all JSON data files, checks cross-file
 * consistency (frame counts, trackId alignment, audio file existence),
 * and reports issues with clear, actionable error messages.
 *
 * Usage:
 *   npx tsx scripts/validate-pipeline.ts              # validate everything
 *   npx tsx scripts/validate-pipeline.ts --stage=pre   # pre-render checks only
 *   npx tsx scripts/validate-pipeline.ts --stage=post  # post-bridge checks only
 *   npx tsx scripts/validate-pipeline.ts --fix         # auto-fix minor issues
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = errors found (rendering will likely fail)
 *   2 = warnings only (rendering should work but results may be suboptimal)
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import {
  ShowSetlistSchema,
  ShowTimelineSchema,
  ShowContextSchema,
  NarrationSchema,
  MilestoneDataSchema,
  SongStatsSchema,
  FlexibleTrackAnalysisSchema,
  OverlayScheduleSchema,
  ImageLibrarySchema,
  LyricTriggersConfigSchema,
  AlignmentDataSchema,
} from "../src/data/schemas";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const TRACKS_DIR = join(DATA_DIR, "tracks");
const AUDIO_DIR = join(ROOT, "public", "audio");
const LYRICS_DIR = join(DATA_DIR, "lyrics");

// Parse args
const args = process.argv.slice(2);
const stageFilter = args.find((a) => a.startsWith("--stage="))?.split("=")[1];
const verbose = args.includes("--verbose") || args.includes("-v");

// ─── Result tracking ───

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: string[];
}

const results: CheckResult[] = [];

function pass(name: string, message: string) {
  results.push({ name, status: "pass", message });
}

function warn(name: string, message: string, details?: string[]) {
  results.push({ name, status: "warn", message, details });
}

function fail(name: string, message: string, details?: string[]) {
  results.push({ name, status: "fail", message, details });
}

// ─── Helper: safe JSON load ───

function loadJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    fail("json-parse", `Failed to parse ${path}: ${e}`);
    return null;
  }
}

// ─── Stage 1: Core Data Files Exist ───

function checkFileExistence() {
  console.log("\n--- Stage 1: File Existence ---");

  const required = [
    ["setlist.json", "Show setlist (songs, palettes, modes)"],
    ["show-timeline.json", "Frame offsets for concat"],
  ];

  const optional = [
    ["show-context.json", "Chapter card narratives"],
    ["narration.json", "Tour context + listen-for moments"],
    ["milestones.json", "Song milestones (debuts, revivals)"],
    ["song-stats.json", "Historical song statistics"],
    ["overlay-schedule.json", "AI-curated overlay assignments"],
    ["image-library.json", "Media asset registry"],
    ["lyric-triggers.json", "Phrase-to-visual trigger mappings"],
  ];

  for (const [file, desc] of required) {
    const path = join(DATA_DIR, file);
    if (existsSync(path)) {
      const size = statSync(path).size;
      pass(`file:${file}`, `${desc} (${(size / 1024).toFixed(1)} KB)`);
    } else {
      fail(`file:${file}`, `MISSING: ${desc} — required for rendering`);
    }
  }

  for (const [file, desc] of optional) {
    const path = join(DATA_DIR, file);
    if (existsSync(path)) {
      pass(`file:${file}`, `${desc}`);
    } else {
      warn(`file:${file}`, `MISSING: ${desc} — rendering will use defaults`);
    }
  }
}

// ─── Stage 2: Schema Validation ───

function checkSchemas() {
  console.log("\n--- Stage 2: Schema Validation ---");

  const checks: Array<{
    file: string;
    schema: { safeParse: (data: unknown) => { success: boolean; error?: { issues: Array<{ path: (string | number)[]; message: string }> } } };
    required: boolean;
  }> = [
    { file: "setlist.json", schema: ShowSetlistSchema, required: true },
    { file: "show-timeline.json", schema: ShowTimelineSchema, required: true },
    { file: "show-context.json", schema: ShowContextSchema, required: false },
    { file: "narration.json", schema: NarrationSchema, required: false },
    { file: "milestones.json", schema: MilestoneDataSchema, required: false },
    { file: "song-stats.json", schema: SongStatsSchema, required: false },
    { file: "overlay-schedule.json", schema: OverlayScheduleSchema, required: false },
    { file: "image-library.json", schema: ImageLibrarySchema, required: false },
    { file: "lyric-triggers.json", schema: LyricTriggersConfigSchema, required: false },
  ];

  for (const { file, schema, required } of checks) {
    const data = loadJson(join(DATA_DIR, file));
    if (data === null) {
      if (required) fail(`schema:${file}`, `Cannot validate — file missing or unparseable`);
      continue;
    }

    const result = schema.safeParse(data);
    if (result.success) {
      pass(`schema:${file}`, `Valid`);
    } else {
      const issues = result.error!.issues.map(
        (i) => `  ${i.path.join(".")}: ${i.message}`,
      );
      if (required) {
        fail(`schema:${file}`, `Schema validation failed`, issues.slice(0, 10));
      } else {
        warn(`schema:${file}`, `Schema validation failed (optional file)`, issues.slice(0, 5));
      }
    }
  }
}

// ─── Stage 3: Track Analysis Files ───

function checkTrackAnalysis() {
  console.log("\n--- Stage 3: Track Analysis ---");

  const setlistData = loadJson(join(DATA_DIR, "setlist.json")) as { songs: Array<{ trackId: string; title: string }> } | null;
  if (!setlistData) {
    fail("tracks:setlist", "Cannot check tracks — setlist.json missing");
    return;
  }

  let validCount = 0;
  let totalFrames = 0;
  const issues: string[] = [];

  for (const song of setlistData.songs) {
    const analysisPath = join(TRACKS_DIR, `${song.trackId}-analysis.json`);
    if (!existsSync(analysisPath)) {
      issues.push(`MISSING: ${song.trackId} (${song.title})`);
      continue;
    }

    const data = loadJson(analysisPath);
    if (!data) {
      issues.push(`UNPARSEABLE: ${song.trackId} (${song.title})`);
      continue;
    }

    const result = FlexibleTrackAnalysisSchema.safeParse(data);
    if (!result.success) {
      const firstIssue = result.error!.issues[0];
      issues.push(`INVALID: ${song.trackId} — ${firstIssue?.path.join(".")}: ${firstIssue?.message}`);
      continue;
    }

    const analysis = result.data;

    // Check frame count matches meta
    if (analysis.frames.length !== analysis.meta.totalFrames) {
      issues.push(
        `FRAME MISMATCH: ${song.trackId} — meta says ${analysis.meta.totalFrames}, got ${analysis.frames.length} frames`,
      );
    }

    // Check for degenerate data
    const allZeroRms = analysis.frames.every((f) => f.rms === 0);
    if (allZeroRms) {
      issues.push(`DEGENERATE: ${song.trackId} — all RMS values are 0 (silent audio?)`);
    }

    // Check reasonable tempo
    if (analysis.meta.tempo < 30 || analysis.meta.tempo > 300) {
      issues.push(`SUSPECT TEMPO: ${song.trackId} — ${analysis.meta.tempo} BPM seems unlikely`);
    }

    // Check sections exist and cover full range
    if (analysis.meta.sections.length === 0) {
      issues.push(`NO SECTIONS: ${song.trackId} — section detection may have failed`);
    } else {
      const firstSection = analysis.meta.sections[0];
      const lastSection = analysis.meta.sections[analysis.meta.sections.length - 1];
      if (firstSection.frameStart > 30) {
        issues.push(`GAP: ${song.trackId} — first section starts at frame ${firstSection.frameStart}`);
      }
      if (lastSection.frameEnd < analysis.meta.totalFrames - 30) {
        issues.push(`GAP: ${song.trackId} — last section ends ${analysis.meta.totalFrames - lastSection.frameEnd} frames early`);
      }
    }

    validCount++;
    totalFrames += analysis.frames.length;
  }

  if (issues.length === 0) {
    pass(
      "tracks:all",
      `All ${validCount}/${setlistData.songs.length} tracks valid (${totalFrames.toLocaleString()} total frames, ${(totalFrames / 30 / 60).toFixed(1)} min)`,
    );
  } else {
    const fn = issues.some((i) => i.startsWith("MISSING")) ? fail : warn;
    fn(
      "tracks:issues",
      `${validCount}/${setlistData.songs.length} tracks valid, ${issues.length} issue(s)`,
      issues,
    );
  }
}

// ─── Stage 3b: Per-Frame Degenerate Detection ───

function checkFrameQuality() {
  console.log("\n--- Stage 3b: Frame Quality ---");

  const setlistData = loadJson(join(DATA_DIR, "setlist.json")) as { songs: Array<{ trackId: string; title: string }> } | null;
  if (!setlistData) {
    fail("frame-quality:setlist", "Cannot check frame quality — setlist.json missing");
    return;
  }

  const issues: string[] = [];
  const repairs: string[] = [];

  for (const song of setlistData.songs) {
    const analysisPath = join(TRACKS_DIR, `${song.trackId}-analysis.json`);
    if (!existsSync(analysisPath)) continue;

    const data = loadJson(analysisPath) as {
      meta: { totalFrames: number };
      frames: Array<{ rms: number; centroid: number; onset: number; sub: number; low: number; mid: number; high: number; flatness: number }>;
    } | null;
    if (!data?.frames) continue;

    const frames = data.frames;
    let nanCount = 0;
    let silenceRunStart = -1;
    let longestSilence = 0;
    let longestSilenceStart = 0;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];

      // Check for NaN values in critical fields
      if (isNaN(f.rms) || isNaN(f.centroid) || isNaN(f.onset) || isNaN(f.flatness)) {
        nanCount++;
      }

      // Track silence runs (RMS === 0 for extended periods)
      if (f.rms === 0) {
        if (silenceRunStart === -1) silenceRunStart = i;
      } else {
        if (silenceRunStart !== -1) {
          const runLen = i - silenceRunStart;
          if (runLen > longestSilence) {
            longestSilence = runLen;
            longestSilenceStart = silenceRunStart;
          }
          silenceRunStart = -1;
        }
      }
    }

    // Check trailing silence
    if (silenceRunStart !== -1) {
      const runLen = frames.length - silenceRunStart;
      if (runLen > longestSilence) {
        longestSilence = runLen;
        longestSilenceStart = silenceRunStart;
      }
    }

    if (nanCount > 0) {
      issues.push(`NaN VALUES: ${song.trackId} has ${nanCount} frames with NaN fields`);
      repairs.push(`Fix: re-run analysis for ${song.trackId}: npx tsx scripts/analyze.ts --track=${song.trackId}`);
    }

    // >10s of zero RMS at 30fps = 300 frames
    if (longestSilence > 300) {
      const startSec = (longestSilenceStart / 30).toFixed(1);
      const durSec = (longestSilence / 30).toFixed(1);
      issues.push(
        `LONG SILENCE: ${song.trackId} has ${durSec}s of zero RMS starting at ${startSec}s (frame ${longestSilenceStart})`,
      );
      repairs.push(
        `Fix: check audio file for ${song.trackId} — may have dead air or encoding issues. Try: ffmpeg -i public/audio/${song.trackId}.mp3 -af silencedetect=n=-50dB:d=5 -f null -`,
      );
    }
  }

  // Print repair suggestions
  if (repairs.length > 0) {
    console.log("\n  Repair suggestions:");
    for (const r of repairs) {
      console.log(`    ${r}`);
    }
  }

  if (issues.length === 0) {
    pass("frame-quality", "All frames pass quality checks (no NaN, no long silence runs)");
  } else {
    warn("frame-quality", `${issues.length} frame quality issue(s)`, issues);
  }
}

// ─── Stage 4: Cross-File Consistency ───

function checkConsistency() {
  console.log("\n--- Stage 4: Cross-File Consistency ---");

  const setlistData = loadJson(join(DATA_DIR, "setlist.json")) as {
    songs: Array<{ trackId: string; title: string; audioFile: string; set: number }>;
  } | null;
  const timelineData = loadJson(join(DATA_DIR, "show-timeline.json")) as {
    tracks: Array<{ trackId: string; totalFrames: number }>;
  } | null;

  if (!setlistData || !timelineData) {
    fail("consistency", "Cannot check consistency — missing setlist or timeline");
    return;
  }

  const issues: string[] = [];

  // Check every setlist song has a timeline entry
  const timelineIds = new Set(timelineData.tracks.map((t) => t.trackId));
  for (const song of setlistData.songs) {
    if (!timelineIds.has(song.trackId)) {
      issues.push(`MISSING TIMELINE: ${song.trackId} (${song.title}) not in show-timeline.json`);
    }
  }

  // Check timeline frame counts match analysis
  for (const track of timelineData.tracks) {
    const analysisPath = join(TRACKS_DIR, `${track.trackId}-analysis.json`);
    if (!existsSync(analysisPath)) continue;

    const data = loadJson(analysisPath) as { meta: { totalFrames: number } } | null;
    if (!data) continue;

    if (data.meta.totalFrames !== track.totalFrames) {
      issues.push(
        `FRAME COUNT MISMATCH: ${track.trackId} — timeline says ${track.totalFrames}, analysis says ${data.meta.totalFrames}`,
      );
    }
  }

  // Check audio files exist
  for (const song of setlistData.songs) {
    const audioPath = join(AUDIO_DIR, song.audioFile);
    if (!existsSync(audioPath)) {
      issues.push(`MISSING AUDIO: ${song.audioFile} (${song.title})`);
    }
  }

  // Check set numbers are sequential
  const sets = [...new Set(setlistData.songs.map((s) => s.set))].sort();
  for (let i = 1; i < sets.length; i++) {
    if (sets[i] - sets[i - 1] > 1) {
      issues.push(`SET GAP: Jump from set ${sets[i - 1]} to set ${sets[i]}`);
    }
  }

  // Check overlay schedule references valid overlays
  const scheduleData = loadJson(join(DATA_DIR, "overlay-schedule.json")) as {
    songs: Record<string, { activeOverlays: string[] }>;
  } | null;
  if (scheduleData) {
    const setlistIds = new Set(setlistData.songs.map((s) => s.trackId));
    for (const trackId of Object.keys(scheduleData.songs)) {
      if (!setlistIds.has(trackId)) {
        issues.push(`ORPHAN SCHEDULE: overlay-schedule.json has ${trackId} but not in setlist`);
      }
    }
    for (const song of setlistData.songs) {
      if (!scheduleData.songs[song.trackId]) {
        issues.push(`MISSING SCHEDULE: ${song.trackId} (${song.title}) has no overlay schedule`);
      }
    }
  }

  // Check lyric alignment files
  if (existsSync(LYRICS_DIR)) {
    for (const song of setlistData.songs) {
      const alignmentPath = join(LYRICS_DIR, `${song.trackId}-alignment.json`);
      if (existsSync(alignmentPath)) {
        const data = loadJson(alignmentPath);
        if (data) {
          const result = AlignmentDataSchema.safeParse(data);
          if (!result.success) {
            issues.push(`INVALID ALIGNMENT: ${song.trackId} — ${result.error!.issues[0]?.message}`);
          }
        }
      }
    }
  }

  if (issues.length === 0) {
    pass("consistency", "All cross-file references are consistent");
  } else {
    const hasErrors = issues.some(
      (i) => i.startsWith("MISSING TIMELINE") || i.startsWith("MISSING AUDIO") || i.startsWith("FRAME COUNT"),
    );
    const fn = hasErrors ? fail : warn;
    fn("consistency", `${issues.length} consistency issue(s)`, issues);
  }
}

// ─── Stage 4b: Section Override Validation ───

function checkSectionOverrides() {
  console.log("\n--- Stage 4b: Section Override Bounds ---");

  const setlistData = loadJson(join(DATA_DIR, "setlist.json")) as {
    songs: Array<{
      trackId: string;
      title: string;
      sectionOverrides?: Array<{ sectionIndex: number; mode: string }>;
    }>;
  } | null;
  if (!setlistData) {
    fail("section-overrides:setlist", "Cannot check section overrides — setlist.json missing");
    return;
  }

  const issues: string[] = [];
  let checkedCount = 0;

  for (const song of setlistData.songs) {
    if (!song.sectionOverrides?.length) continue;

    const analysisPath = join(TRACKS_DIR, `${song.trackId}-analysis.json`);
    if (!existsSync(analysisPath)) continue;

    const data = loadJson(analysisPath) as {
      meta: { sections: Array<{ frameStart: number; frameEnd: number }> };
    } | null;
    if (!data?.meta?.sections) continue;

    const sectionCount = data.meta.sections.length;
    checkedCount++;

    for (const override of song.sectionOverrides) {
      if (override.sectionIndex >= sectionCount) {
        issues.push(
          `OUT OF BOUNDS: ${song.trackId} (${song.title}) — sectionIndex ${override.sectionIndex} ` +
          `exceeds section count ${sectionCount} (valid: 0-${sectionCount - 1}). Mode "${override.mode}" will never render.`
        );
      }
    }
  }

  if (issues.length === 0) {
    pass("section-overrides", `All section overrides are valid (${checkedCount} songs checked)`);
  } else {
    fail("section-overrides", `${issues.length} invalid section override(s) — these modes will never render`, issues);
  }
}

// ─── Stage 5: Data Quality ───

function checkDataQuality() {
  console.log("\n--- Stage 5: Data Quality ---");

  const setlistData = loadJson(join(DATA_DIR, "setlist.json")) as {
    songs: Array<{ trackId: string; title: string; palette?: { primary: number; secondary: number } }>;
  } | null;
  if (!setlistData) return;

  const issues: string[] = [];

  // Check for duplicate palettes (visual monotony)
  const paletteMap = new Map<string, string[]>();
  for (const song of setlistData.songs) {
    if (song.palette) {
      const key = `${song.palette.primary}-${song.palette.secondary}`;
      const arr = paletteMap.get(key) ?? [];
      arr.push(song.trackId);
      paletteMap.set(key, arr);
    }
  }
  for (const [palette, tracks] of paletteMap) {
    if (tracks.length > 2) {
      issues.push(`DUPLICATE PALETTE: ${palette} used by ${tracks.join(", ")} — may look monotonous`);
    }
  }

  // Check song art exists for each song
  for (const song of setlistData.songs) {
    const artPath = join(ROOT, "public", "assets", "song-art", `${song.trackId}.png`);
    if (!existsSync(artPath)) {
      issues.push(`MISSING ART: ${song.trackId} (${song.title}) — no poster image`);
    }
  }

  // Check narration coverage
  const narrationData = loadJson(join(DATA_DIR, "narration.json")) as {
    songs?: Record<string, { listenFor: string[] }>;
    fanReviews?: unknown[];
  } | null;
  if (narrationData?.songs) {
    let emptyListenFor = 0;
    for (const song of setlistData.songs) {
      const narr = narrationData.songs[song.trackId];
      if (!narr || narr.listenFor.length === 0) emptyListenFor++;
    }
    if (emptyListenFor > setlistData.songs.length / 2) {
      issues.push(`LOW NARRATION: ${emptyListenFor}/${setlistData.songs.length} songs have no "listen for" moments`);
    }
    if (!narrationData.fanReviews?.length) {
      issues.push(`NO FAN REVIEWS: narration.json has no fanReviews — quote overlay will be empty`);
    }
  }

  // Check show-context chapter coverage
  const contextData = loadJson(join(DATA_DIR, "show-context.json")) as {
    chapters: Array<{ before?: string; after?: string; text: string }>;
  } | null;
  if (contextData) {
    const coveredTracks = new Set<string>();
    for (const ch of contextData.chapters) {
      if (ch.before) coveredTracks.add(ch.before);
      if (ch.after) coveredTracks.add(ch.after);
    }
    const uncovered = setlistData.songs.filter((s) => !coveredTracks.has(s.trackId));
    if (uncovered.length > setlistData.songs.length * 0.5) {
      issues.push(`LOW CHAPTER COVERAGE: ${uncovered.length}/${setlistData.songs.length} songs have no chapter cards`);
    }
  }

  if (issues.length === 0) {
    pass("quality", "Data quality checks passed");
  } else {
    warn("quality", `${issues.length} quality suggestion(s)`, issues);
  }
}

// ─── Stage 6: Output Health ───

function checkOutputHealth() {
  console.log("\n--- Stage 6: Output Health ---");

  const outDir = join(ROOT, "out");
  const songsDir = join(outDir, "songs");

  if (!existsSync(outDir)) {
    warn("output", "No output directory — render has not been run yet");
    return;
  }

  const issues: string[] = [];

  // Check for rendered songs
  if (existsSync(songsDir)) {
    const rendered = readdirSync(songsDir).filter(
      (f) => f.endsWith(".mp4") && !f.includes("chunk") && !f.includes("preview"),
    );
    const setlistData = loadJson(join(DATA_DIR, "setlist.json")) as {
      songs: Array<{ trackId: string; title: string }>;
    } | null;
    if (setlistData) {
      const missing = setlistData.songs.filter(
        (s) => !rendered.includes(`${s.trackId}.mp4`),
      );
      if (missing.length > 0) {
        issues.push(`UNRENDERED: ${missing.map((m) => m.trackId).join(", ")}`);
      }
    }

    // Check for orphaned chunks (incomplete renders)
    const chunkDirs = readdirSync(songsDir).filter((f) => f.endsWith("-chunks"));
    if (chunkDirs.length > 0) {
      issues.push(`LEFTOVER CHUNKS: ${chunkDirs.length} chunk dir(s) — may indicate incomplete renders`);
    }
  }

  // Check for final concatenated show
  if (existsSync(outDir)) {
    const fullShows = readdirSync(outDir).filter((f) => f.endsWith("-full-show.mp4"));
    if (fullShows.length === 0) {
      issues.push("NO FULL SHOW: final concatenated MP4 not found");
    }
  }

  // Check variation metadata
  const metaPath = join(outDir, "variation-meta.json");
  if (existsSync(metaPath)) {
    const meta = loadJson(metaPath) as { seed: number; tracksRendered: number } | null;
    if (meta) {
      pass("output:meta", `Variation seed: ${meta.seed}, ${meta.tracksRendered} tracks rendered`);
    }
  }

  if (issues.length === 0) {
    pass("output", "Output directory looks healthy");
  } else {
    warn("output", `${issues.length} output issue(s)`, issues);
  }
}

// ─── Main ───

function main() {
  console.log("Dead Air Pipeline Health Check");
  console.log("=".repeat(40));
  console.log(`Data dir: ${DATA_DIR}`);

  const runPre = !stageFilter || stageFilter === "pre";
  const runPost = !stageFilter || stageFilter === "post";

  if (runPre) {
    checkFileExistence();
    checkSchemas();
    checkTrackAnalysis();
    checkFrameQuality();
    checkConsistency();
    checkSectionOverrides();
    checkDataQuality();
  }

  if (runPost) {
    checkOutputHealth();
  }

  // ─── Report ───

  console.log("\n" + "=".repeat(40));
  console.log("RESULTS\n");

  const passes = results.filter((r) => r.status === "pass");
  const warnings = results.filter((r) => r.status === "warn");
  const failures = results.filter((r) => r.status === "fail");

  for (const r of results) {
    const icon = r.status === "pass" ? "  PASS" : r.status === "warn" ? "  WARN" : "  FAIL";
    console.log(`${icon}  ${r.name}: ${r.message}`);
    if (r.details && (verbose || r.status === "fail")) {
      for (const d of r.details) console.log(`       ${d}`);
    }
  }

  console.log(`\n${passes.length} passed, ${warnings.length} warnings, ${failures.length} failures`);

  if (failures.length > 0) {
    console.log("\nFix the failures above before rendering.");
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log("\nRendering should work, but consider addressing the warnings.");
    process.exit(2);
  } else {
    console.log("\nAll checks passed! Ready to render.");
    process.exit(0);
  }
}

main();
