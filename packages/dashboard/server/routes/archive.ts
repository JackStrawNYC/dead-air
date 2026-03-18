import { Router } from 'express';
import {
  searchShows,
  getRecordingFiles,
  rankRecordings,
  selectAudioFiles,
} from '@dead-air/pipeline';
import { runPipeline } from '../jobs/job-runner.js';

const router = Router();

// GET /api/archive/search?date=YYYY-MM-DD — search archive.org recordings
router.get('/search', async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
  }

  try {
    const results = await searchShows(date);
    const recordings = rankRecordings(results);
    res.json({ recordings, count: recordings.length });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Archive.org search failed' });
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
  const { date } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
  }

  const job = runPipeline({ date });
  res.json({ jobId: job.id });
});

export default router;
