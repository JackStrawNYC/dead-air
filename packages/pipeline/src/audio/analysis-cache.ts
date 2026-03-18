/**
 * Analysis cache — avoids re-running expensive librosa analysis on unchanged audio.
 * Cache key: SHA-256 of first 10MB + file size + analysis config version.
 * Cache location: <dataDir>/cache/librosa/<hash>.json
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, openSync, readSync, closeSync } from 'fs';
import { resolve, dirname } from 'path';
import { createLogger } from '@dead-air/core';

const log = createLogger('audio:analysis-cache');

/** Bump this when analysis output format changes to invalidate old caches */
const ANALYSIS_VERSION = 1;

/** Read first N bytes of a file for hashing (avoids reading entire large FLACs) */
const HASH_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Compute a fast cache key for an audio file.
 * Uses first 10MB + file size to avoid reading entire multi-GB FLACs.
 */
export function computeAnalysisCacheKey(
  audioPath: string,
  configExtra?: Record<string, unknown>,
): string {
  const stat = statSync(audioPath);
  const hash = createHash('sha256');

  // Read first 10MB (or entire file if smaller)
  const fd = openSync(audioPath, 'r');
  const bytesToRead = Math.min(HASH_BYTES, stat.size);
  const buf = Buffer.alloc(bytesToRead);
  readSync(fd, buf, 0, bytesToRead, 0);
  closeSync(fd);

  hash.update(buf);
  hash.update(String(stat.size));
  hash.update(String(ANALYSIS_VERSION));

  if (configExtra) {
    hash.update(JSON.stringify(configExtra, Object.keys(configExtra).sort()));
  }

  return hash.digest('hex');
}

/**
 * Check if a cached analysis exists for the given audio file.
 */
export function checkAnalysisCache(
  dataDir: string,
  cacheKey: string,
): { hit: boolean; filePath: string } {
  const filePath = resolve(dataDir, 'cache', 'librosa', `${cacheKey}.json`);
  const hit = existsSync(filePath);
  if (hit) {
    log.debug(`Cache hit: ${cacheKey.slice(0, 12)}...`);
  }
  return { hit, filePath };
}

/**
 * Load cached analysis data. Returns null if cache is corrupted.
 */
export function loadAnalysisCache<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    log.warn(`Corrupted cache file, will regenerate: ${filePath}`);
    return null;
  }
}

/**
 * Store analysis result in cache.
 */
export function storeAnalysisCache(
  dataDir: string,
  cacheKey: string,
  data: unknown,
): string {
  const filePath = resolve(dataDir, 'cache', 'librosa', `${cacheKey}.json`);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(data));
  log.debug(`Cached: ${cacheKey.slice(0, 12)}...`);
  return filePath;
}
