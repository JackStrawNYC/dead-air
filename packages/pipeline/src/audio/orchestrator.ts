import type Database from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { resolve, extname } from 'path';
import { createLogger } from '@dead-air/core';
import type {
  AudioAnalysis,
  SongSegment,
  SongAnalysisData,
  PeakMoment,
  SetlistSong,
} from '@dead-air/core';
import { getAudioInfo, detectSilence, splitAtBoundaries } from './ffmpeg.js';
import { analyzeWithLibrosa, toSongAnalysis } from './librosa-sidecar.js';
import {
  matchPreSegmentedFiles,
  buildSegmentsFromSilence,
  parseSetlistFromDescription,
} from './segment-matcher.js';
import { detectPeakMoments } from './peak-detector.js';

const log = createLogger('audio:orchestrator');

export interface AnalyzeOptions {
  date: string;
  db: Database.Database;
  dataDir: string;
  silenceThresholdDb?: number;
  skipLibrosa?: boolean;
}

export interface AnalyzeResult {
  showId: string;
  segmentCount: number;
  analyzedCount: number;
  peakMoments: PeakMoment[];
  analysisPath: string;
  totalDurationSec: number;
}

/**
 * Discover audio files in a directory, sorted by name.
 */
function discoverAudioFiles(dir: string): string[] {
  const audioExts = new Set(['.flac', '.mp3', '.shn', '.ogg', '.wav']);
  return readdirSync(dir)
    .filter((f) => audioExts.has(extname(f).toLowerCase()))
    .sort()
    .map((f) => resolve(dir, f));
}

/**
 * Run the full audio analysis pipeline for a show.
 */
export async function orchestrateAnalysis(
  options: AnalyzeOptions,
): Promise<AnalyzeResult> {
  const {
    date,
    db,
    dataDir,
    silenceThresholdDb = -35,
    skipLibrosa = false,
  } = options;

  // 1. Look up show in DB
  const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(date) as
    | Record<string, unknown>
    | undefined;
  if (!show) {
    throw new Error(
      `No show found for date ${date}. Run 'deadair ingest ${date}' first.`,
    );
  }

  const metadata = JSON.parse((show.metadata as string) ?? '{}');
  const audioDir = resolve(dataDir, 'audio', date);

  if (!existsSync(audioDir)) {
    throw new Error(
      `Audio directory not found: ${audioDir}. Run 'deadair ingest ${date}' (without --skip-audio) first.`,
    );
  }

  // 2. Discover audio files
  const audioFiles = discoverAudioFiles(audioDir);
  if (audioFiles.length === 0) {
    throw new Error(`No audio files found in ${audioDir}`);
  }

  log.info(`Found ${audioFiles.length} audio files in ${audioDir}`);

  // 3. Get setlist (from DB or parse from description)
  let setlist: SetlistSong[] = [];
  if (show.setlist) {
    setlist = JSON.parse(show.setlist as string);
  } else if (metadata.archiveOrgDescription) {
    setlist = parseSetlistFromDescription(metadata.archiveOrgDescription);
  }

  // 4. Build song segments
  let segments: SongSegment[];

  if (audioFiles.length === 1) {
    // Single continuous file — silence detection + split
    log.info('Single audio file detected. Running silence detection...');
    const silences = await detectSilence(audioFiles[0], {
      noiseThresholdDb: silenceThresholdDb,
    });
    const info = await getAudioInfo(audioFiles[0]);

    if (silences.length > 0) {
      const segDir = resolve(audioDir, 'segments');
      const segPaths = await splitAtBoundaries(
        audioFiles[0],
        silences,
        info.durationSec,
        segDir,
      );
      const segDurations = await Promise.all(
        segPaths.map(async (p) => (await getAudioInfo(p)).durationSec),
      );
      segments = buildSegmentsFromSilence(segPaths, segDurations, setlist);
    } else {
      // No silence found — treat whole file as one segment
      segments = [
        {
          songName: setlist[0]?.songName ?? 'Full Show',
          startTime: 0,
          endTime: info.durationSec,
          duration: info.durationSec,
          filePath: audioFiles[0],
        },
      ];
    }
  } else {
    // Multiple pre-segmented files
    log.info('Multiple audio files detected. Using positional matching...');
    segments = await matchPreSegmentedFiles(
      audioFiles,
      setlist,
      metadata.archiveOrgDescription,
    );
  }

  log.info(`${segments.length} song segments identified`);

  // 5. Run librosa analysis on each segment
  const perSongAnalysis: SongAnalysisData[] = [];

  if (!skipLibrosa) {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      log.info(
        `Analyzing ${i + 1}/${segments.length}: ${seg.songName}`,
      );
      try {
        const output = analyzeWithLibrosa(seg.filePath);
        perSongAnalysis.push(toSongAnalysis(seg.songName, output));
      } catch (err) {
        log.error(
          `Failed to analyze ${seg.songName}: ${(err as Error).message}`,
        );
      }
    }
  } else {
    log.info('Skipping librosa analysis (--skip-librosa)');
  }

  // 6. Detect peak moments
  const songOffsets = new Map<string, number>();
  let runningOffset = 0;
  for (const seg of segments) {
    songOffsets.set(seg.songName, runningOffset);
    runningOffset += seg.duration;
  }
  const peakMoments = detectPeakMoments(perSongAnalysis, songOffsets, 5);

  // 7. Assemble AudioAnalysis
  const analysis: AudioAnalysis = {
    showId: date,
    songSegments: segments,
    banterTranscripts: [], // Future: Whisper
    perSongAnalysis,
    stemAnalysis: [], // Future: Demucs
    peakMoments,
  };

  // 8. Write JSON output
  const analysisDir = resolve(dataDir, 'analysis', date);
  if (!existsSync(analysisDir)) {
    mkdirSync(analysisDir, { recursive: true });
  }
  const analysisPath = resolve(analysisDir, 'analysis.json');
  writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));

  // 9. Update shows.metadata
  const updatedMetadata = {
    ...metadata,
    analysisPath,
    analyzedAt: new Date().toISOString(),
  };
  db.prepare('UPDATE shows SET metadata = ? WHERE id = ?').run(
    JSON.stringify(updatedMetadata),
    date,
  );

  log.info(`Analysis complete. Output: ${analysisPath}`);

  return {
    showId: date,
    segmentCount: segments.length,
    analyzedCount: perSongAnalysis.length,
    peakMoments,
    analysisPath,
    totalDurationSec: runningOffset,
  };
}
