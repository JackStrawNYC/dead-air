#!/usr/bin/env npx tsx
/**
 * generate-veneta-art.ts — Generate psychedelic poster art for Veneta 8/27/72
 *
 * Usage:
 *   npx tsx scripts/generate-veneta-art.ts              # generate all
 *   npx tsx scripts/generate-veneta-art.ts --dry-run    # print prompts only
 *   npx tsx scripts/generate-veneta-art.ts --track=d2t06 # single song
 */

import dotenv from "dotenv";
import { resolve as resolvePath } from "path";
dotenv.config();
dotenv.config({ path: resolvePath(import.meta.dirname, "../../../.env") });

import Replicate from "replicate";
import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream } from "fs";
import { join, resolve } from "path";
import https from "https";
import http from "http";

const ROOT = resolve(import.meta.dirname, "..");
const SETLIST_PATH = join(ROOT, "data/shows/1972-08-27/setlist.json");
const ART_DIR = join(ROOT, "public/assets/song-art/veneta-72");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const trackFilter = args.find((a) => a.startsWith("--track="))?.split("=")[1];

const MODEL = "recraft-ai/recraft-v4-pro" as const;

// ─── Show poster ───
const SHOW_POSTER_PROMPT = [
  `Psychedelic concert poster art for "The Grateful Dead — Sunshine Daydream — August 27, 1972".`,
  `Ornate art nouveau border with organic flowering vines, sunflowers, and sacred geometry patterns.`,
  `Open air Oregon countryside festival scene: golden afternoon sunlight, rolling green hills, tall Douglas fir trees, a makeshift wooden stage in a clearing, crowd of barefoot hippies in tie-dye dancing on grass, VW buses and school buses parked in a meadow, Oregon coast mountains in the far distance.`,
  `The text "GRATEFUL DEAD" rendered in massive ornate psychedelic hand-lettered typography at the top.`,
  `Below it: "Sunshine Daydream" in elegant flowing secondary lettering.`,
  `Below that: "Old Renaissance Faire Grounds — Veneta, Oregon — August 27, 1972" in smaller decorative type.`,
  `Dancing skeleton figures, Grateful Dead bears, steal your face skull and lightning bolt motifs, sunflower and daisy patterns, tie-dye color swirls woven into the border.`,
  `Rich warm earth-tone palette with bursts of psychedelic color, intricate linework details, luminous golden-hour glow, professional concert poster illustration.`,
  `Landscape orientation, cinematic wide composition.`,
].join("\n");

// ─── Song-specific imagery ───
const SONG_IMAGERY: Record<string, string> = {
  d1t01: "Open highway stretching to the horizon through golden wheat fields, '50s Cadillac convertible, American flag waving, Chuck Berry guitar silhouette, endless blue sky",
  d1t02: "Weeping woman standing at a misty crossroads, spanish moss hanging from ancient oaks, guitar strings dripping honey and tears, warm amber and deep violet twilight",
  d1t03: "Dusty western trail through canyon country, two cowboys on horseback silhouetted against a blood-orange sunset, playing cards and silver dollars scattered on red rock",
  d1t04: "Cascading poker chips and playing cards, smoky card room with green felt table, chandelier throwing prismatic light, whiskey glass catching golden light",
  d1t05: "Dark wind howling through a desert canyon at night, tumbleweed spinning, distant coyote silhouette on a mesa, deep indigo sky with swirling storm clouds",
  d1t06: "Giant cosmic sunflower with a cat's face in the center, surrounded by prismatic rainbow light, butterflies made of stained glass, psychedelic garden under alien stars",
  d1t07: "Midnight rider on horseback galloping through moonlit countryside, shooting stars overhead, fiddle and banjo floating in cosmic clouds, warm amber and deep indigo",
  d1t08: "Mexican cantina scene with strings of papel picado, mariachi guitar silhouette, tequila sunrise colors, distant Baja coastline, warm terracotta and turquoise",
  d1t09: "Skeleton woman in Victorian dress dancing wildly at a masquerade ball, chandeliers swinging, roses flying through the air, electric energy and flowing gown",
  d1t10: "Infinite fractal landscape of musical instruments morphing into each other, guitars becoming rivers, drums becoming mountains, cosmic jam session in abstract space",
  d2t01: "Empty chair at a table set for dinner, single candle burning low, photograph fading in golden light, autumn leaves blowing through an open window, melancholy warmth",
  d2t02: "Railroad tracks vanishing into golden harvest fields, scarecrow silhouette, approaching thunderstorm, lightning on the horizon",
  d2t03: "Ethereal bird made of pure light soaring through a twilight forest canopy, feathers dissolving into musical notes, dappled golden sunbeams, deep emerald and amber",
  d2t04: "Giant open storybook with scenes erupting from the pages in 3D, castle towers, dragons, heroic figures, bold comic-book energy, vivid primary colors",
  d2t05: "Drum kit floating weightless in deep space nebula, galaxies and star clusters swirling, cosmic percussion waves rippling through spacetime, primal rhythmic energy",
  d2t06: "Infinite deep space void with a single brilliant dark star, cosmic dust spiraling inward, event horizon warping light, fractal geometry emerging from the darkness, profound cosmic mystery",
  d3t01: "Continuation of the cosmic void — dark star now exploding outward in slow motion, nebula birth, new galaxies forming, transcendent light emerging from total darkness",
  d3t02: "Desert sunset over Mexican border town, adobe buildings, saguaro cacti, warm amber and terracotta tones, distant mountains, Rosa's cantina glowing",
  d3t03: "Weathered front porch of a rural homestead at dusk, acoustic guitar leaning against a rocking chair, fireflies in the yard, country road vanishing into twilight",
  d3t04: "Magnificent magnolia tree in full explosive bloom, blossoms radiating golden light, hummingbirds and butterflies swirling, sunshine streaming through petals, pure joy",
  d3t05: "Runaway steam locomotive barreling through the night, cocaine snow swirling in headlight beams, railroad switch ahead, dangerous curves, hot red and steel blue",
  d3t06: "Full moon party night, concert crowd celebrating with arms raised, fireworks exploding, neon Saturday night energy, electric blues and hot pinks",
  d3t07: "Choir of angels in flowing robes singing in harmonious farewell, golden light radiating from clasped hands, peaceful sunset clouds, gentle benediction, sacred warmth",
};

function buildPrompt(title: string, trackId: string): string {
  const imagery = SONG_IMAGERY[trackId] ?? "";
  return [
    `Psychedelic concert poster art for the Grateful Dead song "${title}".`,
    `Ornate art nouveau border with organic flowering vines, sunflowers, and sacred geometry patterns.`,
    imagery ? `${imagery}.` : "",
    `The song title "${title}" rendered in ornate psychedelic hand-lettered typography prominently at the top of the composition.`,
    `Below the title in smaller type: "Grateful Dead — Veneta, Oregon — August 27, 1972"`,
    `Dancing skeleton figures, Grateful Dead bears, steal your face skull and lightning bolt motifs, tie-dye color swirls.`,
    `Rich saturated warm earth-tone palette with psychedelic color bursts, intricate linework details, luminous golden-hour glow, professional concert poster illustration.`,
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
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", (err) => { file.close(); reject(err); });
  });
}

async function extractImageUrl(output: unknown): Promise<string | null> {
  let raw: unknown = output;
  if (Array.isArray(raw)) raw = raw[0];
  if (typeof raw === "string" && (raw as string).startsWith("http")) return raw;
  if (raw && typeof raw === "object" && "url" in (raw as object)) {
    const u = (raw as { url: unknown }).url;
    if (typeof u === "string") return u;
  }
  // ReadableStream (Replicate SDK v1.x) — collect chunks and find URL
  if (raw && typeof (raw as any).getReader === "function") {
    const reader = (raw as any).getReader();
    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const result = await reader.read();
      if (result.value) chunks.push(result.value);
      done = result.done;
    }
    const text = Buffer.concat(chunks).toString("utf-8");
    try {
      const parsed = JSON.parse(text);
      if (parsed.url) return parsed.url;
      if (parsed.output) return extractImageUrl(parsed.output);
    } catch {
      if (text.startsWith("http")) return text.trim();
    }
  }
  return null;
}

async function main() {
  mkdirSync(ART_DIR, { recursive: true });

  const setlist = JSON.parse(readFileSync(SETLIST_PATH, "utf-8"));
  const songs: { trackId: string; title: string }[] = setlist.songs;

  const replicate = new Replicate();

  // Show poster
  const posterPath = join(ART_DIR, "show-poster.png");
  if (trackFilter === "show-poster" || !trackFilter) {
    if (!existsSync(posterPath) || force) {
      console.log("\n=== Show Poster ===");
      console.log(`  Prompt: ${SHOW_POSTER_PROMPT.slice(0, 100)}...`);
      if (!dryRun) {
        console.log(`  Generating with ${MODEL}...`);
        const output = await replicate.run(MODEL, {
          input: { prompt: SHOW_POSTER_PROMPT, size: "2560x1664" },
        });
        const url = await extractImageUrl(output);
        if (url) {
          await download(url, posterPath);
          console.log(`  ✓ Saved: ${posterPath}`);
        } else {
          console.error("  ✗ No image URL in output");
        }
      }
    } else {
      console.log(`  SKIP: show-poster (exists)`);
    }
  }

  // Song art
  for (const song of songs) {
    if (trackFilter && trackFilter !== song.trackId && trackFilter !== "show-poster") continue;

    const outPath = join(ART_DIR, `${song.trackId}.png`);
    if (existsSync(outPath) && !force) {
      console.log(`  SKIP: ${song.trackId} — ${song.title} (exists)`);
      continue;
    }

    const prompt = buildPrompt(song.title, song.trackId);
    console.log(`\n=== ${song.trackId}: ${song.title} ===`);
    console.log(`  Prompt: ${prompt.slice(0, 120)}...`);

    if (!dryRun) {
      try {
        console.log(`  Generating with ${MODEL}...`);
        const output = await replicate.run(MODEL, {
          input: { prompt, size: "2560x1664" },
        });
        const url = await extractImageUrl(output);
        if (url) {
          await download(url, outPath);
          console.log(`  ✓ Saved: ${outPath}`);
        } else {
          console.error("  ✗ No image URL in output");
        }
      } catch (err) {
        console.error(`  ✗ Error: ${err}`);
      }
    }
  }

  console.log("\nDone!");
}

main().catch(console.error);
