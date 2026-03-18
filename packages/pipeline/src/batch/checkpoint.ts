/**
 * Batch checkpoint/resume — tracks per-show status so a multi-show batch
 * can resume from where it left off after failures.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { createLogger } from '@dead-air/core';

const log = createLogger('batch:checkpoint');

export type ShowStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'skipped';

export interface ShowCheckpointEntry {
  date: string;
  status: ShowStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  durationMs?: number;
  lastCompletedStage?: string;
}

export interface BatchCheckpoint {
  batchId: string;
  startedAt: string;
  lastUpdatedAt: string;
  shows: ShowCheckpointEntry[];
}

function getCheckpointPath(dataDir: string, batchId: string): string {
  return resolve(dataDir, 'batch', `${batchId}-checkpoint.json`);
}

/**
 * Load an existing batch checkpoint, or return null.
 */
export function loadBatchCheckpoint(dataDir: string, batchId: string): BatchCheckpoint | null {
  const path = getCheckpointPath(dataDir, batchId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Create a new batch checkpoint.
 */
export function createBatchCheckpoint(
  dataDir: string,
  batchId: string,
  dates: string[],
): BatchCheckpoint {
  const checkpoint: BatchCheckpoint = {
    batchId,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    shows: dates.map((date) => ({ date, status: 'pending' })),
  };
  saveBatchCheckpoint(dataDir, checkpoint);
  return checkpoint;
}

/**
 * Save the batch checkpoint to disk.
 */
export function saveBatchCheckpoint(dataDir: string, checkpoint: BatchCheckpoint): void {
  const path = getCheckpointPath(dataDir, checkpoint.batchId);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  checkpoint.lastUpdatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(checkpoint, null, 2));
}

/**
 * Update a single show's status within the checkpoint.
 */
export function updateShowStatus(
  dataDir: string,
  checkpoint: BatchCheckpoint,
  date: string,
  update: Partial<ShowCheckpointEntry>,
): void {
  const entry = checkpoint.shows.find((s) => s.date === date);
  if (entry) {
    Object.assign(entry, update);
    saveBatchCheckpoint(dataDir, checkpoint);
  }
}

/**
 * Get dates that still need processing (pending or failed).
 */
export function getPendingDates(checkpoint: BatchCheckpoint): string[] {
  return checkpoint.shows
    .filter((s) => s.status === 'pending' || s.status === 'failed')
    .map((s) => s.date);
}

/**
 * Print a summary of the batch checkpoint.
 */
export function printCheckpointSummary(checkpoint: BatchCheckpoint): void {
  const counts = { pending: 0, in_progress: 0, success: 0, failed: 0, skipped: 0 };
  for (const show of checkpoint.shows) {
    counts[show.status]++;
  }
  log.info(
    `Batch ${checkpoint.batchId}: ${counts.success} success, ${counts.failed} failed, ` +
    `${counts.pending} pending, ${counts.skipped} skipped`,
  );
}
