import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import Replicate from 'replicate';
import { createLogger } from '@dead-air/core';
import { createRateLimiter } from '../utils/rate-limiter.js';

const log = createLogger('assets:video-gen');

const VIDEO_MODEL = 'minimax/video-01-live' as const;
const VIDEO_COST_PER_CLIP = 0.35; // ~$0.25-0.50 per 5s clip

export interface VideoGenOptions {
  sourceImagePath: string;
  motionPrompt: string;
  replicateToken: string;
  cacheDir: string;
}

export interface VideoGenResult {
  videoBuffer: Buffer;
  cost: number;
  cached: boolean;
}

function computeVideoHash(imagePath: string, motionPrompt: string): string {
  const imageContent = readFileSync(imagePath);
  const hash = createHash('sha256');
  hash.update(imageContent);
  hash.update(motionPrompt);
  return hash.digest('hex').slice(0, 16);
}

export function generateMotionPrompt(segment: {
  mood?: string;
  visualIntensity?: number;
}): string {
  const intensity = segment.visualIntensity ?? 0.5;
  const mood = segment.mood ?? 'warm';

  if (intensity > 0.8) {
    return 'subtle camera shake, dynamic handheld movement, concert energy';
  }
  if (mood === 'cosmic' || mood === 'psychedelic') {
    return 'slow zoom in, ethereal floating motion, dreamlike';
  }
  if (mood === 'dark') {
    return 'slow dolly forward, shadows shifting, atmospheric';
  }
  if (intensity < 0.3) {
    return 'very slow pan right, gentle movement, contemplative';
  }
  return 'slow pan left, documentary style, natural movement';
}

/**
 * Generate motion prompts suited to psychedelic poster art.
 * Used for concert_audio segments where images are stylized art, not photography.
 */
export function generatePsychedelicMotionPrompt(segment: {
  mood?: string;
  visualIntensity?: number;
}): string {
  const intensity = segment.visualIntensity ?? 0.5;
  const mood = segment.mood ?? 'warm';

  if (intensity > 0.8) {
    return 'rapid fractal expansion, kaleidoscopic rotation, intense psychedelic energy burst';
  }
  if (mood === 'cosmic' || mood === 'psychedelic') {
    return 'slow spiral outward, cosmic nebula rotating, ethereal morphing colors';
  }
  if (mood === 'dark') {
    return 'shadows dissolving into fractal patterns, slow organic pulse, dark energy flowing';
  }
  if (mood === 'electric') {
    return 'electric arcs branching outward, neon colors pulsing, crackling energy expansion';
  }
  if (intensity < 0.3) {
    return 'gentle color breathing, slow organic flow, contemplative rippling';
  }
  return 'flowing liquid color morphing, psychedelic patterns slowly evolving';
}

export async function generateVideo(options: VideoGenOptions): Promise<VideoGenResult> {
  const { sourceImagePath, motionPrompt, replicateToken, cacheDir } = options;

  const hash = computeVideoHash(sourceImagePath, motionPrompt);
  const cachePath = resolve(cacheDir, 'video', `${hash}.mp4`);

  if (existsSync(cachePath)) {
    log.info(`Video cache hit: ${hash}`);
    return {
      videoBuffer: readFileSync(cachePath),
      cost: 0,
      cached: true,
    };
  }

  log.info(`Generating video from ${sourceImagePath} with prompt: "${motionPrompt}"`);

  const replicate = new Replicate({ auth: replicateToken });

  // Read source image as data URI for the API
  const imageBuffer = readFileSync(sourceImagePath);
  const base64 = imageBuffer.toString('base64');
  const mimeType = sourceImagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const dataUri = `data:${mimeType};base64,${base64}`;

  const output = await replicate.run(VIDEO_MODEL as `${string}/${string}`, {
    input: {
      prompt: motionPrompt,
      first_frame_image: dataUri,
    },
  });

  const videoUrl = String(output);
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const videoBuffer = Buffer.from(await response.arrayBuffer());

  // Cache it
  const cacheVideoDir = dirname(cachePath);
  if (!existsSync(cacheVideoDir)) mkdirSync(cacheVideoDir, { recursive: true });
  writeFileSync(cachePath, videoBuffer);

  log.info(`Generated video: ${videoBuffer.length} bytes, $${VIDEO_COST_PER_CLIP}`);

  return {
    videoBuffer,
    cost: VIDEO_COST_PER_CLIP,
    cached: false,
  };
}

export interface VideoBatchItem {
  sourceImagePath: string;
  motionPrompt: string;
  destPath: string;
  segmentIndex: number;
}

export interface VideoBatchResult {
  destPath: string;
  cost: number;
  cached: boolean;
  error?: string;
}

export async function generateVideoBatch(
  items: VideoBatchItem[],
  options: {
    replicateToken: string;
    cacheDir: string;
    concurrency?: number;
    rateLimitMs?: number;
  },
): Promise<VideoBatchResult[]> {
  const {
    replicateToken,
    cacheDir,
    concurrency = 2,
    rateLimitMs = 1000,
  } = options;

  const rateLimit = createRateLimiter(rateLimitMs);
  const results: VideoBatchResult[] = [];
  const executing = new Set<Promise<void>>();
  let completed = 0;

  for (const item of items) {
    const task = (async () => {
      try {
        await rateLimit();
        const result = await generateVideo({
          sourceImagePath: item.sourceImagePath,
          motionPrompt: item.motionPrompt,
          replicateToken,
          cacheDir,
        });

        const destDir = dirname(item.destPath);
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        writeFileSync(item.destPath, result.videoBuffer);

        completed++;
        log.info(`[${completed}/${items.length}] Video seg-${item.segmentIndex}: ${result.cached ? 'cached' : `$${result.cost}`}`);
        results.push({ destPath: item.destPath, cost: result.cost, cached: result.cached });
      } catch (err) {
        completed++;
        const msg = `Video seg-${item.segmentIndex} failed: ${(err as Error).message}`;
        log.error(msg);
        results.push({ destPath: item.destPath, cost: 0, cached: false, error: msg });
      }
    })();

    executing.add(task);
    task.then(() => executing.delete(task));
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}
