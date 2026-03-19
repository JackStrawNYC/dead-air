import type { ChildProcess } from 'child_process';
import type { Response } from 'express';
import { getDb } from '../db.js';

export interface StageTiming {
  startedAt: string;
  finishedAt?: string;
}

export interface Job {
  id: string;
  type: 'pipeline' | 'render' | 'ingest' | 'bridge' | 'preview';
  episodeId?: string;
  showDate?: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  stages?: string[];
  currentStage?: string;
  failedStage?: string;
  stageTimings: Record<string, StageTiming>;
  log: string[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
  process?: ChildProcess;
  clients: Set<Response>;
}

const MAX_LOG_LINES = 500;
const jobs = new Map<string, Job>();

let jobCounter = 0;
let dbReady = false;

function ensureJobsTable(): void {
  if (dbReady) return;
  try {
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        episode_id TEXT,
        show_date TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        current_stage TEXT,
        failed_stage TEXT,
        stages TEXT,
        error TEXT,
        started_at DATETIME NOT NULL,
        finished_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_show_date ON jobs(show_date);
    `);
    dbReady = true;
  } catch {
    // DB not available — run in-memory only
  }
}

function persistJob(job: Job): void {
  ensureJobsTable();
  if (!dbReady) return;
  try {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO jobs (id, type, episode_id, show_date, status, current_stage, failed_stage, stages, error, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.type,
      job.episodeId || null,
      job.showDate || null,
      job.status,
      job.currentStage || null,
      job.failedStage || null,
      job.stages ? JSON.stringify(job.stages) : null,
      job.error || null,
      job.startedAt,
      job.finishedAt || null,
    );
  } catch {
    // Silently fail — in-memory still works
  }
}

export function createJob(opts: {
  type: Job['type'];
  episodeId?: string;
  showDate?: string;
  stages?: string[];
}): Job {
  const id = `job-${++jobCounter}-${Date.now().toString(36)}`;
  const job: Job = {
    id,
    type: opts.type,
    episodeId: opts.episodeId,
    showDate: opts.showDate,
    status: 'running',
    stages: opts.stages,
    stageTimings: {},
    log: [],
    startedAt: new Date().toISOString(),
    clients: new Set(),
  };
  jobs.set(id, job);
  persistJob(job);
  return job;
}

export function getJob(id: string): Job | undefined {
  // Check in-memory first (for active SSE connections)
  const memJob = jobs.get(id);
  if (memJob) return memJob;

  // Fall back to DB for historical jobs
  ensureJobsTable();
  if (!dbReady) return undefined;
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return dbRowToJob(row);
  } catch {
    return undefined;
  }
}

export function getAllJobs(): Job[] {
  // Get in-memory job IDs
  const memIds = new Set(jobs.keys());
  const result: Job[] = Array.from(jobs.values()).map(j => ({
    ...j,
    process: undefined,
    clients: new Set(),
  }));

  // Merge DB historical jobs (skip ones already in memory)
  ensureJobsTable();
  if (dbReady) {
    try {
      const db = getDb();
      const rows = db.prepare('SELECT * FROM jobs ORDER BY started_at DESC LIMIT 100').all() as Record<string, unknown>[];
      for (const row of rows) {
        if (!memIds.has(row.id as string)) {
          result.push(dbRowToJob(row));
        }
      }
    } catch {
      // DB read failed — return in-memory only
    }
  }

  // Sort by startedAt descending
  result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return result;
}

function dbRowToJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    type: row.type as Job['type'],
    episodeId: (row.episode_id as string) || undefined,
    showDate: (row.show_date as string) || undefined,
    status: row.status as Job['status'],
    currentStage: (row.current_stage as string) || undefined,
    failedStage: (row.failed_stage as string) || undefined,
    stages: row.stages ? JSON.parse(row.stages as string) : undefined,
    stageTimings: {},
    log: [],
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string) || undefined,
    error: (row.error as string) || undefined,
    clients: new Set(),
  };
}

export function appendLog(job: Job, line: string): void {
  job.log.push(line);
  if (job.log.length > MAX_LOG_LINES) {
    job.log.splice(0, job.log.length - MAX_LOG_LINES);
  }
  broadcast(job, 'log', { line, ts: new Date().toISOString() });
}

export function setStage(job: Job, stage: string): void {
  const now = new Date().toISOString();
  // Close previous stage timing
  if (job.currentStage && job.stageTimings[job.currentStage]) {
    job.stageTimings[job.currentStage].finishedAt = now;
  }
  // Open new stage timing
  job.stageTimings[stage] = { startedAt: now };
  job.currentStage = stage;
  broadcast(job, 'stage', { stage });
  broadcast(job, 'stage-timing', { stage, timings: job.stageTimings });

  // Persist stage change
  ensureJobsTable();
  if (dbReady) {
    try {
      getDb().prepare('UPDATE jobs SET current_stage = ? WHERE id = ?').run(stage, job.id);
    } catch {}
  }
}

export function finishJob(job: Job, success: boolean, error?: string): void {
  job.status = success ? 'done' : 'failed';
  job.finishedAt = new Date().toISOString();
  if (error) job.error = error;
  // Track which stage failed for resume
  if (!success && job.currentStage) {
    job.failedStage = job.currentStage;
  }
  // Close final stage timing
  if (job.currentStage && job.stageTimings[job.currentStage]) {
    job.stageTimings[job.currentStage].finishedAt = job.finishedAt;
  }
  broadcast(job, 'done', { success, error });

  // Persist final state
  persistJob(job);

  // Close all SSE connections after done event
  setTimeout(() => {
    for (const client of job.clients) {
      client.end();
    }
    job.clients.clear();
  }, 1000);
}

export function addClient(job: Job, res: Response): void {
  job.clients.add(res);
  // Replay log
  for (const line of job.log) {
    res.write(`event: log\ndata: ${JSON.stringify({ line, ts: '' })}\n\n`);
  }
  if (job.currentStage) {
    res.write(`event: stage\ndata: ${JSON.stringify({ stage: job.currentStage })}\n\n`);
    res.write(`event: stage-timing\ndata: ${JSON.stringify({ stage: job.currentStage, timings: job.stageTimings })}\n\n`);
  }
  if (job.status === 'done' || job.status === 'failed') {
    res.write(`event: done\ndata: ${JSON.stringify({ success: job.status === 'done', error: job.error })}\n\n`);
  }
}

export function removeClient(job: Job, res: Response): void {
  job.clients.delete(res);
}

function broadcast(job: Job, event: string, data: unknown): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of job.clients) {
    client.write(msg);
  }
}
