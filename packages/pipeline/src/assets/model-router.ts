import Replicate from 'replicate';
import { createLogger } from '@dead-air/core';
import { computeHash, checkCache, storeInCache, copyFromCache } from './cache.js';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('assets:model-router');

// ── Tier definitions ──

export type ImageTier = 'hero' | 'scene' | 'thumbnail' | 'video';

export type ImageProvider = 'grok-aurora' | 'flux-dev' | 'flux-schnell';

const TIER_ROUTING: Record<Exclude<ImageTier, 'video'>, ImageProvider> = {
  hero: 'grok-aurora',
  scene: 'flux-dev',
  thumbnail: 'flux-schnell',
};

const PROVIDER_COSTS: Record<ImageProvider, number> = {
  'grok-aurora': 0.07,
  'flux-dev': 0.012,
  'flux-schnell': 0.003,
};

const REPLICATE_MODELS: Record<string, string> = {
  'flux-dev': 'black-forest-labs/flux-dev',
  'flux-schnell': 'black-forest-labs/flux-schnell',
};

const NEGATIVE_PROMPT_SUFFIX =
  ', no text, no words, no letters, no writing, no signs, no logos, no watermarks';

/**
 * Ensure the prompt ends with negative instructions to prevent garbled AI text.
 */
function appendNegativePrompt(prompt: string): string {
  // Don't double-append if the prompt already has it
  if (prompt.toLowerCase().includes('no text')) return prompt;
  return prompt + NEGATIVE_PROMPT_SUFFIX;
}

// ── Result type ──

export interface RoutedImageResult {
  imageBuffer: Buffer;
  provider: ImageProvider;
  tier: ImageTier;
  cost: number;
}

// ── Grok Aurora (OpenAI-compatible API) ──

async function generateWithGrokAurora(
  prompt: string,
  apiKey: string,
): Promise<{ imageBuffer: Buffer; cost: number }> {
  const safePrompt = appendNegativePrompt(prompt);
  const response = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-2-image-1212',
      prompt: safePrompt,
      n: 1,
      size: '1440x810',
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok Aurora API error (${response.status}): ${error}`);
  }

  const data = await response.json() as {
    data: Array<{ b64_json?: string; url?: string }>;
  };

  const imageData = data.data[0];
  let imageBuffer: Buffer;

  if (imageData.b64_json) {
    imageBuffer = Buffer.from(imageData.b64_json, 'base64');
  } else if (imageData.url) {
    const imgResponse = await fetch(imageData.url);
    if (!imgResponse.ok) throw new Error(`Failed to download Grok image: ${imgResponse.status}`);
    imageBuffer = Buffer.from(await imgResponse.arrayBuffer());
  } else {
    throw new Error('Grok Aurora returned no image data');
  }

  return { imageBuffer, cost: PROVIDER_COSTS['grok-aurora'] };
}

// ── Replicate (FLUX Dev / Schnell) ──

async function generateWithReplicate(
  prompt: string,
  provider: 'flux-dev' | 'flux-schnell',
  replicateToken: string,
  width = 1440,
  height = 810,
): Promise<{ imageBuffer: Buffer; cost: number }> {
  const replicate = new Replicate({ auth: replicateToken });
  const modelId = REPLICATE_MODELS[provider];
  const safePrompt = appendNegativePrompt(prompt);

  const input: Record<string, unknown> =
    provider === 'flux-dev'
      ? { prompt: safePrompt, width, height, num_inference_steps: 25 }
      : { prompt: safePrompt, aspect_ratio: '16:9', num_outputs: 1 };

  const output = await replicate.run(modelId as `${string}/${string}`, { input });

  const imageUrl = Array.isArray(output) ? String(output[0]) : String(output);
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  return { imageBuffer, cost: PROVIDER_COSTS[provider] };
}

// ── Main router ──

export interface RouteImageOptions {
  prompt: string;
  tier: ImageTier;
  xaiApiKey?: string;
  replicateToken?: string;
  width?: number;
  height?: number;
}

export async function routeImageGeneration(
  options: RouteImageOptions,
): Promise<RoutedImageResult> {
  const { prompt, tier, xaiApiKey, replicateToken, width, height } = options;
  if (tier === 'video') {
    throw new Error('Video tier should be handled by video-generator.ts, not image routing');
  }
  let provider = TIER_ROUTING[tier];

  // Fallback: if Grok key not available, fall back hero → flux-dev
  if (provider === 'grok-aurora' && !xaiApiKey) {
    log.warn('No XAI_API_KEY — falling back hero tier to flux-dev');
    provider = 'flux-dev';
  }

  if (provider !== 'grok-aurora' && !replicateToken) {
    throw new Error(`No REPLICATE_API_TOKEN for provider ${provider}`);
  }

  log.info(`Routing ${tier} image → ${provider}`);

  let result: { imageBuffer: Buffer; cost: number };

  if (provider === 'grok-aurora') {
    result = await generateWithGrokAurora(prompt, xaiApiKey!);
  } else {
    result = await generateWithReplicate(prompt, provider, replicateToken!, width, height);
  }

  log.info(`Generated ${provider} image: ${result.imageBuffer.length} bytes, $${result.cost.toFixed(4)}`);

  return {
    imageBuffer: result.imageBuffer,
    provider,
    tier,
    cost: result.cost,
  };
}

// ── Batch router with caching ──

export interface RoutedBatchItem {
  prompt: string;
  tier: ImageTier;
  destPath: string;
  segmentIndex: number;
  promptIndex: number;
}

export interface RoutedBatchResult {
  destPath: string;
  cost: number;
  cached: boolean;
  provider: ImageProvider;
  tier: ImageTier;
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

export async function routeImageBatch(
  items: RoutedBatchItem[],
  options: {
    xaiApiKey?: string;
    replicateToken?: string;
    cacheDir: string;
    concurrency?: number;
    rateLimitMs?: number;
  },
): Promise<RoutedBatchResult[]> {
  const {
    xaiApiKey,
    replicateToken,
    cacheDir,
    concurrency = 3,
    rateLimitMs = 500,
  } = options;

  const rateLimit = createRateLimiter(rateLimitMs);
  let completed = 0;

  const tasks = items.map((item) => async (): Promise<RoutedBatchResult> => {
    if (item.tier === 'video') {
      return { destPath: item.destPath, cost: 0, cached: false, provider: 'flux-dev', tier: item.tier, error: 'Video tier not supported in image batch' };
    }
    const provider = TIER_ROUTING[item.tier];
    const cacheService =
      provider === 'grok-aurora'
        ? 'xai-aurora'
        : provider === 'flux-dev'
          ? 'replicate-flux-dev'
          : 'replicate-schnell';

    const hash = computeHash({
      prompt: item.prompt,
      provider,
      width: 1440,
      height: 810,
    });
    const cached = checkCache(cacheDir, cacheService, hash, 'png');

    if (cached.hit) {
      copyFromCache(cached.filePath, item.destPath);
      completed++;
      log.info(
        `[${completed}/${items.length}] Cache hit (${item.tier}): seg-${String(item.segmentIndex).padStart(2, '0')}-${item.promptIndex}`,
      );
      return { destPath: item.destPath, cost: 0, cached: true, provider, tier: item.tier };
    }

    try {
      await rateLimit();
      const result = await routeImageGeneration({
        prompt: item.prompt,
        tier: item.tier,
        xaiApiKey,
        replicateToken,
      });

      storeInCache(cacheDir, cacheService, hash, 'png', result.imageBuffer);
      copyFromCache(
        checkCache(cacheDir, cacheService, hash, 'png').filePath,
        item.destPath,
      );

      completed++;
      log.info(
        `[${completed}/${items.length}] Generated (${item.tier}→${result.provider}): seg-${String(item.segmentIndex).padStart(2, '0')}-${item.promptIndex}`,
      );
      return { destPath: item.destPath, cost: result.cost, cached: false, provider: result.provider, tier: item.tier };
    } catch (err) {
      completed++;
      const msg = `Failed seg-${item.segmentIndex}-${item.promptIndex} (${item.tier}): ${(err as Error).message}`;
      log.error(msg);
      return { destPath: item.destPath, cost: 0, cached: false, provider, tier: item.tier, error: msg };
    }
  });

  return runWithConcurrency(tasks, concurrency);
}
