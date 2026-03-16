import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '@dead-air/core';
import type { SongAnalysisData } from '@dead-air/core';
import {
  type ExecutionMode,
  resolveMode,
  execViaDocker,
  toContainerPath,
  buildVolumeMount,
} from './docker-runner.js';

const log = createLogger('audio:librosa');

const DOCKER_IMAGE = 'dead-air-gpu';

export interface LibrosaOutput {
  ok: boolean;
  error?: string;
  durationSec?: number;
  energy?: number[];
  tempo?: number[];
  spectralCentroid?: number[];
  onsets?: number[];
  key?: string;
}

/**
 * Path to the Python script, resolved relative to this module.
 */
function getScriptPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // From src/audio/ or dist/audio/ → scripts/
  return resolve(__dirname, '..', '..', 'scripts', 'analyze_audio.py');
}

/**
 * Run librosa analysis on a single audio file via Python sidecar.
 * When mode is 'docker', runs inside the dead-air-gpu container.
 * When mode is 'local', uses local python3 (existing behavior).
 * Default 'auto' uses Docker if available, else local.
 */
export function analyzeWithLibrosa(
  audioPath: string,
  analyses?: string[],
  mode: ExecutionMode = 'auto',
): LibrosaOutput {
  const resolved = resolveMode(mode, DOCKER_IMAGE);
  const config = {
    audioPath: resolved === 'docker' ? toContainerPath(audioPath) : audioPath,
    sampleRate: 22050,
    hopLength: 2205, // 10Hz resolution
    analyses: analyses ?? ['energy', 'tempo', 'spectral', 'onsets', 'key'],
  };

  log.info(`Analyzing ${audioPath} (${resolved})...`);

  let rawOutput: string;

  if (resolved === 'docker') {
    rawOutput = execViaDocker({
      image: DOCKER_IMAGE,
      command: 'analyze-audio',
      input: JSON.stringify(config),
      volumeMounts: [buildVolumeMount(audioPath)],
      maxBuffer: 50 * 1024 * 1024,
      timeout: 300_000,
    });
  } else {
    const scriptPath = getScriptPath();
    const result = execFileSync('python3', [scriptPath], {
      input: JSON.stringify(config),
      maxBuffer: 50 * 1024 * 1024, // 50MB for large arrays
      timeout: 300_000, // 5 min per song
    });
    rawOutput = result.toString();
  }

  const output: LibrosaOutput = JSON.parse(rawOutput);

  if (!output.ok) {
    throw new Error(`Librosa analysis failed: ${output.error}`);
  }

  log.info(
    `  Duration: ${output.durationSec}s, Key: ${output.key}, BPM: ${output.tempo}`,
  );
  return output;
}

/**
 * Convert LibrosaOutput to the core SongAnalysisData type.
 */
export function toSongAnalysis(
  songName: string,
  output: LibrosaOutput,
): SongAnalysisData {
  return {
    songName,
    durationSec: output.durationSec ?? 0,
    bpm: output.tempo ?? [],
    energy: output.energy ?? [],
    spectralCentroid: output.spectralCentroid ?? [],
    onsets: output.onsets ?? [],
    key: output.key,
  };
}
