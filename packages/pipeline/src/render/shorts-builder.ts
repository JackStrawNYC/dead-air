import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type Database from 'better-sqlite3';
import { createLogger } from '@dead-air/core';
import type { EpisodeScript, AudioAnalysis, ShortsMoment } from '@dead-air/core';

const log = createLogger('render:shorts-builder');

const FPS = 30;

export interface ShortsProps {
  audioSrc: string;
  startFrom: number;
  durationInFrames: number;
  images: string[];
  hookText: string;
  songName?: string;
  energyData?: number[];
}

export interface ShortsBuilderOptions {
  episodeId: string;
  db: Database.Database;
  dataDir: string;
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

export async function buildShortsProps(options: ShortsBuilderOptions): Promise<ShortsProps[]> {
  const { episodeId, db, dataDir } = options;

  const row = db
    .prepare('SELECT script, show_id FROM episodes WHERE id = ?')
    .get(episodeId) as { script: string; show_id: string } | undefined;

  if (!row) throw new Error(`Episode not found: ${episodeId}`);
  const script = JSON.parse(row.script) as EpisodeScript;

  if (!script.shortsMoments || script.shortsMoments.length === 0) {
    log.info('No shortsMoments in script');
    return [];
  }

  // Load analysis
  const analysisPath = resolve(dataDir, 'analysis', row.show_id, 'analysis.json');
  let analysis: AudioAnalysis | null = null;
  if (existsSync(analysisPath)) {
    analysis = JSON.parse(readFileSync(analysisPath, 'utf-8')) as AudioAnalysis;
  }

  const shortsDir = resolve(dataDir, 'renders', episodeId, 'shorts');
  if (!existsSync(shortsDir)) mkdirSync(shortsDir, { recursive: true });

  const results: ShortsProps[] = [];

  for (let si = 0; si < script.shortsMoments.length; si++) {
    const moment = script.shortsMoments[si];
    const timestampSec = parseTimestamp(moment.timestamp);
    const durationFrames = Math.ceil(moment.duration * FPS);

    // Find which concert audio segment this timestamp falls into
    let audioSrc = '';
    let startFromFrames = 0;
    let songName: string | undefined;
    let energyData: number[] | undefined;

    if (analysis) {
      // Find which song contains this timestamp
      let cumulativeTime = 0;
      for (const songSeg of analysis.songSegments) {
        const segEnd = cumulativeTime + songSeg.duration;
        if (timestampSec >= cumulativeTime && timestampSec < segEnd) {
          // This moment is in this song
          let audioPath = songSeg.filePath;
          if (audioPath.startsWith(dataDir)) {
            audioPath = audioPath.slice(dataDir.length).replace(/^\//, '');
          }
          audioSrc = audioPath;
          startFromFrames = Math.round((timestampSec - cumulativeTime) * FPS);
          songName = songSeg.songName;

          const songAnalysis = analysis.perSongAnalysis.find(
            (s) => s.songName.toLowerCase() === songSeg.songName.toLowerCase(),
          );
          energyData = songAnalysis?.energy;
          break;
        }
        cumulativeTime = segEnd;
      }
    }

    if (!audioSrc) {
      log.warn(`Could not resolve audio for short ${si} at ${moment.timestamp}`);
      continue;
    }

    // Gather images from nearby segments
    const images: string[] = [];
    for (let segIdx = 0; segIdx < script.segments.length; segIdx++) {
      const seg = script.segments[segIdx];
      const sceneCount = seg.visual?.scenePrompts?.length ?? 0;
      for (let pi = 0; pi < sceneCount && images.length < 5; pi++) {
        const baseName = `seg-${String(segIdx).padStart(2, '0')}-${pi}`;
        const relPath = `assets/${episodeId}/images/${baseName}.png`;
        if (existsSync(resolve(dataDir, relPath))) {
          images.push(relPath);
        }
      }
      if (images.length >= 5) break;
    }

    const props: ShortsProps = {
      audioSrc,
      startFrom: startFromFrames,
      durationInFrames: durationFrames,
      images,
      hookText: moment.hookText,
      songName,
      energyData,
    };

    // Write per-short props
    const propsPath = resolve(shortsDir, `short-${si}-props.json`);
    writeFileSync(propsPath, JSON.stringify(props, null, 2));
    results.push(props);

    log.info(`Short ${si}: "${moment.hookText}" (${moment.duration}s from ${moment.timestamp})`);
  }

  log.info(`Built ${results.length} shorts props`);
  return results;
}
