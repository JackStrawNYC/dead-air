import { Router } from 'express';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getAuthUrl, exchangeCode, hasToken, uploadVideo } from '../services/youtube.js';
import { getDb } from '../db.js';
import { loadConfig } from '../config.js';
import { PublishBody, validateBody } from '../schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// GET /api/publish/auth-url — get YouTube OAuth URL
router.get('/auth-url', (_req, res) => {
  try {
    const url = getAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate auth URL' });
  }
});

// GET /api/publish/auth-status — check if YouTube token exists
router.get('/auth-status', (_req, res) => {
  res.json({ authenticated: hasToken() });
});

// POST /api/publish/auth-callback — exchange OAuth code for token
router.post('/auth-callback', async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing OAuth code' });
  }
  try {
    await exchangeCode(code);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'OAuth exchange failed' });
  }
});

// POST /api/publish/:episodeId — upload episode to YouTube
router.post('/:episodeId', async (req, res) => {
  const parsed = validateBody(PublishBody, req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error });

  const { episodeId } = req.params;
  const { title, description, tags, privacyStatus } = parsed.data;

  // Find the episode's rendered video
  const config = loadConfig();
  const finalPath = resolve(config.paths.renders, episodeId, 'episode.mp4');
  const rawPath = resolve(config.paths.renders, episodeId, 'episode-raw.mp4');
  // Also check visualizer out directory for full-show files
  const MONOREPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
  const vizOutDir = resolve(MONOREPO_ROOT, 'packages/visualizer-poc/out');

  let filePath: string | null = null;
  if (existsSync(finalPath)) filePath = finalPath;
  else if (existsSync(rawPath)) filePath = rawPath;
  else {
    // Look for any *full-show.mp4 in viz out dir
    const { readdirSync } = await import('fs');
    if (existsSync(vizOutDir)) {
      const fullShowFiles = readdirSync(vizOutDir).filter(f => f.endsWith('full-show.mp4'));
      if (fullShowFiles.length > 0) {
        filePath = resolve(vizOutDir, fullShowFiles[fullShowFiles.length - 1]);
      }
    }
  }

  if (!filePath) {
    return res.status(404).json({ error: 'No rendered video found for this episode' });
  }

  if (!hasToken()) {
    return res.status(401).json({ error: 'YouTube not authenticated. Connect YouTube first.' });
  }

  try {
    const result = await uploadVideo({
      filePath,
      title,
      description,
      tags,
      privacyStatus,
    });

    // Update episode in DB
    const db = getDb();
    db.prepare('UPDATE episodes SET youtube_url = ?, published_at = ? WHERE id = ?')
      .run(result.url, new Date().toISOString(), episodeId);

    res.json({ videoId: result.videoId, url: result.url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Upload failed' });
  }
});

export default router;
