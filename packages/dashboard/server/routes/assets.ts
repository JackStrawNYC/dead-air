import { Router } from 'express';
import { existsSync, readdirSync, statSync } from 'fs';
import { resolve, extname } from 'path';
import { getDb } from '../db.js';
import { loadConfig } from '../config.js';

const router = Router();

// GET /api/assets/:episodeId — list assets for an episode
router.get('/:episodeId', (req, res) => {
  const db = getDb();
  const dbAssets = db.prepare(`
    SELECT id, type, service, file_path, cost, metadata, created_at
    FROM assets WHERE episode_id = ? ORDER BY type, created_at
  `).all(req.params.episodeId).map((a: any) => ({
    ...a,
    metadata: a.metadata ? JSON.parse(a.metadata) : {},
  }));

  // Also scan filesystem for assets not in DB
  const config = loadConfig();
  const assetDir = resolve(config.paths.data, 'assets', req.params.episodeId);
  const fsAssets: Array<{ path: string; type: string; size: number }> = [];

  if (existsSync(assetDir)) {
    const scanDir = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else {
          const ext = extname(entry.name).toLowerCase();
          const type = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? 'image'
            : ['.mp3', '.wav', '.m4a'].includes(ext) ? 'audio'
            : ['.mp4', '.webm'].includes(ext) ? 'video'
            : 'other';
          fsAssets.push({
            path: fullPath.replace(config.paths.data + '/', ''),
            type,
            size: statSync(fullPath).size,
          });
        }
      }
    };
    scanDir(assetDir);
  }

  res.json({ dbAssets, fsAssets });
});

export default router;
