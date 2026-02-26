import { resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { createLogger, logCost } from '@dead-air/core';
import type Database from 'better-sqlite3';
import { generateImage, type ImageModel } from './image-generator.js';
import { compositeThumbnail } from './thumbnail-generator.js';

const log = createLogger('assets:thumbnail-pipeline');

export interface ThumbnailPipelineOptions {
  episodeId: string;
  db: Database.Database;
  dataDir: string;
  replicateToken: string;
  thumbnailPrompt: string;
  showDate: string;
  venue: string | null;
  episodeTitle: string;
  /** Number of A/B variants to generate (default: 2) */
  variants?: number;
  /** Image model to use (default: 'flux-pro') */
  model?: ImageModel;
  force?: boolean;
}

export interface ThumbnailPipelineResult {
  thumbnailPaths: string[];
  cost: number;
}

/**
 * Generate A/B thumbnail variants.
 *
 * 1. Generate hero images from thumbnailPrompt using Flux Pro
 * 2. Composite text overlays (date, venue, title, branding)
 * 3. Output PNG variants for A/B testing
 */
export async function generateThumbnails(
  options: ThumbnailPipelineOptions,
): Promise<ThumbnailPipelineResult> {
  const {
    episodeId, db, dataDir, replicateToken,
    thumbnailPrompt, showDate, venue, episodeTitle,
    variants = 2, model = 'flux-pro', force = false,
  } = options;

  const thumbDir = resolve(dataDir, 'renders', episodeId, 'thumbnails');
  if (!existsSync(thumbDir)) mkdirSync(thumbDir, { recursive: true });

  const paths: string[] = [];
  let totalCost = 0;

  for (let v = 0; v < variants; v++) {
    const variantLabel = String.fromCharCode(65 + v); // A, B, C...
    const outputPath = resolve(thumbDir, `thumbnail-${variantLabel}.png`);

    if (!force && existsSync(outputPath)) {
      log.info(`Thumbnail variant ${variantLabel} exists — skipping`);
      paths.push(outputPath);
      continue;
    }

    // Slightly vary the prompt for each variant
    const variantSuffix = v === 0
      ? ', dramatic lighting, high contrast'
      : ', warm golden hour tones, nostalgic atmosphere';
    const fullPrompt = `${thumbnailPrompt}${variantSuffix}, YouTube thumbnail style, cinematic composition, rule of thirds, 1280x720, no text, no words, no letters`;

    log.info(`Generating thumbnail variant ${variantLabel}...`);

    try {
      // Generate hero image
      const imageResult = await generateImage({
        prompt: fullPrompt,
        model,
        width: 1920,
        height: 1080,
      }, replicateToken);
      totalCost += imageResult.cost;

      // Composite text overlay
      const composited = await compositeThumbnail({
        imageBuffer: imageResult.imageBuffer,
        showDate,
        venue,
        episodeTitle,
      });

      writeFileSync(outputPath, composited.compositeBuffer);
      paths.push(outputPath);
      log.info(`Thumbnail variant ${variantLabel}: ${outputPath} (${composited.compositeBuffer.length} bytes)`);
    } catch (err) {
      log.error(`Failed to generate thumbnail variant ${variantLabel}: ${err}`);
    }
  }

  if (totalCost > 0) {
    logCost(db, { episodeId, service: 'replicate', operation: 'thumbnails', cost: totalCost });
  }

  log.info(`Generated ${paths.length}/${variants} thumbnail variants ($${totalCost.toFixed(3)})`);

  return { thumbnailPaths: paths, cost: totalCost };
}
