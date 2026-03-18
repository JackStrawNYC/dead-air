import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import {
  computeAnalysisCacheKey,
  checkAnalysisCache,
  loadAnalysisCache,
  storeAnalysisCache,
} from './analysis-cache.js';

vi.mock('@dead-air/core', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

let tmpDir: string;
let testAudioPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'deadair-cache-'));
  // Create a small test "audio" file
  testAudioPath = resolve(tmpDir, 'test.flac');
  writeFileSync(testAudioPath, Buffer.alloc(1024, 0xAB));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('computeAnalysisCacheKey', () => {
  it('returns a hex string', () => {
    const key = computeAnalysisCacheKey(testAudioPath);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns same key for same file', () => {
    const key1 = computeAnalysisCacheKey(testAudioPath);
    const key2 = computeAnalysisCacheKey(testAudioPath);
    expect(key1).toBe(key2);
  });

  it('returns different key for different files', () => {
    const otherPath = resolve(tmpDir, 'other.flac');
    writeFileSync(otherPath, Buffer.alloc(1024, 0xCD));

    const key1 = computeAnalysisCacheKey(testAudioPath);
    const key2 = computeAnalysisCacheKey(otherPath);
    expect(key1).not.toBe(key2);
  });

  it('returns different key with different configExtra', () => {
    const key1 = computeAnalysisCacheKey(testAudioPath, { type: 'enhanced' });
    const key2 = computeAnalysisCacheKey(testAudioPath, { type: 'basic' });
    expect(key1).not.toBe(key2);
  });

  it('returns different key for different file sizes', () => {
    const key1 = computeAnalysisCacheKey(testAudioPath);
    // Append data to make it a different size
    const bigPath = resolve(tmpDir, 'big.flac');
    writeFileSync(bigPath, Buffer.alloc(2048, 0xAB));
    const key2 = computeAnalysisCacheKey(bigPath);
    expect(key1).not.toBe(key2);
  });
});

describe('checkAnalysisCache', () => {
  it('returns miss for non-existent cache', () => {
    const result = checkAnalysisCache(tmpDir, 'nonexistent-hash');
    expect(result.hit).toBe(false);
  });

  it('returns hit when cache file exists', () => {
    const cacheDir = resolve(tmpDir, 'cache', 'librosa');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(resolve(cacheDir, 'test-hash.json'), '{}');

    const result = checkAnalysisCache(tmpDir, 'test-hash');
    expect(result.hit).toBe(true);
    expect(result.filePath).toContain('test-hash.json');
  });
});

describe('storeAnalysisCache + loadAnalysisCache', () => {
  it('round-trips JSON data', () => {
    const data = { meta: { duration: 120 }, frames: [{ rms: 0.5 }] };
    storeAnalysisCache(tmpDir, 'round-trip-key', data);

    const result = checkAnalysisCache(tmpDir, 'round-trip-key');
    expect(result.hit).toBe(true);

    const loaded = loadAnalysisCache(result.filePath);
    expect(loaded).toEqual(data);
  });

  it('creates cache directory if needed', () => {
    storeAnalysisCache(tmpDir, 'auto-mkdir-key', { test: true });
    const result = checkAnalysisCache(tmpDir, 'auto-mkdir-key');
    expect(result.hit).toBe(true);
  });
});

describe('loadAnalysisCache error handling', () => {
  it('returns null for corrupted cache file', () => {
    const cacheDir = resolve(tmpDir, 'cache', 'librosa');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(resolve(cacheDir, 'corrupt.json'), 'NOT VALID JSON {{{');

    const result = loadAnalysisCache(resolve(cacheDir, 'corrupt.json'));
    expect(result).toBeNull();
  });
});
