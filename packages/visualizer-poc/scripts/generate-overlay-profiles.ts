#!/usr/bin/env npx tsx
/**
 * Generate Overlay Profiles — Claude-powered per-song overlay curation.
 *
 * Gathers rich per-song context (Dead lore, audio analysis, lyric triggers,
 * show narrative) and asks Claude to curate overlays per song from
 * the full 379-overlay registry. Each song gets a unique palette matched
 * to its themes, energy arc, and cultural meaning.
 *
 * Features:
 *   - Duration-scaled overlay count (8-12 short, 12-16 mid, 14-18 long)
 *   - Per-overlay energy phase hints (low/mid/high)
 *   - Segue visual continuity enforcement (shared overlays across segue pairs)
 *   - Post-processing overlap enforcement (max 30% between consecutive songs)
 *   - Strict name validation (no hallucinated overlay names)
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
  OverlayPhaseHint,
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
  energyHints?: Record<string, OverlayPhaseHint>;
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

// ─── Valid overlay name set (for validation) ───

const VALID_NAMES = new Set(OVERLAY_REGISTRY.map((e) => e.name));
const ALWAYS_ACTIVE_NAMES = new Set(["ConcertInfo", "SongTitle", "FilmGrain", "SetlistScroll"]);

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

/** Get song duration in minutes from analysis or audio file */
function getSongDuration(song: SetlistEntry, analysis: TrackAnalysis | null): number {
  if (analysis) return analysis.meta.duration / 60;
  // Fallback: estimate from frame count if available
  return 5; // default 5 min if unknown
}

/** Get overlay count range based on song duration */
function getOverlayCountRange(durationMin: number): { min: number; max: number; label: string } {
  if (durationMin < 4) return { min: 8, max: 12, label: "short song (<4 min)" };
  if (durationMin < 8) return { min: 12, max: 16, label: "mid-length song (4-8 min)" };
  return { min: 14, max: 18, label: "extended jam (8+ min)" };
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

ALWAYS-ACTIVE overlays (ConcertInfo, SongTitle, FilmGrain, SetlistScroll) are auto-included — do NOT list them.

CRITICAL — NAME ACCURACY:
You MUST use EXACT overlay names from the registry above. Do NOT invent names.
Common mistakes to avoid:
- "FlowerOfLife" does not exist → use "SacredPattern_FlowerOfLife"
- "VesicaPiscis" does not exist → use "SacredPattern_VesicaPiscis"
- "TorusKnot" does not exist → use "SacredPattern_TorusKnot"
- "Mandala" does not exist → use "SacredPattern_Mandala" or "MandalaGenerator"
- "CrowdSway" does not exist → use "CrowdEnergy_CrowdSway"
Parametric overlays use Prefix_Suffix format. Always include the full prefix.

RULES:
1. Select the number of overlays specified in the OVERLAY COUNT instruction below
2. Match the song's THEMES — lyrics, imagery, Dead lore, emotional character
3. Match the ENERGY ARC — include low-energy overlays for quiet parts AND high-energy for peaks
4. Cover layers: at least 1 atmospheric (L1), 1 sacred/geometric (L2-4), 1 nature (L5), 1 character (L6)
5. Include Dead-culture elements that fit THIS song specifically
6. When told recent overlays from prior songs, avoid >30% overlap with any single prior song
7. Favor overlays the recent songs DIDN'T use (variety across the show)
8. Weight matters: weight-3 overlays are visually dominant (use sparingly), weight-1 are subtle
9. For each overlay, annotate which energy phase it best suits (low/mid/high)

Return ONLY valid JSON (no markdown fences):
{"overlays": [{"name": "OverlayName", "phase": "low"}, ...], "reasoning": "2-3 sentence explanation"}

The "phase" field tells the rotation engine when to prefer this overlay:
- "low" = quiet/contemplative passages only
- "mid" = moderate groove sections
- "high" = peak/climax moments only
Choose the phase that best matches THIS overlay's role in THIS song's arc.`;
}

// ─── Build per-song prompt ───

function buildSongPrompt(
  song: SetlistEntry,
  analysis: TrackAnalysis | null,
  recentOverlays: string[][],
  songIndex: number,
  segueSharedOverlays?: string[],
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

  // Duration-based overlay count
  const durationMin = getSongDuration(song, analysis);
  const countRange = getOverlayCountRange(durationMin);

  const lines: string[] = [
    `SONG: "${song.title}" (Set ${song.set}, Track ${song.trackNumber})`,
    `DURATION: ${durationMin.toFixed(1)} min`,
    `OVERLAY COUNT: Select ${countRange.min}-${countRange.max} overlays (${countRange.label})`,
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

  // Segue context with continuity enforcement
  const segueInfo: string[] = [];
  if (prevSong?.segueInto) {
    segueInfo.push(`Segue FROM: "${prevSong.title}"`);
    if (segueSharedOverlays && segueSharedOverlays.length > 0) {
      segueInfo.push(
        `SEGUE CONTINUITY: You MUST include these ${segueSharedOverlays.length} overlays from "${prevSong.title}" to maintain visual flow through the segue: ${segueSharedOverlays.join(", ")}`,
      );
    }
  }
  if (song.segueInto && nextSong) {
    segueInfo.push(`Segue INTO: "${nextSong.title}" (sacred segue — pick 2-3 overlays that would also suit "${nextSong.title}" for visual continuity)`);
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
    `Select ${countRange.min}-${countRange.max} overlays for this song. Return JSON only. Use EXACT names from the registry.`,
  );

  return lines.join("\n");
}

// ─── Claude API call ───

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ overlays: string[]; reasoning: string; energyHints: Record<string, OverlayPhaseHint> }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1536,
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
    overlays: Array<string | { name: string; phase?: string }>;
    reasoning: string;
  };

  // Normalize overlays — support both old ["Name"] and new [{name, phase}] formats
  const rejectedNames: string[] = [];
  const validOverlays: string[] = [];
  const energyHints: Record<string, OverlayPhaseHint> = {};

  for (const item of parsed.overlays) {
    const name = typeof item === "string" ? item : item.name;
    const phase = typeof item === "object" ? item.phase : undefined;

    if (ALWAYS_ACTIVE_NAMES.has(name)) continue; // auto-included, don't duplicate
    if (!VALID_NAMES.has(name)) {
      rejectedNames.push(name);
      console.warn(`  WARNING: "${name}" not in registry — skipped`);
      continue;
    }

    validOverlays.push(name);
    if (phase && (phase === "low" || phase === "mid" || phase === "high")) {
      energyHints[name] = phase;
    }
  }

  // Clean reasoning text: remove references to rejected overlay names
  let reasoning = parsed.reasoning;
  for (const rejected of rejectedNames) {
    // Remove the rejected name and surrounding punctuation/formatting
    reasoning = reasoning.replace(new RegExp(`\\b${escapeRegex(rejected)}\\b[,;]?\\s*`, "g"), "");
  }
  // Clean up artifacts from removal (double commas, trailing commas before parens)
  reasoning = reasoning.replace(/,\s*,/g, ",").replace(/,\s*\)/g, ")").replace(/\(\s*,/g, "(");

  return { overlays: validOverlays, reasoning, energyHints };
}

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Post-processing: overlap enforcement ───

/**
 * Detect consecutive song pairs with >30% overlay overlap and resolve
 * by swapping shared overlays in the later song for alternatives.
 */
function enforceOverlapLimit(
  schedule: OverlayScheduleFile,
  songOrder: string[],
  maxOverlapPct: number = 0.30,
): number {
  let swapsTotal = 0;

  for (let i = 0; i < songOrder.length - 1; i++) {
    const idA = songOrder[i];
    const idB = songOrder[i + 1];
    const entryA = schedule.songs[idA];
    const entryB = schedule.songs[idB];
    if (!entryA || !entryB) continue;

    const setA = new Set(entryA.activeOverlays);
    const setB = new Set(entryB.activeOverlays);
    const shared = entryB.activeOverlays.filter((name) => setA.has(name));
    const maxSize = Math.max(setA.size, setB.size);
    const overlapPct = shared.length / maxSize;

    if (overlapPct <= maxOverlapPct) continue;

    // How many overlays to swap out from song B
    const targetShared = Math.floor(maxOverlapPct * maxSize);
    const swapCount = shared.length - targetShared;
    if (swapCount <= 0) continue;

    console.log(`  OVERLAP FIX: ${idA} ↔ ${idB} = ${(overlapPct * 100).toFixed(0)}% → swapping ${swapCount} overlays`);

    // Find alternatives: overlays in the registry that are NOT in song A or B
    const usedByBoth = new Set([...entryA.activeOverlays, ...entryB.activeOverlays]);
    const alternatives = OVERLAY_REGISTRY.filter(
      (e) => !usedByBoth.has(e.name) && !e.alwaysActive && !ALWAYS_ACTIVE_NAMES.has(e.name),
    );

    // Score alternatives by matching the category/energyBand of the overlay being replaced
    const toSwap = shared.slice(0, swapCount); // swap the first N shared overlays
    for (const swapName of toSwap) {
      const swapEntry = OVERLAY_REGISTRY.find((e) => e.name === swapName);
      if (!swapEntry) continue;

      // Find best alternative: same category preferred, then same energy band
      const scored = alternatives
        .filter((alt) => !entryB.activeOverlays.includes(alt.name))
        .map((alt) => {
          let score = 0;
          if (alt.category === swapEntry.category) score += 2;
          if (alt.energyBand === swapEntry.energyBand) score += 1;
          if (alt.layer === swapEntry.layer) score += 0.5;
          return { alt, score };
        })
        .sort((a, b) => b.score - a.score);

      if (scored.length === 0) continue;

      const replacement = scored[0].alt;
      const idx = entryB.activeOverlays.indexOf(swapName);
      if (idx !== -1) {
        entryB.activeOverlays[idx] = replacement.name;
        // Update energy hints if present
        if (entryB.energyHints?.[swapName]) {
          const hint = entryB.energyHints[swapName];
          delete entryB.energyHints[swapName];
          entryB.energyHints[replacement.name] = hint;
        }
        usedByBoth.add(replacement.name); // prevent reuse
        swapsTotal++;
        console.log(`    ${swapName} → ${replacement.name} (${replacement.category})`);
      }
    }
  }

  return swapsTotal;
}

// ─── Segue continuity: pick shared overlays ───

/**
 * Given a song that segues into the next, pick 2-3 overlays that would work
 * for both songs. These are passed as constraints to the next song's prompt.
 */
function pickSegueOverlays(
  prevSongEntry: OverlayScheduleEntry,
): string[] {
  // Pick overlays from the previous song that are versatile (energy "any" or "mid")
  // and atmospheric/sacred (layers 1-2) — these transition well across songs
  const candidates = prevSongEntry.activeOverlays
    .map((name) => OVERLAY_REGISTRY.find((e) => e.name === name))
    .filter((e): e is OverlayEntry => !!e)
    .filter((e) => e.energyBand === "any" || e.energyBand === "mid" || e.layer <= 2)
    .sort((a, b) => a.layer - b.layer); // prefer lower layers (atmospheric)

  // Pick 2-3 (prefer 2 for variety, 3 if the song has many overlays)
  const count = Math.min(prevSongEntry.activeOverlays.length > 15 ? 3 : 2, candidates.length);
  return candidates.slice(0, count).map((e) => e.name);
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

    // Segue continuity: if the previous song segues into this one,
    // pick 2-3 shared overlays to maintain visual flow
    const prevSong = i > 0 ? setlist.songs[i - 1] : null;
    let segueSharedOverlays: string[] | undefined;
    if (prevSong?.segueInto) {
      const prevEntry = schedule.songs[prevSong.trackId] ?? existingSchedule?.songs[prevSong.trackId];
      if (prevEntry) {
        segueSharedOverlays = pickSegueOverlays(prevEntry);
        if (segueSharedOverlays.length > 0) {
          console.log(`    Segue from "${prevSong.title}": carrying ${segueSharedOverlays.join(", ")}`);
        }
      }
    }

    const userPrompt = buildSongPrompt(song, analysis, recentOverlays, i, segueSharedOverlays);

    if (dryRun) {
      console.log(`\n═══ ${song.trackId} "${song.title}" ═══`);
      console.log(userPrompt);
      console.log("─".repeat(60));
      continue;
    }

    console.log(`  ${song.trackId} "${song.title}" — calling Claude...`);

    try {
      const result = await callClaude(systemPrompt, userPrompt);

      // Ensure segue overlays are included even if Claude missed them
      if (segueSharedOverlays) {
        for (const name of segueSharedOverlays) {
          if (!result.overlays.includes(name) && VALID_NAMES.has(name)) {
            result.overlays.push(name);
            // Default phase for segue carry-overs: mid (versatile)
            result.energyHints[name] = "mid";
          }
        }
      }

      schedule.songs[song.trackId] = {
        title: song.title,
        activeOverlays: result.overlays,
        reasoning: result.reasoning,
        totalCount: result.overlays.length,
        energyHints: Object.keys(result.energyHints).length > 0 ? result.energyHints : undefined,
      };

      console.log(
        `    → ${result.overlays.length} overlays: ${result.overlays.slice(0, 6).join(", ")}...`,
      );
      console.log(`    → ${result.reasoning.slice(0, 100)}...`);
      if (Object.keys(result.energyHints).length > 0) {
        const lowCount = Object.values(result.energyHints).filter((h) => h === "low").length;
        const midCount = Object.values(result.energyHints).filter((h) => h === "mid").length;
        const highCount = Object.values(result.energyHints).filter((h) => h === "high").length;
        console.log(`    → Phase hints: ${lowCount} low, ${midCount} mid, ${highCount} high`);
      }

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

  // ─── Post-processing: enforce overlap limits ───
  const songOrder = setlist.songs.map((s) => s.trackId).filter((id) => schedule.songs[id]);
  console.log("\n─── Post-processing: overlap enforcement ───");
  const swaps = enforceOverlapLimit(schedule, songOrder);
  if (swaps > 0) {
    console.log(`  ${swaps} overlays swapped to enforce 30% limit`);
    // Update totalCount after swaps
    for (const id of songOrder) {
      if (schedule.songs[id]) {
        schedule.songs[id].totalCount = schedule.songs[id].activeOverlays.length;
      }
    }
  } else {
    console.log("  All consecutive pairs within 30% — no swaps needed");
  }

  // Write output
  writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));

  console.log();
  console.log(`Written: ${schedulePath}`);
  console.log(`  Songs profiled: ${Object.keys(schedule.songs).length}`);

  // Final variety check
  let maxOverlap = 0;
  let maxOverlapPair = "";
  for (let a = 0; a < songOrder.length - 1; a++) {
    const setA = new Set(schedule.songs[songOrder[a]].activeOverlays);
    const setB = new Set(schedule.songs[songOrder[a + 1]].activeOverlays);
    let overlap = 0;
    for (const name of setA) {
      if (setB.has(name)) overlap++;
    }
    const pct = overlap / Math.max(setA.size, setB.size);
    if (pct > maxOverlap) {
      maxOverlap = pct;
      maxOverlapPair = `${songOrder[a]} ↔ ${songOrder[a + 1]}`;
    }
  }

  console.log(
    `  Max consecutive overlap: ${(maxOverlap * 100).toFixed(0)}% (${maxOverlapPair})`,
  );
  if (maxOverlap > 0.3) {
    console.warn(
      `  WARNING: Overlap still exceeds 30% after enforcement — may need manual review`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
