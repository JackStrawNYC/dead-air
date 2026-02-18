import Replicate from 'replicate';
import { createLogger } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';
import { computeHash, checkCache, storeInCache, copyFromCache } from './cache.js';

const log = createLogger('assets:images');

export type ImageModel = 'flux-pro' | 'flux-schnell';

export interface ImageGenOptions {
  prompt: string;
  model: ImageModel;
  width?: number;
  height?: number;
}

export interface ImageGenResult {
  imageBuffer: Buffer;
  model: ImageModel;
  cost: number;
}

const MODEL_IDS: Record<ImageModel, string> = {
  'flux-pro': 'black-forest-labs/flux-1.1-pro',
  'flux-schnell': 'black-forest-labs/flux-schnell',
};

// Approximate costs per image
const MODEL_COSTS: Record<ImageModel, number> = {
  'flux-pro': 0.05,
  'flux-schnell': 0.003,
};

const STYLE_PREFIX =
  'vintage 1970s documentary concert photography, 35mm film grain, warm analog tones, ';

const NEGATIVE_PROMPT_SUFFIX =
  ', no text, no words, no letters, no writing, no signs, no logos, no watermarks, no named individuals, no celebrity likenesses';

function stylizePrompt(prompt: string): string {
  let result = prompt;
  if (!result.toLowerCase().includes('documentary') && !result.toLowerCase().includes('35mm')) {
    result = STYLE_PREFIX + result;
  }
  if (!result.toLowerCase().includes('no text')) {
    result += NEGATIVE_PROMPT_SUFFIX;
  }
  return result;
}

/**
 * Generate a single image via Replicate.
 */
export async function generateImage(
  options: ImageGenOptions,
  replicateToken: string,
): Promise<ImageGenResult> {
  const { prompt, model, width = 1440, height = 810 } = options;

  const replicate = new Replicate({ auth: replicateToken });
  const modelId = MODEL_IDS[model];
  const safePrompt = stylizePrompt(prompt);

  const input: Record<string, unknown> =
    model === 'flux-pro'
      ? { prompt: safePrompt, width, height, num_inference_steps: 25 }
      : { prompt: safePrompt, aspect_ratio: '16:9', num_outputs: 1 };

  log.info(`Generating ${model} image...`);

  const output = await replicate.run(modelId as `${string}/${string}`, { input });

  // Replicate returns URL(s) — handle both formats
  const imageUrl = Array.isArray(output)
    ? String(output[0])
    : typeof output === 'string'
      ? output
      : String(output);

  // Download the image
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const imageBuffer = Buffer.from(await response.arrayBuffer());
  const cost = MODEL_COSTS[model];

  log.info(`Image generated: ${imageBuffer.length} bytes (${model}), $${cost.toFixed(4)}`);

  return { imageBuffer, model, cost };
}

// ── Batch generation with concurrency ──

export interface BatchItem {
  prompt: string;
  model: ImageModel;
  destPath: string;
  segmentIndex: number;
  promptIndex: number;
}

export interface BatchResult {
  destPath: string;
  cost: number;
  cached: boolean;
  error?: string;
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = (async () => {
      const result = await task();
      results.push(result);
    })();
    executing.add(p);
    p.then(() => executing.delete(p));

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Generate a batch of images with concurrency control and caching.
 */
export async function generateImageBatch(
  items: BatchItem[],
  options: {
    replicateToken: string;
    cacheDir: string;
    concurrency?: number;
    rateLimitMs?: number;
  },
): Promise<BatchResult[]> {
  const {
    replicateToken,
    cacheDir,
    concurrency = 3,
    rateLimitMs = 500,
  } = options;

  const rateLimit = createRateLimiter(rateLimitMs);
  let completed = 0;

  const tasks = items.map((item) => async (): Promise<BatchResult> => {
    const cacheService =
      item.model === 'flux-pro' ? 'replicate-flux' : 'replicate-schnell';
    const hashParams = {
      prompt: item.prompt,
      model: item.model,
      width: 1440,
      height: 810,
    };
    const hash = computeHash(hashParams);
    const cached = checkCache(cacheDir, cacheService, hash, 'png');

    if (cached.hit) {
      copyFromCache(cached.filePath, item.destPath);
      completed++;
      log.info(
        `[${completed}/${items.length}] Cache hit: seg-${String(item.segmentIndex).padStart(2, '0')}-${item.promptIndex}`,
      );
      return { destPath: item.destPath, cost: 0, cached: true };
    }

    try {
      await rateLimit();
      const result = await generateImage(
        { prompt: item.prompt, model: item.model },
        replicateToken,
      );

      storeInCache(cacheDir, cacheService, hash, 'png', result.imageBuffer);
      copyFromCache(
        checkCache(cacheDir, cacheService, hash, 'png').filePath,
        item.destPath,
      );

      completed++;
      log.info(
        `[${completed}/${items.length}] Generated: seg-${String(item.segmentIndex).padStart(2, '0')}-${item.promptIndex} (${item.model})`,
      );
      return { destPath: item.destPath, cost: result.cost, cached: false };
    } catch (err) {
      completed++;
      const msg = `Failed seg-${item.segmentIndex}-${item.promptIndex}: ${(err as Error).message}`;
      log.error(msg);
      return { destPath: item.destPath, cost: 0, cached: false, error: msg };
    }
  });

  return runWithConcurrency(tasks, concurrency);
}
