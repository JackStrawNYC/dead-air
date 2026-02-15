import type Database from 'better-sqlite3';
import { resolve } from 'path';
import { createLogger } from '@dead-air/core';
import type { ShowIngest, SetlistSong } from '@dead-air/core';
import { searchShows, getRecordingFiles } from './archive-client.js';
import {
  rankRecordings,
  selectBestRecording,
  selectAudioFiles,
  type RankedRecording,
} from './recording-selector.js';
import { fetchSetlist, type VenueInfo } from './setlist-client.js';
import { fetchWeather, type WeatherData } from './weather-client.js';
import { downloadAudioFiles } from './downloader.js';

const log = createLogger('ingest');

export interface IngestOptions {
  /** Show date in YYYY-MM-DD format */
  date: string;
  /** Database instance */
  db: Database.Database;
  /** Root data directory */
  dataDir: string;
  /** Setlist.fm API key (optional) */
  setlistfmApiKey?: string;
  /** Skip audio download (metadata only) */
  skipAudio?: boolean;
  /** Preferred audio format */
  preferFormat?: 'flac' | 'mp3';
}

export interface IngestResult {
  showId: string;
  recording: RankedRecording;
  venue?: VenueInfo;
  setlist: SetlistSong[];
  weather: WeatherData | null;
  audioFiles: string[];
  totalBytes: number;
}

/**
 * Run the full ingest pipeline for a show date.
 */
export async function orchestrateIngest(
  options: IngestOptions,
): Promise<IngestResult> {
  const {
    date,
    db,
    dataDir,
    setlistfmApiKey,
    skipAudio = false,
    preferFormat = 'flac',
  } = options;

  // ── 1. Search Archive.org ──
  const recordings = await searchShows(date);
  if (recordings.length === 0) {
    throw new Error(`No recordings found on Archive.org for ${date}`);
  }

  // ── 2. Rank and select best recording ──
  const best = selectBestRecording(recordings);
  if (!best) {
    throw new Error(`Could not select a recording for ${date}`);
  }

  // ── 3. Get file list ──
  const files = await getRecordingFiles(best.identifier);
  const audioFiles = selectAudioFiles(files, preferFormat);

  if (audioFiles.length === 0) {
    throw new Error(
      `No audio files found for recording ${best.identifier}`,
    );
  }

  // ── 4. Fetch setlist (optional) ──
  let setlist: SetlistSong[] = [];
  let venue: VenueInfo | undefined;
  let tour: string | undefined;

  const setlistResult = await fetchSetlist(date, setlistfmApiKey);
  if (setlistResult) {
    setlist = setlistResult.songs;
    venue = setlistResult.venue;
    tour = setlistResult.tour;
  }

  // ── 5. Fetch weather (optional, needs venue coords) ──
  let weather: WeatherData | null = null;
  if (venue && venue.latitude && venue.longitude) {
    weather = await fetchWeather(date, venue.latitude, venue.longitude);
  }

  // ── 6. Download audio ──
  let downloadedFiles: string[] = [];
  let totalBytes = 0;

  if (!skipAudio) {
    const audioDir = resolve(dataDir, 'audio', date);
    const result = await downloadAudioFiles(
      best.identifier,
      audioFiles,
      audioDir,
    );
    downloadedFiles = result.files;
    totalBytes = result.totalBytes;
  } else {
    log.info('Skipping audio download (--skip-audio)');
  }

  // ── 7. Store in database ──
  const showId = date; // Use date as primary key

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO shows (
      id, venue, city, state, date, lineup, setlist,
      recording_id, recording_source, recording_quality_grade,
      weather, metadata, catalog_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    showId,
    venue?.name ?? null,
    venue?.city ?? null,
    venue?.state ?? null,
    date,
    null, // lineup — populated later
    setlist.length > 0 ? JSON.stringify(setlist) : null,
    best.identifier,
    best.sourceType,
    best.sourceType, // quality grade = source type for now
    weather ? JSON.stringify(weather) : null,
    JSON.stringify({
      archiveOrgTitle: best.title,
      archiveOrgSource: best.source,
      archiveOrgDescription: best.description,
      recordingScore: best.score,
      audioFormat: audioFiles[0]?.format,
      audioFileCount: audioFiles.length,
      audioFiles: downloadedFiles,
      totalBytes,
      tour,
      setlistFmUrl: setlistResult?.setlistFmUrl,
      venueCoords: venue
        ? { lat: venue.latitude, lng: venue.longitude }
        : null,
    }),
    best.score,
  );

  log.info(`Show saved to database (id: ${showId})`);

  return {
    showId,
    recording: best,
    venue,
    setlist,
    weather,
    audioFiles: downloadedFiles,
    totalBytes,
  };
}

// Re-export submodules
export { searchShows, getRecordingFiles, getDownloadUrl } from './archive-client.js';
export { rankRecordings, selectBestRecording, selectAudioFiles } from './recording-selector.js';
export { fetchSetlist } from './setlist-client.js';
export { fetchWeather } from './weather-client.js';
export { downloadAudioFiles } from './downloader.js';
