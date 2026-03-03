#!/usr/bin/env npx tsx
/**
 * Generate Overlay Profiles — Claude-powered per-song overlay curation.
 *
 * Gathers rich per-song context (Dead lore, audio analysis, lyric triggers,
 * show narrative) and asks Claude to curate 12-18 overlays per song from
 * the full 379-overlay registry. Each song gets a unique palette matched
 * to its themes, energy arc, and cultural meaning.
 *
 * Usage:
 *   npx tsx scripts/generate-overlay-profiles.ts                # all songs
 *   npx tsx scripts/generate-overlay-profiles.ts --force         # regenerate all
 *   npx tsx scripts/generate-overlay-profiles.ts --song s2t08    # single song
 *   npx tsx scripts/generate-overlay-profiles.ts --dry-run       # show prompts, no API calls
 *
 * Requires ANTHROPIC_API_KEY in environment or .env file.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { config } from "dotenv";
import type {
  SetlistEntry,
  ShowSetlist,
  TrackAnalysis,
  OverlayEntry,
  SectionBoundary,
} from "../src/data/types";
import { OVERLAY_REGISTRY } from "../src/data/overlay-registry";
import { getShowSeed } from "../src/data/ShowContext";

const ROOT = resolve(import.meta.dirname, "..");
const MONOREPO_ROOT = resolve(ROOT, "..", "..");

// Load .env from package dir, then monorepo root as fallback
config({ path: join(ROOT, ".env") });
config({ path: join(MONOREPO_ROOT, ".env") });

const DATA_DIR = join(ROOT, "data");

const args = process.argv.slice(2);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");
const singleSongFlag = args.find((a) => a.startsWith("--song"));
const singleSong = singleSongFlag
  ? args[args.indexOf(singleSongFlag) + 1] ?? singleSongFlag.split("=")[1]
  : null;

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY && !dryRun) {
  console.error("ERROR: ANTHROPIC_API_KEY not set. Use --dry-run to preview prompts.");
  process.exit(1);
}

// ─── Load data files ───

const setlist = JSON.parse(
  readFileSync(join(DATA_DIR, "setlist.json"), "utf-8"),
) as ShowSetlist;

const songStats: Record<string, {
  title: string;
  timesPlayed: number | null;
  firstPlayed: string;
  lastPlayed: string;
  notable: string;
}> = JSON.parse(readFileSync(join(DATA_DIR, "song-stats.json"), "utf-8")).songs;

const showContext: {
  date: string;
  venue: string;
  chapters: Array<{
    before?: string;
    after?: string;
    text: string;
    stats?: Record<string, unknown>;
  }>;
} = JSON.parse(readFileSync(join(DATA_DIR, "show-context.json"), "utf-8"));

const lyricTriggers: {
  triggers: Array<{
    id: string;
    phrase: string;
    song: string;
    image_prompt: string;
  }>;
} = JSON.parse(readFileSync(join(DATA_DIR, "lyric-triggers.json"), "utf-8"));

// ─── Load existing schedule (for --resume behavior) ───

interface OverlayScheduleEntry {
  title: string;
  activeOverlays: string[];
  reasoning: string;
  totalCount: number;
}

interface OverlayScheduleFile {
  generatedAt: string;
  model: string;
  songs: Record<string, OverlayScheduleEntry>;
}

const schedulePath = join(DATA_DIR, "overlay-schedule.json");
let existingSchedule: OverlayScheduleFile | null = null;
if (existsSync(schedulePath) && !force) {
  try {
    existingSchedule = JSON.parse(readFileSync(schedulePath, "utf-8"));
  } catch {
    existingSchedule = null;
  }
}

// ─── Analysis file discovery ───

function findAnalysisFile(song: SetlistEntry): string | null {
  const candidates = [
    join(DATA_DIR, `${song.trackId}-analysis.json`),
    join(DATA_DIR, "tracks", `${song.trackId}-analysis.json`),
    ...(song.trackId === "s2t08"
      ? [join(DATA_DIR, "morning-dew-analysis.json")]
      : []),
    join(DATA_DIR, song.audioFile.replace(/\.mp3$/, "-analysis.json")),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

function summarizeAnalysis(analysis: TrackAnalysis): string {
  const { meta, frames } = analysis;
  const n = frames.length;
  if (n === 0) return "No audio data available.";

  let sumRms = 0;
  let peakRms = 0;
  for (const f of frames) {
    sumRms += f.rms;
    if (f.rms > peakRms) peakRms = f.rms;
  }
  const avgEnergy = sumRms / n;

  // Describe energy arc from sections
  const sections = meta.sections ?? [];
  const arcParts = sections.map(
    (s: SectionBoundary) =>
      `${s.energy} (${((s.frameEnd - s.frameStart) / 30).toFixed(0)}s)`,
  );

  return [
    `Duration: ${(meta.duration / 60).toFixed(1)} min`,
    `Tempo: ~${meta.tempo} BPM`,
    `Avg energy: ${avgEnergy.toFixed(3)}, Peak: ${peakRms.toFixed(3)}`,
    `Sections (${sections.length}): ${arcParts.join(" → ")}`,
  ].join("\n");
}

// ─── Build system prompt with full registry ───

function buildSystemPrompt(): string {
  const registryLines = OVERLAY_REGISTRY.map(
    (e: OverlayEntry) =>
      `${e.name} | L${e.layer} ${e.category} | ${e.tags.join(",")} | energy:${e.energyBand} | weight:${e.weight}${e.alwaysActive ? " | ALWAYS_ACTIVE" : ""}`,
  );

  return `You are a visual curator for a Grateful Dead concert visualizer.

You select overlays (animated visual components) that play on top of audio-reactive backgrounds during each song. The goal is to match each song's unique themes, emotional character, energy arc, and Dead cultural significance.

FULL OVERLAY REGISTRY (${OVERLAY_REGISTRY.length} entries):
Format: Name | Layer Category | Tags | EnergyBand | Weight

${registryLines.join("\n")}

LAYER KEY:
L1=Atmospheric backgrounds, L2=Sacred/center geometry, L3=Song-reactive effects,
L4=Geometric/physics, L5=Nature/cosmic, L6=Character parades, L7=Frame/info artifacts,
L8=Typography, L9=HUD elements, L10=Distortion/film treatment

ENERGY BANDS: low=quiet/contemplative, mid=moderate/grooving, high=peak/climax, any=all

ALWAYS-ACTIVE overlays (ConcertInfo, SongTitle, FilmGrain) are auto-included — do NOT list them.

RULES:
1. Select 12-18 overlays per song (the rotation engine cycles through them)
2. Match the song's THEMES — lyrics, imagery, Dead lore, emotional character
3. Match the ENERGY ARC — include low-energy overlays for quiet parts AND high-energy for peaks
4. Cover layers: at least 1 atmospheric (L1), 1 sacred/geometric (L2-4), 1 nature (L5), 1 character (L6)
5. Include Dead-culture elements that fit THIS song specifically
6. When told recent overlays from prior songs, avoid >30% overlap with any single prior song
7. Favor overlays the recent songs DIDN'T use (variety across the show)
8. Weight matters: weight-3 overlays are visually dominant (use sparingly), weight-1 are subtle

Return ONLY valid JSON (no markdown fences):
{"overlays": ["Name1", "Name2", ...], "reasoning": "2-3 sentence explanation"}`;
}

// ─── Build per-song prompt ───

function buildSongPrompt(
  song: SetlistEntry,
  analysis: TrackAnalysis | null,
  recentOverlays: string[][],
  songIndex: number,
): string {
  const stats = songStats[song.trackId];
  const context = showContext.chapters.find(
    (c) => c.after === song.trackId || c.before === song.trackId,
  );
  const triggers = lyricTriggers.triggers.filter(
    (t) => t.song === song.title,
  );

  // Find previous and next song for segue context
  const prevSong =
    songIndex > 0 ? setlist.songs[songIndex - 1] : null;
  const nextSong =
    songIndex < setlist.songs.length - 1
      ? setlist.songs[songIndex + 1]
      : null;

  const lines: string[] = [
    `SONG: "${song.title}" (Set ${song.set}, Track ${song.trackNumber})`,
  ];

  if (context) {
    lines.push(`SHOW NARRATIVE: ${context.text}`);
  }

  if (stats) {
    lines.push(
      `NOTABLE: ${stats.notable}`,
      `STATS: Played ${stats.timesPlayed ?? "unknown"} times, debuted ${stats.firstPlayed}`,
    );
  }

  lines.push(`PALETTE: primary ${song.palette?.primary ?? 0}°, secondary ${song.palette?.secondary ?? 180}°`);

  if (analysis) {
    lines.push(`AUDIO ANALYSIS:\n${summarizeAnalysis(analysis)}`);
  }

  if (triggers.length > 0) {
    const triggerDescs = triggers
      .map((t) => `"${t.phrase}" → ${t.image_prompt.slice(0, 120)}...`)
      .join("\n  ");
    lines.push(`LYRIC TRIGGERS:\n  ${triggerDescs}`);
  }

  // Segue context
  const segueInfo: string[] = [];
  if (prevSong?.segueInto) {
    segueInfo.push(`Segue FROM: "${prevSong.title}"`);
  }
  if (song.segueInto && nextSong) {
    segueInfo.push(`Segue INTO: "${nextSong.title}" (sacred segue — maintain visual continuity)`);
  }
  if (segueInfo.length > 0) {
    lines.push(segueInfo.join("\n"));
  }

  // Recent overlays for variety enforcement
  if (recentOverlays.length > 0) {
    const recent = recentOverlays
      .map((overlays, i) => `  Song N-${i + 1}: ${overlays.slice(0, 8).join(", ")}...`)
      .join("\n");
    lines.push(`RECENT OVERLAYS (avoid >30% overlap with any):\n${recent}`);
  }

  lines.push(
    "",
    "Select 12-18 overlays for this song. Return JSON only.",
  );

  return lines.join("\n");
}

// ─── Claude API call ───

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ overlays: string[]; reasoning: string }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";

  // Parse JSON from response (handle possible markdown fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Failed to parse JSON from Claude response: ${text.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    overlays: string[];
    reasoning: string;
  };

  // Validate overlay names against registry
  const validNames = new Set(OVERLAY_REGISTRY.map((e) => e.name));
  const alwaysActive = new Set(["ConcertInfo", "SongTitle", "FilmGrain"]);
  parsed.overlays = parsed.overlays.filter((name) => {
    if (alwaysActive.has(name)) return false; // auto-included, don't duplicate
    if (!validNames.has(name)) {
      console.warn(`  WARNING: "${name}" not in registry — skipped`);
      return false;
    }
    return true;
  });

  return parsed;
}

// ─── Main ───

async function main() {
  const systemPrompt = buildSystemPrompt();

  console.log("Intelligent Overlay Profile Generator");
  console.log(`  ${setlist.songs.length} songs in setlist`);
  console.log(`  ${OVERLAY_REGISTRY.length} overlays in registry`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (singleSong) console.log(`  Single song: ${singleSong}`);
  if (force) console.log(`  Force regenerate: yes`);
  console.log();

  const schedule: OverlayScheduleFile = {
    generatedAt: new Date().toISOString(),
    model: "claude-sonnet-4-5",
    songs: {},
  };

  // Carry forward existing entries when doing single-song updates
  if (existingSchedule && singleSong) {
    schedule.songs = { ...existingSchedule.songs };
  }

  const recentOverlays: string[][] = []; // sliding window of last 4 songs' overlays
  const songsToProcess = singleSong
    ? setlist.songs.filter((s) => s.trackId === singleSong)
    : setlist.songs;

  if (songsToProcess.length === 0) {
    console.error(`No songs found${singleSong ? ` matching "${singleSong}"` : ""}`);
    process.exit(1);
  }

  for (let i = 0; i < setlist.songs.length; i++) {
    const song = setlist.songs[i];

    // Skip songs not in our processing list
    if (singleSong && song.trackId !== singleSong) {
      // Still track recent overlays for variety context
      const existing = existingSchedule?.songs[song.trackId];
      if (existing) {
        recentOverlays.unshift(existing.activeOverlays);
        if (recentOverlays.length > 4) recentOverlays.pop();
      }
      continue;
    }

    // Resume: skip if already exists and not forcing
    if (!force && existingSchedule?.songs[song.trackId]?.reasoning) {
      console.log(`  SKIP ${song.trackId} "${song.title}" — already profiled`);
      schedule.songs[song.trackId] = existingSchedule.songs[song.trackId];
      recentOverlays.unshift(existingSchedule.songs[song.trackId].activeOverlays);
      if (recentOverlays.length > 4) recentOverlays.pop();
      continue;
    }

    // Load analysis
    const analysisPath = findAnalysisFile(song);
    let analysis: TrackAnalysis | null = null;
    if (analysisPath) {
      analysis = JSON.parse(readFileSync(analysisPath, "utf-8")) as TrackAnalysis;
    }

    const userPrompt = buildSongPrompt(song, analysis, recentOverlays, i);

    if (dryRun) {
      console.log(`\n═══ ${song.trackId} "${song.title}" ═══`);
      console.log(userPrompt);
      console.log("─".repeat(60));
      continue;
    }

    console.log(`  ${song.trackId} "${song.title}" — calling Claude...`);

    try {
      const result = await callClaude(systemPrompt, userPrompt);

      schedule.songs[song.trackId] = {
        title: song.title,
        activeOverlays: result.overlays,
        reasoning: result.reasoning,
        totalCount: result.overlays.length,
      };

      console.log(
        `    → ${result.overlays.length} overlays: ${result.overlays.slice(0, 6).join(", ")}...`,
      );
      console.log(`    → ${result.reasoning.slice(0, 100)}...`);

      recentOverlays.unshift(result.overlays);
      if (recentOverlays.length > 4) recentOverlays.pop();

      // Rate limiting: small delay between calls
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`    ERROR: ${err instanceof Error ? err.message : err}`);
      // Carry forward existing entry if available
      if (existingSchedule?.songs[song.trackId]) {
        schedule.songs[song.trackId] = existingSchedule.songs[song.trackId];
      }
    }
  }

  if (dryRun) {
    console.log("\nDry run complete — no files written.");
    return;
  }

  // Write output
  writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));

  console.log();
  console.log(`Written: ${schedulePath}`);
  console.log(`  Songs profiled: ${Object.keys(schedule.songs).length}`);

  // Variety check
  const songIds = Object.keys(schedule.songs);
  let maxOverlap = 0;
  let maxOverlapPair = "";
  for (let a = 0; a < songIds.length - 1; a++) {
    const setA = new Set(schedule.songs[songIds[a]].activeOverlays);
    const setB = new Set(schedule.songs[songIds[a + 1]].activeOverlays);
    let overlap = 0;
    for (const name of setA) {
      if (setB.has(name)) overlap++;
    }
    const pct = overlap / Math.max(setA.size, setB.size);
    if (pct > maxOverlap) {
      maxOverlap = pct;
      maxOverlapPair = `${songIds[a]} ↔ ${songIds[a + 1]}`;
    }
  }

  console.log(
    `  Max consecutive overlap: ${(maxOverlap * 100).toFixed(0)}% (${maxOverlapPair})`,
  );
  if (maxOverlap > 0.3) {
    console.warn(
      `  WARNING: Overlap exceeds 30% target — consider re-running with --force`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
