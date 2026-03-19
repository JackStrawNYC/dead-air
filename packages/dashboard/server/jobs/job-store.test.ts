import { describe, it, expect, beforeEach } from 'vitest';
import {
  createJob,
  getJob,
  getAllJobs,
  appendLog,
  setStage,
  finishJob,
} from './job-store';

// Reset module state between tests by creating fresh jobs each time
// (jobs Map is module-level, but we can test with unique jobs)

describe('createJob', () => {
  it('returns a job with unique id', () => {
    const job = createJob({ type: 'pipeline', episodeId: 'ep-2024-01-01' });
    expect(job.id).toMatch(/^job-\d+-/);
    expect(job.status).toBe('running');
    expect(job.log).toEqual([]);
    expect(job.type).toBe('pipeline');
    expect(job.episodeId).toBe('ep-2024-01-01');
  });

  it('generates unique ids for each job', () => {
    const job1 = createJob({ type: 'render' });
    const job2 = createJob({ type: 'render' });
    expect(job1.id).not.toBe(job2.id);
  });

  it('sets startedAt as ISO string', () => {
    const job = createJob({ type: 'ingest', showDate: '1977-05-08' });
    expect(new Date(job.startedAt).toISOString()).toBe(job.startedAt);
    expect(job.showDate).toBe('1977-05-08');
  });

  it('initializes with provided stages', () => {
    const stages = ['ingest', 'analyze', 'render'];
    const job = createJob({ type: 'pipeline', stages });
    expect(job.stages).toEqual(stages);
  });
});

describe('appendLog', () => {
  it('adds a line to the job log', () => {
    const job = createJob({ type: 'pipeline' });
    appendLog(job, 'hello');
    expect(job.log).toContain('hello');
  });

  it('truncates at MAX_LOG_LINES (500)', () => {
    const job = createJob({ type: 'pipeline' });
    for (let i = 0; i < 550; i++) {
      appendLog(job, `line-${i}`);
    }
    expect(job.log.length).toBe(500);
    // Oldest lines should be gone
    expect(job.log[0]).toBe('line-50');
    expect(job.log[499]).toBe('line-549');
  });
});

describe('setStage', () => {
  it('sets currentStage on the job', () => {
    const job = createJob({ type: 'pipeline' });
    setStage(job, 'analyze');
    expect(job.currentStage).toBe('analyze');
  });
});

describe('finishJob', () => {
  it('marks job as done on success', () => {
    const job = createJob({ type: 'pipeline' });
    finishJob(job, true);
    expect(job.status).toBe('done');
    expect(job.finishedAt).toBeDefined();
    expect(job.error).toBeUndefined();
  });

  it('marks job as failed with error', () => {
    const job = createJob({ type: 'pipeline' });
    finishJob(job, false, 'Process exited with code 1');
    expect(job.status).toBe('failed');
    expect(job.error).toBe('Process exited with code 1');
    expect(job.finishedAt).toBeDefined();
  });
});

describe('getJob', () => {
  it('returns job by id', () => {
    const job = createJob({ type: 'render' });
    const found = getJob(job.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(job.id);
  });

  it('returns undefined for missing id', () => {
    expect(getJob('nonexistent')).toBeUndefined();
  });
});

describe('getAllJobs', () => {
  it('returns array of jobs', () => {
    const jobs = getAllJobs();
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);
  });

  it('strips process and clients from returned jobs', () => {
    const job = createJob({ type: 'pipeline' });
    const all = getAllJobs();
    const found = all.find((j) => j.id === job.id);
    expect(found).toBeDefined();
    expect(found!.process).toBeUndefined();
    // clients is replaced with a new empty Set
    expect(found!.clients.size).toBe(0);
  });
});
