import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

// GET /api/costs — overall cost summary
router.get('/', (_req, res) => {
  const db = getDb();

  const totalCost = db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM cost_log').get() as any;

  const byService = db.prepare(`
    SELECT service, COUNT(*) as count, COALESCE(SUM(cost), 0) as total
    FROM cost_log GROUP BY service ORDER BY total DESC
  `).all();

  const byEpisode = db.prepare(`
    SELECT episode_id, COUNT(*) as operations, COALESCE(SUM(cost), 0) as total
    FROM cost_log GROUP BY episode_id ORDER BY total DESC
  `).all();

  const byOperation = db.prepare(`
    SELECT operation, service, COUNT(*) as count, COALESCE(SUM(cost), 0) as total
    FROM cost_log GROUP BY operation, service ORDER BY total DESC
  `).all();

  const recentEntries = db.prepare(`
    SELECT episode_id, service, operation, cost, input_tokens, output_tokens, created_at
    FROM cost_log ORDER BY created_at DESC LIMIT 50
  `).all();

  res.json({
    totalCost: totalCost.total,
    byService,
    byEpisode,
    byOperation,
    recentEntries,
  });
});

// GET /api/costs/:episodeId — costs for a specific episode
router.get('/:episodeId', (req, res) => {
  const db = getDb();

  const total = db.prepare(
    'SELECT COALESCE(SUM(cost), 0) as total FROM cost_log WHERE episode_id = ?'
  ).get(req.params.episodeId) as any;

  const byService = db.prepare(`
    SELECT service, COUNT(*) as count, COALESCE(SUM(cost), 0) as total
    FROM cost_log WHERE episode_id = ? GROUP BY service ORDER BY total DESC
  `).all(req.params.episodeId);

  const entries = db.prepare(`
    SELECT service, operation, cost, input_tokens, output_tokens, created_at
    FROM cost_log WHERE episode_id = ? ORDER BY created_at
  `).all(req.params.episodeId);

  res.json({ episodeId: req.params.episodeId, totalCost: total.total, byService, entries });
});

export default router;
