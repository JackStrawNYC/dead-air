import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type Database from 'better-sqlite3';
import { createLogger, logCost } from '@dead-air/core';
import type { EpisodeScript, EpisodeSegment } from '@dead-air/core';
import { computeHash, checkCache, storeInCache, copyFromCache } from './cache.js';
import { generateNarration } from './narration-generator.js';
import { generateImageBatch } from './image-generator.js';
import type { BatchItem, BatchResult } from './image-generator.js';
import { generateImage } from './image-generator.js';
import type { ImageModel } from './image-generator.js';
import { compositeThumbnail } from './thumbnail-generator.js';
import { searchArchivalAssets, downloadArchivalAsset } from './archival-fetcher.js';

const log = createLogger('assets:orchestrator');

// ── Types ──

export interface AssetGenOptions {
  episodeId: string;
  db: Database.Database;
  dataDir: string;
  replicateToken: string;
  elevenlabsKey: string;
  elevenlabsVoiceId: string;
  concurrency?: number;
  skipArchival?: boolean;
  skipNarration?: boolean;
  skipImages?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

export interface AssetGenResult {
  episodeId: string;
  narrations: { key: string; filePath: string; cost: number }[];
  images: { segIndex: number; promptIndex: number; filePath: string; model: string; cost: number; cached: boolean }[];
  thumbnail: { filePath: string; cost: number } | null;
  archival: { filePath: string; title: string }[];
  totalCost: number;
  totalAssets: number;
  cachedAssets: number;
  failedAssets: string[];
}

// ── Helpers ──

function assignImageModels(
  segments: EpisodeSegment[],
): Array<{ segmentIndex: number; promptIndex: number; prompt: string; model: ImageModel }> {
  const assignments: Array<{
    segmentIndex: number;
    promptIndex: number;
    prompt: string;
    model: ImageModel;
  }> = [];

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const prompts = seg.visual.scenePrompts;

    for (let pi = 0; pi < prompts.length; pi++) {
      // First prompt of narration or concert_audio → Flux Pro (hero)
      const isHero =
        pi === 0 && (seg.type === 'narration' || seg.type === 'concert_audio');
      assignments.push({
        segmentIndex: si,
        promptIndex: pi,
        prompt: prompts[pi],
        model: isHero ? 'flux-pro' : 'flux-schnell',
      });
    }
  }

  return assignments;
}

function insertAsset(
  db: Database.Database,
  episodeId: string,
  type: string,
  service: string,
  promptHash: string | null,
  filePath: string,
  cost: number,
  metadata?: Record<string, unknown>,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO assets (id, episode_id, type, service, prompt_hash, file_path, cost, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    episodeId,
    type,
    service,
    promptHash,
    filePath,
    cost,
    metadata ? JSON.stringify(metadata) : null,
  );
}

// ── Main ──

export async function orchestrateAssetGeneration(
  options: AssetGenOptions,
): Promise<AssetGenResult> {
  const {
    episodeId,
    db,
    dataDir,
    replicateToken,
    elevenlabsKey,
    elevenlabsVoiceId,
    concurrency = 3,
    skipArchival = false,
    skipNarration = false,
    skipImages = false,
    dryRun = false,
    force = false,
  } = options;

  // 1. Load episode from DB
  const episode = db
    .prepare('SELECT * FROM episodes WHERE id = ?')
    .get(episodeId) as Record<string, unknown> | undefined;

  if (!episode) {
    throw new Error(
      `No episode found for ${episodeId}. Run 'deadair script' first.`,
    );
  }

  if (!episode.script) {
    throw new Error(
      `Episode ${episodeId} has no script. Run 'deadair script' first.`,
    );
  }

  if (episode.status === 'generated' && !force) {
    log.info(`Episode ${episodeId} assets already generated. Use --force to regenerate.`);
    return {
      episodeId,
      narrations: [],
      images: [],
      thumbnail: null,
      archival: [],
      totalCost: 0,
      totalAssets: 0,
      cachedAssets: 0,
      failedAssets: ['Episode already generated. Use --force to regenerate.'],
    };
  }

  const script: EpisodeScript = JSON.parse(episode.script as string);

  // 2. Build asset manifest
  const imageAssignments = assignImageModels(script.segments);
  const narrationKeys = skipNarration
    ? []
    : (['intro', 'set_break', 'outro'] as const);
  const narrationTexts: Record<string, string> = {
    intro: script.introNarration,
    set_break: script.setBreakNarration,
    outro: script.outroNarration,
  };

  const totalPlanned =
    narrationKeys.length +
    (skipImages ? 0 : imageAssignments.length + 1) + // +1 for thumbnail
    (skipArchival ? 0 : 1); // archival as 1 unit

  log.info(
    `Asset manifest: ${narrationKeys.length} narrations, ${imageAssignments.length} images, 1 thumbnail`,
  );

  if (dryRun) {
    console.log(JSON.stringify({
      episodeId,
      narrations: narrationKeys.map((k) => ({
        key: k,
        chars: narrationTexts[k].length,
      })),
      images: imageAssignments.map((a) => ({
        segment: a.segmentIndex,
        prompt: a.promptIndex,
        model: a.model,
        promptPreview: a.prompt.slice(0, 80) + '...',
      })),
      thumbnailPrompt: script.thumbnailPrompt.slice(0, 100) + '...',
      totalPlanned,
    }, null, 2));
    return {
      episodeId,
      narrations: [],
      images: [],
      thumbnail: null,
      archival: [],
      totalCost: 0,
      totalAssets: 0,
      cachedAssets: 0,
      failedAssets: [],
    };
  }

  // 3. Update episode status
  db.prepare(
    'UPDATE episodes SET status = ?, current_stage = ?, progress = 0 WHERE id = ?',
  ).run('generating', 'generating', episodeId);

  // 4. Set up directories
  const assetDir = resolve(dataDir, 'assets', episodeId);
  const cacheDir = resolve(dataDir, 'cache');
  const dirs = [
    resolve(assetDir, 'narration'),
    resolve(assetDir, 'images'),
    resolve(assetDir, 'thumbnail'),
    resolve(assetDir, 'archival'),
  ];
  for (const d of dirs) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }

  const result: AssetGenResult = {
    episodeId,
    narrations: [],
    images: [],
    thumbnail: null,
    archival: [],
    totalCost: 0,
    totalAssets: 0,
    cachedAssets: 0,
    failedAssets: [],
  };

  // 5. Generate narrations (sequential)
  if (!skipNarration) {
    for (const key of narrationKeys) {
      const text = narrationTexts[key];
      const destPath = resolve(assetDir, 'narration', `${key}.mp3`);

      // Cache check
      const hashParams = {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_id: elevenlabsVoiceId,
      };
      const hash = computeHash(hashParams);
      const cached = checkCache(cacheDir, 'elevenlabs', hash, 'mp3');

      if (cached.hit) {
        copyFromCache(cached.filePath, destPath);
        insertAsset(db, episodeId, 'narration', 'elevenlabs', hash, destPath, 0, { key });
        result.narrations.push({ key, filePath: destPath, cost: 0 });
        result.cachedAssets++;
        log.info(`Narration ${key}: cache hit`);
      } else {
        try {
          const narResult = await generateNarration({
            text,
            voiceId: elevenlabsVoiceId,
            apiKey: elevenlabsKey,
          });

          storeInCache(cacheDir, 'elevenlabs', hash, 'mp3', narResult.audioBuffer);
          copyFromCache(
            checkCache(cacheDir, 'elevenlabs', hash, 'mp3').filePath,
            destPath,
          );

          insertAsset(db, episodeId, 'narration', 'elevenlabs', hash, destPath, narResult.cost, { key, chars: narResult.characterCount });
          logCost(db, {
            episodeId,
            operation: `narration-${key}`,
            service: 'elevenlabs',
            cost: narResult.cost,
          });

          result.narrations.push({ key, filePath: destPath, cost: narResult.cost });
          result.totalCost += narResult.cost;
          log.info(`Narration ${key}: generated ($${narResult.cost.toFixed(4)})`);
        } catch (err) {
          const msg = `Narration ${key} failed: ${(err as Error).message}`;
          log.error(msg);
          result.failedAssets.push(msg);
        }
      }
      result.totalAssets++;
    }
  }

  // 6. Generate images (parallel with concurrency)
  if (!skipImages) {
    const batchItems: BatchItem[] = imageAssignments.map((a) => ({
      prompt: a.prompt,
      model: a.model,
      destPath: resolve(
        assetDir,
        'images',
        `seg-${String(a.segmentIndex).padStart(2, '0')}-${a.promptIndex}.png`,
      ),
      segmentIndex: a.segmentIndex,
      promptIndex: a.promptIndex,
    }));

    const batchResults = await generateImageBatch(batchItems, {
      replicateToken,
      cacheDir,
      concurrency,
    });

    for (let i = 0; i < batchResults.length; i++) {
      const br = batchResults[i];
      const item = batchItems[i];
      result.totalAssets++;

      if (br.error) {
        result.failedAssets.push(br.error);
      } else {
        const hash = computeHash({
          prompt: item.prompt,
          model: item.model,
          width: 1440,
          height: 810,
        });
        const service = item.model === 'flux-pro' ? 'replicate' : 'replicate';
        insertAsset(db, episodeId, 'image', service, hash, br.destPath, br.cost, {
          segmentIndex: item.segmentIndex,
          promptIndex: item.promptIndex,
          model: item.model,
        });

        if (br.cost > 0) {
          logCost(db, {
            episodeId,
            operation: `image-${item.model}`,
            service: 'replicate',
            cost: br.cost,
          });
        }

        result.images.push({
          segIndex: item.segmentIndex,
          promptIndex: item.promptIndex,
          filePath: br.destPath,
          model: item.model,
          cost: br.cost,
          cached: br.cached,
        });
        result.totalCost += br.cost;
        if (br.cached) result.cachedAssets++;
      }
    }

    // 7. Generate thumbnail
    const thumbDestBase = resolve(assetDir, 'thumbnail', 'thumbnail-base.png');
    const thumbDest = resolve(assetDir, 'thumbnail', 'thumbnail.png');

    const thumbHash = computeHash({
      prompt: script.thumbnailPrompt,
      model: 'flux-pro',
      width: 1440,
      height: 810,
    });
    const thumbCached = checkCache(cacheDir, 'replicate-flux', thumbHash, 'png');

    let thumbImageBuffer: Buffer | null = null;
    let thumbCost = 0;

    if (thumbCached.hit) {
      copyFromCache(thumbCached.filePath, thumbDestBase);
      thumbImageBuffer = Buffer.from(
        (await import('fs')).readFileSync(thumbDestBase),
      );
      log.info('Thumbnail base: cache hit');
      result.cachedAssets++;
    } else {
      try {
        const thumbResult = await generateImage(
          { prompt: script.thumbnailPrompt, model: 'flux-pro' },
          replicateToken,
        );
        thumbImageBuffer = thumbResult.imageBuffer;
        thumbCost = thumbResult.cost;
        storeInCache(cacheDir, 'replicate-flux', thumbHash, 'png', thumbImageBuffer);
        writeFileSync(thumbDestBase, thumbImageBuffer);

        logCost(db, {
          episodeId,
          operation: 'thumbnail-base',
          service: 'replicate',
          cost: thumbCost,
        });
      } catch (err) {
        log.error(`Thumbnail generation failed: ${(err as Error).message}`);
        result.failedAssets.push(`Thumbnail: ${(err as Error).message}`);
      }
    }

    if (thumbImageBuffer) {
      try {
        // Look up show for venue info
        const show = db
          .prepare('SELECT venue, city, state FROM shows WHERE id = ?')
          .get(episode.show_id as string) as Record<string, string> | undefined;

        const venue = [show?.venue, show?.city, show?.state]
          .filter(Boolean)
          .join(', ') || null;

        const thumbResult = await compositeThumbnail({
          imageBuffer: thumbImageBuffer,
          showDate: (episode.show_id as string) ?? '',
          venue,
          episodeTitle: script.episodeTitle,
        });

        writeFileSync(thumbDest, thumbResult.compositeBuffer);
        insertAsset(db, episodeId, 'thumbnail', 'replicate+sharp', thumbHash, thumbDest, thumbCost);
        result.thumbnail = { filePath: thumbDest, cost: thumbCost };
        result.totalCost += thumbCost;
      } catch (err) {
        log.error(`Thumbnail composite failed: ${(err as Error).message}`);
        result.failedAssets.push(`Thumbnail composite: ${(err as Error).message}`);
      }
    }
    result.totalAssets++;
  }

  // 8. Fetch archival assets (best effort)
  if (!skipArchival) {
    try {
      const show = db
        .prepare('SELECT venue FROM shows WHERE id = ?')
        .get(episode.show_id as string) as Record<string, string> | undefined;

      const archivalAssets = await searchArchivalAssets({
        showDate: episode.show_id as string,
        venue: show?.venue,
      });

      for (let i = 0; i < archivalAssets.length; i++) {
        const asset = archivalAssets[i];
        const destPath = resolve(
          assetDir,
          'archival',
          `${asset.identifier.slice(0, 50)}.jpg`,
        );

        const buffer = await downloadArchivalAsset(asset.thumbnailUrl, destPath);
        if (buffer) {
          writeFileSync(destPath, buffer);
          insertAsset(db, episodeId, 'archival', 'archive_org', null, destPath, 0, {
            identifier: asset.identifier,
            title: asset.title,
          });
          result.archival.push({ filePath: destPath, title: asset.title });
        }
      }
      result.totalAssets += archivalAssets.length;
    } catch (err) {
      log.warn(`Archival fetch error: ${(err as Error).message}`);
    }
  }

  // 9. Update episode status
  const finalStatus =
    result.narrations.length === 0 && narrationKeys.length > 0
      ? 'failed'
      : 'generated';

  db.prepare(
    `UPDATE episodes SET status = ?, current_stage = ?, progress = 1.0,
     total_cost = COALESCE(total_cost, 0) + ? WHERE id = ?`,
  ).run(finalStatus, finalStatus, result.totalCost, episodeId);

  log.info(
    `Asset generation complete: ${result.totalAssets} assets, ${result.cachedAssets} cached, $${result.totalCost.toFixed(4)} cost`,
  );

  return result;
}
