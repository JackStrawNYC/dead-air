import { Router } from 'express';
import { existsSync, readdirSync, statSync } from 'fs';
import { resolve, extname, basename } from 'path';
import { getDb } from '../db.js';
import { loadConfig } from '../config.js';
import { RegenerateAssetBody, ApproveAssetsBody, validateBody } from '../schemas.js';
import type { EpisodeRow, AssetRow } from '../types.js';
import { safeJsonParse } from '../utils.js';
import { runPipeline } from '../jobs/job-runner.js';

const router = Router();

interface SegmentAsset {
  type: string;
  filePath: string;
  service?: string;
  prompt?: string;
  size?: number;
}

interface ReviewSegment {
  index: number;
  assets: SegmentAsset[];
}

// GET /api/asset-review/:episodeId — grouped assets by segment
router.get('/:episodeId', (req, res) => {
  const { episodeId } = req.params;
  const config = loadConfig();
  const db = getDb();

  // Check episode exists
  const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId) as EpisodeRow | undefined;
  if (!episode) return res.status(404).json({ error: 'Episode not found' });

  // Get DB assets
  const dbAssets = (db.prepare(
    'SELECT id, type, service, file_path, cost, metadata, created_at FROM assets WHERE episode_id = ? ORDER BY created_at'
  ).all(episodeId) as AssetRow[]).map(a => ({
    ...a,
    metadata: safeJsonParse(a.metadata, {}),
  }));

  // Scan filesystem for generated assets
  const showDate = episode.show_date || episode.show_id;
  const assetsDir = resolve(config.paths.data, 'shows', showDate, 'assets');

  const segments: ReviewSegment[] = [];
  const segmentMap = new Map<number, SegmentAsset[]>();

  // Group DB assets by segment index (extracted from file path)
  for (const asset of dbAssets) {
    const segMatch = asset.file_path?.match(/segment[_-]?(\d+)/i) || asset.file_path?.match(/(\d+)\./);
    const segIdx = segMatch ? parseInt(segMatch[1], 10) : 0;

    if (!segmentMap.has(segIdx)) segmentMap.set(segIdx, []);
    segmentMap.get(segIdx)!.push({
      type: asset.type,
      filePath: asset.file_path,
      service: asset.service,
      prompt: (asset.metadata as Record<string, unknown>)?.prompt as string | undefined,
    });
  }

  // Also scan filesystem
  if (existsSync(assetsDir)) {
    const files = readdirSync(assetsDir);
    for (const file of files) {
      const ext = extname(file).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp', '.mp3', '.wav', '.mp4'].includes(ext)) continue;

      const segMatch = file.match(/segment[_-]?(\d+)/i) || file.match(/^(\d+)\./);
      const segIdx = segMatch ? parseInt(segMatch[1], 10) : 0;
      const filePath = resolve(assetsDir, file);
      const stat = statSync(filePath);

      let type = 'unknown';
      if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) type = 'image';
      else if (['.mp3', '.wav'].includes(ext)) type = 'narration';
      else if (ext === '.mp4') type = 'video';

      if (!segmentMap.has(segIdx)) segmentMap.set(segIdx, []);

      // Avoid duplicates
      const existing = segmentMap.get(segIdx)!;
      if (!existing.some(a => a.filePath === filePath)) {
        existing.push({ type, filePath, size: stat.size });
      }
    }
  }

  // Convert to sorted array
  for (const [index, assets] of Array.from(segmentMap.entries()).sort((a, b) => a[0] - b[0])) {
    segments.push({ index, assets });
  }

  res.json({ segments });
});

// POST /api/asset-review/:episodeId/regenerate — re-generate specific asset
router.post('/:episodeId/regenerate', (req, res) => {
  const { episodeId } = req.params;
  const parsed = validateBody(RegenerateAssetBody, req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error });

  const db = getDb();
  const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId) as EpisodeRow | undefined;
  if (!episode) return res.status(404).json({ error: 'Episode not found' });

  const showDate = episode.show_date || episode.show_id;

  // Spawn targeted generate stage
  const job = runPipeline({
    date: showDate,
    from: 'generate',
    to: 'generate',
    force: true,
  });

  res.json({ jobId: job.id });
});

// POST /api/asset-review/:episodeId/approve — mark assets as reviewed
router.post('/:episodeId/approve', (req, res) => {
  const { episodeId } = req.params;
  const db = getDb();

  const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId) as EpisodeRow | undefined;
  if (!episode) return res.status(404).json({ error: 'Episode not found' });

  // Update episode status to indicate assets are approved
  db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run('assets_approved', episodeId);

  res.json({ ok: true });
});

export default router;
