#!/usr/bin/env npx tsx
/**
 * generate-trigger-visuals.ts — Auto-generates visual assets for lyric triggers.
 *
 * Full pipeline:
 * 1. Check existing library (data/image-library.json) for matching assets
 * 2. If no image_prompt/video_prompt → Claude generates prompts from lyrics + song context
 * 3. FLUX 1.1 Pro generates hero still from image prompt
 * 4. Image-to-video model animates the still with video prompt
 * 5. Saves to public/assets/library/
 *
 * Usage:
 *   npx tsx packages/pipeline/scripts/generate-trigger-visuals.ts
 *   npx tsx packages/pipeline/scripts/generate-trigger-visuals.ts --trigger=fotm-chorus-1
 *   npx tsx packages/pipeline/scripts/generate-trigger-visuals.ts --dry-run
 *   npx tsx packages/pipeline/scripts/generate-trigger-visuals.ts --prompts-only
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import Replicate from 'replicate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VISUALIZER_DIR = resolve(__dirname, '..', '..', 'visualizer-poc');
const PUBLIC_DIR = resolve(VISUALIZER_DIR, 'public');
const TRIGGERS_PATH = resolve(VISUALIZER_DIR, 'data', 'lyric-triggers.json');
const LIBRARY_PATH = resolve(VISUALIZER_DIR, 'data', 'image-library.json');
const LYRICS_DIR = resolve(__dirname, '..', '..', '..', 'data', 'lyrics');

interface LyricTrigger {
  id: string;
  phrase: string;
  song: string;
  visual: string;
  mediaType: "image" | "video";
  image_prompt?: string;
  video_prompt?: string;
}

interface TriggerConfig {
  showId: string;
  defaults: Record<string, unknown>;
  triggers: LyricTrigger[];
}

interface LibraryAsset {
  id: string;
  path: string;
  type: "image" | "video";
  songKey?: string;
  category?: string;
  tags: string[];
}

interface ImageLibrary {
  version: number;
  assets: LibraryAsset[];
}

// ─── CLI args ───

const args = process.argv.slice(2);
const triggerFilter = args.find(a => a.startsWith('--trigger='))?.slice(10);
const dryRun = args.includes('--dry-run');
const promptsOnly = args.includes('--prompts-only');

// ─── Slug helpers ───

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Lyrics loader ───

function loadLyrics(songTitle: string): string | null {
  const catalogPath = resolve(LYRICS_DIR, 'song-catalog.json');
  if (!existsSync(catalogPath)) return null;

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  const normalized = songTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

  for (const entry of catalog.songs) {
    if (entry.instrumental) continue;
    const entryNorm = entry.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (entryNorm === normalized) {
      const filePath = resolve(LYRICS_DIR, `${entry.slug}.txt`);
      if (existsSync(filePath)) return readFileSync(filePath, 'utf-8').trim();
    }
    for (const alias of entry.aliases) {
      const aliasNorm = alias.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      if (aliasNorm === normalized) {
        const filePath = resolve(LYRICS_DIR, `${entry.slug}.txt`);
        if (existsSync(filePath)) return readFileSync(filePath, 'utf-8').trim();
      }
    }
  }

  return null;
}

// ─── Claude prompt generation ───

const PROMPT_SYSTEM = `You are a visual director for Dead Air, a psychedelic concert film visualizer for Grateful Dead shows. You create image and video generation prompts for key lyric moments.

Your visual style:
- 1970s liquid light show aesthetic — swirling organic colors, oil-on-water projections
- Psychedelic concert poster art — saturated, flowing, dreamlike
- Nature imagery filtered through an acid-era lens — mountains melt, rivers glow, skies fracture
- Steal Your Face and Dead iconography woven into landscapes
- Deep warm ambers, electric purples, emerald greens, cosmic blues
- Atmospheric and environmental — never literal or cartoonish
- No people, no faces, no portraits — just landscapes, textures, and abstract forms

Technical constraints:
- ALWAYS end image prompts with: "no text no words no letters, 16:9"
- Image prompts should describe a single rich still frame (for FLUX image generation)
- Video prompts should describe motion/energy for a 5-10 second animation of that still (for image-to-video)
- Keep prompts under 200 words each`;

interface GeneratedPrompts {
  image_prompt: string;
  video_prompt: string;
}

async function generatePromptsWithClaude(
  trigger: LyricTrigger,
  lyrics: string | null,
  anthropic: Anthropic,
): Promise<GeneratedPrompts> {
  const lyricsContext = lyrics
    ? `\nFull lyrics:\n${lyrics}`
    : '';

  const userPrompt = `Generate an image prompt and a video prompt for this lyric trigger:

Song: "${trigger.song}" by the Grateful Dead
Trigger phrase: "${trigger.phrase}"
Media type: ${trigger.mediaType}
${lyricsContext}

The visual should evoke the emotional and narrative weight of this lyric moment. Think about what images the phrase conjures — not literally, but through the psychedelic Dead aesthetic. What would a 1970s liquid light show artist project behind the band at this exact moment?

Respond in this exact JSON format (no markdown, no code blocks):
{"image_prompt": "...", "video_prompt": "..."}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{ role: 'user', content: userPrompt }],
    system: PROMPT_SYSTEM,
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Parse JSON — handle markdown wrapping, preamble text, trailing content
  let jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Extract the first JSON object if there's surrounding text
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON object found in Claude response: ${text.slice(0, 200)}`);
  }
  jsonStr = jsonMatch[0];

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse Claude JSON response: ${(e as Error).message}\nRaw: ${jsonStr.slice(0, 300)}`);
  }

  if (!parsed.image_prompt || !parsed.video_prompt) {
    throw new Error(`Claude response missing required fields. Got keys: ${Object.keys(parsed).join(', ')}`);
  }

  return {
    image_prompt: parsed.image_prompt,
    video_prompt: parsed.video_prompt,
  };
}

// ─── Check existing library ───

function findExistingAsset(trigger: LyricTrigger, library: ImageLibrary | null): LibraryAsset | null {
  if (!library) return null;

  const songSlug = titleToSlug(trigger.song);
  const triggerSlug = titleToSlug(trigger.phrase);

  return library.assets.find(a =>
    (a.songKey === songSlug || a.path.includes(songSlug)) &&
    (a.type === trigger.mediaType || a.path.includes(triggerSlug)),
  ) ?? null;
}

// ─── Download helper ───

async function downloadFile(url: string, outPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buffer);
}

// ─── Main ───

async function main() {
  if (!existsSync(TRIGGERS_PATH)) {
    console.error(`Trigger config not found: ${TRIGGERS_PATH}`);
    process.exit(1);
  }

  const config: TriggerConfig = JSON.parse(readFileSync(TRIGGERS_PATH, 'utf-8'));
  let library: ImageLibrary | null = null;
  try {
    library = JSON.parse(readFileSync(LIBRARY_PATH, 'utf-8'));
  } catch {
    // Library not yet generated
  }

  let triggers = config.triggers;
  if (triggerFilter) {
    triggers = triggers.filter(t => t.id === triggerFilter);
    if (triggers.length === 0) {
      console.error(`Trigger "${triggerFilter}" not found`);
      process.exit(1);
    }
  }

  const anthropic = new Anthropic();
  const replicate = new Replicate();

  let generated = 0;
  let skippedExisting = 0;
  let failed = 0;
  let promptsGenerated = 0;
  let configUpdated = false;

  for (const trigger of triggers) {
    // Check if visual already exists on disk
    const visualPath = resolve(PUBLIC_DIR, trigger.visual);
    if (!promptsOnly && existsSync(visualPath)) {
      console.log(`  ○ ${trigger.id} — asset exists: ${trigger.visual}`);
      skippedExisting++;
      continue;
    }

    // Check library catalog
    if (!promptsOnly) {
      const existing = findExistingAsset(trigger, library);
      if (existing) {
        console.log(`  ○ ${trigger.id} — found in library: ${existing.path}`);
        skippedExisting++;
        continue;
      }
    }

    // Step 1: Generate prompts via Claude if not provided
    let imagePrompt = trigger.image_prompt;
    let videoPrompt = trigger.video_prompt;

    if (!imagePrompt || !videoPrompt) {
      console.log(`  🧠 ${trigger.id} — generating prompts via Claude...`);
      try {
        const lyrics = loadLyrics(trigger.song);
        const prompts = await generatePromptsWithClaude(trigger, lyrics, anthropic);
        imagePrompt = imagePrompt ?? prompts.image_prompt;
        videoPrompt = videoPrompt ?? prompts.video_prompt;

        // Save generated prompts back to config for reproducibility
        const configTrigger = config.triggers.find(t => t.id === trigger.id);
        if (configTrigger) {
          if (!configTrigger.image_prompt) configTrigger.image_prompt = imagePrompt;
          if (!configTrigger.video_prompt) configTrigger.video_prompt = videoPrompt;
          configUpdated = true;
        }

        console.log(`    Image: ${imagePrompt.slice(0, 80)}...`);
        console.log(`    Video: ${videoPrompt.slice(0, 80)}...`);
        promptsGenerated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ✗ ${trigger.id} — Claude prompt generation failed: ${msg}`);
        failed++;
        continue;
      }
    }

    if (dryRun || promptsOnly) {
      console.log(`  → ${trigger.id} — would generate: ${trigger.visual}`);
      console.log(`    Image prompt: ${imagePrompt}`);
      console.log(`    Video prompt: ${videoPrompt}`);
      continue;
    }

    const songSlug = titleToSlug(trigger.song);
    const triggerSlug = titleToSlug(trigger.id);

    try {
      // Step 2: Generate hero still via Grok Imagine Image
      console.log(`  ⏳ ${trigger.id} — generating hero still via Grok...`);
      const imageResult = await replicate.run("xai/grok-imagine-image", {
        input: {
          prompt: imagePrompt,
          aspect_ratio: "16:9",
        },
      });

      // Save hero still
      const imgDir = resolve(PUBLIC_DIR, 'assets', 'library', 'images');
      mkdirSync(imgDir, { recursive: true });
      const imgFilename = `${songSlug}-${triggerSlug}.png`;
      const imgPath = resolve(imgDir, imgFilename);

      const imgUrl = typeof imageResult === 'string'
        ? imageResult
        : Array.isArray(imageResult) ? imageResult[0] : String(imageResult);

      await downloadFile(imgUrl, imgPath);
      console.log(`    ✓ Hero still saved: assets/library/images/${imgFilename}`);

      if (trigger.mediaType === "video") {
        // Step 3: Image-to-video via Grok Imagine Video (15s)
        console.log(`  ⏳ ${trigger.id} — generating 15s video via Grok...`);

        const videoResult = await replicate.run("xai/grok-imagine-video", {
          input: {
            prompt: videoPrompt,
            image: imgUrl,
            aspect_ratio: "16:9",
          },
        });

        // Save video
        const vidDir = resolve(PUBLIC_DIR, 'assets', 'library', 'videos');
        mkdirSync(vidDir, { recursive: true });
        const vidFilename = `${songSlug}-${triggerSlug}.mp4`;
        const vidPath = resolve(vidDir, vidFilename);

        const vidUrl = typeof videoResult === 'string'
          ? videoResult
          : Array.isArray(videoResult) ? videoResult[0] : String(videoResult);

        await downloadFile(vidUrl, vidPath);
        console.log(`    ✓ Video saved: assets/library/videos/${vidFilename}`);
      }

      generated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${trigger.id} — generation failed: ${msg}`);
      failed++;
    }
  }

  // Save updated config with generated prompts (for reproducibility)
  if (configUpdated) {
    writeFileSync(TRIGGERS_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    console.log(`\nSaved ${promptsGenerated} generated prompts back to lyric-triggers.json`);
  }

  console.log(`\nDone: ${generated} generated, ${promptsGenerated} prompts via Claude, ${skippedExisting} existing, ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
