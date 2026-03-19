import type { Response } from 'express';
import { runPipeline, runBridge, runVisualizerRender } from './job-runner.js';
import { getJob } from './job-store.js';
import type { Job } from './job-store.js';

export interface BatchShowStatus {
  date: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  jobId?: string;
  error?: string;
}

export type BatchMode = 'full' | 'render-only' | 'bridge-and-render';

export interface Batch {
  id: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  dates: string[];
  preset?: string;
  force?: boolean;
  mode: BatchMode;
  seed?: number;
  concurrency?: number;
  shows: BatchShowStatus[];
  createdAt: string;
  finishedAt?: string;
  clients: Set<Response>;
}

const batches = new Map<string, Batch>();
let batchCounter = 0;

export function createBatch(opts: {
  dates: string[];
  preset?: string;
  force?: boolean;
  mode?: BatchMode;
  seed?: number;
  concurrency?: number;
}): Batch {
  const id = `batch-${++batchCounter}-${Date.now().toString(36)}`;
  const batch: Batch = {
    id,
    status: 'running',
    dates: opts.dates,
    preset: opts.preset,
    force: opts.force,
    mode: opts.mode || 'full',
    seed: opts.seed,
    concurrency: opts.concurrency,
    shows: opts.dates.map(date => ({ date, status: 'pending' })),
    createdAt: new Date().toISOString(),
    clients: new Set(),
  };
  batches.set(id, batch);

  // Start processing sequentially
  processBatch(batch);

  return batch;
}

export function getBatch(id: string): Batch | undefined {
  return batches.get(id);
}

export function getAllBatches(): Batch[] {
  return Array.from(batches.values()).map(b => ({
    ...b,
    clients: new Set<Response>(),
  }));
}

export function addBatchClient(batch: Batch, res: Response): void {
  batch.clients.add(res);
  // Replay current state
  broadcastBatch(batch, 'state', serializeBatch(batch));
}

export function removeBatchClient(batch: Batch, res: Response): void {
  batch.clients.delete(res);
}

export function cancelBatch(batch: Batch): boolean {
  if (batch.status !== 'running') return false;
  batch.status = 'cancelled';
  batch.finishedAt = new Date().toISOString();

  // Cancel any running show
  for (const show of batch.shows) {
    if (show.status === 'running' && show.jobId) {
      const job = getJob(show.jobId);
      if (job?.process) {
        job.process.kill('SIGTERM');
      }
      show.status = 'failed';
      show.error = 'Batch cancelled';
    }
    if (show.status === 'pending') {
      show.status = 'failed';
      show.error = 'Batch cancelled';
    }
  }

  broadcastBatch(batch, 'done', { cancelled: true });
  closeBatchClients(batch);
  return true;
}

export function retryBatch(batch: Batch): boolean {
  const hasFailedShows = batch.shows.some(s => s.status === 'failed');
  if (!hasFailedShows) return false;

  // Reset failed shows to pending
  for (const show of batch.shows) {
    if (show.status === 'failed') {
      show.status = 'pending';
      show.jobId = undefined;
      show.error = undefined;
    }
  }

  batch.status = 'running';
  batch.finishedAt = undefined;

  // Resume processing
  processBatch(batch);
  return true;
}

function serializeBatch(batch: Batch) {
  return {
    id: batch.id,
    status: batch.status,
    dates: batch.dates,
    preset: batch.preset,
    mode: batch.mode,
    shows: batch.shows,
    createdAt: batch.createdAt,
    finishedAt: batch.finishedAt,
  };
}

async function processBatch(batch: Batch): Promise<void> {
  for (const show of batch.shows) {
    if (show.status !== 'pending') continue;
    if (batch.status === 'cancelled') break;

    // Start this show
    show.status = 'running';
    broadcastBatch(batch, 'state', serializeBatch(batch));

    try {
      if (batch.mode === 'render-only') {
        // Render only — skip pipeline and bridge
        const job = runVisualizerRender({
          preset: batch.preset,
          seed: batch.seed,
          concurrency: batch.concurrency,
        });
        show.jobId = job.id;
        broadcastBatch(batch, 'state', serializeBatch(batch));
        await waitForJob(job);
        const finalJob = getJob(job.id);
        show.status = finalJob?.status === 'done' ? 'done' : 'failed';
        if (show.status === 'failed') show.error = finalJob?.error || 'Render failed';
      } else if (batch.mode === 'bridge-and-render') {
        // Bridge then render
        const bridgeJob = runBridge({ date: show.date });
        show.jobId = bridgeJob.id;
        broadcastBatch(batch, 'state', serializeBatch(batch));
        await waitForJob(bridgeJob);
        const finalBridge = getJob(bridgeJob.id);
        if (finalBridge?.status !== 'done') {
          show.status = 'failed';
          show.error = finalBridge?.error || 'Bridge failed';
        } else {
          const renderJob = runVisualizerRender({
            preset: batch.preset,
            seed: batch.seed,
            concurrency: batch.concurrency,
          });
          show.jobId = renderJob.id;
          broadcastBatch(batch, 'state', serializeBatch(batch));
          await waitForJob(renderJob);
          const finalRender = getJob(renderJob.id);
          show.status = finalRender?.status === 'done' ? 'done' : 'failed';
          if (show.status === 'failed') show.error = finalRender?.error || 'Render failed';
        }
      } else {
        // Full pipeline (default)
        const job = runPipeline({
          date: show.date,
          force: batch.force,
        });
        show.jobId = job.id;
        broadcastBatch(batch, 'state', serializeBatch(batch));
        await waitForJob(job);
        const finalJob = getJob(job.id);
        show.status = finalJob?.status === 'done' ? 'done' : 'failed';
        if (show.status === 'failed') show.error = finalJob?.error || 'Pipeline failed';
      }
    } catch (err) {
      show.status = 'failed';
      show.error = err instanceof Error ? err.message : 'Unknown error';
    }

    broadcastBatch(batch, 'state', serializeBatch(batch));
  }

  // Determine final batch status
  const hasFailed = batch.shows.some(s => s.status === 'failed');
  batch.status = hasFailed ? 'failed' : 'done';
  batch.finishedAt = new Date().toISOString();
  broadcastBatch(batch, 'done', serializeBatch(batch));
  closeBatchClients(batch);
}

function waitForJob(job: Job): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = setInterval(() => {
      const current = getJob(job.id);
      if (!current || current.status !== 'running') {
        clearInterval(check);
        resolve();
      }
    }, 2000);
  });
}

function broadcastBatch(batch: Batch, event: string, data: unknown): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of batch.clients) {
    client.write(msg);
  }
}

function closeBatchClients(batch: Batch): void {
  setTimeout(() => {
    for (const client of batch.clients) {
      client.end();
    }
    batch.clients.clear();
  }, 1000);
}
