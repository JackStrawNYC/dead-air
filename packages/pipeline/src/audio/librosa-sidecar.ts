import { execFileSync, execFile } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { createLogger } from '@dead-air/core';
import type { SongAnalysisData } from '@dead-air/core';

const execFileAsync = promisify(execFile);
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

/** Full TrackAnalysis shape from visualizer's enhanced analyzer */
export interface EnhancedAnalysisOutput {
  meta: {
    source: string;
    duration: number;
    fps: number;
    sr: number;
    hopLength: number;
    totalFrames: number;
    tempo: number;
    sections: Array<{
      frameStart: number;
      frameEnd: number;
      label: string;
      energy: string;
      avgEnergy: number;
    }>;
    stemsAvailable?: boolean;
    stemTempo?: number;
    stemVocalMean?: number;
    stemOtherMean?: number;
  };
  frames: Array<Record<string, unknown>>;
}

/**
 * Path to the visualizer's enhanced analyzer script.
 */
function getEnhancedScriptPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // From src/audio/ or dist/audio/ → ../../visualizer-poc/scripts/
  return resolve(__dirname, '..', '..', '..', 'visualizer-poc', 'scripts', 'analyze.py');
}

/**
 * Run enhanced librosa analysis via the visualizer's analyze.py --stdin-json.
 * Returns full TrackAnalysis shape (28 fields per frame at 30fps).
 */
export function analyzeWithEnhancedLibrosa(
  audioPath: string,
  stemsDir?: string,
  mode: ExecutionMode = 'auto',
): EnhancedAnalysisOutput {
  const resolved = resolveMode(mode, DOCKER_IMAGE);
  const config: Record<string, string> = {
    audioPath: resolved === 'docker' ? toContainerPath(audioPath) : audioPath,
  };
  if (stemsDir) {
    config.stemsDir = resolved === 'docker' ? toContainerPath(stemsDir) : stemsDir;
  }

  log.info(`Enhanced analysis: ${audioPath} (${resolved})...`);

  let rawOutput: string;

  if (resolved === 'docker') {
    rawOutput = execViaDocker({
      image: DOCKER_IMAGE,
      command: 'analyze-enhanced',
      input: JSON.stringify(config),
      volumeMounts: [buildVolumeMount(audioPath), ...(stemsDir ? [buildVolumeMount(stemsDir)] : [])],
      maxBuffer: 100 * 1024 * 1024,
      timeout: 600_000, // 10 min per song (full analysis is heavier)
    });
  } else {
    const scriptPath = getEnhancedScriptPath();
    const result = execFileSync('python3', [scriptPath, '--stdin-json'], {
      input: JSON.stringify(config),
      maxBuffer: 100 * 1024 * 1024, // 100MB for large frame arrays
      timeout: 600_000, // 10 min per song
    });
    rawOutput = result.toString();
  }

  const output: EnhancedAnalysisOutput = JSON.parse(rawOutput);

  if (!output.meta || !output.frames) {
    throw new Error('Enhanced librosa analysis returned invalid data (missing meta or frames)');
  }

  log.info(
    `  Duration: ${output.meta.duration}s, Frames: ${output.meta.totalFrames}, Tempo: ${output.meta.tempo}`,
  );
  return output;
}

/**
 * Async variant of analyzeWithEnhancedLibrosa for parallel analysis.
 * Uses execFile (non-blocking) instead of execFileSync.
 */
export async function analyzeWithEnhancedLibrosaAsync(
  audioPath: string,
  stemsDir?: string,
  mode: ExecutionMode = 'auto',
): Promise<EnhancedAnalysisOutput> {
  const resolved = resolveMode(mode, DOCKER_IMAGE);
  const config: Record<string, string> = {
    audioPath: resolved === 'docker' ? toContainerPath(audioPath) : audioPath,
  };
  if (stemsDir) {
    config.stemsDir = resolved === 'docker' ? toContainerPath(stemsDir) : stemsDir;
  }

  log.info(`Enhanced analysis (async): ${audioPath} (${resolved})...`);

  let rawOutput: string;

  if (resolved === 'docker') {
    // Docker mode still uses sync (Docker CLI is fast, Python does the work)
    rawOutput = execViaDocker({
      image: DOCKER_IMAGE,
      command: 'analyze-enhanced',
      input: JSON.stringify(config),
      volumeMounts: [buildVolumeMount(audioPath), ...(stemsDir ? [buildVolumeMount(stemsDir)] : [])],
      maxBuffer: 100 * 1024 * 1024,
      timeout: 600_000,
    });
  } else {
    const scriptPath = getEnhancedScriptPath();
    rawOutput = await new Promise<string>((resolvePromise, reject) => {
      const { spawn } = require('child_process');
      const child = spawn('python3', [scriptPath, '--stdin-json'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdoutBuf = '';
      let stderrBuf = '';
      child.stdout.on('data', (data: Buffer) => { stdoutBuf += data.toString(); });
      child.stderr.on('data', (data: Buffer) => { stderrBuf += data.toString(); });
      child.on('close', (code: number) => {
        if (code !== 0) reject(new Error(`analyze.py exited ${code}: ${stderrBuf}`));
        else resolvePromise(stdoutBuf);
      });
      child.on('error', reject);
      child.stdin.write(JSON.stringify(config));
      child.stdin.end();
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Enhanced analysis timed out after 10 minutes'));
      }, 600_000);
      child.on('close', () => clearTimeout(timer));
    });
  }

  const output: EnhancedAnalysisOutput = JSON.parse(rawOutput);

  if (!output.meta || !output.frames) {
    throw new Error('Enhanced librosa analysis returned invalid data (missing meta or frames)');
  }

  log.info(
    `  Duration: ${output.meta.duration}s, Frames: ${output.meta.totalFrames}, Tempo: ${output.meta.tempo}`,
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
