import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { safeJsonParse } from '../utils.js';
import { BridgeOverrideBody, validateBody } from '../schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MONOREPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const VIZ_DATA = resolve(MONOREPO_ROOT, 'packages/visualizer-poc/data');

const router = Router();

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) return null;
  return safeJsonParse(readFileSync(path, 'utf-8'), null);
}

// GET /api/bridge/:date/output — read all bridge output files
router.get('/:date/output', (req, res) => {
  const setlist = readJsonFile(resolve(VIZ_DATA, 'setlist.json'));
  const timeline = readJsonFile(resolve(VIZ_DATA, 'show-timeline.json'));
  const context = readJsonFile(resolve(VIZ_DATA, 'show-context.json'));

  if (!setlist) {
    return res.status(404).json({ error: 'Bridge output not found. Run bridge pipeline first.' });
  }

  res.json({ setlist, timeline, context });
});

// POST /api/bridge/:date/override — apply overrides to bridge output
router.post('/:date/override', (req, res) => {
  const parsed = validateBody(BridgeOverrideBody, req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error });

  const { songOverrides, chapterOverrides, setBreakDuration } = parsed.data;

  // Apply song overrides to setlist.json
  if (songOverrides) {
    const setlistPath = resolve(VIZ_DATA, 'setlist.json');
    const setlist = readJsonFile(setlistPath) as Record<string, unknown> | null;
    if (setlist && Array.isArray(setlist.songs)) {
      for (const song of setlist.songs as Array<Record<string, unknown>>) {
        const override = songOverrides[song.trackId as string];
        if (override) {
          if (override.defaultMode) song.defaultMode = override.defaultMode;
          if (override.palette) {
            const existing = (song.palette || {}) as Record<string, unknown>;
            song.palette = { ...existing, ...override.palette };
          }
        }
      }
      writeFileSync(setlistPath, JSON.stringify(setlist, null, 2) + '\n', 'utf-8');
    }
  }

  // Apply chapter overrides to show-context.json
  if (chapterOverrides || setBreakDuration != null) {
    const contextPath = resolve(VIZ_DATA, 'show-context.json');
    const context = (readJsonFile(contextPath) || {}) as Record<string, unknown>;

    if (chapterOverrides && Array.isArray(context.chapters)) {
      const chapters = context.chapters as Array<Record<string, unknown>>;
      for (const override of chapterOverrides) {
        if (override.index >= 0 && override.index < chapters.length) {
          chapters[override.index].text = override.text;
        }
      }
    }

    if (setBreakDuration != null) {
      context.setBreakDuration = setBreakDuration;
    }

    writeFileSync(contextPath, JSON.stringify(context, null, 2) + '\n', 'utf-8');
  }

  res.json({ ok: true });
});

export default router;
