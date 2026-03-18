import { Router } from 'express';
import {
  searchShows,
  getRecordingFiles,
  rankRecordings,
  selectAudioFiles,
  fetchSetlist,
} from '@dead-air/pipeline';
import { getConfig } from '@dead-air/core';
import { runPipeline } from '../jobs/job-runner.js';

const router = Router();

// Calendar cache: year → { dates: Record<string, number> }
const calendarCache = new Map<number, { dates: Record<string, number>; ts: number }>();
const CALENDAR_TTL = 1000 * 60 * 60; // 1 hour

// GET /api/archive/search?date=YYYY-MM-DD&year=YYYY&query=text
router.get('/search', async (req, res) => {
  const { date, year, query } = req.query;

  // At least one search param required
  if (!date && !year && !query) {
    return res.status(400).json({ error: 'Provide date, year, or query parameter' });
  }

  // Validate date if provided
  if (date && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
  }

  // Validate year if provided
  const yearNum = year ? parseInt(year as string, 10) : undefined;
  if (year && (!yearNum || yearNum < 1965 || yearNum > 1995)) {
    return res.status(400).json({ error: 'Year must be between 1965 and 1995' });
  }

  try {
    const results = await searchShows({
      date: date as string | undefined,
      year: yearNum,
      query: query as string | undefined,
    });
    const recordings = rankRecordings(results);
    res.json({ recordings, count: recordings.length });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Archive.org search failed' });
  }
});

// GET /api/archive/calendar?year=YYYY — date → recording count for a year
router.get('/calendar', async (req, res) => {
  const { year } = req.query;
  const yearNum = parseInt(year as string, 10);
  if (!yearNum || yearNum < 1965 || yearNum > 1995) {
    return res.status(400).json({ error: 'Year must be between 1965 and 1995' });
  }

  // Check cache
  const cached = calendarCache.get(yearNum);
  if (cached && Date.now() - cached.ts < CALENDAR_TTL) {
    return res.json({ dates: cached.dates });
  }

  try {
    const results = await searchShows({ year: yearNum });
    const dates: Record<string, number> = {};
    for (const rec of results) {
      // Normalize date to YYYY-MM-DD
      const d = rec.date?.substring(0, 10);
      if (d) {
        dates[d] = (dates[d] || 0) + 1;
      }
    }
    calendarCache.set(yearNum, { dates, ts: Date.now() });
    res.json({ dates });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Calendar fetch failed' });
  }
});

// GET /api/archive/setlist?date=YYYY-MM-DD — setlist preview
router.get('/setlist', async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
  }

  try {
    const config = getConfig();
    const result = await fetchSetlist(date, config.api.setlistfmKey);
    if (!result) {
      return res.json(null);
    }
    res.json({
      songs: result.songs,
      venue: result.venue,
      tour: result.tour,
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Setlist fetch failed' });
  }
});

// GET /api/archive/:identifier/files — list files for a recording
router.get('/:identifier/files', async (req, res) => {
  const { identifier } = req.params;

  try {
    const files = await getRecordingFiles(identifier);
    const audioFiles = selectAudioFiles(files, 'flac');
    const totalSize = audioFiles.reduce((sum, f) => sum + (parseInt(f.size, 10) || 0), 0);
    res.json({ files, audioFiles, totalSize });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Failed to fetch recording files' });
  }
});

// POST /api/archive/ingest-and-run — trigger full pipeline for a date
router.post('/ingest-and-run', (req, res) => {
  const { date, identifier } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
  }

  const job = runPipeline({ date, identifier });
  res.json({ jobId: job.id });
});

export default router;
