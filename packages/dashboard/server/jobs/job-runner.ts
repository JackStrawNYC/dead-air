import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createJob, appendLog, setStage, finishJob } from './job-store.js';
import type { Job } from './job-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Navigate up to monorepo root: server/jobs/ -> server/ -> dashboard/ -> packages/ -> root
const MONOREPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const CLI_ENTRY = resolve(MONOREPO_ROOT, 'packages/cli/src/index.ts');
const VISUALIZER_RENDER = resolve(MONOREPO_ROOT, 'packages/visualizer-poc/scripts/render-show.ts');

const STAGE_PATTERNS: Array<[RegExp, string]> = [
  [/ingesting show/i, 'ingest'],
  [/analyzing audio/i, 'analyze'],
  [/researching show/i, 'research'],
  [/generating script/i, 'script'],
  [/generating assets/i, 'generate'],
  [/rendering episode/i, 'render'],
  [/stage: (\w+)/i, '$1'],
];

function detectStage(line: string): string | null {
  for (const [pattern, stage] of STAGE_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      return stage === '$1' ? match[1] : stage;
    }
  }
  return null;
}

export function runPipeline(opts: {
  date: string;
  from?: string;
  to?: string;
  force?: boolean;
}): Job {
  const args = ['tsx', CLI_ENTRY, 'produce', opts.date];
  if (opts.from) args.push('--from', opts.from);
  if (opts.to) args.push('--to', opts.to);
  if (opts.force) args.push('--force');

  const job = createJob({
    type: 'pipeline',
    showDate: opts.date,
    episodeId: `ep-${opts.date}`,
    stages: ['ingest', 'analyze', 'research', 'script', 'generate', 'render'],
  });

  spawnAndStream(job, 'npx', args);
  return job;
}

export function runIngest(date: string): Job {
  const args = ['tsx', CLI_ENTRY, 'ingest', date];
  const job = createJob({ type: 'ingest', showDate: date });
  spawnAndStream(job, 'npx', args);
  return job;
}

export function runVisualizerRender(opts: {
  track?: string;
  resume?: boolean;
}): Job {
  const args = ['tsx', VISUALIZER_RENDER];
  if (opts.track) args.push(`--track=${opts.track}`);
  if (opts.resume) args.push('--resume');
  args.push('--gl=angle');

  const job = createJob({ type: 'render' });
  spawnAndStream(job, 'npx', args);
  return job;
}

function spawnAndStream(job: Job, cmd: string, args: string[]): void {
  appendLog(job, `$ ${cmd} ${args.join(' ')}`);

  const child = spawn(cmd, args, {
    cwd: MONOREPO_ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  job.process = child;

  let buffer = '';
  const processData = (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      appendLog(job, line);
      const stage = detectStage(line);
      if (stage) setStage(job, stage);
    }
  };

  child.stdout?.on('data', processData);
  child.stderr?.on('data', processData);

  child.on('close', (code) => {
    if (buffer.trim()) appendLog(job, buffer);
    finishJob(job, code === 0, code !== 0 ? `Process exited with code ${code}` : undefined);
  });

  child.on('error', (err) => {
    finishJob(job, false, err.message);
  });
}

export function cancelJob(job: Job): boolean {
  if (job.process && job.status === 'running') {
    job.process.kill('SIGTERM');
    job.status = 'cancelled';
    appendLog(job, '[dashboard] Job cancelled by user');
    finishJob(job, false, 'Cancelled by user');
    return true;
  }
  return false;
}
