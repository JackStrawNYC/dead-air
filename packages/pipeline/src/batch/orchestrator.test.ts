import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { orchestrateBatch } from './orchestrator.js';
import type { BatchManifest } from './orchestrator.js';

vi.mock('@dead-air/core', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

let tmpDir: string;
const mockDb = {} as any; // DB not used by orchestrator directly

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'deadair-batch-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('orchestrateBatch', () => {
  it('dry run processes no shows', async () => {
    const manifest: BatchManifest = {
      shows: [{ date: '1977-05-08' }, { date: '1972-08-27' }],
    };

    const produceShow = vi.fn();
    const result = await orchestrateBatch({
      manifest,
      db: mockDb,
      dataDir: tmpDir,
      produceShow,
      dryRun: true,
    });

    expect(produceShow).not.toHaveBeenCalled();
    expect(result.total).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('processes all shows successfully', async () => {
    const manifest: BatchManifest = {
      shows: [{ date: '1977-05-08' }, { date: '1972-08-27' }],
    };

    const produceShow = vi.fn().mockResolvedValue(undefined);
    const result = await orchestrateBatch({
      manifest,
      db: mockDb,
      dataDir: tmpDir,
      produceShow,
    });

    expect(produceShow).toHaveBeenCalledTimes(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('retries failed shows', async () => {
    vi.useFakeTimers();
    const manifest: BatchManifest = {
      shows: [{ date: '1977-05-08' }],
    };

    let attempts = 0;
    const produceShow = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) throw new Error('transient error');
    });

    const batchPromise = orchestrateBatch({
      manifest,
      db: mockDb,
      dataDir: tmpDir,
      produceShow,
      retries: 3,
    });

    // Advance through sleep delays
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(20000);

    const result = await batchPromise;

    expect(attempts).toBe(3); // 1 initial + 2 retries
    expect(result.succeeded).toBe(1);
    vi.useRealTimers();
  });

  it('stops on failure without --continue-on-error', async () => {
    const manifest: BatchManifest = {
      shows: [{ date: '1977-05-08' }, { date: '1972-08-27' }],
    };

    const produceShow = vi.fn().mockRejectedValue(new Error('fail'));
    const result = await orchestrateBatch({
      manifest,
      db: mockDb,
      dataDir: tmpDir,
      produceShow,
      retries: 0,
      continueOnError: false,
    });

    expect(produceShow).toHaveBeenCalledTimes(1); // stopped after first failure
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(1); // second show never attempted
  });

  it('continues on failure with --continue-on-error', async () => {
    const manifest: BatchManifest = {
      shows: [{ date: '1977-05-08' }, { date: '1972-08-27' }],
    };

    let callCount = 0;
    const produceShow = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('first fails');
      // second succeeds
    });

    const result = await orchestrateBatch({
      manifest,
      db: mockDb,
      dataDir: tmpDir,
      produceShow,
      retries: 0,
      continueOnError: true,
    });

    expect(produceShow).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(1);
  });

  it('sorts shows by priority (higher first)', async () => {
    const manifest: BatchManifest = {
      shows: [
        { date: '1977-05-08', priority: 1 },
        { date: '1972-08-27', priority: 10 },
        { date: '1989-07-04', priority: 5 },
      ],
    };

    const callOrder: string[] = [];
    const produceShow = vi.fn().mockImplementation(async (date: string) => {
      callOrder.push(date);
    });

    await orchestrateBatch({
      manifest,
      db: mockDb,
      dataDir: tmpDir,
      produceShow,
    });

    expect(callOrder).toEqual(['1972-08-27', '1989-07-04', '1977-05-08']);
  });

  it('passes from/to/model options to produceShow', async () => {
    const manifest: BatchManifest = {
      shows: [{ date: '1977-05-08', from: 'analyze', to: 'script' }],
      defaults: { model: 'claude-sonnet-4-5-20250929' },
    };

    const produceShow = vi.fn().mockResolvedValue(undefined);
    await orchestrateBatch({
      manifest,
      db: mockDb,
      dataDir: tmpDir,
      produceShow,
    });

    expect(produceShow).toHaveBeenCalledWith('1977-05-08', expect.objectContaining({
      from: 'analyze',
      to: 'script',
    }));
  });
});
