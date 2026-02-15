import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { createLogger } from '@dead-air/core';

const log = createLogger('assets:cache');

export interface CacheResult {
  hit: boolean;
  filePath: string;
  hash: string;
}

/**
 * Compute a deterministic SHA-256 hash of generation parameters.
 */
export function computeHash(params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  return createHash('sha256').update(sorted).digest('hex');
}

/**
 * Check if a cached file exists for the given parameters.
 */
export function checkCache(
  cacheDir: string,
  service: string,
  hash: string,
  ext: string,
): CacheResult {
  const filePath = resolve(cacheDir, service, `${hash}.${ext}`);
  const hit = existsSync(filePath);
  if (hit) {
    log.debug(`Cache hit: ${service}/${hash.slice(0, 12)}...`);
  }
  return { hit, filePath, hash };
}

/**
 * Store data in the cache and return the cached file path.
 */
export function storeInCache(
  cacheDir: string,
  service: string,
  hash: string,
  ext: string,
  data: Buffer,
): string {
  const filePath = resolve(cacheDir, service, `${hash}.${ext}`);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, data);
  log.debug(`Cached: ${service}/${hash.slice(0, 12)}...`);
  return filePath;
}

/**
 * Copy a cached file to the asset output directory.
 */
export function copyFromCache(cachedPath: string, destPath: string): void {
  const dir = dirname(destPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  copyFileSync(cachedPath, destPath);
}
