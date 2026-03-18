import type Database from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs';
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
import { analyzeWithLibrosa, analyzeWithEnhancedLibrosaAsync, toSongAnalysis } from './librosa-sidecar.js';
import type { EnhancedAnalysisOutput } from './librosa-sidecar.js';
import type { ExecutionMode } from './docker-runner.js';
import {
  computeAnalysisCacheKey,
  checkAnalysisCache,
  loadAnalysisCache,
  storeAnalysisCache,
} from './analysis-cache.js';
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
  mode?: ExecutionMode;
  /** Skip analysis cache (force re-analysis) */
  noCache?: boolean;
  /** Number of parallel analysis workers (default: 2) */
  analysisConcurrency?: number;
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
    mode,
    noCache = false,
    analysisConcurrency = 2,
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

  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse((show.metadata as string) ?? '{}');
  } catch {
    log.warn(`Corrupt metadata for show ${date}, using defaults`);
  }
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
    setlist = parseSetlistFromDescription(metadata.archiveOrgDescription as string);
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
      metadata.archiveOrgDescription as string | undefined,
    );
  }

  log.info(`${segments.length} song segments identified`);

  // Ensure analysis directory exists early (enhanced analysis writes per-track files)
  const analysisDir = resolve(dataDir, 'analysis', date);
  if (!existsSync(analysisDir)) {
    mkdirSync(analysisDir, { recursive: true });
  }

  // 5. Run librosa analysis on each segment (with caching + parallelism)
  const perSongAnalysis: SongAnalysisData[] = [];
  const enhancedResults: Map<string, EnhancedAnalysisOutput> = new Map();

  if (!skipLibrosa) {
    const stemsBaseDir = resolve(dataDir, 'stems', date);

    // Analyze a single segment (used by both sequential fallback and parallel pool)
    async function analyzeSingleSegment(
      seg: SongSegment,
      index: number,
    ): Promise<{ songName: string; enhanced?: EnhancedAnalysisOutput; coarse?: SongAnalysisData }> {
      const segStemsDir = existsSync(resolve(stemsBaseDir, seg.songName))
        ? resolve(stemsBaseDir, seg.songName)
        : undefined;

      // Check analysis cache
      if (!noCache) {
        const cacheKey = computeAnalysisCacheKey(seg.filePath, {
          stems: segStemsDir ?? null,
          type: 'enhanced',
        });
        const cached = checkAnalysisCache(dataDir, cacheKey);
        if (cached.hit) {
          const enhanced = loadAnalysisCache<EnhancedAnalysisOutput>(cached.filePath);
          if (enhanced) {
            log.info(`  [${index + 1}/${segments.length}] ${seg.songName} — cached`);
            const coarse = toSongAnalysis(seg.songName, {
              ok: true,
              durationSec: enhanced.meta.duration,
              tempo: [enhanced.meta.tempo],
              energy: enhanced.frames.map((f) => (f.rms as number) ?? 0.2),
              onsets: enhanced.frames
                .map((f, idx) => (f.onset as number) > 0.5 ? idx / 30 : -1)
                .filter((t) => t >= 0),
              key: undefined,
            });
            return { songName: seg.songName, enhanced, coarse };
          }
          log.warn(`  [${index + 1}/${segments.length}] ${seg.songName} — cache corrupted, re-analyzing`);
        }
      }

      log.info(`  [${index + 1}/${segments.length}] ${seg.songName} — analyzing...`);

      try {
        const enhanced = await analyzeWithEnhancedLibrosaAsync(seg.filePath, segStemsDir, mode);

        // Write full-resolution enhanced analysis
        const trackAnalysisPath = resolve(analysisDir, `${seg.songName.replace(/[^a-zA-Z0-9]/g, '_')}-analysis.json`);
        writeFileSync(trackAnalysisPath, JSON.stringify(enhanced));
        log.info(`  [${index + 1}/${segments.length}] ${seg.songName} — ${enhanced.meta.totalFrames} frames`);

        // Store in cache
        if (!noCache) {
          const cacheKey = computeAnalysisCacheKey(seg.filePath, {
            stems: segStemsDir ?? null,
            type: 'enhanced',
          });
          storeAnalysisCache(dataDir, cacheKey, enhanced);
        }

        const coarse = toSongAnalysis(seg.songName, {
          ok: true,
          durationSec: enhanced.meta.duration,
          tempo: [enhanced.meta.tempo],
          energy: enhanced.frames.map((f) => (f.rms as number) ?? 0.2),
          onsets: enhanced.frames
            .map((f, idx) => (f.onset as number) > 0.5 ? idx / 30 : -1)
            .filter((t) => t >= 0),
          key: undefined,
        });

        return { songName: seg.songName, enhanced, coarse };
      } catch (enhancedErr) {
        log.warn(`Enhanced analysis failed, falling back to basic: ${(enhancedErr as Error).message}`);
        try {
          const output = analyzeWithLibrosa(seg.filePath, undefined, mode);
          return { songName: seg.songName, coarse: toSongAnalysis(seg.songName, output) };
        } catch (err) {
          log.error(`Failed to analyze ${seg.songName}: ${(err as Error).message}`);
          return { songName: seg.songName };
        }
      }
    }

    // Parallel analysis with worker pool
    const concurrency = Math.max(1, Math.min(analysisConcurrency, segments.length));
    log.info(`Analysis: ${segments.length} segments, ${concurrency} parallel workers${noCache ? ' (cache disabled)' : ''}`);

    const queue = segments.map((seg, i) => ({ seg, index: i }));
    const results: Array<{ songName: string; enhanced?: EnhancedAnalysisOutput; coarse?: SongAnalysisData }> = [];

    async function processQueue(): Promise<void> {
      while (queue.length > 0) {
        const item = queue.shift()!;
        const result = await analyzeSingleSegment(item.seg, item.index);
        results.push(result);
      }
    }

    const workers = Array.from({ length: concurrency }, () => processQueue());
    await Promise.all(workers);

    // Sort results back to original order and collect
    results.sort((a, b) => {
      const idxA = segments.findIndex((s) => s.songName === a.songName);
      const idxB = segments.findIndex((s) => s.songName === b.songName);
      return idxA - idxB;
    });

    for (const result of results) {
      if (result.enhanced) enhancedResults.set(result.songName, result.enhanced);
      if (result.coarse) perSongAnalysis.push(result.coarse);
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
