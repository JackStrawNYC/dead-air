/**
 * Song Art Generator — per-song AI imagery via Replicate/Flux/Grok Aurora.
 *
 * Hero songs (in song-identities.ts): Grok Aurora, 3 variants ($0.07 × 3 = $0.21/song)
 * Other songs: Flux Dev, 2 variants ($0.012 × 2 = $0.024/song)
 * Estimated cost: ~$2.34/show (well under $15-20 budget)
 *
 * Uses existing model-router and cache infrastructure.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { createLogger } from '@dead-air/core';
import { computeHash, checkCache, storeInCache } from './cache.js';
import {
  buildSongArtPrompt,
  isHeroSong,
  detectEra,
  type ShowEra,
  type SongArtPromptOptions,
} from './song-art-prompts.js';

const log = createLogger('assets:song-art-generator');

export interface SongArtConfig {
  songTitle: string;
  songKey: string;
  palette?: { primary: number; secondary: number };
  avgEnergy?: number;
}

export interface ShowArtOptions {
  date: string;
  episodeId: string;
  songs: SongArtConfig[];
  replicateToken: string;
  xaiApiKey?: string;
  dataDir: string;
  force?: boolean;
  concurrency?: number;
}

export interface ShowArtResult {
  generated: number;
  cached: number;
  totalCost: number;
  songArtPaths: Map<string, string[]>;
}

/**
 * Generate a single image via Replicate API.
 */
async function generateImageReplicate(
  prompt: string,
  model: string,
  token: string,
): Promise<Buffer> {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: {
        prompt,
        width: 1920,
        height: 1080,
        num_outputs: 1,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Replicate API error: ${response.status} ${await response.text()}`);
  }

  const prediction = await response.json() as { id: string; urls: { get: string } };

  // Poll for completion
  let result: { status: string; output?: string[] };
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(prediction.urls.get, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    result = await poll.json() as { status: string; output?: string[] };
    if (result.status === 'succeeded' && result.output?.[0]) {
      const imgResponse = await fetch(result.output[0]);
      return Buffer.from(await imgResponse.arrayBuffer());
    }
    if (result.status === 'failed') {
      throw new Error('Replicate prediction failed');
    }
  }

  throw new Error('Replicate prediction timed out');
}

/**
 * Generate song art for a single song (all variants).
 */
async function generateSongArt(
  config: SongArtConfig,
  era: ShowEra,
  episodeId: string,
  dataDir: string,
  cacheDir: string,
  replicateToken: string,
  force: boolean,
): Promise<{ paths: string[]; cost: number; cached: number }> {
  const isHero = isHeroSong(config.songKey);
  const variantCount = isHero ? 3 : 2;
  const model = isHero ? 'black-forest-labs/flux-1.1-pro' : 'black-forest-labs/flux-dev';
  const costPerImage = isHero ? 0.07 : 0.012;

  const paths: string[] = [];
  let cost = 0;
  let cached = 0;

  for (let v = 0; v < variantCount; v++) {
    const promptOptions: SongArtPromptOptions = {
      songTitle: config.songTitle,
      songKey: config.songKey,
      era,
      palette: config.palette,
      avgEnergy: config.avgEnergy,
      variant: v,
    };

    const prompt = buildSongArtPrompt(promptOptions);
    const cacheKey = computeHash({
      prompt,
      model,
      songKey: config.songKey,
      variant: v,
    });

    const cacheResult = checkCache(cacheDir, 'song-art', cacheKey, 'png');
    const outputPath = resolve(
      dataDir,
      'assets',
      episodeId,
      'song-art',
      `${config.songKey}-v${v}.png`,
    );

    if (!force && cacheResult.hit) {
      // Copy from cache
      const dir = dirname(outputPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const { copyFromCache } = await import('./cache.js');
      copyFromCache(cacheResult.filePath, outputPath);
      paths.push(outputPath);
      cached++;
      continue;
    }

    try {
      log.info(`  Generating ${config.songKey} v${v} (${isHero ? 'hero' : 'standard'})...`);
      const imageBuffer = await generateImageReplicate(prompt, model, replicateToken);

      // Store in cache
      storeInCache(cacheDir, 'song-art', cacheKey, 'png', imageBuffer);

      // Write to output
      const dir = dirname(outputPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(outputPath, imageBuffer);

      paths.push(outputPath);
      cost += costPerImage;
    } catch (err) {
      log.warn(`  Failed to generate ${config.songKey} v${v}: ${(err as Error).message}`);
    }
  }

  return { paths, cost, cached };
}

/**
 * Generate song art for all songs in a show.
 */
export async function generateShowSongArt(options: ShowArtOptions): Promise<ShowArtResult> {
  const {
    date,
    episodeId,
    songs,
    replicateToken,
    dataDir,
    force = false,
    concurrency = 2,
  } = options;

  const era = detectEra(date);
  const cacheDir = resolve(dataDir, 'cache');
  const songArtPaths = new Map<string, string[]>();
  let totalGenerated = 0;
  let totalCached = 0;
  let totalCost = 0;

  log.info(`Song art generation: ${songs.length} songs, era=${era}, concurrency=${concurrency}`);

  // Process with concurrency control
  const queue = [...songs];

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      const song = queue.shift()!;
      const result = await generateSongArt(
        song,
        era,
        episodeId,
        dataDir,
        cacheDir,
        replicateToken,
        force,
      );
      songArtPaths.set(song.songKey, result.paths);
      totalGenerated += result.paths.length - result.cached;
      totalCached += result.cached;
      totalCost += result.cost;
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, songs.length) }, () => processNext());
  await Promise.all(workers);

  log.info(`Song art: ${totalGenerated} generated, ${totalCached} cached, $${totalCost.toFixed(4)} cost`);

  return {
    generated: totalGenerated,
    cached: totalCached,
    totalCost,
    songArtPaths,
  };
}
