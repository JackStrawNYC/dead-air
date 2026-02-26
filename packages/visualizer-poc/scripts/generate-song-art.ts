#!/usr/bin/env npx tsx
/**
 * generate-song-art.ts — Generate psychedelic poster art for each song
 * + a show intro poster, using Recraft V4 Pro (or Ideogram V3 Quality fallback).
 *
 * Usage:
 *   npx tsx scripts/generate-song-art.ts                    # generate all 21 (show + 20 songs)
 *   npx tsx scripts/generate-song-art.ts --dry-run          # print prompts only
 *   npx tsx scripts/generate-song-art.ts --track=s2t08      # single song
 *   npx tsx scripts/generate-song-art.ts --track=show-poster # show poster only
 *   npx tsx scripts/generate-song-art.ts --force             # regenerate existing
 *   npx tsx scripts/generate-song-art.ts --track=s2t08 --fallback  # use Ideogram
 */

import dotenv from "dotenv";
import { resolve as resolvePath } from "path";

// Load .env from package root, then monorepo root (first found wins per-key)
dotenv.config();
dotenv.config({ path: resolvePath(import.meta.dirname, "../../../.env") });
import Replicate from "replicate";
import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream } from "fs";
import { join, resolve } from "path";
import https from "https";
import http from "http";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const SETLIST_PATH = join(DATA_DIR, "setlist.json");
const ART_DIR = join(ROOT, "public", "assets", "song-art");

// ─── CLI args ───
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const useFallback = args.includes("--fallback");
const trackFilter = args.find((a) => a.startsWith("--track="))?.split("=")[1];

// ─── Models ───
const PRIMARY_MODEL = "recraft-ai/recraft-v4-pro" as const;
const FALLBACK_MODEL = "ideogram-ai/ideogram-v3-quality" as const;
const COST_PER_IMAGE = 0.25;

// ─── Show poster ───
const SHOW_POSTER_ID = "show-poster";
const SHOW_POSTER_PROMPT = [
  `Psychedelic concert poster art for "The Grateful Dead Live at Cornell University — Barton Hall — May 8, 1977".`,
  `Ornate art nouveau border with organic flowering vines, roses, and sacred geometry patterns.`,
  `Grand ivy-covered university hall exterior at twilight, warm golden light spilling from arched windows, crowd of hippies streaming toward the entrance, VW vans in the parking lot, Finger Lakes landscape in the background.`,
  `The text "GRATEFUL DEAD" rendered in massive ornate psychedelic hand-lettered typography at the top.`,
  `Below it: "Barton Hall — Cornell University" in elegant secondary lettering.`,
  `Below that: "May 8, 1977 — Ithaca, New York" in smaller decorative type.`,
  `Dancing skeleton figures, Grateful Dead bears, steal your face skull and lightning bolt motifs, tie-dye color swirls woven into the border.`,
  `Rich saturated jewel-tone palette, intricate linework details, luminous psychedelic glow, professional concert poster illustration.`,
  `Landscape orientation, cinematic wide composition.`,
].join("\n");

// ─── Song-specific imagery ───
const SONG_IMAGERY: Record<string, string> = {
  s1t02: "Dusty crossroads at midnight, blues devil silhouette, neon juke joint glow, smoky honky-tonk atmosphere",
  s1t03: "Poker table with scattered playing cards and dice, whiskey glass, western saloon chandelier, desert moonlight through windows",
  s1t04: "Desert sunset over Mexican border town, adobe buildings, saguaro cacti, warm amber and terracotta tones, distant mountains",
  s1t05: "Two figures dancing under a moonlit sky, hearts and wildflowers intertwined, soft pink and lavender celestial glow",
  s1t06: "Railroad tracks vanishing into golden harvest fields, scarecrow silhouette, approaching thunderstorm, lightning on the horizon",
  s1t07: "Cascading poker chips and playing cards, smoky card room with green felt table, chandelier throwing prismatic light",
  s1t08: "Lightning bolts arcing lazily across a summer afternoon sky, electric purple and gold energy, hammock between ancient oaks",
  s1t09: "Stained glass cathedral windows with divine light streaming through, hands reaching upward, celestial beams and cosmic spirals",
  s1t10: "1920s speakeasy scene with amber whiskey bottles, art deco bar interior, warm brown and gold tones, bootleg moonshine jugs",
  s1t11: "Prison bars with endless country road visible beyond, freight train in the distance, worn cowboy boots, sepia and dusty blue palette",
  s1t12: "Moonlit river with a wooden rowboat, weeping willow trees draped in Spanish moss, mist rising from dark water, deep indigo and silver",
  s1t13: "City street at night with ecstatic figures dancing, confetti and streamers raining down, neon signs, vibrant celebration energy",
  s2t02: "Overflowing lush scarlet begonia flowers, London marketplace stalls, gypsy caravan wheels, crimson petals and deep emerald leaves",
  s2t03: "Mountain range engulfed in roaring flames, phoenix rising from the fire, rivers of molten lava, intense orange and crimson sky",
  s2t04: "Robed prophet figure standing at the ocean's edge, golden prophetic light emanating outward, crashing waves, mystical deep blue and gold",
  s2t05: "Medieval saint with radiant golden halo, celestial stars and constellations, stone cathedral archway, deep royal purple and gold leaf",
  s2t06: "Eternal flame burning brilliantly, infinity symbol wreathed in roses, love enduring through swirling cosmic nebula, warm eternal glow",
  s2t07: "Drum kit floating weightless in deep space nebula, galaxies and star clusters swirling, cosmic percussion waves rippling through spacetime",
  s2t08: "Post-apocalyptic sunrise over a dewy meadow, single resilient flower blooming, fading mushroom cloud on the horizon, dawn of hope emerging",
  s2t09: "Full moon party night, concert crowd celebrating with arms raised, fireworks exploding, neon Saturday night energy, electric blues and hot pinks",
};

function buildPrompt(title: string, trackId: string): string {
  const imagery = SONG_IMAGERY[trackId] ?? "";
  return [
    `Psychedelic concert poster art for the Grateful Dead song "${title}".`,
    `Ornate art nouveau border with organic flowering vines, roses, and sacred geometry patterns.`,
    imagery ? `${imagery}.` : "",
    `The song title "${title}" rendered in ornate psychedelic hand-lettered typography prominently at the top of the composition.`,
    `Dancing skeleton figures, Grateful Dead bears, steal your face skull and lightning bolt motifs, tie-dye color swirls.`,
    `Rich saturated jewel-tone palette, intricate linework details, luminous psychedelic glow, professional concert poster illustration.`,
    `Landscape orientation, cinematic wide composition.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const get = url.startsWith("https") ? https.get : http.get;
    get(url, (response) => {
      // Follow redirects
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

/** Extract image URL from Replicate output (handles string, array, FileOutput, ReadableStream) */
async function extractImageUrl(output: unknown): Promise<string | null> {
  let raw: unknown = output;

  // Array → take first element
  if (Array.isArray(raw)) raw = raw[0];

  // String URL
  if (typeof raw === "string" && raw.startsWith("http")) return raw;

  // FileOutput or object with .url
  if (raw && typeof raw === "object" && "url" in (raw as object)) {
    const u = (raw as { url: unknown }).url;
    if (typeof u === "string") return u;
  }

  // ReadableStream (Replicate SDK v1.x)
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

  // toString fallback
  if (raw && typeof (raw as any).toString === "function") {
    const s = (raw as any).toString();
    if (s.startsWith("http")) return s;
  }

  console.error(`  Unexpected output type: ${typeof raw}`, raw);
  return null;
}

async function main() {
  // Load setlist
  const setlist = JSON.parse(readFileSync(SETLIST_PATH, "utf-8"));
  const songs: Array<{ trackId: string; title: string }> = setlist.songs;

  // Filter if --track specified
  const targets = trackFilter
    ? songs.filter((s) => s.trackId === trackFilter)
    : songs;

  if (targets.length === 0 && trackFilter !== SHOW_POSTER_ID) {
    console.error(`No songs matched track filter: ${trackFilter}`);
    process.exit(1);
  }

  // Ensure output dir
  mkdirSync(ART_DIR, { recursive: true });

  const model = useFallback ? FALLBACK_MODEL : PRIMARY_MODEL;
  console.log(`\n  Model: ${model}`);
  console.log(`  Songs: ${targets.length}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Force: ${force}\n`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  const replicate = dryRun ? null : new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

  // ─── Show poster (always included unless --track filters it out) ───
  if (!trackFilter || trackFilter === SHOW_POSTER_ID) {
    const showOutPath = join(ART_DIR, `${SHOW_POSTER_ID}.png`);

    if (!force && existsSync(showOutPath)) {
      console.log(`  SKIP  ${SHOW_POSTER_ID} (exists)`);
      skipped++;
    } else {
      console.log(`\n  ── ${SHOW_POSTER_ID}: Show Intro Poster ──`);

      if (dryRun) {
        console.log(`  PROMPT:\n${SHOW_POSTER_PROMPT.split("\n").map((l) => `    ${l}`).join("\n")}`);
        generated++;
      } else {
        try {
          console.log(`  Generating with ${model}...`);
          const output = await replicate!.run(model, {
            input: { prompt: SHOW_POSTER_PROMPT, size: "3072x1536" },
          });
          const imageUrl = await extractImageUrl(output);
          if (!imageUrl) {
            console.error(`  FAIL  No image URL returned`);
            failed++;
          } else {
            console.log(`  Downloading → ${showOutPath}`);
            await download(imageUrl, showOutPath);
            console.log(`  OK    ${SHOW_POSTER_ID}.png saved`);
            generated++;
          }
        } catch (err: any) {
          console.error(`  FAIL  ${SHOW_POSTER_ID}: ${err.message}`);
          failed++;
        }
      }
    }
  }

  // ─── Per-song posters ───
  if (trackFilter === SHOW_POSTER_ID) {
    // Only generating show poster, skip songs
  } else for (const song of targets) {
    const outPath = join(ART_DIR, `${song.trackId}.png`);
    const prompt = buildPrompt(song.title, song.trackId);

    if (!force && existsSync(outPath)) {
      console.log(`  SKIP  ${song.trackId} — ${song.title} (exists)`);
      skipped++;
      continue;
    }

    console.log(`\n  ── ${song.trackId}: ${song.title} ──`);

    if (dryRun) {
      console.log(`  PROMPT:\n${prompt.split("\n").map((l) => `    ${l}`).join("\n")}`);
      generated++;
      continue;
    }

    try {
      console.log(`  Generating with ${model}...`);
      const output = await replicate!.run(model, {
        input: {
          prompt,
          size: "3072x1536",
        },
      });

      const imageUrl = await extractImageUrl(output);

      if (!imageUrl) {
        console.error(`  FAIL  No image URL returned`);
        failed++;
        continue;
      }

      console.log(`  Downloading → ${outPath}`);
      await download(imageUrl, outPath);
      console.log(`  OK    ${song.trackId}.png saved`);
      generated++;
    } catch (err: any) {
      console.error(`  FAIL  ${song.trackId}: ${err.message}`);
      failed++;
    }
  }

  // Update setlist.json with songArt paths + showPoster
  if (!dryRun && generated > 0) {
    const freshSetlist = JSON.parse(readFileSync(SETLIST_PATH, "utf-8"));
    for (const song of freshSetlist.songs) {
      const artPath = join(ART_DIR, `${song.trackId}.png`);
      if (existsSync(artPath)) {
        song.songArt = `assets/song-art/${song.trackId}.png`;
      }
    }
    // Add show poster path at top level
    const showPosterPath = join(ART_DIR, `${SHOW_POSTER_ID}.png`);
    if (existsSync(showPosterPath)) {
      freshSetlist.showPoster = `assets/song-art/${SHOW_POSTER_ID}.png`;
    }
    writeFileSync(SETLIST_PATH, JSON.stringify(freshSetlist, null, 2) + "\n");
    console.log(`\n  Updated setlist.json with songArt + showPoster paths`);
  }

  // Summary
  const cost = generated * COST_PER_IMAGE;
  console.log(`\n  ── Summary ──`);
  console.log(`  Generated: ${generated}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Failed:    ${failed}`);
  if (!dryRun) {
    console.log(`  Est. cost: $${cost.toFixed(2)}`);
  }
  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
