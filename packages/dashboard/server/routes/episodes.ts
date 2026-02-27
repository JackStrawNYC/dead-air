import { Router } from 'express';
import { getDb } from '../db.js';

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
  const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id) as any;
  if (!episode) return res.status(404).json({ error: 'Episode not found' });

  episode.script = episode.script ? JSON.parse(episode.script) : null;
  episode.cost_breakdown = episode.cost_breakdown ? JSON.parse(episode.cost_breakdown) : null;

  const costs = db.prepare(`
    SELECT service, operation, cost, input_tokens, output_tokens, created_at
    FROM cost_log WHERE episode_id = ? ORDER BY created_at
  `).all(req.params.id);

  const assets = db.prepare(`
    SELECT id, type, service, file_path, cost, metadata, created_at
    FROM assets WHERE episode_id = ? ORDER BY created_at
  `).all(req.params.id).map((a: any) => ({
    ...a,
    metadata: a.metadata ? JSON.parse(a.metadata) : {},
  }));

  res.json({ episode, costs, assets });
});

export default router;
