import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type Database from 'better-sqlite3';
import { createLogger } from '@dead-air/core';
import type { EpisodeScript, EpisodeSegment, AudioAnalysis, SongAnalysisData } from '@dead-air/core';

const execFileAsync = promisify(execFile);
const log = createLogger('render:composition-builder');

const FPS = 30;
const BRAND_INTRO_FRAMES = 150; // 5 seconds

export interface EpisodeProps {
  episodeId: string;
  episodeTitle: string;
  segments: SegmentProps[];
  totalDurationInFrames: number;
}

export type SegmentProps =
  | { type: 'brand_intro'; durationInFrames: number }
  | {
      type: 'narration';
      durationInFrames: number;
      audioSrc: string;
      images: string[];
      mood: string;
      colorPalette: string[];
    }
  | {
      type: 'concert_audio';
      durationInFrames: number;
      songName: string;
      audioSrc: string;
      startFrom: number;
      images: string[];
      mood: string;
      colorPalette: string[];
      energyData?: number[];
    }
  | {
      type: 'context_text';
      durationInFrames: number;
      textLines: { text: string; displayDuration: number; style: string }[];
      images: string[];
      mood: string;
      colorPalette: string[];
    };

export interface BuildOptions {
  episodeId: string;
  db: Database.Database;
  dataDir: string;
}

async function getAudioDurationSec(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    filePath,
  ]);
  const data = JSON.parse(stdout) as { format?: { duration?: string } };
  return parseFloat(data.format?.duration ?? '0');
}

function resolveImages(
  segment: EpisodeSegment,
  episodeId: string,
  segIndex: number,
  dataDir: string,
): string[] {
  const images: string[] = [];
  const sceneCount = segment.visual?.scenePrompts?.length ?? 0;
  for (let pi = 0; pi < sceneCount; pi++) {
    // Assets follow the pattern: assets/{episodeId}/images/seg-{NN}-{M}.png
    const filename = `seg-${String(segIndex + 1).padStart(2, '0')}-${pi + 1}.png`;
    const relPath = `assets/${episodeId}/images/${filename}`;
    const absPath = resolve(dataDir, relPath);
    if (existsSync(absPath)) {
      images.push(relPath);
    }
  }
  return images;
}

function findConcertAudio(
  songName: string,
  analysis: AudioAnalysis,
  dataDir: string,
): { audioSrc: string; filePath: string } | null {
  const seg = analysis.songSegments.find(
    (s) => s.songName.toLowerCase() === songName.toLowerCase(),
  );
  if (!seg) return null;

  // Concert audio path is stored as absolute in analysis; convert to relative for staticFile
  const absPath = seg.filePath;
  if (!existsSync(absPath)) return null;

  // Derive relative path from dataDir
  if (absPath.startsWith(dataDir)) {
    const relPath = absPath.slice(dataDir.length).replace(/^\//, '');
    return { audioSrc: relPath, filePath: absPath };
  }
  // Fallback: use as-is if relative
  return { audioSrc: absPath, filePath: absPath };
}

function findEnergyData(songName: string, analysis: AudioAnalysis): number[] | undefined {
  const data = analysis.perSongAnalysis.find(
    (s) => s.songName.toLowerCase() === songName.toLowerCase(),
  );
  return data?.energy;
}

export async function buildCompositionProps(options: BuildOptions): Promise<EpisodeProps> {
  const { episodeId, db, dataDir } = options;

  // 1. Load episode & script from DB
  const row = db
    .prepare('SELECT title, script, show_id FROM episodes WHERE id = ?')
    .get(episodeId) as { title: string; script: string; show_id: string } | undefined;

  if (!row) throw new Error(`Episode not found: ${episodeId}`);
  const script = JSON.parse(row.script) as EpisodeScript;
  const showId = row.show_id;

  log.info(`Building props for "${script.episodeTitle}" (${script.segments.length} segments)`);

  // 2. Load audio analysis
  const analysisPath = resolve(dataDir, 'analysis', showId, 'analysis.json');
  let analysis: AudioAnalysis | null = null;
  if (existsSync(analysisPath)) {
    analysis = JSON.parse(readFileSync(analysisPath, 'utf-8')) as AudioAnalysis;
    log.info(`Loaded analysis with ${analysis.songSegments.length} songs`);
  } else {
    log.warn(`No analysis found at ${analysisPath}`);
  }

  // 3. Build segments
  const segments: SegmentProps[] = [];

  // Prepend brand intro
  segments.push({ type: 'brand_intro', durationInFrames: BRAND_INTRO_FRAMES });

  // Narration key → audio path mapping
  const narrationMap: Record<string, string> = {
    intro: `assets/${episodeId}/narration/intro.mp3`,
    set_break: `assets/${episodeId}/narration/set_break.mp3`,
    outro: `assets/${episodeId}/narration/outro.mp3`,
  };

  for (let i = 0; i < script.segments.length; i++) {
    const seg = script.segments[i];
    const images = resolveImages(seg, episodeId, i, dataDir);
    const mood = seg.visual?.mood ?? 'warm';
    const colorPalette = seg.visual?.colorPalette ?? [];

    if (seg.type === 'narration' && seg.narrationKey) {
      const audioRel = narrationMap[seg.narrationKey];
      const audioAbs = resolve(dataDir, audioRel);

      let durationSec = 60; // fallback
      if (existsSync(audioAbs)) {
        durationSec = await getAudioDurationSec(audioAbs);
      } else {
        log.warn(`Narration not found: ${audioAbs}, using fallback duration`);
      }

      segments.push({
        type: 'narration',
        durationInFrames: Math.ceil(durationSec * FPS),
        audioSrc: audioRel,
        images,
        mood,
        colorPalette,
      });
    } else if (seg.type === 'concert_audio' && seg.songName) {
      const excerptDuration = seg.excerptDuration ?? 60;
      const startTimeSec = seg.startTimeInSong ?? 0;

      let audioSrc = '';
      if (analysis) {
        const found = findConcertAudio(seg.songName, analysis, dataDir);
        if (found) {
          audioSrc = found.audioSrc;
        } else {
          log.warn(`Concert audio not found for "${seg.songName}"`);
        }
      }

      const energyData = analysis ? findEnergyData(seg.songName, analysis) : undefined;

      segments.push({
        type: 'concert_audio',
        durationInFrames: Math.ceil(excerptDuration * FPS),
        songName: seg.songName,
        audioSrc,
        startFrom: Math.round(startTimeSec * FPS),
        images,
        mood,
        colorPalette,
        energyData,
      });
    } else if (seg.type === 'context_text' && seg.textLines) {
      const totalSec = seg.textLines.reduce((sum, l) => sum + l.displayDuration, 0);

      segments.push({
        type: 'context_text',
        durationInFrames: Math.ceil(totalSec * FPS),
        textLines: seg.textLines.map((l) => ({
          text: l.text,
          displayDuration: l.displayDuration,
          style: l.style,
        })),
        images,
        mood,
        colorPalette,
      });
    }
  }

  const totalDurationInFrames = segments.reduce((sum, s) => sum + s.durationInFrames, 0);

  log.info(
    `Built ${segments.length} segments, total ${totalDurationInFrames} frames (${(totalDurationInFrames / FPS).toFixed(1)}s)`,
  );

  const props: EpisodeProps = {
    episodeId,
    episodeTitle: script.episodeTitle,
    segments,
    totalDurationInFrames,
  };

  // Write props to disk
  const renderDir = resolve(dataDir, 'renders', episodeId);
  if (!existsSync(renderDir)) mkdirSync(renderDir, { recursive: true });
  const propsPath = resolve(renderDir, 'props.json');
  writeFileSync(propsPath, JSON.stringify(props, null, 2));
  log.info(`Props written to ${propsPath}`);

  return props;
}
