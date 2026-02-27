import { Router } from 'express';
import { readdirSync, statSync, existsSync, createReadStream } from 'fs';
import { resolve } from 'path';
import { loadConfig } from '../config.js';

const router = Router();

interface SegmentInfo {
  index: number;
  file: string;
  size: number;
  done: boolean;
}

// GET /api/render/:episodeId/segments — segment completion status
router.get('/:episodeId/segments', (req, res) => {
  const config = loadConfig();
  const scenesDir = resolve(config.paths.renders, req.params.episodeId, 'scenes');

  if (!existsSync(scenesDir)) {
    return res.json({ segments: [], total: 0, completed: 0 });
  }

  const files = readdirSync(scenesDir).filter(f => f.endsWith('.mp4'));
  const hashFiles = readdirSync(scenesDir).filter(f => f.endsWith('.hash'));

  const segments: SegmentInfo[] = files.map(f => {
    const match = f.match(/segment-(\d+)\.mp4/);
    const idx = match ? parseInt(match[1], 10) : 0;
    const stat = statSync(resolve(scenesDir, f));
    return { index: idx, file: f, size: stat.size, done: stat.size > 0 };
  }).sort((a, b) => a.index - b.index);

  // Check for final output
  const rawPath = resolve(config.paths.renders, req.params.episodeId, 'episode-raw.mp4');
  const finalPath = resolve(config.paths.renders, req.params.episodeId, 'episode.mp4');

  res.json({
    segments,
    total: Math.max(segments.length, hashFiles.length),
    completed: segments.filter(s => s.done).length,
    hasRaw: existsSync(rawPath),
    hasFinal: existsSync(finalPath),
  });
});

// GET /api/render/:episodeId/output — stream MP4 download
router.get('/:episodeId/output', (req, res) => {
  const config = loadConfig();
  const finalPath = resolve(config.paths.renders, req.params.episodeId, 'episode.mp4');
  const rawPath = resolve(config.paths.renders, req.params.episodeId, 'episode-raw.mp4');
  const filePath = existsSync(finalPath) ? finalPath : existsSync(rawPath) ? rawPath : null;

  if (!filePath) {
    return res.status(404).json({ error: 'No rendered output found' });
  }

  const stat = statSync(filePath);
  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${req.params.episodeId}.mp4"`,
  });
  createReadStream(filePath).pipe(res);
});

// GET /api/render/:episodeId/progress — SSE progress stream (polls fs every 2s)
router.get('/:episodeId/progress', (req, res) => {
  const config = loadConfig();
  const scenesDir = resolve(config.paths.renders, req.params.episodeId, 'scenes');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let lastCompleted = -1;

  const poll = () => {
    if (!existsSync(scenesDir)) {
      res.write(`event: progress\ndata: ${JSON.stringify({ completed: 0, total: 0 })}\n\n`);
      return;
    }

    const files = readdirSync(scenesDir).filter(f => f.endsWith('.mp4'));
    const completed = files.filter(f => {
      const stat = statSync(resolve(scenesDir, f));
      return stat.size > 0;
    }).length;

    if (completed !== lastCompleted) {
      lastCompleted = completed;
      const rawExists = existsSync(resolve(config.paths.renders, req.params.episodeId, 'episode-raw.mp4'));
      res.write(`event: progress\ndata: ${JSON.stringify({ completed, total: files.length, rawDone: rawExists })}\n\n`);

      if (rawExists) {
        res.write(`event: done\ndata: ${JSON.stringify({ success: true })}\n\n`);
      }
    }
  };

  poll();
  const interval = setInterval(poll, 2000);

  // Ping keepalive
  const pingInterval = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(interval);
    clearInterval(pingInterval);
  });
});

export default router;
