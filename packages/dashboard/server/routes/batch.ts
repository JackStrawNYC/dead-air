import { Router } from 'express';
import {
  createBatch,
  getBatch,
  getAllBatches,
  addBatchClient,
  removeBatchClient,
  cancelBatch as cancelBatchFn,
  retryBatch as retryBatchFn,
} from '../jobs/batch-store.js';
import { BatchCreateBody, validateBody } from '../schemas.js';

const router = Router();

// POST /api/batch — create a new batch
router.post('/', (req, res) => {
  const parsed = validateBody(BatchCreateBody, req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error });

  const { dates, preset, force, mode, seed, concurrency } = parsed.data;
  const batch = createBatch({ dates, preset, force, mode, seed, concurrency });
  res.json({ batchId: batch.id });
});

// GET /api/batch — list all batches
router.get('/', (_req, res) => {
  const batches = getAllBatches();
  res.json(batches);
});

// GET /api/batch/:id — batch detail
router.get('/:id', (req, res) => {
  const batch = getBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  res.json({
    id: batch.id,
    status: batch.status,
    dates: batch.dates,
    preset: batch.preset,
    mode: batch.mode,
    shows: batch.shows,
    createdAt: batch.createdAt,
    finishedAt: batch.finishedAt,
  });
});

// GET /api/batch/:id/stream — SSE stream for batch progress
router.get('/:id/stream', (req, res) => {
  const batch = getBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  addBatchClient(batch, res);

  const pingInterval = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    removeBatchClient(batch, res);
  });
});

// POST /api/batch/:id/retry — retry failed shows
router.post('/:id/retry', (req, res) => {
  const batch = getBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  const retried = retryBatchFn(batch);
  res.json({ ok: retried });
});

// POST /api/batch/:id/cancel — cancel batch
router.post('/:id/cancel', (req, res) => {
  const batch = getBatch(req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  const cancelled = cancelBatchFn(batch);
  res.json({ ok: cancelled });
});

export default router;
