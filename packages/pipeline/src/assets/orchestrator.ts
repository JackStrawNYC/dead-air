import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type Database from 'better-sqlite3';
import { createLogger, logCost } from '@dead-air/core';
import type { EpisodeScript, EpisodeSegment } from '@dead-air/core';
import { computeHash, checkCache, storeInCache, copyFromCache } from './cache.js';
import { generateNarration } from './narration-generator.js';
import { generateImage } from './image-generator.js';
import type { ImageModel } from './image-generator.js';
import { routeImageBatch } from './model-router.js';
import type { RoutedBatchItem, RoutedBatchResult, ImageTier } from './model-router.js';
import { compositeThumbnail } from './thumbnail-generator.js';
import { searchArchivalAssets, downloadArchivalAsset } from './archival-fetcher.js';
import { generateVideoBatch, generateMotionPrompt } from './video-generator.js';
import type { VideoBatchItem } from './video-generator.js';
import { searchWikimediaImages, downloadWikimediaImage } from './wikimedia-client.js';
import { searchFlickrImages, downloadFlickrImage } from './flickr-client.js';
import { searchLocImages, downloadLocImage } from './loc-client.js';
import { searchUcscArchive, downloadCalisphereImage } from './ucsc-archive-client.js';

const log = createLogger('assets:orchestrator');

// ── Types ──

export interface AssetGenOptions {
  episodeId: string;
  db: Database.Database;
  dataDir: string;
  replicateToken: string;
  xaiApiKey?: string;
  flickrApiKey?: string;
  elevenlabsKey: string;
  elevenlabsVoiceId: string;
  concurrency?: number;
  skipArchival?: boolean;
  skipNarration?: boolean;
  skipImages?: boolean;
  skipVideo?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

export interface AssetGenResult {
  episodeId: string;
  narrations: { key: string; filePath: string; cost: number }[];
  images: { segIndex: number; promptIndex: number; filePath: string; model: string; cost: number; cached: boolean }[];
  thumbnail: { filePath: string; cost: number } | null;
  archival: { filePath: string; title: string }[];
  videos: { segIndex: number; filePath: string; cost: number; cached: boolean }[];
  totalCost: number;
  totalAssets: number;
  cachedAssets: number;
  failedAssets: string[];
}

// ── Helpers ──

function assignImageTiers(
  segments: EpisodeSegment[],
): Array<{ segmentIndex: number; promptIndex: number; prompt: string; tier: ImageTier }> {
  const assignments: Array<{
    segmentIndex: number;
    promptIndex: number;
    prompt: string;
    tier: ImageTier;
  }> = [];

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const prompts = seg.visual.scenePrompts;

    for (let pi = 0; pi < prompts.length; pi++) {
      // First prompt of narration or concert_audio → hero (Grok Aurora)
      // Other prompts → scene (FLUX Dev, good enough behind KenBurns motion)
      const isHero =
        pi === 0 && (seg.type === 'narration' || seg.type === 'concert_audio');
      assignments.push({
        segmentIndex: si,
        promptIndex: pi,
        prompt: prompts[pi],
        tier: isHero ? 'hero' : 'scene',
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
    xaiApiKey,
    flickrApiKey,
    elevenlabsKey,
    elevenlabsVoiceId,
    concurrency = 3,
    skipArchival = false,
    skipNarration = false,
    skipImages = false,
    skipVideo = false,
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
      videos: [],
      totalCost: 0,
      totalAssets: 0,
      cachedAssets: 0,
      failedAssets: ['Episode already generated. Use --force to regenerate.'],
    };
  }

  const script: EpisodeScript = JSON.parse(episode.script as string);

  // 2. Build asset manifest
  const imageAssignments = assignImageTiers(script.segments);
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
        tier: a.tier,
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
      videos: [],
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
    videos: [],
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

  // 6. Generate images (parallel with concurrency via tiered router)
  if (!skipImages) {
    const batchItems: RoutedBatchItem[] = imageAssignments.map((a) => ({
      prompt: a.prompt,
      tier: a.tier,
      destPath: resolve(
        assetDir,
        'images',
        `seg-${String(a.segmentIndex).padStart(2, '0')}-${a.promptIndex}.png`,
      ),
      segmentIndex: a.segmentIndex,
      promptIndex: a.promptIndex,
    }));

    const batchResults = await routeImageBatch(batchItems, {
      xaiApiKey,
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
          provider: br.provider,
          width: 1440,
          height: 810,
        });
        const service = br.provider === 'grok-aurora' ? 'xai' : 'replicate';
        insertAsset(db, episodeId, 'image', service, hash, br.destPath, br.cost, {
          segmentIndex: item.segmentIndex,
          promptIndex: item.promptIndex,
          provider: br.provider,
          tier: br.tier,
        });

        if (br.cost > 0) {
          logCost(db, {
            episodeId,
            operation: `image-${br.tier}-${br.provider}`,
            service,
            cost: br.cost,
          });
        }

        result.images.push({
          segIndex: item.segmentIndex,
          promptIndex: item.promptIndex,
          filePath: br.destPath,
          model: br.provider,
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

        const buffer = await downloadArchivalAsset(asset, destPath);
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

  // 9. Generate video clips from hero images (cap at 15/episode)
  if (!skipVideo && !skipImages) {
    try {
      const heroImages = result.images
        .filter((img) => {
          const assignment = imageAssignments.find(
            (a) => a.segmentIndex === img.segIndex && a.promptIndex === img.promptIndex,
          );
          return assignment?.tier === 'hero';
        })
        .slice(0, 15);

      if (heroImages.length > 0) {
        log.info(`Generating ${heroImages.length} video clips from hero images...`);

        const videoBatchItems: VideoBatchItem[] = heroImages.map((img) => {
          const seg = script.segments[img.segIndex];
          const motionPrompt = seg?.visual?.motionPrompts?.[0]
            ?? generateMotionPrompt({
              mood: seg?.visual?.mood,
              visualIntensity: seg?.visual?.visualIntensity,
            });

          const destPath = img.filePath.replace(/\.png$/, '.mp4');
          return {
            sourceImagePath: resolve(dataDir, img.filePath),
            motionPrompt,
            destPath,
            segmentIndex: img.segIndex,
          };
        });

        const videoResults = await generateVideoBatch(videoBatchItems, {
          replicateToken,
          cacheDir,
          concurrency: 2,
        });

        for (const vr of videoResults) {
          result.totalAssets++;
          if (vr.error) {
            result.failedAssets.push(vr.error);
          } else {
            result.videos.push({
              segIndex: videoBatchItems.find((i) => i.destPath === vr.destPath)?.segmentIndex ?? 0,
              filePath: vr.destPath,
              cost: vr.cost,
              cached: vr.cached,
            });
            result.totalCost += vr.cost;
            if (vr.cached) result.cachedAssets++;

            if (vr.cost > 0) {
              logCost(db, {
                episodeId,
                operation: 'video-clip',
                service: 'replicate',
                cost: vr.cost,
              });
            }
          }
        }
      }
    } catch (err) {
      log.warn(`Video generation error: ${(err as Error).message}`);
    }
  }

  // 10. Search Wikimedia Commons for CC-licensed photos (best effort)
  if (!skipArchival) {
    try {
      const show = db
        .prepare('SELECT venue, city, state FROM shows WHERE id = ?')
        .get(episode.show_id as string) as Record<string, string> | undefined;

      const year = (episode.show_id as string)?.split('-')[0];
      const wikiImages = await searchWikimediaImages({
        venue: show?.venue,
        year,
        maxResults: 10,
      });

      const wikiDir = resolve(assetDir, 'archival', 'wikimedia');
      if (!existsSync(wikiDir)) mkdirSync(wikiDir, { recursive: true });

      for (let i = 0; i < wikiImages.length; i++) {
        const img = wikiImages[i];
        const destPath = resolve(wikiDir, `wiki-${String(i).padStart(2, '0')}.jpg`);

        const buffer = await downloadWikimediaImage(img.url);
        if (buffer) {
          writeFileSync(destPath, buffer);
          result.archival.push({ filePath: destPath, title: `Wikimedia: ${img.license}` });
          result.totalAssets++;
        }
      }
    } catch (err) {
      log.warn(`Wikimedia fetch error: ${(err as Error).message}`);
    }
  }

  // 11. Search Flickr CC for concert photography (best effort)
  if (!skipArchival && flickrApiKey) {
    try {
      const show = db
        .prepare('SELECT venue, city, state FROM shows WHERE id = ?')
        .get(episode.show_id as string) as Record<string, string> | undefined;

      const year = (episode.show_id as string)?.split('-')[0];
      const flickrImages = await searchFlickrImages({
        apiKey: flickrApiKey,
        venue: show?.venue,
        year,
        maxResults: 20,
      });

      const flickrDir = resolve(assetDir, 'archival', 'flickr');
      if (!existsSync(flickrDir)) mkdirSync(flickrDir, { recursive: true });

      for (let i = 0; i < flickrImages.length; i++) {
        const img = flickrImages[i];
        const destPath = resolve(flickrDir, `flickr-${String(i).padStart(2, '0')}.jpg`);

        const buffer = await downloadFlickrImage(img.url);
        if (buffer) {
          writeFileSync(destPath, buffer);
          result.archival.push({ filePath: destPath, title: `Flickr: ${img.title} (${img.ownerName})` });
          result.totalAssets++;
        }
      }

      log.info(`Flickr: downloaded ${flickrImages.length} CC-licensed concert photos`);
    } catch (err) {
      log.warn(`Flickr fetch error: ${(err as Error).message}`);
    }
  } else if (!skipArchival && !flickrApiKey) {
    log.info('Flickr skipped: no FLICKR_API_KEY set (get one free at flickr.com/services/api/)');
  }

  // 12. Search Library of Congress for public domain imagery (best effort)
  if (!skipArchival) {
    try {
      const show = db
        .prepare('SELECT venue, city, state FROM shows WHERE id = ?')
        .get(episode.show_id as string) as Record<string, string> | undefined;

      const year = (episode.show_id as string)?.split('-')[0];
      const locImages = await searchLocImages({
        venue: show?.venue,
        year,
        maxResults: 15,
      });

      const locDir = resolve(assetDir, 'archival', 'loc');
      if (!existsSync(locDir)) mkdirSync(locDir, { recursive: true });

      for (let i = 0; i < locImages.length; i++) {
        const img = locImages[i];
        const destPath = resolve(locDir, `loc-${String(i).padStart(2, '0')}.jpg`);

        const buffer = await downloadLocImage(img.url);
        if (buffer) {
          writeFileSync(destPath, buffer);
          result.archival.push({ filePath: destPath, title: `LOC: ${img.title}` });
          result.totalAssets++;
        }
      }

      log.info(`LOC: downloaded ${locImages.length} public domain images`);
    } catch (err) {
      log.warn(`LOC fetch error: ${(err as Error).message}`);
    }
  }

  // 13. Search UCSC Grateful Dead Archive via Calisphere (best effort)
  if (!skipArchival) {
    try {
      const ucscImages = await searchUcscArchive({ maxResults: 15 });

      const ucscDir = resolve(assetDir, 'archival', 'ucsc');
      if (!existsSync(ucscDir)) mkdirSync(ucscDir, { recursive: true });

      for (let i = 0; i < ucscImages.length; i++) {
        const img = ucscImages[i];
        const destPath = resolve(ucscDir, `ucsc-${String(i).padStart(2, '0')}.jpg`);

        const buffer = await downloadCalisphereImage(img.url);
        if (buffer) {
          writeFileSync(destPath, buffer);
          result.archival.push({ filePath: destPath, title: `UCSC: ${img.title}` });
          result.totalAssets++;
        }
      }

      log.info(`UCSC/Calisphere: downloaded ${ucscImages.length} archival images`);
    } catch (err) {
      log.warn(`UCSC archive fetch error: ${(err as Error).message}`);
    }
  }

  // 14. Update episode status
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
