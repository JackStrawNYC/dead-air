import { Router } from 'express';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { getDb } from '../db.js';
import { loadConfig } from '../config.js';
import type { ShowRow } from '../types.js';

const router = Router();

interface PreflightCheck {
  stage: string;
  ok: boolean;
  message?: string;
}

// GET /api/preflight/:date — run preflight checks for a show date
router.get('/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
  }

  const config = loadConfig();
  const checks: PreflightCheck[] = [];

  // Check API keys for each stage
  const hasAnthropic = Boolean(config.api.anthropicKey);
  const hasReplicate = Boolean(config.api.replicateToken);
  const hasElevenlabs = Boolean(config.api.elevenlabsKey);

  checks.push({
    stage: 'research',
    ok: hasAnthropic,
    message: hasAnthropic ? undefined : 'Missing anthropicKey — required for research stage',
  });

  checks.push({
    stage: 'script',
    ok: hasAnthropic,
    message: hasAnthropic ? undefined : 'Missing anthropicKey — required for script stage',
  });

  checks.push({
    stage: 'generate',
    ok: hasReplicate && hasElevenlabs,
    message: !hasReplicate && !hasElevenlabs
      ? 'Missing replicateToken and elevenlabsKey'
      : !hasReplicate ? 'Missing replicateToken'
      : !hasElevenlabs ? 'Missing elevenlabsKey'
      : undefined,
  });

  // Check if show exists in DB
  const db = getDb();
  const show = db.prepare('SELECT id FROM shows WHERE date = ?').get(date) as ShowRow | undefined;

  checks.push({
    stage: 'show',
    ok: Boolean(show),
    message: show ? undefined : `No show found in DB for ${date} — ingest stage will create it`,
  });

  // Check if audio files exist
  const showDir = resolve(config.paths.data, 'shows', date);
  const audioDir = resolve(showDir, 'audio');
  const hasAudio = existsSync(audioDir);

  checks.push({
    stage: 'audio',
    ok: hasAudio,
    message: hasAudio ? undefined : `No audio directory found at ${audioDir} — ingest stage will download`,
  });

  // Check for analysis JSON
  const analysisPath = resolve(showDir, 'analysis.json');
  const hasAnalysis = existsSync(analysisPath);
  checks.push({
    stage: 'analyze',
    ok: hasAnalysis,
    message: hasAnalysis ? undefined : 'No analysis.json — analyze stage will create it',
  });

  // Check for research JSON
  const researchPath = resolve(showDir, 'research.json');
  const hasResearch = existsSync(researchPath);
  checks.push({
    stage: 'research_data',
    ok: hasResearch,
    message: hasResearch ? undefined : 'No research.json — research stage will create it',
  });

  // Check for script JSON
  const scriptPath = resolve(showDir, 'script.json');
  const hasScript = existsSync(scriptPath);
  checks.push({
    stage: 'script_data',
    ok: hasScript,
    message: hasScript ? undefined : 'No script.json — script stage will create it',
  });

  const ready = checks.filter(c => ['research', 'script', 'generate'].includes(c.stage)).every(c => c.ok);

  res.json({ ready, checks });
});

export default router;
