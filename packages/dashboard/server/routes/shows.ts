import { Router } from 'express';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { getDb } from '../db.js';
import { loadConfig } from '../config.js';
import { runIngest } from '../jobs/job-runner.js';
import type { ShowRow } from '../types.js';
import { safeJsonParse, sanitizeParam } from '../utils.js';
import { ShowIngestBody, validateBody } from '../schemas.js';

const router = Router();

// GET /api/shows — list all ingested shows
router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, venue, city, state, date, recording_source, recording_quality_grade,
           catalog_score, setlist, metadata, created_at
    FROM shows ORDER BY date DESC
  `).all() as ShowRow[];

  const shows = rows.map((r) => ({
    ...r,
    setlist: safeJsonParse(r.setlist, []),
    metadata: safeJsonParse(r.metadata, {}),
  }));

  res.json(shows);
});

// GET /api/shows/:id — single show detail
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id) as ShowRow | undefined;
  if (!row) return res.status(404).json({ error: 'Show not found' });

  const show = {
    ...row,
    setlist: safeJsonParse(row.setlist, []),
    metadata: safeJsonParse(row.metadata, {}),
    weather: safeJsonParse(row.weather, null),
  };

  res.json(show);
});

// POST /api/shows/ingest — trigger archive.org ingest
router.post('/ingest', (req, res) => {
  const parsed = validateBody(ShowIngestBody, req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  const job = runIngest(parsed.data.date);
  res.json({ jobId: job.id });
});

// GET /api/shows/:id/research — research.json for a show
router.get('/:id/research', async (req, res) => {
  const id = sanitizeParam(req.params.id);
  const config = loadConfig();
  const filePath = resolve(config.paths.data, 'research', id, 'research.json');
  if (!existsSync(filePath)) return res.status(404).json({ error: 'Research not found' });
  try {
    const raw = await readFile(filePath, 'utf-8');
    res.json(safeJsonParse(raw, {}));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /api/shows/:id/analysis — analysis.json with downsampled energy arrays
router.get('/:id/analysis', async (req, res) => {
  const id = sanitizeParam(req.params.id);
  const config = loadConfig();
  const filePath = resolve(config.paths.data, 'analysis', id, 'analysis.json');
  if (!existsSync(filePath)) return res.status(404).json({ error: 'Analysis not found' });
  try {
    const raw = await readFile(filePath, 'utf-8');
    const data = safeJsonParse(raw, { songs: [] } as Record<string, unknown>);
    // Downsample energy arrays from ~3600 to 200 per song via max-pool
    if (data.songs && Array.isArray(data.songs)) {
      for (const song of data.songs) {
        if (song.energy && Array.isArray(song.energy) && song.energy.length > 200) {
          const poolSize = Math.ceil(song.energy.length / 200);
          const downsampled: number[] = [];
          for (let i = 0; i < song.energy.length; i += poolSize) {
            const chunk = song.energy.slice(i, i + poolSize);
            downsampled.push(Math.max(...chunk));
          }
          song.energy = downsampled;
        }
      }
    }
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /api/shows/:id/script — script.json for a show
router.get('/:id/script', async (req, res) => {
  const id = sanitizeParam(req.params.id);
  const config = loadConfig();
  const filePath = resolve(config.paths.data, 'scripts', id, 'script.json');
  if (!existsSync(filePath)) return res.status(404).json({ error: 'Script not found' });
  try {
    const raw = await readFile(filePath, 'utf-8');
    res.json(safeJsonParse(raw, {}));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
