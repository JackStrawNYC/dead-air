/**
 * Batch orchestrator — processes multiple shows sequentially.
 * Shows share GPU/DB resources so they run one at a time.
 * Supports retry with exponential backoff and checkpoint/resume.
 */
import type Database from 'better-sqlite3';
import { createLogger } from '@dead-air/core';
import {
  type BatchCheckpoint,
  loadBatchCheckpoint,
  createBatchCheckpoint,
  saveBatchCheckpoint,
  updateShowStatus,
  getPendingDates,
  printCheckpointSummary,
} from './checkpoint.js';

const log = createLogger('batch:orchestrator');

export interface BatchManifest {
  shows: Array<{
    date: string;
    priority?: number;
    from?: string;
    to?: string;
  }>;
  defaults?: {
    model?: string;
    from?: string;
    to?: string;
  };
}

export interface BatchOptions {
  manifest: BatchManifest;
  db: Database.Database;
  dataDir: string;
  /** Produce function to call for each show */
  produceShow: (date: string, options: {
    from?: string;
    to?: string;
    model?: string;
    force?: boolean;
  }) => Promise<void>;
  model?: string;
  retries?: number;
  continueOnError?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

export interface BatchResult {
  batchId: string;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Run the batch pipeline for multiple shows.
 */
export async function orchestrateBatch(options: BatchOptions): Promise<BatchResult> {
  const {
    manifest,
    dataDir,
    produceShow,
    model,
    retries = 2,
    continueOnError = false,
    dryRun = false,
    force = false,
  } = options;

  const batchStart = Date.now();

  // Sort shows by priority (higher first), then by date
  const sortedShows = [...manifest.shows].sort((a, b) => {
    if ((a.priority ?? 0) !== (b.priority ?? 0)) return (b.priority ?? 0) - (a.priority ?? 0);
    return a.date.localeCompare(b.date);
  });

  const dates = sortedShows.map((s) => s.date);
  const batchId = `batch-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

  log.info(`=== Batch: ${dates.length} shows ===`);

  if (dryRun) {
    for (let i = 0; i < sortedShows.length; i++) {
      const show = sortedShows[i];
      const from = show.from ?? manifest.defaults?.from ?? 'ingest';
      const to = show.to ?? manifest.defaults?.to ?? 'render';
      console.log(`  [${i + 1}/${sortedShows.length}] ${show.date} (${from} → ${to})`);
    }
    console.log('\n(dry run — no shows processed)');
    return { batchId, total: dates.length, succeeded: 0, failed: 0, skipped: dates.length, durationMs: 0 };
  }

  // Load or create checkpoint
  let checkpoint = loadBatchCheckpoint(dataDir, batchId);
  if (!checkpoint) {
    checkpoint = createBatchCheckpoint(dataDir, batchId, dates);
  }

  const pendingDates = getPendingDates(checkpoint);
  if (pendingDates.length < dates.length) {
    log.info(`Resuming: ${dates.length - pendingDates.length} already complete`);
  }

  for (let i = 0; i < sortedShows.length; i++) {
    const show = sortedShows[i];
    const entry = checkpoint.shows.find((s) => s.date === show.date);
    if (!entry || entry.status === 'success' || entry.status === 'skipped') continue;

    const from = show.from ?? manifest.defaults?.from ?? 'ingest';
    const to = show.to ?? manifest.defaults?.to ?? 'render';
    const showModel = model ?? manifest.defaults?.model;

    const showStart = Date.now();
    updateShowStatus(dataDir, checkpoint, show.date, {
      status: 'in_progress',
      startedAt: new Date().toISOString(),
    });

    let succeeded = false;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const backoffMs = 5000 * Math.pow(2, attempt - 1); // 5s, 10s, 20s
        log.info(`  Retry ${attempt}/${retries} after ${backoffMs / 1000}s...`);
        await sleep(backoffMs);
      }

      try {
        console.log(`[${i + 1}/${sortedShows.length}] ${show.date} (${from} → ${to})${attempt > 0 ? ` [retry ${attempt}]` : ''}`);
        await produceShow(show.date, { from, to, model: showModel, force });
        succeeded = true;
        break;
      } catch (err) {
        lastError = (err as Error).message;
        log.error(`  ${show.date} attempt ${attempt + 1} failed: ${lastError}`);
      }
    }

    const durationMs = Date.now() - showStart;
    if (succeeded) {
      updateShowStatus(dataDir, checkpoint, show.date, {
        status: 'success',
        completedAt: new Date().toISOString(),
        durationMs,
      });
      console.log(`[${i + 1}/${sortedShows.length}] ${show.date} SUCCESS (${formatDuration(durationMs)})`);
    } else {
      updateShowStatus(dataDir, checkpoint, show.date, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        durationMs,
        error: lastError,
      });
      console.log(`[${i + 1}/${sortedShows.length}] ${show.date} FAILED: ${lastError}`);

      if (!continueOnError) {
        log.error('Stopping batch due to failure (use --continue-on-error to skip failed shows)');
        break;
      }
    }
  }

  printCheckpointSummary(checkpoint);

  const result: BatchResult = {
    batchId,
    total: sortedShows.length,
    succeeded: checkpoint.shows.filter((s) => s.status === 'success').length,
    failed: checkpoint.shows.filter((s) => s.status === 'failed').length,
    skipped: checkpoint.shows.filter((s) => s.status === 'pending' || s.status === 'skipped').length,
    durationMs: Date.now() - batchStart,
  };

  log.info(`Batch complete: ${result.succeeded}/${result.total} succeeded in ${formatDuration(result.durationMs)}`);
  return result;
}
