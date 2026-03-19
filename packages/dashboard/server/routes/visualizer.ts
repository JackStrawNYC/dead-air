import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runVisualizerRender } from '../jobs/job-runner.js';
import { safeJsonParse } from '../utils.js';
import {
  VisualizerRenderBody,
  SetlistBody,
  ChaptersBody,
  OverlayScheduleBody,
  SongIdentitiesBody,
  validateBody,
} from '../schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MONOREPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const VIZ_DATA = resolve(MONOREPO_ROOT, 'packages/visualizer-poc/data');

const router = Router();

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) return null;
  return safeJsonParse(readFileSync(path, 'utf-8'), null);
}

function writeJsonFile(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ─── Render Presets ───

const RENDER_PRESETS = {
  draft:   { width: 1280, height: 720,  concurrency: 6, skipGrain: true,  skipBloom: true,  label: 'Draft (720p, no grain/bloom)' },
  preview: { width: 1920, height: 1080, concurrency: 4, skipGrain: false, skipBloom: false, label: 'Preview (1080p, full quality)' },
  final:   { width: 1920, height: 1080, concurrency: 3, skipGrain: false, skipBloom: false, label: 'Final (1080p, full quality, max fidelity)' },
  '4k':    { width: 3840, height: 2160, concurrency: 4, skipGrain: false, skipBloom: false, label: '4K (2160p, full quality)' },
};

// GET /api/visualizer/setlist
router.get('/setlist', (_req, res) => {
  const data = readJsonFile(resolve(VIZ_DATA, 'setlist.json'));
  if (!data) return res.status(404).json({ error: 'setlist.json not found' });
  res.json(data);
});

// PUT /api/visualizer/setlist
router.put('/setlist', (req, res) => {
  const parsed = validateBody(SetlistBody, req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  writeJsonFile(resolve(VIZ_DATA, 'setlist.json'), parsed.data);
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
  const parsed = validateBody(ChaptersBody, req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  writeJsonFile(resolve(VIZ_DATA, 'show-context.json'), parsed.data);
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
  const parsed = validateBody(OverlayScheduleBody, req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  writeJsonFile(resolve(VIZ_DATA, 'overlay-schedule.json'), parsed.data);
  res.json({ ok: true });
});

// GET /api/visualizer/scene-registry (read-only)
router.get('/scene-registry', (_req, res) => {
  const data = readJsonFile(resolve(VIZ_DATA, 'scene-registry.json'));
  if (!data) return res.status(404).json({ error: 'scene-registry.json not found. Run: npx tsx scripts/export-scene-registry.ts' });
  res.json(data);
});

// GET /api/visualizer/render-presets (read-only)
router.get('/render-presets', (_req, res) => {
  res.json(RENDER_PRESETS);
});

// GET /api/visualizer/song-identities
router.get('/song-identities', (_req, res) => {
  const data = readJsonFile(resolve(VIZ_DATA, 'song-identities.json'));
  if (!data) return res.status(404).json({ error: 'song-identities.json not found. Run: npx tsx scripts/export-song-identities.ts' });
  res.json(data);
});

// PUT /api/visualizer/song-identities
router.put('/song-identities', (req, res) => {
  const parsed = validateBody(SongIdentitiesBody, req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  writeJsonFile(resolve(VIZ_DATA, 'song-identities.json'), parsed.data);
  res.json({ ok: true });
});

// GET /api/visualizer/overlay-names (read-only)
router.get('/overlay-names', (_req, res) => {
  const data = readJsonFile(resolve(VIZ_DATA, 'overlay-names.json'));
  if (!data) return res.status(404).json({ error: 'overlay-names.json not found. Run: npx tsx scripts/export-overlay-names.ts' });
  res.json(data);
});

// POST /api/visualizer/render — spawn visualizer render
router.post('/render', (req, res) => {
  const parsed = validateBody(VisualizerRenderBody, req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  const { track, resume, preset, preview, gl, concurrency, seed, noIntro, noEndCard, noChapters, noSetBreaks, setBreakSeconds } = parsed.data;
  const job = runVisualizerRender({ track, resume, preset, preview, gl, concurrency, seed, noIntro, noEndCard, noChapters, noSetBreaks, setBreakSeconds });
  res.json({ jobId: job.id });
});

export default router;
