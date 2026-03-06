import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '@dead-air/core';

const log = createLogger('audio:whisperx');

export interface AlignedWord {
  word: string;
  start: number; // seconds from song start
  end: number;
  score?: number; // confidence 0-1
}

export interface AlignedSegment {
  start: number;
  end: number;
  text: string;
}

export interface WhisperXOutput {
  ok: boolean;
  error?: string;
  words?: AlignedWord[];
  segments?: AlignedSegment[];
}

export interface LyricAlignment {
  songName: string;
  trackId: string;
  source: string;
  words: AlignedWord[];
  segments?: AlignedSegment[];
}

/**
 * Path to the Python script, resolved relative to this module.
 */
function getScriptPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // From src/audio/ or dist/audio/ -> scripts/
  return resolve(__dirname, '..', '..', 'scripts', 'align_lyrics.py');
}

/**
 * Resolve the venv Python that has whisperx installed.
 * Falls back to system python3 if venv not found.
 */
function getPythonPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // From src/audio/ -> packages/visualizer-poc/.venv/bin/python3
  const venvPython = resolve(__dirname, '..', '..', '..', 'visualizer-poc', '.venv', 'bin', 'python3');
  if (existsSync(venvPython)) {
    return venvPython;
  }
  log.warn('Venv python not found, falling back to system python3');
  return 'python3';
}

/**
 * Run WhisperX forced alignment on a single audio file via Python sidecar.
 */
export function alignWithWhisperX(
  audioPath: string,
  lyrics: string,
  language = 'en',
  model = 'large-v3',
): WhisperXOutput {
  const scriptPath = getScriptPath();
  const config = {
    audioPath,
    lyrics,
    language,
    model,
  };

  log.info(`Aligning ${audioPath}...`);

  let rawOutput: string;
  try {
    const pythonPath = getPythonPath();
    log.info(`Using Python: ${pythonPath}`);
    const result = execFileSync(pythonPath, [scriptPath], {
      input: JSON.stringify(config),
      maxBuffer: 100 * 1024 * 1024, // 100MB for large word arrays
      timeout: 600_000, // 10 min — WhisperX is slower than librosa
    });
    rawOutput = result.toString();
  } catch (err: unknown) {
    const execErr = err as { stderr?: Buffer; status?: number; signal?: string };
    const stderr = execErr.stderr?.toString().trim() ?? '';
    const detail = stderr ? `: ${stderr.slice(0, 500)}` : '';
    if (execErr.signal === 'SIGTERM') {
      throw new Error(`WhisperX timed out after 10 minutes${detail}`);
    }
    throw new Error(`WhisperX process crashed (exit ${execErr.status ?? 'unknown'})${detail}`);
  }

  let output: WhisperXOutput;
  try {
    output = JSON.parse(rawOutput);
  } catch {
    throw new Error(`WhisperX returned invalid JSON: ${rawOutput.slice(0, 300)}`);
  }

  if (!output.ok) {
    throw new Error(`WhisperX alignment failed: ${output.error}`);
  }

  log.info(`  Aligned ${output.words?.length ?? 0} words, ${output.segments?.length ?? 0} segments`);
  return output;
}

/**
 * Full alignment pipeline: align audio and return typed LyricAlignment.
 */
export function alignLyrics(
  audioPath: string,
  lyrics: string,
  songName: string,
  trackId: string,
  language = 'en',
  model = 'large-v3',
): LyricAlignment {
  const output = alignWithWhisperX(audioPath, lyrics, language, model);

  return {
    songName,
    trackId,
    source: 'whisperx',
    words: output.words ?? [],
    segments: output.segments,
  };
}
