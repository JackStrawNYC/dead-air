import { Router } from 'express';
import { getDb } from '../db.js';
import type { CostTotalRow } from '../types.js';

const router = Router();

// GET /api/costs — overall cost summary
router.get('/', (_req, res) => {
  const db = getDb();

  const totalCost = db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM cost_log').get() as CostTotalRow;

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

// GET /api/costs/estimate — project costs based on historical data
router.get('/estimate', (req, res) => {
  const songs = parseInt(req.query.songs as string, 10) || 12;
  const db = getDb();

  // Get per-operation averages (only operations with >= 2 episodes of data)
  const opAverages = db.prepare(`
    SELECT operation, service,
      AVG(cost) as avg_cost,
      COUNT(*) as count,
      COUNT(DISTINCT episode_id) as episodes
    FROM cost_log
    GROUP BY operation, service
    HAVING COUNT(DISTINCT episode_id) >= 2
  `).all() as Array<{
    operation: string; service: string;
    avg_cost: number; count: number; episodes: number;
  }>;

  // Classify operations: per-show fixed vs per-song scaled
  const perShowOps = ['research', 'script', 'show_research', 'generate_script'];
  const perSongOps = ['generate', 'narration', 'image', 'generate_image', 'generate_narration', 'analyze'];

  let fixedCost = 0;
  let perSongCost = 0;
  const byService: Record<string, number> = {};

  for (const op of opAverages) {
    const opLower = op.operation.toLowerCase();
    const isPerSong = perSongOps.some(ps => opLower.includes(ps));
    const costPerEpisode = (op.avg_cost * op.count) / op.episodes;

    if (isPerSong) {
      // These scale with song count — normalize to per-song
      const avgSongsPerShow = 12; // approximate
      const perSong = costPerEpisode / avgSongsPerShow;
      perSongCost += perSong;
    } else {
      fixedCost += costPerEpisode;
    }

    const svc = op.service;
    byService[svc] = (byService[svc] || 0) + (isPerSong ? (costPerEpisode / 12) * songs : costPerEpisode);
  }

  const totalEstimate = fixedCost + perSongCost * songs;
  const episodeCount = (db.prepare('SELECT COUNT(DISTINCT episode_id) as n FROM cost_log').get() as { n: number }).n;

  res.json({
    totalEstimate: Math.round(totalEstimate * 100) / 100,
    fixedCost: Math.round(fixedCost * 100) / 100,
    perSongCost: Math.round(perSongCost * 100) / 100,
    byService: Object.entries(byService).map(([service, total]) => ({
      service,
      total: Math.round(total * 100) / 100,
    })).sort((a, b) => b.total - a.total),
    confidence: episodeCount >= 5 ? 'high' : episodeCount >= 2 ? 'medium' : 'low',
    basedOnEpisodes: episodeCount,
    songs,
  });
});

// GET /api/costs/:episodeId — costs for a specific episode
router.get('/:episodeId', (req, res) => {
  const db = getDb();

  const total = db.prepare(
    'SELECT COALESCE(SUM(cost), 0) as total FROM cost_log WHERE episode_id = ?'
  ).get(req.params.episodeId) as CostTotalRow;

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
