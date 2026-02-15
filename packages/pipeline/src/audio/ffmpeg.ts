import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@dead-air/core';

const execFileAsync = promisify(execFile);
const log = createLogger('audio:ffmpeg');

export interface AudioInfo {
  durationSec: number;
  format: string;
  bitRate: number;
  sampleRate: number;
}

export interface SilenceBoundary {
  start: number;
  end: number;
  duration: number;
}

/**
 * Get duration and format info via ffprobe.
 */
export async function getAudioInfo(filePath: string): Promise<AudioInfo> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    filePath,
  ]);

  const data = JSON.parse(stdout) as {
    format?: {
      duration?: string;
      format_name?: string;
      bit_rate?: string;
      tags?: Record<string, string>;
    };
  };

  const fmt = data.format ?? {};

  return {
    durationSec: parseFloat(fmt.duration ?? '0'),
    format: fmt.format_name ?? 'unknown',
    bitRate: parseInt(fmt.bit_rate ?? '0', 10),
    sampleRate: 0, // would need -show_streams for this
  };
}

/**
 * Detect silence gaps in an audio file using FFmpeg's silencedetect filter.
 */
export async function detectSilence(
  filePath: string,
  options?: { noiseThresholdDb?: number; minDurationSec?: number },
): Promise<SilenceBoundary[]> {
  const noise = options?.noiseThresholdDb ?? -35;
  const minDur = options?.minDurationSec ?? 3;

  log.info(`Running silence detection (noise=${noise}dB, minDur=${minDur}s)...`);

  const { stderr } = await execFileAsync(
    'ffmpeg',
    [
      '-i', filePath,
      '-af', `silencedetect=noise=${noise}dB:d=${minDur}`,
      '-f', 'null',
      '-',
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );

  const boundaries: SilenceBoundary[] = [];
  const startRegex = /silence_start:\s+([\d.]+)/g;
  const endRegex = /silence_end:\s+([\d.]+)\s*\|\s*silence_duration:\s+([\d.]+)/g;

  const starts: number[] = [];
  let match;

  while ((match = startRegex.exec(stderr)) !== null) {
    starts.push(parseFloat(match[1]));
  }

  let i = 0;
  while ((match = endRegex.exec(stderr)) !== null) {
    boundaries.push({
      start: starts[i] ?? 0,
      end: parseFloat(match[1]),
      duration: parseFloat(match[2]),
    });
    i++;
  }

  log.info(`Found ${boundaries.length} silence gaps`);
  return boundaries;
}

/**
 * Split an audio file at silence boundaries into segments.
 */
export async function splitAtBoundaries(
  filePath: string,
  boundaries: SilenceBoundary[],
  totalDuration: number,
  destDir: string,
): Promise<string[]> {
  const { mkdirSync, existsSync } = await import('fs');
  const { resolve, extname } = await import('path');

  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const ext = extname(filePath);
  const segmentPaths: string[] = [];

  // Build time ranges from silence boundaries
  const ranges: { start: number; end: number }[] = [];
  let segStart = 0;

  for (const boundary of boundaries) {
    if (boundary.start > segStart) {
      ranges.push({ start: segStart, end: boundary.start });
    }
    segStart = boundary.end;
  }
  // Final segment after last silence
  if (segStart < totalDuration) {
    ranges.push({ start: segStart, end: totalDuration });
  }

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const segPath = resolve(destDir, `segment-${String(i + 1).padStart(3, '0')}${ext}`);

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', filePath,
      '-ss', String(range.start),
      '-to', String(range.end),
      '-c', 'copy',
      segPath,
    ]);

    segmentPaths.push(segPath);
  }

  log.info(`Split into ${segmentPaths.length} segments`);
  return segmentPaths;
}
