import type { ChildProcess } from 'child_process';
import type { Response } from 'express';

export interface Job {
  id: string;
  type: 'pipeline' | 'render' | 'ingest';
  episodeId?: string;
  showDate?: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  stages?: string[];
  currentStage?: string;
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
    log: [],
    startedAt: new Date().toISOString(),
    clients: new Set(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function getAllJobs(): Job[] {
  return Array.from(jobs.values()).map(j => ({
    ...j,
    process: undefined,
    clients: new Set(),
  }));
}

export function appendLog(job: Job, line: string): void {
  job.log.push(line);
  if (job.log.length > MAX_LOG_LINES) {
    job.log.splice(0, job.log.length - MAX_LOG_LINES);
  }
  broadcast(job, 'log', { line, ts: new Date().toISOString() });
}

export function setStage(job: Job, stage: string): void {
  job.currentStage = stage;
  broadcast(job, 'stage', { stage });
}

export function finishJob(job: Job, success: boolean, error?: string): void {
  job.status = success ? 'done' : 'failed';
  job.finishedAt = new Date().toISOString();
  if (error) job.error = error;
  broadcast(job, 'done', { success, error });
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
