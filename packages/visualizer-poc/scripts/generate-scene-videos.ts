#!/usr/bin/env npx tsx
/**
 * generate-scene-videos.ts — Generate section-aware video clips for each song.
 *
 * Two-tier strategy:
 *   - Grok Imagine ($0.75/15s, 720p) — Song-specific hero videos (3-4 per song),
 *     each tagged to a different energy phase (low/mid/high) of the song's arc.
 *   - Minimax Hailuo 02 ($0.10-0.50/10s, 768p) — General atmospheric videos
 *     (psychedelic, nature, cosmic) reusable across all songs.
 *
 * Claude generates thematically diverse prompts per song, using audio analysis
 * sections and lyric context to match each video to a moment in the energy arc.
 *
 * Usage:
 *   npx tsx scripts/generate-scene-videos.ts                    # all songs
 *   npx tsx scripts/generate-scene-videos.ts --dry-run           # show prompts, no API calls
 *   npx tsx scripts/generate-scene-videos.ts --song=s2t08        # single song
 *   npx tsx scripts/generate-scene-videos.ts --force             # regenerate existing
 *   npx tsx scripts/generate-scene-videos.ts --general-only      # general atmospheric only
 *
 * Requires: ANTHROPIC_API_KEY, XAI_API_KEY, REPLICATE_API_TOKEN in .env
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream, statSync, copyFileSync, unlinkSync } from "fs";
import { join, resolve } from "path";
import { config } from "dotenv";
import crypto from "crypto";
import https from "https";
import http from "http";

const ROOT = resolve(import.meta.dirname, "..");
const MONOREPO_ROOT = resolve(ROOT, "..", "..");

// Load .env from package dir, then monorepo root
config({ path: join(ROOT, ".env") });
config({ path: join(MONOREPO_ROOT, ".env") });

const DATA_DIR = join(ROOT, "data");
const SETLIST_PATH = join(DATA_DIR, "setlist.json");
const CATALOG_PATH = join(DATA_DIR, "image-library.json");
const LIBRARY_DIR = join(ROOT, "public", "assets", "library");
const VIDEO_DIR = join(LIBRARY_DIR, "videos");

// ─── CLI args ───

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const generalOnly = args.includes("--general-only");
const songFilter = args.find((a) => a.startsWith("--song="))?.split("=")[1];

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

if (!dryRun) {
  if (!ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set.");
    process.exit(1);
  }
  if (!XAI_API_KEY && !generalOnly) {
    console.error("ERROR: XAI_API_KEY not set (needed for Grok Imagine). Use --general-only to skip song videos.");
    process.exit(1);
  }
  if (!REPLICATE_API_TOKEN) {
    console.error("ERROR: REPLICATE_API_TOKEN not set (needed for Hailuo 02).");
    process.exit(1);
  }
}

// ─── Types ───

interface SetlistSong {
  trackId: string;
  title: string;
  set: number;
  trackNumber: number;
  audioFile: string;
  palette?: { primary: number; secondary: number };
  segueInto?: boolean;
}

interface SectionBoundary {
  frameStart: number;
  frameEnd: number;
  label: string;
  energy: "low" | "mid" | "high";
  avgEnergy: number;
}

interface TrackMeta {
  source: string;
  duration: number;
  fps: number;
  totalFrames: number;
  tempo: number;
  sections: SectionBoundary[];
}

interface VideoPrompt {
  prompt: string;
  energy: "low" | "mid" | "high";
  moment: string;
  model: "grok" | "hailuo";
}

interface AssetEntry {
  id: string;
  path: string;
  originalFile: string;
  type: "image" | "video";
  song: string;
  songKey: string;
  category?: "song" | "general";
  sourceShow?: string;
  tags: string[];
  sizeBytes: number;
  addedAt: string;
  model?: string;
  prompt?: string;
}

interface ImageLibrary {
  version: 1;
  assets: AssetEntry[];
}

// ─── Helpers ───

function normalizeSongKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

function fileHash(filePath: string): string {
  const buf = readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function loadCatalog(): ImageLibrary {
  if (existsSync(CATALOG_PATH)) {
    return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  }
  return { version: 1, assets: [] };
}

function saveCatalog(catalog: ImageLibrary): void {
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const get = url.startsWith("https") ? https.get : http.get;
    get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) return reject(new Error("Redirect with no location"));
        file.close();
        return download(redirectUrl, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      file.close();
      reject(err);
    });
  });
}

function findAnalysisFile(trackId: string): string | null {
  const candidates = [
    join(DATA_DIR, "tracks", `${trackId}-analysis.json`),
    join(DATA_DIR, `${trackId}-analysis.json`),
    ...(trackId === "s2t08" ? [join(DATA_DIR, "morning-dew-analysis.json")] : []),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

function loadAnalysisMeta(trackId: string): TrackMeta | null {
  const path = findAnalysisFile(trackId);
  if (!path) return null;
  // Stream-read only the meta section to avoid loading huge frame arrays
  const raw = readFileSync(path, "utf8");
  const metaEnd = raw.indexOf('"frames"');
  if (metaEnd === -1) return null;
  // Extract just the meta object
  const metaStr = raw.slice(0, metaEnd).replace(/,\s*$/, "") + "}";
  try {
    const parsed = JSON.parse(metaStr);
    return parsed.meta;
  } catch {
    // Fallback: parse full file (expensive but correct)
    try {
      const full = JSON.parse(raw);
      return full.meta;
    } catch {
      return null;
    }
  }
}

/** Count how many scene-video entries exist for a song in the catalog */
function countSceneVideos(catalog: ImageLibrary, songKey: string): number {
  return catalog.assets.filter(
    (a) =>
      a.type === "video" &&
      a.songKey === songKey &&
      a.tags.includes("scene-video"),
  ).length;
}

// ─── Claude prompt generation ───

function summarizeSections(sections: SectionBoundary[]): string {
  return sections
    .map(
      (s) =>
        `${s.energy} (${((s.frameEnd - s.frameStart) / 30).toFixed(0)}s, avgE=${s.avgEnergy.toFixed(2)})`,
    )
    .join(" → ");
}

function buildSystemPrompt(): string {
  return `You are a psychedelic visual artist creating trippy, non-realistic video clips for a Grateful Dead concert visualizer. Your work will be projected behind the band — it must look like a 1960s-70s liquid light show, NOT a nature documentary.

For each song you receive, generate 3-4 video prompts — each matched to a different energy phase of the song's arc (quiet intro → build → climax → wind-down).

CRITICAL AESTHETIC RULE: NOTHING should look realistic or photographic. Every clip must feel like a hallucination, a blacklight poster come to life, or oil swirling on a hot plate under a projector. If it could appear on Planet Earth, it's WRONG.

CRITICAL RULES:
1. Each video MUST depict a DIFFERENT visual approach. Choose from: liquid light/oil projections, psychedelic poster art, Dead iconography (skulls/bears/roses/lightning), cosmic/nebula abstractions, organic morphing forms, tie-dye/marbled ink patterns. NEVER two of the same.
2. Colors must be ELECTRIC and OVERSATURATED — hot pinks, acid greens, electric purples, molten golds, cosmic blues. Never muted or earth-toned.
3. Each prompt should be 1-2 sentences emphasizing MOVEMENT: swirling, morphing, breathing, melting, bleeding, pulsing. Nothing static.
4. Match the emotional intensity to the energy tag: "low" = slow oil-lamp swirls and gentle color bleeding, "mid" = building organic motion and brightening saturation, "high" = explosive color eruptions and rapid morphing.
5. Draw thematic inspiration from the song's lyrics and Dead lore. Weave in Steal Your Face skulls, dancing bears, skeleton roses, thirteen-point bolts, terrapins — but abstractly, melting into the composition.
6. Avoid cliches: no generic "kaleidoscope fractal" or "tunnel of light" — be specific and inventive. Think Stanley Mouse and Rick Griffin poster art in motion.
7. NO text, NO faces, NO recognizable people, NO photographs of real places.
8. End every prompt with: "psychedelic art, liquid light show style"

Return ONLY valid JSON (no markdown fences):
{
  "videos": [
    {"prompt": "...", "energy": "low", "moment": "brief description of where this fits"},
    {"prompt": "...", "energy": "mid", "moment": "..."},
    {"prompt": "...", "energy": "high", "moment": "..."}
  ]
}

Generate 3 videos for songs under 5 minutes, 4 for songs 5+ minutes.`;
}

function buildSongPrompt(
  song: SetlistSong,
  meta: TrackMeta | null,
  lyricTriggers: string[],
  overlayReasoning: string | null,
): string {
  const lines: string[] = [
    `SONG: "${song.title}" (Set ${song.set})`,
  ];

  if (meta) {
    lines.push(`DURATION: ${(meta.duration / 60).toFixed(1)} minutes`);
    lines.push(`TEMPO: ~${meta.tempo} BPM`);
    lines.push(`ENERGY ARC: ${summarizeSections(meta.sections)}`);
  }

  if (lyricTriggers.length > 0) {
    lines.push(`LYRIC THEMES (already covered by trigger images — create DIFFERENT visuals):`);
    for (const t of lyricTriggers) {
      lines.push(`  - ${t}`);
    }
  }

  if (overlayReasoning) {
    lines.push(`THEMATIC CONTEXT: ${overlayReasoning}`);
  }

  const videoCount = meta && meta.duration >= 300 ? 4 : 3;
  lines.push(`\nGenerate ${videoCount} video prompts for this song. Each MUST use a DIFFERENT visual subject category.`);

  return lines.join("\n");
}

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
): Promise<VideoPrompt[]> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
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

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Failed to parse JSON from Claude response: ${text.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    videos: Array<{ prompt: string; energy: string; moment: string }>;
  };

  return parsed.videos.map((v) => ({
    prompt: v.prompt,
    energy: (v.energy === "low" || v.energy === "mid" || v.energy === "high") ? v.energy : "mid",
    moment: v.moment,
    model: "grok" as const,
  }));
}

// ─── Grok Imagine API ───

async function generateGrokVideo(prompt: string): Promise<string> {
  // Start generation
  const startResponse = await fetch("https://api.x.ai/v1/videos/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "grok-imagine-video",
      prompt,
      duration: 15,
      aspect_ratio: "16:9",
      resolution: "720p",
    }),
  });

  if (!startResponse.ok) {
    const body = await startResponse.text();
    throw new Error(`Grok API error ${startResponse.status}: ${body}`);
  }

  const startData = (await startResponse.json()) as { request_id: string };
  const requestId = startData.request_id;
  console.log(`    Grok request: ${requestId}`);

  // Poll for completion
  const MAX_POLLS = 120; // 10 minutes at 5s interval
  const POLL_INTERVAL = 5000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const pollResponse = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { "Authorization": `Bearer ${XAI_API_KEY}` },
    });

    if (!pollResponse.ok) {
      const body = await pollResponse.text();
      throw new Error(`Grok poll error ${pollResponse.status}: ${body}`);
    }

    const pollData = (await pollResponse.json()) as {
      status: string;
      video?: { url: string };
      error?: string;
    };

    if (pollData.status === "done" && pollData.video?.url) {
      return pollData.video.url;
    }
    if (pollData.status === "failed") {
      throw new Error(`Grok generation failed: ${pollData.error ?? "unknown error"}`);
    }

    if (i % 6 === 5) {
      console.log(`    Still generating... (${((i + 1) * POLL_INTERVAL / 1000).toFixed(0)}s)`);
    }
  }

  throw new Error("Grok generation timed out after 10 minutes");
}

// ─── Hailuo 02 via Replicate ───

async function generateHailuoVideo(prompt: string): Promise<string> {
  const Replicate = (await import("replicate")).default;
  const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

  const output = await replicate.run("minimax/hailuo-02", {
    input: {
      prompt,
      duration: 10,
      resolution: "768p",
    },
  });

  // Extract URL from output
  let raw: unknown = output;
  if (Array.isArray(raw)) raw = raw[0];
  if (typeof raw === "string" && raw.startsWith("http")) return raw;
  if (raw && typeof raw === "object" && "url" in (raw as object)) {
    const u = (raw as { url: unknown }).url;
    if (typeof u === "string") return u;
  }
  // ReadableStream fallback
  if (raw && typeof (raw as any).getReader === "function") {
    const reader = (raw as any).getReader();
    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const result = await reader.read();
      if (result.value) chunks.push(result.value);
      done = result.done;
    }
    const str = Buffer.concat(chunks).toString("utf-8");
    if (str.startsWith("http")) return str;
  }
  if (raw && typeof (raw as any).toString === "function") {
    const s = (raw as any).toString();
    if (s.startsWith("http")) return s;
  }

  throw new Error(`Unexpected Hailuo output: ${typeof raw}`);
}

// ─── Catalog registration ───

function addVideoToCatalog(
  catalog: ImageLibrary,
  filePath: string,
  song: string,
  category: "song" | "general",
  energyTag: "low" | "mid" | "high",
  modelName: string,
  prompt: string,
): boolean {
  const hash = fileHash(filePath);

  if (catalog.assets.some((a) => a.id === hash)) {
    console.log(`    Already in library: ${hash}`);
    return false;
  }

  const songKey = normalizeSongKey(song);
  const ext = ".mp4";
  const libraryFilename = `${songKey}-scene-${energyTag}-${hash}${ext}`;
  const destPath = join(VIDEO_DIR, libraryFilename);

  // Copy to library (may already be there if downloaded directly)
  if (filePath !== destPath) {
    copyFileSync(filePath, destPath);
  }
  const stats = statSync(destPath);

  const durationFrames = modelName === "minimax-hailuo-02" ? 300 : 450;

  const entry: AssetEntry = {
    id: hash,
    path: `assets/library/videos/${libraryFilename}`,
    originalFile: libraryFilename,
    type: "video",
    song,
    songKey,
    category,
    tags: [
      "scene-video",
      "generated",
      `energy-${energyTag}`,
      `duration-${durationFrames}`,
    ],
    sizeBytes: stats.size,
    addedAt: new Date().toISOString(),
    model: modelName,
    prompt,
  };

  catalog.assets.push(entry);
  console.log(`    + Added: ${song} → videos/${libraryFilename} (${(stats.size / 1024 / 1024).toFixed(1)}M) [${energyTag}]`);
  return true;
}

// ─── General atmospheric prompts (Hailuo 02) ───

const GENERAL_PROMPTS: Array<{ prompt: string; energy: "low" | "mid" | "high"; name: string }> = [
  {
    prompt: "Slow swirling liquid light projection, hot oil and dye on glass plate, deep indigo and electric magenta bleeding into molten gold, organic amoeba shapes slowly splitting and merging, blacklight glow, psychedelic art, liquid light show style",
    energy: "low",
    name: "liquid-light-indigo",
  },
  {
    prompt: "Steal Your Face skull emerging from swirling tie-dye cosmos, thirteen-point lightning bolt crackling with electric purple energy, roses growing from eye sockets in time-lapse, art nouveau border of thorned vines, psychedelic art, liquid light show style",
    energy: "mid",
    name: "stealie-cosmic-roses",
  },
  {
    prompt: "Explosive eruption of molten gold and acid green from a central vortex, dancing bear silhouettes tumbling through the maelstrom, hot pink lightning arcs, oil-on-water color interference patterns radiating outward, psychedelic art, liquid light show style",
    energy: "high",
    name: "vortex-bears-eruption",
  },
  {
    prompt: "Overhead projector oil lamp effect, warm amber and deep purple dye pools slowly merging on hot glass, organic cellular shapes dividing and recombining, subtle breathing pulsation, velvet painting depth and glow, psychedelic art, liquid light show style",
    energy: "low",
    name: "oil-lamp-amber-purple",
  },
  {
    prompt: "Skeleton roses blooming in reverse and forward simultaneously, petals made of marbled ink in electric blue and crimson, thorned stems weaving into Grateful Dead lightning bolt patterns, blacklight ultraviolet glow, psychedelic art, liquid light show style",
    energy: "low",
    name: "skeleton-roses-bloom",
  },
  {
    prompt: "Rapid morphing kaleidoscope of Dead iconography — bears dissolving into skulls dissolving into terrapins dissolving into roses, electric oversaturated colors strobing between hot pink and cosmic blue, Rick Griffin poster energy, psychedelic art, liquid light show style",
    energy: "high",
    name: "dead-icon-morph-storm",
  },
  {
    prompt: "Marbled ink bleeding through water, tendrils of electric purple and acid green spiraling into sacred geometry mandalas, organic forms breathing and pulsing with inner light, tie-dye interference patterns, psychedelic art, liquid light show style",
    energy: "mid",
    name: "marbled-ink-mandala",
  },
  {
    prompt: "Terrapin shell spiraling into infinite fractal depth, each chamber glowing with different jewel-tone color — emerald, ruby, sapphire, amber — organic curves and art nouveau linework, warm velvet blacklight glow, psychedelic art, liquid light show style",
    energy: "low",
    name: "terrapin-fractal-jewel",
  },
  {
    prompt: "Supernova of tie-dye color exploding from a central Steal Your Face emblem, concentric rings of molten gold and electric magenta radiating outward, dancing skeleton silhouettes in the shockwave, maximum saturation and energy, psychedelic art, liquid light show style",
    energy: "high",
    name: "stealie-supernova",
  },
  {
    prompt: "Two liquid light streams — warm amber and cool electric blue — slowly spiraling around each other like a DNA helix, organic tendrils reaching between them, oil-on-glass texture with subtle rainbow interference at contact edges, psychedelic art, liquid light show style",
    energy: "mid",
    name: "liquid-helix-merge",
  },
];

// ─── Main ───

async function main() {
  const setlist = JSON.parse(readFileSync(SETLIST_PATH, "utf-8"));
  const songs: SetlistSong[] = setlist.songs;
  const catalog = loadCatalog();

  // Ensure output directory
  mkdirSync(VIDEO_DIR, { recursive: true });

  // Load overlay schedule for thematic context
  let overlaySchedule: Record<string, { reasoning: string }> = {};
  const schedulePath = join(DATA_DIR, "overlay-schedule.json");
  if (existsSync(schedulePath)) {
    try {
      const schedule = JSON.parse(readFileSync(schedulePath, "utf-8"));
      overlaySchedule = schedule.songs ?? {};
    } catch { /* ignore */ }
  }

  // Load lyric triggers for context
  let lyricTriggersData: Array<{ song: string; image_prompt: string }> = [];
  const triggersPath = join(DATA_DIR, "lyric-triggers.json");
  if (existsSync(triggersPath)) {
    try {
      const triggers = JSON.parse(readFileSync(triggersPath, "utf-8"));
      lyricTriggersData = triggers.triggers ?? [];
    } catch { /* ignore */ }
  }

  console.log("\nScene Video Generator");
  console.log("─".repeat(50));
  console.log(`  Songs: ${songs.length}`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (songFilter) console.log(`  Filter: ${songFilter}`);
  if (generalOnly) console.log(`  General atmospheric only`);
  if (force) console.log(`  Force regenerate: yes`);
  console.log();

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let estimatedCost = 0;

  const systemPrompt = buildSystemPrompt();

  // ─── Song-specific videos (Grok Imagine) ───

  if (!generalOnly) {
    console.log("═══ Song-Specific Videos (Grok Imagine) ═══\n");

    const songsToProcess = songFilter
      ? songs.filter((s) => s.trackId === songFilter)
      : songs;

    if (songsToProcess.length === 0 && songFilter) {
      console.error(`No songs matched filter: ${songFilter}`);
      process.exit(1);
    }

    for (const song of songsToProcess) {
      const songKey = normalizeSongKey(song.title);

      // Resume: skip if already has 3+ scene videos
      if (!force && countSceneVideos(catalog, songKey) >= 3) {
        console.log(`  SKIP ${song.trackId} "${song.title}" — already has 3+ scene videos`);
        skipped++;
        continue;
      }

      console.log(`\n  ── ${song.trackId}: ${song.title} ──`);

      // Load audio analysis meta
      const meta = loadAnalysisMeta(song.trackId);
      if (meta) {
        console.log(`    Duration: ${(meta.duration / 60).toFixed(1)} min, ${meta.sections.length} sections`);
      }

      // Get lyric triggers for this song
      const songTriggers = lyricTriggersData
        .filter((t) => t.song === song.title)
        .map((t) => t.image_prompt.slice(0, 100));

      // Get overlay reasoning for thematic context
      const overlayReasoning = overlaySchedule[song.trackId]?.reasoning ?? null;

      // Build prompt for Claude
      const userPrompt = buildSongPrompt(song, meta, songTriggers, overlayReasoning);

      if (dryRun) {
        console.log(`\n    CLAUDE PROMPT:\n${userPrompt.split("\n").map((l) => `      ${l}`).join("\n")}`);

        // Show what Claude would generate (fake prompts for preview)
        const videoCount = meta && meta.duration >= 300 ? 4 : 3;
        estimatedCost += videoCount * 0.75;
        generated += videoCount;
        console.log(`    → Would generate ${videoCount} videos ($${(videoCount * 0.75).toFixed(2)})`);
        continue;
      }

      // Call Claude for prompts
      let videoPrompts: VideoPrompt[];
      try {
        console.log("    Calling Claude for video prompts...");
        videoPrompts = await callClaude(systemPrompt, userPrompt);
        console.log(`    → ${videoPrompts.length} prompts generated`);
        for (const vp of videoPrompts) {
          console.log(`      [${vp.energy}] ${vp.moment}: ${vp.prompt.slice(0, 80)}...`);
        }
      } catch (err) {
        console.error(`    ERROR (Claude): ${err instanceof Error ? err.message : err}`);
        failed++;
        continue;
      }

      // Generate each video via Grok Imagine
      for (let i = 0; i < videoPrompts.length; i++) {
        const vp = videoPrompts[i];
        const tmpPath = join(VIDEO_DIR, `${songKey}-scene-${vp.energy}-tmp.mp4`);

        try {
          console.log(`    Generating video ${i + 1}/${videoPrompts.length} [${vp.energy}]...`);
          const videoUrl = await generateGrokVideo(vp.prompt);

          console.log(`    Downloading...`);
          await download(videoUrl, tmpPath);

          // Register in catalog
          const added = addVideoToCatalog(
            catalog,
            tmpPath,
            song.title,
            "song",
            vp.energy,
            "grok-imagine",
            vp.prompt,
          );

          if (added) {
            generated++;
            estimatedCost += 0.75;
          } else {
            skipped++;
          }

          // Clean up tmp file (already copied to library)
          try {
            if (existsSync(tmpPath)) unlinkSync(tmpPath);
          } catch { /* ignore */ }
        } catch (err) {
          console.error(`    ERROR (Grok ${i + 1}): ${err instanceof Error ? err.message : err}`);
          failed++;
          // Clean up partial download
          try {
            if (existsSync(tmpPath)) unlinkSync(tmpPath);
          } catch { /* ignore */ }
        }

        // Rate limit between videos
        if (i < videoPrompts.length - 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      // Save catalog after each song (in case of interruption)
      saveCatalog(catalog);

      // Rate limit between songs
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ─── General atmospheric videos (Hailuo 02) ───

  console.log("\n═══ General Atmospheric Videos (Hailuo 02) ═══\n");

  // Check which generals already exist
  const existingGenerals = catalog.assets.filter(
    (a) =>
      a.type === "video" &&
      a.category === "general" &&
      a.tags.includes("scene-video"),
  );

  if (!force && existingGenerals.length >= GENERAL_PROMPTS.length) {
    console.log(`  SKIP — already have ${existingGenerals.length} general scene videos`);
  } else {
    for (const gp of GENERAL_PROMPTS) {
      // Check if this specific prompt already generated (by name tag)
      const alreadyExists = catalog.assets.some(
        (a) =>
          a.type === "video" &&
          a.category === "general" &&
          a.tags.includes("scene-video") &&
          a.tags.includes(`name-${gp.name}`),
      );

      if (!force && alreadyExists) {
        console.log(`  SKIP ${gp.name} — already exists`);
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`  [${gp.energy}] ${gp.name}: ${gp.prompt.slice(0, 80)}...`);
        estimatedCost += 0.30;
        generated++;
        continue;
      }

      const tmpPath = join(VIDEO_DIR, `general-${gp.name}-tmp.mp4`);

      try {
        console.log(`  Generating: ${gp.name} [${gp.energy}]...`);
        const videoUrl = await generateHailuoVideo(gp.prompt);

        console.log(`  Downloading...`);
        await download(videoUrl, tmpPath);

        // Register in catalog
        const hash = fileHash(tmpPath);
        if (catalog.assets.some((a) => a.id === hash)) {
          console.log(`  Already in library: ${hash}`);
          skipped++;
        } else {
          const stats = statSync(tmpPath);
          const libraryFilename = `general-${gp.name}-${hash}.mp4`;
          const destPath = join(VIDEO_DIR, libraryFilename);

          copyFileSync(tmpPath, destPath);

          catalog.assets.push({
            id: hash,
            path: `assets/library/videos/${libraryFilename}`,
            originalFile: libraryFilename,
            type: "video",
            song: "General",
            songKey: "general",
            category: "general",
            tags: [
              "scene-video",
              "generated",
              `energy-${gp.energy}`,
              "duration-300", // 10s = 300 frames
              `name-${gp.name}`,
            ],
            sizeBytes: stats.size,
            addedAt: new Date().toISOString(),
            model: "minimax-hailuo-02",
            prompt: gp.prompt,
          });

          console.log(`  + Added: general → videos/${libraryFilename} (${(stats.size / 1024 / 1024).toFixed(1)}M) [${gp.energy}]`);
          generated++;
          estimatedCost += 0.30;
        }

        // Clean up tmp
        try {
          if (existsSync(tmpPath)) unlinkSync(tmpPath);
        } catch { /* ignore */ }
      } catch (err) {
        console.error(`  ERROR (Hailuo ${gp.name}): ${err instanceof Error ? err.message : err}`);
        failed++;
        try {
          if (existsSync(tmpPath)) unlinkSync(tmpPath);
        } catch { /* ignore */ }
      }

      // Save catalog after each general video
      saveCatalog(catalog);

      // Rate limit
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Final save
  saveCatalog(catalog);

  // ─── Summary ───

  console.log("\n═══ Summary ═══");
  console.log(`  Generated: ${generated}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Est. cost: $${estimatedCost.toFixed(2)}`);

  // Stats
  const sceneVideos = catalog.assets.filter((a) => a.tags.includes("scene-video"));
  const songSceneVideos = sceneVideos.filter((a) => a.category === "song");
  const generalSceneVideos = sceneVideos.filter((a) => a.category === "general");
  console.log(`\n  Catalog scene videos: ${sceneVideos.length} total`);
  console.log(`    Song-specific: ${songSceneVideos.length}`);
  console.log(`    General:       ${generalSceneVideos.length}`);

  // Per-song breakdown
  const songCounts = new Map<string, number>();
  for (const v of songSceneVideos) {
    songCounts.set(v.song, (songCounts.get(v.song) ?? 0) + 1);
  }
  if (songCounts.size > 0) {
    console.log("\n  Per-song scene video counts:");
    for (const [song, count] of [...songCounts.entries()].sort()) {
      console.log(`    ${song}: ${count}`);
    }
  }

  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
