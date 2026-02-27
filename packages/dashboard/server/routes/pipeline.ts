import { Router } from 'express';
import { runPipeline, cancelJob } from '../jobs/job-runner.js';
import { getJob, getAllJobs, addClient, removeClient } from '../jobs/job-store.js';

const router = Router();

// POST /api/pipeline/:date/run — trigger pipeline stages
router.post('/:date/run', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  const { from, to, force } = req.body || {};
  const job = runPipeline({ date, from, to, force });
  res.json({ jobId: job.id, episodeId: job.episodeId });
});

// GET /api/pipeline/jobs — list all jobs
router.get('/jobs', (_req, res) => {
  res.json(getAllJobs());
});

// GET /api/pipeline/jobs/:id/stream — SSE log stream
router.get('/jobs/:id/stream', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  addClient(job, res);

  // Keepalive ping every 15s
  const pingInterval = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    removeClient(job, res);
  });
});

// POST /api/pipeline/jobs/:id/cancel — cancel a running job
router.post('/jobs/:id/cancel', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const cancelled = cancelJob(job);
  res.json({ cancelled });
});

export default router;
