import { Router } from 'express';
import { getDb } from '../db.js';
import type { EpisodeRow, AssetRow } from '../types.js';
import { safeJsonParse } from '../utils.js';
import { RerenderBody, validateBody } from '../schemas.js';
import { runVisualizerRender } from '../jobs/job-runner.js';

const router = Router();

// GET /api/episodes — list all episodes with status
router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT e.id, e.show_id, e.episode_type, e.title, e.status, e.current_stage,
           e.progress, e.youtube_url, e.duration_seconds, e.total_cost,
           e.created_at, e.published_at,
           s.venue, s.city, s.state, s.date as show_date
    FROM episodes e
    LEFT JOIN shows s ON e.show_id = s.id
    ORDER BY e.created_at DESC
  `).all();

  res.json(rows);
});

// GET /api/episodes/:id — episode detail + costs + assets
router.get('/:id', (req, res) => {
  const db = getDb();
  const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id) as EpisodeRow | undefined;
  if (!episode) return res.status(404).json({ error: 'Episode not found' });

  const parsed = {
    ...episode,
    script: safeJsonParse(episode.script, null),
    cost_breakdown: safeJsonParse(episode.cost_breakdown, null),
  };

  const costs = db.prepare(`
    SELECT service, operation, cost, input_tokens, output_tokens, created_at
    FROM cost_log WHERE episode_id = ? ORDER BY created_at
  `).all(req.params.id);

  const assets = (db.prepare(`
    SELECT id, type, service, file_path, cost, metadata, created_at
    FROM assets WHERE episode_id = ? ORDER BY created_at
  `).all(req.params.id) as AssetRow[]).map((a) => ({
    ...a,
    metadata: safeJsonParse(a.metadata, {}),
  }));

  res.json({ episode: parsed, costs, assets });
});

// POST /api/episodes/:id/rerender — trigger re-render with new options
router.post('/:id/rerender', (req, res) => {
  const db = getDb();
  const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id) as EpisodeRow | undefined;
  if (!episode) return res.status(404).json({ error: 'Episode not found' });

  const parsed = validateBody(RerenderBody, req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error });

  const { preset, seed, force } = parsed.data;

  const job = runVisualizerRender({
    preset: preset || undefined,
    seed: seed || undefined,
    resume: !force,
  });

  res.json({ jobId: job.id });
});

export default router;
