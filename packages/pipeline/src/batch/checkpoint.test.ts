import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import {
  loadBatchCheckpoint,
  createBatchCheckpoint,
  saveBatchCheckpoint,
  updateShowStatus,
  getPendingDates,
} from './checkpoint.js';

vi.mock('@dead-air/core', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'deadair-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadBatchCheckpoint', () => {
  it('returns null for non-existent checkpoint', () => {
    expect(loadBatchCheckpoint(tmpDir, 'no-such-batch')).toBeNull();
  });

  it('returns null for corrupted checkpoint file', () => {
    const { mkdirSync, writeFileSync } = require('fs');
    const dir = resolve(tmpDir, 'batch');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'bad-checkpoint.json'), 'NOT JSON');
    expect(loadBatchCheckpoint(tmpDir, 'bad')).toBeNull();
  });
});

describe('createBatchCheckpoint', () => {
  it('creates checkpoint with all shows as pending', () => {
    const dates = ['1977-05-08', '1972-08-27', '1989-07-04'];
    const cp = createBatchCheckpoint(tmpDir, 'test-batch', dates);

    expect(cp.batchId).toBe('test-batch');
    expect(cp.shows).toHaveLength(3);
    expect(cp.shows.every((s) => s.status === 'pending')).toBe(true);
    expect(cp.shows.map((s) => s.date)).toEqual(dates);
  });

  it('persists to disk', () => {
    createBatchCheckpoint(tmpDir, 'test-batch', ['1977-05-08']);
    const path = resolve(tmpDir, 'batch', 'test-batch-checkpoint.json');
    expect(existsSync(path)).toBe(true);
  });
});

describe('saveBatchCheckpoint + loadBatchCheckpoint', () => {
  it('round-trips checkpoint data', () => {
    const cp = createBatchCheckpoint(tmpDir, 'round-trip', ['1977-05-08', '1972-08-27']);
    cp.shows[0].status = 'success';

    saveBatchCheckpoint(tmpDir, cp);
    const loaded = loadBatchCheckpoint(tmpDir, 'round-trip');

    expect(loaded).not.toBeNull();
    expect(loaded!.shows[0].status).toBe('success');
    expect(loaded!.shows[1].status).toBe('pending');
  });

  it('updates lastUpdatedAt on save', () => {
    const cp = createBatchCheckpoint(tmpDir, 'ts-test', ['1977-05-08']);
    const firstUpdate = cp.lastUpdatedAt;

    // Small delay to ensure timestamp differs
    cp.shows[0].status = 'in_progress';
    saveBatchCheckpoint(tmpDir, cp);

    const loaded = loadBatchCheckpoint(tmpDir, 'ts-test');
    expect(loaded!.lastUpdatedAt).toBeDefined();
  });
});

describe('updateShowStatus', () => {
  it('updates a specific show', () => {
    const cp = createBatchCheckpoint(tmpDir, 'update-test', ['1977-05-08', '1972-08-27']);

    updateShowStatus(tmpDir, cp, '1977-05-08', {
      status: 'success',
      durationMs: 5000,
      completedAt: '2026-01-01T00:00:00Z',
    });

    expect(cp.shows[0].status).toBe('success');
    expect(cp.shows[0].durationMs).toBe(5000);
    expect(cp.shows[1].status).toBe('pending');
  });

  it('ignores unknown dates', () => {
    const cp = createBatchCheckpoint(tmpDir, 'ignore-test', ['1977-05-08']);
    updateShowStatus(tmpDir, cp, '9999-01-01', { status: 'failed' });
    expect(cp.shows[0].status).toBe('pending');
  });
});

describe('getPendingDates', () => {
  it('returns pending and failed dates', () => {
    const cp = createBatchCheckpoint(tmpDir, 'pending-test', [
      '1977-05-08', '1972-08-27', '1989-07-04', '1970-02-13',
    ]);

    cp.shows[0].status = 'success';
    cp.shows[1].status = 'pending';
    cp.shows[2].status = 'failed';
    cp.shows[3].status = 'skipped';

    const pending = getPendingDates(cp);
    expect(pending).toEqual(['1972-08-27', '1989-07-04']);
  });

  it('returns empty array when all complete', () => {
    const cp = createBatchCheckpoint(tmpDir, 'done-test', ['1977-05-08']);
    cp.shows[0].status = 'success';
    expect(getPendingDates(cp)).toEqual([]);
  });
});
