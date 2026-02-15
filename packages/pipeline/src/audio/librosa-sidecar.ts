import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '@dead-air/core';
import type { SongAnalysisData } from '@dead-air/core';

const log = createLogger('audio:librosa');

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
 */
export function analyzeWithLibrosa(
  audioPath: string,
  analyses?: string[],
): LibrosaOutput {
  const scriptPath = getScriptPath();
  const config = {
    audioPath,
    sampleRate: 22050,
    hopLength: 2205, // 10Hz resolution
    analyses: analyses ?? ['energy', 'tempo', 'spectral', 'onsets', 'key'],
  };

  log.info(`Analyzing ${audioPath}...`);

  const result = execFileSync('python3', [scriptPath], {
    input: JSON.stringify(config),
    maxBuffer: 50 * 1024 * 1024, // 50MB for large arrays
    timeout: 300_000, // 5 min per song
  });

  const output: LibrosaOutput = JSON.parse(result.toString());

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
