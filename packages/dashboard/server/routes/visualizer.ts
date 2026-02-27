import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runVisualizerRender } from '../jobs/job-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MONOREPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const VIZ_DATA = resolve(MONOREPO_ROOT, 'packages/visualizer-poc/data');

const router = Router();

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeJsonFile(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// GET /api/visualizer/setlist
router.get('/setlist', (_req, res) => {
  const data = readJsonFile(resolve(VIZ_DATA, 'setlist.json'));
  if (!data) return res.status(404).json({ error: 'setlist.json not found' });
  res.json(data);
});

// PUT /api/visualizer/setlist
router.put('/setlist', (req, res) => {
  writeJsonFile(resolve(VIZ_DATA, 'setlist.json'), req.body);
  res.json({ ok: true });
});

// GET /api/visualizer/chapters
router.get('/chapters', (_req, res) => {
  const data = readJsonFile(resolve(VIZ_DATA, 'show-context.json'));
  if (!data) return res.status(404).json({ error: 'show-context.json not found' });
  res.json(data);
});

// PUT /api/visualizer/chapters
router.put('/chapters', (req, res) => {
  writeJsonFile(resolve(VIZ_DATA, 'show-context.json'), req.body);
  res.json({ ok: true });
});

// GET /api/visualizer/overlay-schedule
router.get('/overlay-schedule', (_req, res) => {
  const data = readJsonFile(resolve(VIZ_DATA, 'overlay-schedule.json'));
  if (!data) return res.status(404).json({ error: 'overlay-schedule.json not found' });
  res.json(data);
});

// PUT /api/visualizer/overlay-schedule
router.put('/overlay-schedule', (req, res) => {
  writeJsonFile(resolve(VIZ_DATA, 'overlay-schedule.json'), req.body);
  res.json({ ok: true });
});

// POST /api/visualizer/render — spawn visualizer render
router.post('/render', (req, res) => {
  const { track, resume } = req.body || {};
  const job = runVisualizerRender({ track, resume });
  res.json({ jobId: job.id });
});

export default router;
