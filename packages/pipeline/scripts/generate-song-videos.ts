#!/usr/bin/env npx tsx
/**
 * generate-song-videos.ts — Auto-generates dedicated video assets for every song
 * in a show setlist that doesn't already have one in the image-library catalog.
 *
 * Pipeline per song:
 * 1. Check image-library.json catalog for existing song-specific video
 * 2. Load lyrics from data/lyrics/ via song-catalog.json (or mood description for instrumentals)
 * 3. Claude Sonnet generates image_prompt + video_prompt from song title + lyrics
 * 4. Grok Imagine Image generates hero still (16:9)
 * 5. Grok Imagine Video animates the still (15s, image-to-video)
 * 6. Save still + video to public/assets/library/
 * 7. Add both entries to image-library.json catalog
 *
 * Usage:
 *   npx tsx packages/pipeline/scripts/generate-song-videos.ts --show=1977-05-08
 *   npx tsx packages/pipeline/scripts/generate-song-videos.ts --show=1977-05-08 --track=s1t06
 *   npx tsx packages/pipeline/scripts/generate-song-videos.ts --show=1977-05-08 --dry-run
 *   npx tsx packages/pipeline/scripts/generate-song-videos.ts --show=1977-05-08 --force
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import Replicate from 'replicate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..', '..', '..');

// Load .env from project root (no dotenv dependency — parse manually)
const envPath = resolve(ROOT_DIR, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
const VISUALIZER_DIR = resolve(__dirname, '..', '..', 'visualizer-poc');
const PUBLIC_DIR = resolve(VISUALIZER_DIR, 'public');
const SETLIST_PATH = resolve(VISUALIZER_DIR, 'data', 'setlist.json');
const LIBRARY_PATH = resolve(VISUALIZER_DIR, 'data', 'image-library.json');
const PROMPTS_PATH = resolve(__dirname, '..', '..', '..', 'data', 'song-video-prompts.json');
const LYRICS_DIR = resolve(__dirname, '..', '..', '..', 'data', 'lyrics');

// ─── Types ───

interface SetlistSong {
  trackId: string;
  title: string;
  set: number;
  trackNumber: number;
  defaultMode: string;
  audioFile: string;
  palette: { primary: number; secondary: number; saturation?: number };
  songArt?: string;
  sceneVideos?: { src: string; category: string }[];
  segueInto?: boolean;
}

interface Setlist {
  date: string;
  venue: string;
  bandName: string;
  songs: SetlistSong[];
  showPoster: string;
}

interface LibraryAsset {
  id: string;
  path: string;
  originalFile: string;
  type: "image" | "video";
  song: string;
  songKey: string;
  sourceShow?: string;
  category?: "song" | "general";
  tags: string[];
  sizeBytes: number;
  addedAt: string;
}

interface ImageLibrary {
  version: number;
  assets: LibraryAsset[];
}

interface GeneratedPrompts {
  image_prompt: string;
  video_prompt: string;
}

interface SongPromptEntry {
  trackId: string;
  title: string;
  songKey: string;
  image_prompt: string;
  video_prompt: string;
  generatedAt: string;
}

interface SongPromptFile {
  showDate: string;
  songs: SongPromptEntry[];
}

// ─── CLI args ───

const args = process.argv.slice(2);
const showDate = args.find(a => a.startsWith('--show='))?.slice(7);
const trackFilter = args.find(a => a.startsWith('--track='))?.slice(8);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

if (!showDate) {
  console.error('Usage: npx tsx generate-song-videos.ts --show=1977-05-08 [--track=s1t06] [--dry-run] [--force]');
  process.exit(1);
}

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

function generateId(): string {
  return randomBytes(8).toString('hex');
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

function isInstrumental(songTitle: string): boolean {
  const catalogPath = resolve(LYRICS_DIR, 'song-catalog.json');
  if (!existsSync(catalogPath)) return false;

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  const normalized = songTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

  for (const entry of catalog.songs) {
    const entryNorm = entry.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (entryNorm === normalized && entry.instrumental) return true;
    for (const alias of entry.aliases) {
      const aliasNorm = alias.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      if (aliasNorm === normalized && entry.instrumental) return true;
    }
  }

  return false;
}

// ─── Claude prompt generation ───

const PROMPT_SYSTEM = `You are a visual director for Dead Air, a psychedelic concert film visualizer for Grateful Dead shows. You create image and video generation prompts that evoke the emotional core of each song through PSYCHEDELIC, NON-REALISTIC visuals.

CRITICAL AESTHETIC RULE: This is NOT a nature documentary. Every output must look like it belongs projected behind the Grateful Dead at the Fillmore in 1969. Think liquid light shows, concert poster art, and acid-trip visions — NEVER clean, realistic, or photographic.

Your visual style:
- 1960s-70s liquid light show projections — oil, water, and dye swirling on overhead projectors, hot glass plates, organic flowing color
- Psychedelic concert poster art (Stanley Mouse, Alton Kelley, Rick Griffin) — ornate linework, saturated jewel tones, art nouveau organic forms
- Steal Your Face skulls, dancing bears, skeleton roses, thirteen-point lightning bolts, terrapins — woven organically into abstract landscapes
- Colors must be ELECTRIC and OVERSATURATED — hot pinks, electric purples, molten golds, acid greens, deep cosmic blues. Never muted, never earth-toned, never natural.
- Everything melts, breathes, morphs, and flows. Rigid geometry is forbidden. Hard edges dissolve into organic curves.
- Textures: oil-on-water interference patterns, tie-dye bleeding, marbled ink, blacklight poster glow, velvet painting depth
- Abstract and hallucinatory — if it could appear in a Planet Earth episode, it's WRONG. If it could appear on a blacklight poster in a head shop, it's RIGHT.
- No people, no faces, no portraits, no photographs — only psychedelic abstractions, Dead iconography, and surreal dreamscapes

Technical constraints:
- ALWAYS end image prompts with: "psychedelic art, liquid light show, no text no words no letters, 16:9"
- Image prompts should describe a single rich still frame (for image generation)
- Video prompts should describe motion/energy for a 15-second animation of that still (for image-to-video) — emphasize SWIRLING, MORPHING, BREATHING motion
- Keep prompts under 200 words each
- The visual should represent the ENTIRE SONG, not just one lyric line — capture its overall mood, arc, and emotional weight`;

async function generatePromptsWithClaude(
  songTitle: string,
  lyrics: string | null,
  instrumental: boolean,
  anthropic: Anthropic,
): Promise<GeneratedPrompts> {
  let userPrompt: string;

  if (instrumental) {
    userPrompt = `Generate an image prompt and a video prompt for this Grateful Dead instrumental:

Song: "${songTitle}" by the Grateful Dead

This is an instrumental piece — no lyrics. Think about the title, the mood it evokes, and the sonic landscape of the Dead's improvisation. ${songTitle.includes('Drums') ? 'This is the Drums/Space section — percussive, exploratory, cosmic, dissolving into the void before rebuilding.' : 'This is an exploratory jam — flowing, building, releasing energy in waves.'}

What would a 1970s liquid light show artist project behind the band during this piece?

Respond in this exact JSON format (no markdown, no code blocks):
{"image_prompt": "...", "video_prompt": "..."}`;
  } else {
    userPrompt = `Generate an image prompt and a video prompt for this Grateful Dead song:

Song: "${songTitle}" by the Grateful Dead
${lyrics ? `\nFull lyrics:\n${lyrics}` : ''}

The visual should evoke the song's emotional arc and narrative weight — not a literal depiction but a psychedelic abstraction of its core feeling. What would a 1970s liquid light show artist project behind the band during this entire song?

Respond in this exact JSON format (no markdown, no code blocks):
{"image_prompt": "...", "video_prompt": "..."}`;
  }

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

// ─── Check existing catalog ───

function hasSongVideo(songKey: string, library: ImageLibrary): boolean {
  const normalizedKey = songKey.toLowerCase().replace(/[^a-z0-9]/g, '');
  return library.assets.some(a => {
    const normalizedAssetKey = a.songKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedAssetKey === normalizedKey && a.type === 'video' && a.category === 'song';
  });
}

// ─── Download helper ───

async function downloadFile(url: string, outPath: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buffer);
  return buffer.length;
}

// ─── Prompt cache ───

function loadPromptCache(): SongPromptFile | null {
  if (!existsSync(PROMPTS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(PROMPTS_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function savePromptCache(cache: SongPromptFile): void {
  const dir = dirname(PROMPTS_PATH);
  mkdirSync(dir, { recursive: true });
  writeFileSync(PROMPTS_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
}

function getCachedPrompts(cache: SongPromptFile | null, trackId: string): GeneratedPrompts | null {
  if (!cache) return null;
  const entry = cache.songs.find(s => s.trackId === trackId);
  if (!entry) return null;
  return { image_prompt: entry.image_prompt, video_prompt: entry.video_prompt };
}

// ─── Main ───

async function main() {
  if (!existsSync(SETLIST_PATH)) {
    console.error(`Setlist not found: ${SETLIST_PATH}`);
    process.exit(1);
  }

  const setlist: Setlist = JSON.parse(readFileSync(SETLIST_PATH, 'utf-8'));
  let library: ImageLibrary;
  try {
    library = JSON.parse(readFileSync(LIBRARY_PATH, 'utf-8'));
  } catch {
    library = { version: 1, assets: [] };
  }

  let songs = setlist.songs;
  if (trackFilter) {
    songs = songs.filter(s => s.trackId === trackFilter);
    if (songs.length === 0) {
      console.error(`Track "${trackFilter}" not found in setlist`);
      process.exit(1);
    }
  }

  const anthropic = new Anthropic();
  const replicate = new Replicate();

  let promptCache = loadPromptCache();
  if (!promptCache) {
    promptCache = { showDate: showDate!, songs: [] };
  }

  let generated = 0;
  let skippedExisting = 0;
  let failed = 0;
  let promptsGenerated = 0;
  let libraryUpdated = false;

  console.log(`\nGenerating song videos for ${setlist.date} — ${setlist.venue}`);
  console.log(`Songs: ${songs.length} | Dry run: ${dryRun} | Force: ${force}\n`);

  for (const song of songs) {
    const songKey = titleToSlug(song.title);
    console.log(`[${song.trackId}] ${song.title} (${songKey})`);

    // Check if song already has a dedicated video in catalog
    if (!force && hasSongVideo(songKey, library)) {
      console.log(`  ○ Already has dedicated video in catalog — skipping`);
      skippedExisting++;
      continue;
    }

    // Check if video file already exists on disk (even if not in catalog)
    const vidPath = resolve(PUBLIC_DIR, 'assets', 'library', 'videos', `${songKey}-generated.mp4`);
    if (!force && existsSync(vidPath)) {
      console.log(`  ○ Video file already exists on disk — skipping`);
      skippedExisting++;
      continue;
    }

    // Step 1: Get or generate prompts
    let imagePrompt: string;
    let videoPrompt: string;

    // Check prompt cache first
    const cached = getCachedPrompts(promptCache, song.trackId);
    if (cached && !force) {
      imagePrompt = cached.image_prompt;
      videoPrompt = cached.video_prompt;
      console.log(`  ↺ Using cached prompts`);
    } else {
      console.log(`  → Generating prompts via Claude...`);
      try {
        const instrumental = isInstrumental(song.title);
        const lyrics = instrumental ? null : loadLyrics(song.title);
        if (!instrumental && !lyrics) {
          console.log(`    ⚠ No lyrics found — using title-only prompt`);
        }
        const prompts = await generatePromptsWithClaude(song.title, lyrics, instrumental, anthropic);
        imagePrompt = prompts.image_prompt;
        videoPrompt = prompts.video_prompt;

        // Save to prompt cache
        const existingIdx = promptCache.songs.findIndex(s => s.trackId === song.trackId);
        const entry: SongPromptEntry = {
          trackId: song.trackId,
          title: song.title,
          songKey,
          image_prompt: imagePrompt,
          video_prompt: videoPrompt,
          generatedAt: new Date().toISOString(),
        };
        if (existingIdx >= 0) {
          promptCache.songs[existingIdx] = entry;
        } else {
          promptCache.songs.push(entry);
        }
        promptsGenerated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ✗ Claude prompt generation failed: ${msg}`);
        failed++;
        continue;
      }
    }

    console.log(`    Image: ${imagePrompt.slice(0, 80)}...`);
    console.log(`    Video: ${videoPrompt.slice(0, 80)}...`);

    if (dryRun) {
      console.log(`  → [dry-run] Would generate: ${songKey}-generated.png + .mp4`);
      continue;
    }

    try {
      // Step 2: Generate hero still via Grok Imagine Image
      console.log(`  ⏳ Generating hero still via Grok...`);
      const imageResult = await replicate.run("xai/grok-imagine-image", {
        input: {
          prompt: imagePrompt,
          aspect_ratio: "16:9",
        },
      });

      const imgDir = resolve(PUBLIC_DIR, 'assets', 'library', 'images');
      mkdirSync(imgDir, { recursive: true });
      const imgFilename = `${songKey}-generated.png`;
      const imgPath = resolve(imgDir, imgFilename);

      const imgUrl = typeof imageResult === 'string'
        ? imageResult
        : Array.isArray(imageResult) ? imageResult[0] : String(imageResult);

      const imgSize = await downloadFile(imgUrl, imgPath);
      console.log(`    ✓ Hero still saved: assets/library/images/${imgFilename} (${(imgSize / 1024).toFixed(0)}KB)`);

      // Step 3: Image-to-video via Grok Imagine Video (15s)
      console.log(`  ⏳ Generating 15s video via Grok...`);
      const videoResult = await replicate.run("xai/grok-imagine-video", {
        input: {
          prompt: videoPrompt,
          image: imgUrl,
          aspect_ratio: "16:9",
          duration: 15,
        },
      });

      const vidDir = resolve(PUBLIC_DIR, 'assets', 'library', 'videos');
      mkdirSync(vidDir, { recursive: true });
      const vidFilename = `${songKey}-generated.mp4`;
      const finalVidPath = resolve(vidDir, vidFilename);

      const vidUrl = typeof videoResult === 'string'
        ? videoResult
        : Array.isArray(videoResult) ? videoResult[0] : String(videoResult);

      const vidSize = await downloadFile(vidUrl, finalVidPath);
      console.log(`    ✓ Video saved: assets/library/videos/${vidFilename} (${(vidSize / 1024 / 1024).toFixed(1)}MB)`);

      // Step 4: Add to image-library.json catalog
      const imgAsset: LibraryAsset = {
        id: generateId(),
        path: `assets/library/images/${imgFilename}`,
        originalFile: imgFilename,
        type: 'image',
        song: song.title,
        songKey,
        sourceShow: `gd${showDate}`,
        category: 'song',
        tags: ['generated', 'song-video-still'],
        sizeBytes: imgSize,
        addedAt: new Date().toISOString(),
      };

      const vidAsset: LibraryAsset = {
        id: generateId(),
        path: `assets/library/videos/${vidFilename}`,
        originalFile: vidFilename,
        type: 'video',
        song: song.title,
        songKey,
        sourceShow: `gd${showDate}`,
        category: 'song',
        tags: ['generated', 'song-video'],
        sizeBytes: vidSize,
        addedAt: new Date().toISOString(),
      };

      // Remove any existing generated entries for this songKey before adding
      library.assets = library.assets.filter(a =>
        !(a.songKey === songKey && a.tags?.includes('generated'))
      );
      library.assets.push(imgAsset, vidAsset);
      libraryUpdated = true;
      generated++;

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ Generation failed: ${msg}`);
      failed++;
    }
  }

  // Save prompt cache (always, even on dry-run — prompts are cheap)
  if (promptsGenerated > 0) {
    savePromptCache(promptCache);
    console.log(`\nSaved ${promptsGenerated} prompts to ${PROMPTS_PATH}`);
  }

  // Save updated library catalog
  if (libraryUpdated) {
    writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2) + '\n', 'utf-8');
    console.log(`Updated image-library.json with ${generated * 2} new entries (${generated} images + ${generated} videos)`);
  }

  console.log(`\nDone: ${generated} generated, ${promptsGenerated} new prompts, ${skippedExisting} existing, ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
