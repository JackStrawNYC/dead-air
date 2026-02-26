import { resolve, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@dead-air/core';
import type { EpisodeProps } from './composition-builder.js';

const execFileAsync = promisify(execFile);
const log = createLogger('render:subtitles');

const FPS = 30;
const CROSSFADE_FRAMES = 30;

export interface SubtitleOptions {
  props: EpisodeProps;
  dataDir: string;
  /** Whisper model size (default: 'base') */
  model?: string;
  /** Force regeneration */
  force?: boolean;
}

export interface SubtitleResult {
  srtPath: string;
  vttPath: string;
  segmentCount: number;
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];
}

/**
 * Format seconds to SRT timestamp: HH:MM:SS,mmm
 */
function toSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Format seconds to WebVTT timestamp: HH:MM:SS.mmm
 */
function toVttTime(seconds: number): string {
  return toSrtTime(seconds).replace(',', '.');
}

/**
 * Run Whisper on a narration audio file to get word-level timestamps.
 */
async function transcribeWithWhisper(
  audioPath: string,
  model: string,
): Promise<WhisperSegment[]> {
  const outputDir = dirname(audioPath);

  try {
    await execFileAsync(
      'whisper',
      [
        audioPath,
        '--model', model,
        '--output_format', 'json',
        '--output_dir', outputDir,
        '--word_timestamps', 'True',
        '--language', 'en',
      ],
      { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 },
    );
  } catch (err) {
    log.warn(`Whisper failed for ${audioPath}: ${err}`);
    return [];
  }

  // Whisper outputs .json file alongside the audio
  const jsonPath = audioPath.replace(/\.[^.]+$/, '.json');
  if (!existsSync(jsonPath)) {
    log.warn(`Whisper JSON not found: ${jsonPath}`);
    return [];
  }

  const whisperOutput = JSON.parse(readFileSync(jsonPath, 'utf-8')) as {
    segments: WhisperSegment[];
  };

  return whisperOutput.segments ?? [];
}

/**
 * Generate subtitles from narration audio files.
 *
 * Process:
 * 1. Find all narration segments in the episode props
 * 2. Run Whisper on each narration audio file
 * 3. Offset timestamps to composition-level frames
 * 4. Output SRT and WebVTT files
 */
export async function generateSubtitles(options: SubtitleOptions): Promise<SubtitleResult> {
  const { props, dataDir, model = 'base', force = false } = options;

  const outputDir = resolve(dataDir, 'renders', props.episodeId);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const srtPath = resolve(outputDir, 'subtitles.srt');
  const vttPath = resolve(outputDir, 'subtitles.vtt');

  if (!force && existsSync(srtPath) && existsSync(vttPath)) {
    log.info('Subtitles already exist — skipping');
    return { srtPath, vttPath, segmentCount: 0 };
  }

  // Compute composition-level start frame for each segment
  const segmentStarts: number[] = [];
  let cursor = 0;
  for (let i = 0; i < props.segments.length; i++) {
    segmentStarts.push(cursor);
    cursor += props.segments[i].durationInFrames;
    if (i < props.segments.length - 1) cursor -= CROSSFADE_FRAMES;
  }

  // Collect all subtitle entries with composition-level timing
  const allEntries: Array<{ startSec: number; endSec: number; text: string }> = [];

  for (let i = 0; i < props.segments.length; i++) {
    const seg = props.segments[i];
    if (seg.type !== 'narration') continue;

    const audioPath = resolve(dataDir, (seg as { audioSrc: string }).audioSrc);
    if (!existsSync(audioPath)) {
      log.warn(`Narration audio not found: ${audioPath}`);
      continue;
    }

    log.info(`Transcribing narration segment ${i}...`);
    const segments = await transcribeWithWhisper(audioPath, model);

    // Offset to composition-level timing
    const offsetSec = segmentStarts[i] / FPS;

    for (const whisperSeg of segments) {
      const text = whisperSeg.text.trim();
      if (!text) continue;

      allEntries.push({
        startSec: whisperSeg.start + offsetSec,
        endSec: whisperSeg.end + offsetSec,
        text,
      });
    }
  }

  if (allEntries.length === 0) {
    log.warn('No subtitle entries generated');
    // Write empty files
    writeFileSync(srtPath, '');
    writeFileSync(vttPath, 'WEBVTT\n\n');
    return { srtPath, vttPath, segmentCount: 0 };
  }

  // Generate SRT
  const srtLines: string[] = [];
  allEntries.forEach((entry, idx) => {
    srtLines.push(String(idx + 1));
    srtLines.push(`${toSrtTime(entry.startSec)} --> ${toSrtTime(entry.endSec)}`);
    srtLines.push(entry.text);
    srtLines.push('');
  });
  writeFileSync(srtPath, srtLines.join('\n'));

  // Generate WebVTT
  const vttLines: string[] = ['WEBVTT', ''];
  allEntries.forEach((entry) => {
    vttLines.push(`${toVttTime(entry.startSec)} --> ${toVttTime(entry.endSec)}`);
    vttLines.push(entry.text);
    vttLines.push('');
  });
  writeFileSync(vttPath, vttLines.join('\n'));

  log.info(`Generated ${allEntries.length} subtitle entries → ${srtPath}`);

  return { srtPath, vttPath, segmentCount: allEntries.length };
}
